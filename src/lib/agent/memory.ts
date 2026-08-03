/**
 * 记忆分轨（按对话隔离）
 * - brand：本对话内用户确认的品牌事实（不跨对话混用）
 * - session：phase / 槽进度 / 计划 → 仅会话态，禁止写入 brand
 */
import type { AgentRuntimeState, SessionProgress } from "./types";

const LEGACY_GLOBAL_KEY = "mofun_agent_brand_memory_v1";

export type BrandMemory = {
  brandName?: string;
  industry?: string;
  style?: string;
  audience?: string;
  colors?: string;
  slogan?: string;
  updatedAt: number;
};

/** 当前绑定的对话 id；新对话必须换 id 并 reset */
let boundSessionId: string | null = null;
/** 仅存活在当前对话；不跨对话共享 */
let sessionBrandMemory: BrandMemory | null = null;

function purgeLegacyGlobalMemory() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_GLOBAL_KEY);
  } catch {
    /* ignore */
  }
}

/** 新对话：绑定新 sessionId，清空品牌记忆（与上一对话隔离） */
export function resetBrandMemory(sessionId: string) {
  purgeLegacyGlobalMemory();
  boundSessionId = sessionId;
  sessionBrandMemory = null;
}

/** 恢复某段历史对话时，载入该对话自己的记忆（可为空） */
export function bindBrandMemorySession(sessionId: string, seed?: BrandMemory | null) {
  purgeLegacyGlobalMemory();
  boundSessionId = sessionId;
  sessionBrandMemory = seed ? { ...seed } : null;
}

export function getBoundBrandMemorySessionId(): string | null {
  return boundSessionId;
}

export function readBrandMemory(): BrandMemory | null {
  return sessionBrandMemory ? { ...sessionBrandMemory } : null;
}

export function writeBrandMemory(patch: Partial<BrandMemory>): BrandMemory {
  const prev = sessionBrandMemory || { updatedAt: 0 };
  const next: BrandMemory = {
    ...prev,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => Boolean(v))),
    updatedAt: Date.now(),
  };
  sessionBrandMemory = next;
  return { ...next };
}

/**
 * 把「本对话」记忆注入空槽（不覆盖用户本轮已填）
 * 品牌名 / 色系 / 风格等身份向字段不自动写入，避免未点选却被当成已定。
 */
export function injectMemorySlots(slots: Record<string, string>): Record<string, string> {
  const mem = readBrandMemory();
  if (!mem) return slots;
  const next = { ...slots };
  if (!next.industry && mem.industry) next.industry = mem.industry;
  if (!next.audience && mem.audience) next.audience = mem.audience;
  return next;
}

/** 仅写本对话品牌事实轨；不含 phase / planConfirmed 等会话进度 */
export function persistSlotsToMemory(slots: Record<string, string>, slogan?: string) {
  writeBrandMemory({
    brandName: slots.brandName || slots.brand || slots.shopName,
    industry: slots.industry || slots.category,
    style: slots.style,
    audience: slots.audience,
    colors: slots.colors,
    slogan,
  });
}

/** 从 runtime 抽出会话进度轨（供持久化会话历史，不进 Brand Memory） */
export function toSessionProgress(state: AgentRuntimeState): SessionProgress {
  return {
    specialistId: state.specialistId,
    slots: { ...state.slots },
    phase: state.phase,
    pendingAskKeys: state.pendingAskKeys,
    directionPlan: state.directionPlan,
    planConfirmed: state.planConfirmed,
    skillId: state.skillId,
    chosenProposalId: state.chosenProposalId,
    unansweredStreak: state.unansweredStreak,
  };
}
