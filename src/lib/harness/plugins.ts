/**
 * Skill 路由插件：一切皆插件。首页「立即生成」用插件匹配 Skill，
 * 不走智能体专家访谈 / 大类点选。
 */
import { recallSpecialists } from "@/lib/agent/specialists";
import type { SpecialistId } from "@/lib/agent/types";

export type SkillPlugin = {
  id: SpecialistId;
  /** 越高越优先 */
  score: (text: string) => number;
};

const PLUGINS: SkillPlugin[] = [
  { id: "image.signage", score: (t) => (/店招|门头/.test(t) ? 90 : 0) },
  { id: "image.logo", score: (t) => (/logo|标志|商标/i.test(t) ? 88 : 0) },
  { id: "image.ip", score: (t) => (/\bip\b|吉祥物|表情包|拟人/i.test(t) ? 86 : 0) },
  { id: "image.font", score: (t) => (/字体|艺术字|书法字|标题字/.test(t) ? 84 : 0) },
  { id: "video.avatar", score: (t) => (/数字人|口播稿|数字人口播/.test(t) ? 82 : 0) },
  { id: "video.studio", score: (t) => (/制作大片|宣传片|品牌片|分镜/.test(t) ? 80 : 0) },
  { id: "video.oneline", score: (t) => (/短视频|一句话成片|文生视频|图生视频|成片/.test(t) || /视频/.test(t) ? 70 : 0) },
  { id: "content.official", score: (t) => (/公众号/.test(t) ? 78 : 0) },
  { id: "content.brand", score: (t) => (/品牌推广|卖点提炼/.test(t) ? 72 : 0) },
  { id: "content.social", score: (t) => (/文案|小红书|朋友圈|社媒/.test(t) ? 68 : 0) },
  { id: "research.brand", score: (t) => (/调研|爆款分析/.test(t) ? 66 : 0) },
  { id: "image.product", score: (t) => (/商拍|白底图|商品主图|详情页/.test(t) ? 74 : 0) },
  { id: "image.event", score: (t) => (/海报|包装|伴手礼|宣传单|易拉宝|国潮|中国风/.test(t) ? 60 : 0) },
];

/** 无明确匹配时默认活动视觉（海报/包装），直接生成而非访谈 */
export const DEFAULT_SKILL_PLUGIN: SpecialistId = "image.event";

export function resolveSkillPlugin(text: string): SpecialistId {
  const t = text.trim();
  if (!t) return DEFAULT_SKILL_PLUGIN;

  let best: { id: SpecialistId; score: number } | undefined;
  for (const p of PLUGINS) {
    const s = p.score(t);
    if (s > 0 && (!best || s > best.score)) best = { id: p.id, score: s };
  }
  if (best) return best.id;

  const hits = recallSpecialists(t);
  if (hits[0]) return hits[0].id;
  return DEFAULT_SKILL_PLUGIN;
}

/** 像创作 brief 才直接 generate；寒暄不走工具 */
export function looksLikeGenerateBrief(text: string, hasImages: boolean): boolean {
  if (hasImages) return true;
  const t = text.trim();
  if (t.length >= 8) return true;
  return /设计|海报|包装|logo|ip|文案|视频|生成|做一张|画一|帮我/i.test(t);
}
