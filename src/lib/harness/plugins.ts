/**
 * Skill 路由插件：一切皆插件。首页「立即生成」用插件匹配 Skill，
 * 不走智能体专家访谈 / 大类点选。
 * 启用列表由运营端 Harness 设置控制；拉取失败时回退本地默认。
 */
import type { SpecialistId } from "@/lib/agent/types";
import { getHarnessCache, intentMatchText } from "./opsConfig";

export type SkillPlugin = {
  id: SpecialistId;
  /** 越高越优先 */
  score: (text: string) => number;
  body?: string;
};

const LOCAL_PLUGINS: SkillPlugin[] = [
  { id: "image.signage", score: (t) => (/店招|门头/.test(t) ? 90 : 0) },
  { id: "image.logo", score: (t) => (/logo|标志|商标/i.test(t) ? 88 : 0) },
  { id: "image.ip", score: (t) => (/\bip\b|ip形象|ip 形象|吉祥物|表情包|拟人/i.test(t) ? 86 : 0) },
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

function compilePlugins(): { plugins: SkillPlugin[]; fallback: SpecialistId } {
  const cfg = getHarnessCache();
  const fallback =
    cfg?.ok && cfg.defaultSkill ? ((cfg.defaultSkill as SpecialistId) || DEFAULT_SKILL_PLUGIN) : DEFAULT_SKILL_PLUGIN;
  if (!cfg?.ok || !cfg.skills) return { plugins: LOCAL_PLUGINS, fallback };
  const plugins: SkillPlugin[] = [];
  for (const item of cfg.skills) {
    try {
      const re = new RegExp(item.pattern, item.flags || undefined);
      const score = item.score || 1;
      const id = item.id as SpecialistId;
      plugins.push({ id, body: item.body, score: (t) => (re.test(t) ? score : 0) });
    } catch {
      /* skip invalid pattern */
    }
  }
  const ids = plugins.map((p) => p.id);
  return { plugins, fallback: ids.length && !ids.includes(fallback) ? ids[0] : fallback };
}

export function resolveSkillPlugin(text: string): SpecialistId {
  return matchedLocalSkillId(text) || compilePlugins().fallback;
}

/** 品牌大类点选结果落到具体 Skill，避免用户已说 IP 还再问一次。 */
export function skillIdFromTaskPick(pick: string): SpecialistId | undefined {
  const t = (pick || "").toLowerCase();
  if (!t) return undefined;
  if (/\bip\b|吉祥物|表情包|拟人|ip\s*形象/.test(t)) return "image.ip";
  if (/logo|标志|商标/.test(t)) return "image.logo";
  if (/海报|招贴|主视觉/.test(t)) return "image.event";
  if (/商拍|白底|主图/.test(t)) return "image.product";
  if (/店招|门头/.test(t)) return "image.signage";
  if (/字体|艺术字/.test(t)) return "image.font";
  return undefined;
}

/** 明确命中某一块（IP / Logo / 海报等）；没命中则不返回，避免误当成默认海报。 */
export function matchedLocalSkillId(text: string): SpecialistId | undefined {
  const t = intentMatchText(text);
  if (!t) return undefined;
  const { plugins } = compilePlugins();
  const scoreBest = (list: SkillPlugin[]) => {
    let best: { id: SpecialistId; score: number } | undefined;
    for (const p of list) {
      const s = p.score(t);
      if (s > 0 && (!best || s > best.score)) best = { id: p.id, score: s };
    }
    return best?.id;
  };
  return scoreBest(plugins) || scoreBest(LOCAL_PLUGINS);
}

const GREET_RE = /^(你好|您好|嗨|哈喽|在吗|谢谢|早上好|中午好|晚上好)[！!。.~～]*$/;

/** 寒暄/答谢，不按「需求不清」去追问卡片 */
export function isCasualChat(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (GREET_RE.test(t)) return true;
  return /^(谢谢|感谢|收到|嗯嗯|好的谢谢)[！!。.~～]*$/.test(t);
}
const GENERIC_INTENT_RE =
  /^(请)?(帮我)?(生成|设计|做|画|来)(一个|一张|一份|一套)?(品牌设计|海报|包装|logo|标志|ip|IP|图片|视觉)?[吧啊呀吗？?。.!！]*$/i;
const DETAIL_CUES =
  /包装|海报|logo|店招|伴手礼|国潮|中国风|主色|配色|竖版|横版|方形|品牌名|文案|字体|质感|场景|礼盒|茶叶|萝卜|民宿|食堂|吉祥物|参考|青绿|烫金|插画|摄影/i;

const BRAND_CATEGORY_RE = /品牌设计|品牌视觉|品牌形象|视觉识别|品牌VI|全套VI/;
const BRAND_ONLY_RE = /^(请)?(帮我|给我|我想|我要)?(做|设计|来|生成)(一下|一个|一套|一些|一张|一份)?品牌[吧啊呀吗？?。.!！]*$/;
const BRAND_ARTIFACT_RE =
  /logo|标志|商标|海报|包装|店招|门头|商拍|字体|艺术字|吉祥物|表情包|拟人|宣传单|易拉宝|长图|菜单|主图|详情页|礼盒|包装盒|(?:^|[^\w])ip(?:$|[^\w])/i;

/** 只说了「品牌设计」大类，还没点到 IP / Logo / 海报等具体一块。 */
export function isVagueBrandCategory(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (!BRAND_CATEGORY_RE.test(t) && !BRAND_ONLY_RE.test(t)) return false;
  if (BRAND_ARTIFACT_RE.test(t)) return false;
  if (/(?:^|[^\w])ip(?:$|[^\w])/i.test(t)) return false;
  return true;
}

/** 从「萧山杨梅品牌设计」里抽出品牌名，点选后带进下一轮。 */
export function extractBrandHint(text: string): string {
  const t = text
    .replace(/[。.!！？?~～、，,\s]/g, "")
    .replace(/品牌设计|品牌视觉|品牌形象|视觉识别|品牌VI|全套VI/g, "")
    .replace(/(请)?(帮我|给我|我想|我要|帮忙)/g, "")
    .replace(/做一下|来一下|设计一下/g, "")
    .replace(/做一个|做一套|做一些|做一张|做一份/g, "")
    .replace(/设计一个|生成一个|来一个/g, "")
    .replace(/做|设计|生成|来/g, "")
    .replace(/一个|一套|一些|一张|一份/g, "")
    .replace(/的$/g, "")
    .trim();
  if (t.length < 2 || t.length > 16) return "";
  if (BRAND_ARTIFACT_RE.test(t) || /^(品牌|视觉|形象)$/.test(t)) return "";
  return t;
}

/** 需求是否具体到可以出图。空泛的「生成一个品牌设计」不算。 */
export function isDetailedBrief(text: string, hasImages = false): boolean {
  const t = text.trim();
  if (!t) return false;
  if (GREET_RE.test(t) || GENERIC_INTENT_RE.test(t) || isVagueBrandCategory(t)) return false;
  if (t.length < 10) return false;
  if (DETAIL_CUES.test(t)) return true;
  if (hasImages && t.length >= 8) return true;
  return t.length >= 24;
}

/** @deprecated 请用 isDetailedBrief；保留以免旧调用误把短句当作出图 brief */
export function looksLikeGenerateBrief(text: string, hasImages: boolean): boolean {
  return isDetailedBrief(text, hasImages);
}
