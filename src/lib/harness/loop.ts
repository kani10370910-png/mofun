/**
 * Agent loop 插件：对齐 DeepSeek Harness turn 流程
 * turn/start → skill/mount → step → tool/call → tool/result → assistant/message → turn/end
 * @see https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md
 */
import { collectGenerate } from "@/lib/useGenerateStream";
import { kbFields } from "@/lib/regionEnhance";
import { postDeliveryActions } from "@/lib/agent/orchestrator";
import { getSpecialist } from "@/lib/agent/specialists";
import { injectMemorySlots, persistSlotsToMemory } from "@/lib/agent/memory";
import { resolveActiveSkill } from "@/lib/agent/skills";
import type { AgentAction, AgentProposal, AgentRuntimeState } from "@/lib/agent/types";
import { looksLikeGenerateBrief, resolveSkillPlugin } from "./plugins";
import { buildHarnessChatPack, parseToolDirective } from "./prompt";
import { needsRefUpload, seedSlotsFromPrompt } from "./slots";
import { runToolPlugin } from "./tools";
import type { SessionLog } from "./session";

export type HarnessTurnResult = {
  state: AgentRuntimeState;
  text: string;
  images?: string[];
  actions?: AgentAction[];
  proposals?: AgentProposal[];
  error?: string;
};

const GREET_RE = /^(你好|您好|嗨|哈喽|在吗|谢谢|早上好|中午好|晚上好)[！!。.~～]*$/;

function uidTurn() {
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function mountSkill(state: AgentRuntimeState, text: string, refImages?: string[]): AgentRuntimeState {
  const specialistId = resolveSkillPlugin(text);
  const spec = getSpecialist(specialistId);
  if (!spec) return { ...state, specialistId };

  const hasRef = Boolean(refImages?.length);
  const slots = seedSlotsFromPrompt(spec, text, injectMemorySlots(state.slots), hasRef);
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
  };
}

function shouldCallGenerate(params: {
  text: string;
  hasImages: boolean;
  forceGenerate?: boolean;
  phase?: AgentRuntimeState["phase"];
}): boolean {
  if (params.forceGenerate) return true;
  if (params.hasImages) return true;
  const t = params.text.trim();
  if (!t || GREET_RE.test(t)) return false;
  if (looksLikeGenerateBrief(t, params.hasImages)) return true;
  if (params.phase === "delivered") return true;
  return false;
}

async function runGenerateStep(params: {
  text: string;
  state: AgentRuntimeState;
  session: SessionLog;
  turnId: string;
  refImages?: string[];
  toolName?: "generate" | "propose";
}): Promise<HarnessTurnResult> {
  const { session, turnId } = params;
  let state = mountSkill(params.state, params.text, params.refImages);
  const spec = state.specialistId ? getSpecialist(state.specialistId) : undefined;
  session.append("skill/mount", {
    specialistId: state.specialistId,
    skillId: state.skillId,
  });

  if (!spec) {
    const text = "先简单说说想做的画面或文案，我直接开始生成。";
    session.append("assistant/message", { text });
    session.append("turn/end", { id: turnId, ok: false });
    return { state, text };
  }

  const toolName = params.toolName || "generate";
  const hasRef = Boolean(state.refImages?.length);
  if (toolName === "generate" && needsRefUpload(spec, state.slots, hasRef)) {
    const text =
      spec.id === "image.product"
        ? "商拍需要商品实拍图。请点输入框旁的附件上传后再发送。"
        : "这一步需要参考图。请点输入框旁的附件上传后再发送。";
    session.append("assistant/message", { text });
    session.append("turn/end", { id: turnId, skipped: "missing_ref" });
    return { state, text };
  }

  session.append("step/start", { id: `${turnId}-1`, tool: toolName });
  persistSlotsToMemory(state.slots);

  const result = await runToolPlugin(session, toolName, state, {
    refImage: state.refImages?.[0],
    skill: state.skillId,
    confirming: true,
  });

  session.append("step/end", { id: `${turnId}-1`, ok: result.ok });

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
  };
  const text = result.images?.length
    ? result.text || `已生成 ${result.images.length} 张，点击图片可查看大图。`
    : result.text;
  const actions = postDeliveryActions(spec).filter((a) => a.kind !== "propose");
  session.append("assistant/message", { text, imageCount: result.images?.length || 0 });
  session.append("turn/end", { id: turnId, ok: true });
  return { state, text, images: result.images, actions };
}

async function runChatStep(params: {
  text: string;
  state: AgentRuntimeState;
  session: SessionLog;
  turnId: string;
  visionNotes?: string;
}): Promise<HarnessTurnResult> {
  const { session, turnId } = params;
  session.append("step/start", { id: `${turnId}-llm` });
  const pack = buildHarnessChatPack({
    session,
    userText: params.text,
    visionNotes: params.visionNotes,
  });
  const raw = await collectGenerate({
    scene: "agent-chat",
    input: pack,
    ...kbFields(true),
  });
  session.append("step/end", { id: `${turnId}-llm`, ok: Boolean(raw) });

  const parsed = parseToolDirective(raw || "");
  if (parsed.tool) {
    return runGenerateStep({
      text: params.text,
      state: params.state,
      session,
      turnId,
      toolName: parsed.tool,
    });
  }

  const text =
    parsed.text ||
    "说说你想做的画面或文案，例如「国潮风萧山萝卜干伴手礼包装」，发送后我会直接生成。";
  session.append("assistant/message", { text });
  session.append("turn/end", { id: turnId, ok: true });
  return { state: params.state, text };
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
}): Promise<HarnessTurnResult> {
  const turnId = uidTurn();
  const text = params.text.trim();
  const hasImages = Boolean(params.refImages?.length);
  params.session.append("turn/start", { id: turnId });
  params.session.append("user/message", { text: text || "（已附参考图）", imageCount: params.refImages?.length || 0 });

  if (
    shouldCallGenerate({
      text,
      hasImages,
      forceGenerate: params.forceGenerate,
      phase: params.state.phase,
    })
  ) {
    return runGenerateStep({
      text: text || "请参考我上传的图片生成",
      state: params.state,
      session: params.session,
      turnId,
      refImages: params.refImages,
    });
  }

  return runChatStep({
    text: text || "你好",
    state: params.state,
    session: params.session,
    turnId,
    visionNotes: params.visionNotes,
  });
}
