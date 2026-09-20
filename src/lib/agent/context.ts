/**
 * A · 上下文装配（Harness）
 * 对齐 Openclaw 三段式：SOUL（人设）/ AGENTS（规约）/ TOOLS（工具表）
 * 内联常量，不预加载全部专家说明书；按当前 Specialist 按需挂载。
 */
import { getSkill, skillCatalogBlock } from "./skills";
import { getSpecialist } from "./specialists";
import { readBrandMemory } from "./memory";
import type { AgentRuntimeState, SpecialistDef } from "./types";

/** stable：跨轮次不变，利于 cache */
export const SOUL_SEGMENT = [
  "你是「小墨」，魔方智绘（MOFUN）的创意助手。",
  "服务县域农文旅品牌：农产品、乡村旅游、地域文化。像会设计的同事，不报菜单、不堆营销空话。",
  "用户已说清的需求必须接住；发送只对齐需求，出图须等确认。",
  "用户可见回复不要展示 phase、Skill、槽位等内部标签。",
].join("\n");

export const AGENTS_SEGMENT = [
  "【硬规约 · 由 harness 执法，勿口头绕过】",
  "1. 不能假装已经生成图片或文案；失败必须说明原因并给出重试。",
  "2. 视觉类须经方向策划确认后才能出图。",
  "3. 已填槽位不要重复追问。",
  "4. 首页对话不强制跳转功能页；在对话内完成理解与交付。",
].join("\n");

export const TOOLS_SEGMENT = [
  "【可用工具】",
  "- propose：按当前 Skill 生成方向提案",
  "- generate：按当前 Skill 出文案或文生图（须过闸门）",
  "- memory_read / memory_write：读写品牌记忆（仅用户确认事实）",
  "【Skill】与工作台功能一一对应，由 harness 按专家/槽位/显式 skillId 解析后调用。",
].join("\n");

export type AssembledContext = {
  stable: string;
  context: string;
  volatile: string;
  /** 拼接后的完整装配（调试 / 未来 LLM 路由用；当前 execute 仍用原 brief 以保生成效果） */
  full: string;
};

function specialistContextBlock(spec: SpecialistDef | undefined): string {
  if (!spec) return "【当前专家】未选定";
  const skill = getSkill(spec.id);
  const slotLines = spec.slots
    .slice(0, 12)
    .map((s) => `  - ${s.key}（P${s.priority}/G${s.group}）：${s.label}`)
    .join("\n");
  const skillLines = skillCatalogBlock(spec.id);
  return [
    `【当前专家】${spec.label}（${spec.id}）`,
    skill ? `【默认 Skill】${skill.id}「${skill.name}」：${skill.description}` : "",
    skill ? `【闸门策略】${skill.gatePolicy} · scene=${skill.generateScene || skill.proposeScene || "-"}` : "",
    skillLines,
    "【槽位表】",
    slotLines || "  （无）",
  ]
    .filter(Boolean)
    .join("\n");
}

function volatileBlock(state: AgentRuntimeState, userText?: string): string {
  const mem = readBrandMemory();
  const filled = Object.entries(state.slots)
    .filter(([, v]) => Boolean(v))
    .map(([k, v]) => `  - ${k}=${v}`)
    .join("\n");
  const brandBits = mem
    ? [
        mem.brandName && `品牌=${mem.brandName}`,
        mem.industry && `行业=${mem.industry}`,
        mem.style && `风格=${mem.style}`,
        mem.colors && `色系=${mem.colors}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return [
    `【phase】${state.phase}`,
    state.planConfirmed ? "【策划】已确认" : "【策划】未确认",
    state.skillId ? `【skillId】${state.skillId}` : "",
    "【已填槽】（仅用户本轮点选/输入过的才算已定；不要把选项示例当成已选）",
    filled || "  （空）",
    brandBits
      ? `【本对话品牌记忆·仅供参考】${brandBits}\n（仅限当前对话；未点选前禁止直接说「咱们××」）`
      : "",
    state.refVisionNotes?.trim()
      ? `【参考图视觉摘要】\n${state.refVisionNotes.trim()}`
      : state.refImages?.length
        ? `【参考图】用户已上传 ${state.refImages.length} 张（摘要待识别）`
        : "",
    userText?.trim() ? `【本轮用户】${userText.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 装配本轮上下文：stable + 当前专家槽表 + 本轮可变段 */
export function assembleContext(
  state: AgentRuntimeState,
  userText?: string
): AssembledContext {
  const spec = state.specialistId ? getSpecialist(state.specialistId) : undefined;
  const stable = [SOUL_SEGMENT, AGENTS_SEGMENT, TOOLS_SEGMENT].join("\n\n");
  const context = specialistContextBlock(spec);
  const volatile = volatileBlock(state, userText);
  return {
    stable,
    context,
    volatile,
    full: [stable, context, volatile].join("\n\n---\n\n"),
  };
}
