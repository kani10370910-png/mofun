/**
 * 小墨对话框 Harness 公共出口
 * A 装配 context · B 推理仍委托 /api · C tools · D gates · Loop orchestrator
 * 首页「立即生成」直出路径见 src/lib/harness
 */

export type {
  AgentAction,
  AgentActionKind,
  AgentProposal,
  AgentRuntimeState,
  AskGroupItem,
  AssistantTurn,
  GateDenial,
  GateResult,
  HarnessPhase,
  SessionProgress,
  SkillDef,
  SkillGatePolicy,
  SkillId,
  SkillOutputKind,
  SpecialistId,
  ToolName,
} from "./types";

export { emptyAgentState, runAgentTurn, buildCreativeBrief, postDeliveryActions } from "./orchestrator";
export { getSpecialist, SPECIALISTS } from "./specialists";
/** 经 ToolRegistry + 闸门；对外签名与旧 execute 兼容 */
export { executePropose, executeGenerate, TOOL_CATALOG, toolPropose, toolGenerate } from "./tools/registry";
export { executeAgentReply } from "./tools/reply";
export type { ChatHistoryItem } from "./tools/reply";
export type { ExecuteResult } from "./execute";
export { parseProposals } from "./parse";
export { buildDirectionPlan, needsDirectionGate } from "./directionPlan";
export {
  readBrandMemory,
  writeBrandMemory,
  injectMemorySlots,
  persistSlotsToMemory,
  toSessionProgress,
  resetBrandMemory,
  bindBrandMemorySession,
  getBoundBrandMemorySessionId,
} from "./memory";
export { assertCanGenerate, assertCanPropose, failureRetryActions } from "./gates";
export { assembleContext, SOUL_SEGMENT, AGENTS_SEGMENT, TOOLS_SEGMENT } from "./context";
export {
  SKILLS,
  SKILL_CATALOG,
  getSkill,
  getSkillById,
  listSkillsForSpecialist,
  matchSkillsByText,
  normalizeSkillId,
  resolveActiveSkill,
  skillCatalogBlock,
} from "./skills";
