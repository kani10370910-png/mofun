/**
 * 从运营端 Skill 抽出可执行的对话流程。
 * 完整 SKILL.md 往往后半是 image_gen 模板，不能整篇丢给模型。
 */
import type { AgentAction, AskGroupItem } from "@/lib/agent/types";
import { isVagueBrandCategory } from "./plugins";
import type { HarnessSkillItem, SkillAskStep } from "./opsConfig";

const FALLBACK_ASK =
  "按品牌设计流程，先做品牌探索。请告诉我：\n1. 品牌名称是什么？\n2. 一句话描述你的品牌？\n3. 希望传达什么感觉？（选 3 个词，如温暖 / 自然 / 高端 / 活泼 / 复古 / 极简）\n4. 有偏好的颜色吗？";

const DUMP_MARKERS = [
  /检查是否提到/,
  /系统说下面卡片/,
  /不要标题[、,]?\s*不要引号/,
  /开场必须/,
  /不能列清单口吻/,
  /只输出对用户说的话/,
  /按照要求[：:]/,
  /禁止对用户说/,
  /内部标签/,
  /不要提\s*phase/i,
  /TOOL:\s*(generate|propose)/i,
  /问卷举例/,
  /计划审查/,
  /深度思考/,
  /不要复述/,
  /禁止套/,
  /不能模板/,
  /检查是否/,
  /卡片还要补/,
  /这是\s*\d+\s*句/,
  /<\/think>/i,
  /需要直接输出/,
  /系统标签/,
  /我们需要回答用户/,
  /Count characters/i,
  /\bDraft\s*:/i,
];

function looksLikeInternalDump(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const hits = DUMP_MARKERS.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
  if (hits >= 2) return true;
  if (hits >= 1 && t.length > 220) return true;
  if (/示例[：:]/.test(t) && /检查是否|这是\s*\d+\s*句/.test(t)) return true;
  return false;
}

