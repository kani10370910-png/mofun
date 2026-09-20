/**
 * 出图只跟用户点选/填写走，禁止把 Skill 示例、区县知识库口号（如「萧山杨梅」）画进画面。
 */

const SKIP_VALUES = new Set(["你来定", "暂不补充", "无特殊要求", "我来补充", "我自己写", "智能匹配"]);

/** 演示/知识库里常见、但用户没说就不能上画面的专有文案 */
export const DEMO_COPY = [
  "安吉高山白茶",
  "安吉白茶",
  "萧山杨梅",
  "杜家杨梅",
  "共富茶香",
  "白叶绿茶",
  "丰收茶季",
  "明前头采",
  "明前新茶",
  "初夏头茬",
  "核小肉厚",
  "酸甜爆汁",
  "海拔800米",
  "海拔八百米",
  "鲜爽回甘",
];

const PICK_TO_SLOTS: Record<string, string[]> = {
  brandName: ["brandName", "brand"],
  brandDesc: ["brandDesc"],
  brandTone: ["brandTone"],
  brandColor: ["colors"],
  logoStyle: ["style"],
  creativeDesc: ["creativeDesc"],
  eventType: ["format"],
  style: ["style"],
  productName: ["productName", "product"],
  fontText: ["text"],
  fontDir: ["dir"],
  fontCat: ["style"],
  shopName: ["shopName"],
  ratio: ["ratio"],
  count: ["count"],
  model: ["model"],
  duration: ["duration"],
  quality: ["quality"],
  theme: ["theme"],
  format: ["format"],
  scene: ["scene"],
  channel: ["channel"],
  platform: ["platform"],
  industry: ["industry"],
  slogan: ["slogan"],
  pipeline: ["pipeline"],
  audio: ["audio"],
  intent: ["intent"],
  hook: ["hook"],
  cta: ["cta"],
  tone: ["tone"],
  audience: ["audience"],
  keywords: ["keywords"],
  outline: ["outline"],
  length: ["length"],
  advantage: ["advantage", "sellingPoints"],
  goal: ["goal"],
  voice: ["voice"],
  performance: ["performance"],
  genMode: ["genMode"],
  subtitle: ["subtitle"],
  filmType: ["filmType", "type"],
  kb: ["kb"],
  researchType: ["researchType"],
  timeScope: ["timeScope", "length"],
  reportType: ["reportType", "reportFocus"],
  topic: ["topic", "script", "oneLiner", "brief"],
};

const LABEL_TO_KEY: Record<string, string> = {
  品牌名称: "brandName",
  品牌名: "brandName",
  品牌信息: "brandName",
  品牌描述: "brandDesc",
  品牌调性: "brandTone",
  视觉偏好: "brandColor",
  logo风格: "logoStyle",
  "logo 风格": "logoStyle",
  Logo风格: "logoStyle",
  "Logo 风格": "logoStyle",
  画面风格: "style",
  画面描述: "creativeDesc",
  创意描述: "creativeDesc",
  物料类型: "eventType",
  商品名称: "productName",
  产品名: "productName",
  店铺名称: "shopName",
  文字内容: "fontText",
  文字方向: "fontDir",
  文字效果: "fontCat",
  图片尺寸: "ratio",
  出图尺寸: "ratio",
  画面尺寸: "ratio",
  生成数量: "count",
  生图模型: "model",
  视频模型: "model",
  时长: "duration",
  视频比例: "ratio",
  视频质量: "quality",
  视频风格: "style",
  店招风格: "style",
  文案风格: "style",
  场景预设: "scene",
  场景模板: "scene",
  店招类型: "channel",
  "平台 / 门头类型": "platform",
  推广平台: "platform",
  发布平台: "platform",
  行业: "industry",
  副文案: "slogan",
  生成方式: "pipeline",
  同时生成声音: "audio",
  今天推什么: "intent",
  钩子类型: "hook",
  行动号召: "cta",
  语气: "tone",
  目标人群: "audience",
  "目标市场/人群": "audience",
  核心关键词: "keywords",
  内容大纲: "outline",
  字数范围: "length",
  产品核心优势: "advantage",
  营销目标: "goal",
  选择音色: "voice",
  角色表现: "performance",
  生成模式: "genMode",
  字幕: "subtitle",
  片子类型: "filmType",
  一句话需求: "topic",
  配音内容: "topic",
  文章标题: "topic",
  本地增强: "kb",
  调研类型: "researchType",
  调研主体名称: "topic",
  时间跨度: "timeScope",
  报告类型: "reportType",
  成片描述: "creativeDesc",
  品牌名称及产品类型: "brandName",
};

function meaningful(v?: string | null): boolean {
  const t = (v || "").trim();
  return Boolean(t) && !SKIP_VALUES.has(t);
}

export function userSaid(slots: Record<string, string>, phrase: string): boolean {
  const p = phrase.trim();
  if (!p) return false;
  return Object.values(slots).some((v) => (v || "").includes(p));
}

export function userBrandName(slots: Record<string, string>): string {
  for (const k of ["brandName", "brand", "shopName", "productName", "text"]) {
    const v = (slots[k] || "").trim();
    if (meaningful(v) && v.length <= 24 && !/请按以下信息生成/.test(v)) return v;
  }
  return "";
}

