import type { SpecialistDef } from "./types";

/** 按气质给建议色（无 LLM 时的落地模板，对齐 Miora 方向策划） */
export function suggestColors(style?: string): { hex: string[]; label: string } {
  const s = style || "";
  if (/新中式|图文插画|经典徽章/.test(s))
    return { hex: ["#C41E3A", "#1A1A1A", "#F5E6C8"], label: "Guochao Classic" };
  if (/图文简约|文字logo|字母logo|智能匹配|简约高级/.test(s))
    return { hex: ["#222222", "#FFFFFF", "#4A90A4"], label: "Modern Minimal" };
  if (/清新产地|自然田园/.test(s))
    return { hex: ["#2D5836", "#F5F0E8", "#A8C5A0"], label: "Organic Natural" };
  if (/促销爆款/.test(s))
    return { hex: ["#E11D48", "#FEF2F2", "#FBBF24"], label: "Promo Pop" };
  if (/草本|自然|田园/.test(s))
    return { hex: ["#2D5836", "#F5F0E8", "#A8C5A0"], label: "Organic Natural" };
  if (/可爱|Q\s*版|萌/.test(s))
    return { hex: ["#FF8FAB", "#FFF5F7", "#7EC8E3"], label: "Soft Cute" };
  if (/国潮|国风/.test(s))
    return { hex: ["#C41E3A", "#1A1A1A", "#F5E6C8"], label: "Guochao Classic" };
  if (/潮酷|轻奢/.test(s))
    return { hex: ["#1C1C1C", "#D4AF37", "#F4F4F4"], label: "Quiet Luxury" };
  if (/温馨/.test(s))
    return { hex: ["#C4A484", "#FFF8F0", "#5C4033"], label: "Warm Cottage" };
  if (/书法|水墨/.test(s))
    return { hex: ["#1A1A1A", "#E8E0D5", "#8B4513"], label: "Ink Calligraphy" };
  if (/简洁|现代/.test(s))
    return { hex: ["#222222", "#FFFFFF", "#4A90A4"], label: "Modern Minimal" };
  return { hex: ["#2F5D50", "#F7F4EF", "#C2A878"], label: "Brand Neutral" };
}

function resolveColorLine(slots: Record<string, string>): { hex: string[]; label: string } {
  const presetMap: Record<string, { hex: string[]; label: string }> = {
    自然草本绿: { hex: ["#2D5836", "#F5F0E8", "#A8C5A0"], label: "Organic Natural" },
    国潮红金: { hex: ["#C41E3A", "#1A1A1A", "#F5E6C8"], label: "Guochao Classic" },
    柔粉可爱: { hex: ["#FF8FAB", "#FFF5F7", "#7EC8E3"], label: "Soft Cute" },
    轻奢黑金: { hex: ["#1C1C1C", "#D4AF37", "#F4F4F4"], label: "Quiet Luxury" },
  };
  if (slots.colors && presetMap[slots.colors]) return presetMap[slots.colors];
  if (slots.colors && /#/.test(slots.colors)) {
    return {
      hex: slots.colors.split(/[/／]/).map((s) => s.trim()).filter(Boolean),
      label: "Custom",
    };
  }
  return suggestColors(slots.style || slots.colors);
}

function sloganDraft(slots: Record<string, string>): string {
  const brand = slots.brandName || slots.brand || slots.shopName || "品牌";
  const style = slots.style || slots.colors || slots.creativeDesc || "";
  if (/草本|自然|清新产地|绿/.test(style)) return `在${brand}，找回自然的呼吸感`;
  if (/可爱|Q|萌|柔粉/.test(style)) return `${brand}，陪你每一天的小心思`;
  if (/国潮|国风|新中式|经典徽章|红金/.test(style)) return `${brand} · 新中式美学`;
  if (/潮酷|轻奢|简约高级|黑金/.test(style)) return `${brand}，低调的锋芒`;
  if (/图文插画|图文简约/.test(style)) return `${brand}，一眼就记住`;
  return `${brand}，把好感做成记忆`;
}