function extractQuotedSpeech(text: string): string {
  const m = text.match(/[「“"]([^「“"」”\n]{16,500})[」”"]/);
  return (m?.[1] || "").trim();
}

/** 对用户可见文案：去掉内部流程名，避免念出 Skill。 */
export function sanitizeUserSpeech(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/^[\s\S]*?<\/think>\s*/i, "")
    .replace(/<think>[\s\S]*$/i, "")
    .replace(/按本\s*Skill/gi, "")
    .replace(/按\s*[^，。；\n]{0,24}?\s*Skill/gi, "")
    .replace(/\bSkills?\b/gi, "")
    .replace(/当前技能|技能包|技能插件/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/，{2,}/g, "，")
    .replace(/好的，\s+/g, "好的，")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 模型若把规则/自检写进回复，只抽出真正对用户说的话。 */
export function extractUserFacingSpeech(text: string, fallback = ""): string {
  const cleaned = sanitizeUserSpeech(text);
  if (!cleaned) return fallback.trim();
  if (!looksLikeInternalDump(cleaned)) return cleaned;
  const quoted = extractQuotedSpeech(cleaned);
  if (quoted && !looksLikeInternalDump(quoted) && quoted.length <= 480) {
    return sanitizeUserSpeech(quoted);
  }
  const paras = cleaned
    .split(/\n{2,}/)
    .map((p) => p.replace(/^[「“"]|[」”"]$/g, "").trim())
    .filter(Boolean);
  for (let i = paras.length - 1; i >= 0; i--) {
    const p = paras[i];
    if (p.length >= 16 && p.length <= 400 && /[你我吗？?]/.test(p) && !looksLikeInternalDump(p)) {
      return sanitizeUserSpeech(p);
    }
  }
  return fallback.trim();
}

function sliceUntil(body: string, end: RegExp): string {
  const m = end.exec(body);
  return (m ? body.slice(0, m.index) : body).trim();
}

/** 人设 + 工作流程第一、二阶段（不含第三阶段工具模板、不含演示里的示例品牌） */
export function focusSkillBody(body: string): string {
  const t = body.trim();
  if (!t) return "";
  const noDemo = sliceUntil(t, /使用示例|完整流程演示/);
  const head = sliceUntil(noDemo, /🔷\s*第三阶段|###?\s*第三阶段|资产生成（工具调用）/);
  const focused = head.length > 200 ? head : noDemo;
  return focused.slice(0, 4500);
}

function firstAgentSpeech(block: string): string {
  const start = block.indexOf("智能体：");
  if (start < 0) return "";
  const from = start + "智能体：".length;
  const userIdx = block.indexOf("\n用户：", from);
  const end = userIdx >= 0 ? userIdx : block.indexOf("━━━━━━━━", from);
  return (end > from ? block.slice(from, end) : block.slice(from)).trim();
}

/** Skill 示例里第一阶段智能体说的原话；抽不到则按「收集信息」拼问句 */
export function openingAskFromSkill(body: string): string {
  const t = body.trim();
  if (!t) return FALLBACK_ASK;

  const demo = t.split(/完整流程演示/)[1] || "";
  const spoken = firstAgentSpeech(demo);
  if (spoken.length >= 20 && spoken.length <= 800 && /[？?]/.test(spoken)) {
    return spoken.replace(/^(好的[！!]?\s*)+/, "好的，先确认信息。");
  }

  const stage1 = t.match(/第一阶段[：:]?[^\n]*([\s\S]*?)(?:🔷\s*第二阶段|第二阶段)/);
  const collect = (stage1?.[1] || t).match(/收集信息[：:]([\s\S]*?)(?:输出[：:]|🔷|$)/);
  const lines = (collect?.[1] || "")
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length >= 2 && l.length <= 80);
  if (lines.length) {
    return `好的，先确认这些信息：\n${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}`;
  }
  return FALLBACK_ASK;
}

function option(key: string, i: number, value: string, label: string, custom = false): AgentAction {
  return {
    id: `${key}-${i}`,
    label,
    kind: "option",
    slotKey: key,
    value: custom ? "我自己写" : value,
  };
}

function toAskGroups(steps: SkillAskStep[]): AskGroupItem[] {
  return steps.map((s) => ({
    key: s.key,
    label: s.label,
    ask: s.ask,
    required: Boolean(s.required),
    multi: s.multi,
    maxSelect: s.maxSelect,
    options: (s.options || []).map((o, i) => option(s.key, i, o.value, o.label, Boolean(o.custom))),
  }));
}

/** 品牌探索：点选卡片（对齐 Skill 第一阶段，少打字） */
export function skillExploreAskGroups(_body?: string): AskGroupItem[] {
  return [
    {
      key: "brandName",
      label: "品牌名称",
      ask: "品牌名称是什么？",
      required: true,
      options: [
        option("brandName", 0, "慢时光", "慢时光"),
        option("brandName", 1, "山间纪", "山间纪"),
        option("brandName", 2, "稻小金", "稻小金"),
        option("brandName", 3, "", "输入自定义回答…", true),
      ],
    },
    {
      key: "brandDesc",
      label: "品牌描述",
      ask: "一句话描述你的品牌？（没有我可以后续帮你生成）",
      options: [
        option("brandDesc", 0, "精品手作，主打慢生活", "精品手作，主打慢生活"),
        option("brandDesc", 1, "地道特产，适合礼赠", "地道特产，适合礼赠"),
        option("brandDesc", 2, "自然健康，产地直达", "自然健康，产地直达"),
        option("brandDesc", 3, "", "输入自定义回答…", true),
      ],
    },
    {
      key: "brandTone",
      label: "品牌调性",
      ask: "希望传达什么感觉？（可选 1～3 个词）",
      multi: true,
      maxSelect: 3,
      options: [
        option("brandTone", 0, "温暖", "温暖"),
        option("brandTone", 1, "自然", "自然"),
        option("brandTone", 2, "高端", "高端"),
        option("brandTone", 3, "活泼", "活泼"),
        option("brandTone", 4, "复古", "复古"),
        option("brandTone", 5, "极简", "极简"),
        option("brandTone", 6, "亲切", "亲切"),
      ],
    },
    {
      key: "brandColor",
      label: "视觉偏好",
      ask: "有偏好的颜色吗？",
      options: [
        option("brandColor", 0, "茶绿 / 青绿", "茶绿 / 青绿"),
        option("brandColor", 1, "咖啡棕 + 暖米", "咖啡棕 + 暖米"),
        option("brandColor", 2, "朱红 + 金", "朱红 + 金"),
        option("brandColor", 3, "你来定", "你来定"),
        option("brandColor", 4, "", "输入自定义回答…", true),
      ],
    },
  ];
}

const OPEN_CUSTOM_KEYS = new Set([
  "brandName",
  "brandDesc",
  "brandTone",
  "brandColor",
  "colors",
  "style",
  "logoStyle",
  "creativeDesc",
  "eventType",
  "productName",
  "shopName",
  "fontText",
  "topic",
  "slogan",
  "task",
]);

const MODEL_OPTION_RE = /seedream|seedance|z-?image|mofun|kling|flux|jimeng|可图|区域文化|pro|fast|mini/i;
const FALLBACK_IMAGE_MODELS = ["Seedream 5.0", "Seedream 4.5", "Seedream 4.0", "MoFun区域文化大模型"];
const FALLBACK_VIDEO_MODELS = ["Seedance 1.5 Pro", "Seedance 1.0 Pro", "Seedance 2.0", "Seedance 2.0 Fast", "Seedance 2.0 Mini"];

function isModelCatalogOption(o: { value?: string; label: string }) {
  const t = (o.value || o.label || "").trim();
  if (!t || t === "暂不补充" || t === "你来定" || /自定义/.test(o.label)) return false;
  if (t.length > 40 || /[。；「」]|飞檐|横标|条案|灯笼|油纸伞|青衣|石桥/.test(t)) return false;
  return MODEL_OPTION_RE.test(t) || /^[A-Za-z][A-Za-z0-9 .+\-]{1,36}$/.test(t);
}

export function sanitizeAskGroup(group: AskGroupItem): AskGroupItem {
  if (group.key !== "model") return group;
  const options = (group.options || []).filter(isModelCatalogOption);
  if (options.length) return { ...group, options };
  const video = /视频/.test(`${group.label || ""} ${group.ask || ""}`);
  const names = video ? FALLBACK_VIDEO_MODELS : FALLBACK_IMAGE_MODELS;
  return { ...group, options: names.map((v, i) => option("model", i, v, v)) };
}

export function withCustomChoice(group: AskGroupItem): AskGroupItem {
  const opts = group.options || [];
  if (opts.some((o) => o.value === "我自己写" || /自定义/.test(o.label))) return group;
  if (!OPEN_CUSTOM_KEYS.has(group.key)) return group;
  return { ...group, options: [...opts, option(group.key, 90, "", "输入自定义回答…", true)] };
}

function fallbackAskGroupsForSkill(skill?: HarnessSkillItem | null): AskGroupItem[] {
  const id = `${skill?.id || ""} ${skill?.code || ""}`;
  if (/\bimage\.ip\b|skill\.image\.ip/.test(id)) {
    return [
      withCustomChoice({
        key: "creativeDesc",
        label: "创意描述",
        ask: "描述一下 IP / 吉祥物长什么样？（必填）",
        required: true,
        options: [
          option("creativeDesc", 0, "拟人化金色稻穗，圆眼憨笑，汉服马甲", "拟人化金色稻穗，圆眼憨笑，汉服马甲"),
          option("creativeDesc", 1, "杨梅精灵，斗笠与紫红配色", "杨梅精灵，斗笠与紫红配色"),
          option("creativeDesc", 2, "小熊猫文创，圆润可爱", "小熊猫文创，圆润可爱"),
        ],
      }),
      withCustomChoice({
        key: "colors",
        label: "偏好颜色",
        ask: "有偏好的颜色吗？",
        optional: true,
        options: [
          option("colors", 0, "茶绿 / 青绿", "茶绿 / 青绿"),
          option("colors", 1, "暖黄 + 米白", "暖黄 + 米白"),
          option("colors", 2, "朱红 + 金", "朱红 + 金"),
          option("colors", 3, "你来定", "你来定"),
        ],
      }),
      {
        key: "ratio",
        label: "画面尺寸",
        ask: "出图比例选哪个？",
        options: [
          option("ratio", 0, "正方形 1:1", "正方形 1:1"),
          option("ratio", 1, "纵向 3:5", "纵向 3:5"),
          option("ratio", 2, "横向 5:3", "横向 5:3"),
          option("ratio", 3, "宽屏 16:9", "宽屏 16:9"),
        ],
      },
    ];
  }
  return [];
}

export function skillAskGroups(skill?: HarnessSkillItem | null): AskGroupItem[] {
  const groups = skill?.askSteps?.length
    ? toAskGroups(skill.askSteps)
    : skill?.body
      ? skillExploreAskGroups(skill.body)
      : fallbackAskGroupsForSkill(skill);
  return groups.filter((g) => g.key !== "confirm" && g.key !== "count").map(withCustomChoice).map(sanitizeAskGroup);
}

export function clarifyColorAskGroup(): AskGroupItem {
  return withCustomChoice({
    key: "colors",
    label: "配色方案",
    ask: "想换成哪一组颜色？点选即可，也可以自己填色名或色号。",
    required: true,
    options: [
      option("colors", 0, "茶绿 / 青绿", "茶绿 / 青绿"),
      option("colors", 1, "朱红 + 金", "朱红 + 金"),
      option("colors", 2, "暖黄 + 米白", "暖黄 + 米白"),
      option("colors", 3, "轻奢黑金", "轻奢黑金"),
      option("colors", 4, "柔粉 + 天蓝", "柔粉 + 天蓝"),
    ],
  });
}

export function clarifyStyleAskGroup(): AskGroupItem {
  return withCustomChoice({
    key: "style",
    label: "视觉方向",
    ask: "画面想换成哪种感觉？点选或自己写。",
    required: true,
    options: [
      option("style", 0, "国潮", "国潮"),
      option("style", 1, "水彩", "水彩"),
      option("style", 2, "扁平矢量", "扁平矢量"),
      option("style", 3, "卡通动漫", "卡通动漫"),
      option("style", 4, "写实摄影", "写实摄影"),
    ],
  });
}

export function brandCategoryAskGroup(subject = ""): AskGroupItem {
  const prefix = subject ? `为${subject}` : "";
  return withCustomChoice({
    key: "task",
    label: "品牌设计",
    ask: "品牌设计里你更想做哪一块？",
    required: true,
    options: [
      option("task", 0, `${prefix}设计一个 IP`.trim(), "IP 形象"),
      option("task", 1, `${prefix}设计一个 Logo`.trim(), "Logo"),
      option("task", 2, `${prefix}做一张活动海报`.trim(), "活动海报"),
      option("task", 3, `${prefix}做商品商拍`.trim(), "商拍"),
      option("task", 4, `${prefix}做店招`.trim(), "店招"),
      option("task", 5, `${prefix}做艺术字`.trim(), "AI 字体"),
    ],
  });
}

export function clarifyTaskAskGroup(subject = ""): AskGroupItem {
  return brandCategoryAskGroup(subject);
}

export function detectClarifyKind(
  text: string,
  actionKind?: string,
  alreadyPicked?: { task?: string; specialistId?: string },
): "colors" | "style" | "task" | null {
  if (actionKind === "adjust_colors" || /配色|色系|主色/.test(text) || /颜色/.test(text)) return "colors";
  if (actionKind === "change_direction" || /视觉方向|换个方向|换一个方向/.test(text)) return "style";
  if (
    isVagueBrandCategory(text) &&
    !extractAskIntent(text, [brandCategoryAskGroup()]).task &&
    !String(alreadyPicked?.task || "").trim() &&
    !alreadyPicked?.specialistId
  ) {
    return "task";
  }
  return null;
}

/** 需要模型现写例子的开放题；风格 / 模型 / 比例等目录项保持固定。 */
export const QUIZ_EXAMPLE_KEYS = new Set([
  "brandName",
  "brandDesc",
  "creativeDesc",
  "productName",
  "shopName",
  "fontText",
  "topic",
  "slogan",
  "keywords",
  "advantage",
  "outline",
]);

const LOCKED_DEMO = new Set([
  "山间纪",
  "慢时光",
  "稻小金",
  "萧山萝卜干",
  "云间茶舍",
  "稻香小馆",
  "山间茶叙",
]);

function shortOptLabel(text: string, key: string) {
  const max =
    key === "creativeDesc" ? 80 : key === "brandName" || key === "shopName" || key === "productName" || key === "fontText" ? 12 : 20;
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function rewriteAskExample(ask: string, sample: string) {
  if (!sample) return ask.replace(/[（(]必填，例如：[^）)]+[）)]/, "（必填）");
  return ask.replace(/例如：[^）)]+/, `例如：${sample}`);
}

