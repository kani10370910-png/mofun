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
export { resolveSkillPlugin, looksLikeGenerateBrief, isDetailedBrief, isCasualChat, isVagueBrandCategory, extractBrandHint } from "./plugins";
export { reduceSandboxTrace, freezeSandboxTrace, sealSandboxTrace, sealGenerateTrace, sealReplyTrace, sandboxLabel } from "./sandboxTrace";
export type { SandboxTraceItem, SandboxTraceKind, SealReplyKind } from "./sandboxTrace";
export { runHarnessGenerate, runHarnessTurn } from "./loop";
export type { HarnessTurnResult } from "./loop";
export { runCycleStart, optimizeUserPrompt, retrieveRag, retrieveWeb } from "./agentCycle";
export { harnessToolEnabled, writeSkillOpening, harnessSoulText } from "./prompt";
export { loadPublicHarness, getHarnessCache, getAgentLoop, loopUsesXiaomoCycle, loopStepOn, skillBodyFor, matchedSkill, matchedSkillBody, skillSwitchTarget } from "./opsConfig";
export type { AgentLoopConfig, AgentLoopDriver, AgentLoopSteps } from "./agentLoopConfig";
export type { PublicHarness, HarnessIntent, HarnessSkillItem, SkillAskStep } from "./opsConfig";
export { openingAskFromSkill, skillExploreAskGroups, skillAskGroups, skillOpening, formatSkillAskAnswers, buildSkillBrief, skillGenParams, formatSkillGeneratePrompt, applyQuizExamples, QUIZ_EXAMPLE_KEYS, sanitizeUserSpeech, extractUserFacingSpeech, sanitizeAskGroup, askIntentValue } from "./skillPlaybook";
export { applySkillPicksToSlots, extractOptimizedPrompt } from "./userCopy";
export { expandSkillCreativeDesc } from "./expandCreative";
export type { SkillBrief, SkillGenParams } from "./skillPlaybook";
