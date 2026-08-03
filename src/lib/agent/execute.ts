/**
 * 执行层薄封装：按 Skill 调度（实现见 skills/run.ts）
 */
export { runSkillPropose as executePropose, runSkillGenerate as executeGenerate } from "./skills/run";
export type { ExecuteResult } from "./skills/run";