/** 问卷点选写入出图槽位，不覆盖用户已填 */
export function applySkillPicksToSlots(
  slots: Record<string, string>,
  picks: Record<string, string>,
): Record<string, string> {
  const next = { ...slots };
  for (const [key, raw] of Object.entries(picks)) {
    const v = (raw || "").trim();
    if (!meaningful(v)) continue;
    const targets = [...new Set([key, ...(PICK_TO_SLOTS[key] || [key])])];
    for (const slot of targets) {
      if (!next[slot] || !meaningful(next[slot])) next[slot] = v;
    }
  }
  const brand = userBrandName(next);
  const desc = [next.brandDesc, next.creativeDesc, next.brandTone].filter(meaningful).join("，");
  if (brand && !meaningful(next.theme)) {
    next.theme = desc ? `${brand}，${desc}` : brand;
  }
  if (brand && (!meaningful(next.creativeDesc) || (/请按以下信息生成/.test(next.creativeDesc) && next.creativeDesc.length < 40))) {
    next.creativeDesc = desc || brand;
  }
  if (meaningful(next.creativeDesc) && !meaningful(next.oneLiner)) next.oneLiner = next.creativeDesc;
  return next;
}

/** 从「请按以下信息生成。品牌名称：山间纪；…」抽出字段 */
export function parseLabeledFields(text: string): Record<string, string> {
  const picks: Record<string, string> = {};
  const body = text.replace(/^请按以下信息生成[。.]?/, "").trim();
  const parts = body.split(/[；;]/);
  let brandInfoIndex = 0;
  for (const part of parts) {
    const m = part.match(/^([^：:]{2,16})[：:](.+)$/);
    if (!m) continue;
    const label = m[1].trim().replace(/\s+/g, "").toLowerCase();
    const value = m[2].trim();
    if (!meaningful(value)) continue;
    let key = LABEL_TO_KEY[m[1].trim()] || LABEL_TO_KEY[label];
    if (m[1].trim() === "品牌信息") {
      key = brandInfoIndex === 0 ? "brandName" : "brandDesc";
      brandInfoIndex += 1;
    }
    if (key) picks[key] = value;
  }
  return picks;
}

function userCorpus(slots: Record<string, string>): string {
  return Object.values(slots).join("\n");
}

/** 扩写结果里若混入用户没说过的示例品牌，改回用户品牌名 */
export function stripUnmentionedDemos(text: string, slots: Record<string, string>): string {
  const brand = userBrandName(slots);
  const said = userCorpus(slots);
  let out = text;
  for (const demo of DEMO_COPY) {
    if (!out.includes(demo)) continue;
    if (said.includes(demo)) continue;
    out = out.split(demo).join(brand || "该品牌");
  }
  return out;
}

/** 出图硬约束：画面文字只跟用户走 */
export function lockImagePrompt(
  prompt: string,
  slots: Record<string, string>,
  kind?: "logo" | "poster",
): string {
  const cleaned = stripUnmentionedDemos(prompt, slots);
  const brand = userBrandName(slots);
  const banned = DEMO_COPY.filter((d) => !userSaid(slots, d));
  const lines = [
    cleaned,
    brand ? `画面上的品牌名/主标题必须是「${brand}」，不得改写成其他特产名或示例品牌。` : "",
    banned.length
      ? `用户未提及下列词，严禁作为画面标题、副标题或包装文字：${banned.join("、")}。`
      : "",
    "地域知识与 Lora 只可影响配色、光影、风景氛围，不得替换用户品牌与文案。",
    kind === "logo"
      ? "这是平面 Logo：白底、标志居中，禁止人物采茶海报、禁止活动主视觉大场景。"
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}

const PROMPT_META_CUT =
  /(?:Count characters|Let's count|Need under|Need ensure|字数统计|字符统计|确保没有系统标签)\b/i;
const PROMPT_DRAFT_HEAD =
  /(?:^|\n)\s*(?:Draft|草稿|最终稿|优化后(?:的)?(?:描述|prompt|提示词)?|最终(?:prompt|描述)|Prompt)\s*[:：]\s*/i;
const PROMPT_REASON =
  /我们需要回答用户|直接输出优化后|必须满足[：:]|不解释|不标题|优化为AI图像|#+\s*优化规则|#+\s*输出格式|但规则\d+|冲突时如何/;

function looksLikePromptReasoning(text: string): boolean {
  return PROMPT_REASON.test(text) || /Count characters|Let's count|Draft\s*:/i.test(text);
}

function isVisualPrompt(text: string): boolean {
  const t = text.trim();
  if (t.length < 20 || t.length > 900) return false;
  if (/我们需要回答用户|Count characters|Let's count|#+\s*优化规则/.test(t)) return false;
  const cn = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  return cn >= 16 && cn / Math.max(t.length, 1) > 0.4;
}

/** 从模型扩写结果里只留可出图的提示词，丢掉思考、Draft 标题和字数自检。 */
export function extractOptimizedPrompt(text: string, fallback = ""): string {
  let t = (text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/^[\s\S]*?<\/think>\s*/i, "")
    .replace(/<think>[\s\S]*$/i, "")
    .trim();
  if (!t) return fallback.trim();

  const draftParts = t.split(PROMPT_DRAFT_HEAD);
  if (draftParts.length >= 2) t = draftParts.slice(1).join("\n").trim();
  t = t.split(PROMPT_META_CUT)[0].trim();

  if (looksLikePromptReasoning(t) && !isVisualPrompt(t)) {
    const key = "画面仅一个";
    const lastIdx = t.lastIndexOf(key);
    if (lastIdx >= 0) t = t.slice(lastIdx).trim();
    else {
      const paras = t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      t = paras.find((p) => isVisualPrompt(p)) || t;
    }
  }

  t = t
    .split(/\n{2,}/)[0]
    .replace(/^(?:Draft|草稿|优化后|Prompt)\s*[:：]\s*/i, "")
    .replace(/^["「]|["」]$/g, "")
    .trim();
  t = t.split(PROMPT_META_CUT)[0].trim();

  if (!isVisualPrompt(t)) return fallback.trim();
  return t;
}
