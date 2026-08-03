/**
 * 公众号帮写 Skill 提示词
 * 来源优化：桌面「公众号SKILL.md」(zhd-wechat-format)
 * 适配魔方智绘：一次生成微信友好纯文本长文（无 Markdown 标记）
 */
import type { GenerateRequest } from "@/lib/types";

/** 文案风格 → 排版气质（对应原 Skill 主题推荐） */
export const OFFICIAL_THEME_BY_STYLE: Record<string, { themes: string; vibe: string }> = {
  政企风: {
    themes: "newspaper / magazine / ink",
    vibe: "严肃深度、留白克制、小标题规整，适合政策解读与产业长文",
  },
  娱乐风: {
    themes: "sports / bauhaus / chinese",
    vibe: "节奏感强、段落短促、可穿插金句与轻量互动感",
  },
  短剧风: {
    themes: "terracotta / sunset-amber / coffee-house",
    vibe: "场景化叙事、冲突转折清晰，适合连载阅读",
  },
  情感文: {
    themes: "lavender-dream / terracotta / coffee-house",
    vibe: "细腻留白、金句点睛，少列表堆砌",
  },
  干货科普: {
    themes: "sspai / github / bytedance",
    vibe: "信息密度高、小标题+列表+步骤清晰，适合教程与方法文",
  },
};

const LENGTH_HINT: Record<string, string> = {
  "600-800字": "全文约 600-800 字",
  "800-1200字": "全文约 800-1200 字",
  "1200-2000字": "全文约 1200-2000 字",
  "2000字以上": "全文 2000 字以上，可分多小节展开",
};

function lengthLine(req: GenerateRequest): string {
  const L = (req.length || "").trim();
  if (LENGTH_HINT[L]) return LENGTH_HINT[L];
  if (L && /^\d+$/.test(L)) return `字数约 ${L} 字`;
  return "篇幅适中（约 800-1200 字）";
}

function styleBlock(req: GenerateRequest): string {
  const styleKey = (req.tone || "").trim();
  if (styleKey === "自定义" && req.styleHint?.trim()) {
    return `文案风格：自定义——${req.styleHint.trim()}\n排版气质：按自定义描述自行匹配节奏与结构密度。`;
  }
  const mapped = OFFICIAL_THEME_BY_STYLE[styleKey];
  if (mapped) {
    return [
      `文案风格：${styleKey}`,
      `排版气质参考主题：${mapped.themes}`,
      `呈现要求：${mapped.vibe}`,
    ].join("\n");
  }
  if (styleKey) {
    return `文案风格：${styleKey}`;
  }
  return [
    "文案风格：干货科普",
    `排版气质参考主题：${OFFICIAL_THEME_BY_STYLE["干货科普"].themes}`,
    `呈现要求：${OFFICIAL_THEME_BY_STYLE["干货科普"].vibe}`,
  ].join("\n");
}

const PLAIN_TEXT_RULES = [
  "【输出格式·强制纯文本】禁止一切 Markdown / HTML 标记：",
  "禁止使用 **加粗**、*斜体*、# 标题、> 引用、``` 代码块、[]() 链接、--- 分隔线、行首 - / * 列表符等。",
  "用纯中文排版即可：",
  "1. 首行写文章主标题（可与用户标题一致或轻度优化）。",
  "2. 小节标题单独成行，用「一、」「二、」或「1.」「2.」这类中文序号，不要 #。",
  "3. 段落之间空行分隔；长段在语义转换处拆分。",
  "4. 并列/步骤用「1）2）3）」或「·」起行，不要 Markdown 列表符。",
  "5. 需要强调时直接写进句子，不要加粗星号。",
  "6. 金句可单独成段，前后空行即可，不要引用块。",
  "7. 结尾给一句轻行动号召（关注/转发/留言），勿硬广堆砌。",
  "8. 不要输出元评论、提纲说明；直接输出正文。",
  "9. 用户若给了大纲：严格按大纲展开，可微调小标题措辞，不擅自增删大节。",
  "10. 底线：不编造不存在的政策文号、数据与链接；不确定处用定性表述。",
].join("\n");

