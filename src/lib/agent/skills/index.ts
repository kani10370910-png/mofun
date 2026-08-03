/**
 * Skills 注册表：工作台功能 → 可调用 Skill
 * Skill ≠ Tool：Skill 是流程/闸门/scene 手册；Tool 才调 /api/*
 */
import { SKILL_CATALOG } from "./catalog";
import type { SkillDef } from "../types";

export { SKILL_CATALOG, SKILL_BY_ID, DEFAULT_SKILL_BY_SPECIALIST } from "./catalog";
export {
  getSkill,
  getSkillById,
  listSkillsForSpecialist,
  normalizeSkillId,
  resolveActiveSkill,
  skillCatalogBlock,
} from "./resolve";
export {
  INDUSTRY_FOCUS_OPTIONS,
  buildIndustryResearchMessages,
  detectIndustryFocus,
} from "./prompts/industryResearch";
export type { IndustryResearchFocus } from "./prompts/industryResearch";
export {
  OFFICIAL_THEME_BY_STYLE,
  buildOfficialCoverPrompt,
  buildOfficialMessages,
  stripOfficialMarkdown,
} from "./prompts/officialArticle";

/** @deprecated 使用 SKILL_CATALOG；保留别名兼容 */
export const SKILLS: SkillDef[] = SKILL_CATALOG;

/** 描述匹配：启动时可见的窄描述 / 关键词 */
export function matchSkillsByText(text: string): SkillDef[] {
  const t = text.toLowerCase();
  return SKILL_CATALOG.filter(
    (s) =>
      s.triggerKeywords.some((k) => t.includes(k.toLowerCase())) ||
      s.name.toLowerCase().includes(t) ||
      s.description.toLowerCase().includes(t) ||
      s.id.toLowerCase().includes(t)
  );
}
