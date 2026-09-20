/**
 * 从运营端读取已启用的 DeepSeek Harness 设置。
 * 拉取失败时保持 null，用户端回退本地默认。
 */
import { parseAgentLoop, DEFAULT_AGENT_LOOP, type AgentLoopConfig } from "./agentLoopConfig";

export type HarnessIntent = { text: string; view: string; sub: string };

export type SkillAskStep = {
  key: string;
  label: string;
  ask: string;
  required?: boolean;
  optional?: boolean;
  multi?: boolean;
  maxSelect?: number;
  options: { value: string; label: string; custom?: boolean }[];
};

export type HarnessSkillItem = {
  code: string;
  id: string;
  pattern: string;
  score: number;
  flags: string;
  name: string;
  body?: string;
  opening?: string;
  askSteps?: SkillAskStep[];
};

export type PublicHarness = {
  ok: boolean;
  repo?: string;
  syncedAt?: string;
  soul?: string;
  toolsPrompt?: string;
  defaultSkill?: string;
  sessionHistory?: boolean;
  skills?: HarnessSkillItem[];
  tools?: string[];
  intents?: HarnessIntent[];
  agentLoop?: AgentLoopConfig;
};

type RawItem = {
  code: string;
  kind: string;
  name: string;
  description: string;
  content: string;
  extra?: Record<string, unknown>;
};

type RawPayload = { repo?: string; syncedAt?: string; list?: RawItem[] };

const TTL_MS = 30_000;
let cache: PublicHarness | null = null;
let loadedAt = 0;
let inflight: Promise<PublicHarness> | null = null;

function opsBase() {
  return (process.env.NEXT_PUBLIC_OPS_API_BASE || "http://localhost:4100").replace(/\/$/, "");
}

function extraText(item: RawItem | undefined, key: string) {
  const v = item?.extra?.[key];
  return typeof v === "string" ? v.trim() : "";
}

function extraFlag(item: RawItem | undefined, key: string, fallback = true) {
  const v = item?.extra?.[key];
  if (v === false || v === "false" || v === 0) return false;
  if (v === true || v === "true" || v === 1) return true;
  return fallback;
}

function parsePayload(data: RawPayload): PublicHarness {
  const list = Array.isArray(data.list) ? data.list : [];
  const sys = list.find((x) => x.code === "dsh.core.system-prompt");
  const toolsCore = list.find((x) => x.code === "dsh.core.tools");
  const sessionCore = list.find((x) => x.code === "dsh.core.session");
  const soul =
    extraText(sys, "soul") ||
    list.find((x) => x.kind === "prompt" && x.code === "prompt.soul")?.content?.trim();
  const toolsPrompt =
    extraText(toolsCore, "toolsPrompt") ||
    list.find((x) => x.kind === "prompt" && x.code === "prompt.tools")?.content?.trim();
  const defaultSkill = list.find((x) => x.kind === "prompt" && x.code === "prompt.default_skill")?.content?.trim();
  const sessionHistory = extraFlag(sessionCore, "modelSeesHistory", true);
  const skills = list
    .filter((x) => x.kind === "skill")
    .map((x) => {
      const askRaw = x.extra?.askSteps;
      const askSteps = Array.isArray(askRaw)
        ? (askRaw as SkillAskStep[]).filter((s) => s.key !== "count")
        : undefined;
      return {
        code: x.code,
        id: String(x.extra?.specialistId || x.code.replace(/^skill\./, "")),
        pattern: String(x.content || "").trim(),
        score: Number(x.extra?.score || 0),
        flags: String(x.extra?.flags || ""),
        name: x.name,
        body: String(x.extra?.skillBody || "").trim(),
        opening: String(x.extra?.opening || "").trim(),
        askSteps: askSteps?.length ? askSteps : undefined,
      };
    })
    .filter((x) => x.id && x.pattern);
  let tools = list
    .filter((x) => x.kind === "tool")
    .map((x) => String(x.extra?.toolName || x.name || "").trim())
    .filter(Boolean);
  if (toolsCore) {
    if (!extraFlag(toolsCore, "generateEnabled", true)) tools = tools.filter((t) => t !== "generate");
    if (!extraFlag(toolsCore, "proposeEnabled", true)) tools = tools.filter((t) => t !== "propose");
  }
  const intents = list
    .filter((x) => x.kind === "intent")
    .map((x) => ({
      text: String(x.extra?.text || x.content || x.name || "").trim(),
      view: String(x.extra?.view || "image"),
      sub: String(x.extra?.sub || ""),
    }))
    .filter((x) => x.text);
  const loopRow = list.find((x) => x.code === "dsh.core.agent-loop");
  return {
    ok: true,
    repo: data.repo,
    syncedAt: data.syncedAt,
    soul,
    toolsPrompt,
    defaultSkill,
    sessionHistory,
    skills,
    tools,
    intents,
    agentLoop: parseAgentLoop(loopRow?.extra, Boolean(loopRow)),
  };
}

