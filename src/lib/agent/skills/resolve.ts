/**
 * 根据会话状态解析当前应调用的 Skill
 */
import { DEFAULT_SKILL_BY_SPECIALIST, SKILL_BY_ID, SKILL_CATALOG } from "./catalog";
import type { AgentRuntimeState, SkillDef, SkillId, SpecialistId } from "../types";

/** 兼容旧 id：不单独落盘，留给 resolve 按槽位细分 */
const COMPAT_SKILL_IDS = new Set<string>(["skill.image.product", "skill.content.social"]);

/** 兼容旧写法 / 别名 */
export function normalizeSkillId(id?: string | null): SkillId | undefined {
  if (!id) return undefined;
  if (id === "vi_extend") return "skill.image.vi_extend";
  if (id === "skill.image.product") return "skill.image.product_bg";
  // social 兼容 id 不在此固化为微信，交给 resolveActiveSkill 按 platform
  if (id === "skill.content.social") return "skill.content.social";
  if (SKILL_BY_ID[id]) return id as SkillId;
  return undefined;
}

export function getSkillById(id: SkillId | string | undefined): SkillDef | undefined {
  const nid = normalizeSkillId(id);
  if (!nid) return undefined;
  if (nid === "skill.content.social") {
    return DEFAULT_SKILL_BY_SPECIALIST["content.social"] || SKILL_BY_ID[nid];
  }
  return SKILL_BY_ID[nid];
}

/** 专家默认 Skill；也可传入 SkillId */
export function getSkill(id: SpecialistId | SkillId | string | undefined): SkillDef | undefined {
  if (!id) return undefined;
  const bySkill = getSkillById(id);
  if (bySkill) return bySkill;
  return DEFAULT_SKILL_BY_SPECIALIST[id as SpecialistId];
}

export function listSkillsForSpecialist(specialistId: SpecialistId): SkillDef[] {
  return SKILL_CATALOG.filter((s) => s.specialistId === specialistId);
}

/**
 * 解析本轮生成应调用的 Skill：
 * 1) 显式 skillId / opts.skill（兼容 id 除外，改走槽位）
 * 2) 槽位 when 条件（如 platform=小红书）
 * 3) 专家默认 Skill
 */
export function resolveActiveSkill(
  state: AgentRuntimeState,
  opts?: { skill?: SkillId | "vi_extend" | string }
): SkillDef | undefined {
  const raw = opts?.skill || state.skillId;
  const explicit = normalizeSkillId(raw);
  if (explicit && !COMPAT_SKILL_IDS.has(explicit) && explicit !== "skill.content.social") {
    const s = SKILL_BY_ID[explicit];
    if (s) return s;
  }

  const sid = state.specialistId;
  if (!sid) return undefined;

  const variants = SKILL_CATALOG.filter(
    (s) =>
      s.specialistId === sid &&
      s.when &&
      state.slots[s.when.slot] === s.when.equals &&
      !COMPAT_SKILL_IDS.has(s.id)
  );
  if (variants.length) return variants[0];

  return DEFAULT_SKILL_BY_SPECIALIST[sid] || SKILL_CATALOG.find((s) => s.specialistId === sid && s.isDefault);
}

/** 装配用：当前专家可用 Skill 一览（跳过兼容别名） */
export function skillCatalogBlock(specialistId?: SpecialistId): string {
  const list = (specialistId
    ? listSkillsForSpecialist(specialistId)
    : SKILL_CATALOG.filter((s) => s.isDefault || !s.specialistId)
  ).filter((s) => !COMPAT_SKILL_IDS.has(s.id));
  if (!list.length) return "【可用 Skill】（无）";
  return [
    "【可用 Skill】",
    ...list.map(
      (s) =>
        `- ${s.id}「${s.name}」→ ${s.workbench.href} · ${s.generateScene || s.proposeScene || s.output} · ${s.description}`
    ),
  ].join("\n");
}
