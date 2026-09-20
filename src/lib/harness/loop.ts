/**
 * Agent loop：分析 → RAG / 联网 → 计划审查 → 收集 → 确认 → Prompt 优化 → 出图 → 验收
 * 会话日志仍对齐 DeepSeek Harness turn 事件。
 */
import { collectGenerateResult } from "@/lib/useGenerateStream";
import { kbFields } from "@/lib/regionEnhance";
import { emptyAgentState, postDeliveryActions } from "@/lib/agent/orchestrator";
import { getSpecialist } from "@/lib/agent/specialists";
import { injectMemorySlots, persistSlotsToMemory } from "@/lib/agent/memory";
import { resolveActiveSkill } from "@/lib/agent/skills";
import type { AgentAction, AgentProposal, AgentRuntimeState, AskGroupItem } from "@/lib/agent/types";
import { extractBrandHint, isCasualChat, isDetailedBrief, isVagueBrandCategory, matchedLocalSkillId, resolveSkillPlugin, skillIdFromTaskPick } from "./plugins";
import { sandboxLabel, type SandboxTraceKind } from "./sandboxTrace";
import { buildHarnessChatPack, harnessToolEnabled, parseToolDirective } from "./prompt";
import { getHarnessCache, isSkillSwitchPhrase, loadPublicHarness, loopStepOn, loopUsesXiaomoCycle, matchedSkill, skillBodyFor, skillSwitchTarget, type HarnessSkillItem } from "./opsConfig";
import {
  applyQuizExamples,
  brandCategoryAskGroup,
  clarifyColorAskGroup,
  clarifyStyleAskGroup,
  clarifyTaskAskGroup,
  detectClarifyKind,
  dropFilledAskGroups,
  extractAskIntent,
  QUIZ_EXAMPLE_KEYS,
  skillAskGroups,
  skillOpening,
  extractUserFacingSpeech,
} from "./skillPlaybook";
import { needsRefUpload, seedSlotsFromPrompt, fillSkillDefaults } from "./slots";
import { applySkillPicksToSlots, extractOptimizedPrompt, parseLabeledFields } from "./userCopy";
import { runToolPlugin } from "./tools";
import type { SessionLog } from "./session";
import {
  acceptAfterGenerate,
  applyCycleToHit,
  optimizeUserPrompt,
  parseStoredPlan,
  generateQuizExamples,
  reviewBeforeGenerate,
  runCycleStart,
  type CycleBundle,
} from "./agentCycle";

export type HarnessTurnResult = {
  state: AgentRuntimeState;
  text: string;
  images?: string[];
  actions?: AgentAction[];
  proposals?: AgentProposal[];
  askGroups?: AskGroupItem[];
  intentPicks?: Record<string, string>;
  error?: string;
};

function currentSkillHit(state: AgentRuntimeState): HarnessSkillItem {
  return {
    code: state.harnessSkillCode || "",
    id: state.specialistId || "",
    pattern: "",
    score: 0,
    flags: "",
    name: state.harnessSkillName || "",
    body: state.harnessSkillBody || "",
  };
}

const LOCAL_SKILL_NAMES: Record<string, string> = {
  "image.ip": "IP设计",
  "image.logo": "Logo",
  "image.event": "活动视觉",
  "image.product": "商拍",
  "image.signage": "店招",
  "image.font": "AI字体",
};

function hitFromSpecialistId(id?: string): HarnessSkillItem | undefined {
  if (!id) return undefined;
  const fromCache = getHarnessCache()?.skills?.find((s) => s.id === id);
  if (fromCache) return fromCache;
  return {
    code: `skill.${id}`,
    id,
    pattern: "",
    score: 1,
    flags: "",
    name: LOCAL_SKILL_NAMES[id] || id,
    body: skillBodyFor(id) || undefined,
  };
}

function interviewSkillFor(text: string, state: AgentRuntimeState, opts?: { lockSkill?: boolean }) {
  if (opts?.lockSkill && (state.specialistId || state.harnessSkillCode)) {
    return { hit: currentSkillHit(state), switched: false };
  }
  const switched = skillSwitchTarget(text, state);
  if (switched) return { hit: switched, switched: true };
  const localId = matchedLocalSkillId(text);
  if (
    localId &&
    isSkillSwitchPhrase(text) &&
    (state.specialistId || state.harnessSkillCode) &&
    localId !== state.specialistId &&
    `skill.${localId}` !== state.harnessSkillCode
  ) {
    const localHit = hitFromSpecialistId(localId);
    if (localHit) return { hit: localHit, switched: true };
  }

  const fresh = matchedSkill(text) || hitFromSpecialistId(localId);
  const inSkill = Boolean(state.harnessSkillCode || (state.harnessSkillStage && state.specialistId));
  if (fresh) {
    const same =
      (fresh.id && fresh.id === state.specialistId) ||
      (fresh.code && fresh.code === state.harnessSkillCode);
    if (!inSkill || same) return { hit: fresh, switched: false };
  }

  if (state.harnessSkillStage === "discover" && (state.harnessSkillBody || state.harnessSkillCode)) {
    return { hit: currentSkillHit(state), switched: false };
  }
  if (
    (state.phase === "delivered" || state.phase === "ready" || state.phase === "planned") &&
    (state.harnessSkillCode || state.specialistId)
  ) {
    return { hit: currentSkillHit(state), switched: false };
  }
  return { hit: fresh, switched: false };
}

