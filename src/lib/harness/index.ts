/**
 * 首页对话框驾驭层：对齐 DeepSeek Harness（everything is a plugin）
 * 开源：https://github.com/deepseek-ai/deepseek-harness （MIT · developer preview）
 *
 * 不引入完整 dsh / Cordis 运行时；映射其核心：
 * - 追加式 session 日志（model-visible means logged）
 * - Skill / Tool 均为插件
 * - turn = 若干 step（装配 → 工具 → 结果）
 */
export { createSessionLog } from "./session";
export type { SessionEvent, SessionEventType, SessionLog } from "./session";
export { resolveSkillPlugin, looksLikeGenerateBrief } from "./plugins";
export { runHarnessGenerate, runHarnessTurn } from "./loop";
export type { HarnessTurnResult } from "./loop";