function isKeepOption(o: { value?: string; label: string }) {
  const v = (o.value || o.label || "").trim();
  return v === "暂不补充" || v === "你来定" || v === "我自己写" || /自定义/.test(o.label);
}

/** 把模型写的例子填进问卷 A/B/C，保留「暂不补充」和自定义行。 */
export function applyQuizExamples(groups: AskGroupItem[], examples: Record<string, string[]>): AskGroupItem[] {
  return groups.map((g) => {
    if (g.key === "model" || !QUIZ_EXAMPLE_KEYS.has(g.key)) return sanitizeAskGroup(g);
    const samples = [...new Set((examples[g.key] || []).map((s) => s.trim()).filter(Boolean))].slice(0, 3);
    const keep = (g.options || []).filter(isKeepOption);
    if (!samples.length) {
      const stripped = (g.options || []).filter((o) => !LOCKED_DEMO.has((o.value || o.label || "").trim()));
      return sanitizeAskGroup(stripped.length ? { ...g, options: stripped } : g);
    }
    const generated = samples.map((v, i) => option(g.key, i, v, shortOptLabel(v, g.key)));
    return sanitizeAskGroup({
      ...g,
      ask: rewriteAskExample(g.ask, samples[0]),
      options: [...keep.filter((o) => o.value !== "我自己写" && !/自定义/.test(o.label)), ...generated, ...keep.filter((o) => o.value === "我自己写" || /自定义/.test(o.label))],
    });
  });
}