const SYSTEM_WRITE =
  "你是「公众号内容专家」，服务于农文旅（农产品、乡村旅游、地域文化、县域产业）及泛产业传播。" +
  "能力覆盖：选题成文、结构增强、适合粘贴微信公众号编辑器的纯文本长文。" +
  "根据标题、关键词、风格与可选大纲，一次性写出完整长文。" +
  PLAIN_TEXT_RULES;

const SYSTEM_OUTLINE =
  "你是资深公众号编辑，服务于农文旅与县域产业传播。" +
  "用户会给出主题，请只输出一份结构清晰的公众号长文提纲（主标题 + 若干小节标题与要点），不要写正文。" +
  "提纲用纯文本：禁止 Markdown（不要 #、**、- 列表符等），用「一、」「1）」等中文序号即可。";

/** 兜底：去掉模型偶发输出的 Markdown 标记，保留可读纯文本 */
export function stripOfficialMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "· ")
    .replace(/^---+$/gm, "")
    .replace(/`+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 封面图提示词模板（可选：排版/成文后配封面时使用）
 */
export function buildOfficialCoverPrompt(themeOneLiner: string): string {
  return [
    "请根据提供的内容创建一张吸引眼球的公众号封面图，遵循以下规范：",
    "",
    "视觉风格",
    "- Notion 插画风格，比例为 2.35:1（公众号封面标准尺寸）",
    "- 色彩鲜明、对比强烈，确保在小尺寸预览时依然醒目",
    "- 风格统一，避免写实元素，保持整体手绘质感",
    "",
    "构图要求",
    "- 主视觉元素居中或偏左（右侧预留标题区域）",
    "- 添加 1-2 个简洁的卡通形象、图标或剪影，增强记忆点",
    "- 大量留白，突出核心信息，避免画面拥挤",
    "",
    "文字处理",
    "- 标题文字大而醒目，控制在 8 字以内",
    "- 可添加 1 行副标题或关键词标签",
    "- 字体风格与手绘插画协调统一",
    "",
    "吸引力法则",
    "- 使用悬念、数字、痛点等钩子元素激发点击欲望",
    "- 视觉元素夸张有反差",
    "- 色彩搭配参考爆款封面：橙黄、蓝紫、红黑等高对比组合",
    "",
    "语言",
    "- 除非另有说明，默认使用中文",
    "- 画面内所有可读文字必须使用简体中文，英文只能作为点缀出现",
    "",
    `内容主题：${themeOneLiner}`,
  ].join("\n");
}

export function buildOfficialMessages(
  req: GenerateRequest
): { role: "system" | "user"; content: string }[] {
  const brandLine =
    req.brandAsset && req.brandAsset !== "不套用"
      ? `请贴合品牌资产「${req.brandAsset}」的调性。`
      : "";

  if (req.mode === "outline") {
    return [
      { role: "system", content: SYSTEM_OUTLINE },
      {
        role: "user",
        content: [
          `主题：${req.title || req.input || "（未填写）"}`,
          req.keywords ? `关键词：${req.keywords}` : "",
          brandLine,
          "请输出提纲（纯文本，不要 Markdown），便于用户确认后再扩写全文。",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];
  }

  const title = (req.title || "").trim() || "（未填写标题）";
  const keywords = (req.keywords || "").trim() || "（未填写）";
  const outline = (req.outline || "").trim();

  return [
    { role: "system", content: SYSTEM_WRITE },
    {
      role: "user",
      content: [
        `文章标题：${title}`,
        `核心关键词：${keywords}`,
        styleBlock(req),
        `篇幅要求：${lengthLine(req)}`,
        outline
          ? `内容大纲（请严格依据展开）：\n${outline}`
          : "内容大纲：未提供，请自行设计合理结构（开篇钩子 → 分节展开 → 收束行动号召）。",
        brandLine,
        req.input && !req.title ? `补充素材：${req.input}` : "",
        "请直接输出完整公众号文章正文：纯文本，禁止任何 Markdown 标记（尤其不要 ** 加粗）。",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}
