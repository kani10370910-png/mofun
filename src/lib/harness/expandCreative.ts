/**
 * 问卷确认前：按各功能页同一套扩写 scene / 提示词，把创意描述展开后再展示。
 */
import { collectGenerate } from "@/lib/useGenerateStream";
import { kbFields } from "@/lib/regionEnhance";
import { buildLogoStylePrompt } from "@/lib/logoStylePrompt";
import { loadLogoStyles } from "@/lib/opsCatalog";
import { extractOptimizedPrompt, lockImagePrompt, stripUnmentionedDemos } from "./userCopy";
import type { GenerateRequest } from "@/lib/types";

const SKIP = new Set(["暂不补充", "你来定", "无特殊要求", "我来补充", "我自己写"]);

function pick(picks: Record<string, string>, ...keys: string[]) {
  for (const k of keys) {
    const v = (picks[k] || "").trim();
    if (v && !SKIP.has(v)) return v;
  }
  return "";
}

function specOf(specialistId?: string, skillId?: string) {
  const s = `${specialistId || ""} ${skillId || ""}`.toLowerCase();
  if (/logo/.test(s)) return "logo";
  if (/\bip\b/.test(s)) return "ip";
  if (/event|海报|物料/.test(s)) return "event";
  if (/product|商拍/.test(s)) return "product";
  if (/font|字体/.test(s)) return "font";
  if (/signage|店招|门头/.test(s)) return "signage";
  if (/oneline|一句话/.test(s)) return "oneline";
  if (/image\./.test(specialistId || "")) return "associate";
  return "";
}

export async function expandSkillCreativeDesc(params: {
  specialistId?: string;
  skillId?: string;
  picks: Record<string, string>;
}): Promise<{ display: string; prompt: string }> {
  const raw = pick(params.picks, "creativeDesc", "brandDesc", "topic");
  const brand = pick(params.picks, "brandName", "shopName", "productName", "fontText");
  const style = pick(params.picks, "logoStyle", "style", "fontCat");
  const ratio = pick(params.picks, "ratio") || "1:1";
  const kind = specOf(params.specialistId, params.skillId);
  if (!kind && !raw) return { display: "", prompt: "" };

  let req: GenerateRequest | null = null;

  if (kind === "logo") {
    await loadLogoStyles();
    const seed = buildLogoStylePrompt(style || "智能匹配", brand || "品牌", raw);
    req = { scene: "t2i-associate", input: seed, skipWorkflow: true, ...kbFields(true) };
  } else if (kind === "ip") {
    const colors = pick(params.picks, "colors", "brandColor");
    req = {
      scene: "ip",
      description: raw || brand || "品牌吉祥物",
      preferredColors: colors ? colors.split(/[/、,+与和]+/).map((x) => x.trim()).filter(Boolean) : undefined,
      canvasSize: ratio,
      skipWorkflow: true,
      ...kbFields(true),
    };
  } else if (kind === "event") {
    req = {
      scene: "t2i-event",
      input: raw || `${brand} ${pick(params.picks, "eventType", "format") || "海报"}`.trim(),
      eventSub: pick(params.picks, "eventType", "format") || "海报",
      imageRatio: ratio,
      artStyle: style || "智能匹配",
      skipWorkflow: true,
      ...kbFields(true),
    };
  } else if (kind === "product") {
    req = {
      scene: "t2i-product",
      input: raw || `${pick(params.picks, "productName") || brand} ${pick(params.picks, "productType") || "白底主图"}`.trim(),
      eventSub: pick(params.picks, "productType") || "白底主图",
      imageRatio: ratio,
      skipWorkflow: true,
      ...kbFields(true),
    };
  } else if (kind === "font") {
    req = {
      scene: "t2i-associate",
      input: `艺术字「${pick(params.picks, "fontText") || raw}」，文字方向${pick(params.picks, "fontDir") || "横向"}，效果${style || "书法体"}，单行文字居中，高清标题字效`,
      skipWorkflow: true,
      ...kbFields(true),
    };
  } else if (kind === "signage") {
    const channel = pick(params.picks, "channel") || "线上店招";
    req = {
      scene: "t2i-associate",
      input: `${channel}，店名「${pick(params.picks, "shopName") || brand}」清晰可读，行业${pick(params.picks, "industry")}，风格${style || "新中式"}，${channel.includes("门头") ? "实景门头招牌" : "宽幅横幅构图"}`,
      skipWorkflow: true,
      ...kbFields(true),
    };
  } else if (kind === "oneline" || kind === "associate" || raw) {
    req = {
      scene: "t2i-associate",
      input: raw || `${brand} ${style}`.trim(),
      skipWorkflow: true,
      ...kbFields(true),
    };
  }

  if (!req) return { display: raw, prompt: raw };

  const expanded = (await collectGenerate(req)).trim();
  const display = extractOptimizedPrompt(
    stripUnmentionedDemos(expanded || raw, params.picks).trim(),
    raw,
  );
  if (!display) return { display: raw, prompt: raw };
  const lockKind = kind === "logo" ? "logo" : kind === "event" ? "poster" : undefined;
  return { display, prompt: lockImagePrompt(display, params.picks, lockKind) };
}