const ASK_LABEL_BY_KEY: Record<string, string> = {
  brandName: "品牌名称",
  brandDesc: "品牌描述",
  brandTone: "品牌调性",
  brandColor: "视觉偏好",
  logoStyle: "Logo风格",
  style: "风格",
  creativeDesc: "创意描述",
  eventType: "物料类型",
  productName: "商品名称",
  shopName: "店铺名称",
  fontText: "文字内容",
  fontDir: "文字方向",
  fontCat: "文字效果",
  colors: "配色方案",
  task: "要做什么",
  model: "模型",
  duration: "时长",
  quality: "视频质量",
  count: "生成数量",
  ratio: "图片尺寸",
  scene: "场景预设",
  channel: "店招类型",
  platform: "推广平台",
  industry: "行业",
  slogan: "副文案",
  pipeline: "生成方式",
  audio: "同时生成声音",
  intent: "今天推什么",
  hook: "钩子类型",
  cta: "行动号召",
  tone: "语气",
  audience: "目标人群",
  keywords: "核心关键词",
  outline: "内容大纲",
  length: "字数范围",
  advantage: "产品核心优势",
  goal: "营销目标",
  voice: "选择音色",
  performance: "角色表现",
  genMode: "生成模式",
  subtitle: "字幕",
  filmType: "片子类型",
  kb: "本地增强",
  researchType: "调研类型",
  timeScope: "时间跨度",
  reportType: "报告类型",
  topic: "主题",
};