function uidTurn() {
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const RETRY_TURN = /^(确认|再试一次|直接生成)$/;

function resolveGenerateText(text: string, state: AgentRuntimeState) {
  if (!RETRY_TURN.test(text.trim())) return text;
  const copy = (
    state.lastGenerateText ||
    state.optimizedPrompt ||
    state.slots.creativeDesc ||
    state.slots.oneLiner ||
    ""
  ).trim();
  return copy || text;
}

/** 已切到 IP 故事等文本 Skill 后，用户改口要改图/附图时，回到出图 */
function shouldLeaveTextSkill(
  text: string,
  hasImages: boolean,
  skill?: { id?: string; output?: string; specialistId?: string },
) {
  if (skill?.output !== "text") return false;
  if (skill.specialistId !== "image.ip" && skill.id !== "skill.image.ip_story") return false;
  const t = (text || "").trim();
  if (/IP故事|形象故事|人设故事|撰写故事/.test(t)) return false;
  if (hasImages) return true;
  return /(换|改|修|调).{0,12}(色|颜色|帽子|衣服|发型|背景|造型|姿势|表情)|改图|修图|图生图|重新出图|再画一张/.test(
    t,
  );
}

function mountSkill(state: AgentRuntimeState, text: string, refImages?: string[]): AgentRuntimeState {
  const switched = skillSwitchTarget(text, state);
  const specialistId = switched
    ? ((switched.id as AgentRuntimeState["specialistId"]) || resolveSkillPlugin(text))
    : (state.harnessSkillStage && state.specialistId) || resolveSkillPlugin(text);
  const spec = getSpecialist(specialistId);
  if (!spec) return { ...state, specialistId };

  const hasRef = Boolean(refImages?.length);
  const baseSlots = switched ? {} : injectMemorySlots(state.slots);
  const fromQuiz = applySkillPicksToSlots(baseSlots, parseLabeledFields(text));
  const slots = RETRY_TURN.test(text.trim())
    ? fillSkillDefaults(spec, fromQuiz)
    : seedSlotsFromPrompt(spec, text, fromQuiz, hasRef);
  const skill = resolveActiveSkill({ ...state, specialistId, slots });
  return {
    ...state,
    specialistId,
    slots,
    skillId: skill?.id,
    refImages: refImages?.length ? refImages : state.refImages,
    phase: "ready",
    planConfirmed: true,
    unansweredStreak: 0,
    pendingAskKeys: undefined,
    ...(switched
      ? {
          harnessSkillCode: switched.code,
          harnessSkillName: switched.name,
          harnessSkillBody: switched.body || state.harnessSkillBody,
          harnessSkillStage: "discover" as const,
          cyclePlanJson: undefined,
          cycleRag: undefined,
          cycleWeb: undefined,
          optimizedPrompt: undefined,
        }
      : {}),
  };
}

function applyBundle(state: AgentRuntimeState, skill: HarnessSkillItem, bundle: CycleBundle): AgentRuntimeState {
  return {
    ...state,
    specialistId: (skill.id as AgentRuntimeState["specialistId"]) || state.specialistId,
    harnessSkillCode: skill.code || state.harnessSkillCode,
    harnessSkillName: skill.name || state.harnessSkillName,
    harnessSkillBody: skill.body || state.harnessSkillBody,
    cyclePlanJson: JSON.stringify(bundle.plan),
    cycleRag: bundle.ragBrief,
    cycleWeb: bundle.webBrief,
    directionPlan: [
      `意图：${bundle.plan.intent}`,
      `Skill：${bundle.plan.skillName || bundle.plan.skillCode}`,
      bundle.plan.notes,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function thinkSeed(name: string, body = ""): HarnessSkillItem {
  return { code: "", id: "", pattern: "", score: 0, flags: "", name, body };
}

function cyclePluginsOn() {
  if (!loopUsesXiaomoCycle()) return false;
  return loopStepOn("analyze") || loopStepOn("rag") || loopStepOn("web") || loopStepOn("review");
}

function skillAlreadyPicked(skill?: HarnessSkillItem | null) {
  return Boolean(skill?.id || skill?.code);
}

function keepOptimized(state: AgentRuntimeState, optimized: string): AgentRuntimeState {
  return {
    ...state,
    optimizedPrompt: optimized,
    slots: { ...state.slots, optimizedPrompt: optimized },
  };
}

const CYCLE_TRACE_LABEL: Record<Exclude<SandboxTraceKind, "optimize" | "generate" | "reply">, string> = {
  think: "分析计划",
  read: "读取内容",
  web: "联网检索",
  review: "计划审查",
};

async function runDiscoverCycle(
  session: SessionLog,
  turnId: string,
  text: string,
  seed: HarnessSkillItem,
): Promise<{ skill: HarnessSkillItem; bundle?: CycleBundle }> {
  const mark = (phase: "think" | "read" | "web" | "review", status: "start" | "end" | "delta" = "start", detail?: string) => {
    if (status === "end") {
      session.append("step/end", { id: `${turnId}-${phase}`, phase, ok: true, detail });
      return;
    }
    if (status === "delta") {
      session.append("step/delta", { id: `${turnId}-${phase}`, phase, detail });
      return;
    }
    session.append("step/start", {
      id: `${turnId}-${phase}`,
      phase,
      label: CYCLE_TRACE_LABEL[phase],
      detail: detail || "进行中…",
    });
  };
  try {
    const bundle = await runCycleStart(text, seed, mark);
    const skill = applyCycleToHit(seed, bundle) || seed;
    session.append("plan/write", {
      plan: bundle.plan,
      reviewOk: bundle.reviewOk,
      reason: bundle.reviewReason,
    });
    session.append("rag/retrieve", {
      query: bundle.plan.ragQuery,
      brief: bundle.ragBrief,
      chars: bundle.ragBrief.length,
    });
    if (bundle.webBrief || bundle.plan.needWeb) {
      session.append("web/search", {
        query: bundle.plan.webQuery,
        brief: bundle.webBrief,
        chars: bundle.webBrief.length,
      });
    }
    return { skill, bundle };
  } catch {
    session.append("step/end", { id: `${turnId}-cycle`, ok: false });
    return { skill: seed };
  }
}

async function liveAskGroups(
  session: SessionLog,
  turnId: string,
  text: string,
  state: AgentRuntimeState,
  skill: HarnessSkillItem,
): Promise<{ groups: AskGroupItem[]; intentPicks: Record<string, string> }> {
  const all = skillAskGroups(skill);
  const intentPicks = extractAskIntent(text, all);
  const filled = { ...state.slots, ...intentPicks };
  const pending = dropFilledAskGroups(all, filled);
  const fields = pending
    .filter((g) => QUIZ_EXAMPLE_KEYS.has(g.key))
    .map((g) => ({ key: g.key, label: g.label, ask: g.ask }));
  if (!fields.length) return { groups: pending, intentPicks };
  if (!loopStepOn("quizExamples") || skillAlreadyPicked(skill)) {
    return { groups: applyQuizExamples(pending, {}), intentPicks };
  }
  try {
    session.append("step/start", { id: `${turnId}-quiz-ex`, phase: "quiz", label: "问卷举例" });
    const examples = await generateQuizExamples({
      userText: text,
      skillName: skill.name || state.harnessSkillName,
      skillId: skill.id || skill.code || state.specialistId,
      ragBrief: state.cycleRag,
      webBrief: state.cycleWeb,
      fields,
    });
    session.append("step/end", {
      id: `${turnId}-quiz-ex`,
      phase: "quiz",
      ok: true,
      keys: Object.keys(examples),
      detail: fields
        .map((f) => {
          const samples = (examples[f.key] || []).filter(Boolean);
          return samples.length ? `${f.label}\n${samples.map((s) => `• ${s}`).join("\n")}` : "";
        })
        .filter(Boolean)
        .join("\n"),
    });
    return { groups: applyQuizExamples(pending, examples), intentPicks };
  } catch {
    session.append("step/end", { id: `${turnId}-quiz-ex`, ok: false });
    return { groups: applyQuizExamples(pending, {}), intentPicks };
  }
}

async function spokenOpening(params: {
  userText: string;
  skill: HarnessSkillItem;
  switched?: boolean;
  intentPicks: Record<string, string>;
  groups: AskGroupItem[];
  session?: SessionLog;
  turnId?: string;
}) {
  const { session, turnId } = params;
  const known = Object.entries(params.intentPicks || {})
    .filter(([, v]) => v && v !== "你来定" && v !== "暂不补充")
    .map(([, v]) => v)
    .join("、");
  const remain = params.groups.map((g) => g.label).filter(Boolean);
  const thinkDetail = [
    params.skill.name && `方向：${params.skill.name.replace(/Skill/gi, "").trim()}`,
    known && `已明确：${known}`,
    remain.length ? `待确认：${remain.join("、")}` : "关键信息已齐，可请用户确认生成",
  ]
    .filter(Boolean)
    .join("\n");
  if (session && turnId) {
    session.append("step/start", {
      id: `${turnId}-open`,
      phase: "think",
      label: sandboxLabel("think"),
      detail: thinkDetail,
    });
  }
  try {
    return skillOpening(params.skill, params.intentPicks);
  } catch {
    /* 回退固定句 */
  } finally {
    if (session && turnId) {
      session.append("step/end", { id: `${turnId}-open`, phase: "think", ok: true, detail: thinkDetail });
    }
  }
  return skillOpening(params.skill, params.intentPicks);
}

function shouldCallGenerate(params: {
  text: string;
  hasImages: boolean;
  forceGenerate?: boolean;
  phase?: AgentRuntimeState["phase"];
  interviewAnswered?: boolean;
  keepCurrent?: boolean;
}): boolean {
  if (!params.forceGenerate || !harnessToolEnabled("generate")) return false;
  if (params.keepCurrent) return true;
  if (params.phase === "delivered" || params.phase === "ready" || params.phase === "planned") return true;
  if (params.interviewAnswered) return true;
  return isDetailedBrief(params.text, params.hasImages);
}

async function runGenerateStep(params: {
  text: string;
  state: AgentRuntimeState;
  session: SessionLog;
  turnId: string;
  refImages?: string[];
  toolName?: "generate" | "propose";
  didRetry?: boolean;
  didRestart?: boolean;
}): Promise<HarnessTurnResult> {
  const { session, turnId } = params;
  let state = params.state;
  const genText = resolveGenerateText(params.text, state);
  let pinned = resolveActiveSkill(state);
  let textOut = pinned?.output === "text";
  const hasRefNow = Boolean(params.refImages?.length || state.refImages?.length);
  if (textOut && shouldLeaveTextSkill(params.text, hasRefNow, pinned)) {
    const nextId = hasRefNow ? "skill.image.ip_extend" : "skill.image.ip";
    state = {
      ...state,
      skillId: nextId as AgentRuntimeState["skillId"],
      lastGenerateText: genText,
      optimizedPrompt: undefined,
      slots: hasRefNow ? { ...state.slots, mode: "扩展设计" } : state.slots,
    };
    pinned = resolveActiveSkill(state);
    textOut = pinned?.output === "text";
  }

  if (!textOut && cyclePluginsOn()) {
    const seed = {
      code: state.harnessSkillCode || "",
      id: state.specialistId || "",
      pattern: "",
      score: 0,
      flags: "",
      name: state.harnessSkillName || "",
      body: state.harnessSkillBody || "",
    };
    const { skill, bundle } = await runDiscoverCycle(
      session,
      turnId,
      params.text || genText,
      seed.code || seed.id ? seed : thinkSeed(seed.name || "出图", "按已确认的需求出图。"),
    );
    if (bundle) state = applyBundle(state, skill, bundle);
  }

  const plan = parseStoredPlan(state.cyclePlanJson);
  const retrying = Boolean(params.didRetry) || RETRY_TURN.test(params.text.trim());
  if (!textOut && !retrying && plan?.optimize !== false && loopStepOn("optimize")) {
    session.append("step/start", {
      id: `${turnId}-opt`,
      phase: "optimize",
      label: sandboxLabel("optimize"),
      detail: "正在优化出图描述…",
    });
    const optDelta = (s: string) =>
      session.append("step/delta", { id: `${turnId}-opt`, phase: "optimize", detail: s });
    let optimized = await optimizeUserPrompt({
      userText: params.text,
      skillName: state.harnessSkillName,
      specialistId: state.specialistId,
      ragBrief: state.cycleRag,
      webBrief: state.cycleWeb,
      onProgress: optDelta,
    });
    let pre = { ok: true, reason: "" };
    if (loopStepOn("review")) {
      pre = await reviewBeforeGenerate({ userText: params.text, plan, optimized });
      if (!pre.ok) {
        optimized = await optimizeUserPrompt({
          userText: `${params.text}\n约束：${pre.reason}`,
          skillName: state.harnessSkillName,
          specialistId: state.specialistId,
          ragBrief: state.cycleRag,
          webBrief: state.cycleWeb,
          onProgress: optDelta,
        });
      }
    }
    session.append("step/end", {
      id: `${turnId}-opt`,
      phase: "optimize",
      ok: pre.ok,
      reason: pre.reason,
      detail: extractOptimizedPrompt(optimized, optimized).slice(0, 360),
    });
    session.append("prompt/optimize", {
      skill: state.harnessSkillName,
      prompt: extractOptimizedPrompt(optimized, optimized),
    });
    state = keepOptimized(state, optimized);
  }

  if (textOut) {
    const keepCopy = (state.slots.creativeDesc || state.slots.oneLiner || state.lastGenerateText || "").trim();
    state = {
      ...state,
      skillId: pinned?.id,
      planConfirmed: true,
      lastGenerateText: keepCopy.length >= 8 ? keepCopy : genText,
    };
  } else {
    state = mountSkill(state, genText, params.refImages);
    if (state.optimizedPrompt) state = keepOptimized(state, state.optimizedPrompt);
    state = { ...state, lastGenerateText: state.slots.creativeDesc || state.slots.oneLiner || genText };
  }
  const spec = state.specialistId ? getSpecialist(state.specialistId) : undefined;
  session.append("skill/mount", {
    specialistId: state.specialistId,
    skillId: state.skillId,
  });

  if (!spec) {
    const text = "先把要做的东西说具体（主体、风格、用途），再点「立即生成」。";
    session.append("assistant/message", { text });
    session.append("turn/end", { id: turnId, ok: false });
    return { state, text };
  }

  const toolName = params.toolName || "generate";
  const hasRef = Boolean(state.refImages?.length);
  if (!textOut && toolName === "generate" && needsRefUpload(spec, state.slots, hasRef)) {
    const text =
      spec.id === "image.product"
        ? "商拍需要商品实拍图。请点输入框旁的附件上传后再发送。"
        : "这一步需要参考图。请点输入框旁的附件上传后再发送。";
    session.append("assistant/message", { text });
    session.append("turn/end", { id: turnId, skipped: "missing_ref" });
    return { state, text };
  }

  session.append("step/start", {
    id: `${turnId}-1`,
    tool: toolName,
    phase: "generate",
    label: textOut
      ? pinned?.id === "skill.image.ip_story"
        ? "撰写故事"
        : String(state.specialistId || "").startsWith("video.")
          ? "生成视频"
          : "撰写中"
      : sandboxLabel("generate"),
    detail: extractOptimizedPrompt(
      state.optimizedPrompt || state.slots.creativeDesc || genText,
      genText,
    ).slice(0, 800),
  });
  persistSlotsToMemory(state.slots);

  const result = await runToolPlugin(session, toolName, state, {
    refImage: state.refImages?.[0],
    skill: state.skillId,
    confirming: true,
  });

  session.append("step/end", {
    id: `${turnId}-1`,
    phase: "generate",
    ok: result.ok,
    detail: result.ok
      ? result.images?.length
        ? `已产出 ${result.images.length} 张画面`
        : (result.text || "").trim().slice(0, 280) || "已完成"
      : result.error || "未完成",
  });

  const skipAccept =
    !loopStepOn("accept") ||
    toolName === "propose" ||
    retrying ||
    String(state.specialistId || "").startsWith("video.") ||
    (result.ok && !result.images?.length);
  const accept = skipAccept
    ? { ok: result.ok, retryGenerate: false, restartSkill: false, reason: result.ok ? "已按确认参数出图。" : result.error || "未完成" }
    : await acceptAfterGenerate({
        plan,
        userText: params.text,
        imageCount: result.images?.length || 0,
        error: result.ok ? undefined : result.error,
      });
  if (loopStepOn("accept") && toolName !== "propose") {
    session.append("step/start", { id: `${turnId}-accept`, phase: "generate", label: "出图验收" });
    session.append("step/end", {
      id: `${turnId}-accept`,
      phase: "generate",
      ok: accept.ok,
      detail: accept.reason || (accept.ok ? "画面符合当前计划，予以交付。" : "验收未通过"),
    });
  }
  session.append("accept/review", {
    ok: accept.ok,
    retryGenerate: accept.retryGenerate,
    restartSkill: accept.restartSkill,
    reason: accept.reason,
  });

  if (accept.restartSkill && !params.didRestart && !retrying) {
    const seed = matchedSkill(params.text) || {
      code: "",
      id: "",
      pattern: "",
      score: 0,
      flags: "",
      name: "",
      body: "",
    };
    const fresh = { ...emptyAgentState(), phase: "clarify" as const, harnessSkillStage: "discover" as const };
    const { skill, bundle } = cyclePluginsOn()
      ? await runDiscoverCycle(session, `${turnId}-restart`, params.text, seed)
      : { skill: seed, bundle: undefined };
    const next = bundle
      ? applyBundle(fresh, skill, bundle)
      : {
          ...fresh,
          harnessSkillCode: seed.code,
          harnessSkillName: seed.name,
          harnessSkillBody: seed.body,
          specialistId: (seed.id as AgentRuntimeState["specialistId"]) || undefined,
        };
    const { groups: askGroups, intentPicks } = await liveAskGroups(session, `${turnId}-restart`, params.text, next, skill);
    const reply = await spokenOpening({
      userText: params.text,
      skill,
      intentPicks,
      groups: askGroups,
      session,
      turnId: `${turnId}-restart`,
    });
    session.append("assistant/message", { text: reply, restartSkill: true });
    session.append("turn/end", { id: turnId, ok: false, restartSkill: true });
    return {
      state: { ...next, slots: { ...next.slots, ...intentPicks } },
      text: reply,
      askGroups,
      intentPicks,
    };
  }

  if (accept.retryGenerate && !params.didRetry && toolName === "generate") {
    const constrained = [state.optimizedPrompt || params.text, accept.reason ? `纠正：${accept.reason}。保持同一品类与主体。` : ""]
      .filter(Boolean)
      .join("\n");
    return runGenerateStep({
      ...params,
      state: keepOptimized(state, constrained),
      didRetry: true,
    });
  }

  if (!result.ok) {
    const text = result.error || (toolName === "propose" ? "提案失败，请换个描述再试。" : "生成失败，请换个描述再试。");
    const actions: AgentAction[] = [{ id: "act-generate", label: "再试一次", kind: "generate" }];
    session.append("assistant/message", { text, error: true });
    session.append("turn/end", { id: turnId, ok: false });
    return { state, text, actions, error: result.error };
  }

  if (toolName === "propose") {
    const proposals = result.proposals || [];
    state = { ...state, phase: "proposed", proposals };
    const text = result.text || (proposals.length ? `已给出 ${proposals.length} 个方向，点选即可继续生成。` : "已给出方向提案。");
    const actions: AgentAction[] = [
      ...proposals.map((p) => ({
        id: `pick-${p.id}`,
        label: `用${p.title}`,
        kind: "generate" as const,
        proposalId: p.id,
      })),
      { id: "act-generate", label: "直接生成", kind: "generate" as const },
    ];
    session.append("assistant/message", { text, proposalCount: proposals.length });
    session.append("turn/end", { id: turnId, ok: true });
    return { state, text, proposals, actions };
  }

  state = {
    ...state,
    phase: "delivered",
    lastImageCount: result.images?.length || 0,
    harnessSkillStage: state.harnessSkillBody ? "ready" : state.harnessSkillStage,
  };
  const text = result.images?.length
    ? result.text || `已生成 ${result.images.length} 张，点击图片可查看大图。`
    : result.text;
  const actions = postDeliveryActions(spec).filter((a) => a.kind !== "propose").slice(0, 3);
  session.append("assistant/message", { text, imageCount: result.images?.length || 0 });
  session.append("turn/end", { id: turnId, ok: true });
  return { state, text, images: result.images, actions };
}

async function runClarifyQuiz(params: {
  text: string;
  state: AgentRuntimeState;
  session: SessionLog;
  turnId: string;
  skill: HarnessSkillItem;
  kind: "colors" | "style" | "task" | "remain";
}): Promise<HarnessTurnResult> {
  const { session, turnId } = params;
  const seed =
    params.skill.code || params.skill.id
      ? params.skill
      : thinkSeed(params.skill.name || "需求对齐", "先分析用户原话，再决定问哪一项。");
  const discovered =
    params.kind === "task" || skillAlreadyPicked(seed)
      ? { skill: seed }
      : await runDiscoverCycle(session, turnId, params.text, seed);
  let skill = discovered.skill || params.skill;
  let state = params.state;
  if (discovered.bundle && params.kind !== "task") {
    state = applyBundle(state, skill, discovered.bundle);
  }
  let groups: AskGroupItem[] = [];
  let intentPicks: Record<string, string> = {};
  if (params.kind === "colors") {
    groups = [clarifyColorAskGroup()];
  } else if (params.kind === "style") {
    groups = [clarifyStyleAskGroup()];
  } else if (params.kind === "task") {
    const group = clarifyTaskAskGroup(extractBrandHint(params.text));
    intentPicks = extractAskIntent(params.text, [group]);
    if (intentPicks.task) {
      const skillId = matchedLocalSkillId(params.text) || skillIdFromTaskPick(intentPicks.task);
      const hit = skillId ? hitFromSpecialistId(skillId) : undefined;
      if (hit?.id) {
        const nextState: AgentRuntimeState = {
          ...params.state,
          specialistId: (hit.id as AgentRuntimeState["specialistId"]) || params.state.specialistId,
          harnessSkillCode: hit.code || params.state.harnessSkillCode,
          harnessSkillName: hit.name || params.state.harnessSkillName,
          harnessSkillBody: hit.body || params.state.harnessSkillBody,
          harnessSkillStage: "discover",
          slots: { ...params.state.slots, task: intentPicks.task },
          phase: "clarify",
        };
        return runClarifyQuiz({ ...params, state: nextState, skill: hit, kind: "remain" });
      }
    }
    groups = [group];
  } else {
    const live = await liveAskGroups(session, turnId, params.text, state, skill);
    groups = live.groups;
    intentPicks = live.intentPicks;
    if (!groups.length) {
      if (state.specialistId) {
        const text = "信息已经齐了，我按原文案开始生成。";
        session.append("assistant/message", { text });
        session.append("turn/end", { id: turnId, ok: true });
        return {
          state,
          text,
          actions: [{ id: "act-generate", label: "直接生成", kind: "generate" }],
        };
      }
      groups = [clarifyStyleAskGroup(), clarifyColorAskGroup()];
    }
  }
  const hint = extractBrandHint(params.text);
  const reply =
    params.kind === "task"
      ? hint
        ? `好的。${hint}的品牌设计可以做好几块，你先点一项，我再按那个往下问。`
        : "品牌设计里你更想做哪一块？先点一项，我再按那个往下问。"
      : await spokenOpening({
          userText: params.text,
          skill,
          intentPicks,
          groups,
          session,
          turnId,
        });
  const next = {
    ...state,
    slots: { ...state.slots, ...intentPicks, ...(hint && params.kind === "task" ? { brandName: hint } : {}) },
    phase: "clarify" as const,
  };
  session.append("assistant/message", { text: reply, skillAsk: true });
  session.append("turn/end", { id: turnId, ok: true, skillAsk: true });
  return { state: next, text: reply, askGroups: groups, intentPicks };
}

function casualFallback(text: string) {
  if (/谢谢|感谢/.test(text)) return "不客气。还有要做的直接说就行。";
  return "你好，我是小墨。想做什么直接说，我来帮你。";
}

async function runCasualChat(params: {
  text: string;
  state: AgentRuntimeState;
  session: SessionLog;
  turnId: string;
}): Promise<HarnessTurnResult> {
  const { session, turnId } = params;
  const fallback = casualFallback(params.text);
  session.append("step/start", {
    id: `${turnId}-llm`,
    phase: "think",
    label: sandboxLabel("think"),
    detail: "用户在寒暄，直接回复，不走创作问卷。",
  });
  const got = await collectGenerateResult({
    scene: "agent-chat",
    skipWorkflow: true,
    input: [
      "用户只是寒暄。用小墨的口吻回 1～2 句，邀请对方说想做什么。",
      "不要问卷、不要列菜单、不要假装已经出图。",
      `用户原话：${params.text}`,
    ].join("\n"),
  });
  const text = extractUserFacingSpeech(got.text, "") || fallback;
  session.append("step/end", { id: `${turnId}-llm`, ok: Boolean(got.text), detail: got.error || "" });
  session.append("assistant/message", { text });
  session.append("turn/end", { id: turnId, ok: true });
  return { state: params.state, text, error: got.error };
}

async function runChatStep(params: {
  text: string;
  state: AgentRuntimeState;
  session: SessionLog;
  turnId: string;
  visionNotes?: string;
  interviewBody?: string;
}): Promise<HarnessTurnResult> {
  const { session, turnId } = params;
  const specialistId = resolveSkillPlugin(params.text) || params.state.specialistId;
  session.append("step/start", {
    id: `${turnId}-llm`,
    phase: "think",
    label: sandboxLabel("think"),
    detail: `用户原话：${params.text || "（已附参考图）"}`,
  });
  const pack = buildHarnessChatPack({
    session,
    userText: params.text,
    visionNotes: params.visionNotes,
    specialistId,
    skillBody: params.interviewBody,
  });
  const got = await collectGenerateResult({
    scene: "agent-chat",
    input: pack,
    skipWorkflow: true,
    ...kbFields(true),
  });
  session.append("step/end", { id: `${turnId}-llm`, ok: Boolean(got.text), detail: got.error || "" });

  const parsed = parseToolDirective(got.text || "");
  const fallback = params.interviewBody
    ? "先看下面的卡片，点一项或自己填，填完后点立即生成。"
    : "我在，想做什么直接说。";
  const text = extractUserFacingSpeech(parsed.text || fallback, fallback);
  session.append("assistant/message", { text });
  session.append("turn/end", { id: turnId, ok: true });
  return { state: params.state, text, error: got.error };
}

export async function runHarnessGenerate(params: {
  text: string;
  state: AgentRuntimeState;
  session: SessionLog;
  refImages?: string[];
}): Promise<HarnessTurnResult> {
  return runHarnessTurn({ ...params, forceGenerate: true });
}

/** 对话发送：创作 brief 走 generate 工具；寒暄走 LLM step。全程写入 session 日志。 */
export async function runHarnessTurn(params: {
  text: string;
  state: AgentRuntimeState;
  session: SessionLog;
  refImages?: string[];
  forceGenerate?: boolean;
  visionNotes?: string;
  actionKind?: string;
  skillId?: string;
}): Promise<HarnessTurnResult> {
  await loadPublicHarness();
  const turnId = uidTurn();
  const text = params.text.trim();
  const hasImages = Boolean(params.refImages?.length);
  const startState: AgentRuntimeState = params.skillId
    ? { ...params.state, skillId: params.skillId as AgentRuntimeState["skillId"] }
    : params.state;
  const quizLockedEarly = /请按以下信息生成/.test(text);
  if (isCasualChat(text) && !params.forceGenerate && params.actionKind !== "generate") {
    params.session.append("turn/start", { id: turnId });
    params.session.append("user/message", { text, imageCount: params.refImages?.length || 0 });
    return runCasualChat({ text, state: params.state, session: params.session, turnId });
  }
  const alreadyOnBrandTrack = Boolean(
    params.state.specialistId ||
      params.state.harnessSkillCode ||
      String(params.state.slots?.task || "").trim(),
  );
  if (
    !params.skillId &&
    !alreadyOnBrandTrack &&
    isVagueBrandCategory(text) &&
    !extractAskIntent(text, [brandCategoryAskGroup(extractBrandHint(text))]).task &&
    !quizLockedEarly &&
    params.actionKind !== "generate"
  ) {
    const hint = extractBrandHint(text);
    const groups = [brandCategoryAskGroup(hint)];
    const reply = hint
      ? `好的。${hint}的品牌设计可以做好几块，你先点一项，我再按那个往下问。`
      : "品牌设计里你更想做哪一块？先点一项，我再按那个往下问。";
    params.session.append("turn/start", { id: turnId });
    params.session.append("user/message", { text: text || "（已附参考图）", imageCount: params.refImages?.length || 0 });
    params.session.append("step/start", {
      id: `${turnId}-think`,
      phase: "think",
      label: "分析计划",
      detail: "用户只说了品牌设计大类，还没点到 IP、Logo、海报、商拍、店招或字体。先请用户选一块，再往下问。",
    });
    params.session.append("step/end", {
      id: `${turnId}-think`,
      phase: "think",
      ok: true,
      detail: "先请用户点选具体一块，不直接出图。",
    });
    params.session.append("assistant/message", { text: reply, skillAsk: true });
    params.session.append("turn/end", { id: turnId, ok: true, skillAsk: true });
    return {
      state: {
        ...params.state,
        specialistId: undefined,
        harnessSkillCode: undefined,
        harnessSkillName: undefined,
        harnessSkillBody: undefined,
        harnessSkillStage: undefined,
        skillId: undefined,
        phase: "route",
        slots: hint ? { ...params.state.slots, brandName: hint } : params.state.slots,
      },
      text: reply,
      askGroups: groups,
    };
  }
  const { hit, switched } = interviewSkillFor(text, startState, {
    lockSkill:
      RETRY_TURN.test(text) ||
      /请按以下信息生成/.test(text) ||
      params.actionKind === "generate" ||
      params.actionKind === "confirm_plan",
  });
  const interviewBody = hit?.body || (hit ? `【${hit.name}】先收集信息，填完后点立即生成。` : "");
  const quizLocked = /请按以下信息生成/.test(text);
  const keepCurrent =
    Boolean(startState.specialistId || startState.harnessSkillCode) &&
    (params.forceGenerate ||
      params.actionKind === "generate" ||
      params.actionKind === "confirm_plan" ||
      RETRY_TURN.test(text)) &&
    !switched;
  const startingDiscover =
    !params.skillId &&
    !keepCurrent &&
    loopUsesXiaomoCycle() &&
    Boolean(hit) &&
    !quizLocked &&
    (switched ||
      (startState.harnessSkillStage !== "discover" &&
        startState.phase !== "delivered" &&
        startState.phase !== "ready" &&
        startState.phase !== "planned"));
  let state: AgentRuntimeState = hit
    ? {
        ...startState,
        ...(switched && !params.skillId
          ? {
              slots: {},
              phase: "clarify" as const,
              planConfirmed: false,
              proposals: undefined,
              chosenProposalId: undefined,
              pendingAskKeys: undefined,
              skillId: undefined,
              lastImageCount: undefined,
              cyclePlanJson: undefined,
              cycleRag: undefined,
              cycleWeb: undefined,
              optimizedPrompt: undefined,
            }
          : {}),
        specialistId: (hit.id as AgentRuntimeState["specialistId"]) || startState.specialistId,
        harnessSkillBody: interviewBody,
        harnessSkillCode: hit.code || startState.harnessSkillCode,
        harnessSkillName: hit.name || startState.harnessSkillName,
        harnessSkillStage: "discover",
        phase: startingDiscover ? "clarify" : startState.phase,
      }
    : startState;
  params.session.append("turn/start", { id: turnId });
  params.session.append("user/message", { text: text || "（已附参考图）", imageCount: params.refImages?.length || 0 });

  const interviewAnswered =
    !switched &&
    (quizLocked ||
      (startState.harnessSkillStage === "discover" &&
        !/^(请)?(帮我)?(生成|设计|做|画|来)(一个|一张|一份|一套)?(品牌设计|海报|包装|logo|标志|ip|IP|图片|视觉)?[吧啊呀吗？?。.!！]*$/i.test(
          text,
        ) &&
        text.trim().length >= 6));
  const willGenerate =
    !startingDiscover &&
    shouldCallGenerate({
      text,
      hasImages,
      forceGenerate: params.forceGenerate,
      phase: state.phase,
      interviewAnswered,
      keepCurrent,
    });

  if (hit && startingDiscover) {
    const { skill, bundle } =
      cyclePluginsOn() && !skillAlreadyPicked(hit)
        ? await runDiscoverCycle(params.session, turnId, text, hit)
        : { skill: hit, bundle: undefined };
    if (bundle) state = applyBundle(state, skill, bundle);
    const live = await liveAskGroups(params.session, turnId, text, state, skill);
    const vagueBrand =
      isVagueBrandCategory(text) &&
      !live.intentPicks.task &&
      !String(state.slots?.task || "").trim() &&
      !state.specialistId;
    const askGroups = vagueBrand ? [brandCategoryAskGroup(extractBrandHint(text))] : live.groups;
    const intentPicks = vagueBrand ? {} : live.intentPicks;
    state = { ...state, slots: { ...state.slots, ...intentPicks } };
    if (askGroups.length) {
      const reply = await spokenOpening({
        userText: text,
        skill,
        switched,
        intentPicks,
        groups: askGroups,
        session: params.session,
        turnId,
      });
      params.session.append("skill/mount", {
        interview: true,
        switched,
        code: skill.code || hit.code,
        name: skill.name || hit.name,
        planned: Boolean(bundle),
        intentPicks,
      });
      params.session.append("assistant/message", { text: reply });
      params.session.append("turn/end", { id: turnId, ok: true, skillAsk: true });
      return { state, text: reply, askGroups, intentPicks };
    }
  }

  if (willGenerate) {
    return runGenerateStep({
      text: text || "请参考我上传的图片生成",
      state,
      session: params.session,
      turnId,
      refImages: params.refImages,
    });
  }

  const skillForAsk = hit || {
    code: state.harnessSkillCode || "",
    id: state.specialistId || "",
    pattern: "",
    score: 0,
    flags: "",
    name: state.harnessSkillName || "",
    body: state.harnessSkillBody || "",
  };
  if (loopUsesXiaomoCycle() && !isCasualChat(text)) {
    const kind =
      detectClarifyKind(text, params.actionKind, {
        task: state.slots?.task,
        specialistId: state.specialistId,
      }) ||
      (skillForAsk.code || skillForAsk.id ? ("remain" as const) : ("task" as const));
    return runClarifyQuiz({
      text,
      state,
      session: params.session,
      turnId,
      skill: skillForAsk,
      kind,
    });
  }

  return runChatStep({
    text: text || "你好",
    state,
    session: params.session,
    turnId,
    visionNotes: params.visionNotes,
    interviewBody,
  });
}