/** 槽齐后的「方向策划」文本（确认闸门，再出图） */
export function buildDirectionPlan(spec: SpecialistDef, slots: Record<string, string>): string {
  const colors = resolveColorLine(slots);
  const hexLine = colors.hex.join(" / ") || slots.colors || "";
  const brand = slots.brandName || slots.brand || slots.shopName || "（待定）";

  if (spec.id === "image.ip") {
    return [
      "【IP 方向策划】（对齐功能页：创意描述 / 偏好颜色 / 画面尺寸 / 参考）",
      "",
      `· 创意描述：${slots.creativeDesc || "（待补充）"}`,
      `· 偏好颜色：${hexLine || slots.colors || "智能匹配"}（${colors.label}）`,
      `· 画面尺寸：${slots.ratio || "正方形 1:1"}`,
      `· 参考图：${slots.refHint || "暂不上传"}`,
      `· Slogan 草案：${sloganDraft(slots)}`,
      "",
      "确认后开始生成主视觉；也可先要 3 个方案再选。",
    ].join("\n");
  }

  if (spec.id === "image.logo") {
    const desc =
      !slots.creativeDesc || slots.creativeDesc === "无特殊要求" || slots.creativeDesc === "我来补充"
        ? "（选填，无补充）"
        : slots.creativeDesc;
    return [
      "【Logo 方向策划】（对齐功能页：品牌名称 / logo 风格 / 创意描述）",
      "",
      `· 品牌名称：${brand}`,
      `· logo 风格：${slots.style || "智能匹配"}`,
      `· 创意描述：${desc}`,
      `· 建议色系：${hexLine}（${colors.label}）`,
      `· Slogan 草案：${sloganDraft(slots)}`,
      "",
      "确认方案后即可出 Logo 概念图。",
    ].join("\n");
  }

  if (spec.id === "image.event") {
    return [
      "【活动视觉方向】（对齐功能页：成图类型 / 画面描述 / 画面风格）",
      "",
      `· 成图类型：${slots.format || "海报"}`,
      `· 画面描述：${slots.theme || brand}`,
      `· 画面风格：${slots.style || "智能匹配"}`,
      `· 图片尺寸：${slots.ratio || "竖版3:4"}`,
      `· 建议色系：${hexLine}`,
      "",
      "确认后开始出图。",
    ].join("\n");
  }

  if (spec.id === "image.signage") {
    return [
      "【店招方向】（对齐功能页：渠道 / 店铺名称 / 行业 / 风格）",
      "",
      `· 渠道：${slots.channel || "线上店招"}`,
      `· 店铺名称：${brand}`,
      `· 行业：${slots.industry || "茶叶"}`,
      `· 风格：${slots.style || "新中式"}`,
      `· Slogan：${slots.slogan && slots.slogan !== "暂无" ? slots.slogan : "（选填）"}`,
      `· 建议色系：${hexLine}`,
      "",
      "确认后生成店招效果。",
    ].join("\n");
  }

  if (spec.id === "image.font") {
    return [
      "【字体方向】（对齐功能页：文字内容 / 文字方向 / 文字效果）",
      "",
      `· 文字内容：${slots.text || brand}`,
      `· 文字方向：${slots.dir || "横向"}`,
      `· 文字效果分类：${slots.style || "书法体"}`,
      `· 建议色系：${hexLine}`,
      "",
      "确认后生成艺术字效果。",
    ].join("\n");
  }

  // 文案 / 视频 / 调研：简短收敛卡
  const lines = Object.entries(slots)
    .filter(([k, v]) => v && k !== "mode")
    .map(([k, v]) => `· ${k}：${v}`);
  return [
    `【${spec.label} · 方案确认】`,
    "",
    ...lines.slice(0, 8),
    "",
    "确认后开始生成。",
  ].join("\n");
}

export function needsDirectionGate(specId: string): boolean {
  return (
    specId === "image.ip" ||
    specId === "image.logo" ||
    specId === "image.event" ||
    specId === "image.signage" ||
    specId === "image.font"
  );
}