/** 目录题才从原话对选项；品牌名等举例题不在这里猜。 */
const INTENT_CATALOG_KEYS = new Set([
  "task",
  "eventType",
  "style",
  "logoStyle",
  "ratio",
  "model",
  "platform",
  "fontDir",
  "fontCat",
  "channel",
  "industry",
  "productType",
  "researchType",
  "filmType",
  "duration",
  "quality",
  "goal",
  "tone",
  "audience",
  "length",
  "colors",
  "brandColor",
  "format",
  "count",
  "pipeline",
  "intent",
  "hook",
  "cta",
  "scene",
  "audio",
  "genMode",
  "subtitle",
  "voice",
  "timeScope",
  "reportType",
  "kb",
]);

const INTENT_ALIASES: Record<string, string[]> = {
  海报: ["海报", "招贴", "主视觉", "poster"],
  长图: ["长图", "详情长图"],
  菜单: ["菜单", "菜谱", "价目表"],
  易拉宝: ["易拉宝", "展架", "门型展架"],
  宣传单: ["宣传单", "传单", "单页", "折页"],
  包装: ["包装"],
  国潮: ["国潮", "中国风", "中国风格", "国风"],
  水彩: ["水彩"],
  扁平矢量: ["扁平矢量", "扁平"],
  卡通动漫: ["卡通", "动漫"],
  写实摄影: ["写实", "摄影"],
  纹样: ["纹样"],
  线描: ["线描", "线稿"],
  版画: ["版画"],
  新中式: ["新中式"],
  文生视频: ["文生视频", "文生"],
  图生视频: ["图生视频", "图生"],
  线上店招: ["线上店招", "电商店招", "通栏"],
  实体门头: ["实体门头", "门头"],
  微信朋友圈: ["朋友圈", "微信朋友圈"],
  小红书: ["小红书"],
  "正方形 1:1": ["正方形", "方图", "1:1", "1：1"],
  "纵向 3:5": ["竖版", "纵向", "3:5", "3：5"],
  "横向 5:3": ["横向 5:3", "5:3", "5：3"],
  "宽屏 16:9": ["宽屏", "横版", "16:9", "16：9"],
  文字logo: ["文字logo", "文字 Logo", "字标"],
  字母logo: ["字母logo", "字母 Logo"],
  经典徽章: ["徽章"],
  图文插画: ["插画"],
  图文简约: ["简约logo", "简约 Logo"],
  "IP 形象": ["IP 形象", "IP形象", "ip形象", "吉祥物", "表情包", "拟人", "IP", "ip"],
  Logo: ["Logo", "logo", "LOGO", "标志", "商标"],
  活动海报: ["活动海报", "海报", "招贴", "主视觉"],
  商拍: ["商拍", "白底图", "商品主图"],
  店招: ["店招", "门头"],
  "AI 字体": ["AI 字体", "艺术字", "书法字", "标题字"],
};

