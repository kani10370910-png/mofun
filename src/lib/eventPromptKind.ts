/**
 * 活动文生图：成图意图识别（用于历史标签与 user 侧分流提示）。
 * 系统提示词已是「通用优化 + 五类专属」合一；此处只判定启用哪段专属小节。
 */

export const EVENT_SPECIAL_KINDS = ["海报", "长图", "菜单", "易拉宝", "宣传单"] as const;
export type EventSpecialKind = (typeof EVENT_SPECIAL_KINDS)[number];
export type EventPromptKind = EventSpecialKind | "通用";

const KIND_PATTERNS: { kind: EventSpecialKind; re: RegExp }[] = [
  // 更具体的先匹配，避免「宣传海报」只落到海报
  { kind: "易拉宝", re: /易拉宝|展架|x\s*展架|门型展架|立式展板|roll[\s-]?up/i },
  { kind: "宣传单", re: /宣传单|单页|传单|折页|flyer|leaflet|宣传页(?!面)/i },
  { kind: "菜单", re: /菜单|菜谱|价目表|点菜单|menu\b/i },
  { kind: "长图", re: /长图|详情长图|竖版长图|信息长图|滚动长图|种草长图/i },
  { kind: "海报", re: /海报|主视觉|kv\b|key\s*visual|招贴/i },
];

/** 从用户画面描述识别五类成图意图；未命中返回 null */
export function detectEventKindFromInput(input?: string): EventSpecialKind | null {
  const t = (input || "").trim();
  if (!t) return null;
  for (const { kind, re } of KIND_PATTERNS) {
    if (re.test(t)) return kind;
  }
  return null;
}

/**
 * 解析成图意图：
 * - 若 UI/灵感已显式指定五类之一 → 用该类型
 * - 否则从用户输入识别
 * - 仍无法识别 → 「通用」（只走通用画面优化小节）
 */
export function resolveEventPromptKind(sub?: string, input?: string): EventPromptKind {
  const s = (sub || "").trim();
  if ((EVENT_SPECIAL_KINDS as readonly string[]).includes(s)) {
    return s as EventSpecialKind;
  }
  return detectEventKindFromInput(input) ?? "通用";
}