function harnessUrls() {
  const direct = `${opsBase()}/public/harness`;
  if (typeof window === "undefined") return [direct];
  return [direct, "/api/public/harness"];
}

export function getHarnessCache(): PublicHarness | null {
  return cache;
}

export function getAgentLoop(): AgentLoopConfig {
  return getHarnessCache()?.agentLoop || DEFAULT_AGENT_LOOP;
}

export function loopUsesXiaomoCycle() {
  const loop = getAgentLoop();
  return loop.enabled && loop.driver === "xiaomo-cycle";
}

export function loopStepOn(name: keyof AgentLoopConfig["steps"]) {
  const loop = getAgentLoop();
  if (!loop.enabled) return false;
  return loop.steps[name] !== false;
}

export function skillBodyFor(specialistId?: string): string {
  if (!specialistId) return "";
  const cfg = getHarnessCache();
  if (!cfg?.ok || !cfg.skills) return "";
  const hits = cfg.skills.filter((s) => s.id === specialistId && s.body);
  if (!hits.length) return "";
  return [...hits].sort((a, b) => b.score - a.score)[0].body || "";
}

/** 去掉「不要品牌设计了」这类否定，避免旧意图继续命中 */
export function intentMatchText(text: string): string {
  return text
    .replace(/不要.{0,24}?(了|，|,|。|！|!|$)/g, " ")
    .replace(/不(做|用|再做|想做|想要).{0,16}/g, " ")
    .replace(/别(做|再).{0,12}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 用户在改任务 / 换 Skill，而不是回答当前访谈 */
export function isSkillSwitchPhrase(text: string): boolean {
  return /不要.{0,16}(了|，|,|。)|不(做|用|再做|想做).{0,8}|改(做|成)|换成|换做|还是做|我(要|想)做|帮我(做|生成|设计)|做个|做一个|生成一个|设计一个/.test(
    text,
  );
}

function skillSame(item: HarnessSkillItem, state: { specialistId?: string; harnessSkillCode?: string }) {
  if (item.id && state.specialistId && item.id === state.specialistId) return true;
  if (item.code && state.harnessSkillCode && item.code === state.harnessSkillCode) return true;
  return false;
}

/** 按关键词命中的 Skill；有正文或访谈步骤时首页先问后生成 */
export function matchedSkill(text: string): HarnessSkillItem | undefined {
  const t = intentMatchText(text);
  const cfg = getHarnessCache();
  if (!t || !cfg?.ok || !cfg.skills) return undefined;
  let best: HarnessSkillItem | undefined;
  for (const item of cfg.skills) {
    if (!item.pattern) continue;
    if (!item.body && !item.askSteps?.length) continue;
    try {
      const re = new RegExp(item.pattern, item.flags || undefined);
      if (!re.test(t)) continue;
      if (!best || (item.score || 0) > (best.score || 0)) best = item;
    } catch {
      /* skip invalid pattern */
    }
  }
  return best;
}

/** 当前会话已有 Skill 时，若用户改口命中另一个 Skill，则切换 */
export function skillSwitchTarget(
  text: string,
  state: { specialistId?: string; harnessSkillCode?: string },
): HarnessSkillItem | undefined {
  if (!state.specialistId && !state.harnessSkillCode) return undefined;
  const next = matchedSkill(text);
  if (!next || skillSame(next, state)) return undefined;
  if (!isSkillSwitchPhrase(text)) return undefined;
  return next;
}

/** 按关键词命中的那条 Skill 的正文；未命中关键词时不返回（避免把品牌 Skill 套到默认活动视觉上） */
export function matchedSkillBody(text: string): string {
  return matchedSkill(text)?.body || "";
}

export async function loadPublicHarness(force = false): Promise<PublicHarness> {
  if (!force && cache?.ok && Date.now() - loadedAt < TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const parsed = await Promise.any(
        harnessUrls().map(async (url) => {
          const r = await fetch(url, {
            signal: AbortSignal.timeout(8000),
            cache: "no-store",
          });
          if (!r.ok) throw new Error(String(r.status));
          return parsePayload((await r.json()) as RawPayload);
        }),
      );
      cache = parsed;
      loadedAt = Date.now();
      return parsed;
    } catch {
      cache = { ok: false };
      loadedAt = 0;
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