function optionAliases(value: string, label: string) {
  return [...new Set([...(INTENT_ALIASES[value] || []), ...(INTENT_ALIASES[label] || []), value, label])].filter(
    (a) => a.length >= 2 && a !== "智能匹配" && a !== "你来定",
  );
}

function catalogHit(text: string, value: string, label: string) {
  let last = -1;
  let aliasLen = 0;
  for (const a of optionAliases(value, label)) {
    let idx = -1;
    if (/^[A-Za-z]{2,4}$/.test(a)) {
      const m = text.match(new RegExp(`(?:^|[^A-Za-z0-9])(${a})(?:$|[^A-Za-z0-9])`, "i"));
      if (m && m.index != null) idx = m.index + (m[0].length - m[1].length);
    } else {
      idx = text.indexOf(a);
    }
    if (idx < 0) continue;
    const end = idx + a.length;
    if (end > last || (end === last && a.length > aliasLen)) {
      last = end;
      aliasLen = a.length;
    }
  }
  return last < 0 ? null : { last, aliasLen };
}

/** 从用户原话对上目录选项（海报、国潮等），已说清的不再问。 */
export function extractAskIntent(text: string, groups: AskGroupItem[]): Record<string, string> {
  const raw = text.trim();
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const g of groups) {
    if (!INTENT_CATALOG_KEYS.has(g.key)) continue;
    let best: { value: string; last: number; aliasLen: number } | null = null;
    for (const o of g.options || []) {
      const value = (o.value || o.label || "").trim();
      if (!value || value === "我自己写" || /自定义/.test(o.label) || value === "智能匹配") continue;
      const hit = catalogHit(raw, value, o.label);
      if (!hit) continue;
      if (!best || hit.last > best.last || (hit.last === best.last && hit.aliasLen > best.aliasLen)) {
        best = { value, last: hit.last, aliasLen: hit.aliasLen };
      }
    }
    if (best) out[g.key] = best.value;
  }
  return out;
}

const ASK_KEY_ALIASES: Record<string, string[]> = {
  logoStyle: ["logoStyle", "style"],
  style: ["style", "logoStyle"],
  brandColor: ["brandColor", "colors"],
  colors: ["colors", "brandColor"],
  brandName: ["brandName", "brand"],
  productName: ["productName", "product"],
  fontText: ["fontText", "text"],
  fontCat: ["fontCat", "style"],
  eventType: ["eventType", "format"],
  timeScope: ["timeScope", "length"],
  reportType: ["reportType", "reportFocus"],
  topic: ["topic", "script", "oneLiner", "brief"],
  filmType: ["filmType", "type"],
  advantage: ["advantage", "sellingPoints"],
};

export function askIntentValue(intent: Record<string, string>, key: string): string {
  for (const k of ASK_KEY_ALIASES[key] || [key]) {
    const v = String(intent[k] || "").trim();
    if (v) return v;
  }
  return "";
}

export function dropFilledAskGroups(groups: AskGroupItem[], intent: Record<string, string>): AskGroupItem[] {
  return groups.filter((g) => {
    const v = askIntentValue(intent, g.key) || String(g.filled || "").trim();
    return !v || v === "你来定" || v === "暂不补充";
  });
}

export function skillOpening(skill?: HarnessSkillItem | null, intent?: Record<string, string>): string {
  const known = [intent?.eventType, intent?.style || intent?.logoStyle, intent?.productType, intent?.channel]
    .map((x) => (x || "").trim())
    .filter(Boolean);
  if (known.length) {
    return `好的，「${known.join(" · ")}」我记下了。其余几项点一下，填完就能生成。`;
  }
  if (skill?.opening?.trim()) return sanitizeUserSpeech(skill.opening.trim());
  return "好的，先把这几项定下来。点选即可，填完就能生成。";
}

export function formatSkillAskAnswers(groups: AskGroupItem[], picks: Record<string, string>): string {
  const seen = new Set(groups.map((g) => g.key));
  const fromGroups = groups
    .filter((g) => g.key !== "confirm")
    .map((g) => {
      const v = (picks[g.key] || "").trim();
      if (!v || v === "你来定" || v === "暂不补充") return "";
      return `${g.label || ASK_LABEL_BY_KEY[g.key]}：${v}`;
    })
    .filter(Boolean);
  const extras = Object.entries(picks)
    .filter(([k, v]) => {
      const t = (v || "").trim();
      return Boolean(t) && t !== "你来定" && t !== "暂不补充" && !seen.has(k) && ASK_LABEL_BY_KEY[k];
    })
    .map(([k, v]) => `${ASK_LABEL_BY_KEY[k]}：${v.trim()}`);
  const lines = [...extras, ...fromGroups];
  return lines.length ? `请按以下信息生成。${lines.join("；")}` : "";
}

export type SkillBriefLine = { label: string; value: string };

export type SkillBrief = {
  title: string;
  skillName: string;
  intro: string;
  lines: SkillBriefLine[];
  picks: Record<string, string>;
  groups: AskGroupItem[];
};

export type SkillGenParams = {
  model: string;
  ratio: string;
  resolution: string;
  count: string;
};

function pickVal(picks: Record<string, string>, keys: string[]) {
  for (const k of keys) {
    const v = (picks[k] || "").trim();
    if (v && v !== "你来定" && v !== "暂不补充") return v;
  }
  return "";
}

export function buildSkillBrief(
  groups: AskGroupItem[],
  picks: Record<string, string>,
  skillName = "",
): SkillBrief {
  const lines = groups
    .filter((g) => g.key !== "confirm")
    .map((g) => {
      const value = (picks[g.key] || "").trim();
      if (!value || value === "你来定" || value === "暂不补充") return null;
      return { label: g.label, value };
    })
    .filter(Boolean) as SkillBriefLine[];
  const seen = new Set(lines.map((l) => l.label));
  const extras = Object.entries(picks)
    .filter(([k, v]) => {
      const t = (v || "").trim();
      const label = ASK_LABEL_BY_KEY[k];
      return Boolean(t) && t !== "你来定" && t !== "暂不补充" && label && !seen.has(label) && !groups.some((g) => g.key === k);
    })
    .map(([k, v]) => ({ label: ASK_LABEL_BY_KEY[k], value: v.trim() }));
  const subject = ["brandName", "shopName", "productName", "fontText", "topic"]
    .map((k) => pickVal(picks, [k]))
    .find((v) => v && v.length <= 24);
  const title = subject ? (skillName ? `${subject} · ${skillName}` : subject) : skillName || "创作";
  const intro = `好的，已收到你的信息。即将按以下内容生成「${title}」：`;
  return { title, skillName, intro, lines: [...extras, ...lines], picks: { ...picks }, groups };
}

export function skillGenParams(picks: Record<string, string>, skillName = ""): SkillGenParams {
  const avatar = /数字人/.test(skillName);
  const video =
    !avatar && (/成片|大片|视频/.test(skillName) || Boolean(pickVal(picks, ["duration"])));
  const ratioRaw = pickVal(picks, ["ratio"]) || (video ? "智能" : "1:1");
  const ratio = /智能/.test(ratioRaw)
    ? "智能"
    : /1\s*:\s*1|正方形|电商主图|方版/.test(ratioRaw)
      ? "1:1"
      : /3\s*:\s*5|纵向/.test(ratioRaw)
        ? "3:5"
        : /5\s*:\s*3|横向/.test(ratioRaw)
          ? "5:3"
          : /16\s*:\s*9|宽屏/.test(ratioRaw)
            ? "16:9"
            : /9\s*:\s*16/.test(ratioRaw)
              ? "9:16"
              : /3\s*:\s*4|竖版3/.test(ratioRaw)
                ? "3:4"
                : ratioRaw;
  const countRaw = pickVal(picks, ["count"]) || "1";
  const count = countRaw.replace(/[^0-9]/g, "") || "1";
  return {
    model: pickVal(picks, ["model"]) || (avatar ? pickVal(picks, ["genMode"]) || "720p + 30FPS" : video ? "Seedance 1.5 Pro" : "Seedream 5.0"),
    ratio,
    resolution: pickVal(picks, ["quality", "resolution", "genMode"]) || (video ? "480P" : "1K"),
    count,
  };
}

export function formatSkillGeneratePrompt(brief: SkillBrief, params: SkillGenParams, extra = ""): string {
  const base = formatSkillAskAnswers(brief.groups, {
    ...brief.picks,
    model: params.model,
    ratio: params.ratio,
    count: params.count,
  });
  const bits = [base.replace(/^请按以下信息生成[。.]?/, "").trim(), `分辨率：${params.resolution}`];
  const note = extra.trim();
  if (note) bits.push(`其他要求：${note}`);
  return `请按以下信息生成。${bits.filter(Boolean).join("；")}`;
}
