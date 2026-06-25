/* ============================================================
   服务端 LLM 封装：provider 预设 + prompt 组装 + OpenAI 兼容调用
   仅在服务端（Route Handler）使用，密钥绝不进前端 bundle。
   ============================================================ */
import type { GenerateRequest } from "@/lib/types";

interface ProviderPreset {
  baseURL: string;
  model: string;
}

/* 各家国内模型的 OpenAI 兼容预设 */
const PROVIDERS: Record<string, ProviderPreset> = {
  deepseek: { baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  qwen: { baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  glm: { baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-plus" },
  ernie: { baseURL: "https://qianfan.baidubce.com/v2", model: "ernie-4.5-turbo-128k" },
};

export interface ResolvedProvider {
  baseURL: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

/** 读取环境变量，结合 provider 预设解析出最终配置。缺 Key 抛错。 */
export function resolveProvider(): ResolvedProvider {
  const providerKey = (process.env.LLM_PROVIDER || "deepseek").toLowerCase();
  const preset = PROVIDERS[providerKey] ?? PROVIDERS.deepseek;

  const apiKey = process.env.LLM_API_KEY || "";
  if (!apiKey) {
    throw new Error("MISSING_API_KEY");
  }
  return {
    baseURL: process.env.LLM_BASE_URL || preset.baseURL,
    model: process.env.LLM_MODEL || preset.model,
    apiKey,
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 60000),
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const TONE_HINT: Record<string, string> = {
  亲切口语: "用亲切、口语化的语气，像朋友聊天",
  专业权威: "用专业、权威、可信赖的语气",
  活泼种草: "用活泼、有感染力的种草语气，适合社媒",
  政务正式: "用正式、严谨、规范的政务语气",
};

function lengthHint(req: GenerateRequest): string {
  if (req.length === "精简") return "篇幅精简，约 60-100 字";
  if (req.length === "详尽") return "篇幅详尽充分";
  if (req.length === "标准") return "篇幅适中";
  if (req.length && /^\d+$/.test(req.length)) return `字数约 ${req.length} 字`;
  return "篇幅适中";
}

/* IP 设计·创意描述优化的系统提示词（开头身份声明） */
const IP_SYSTEM_PROMPT = "你是一个专业的IP形象创意描述优化助手。";

/* IP 设计·优化规则（user 消息中的规则与输出格式部分，随有无参考图动态调整任务说明） */
const IP_RULES =
  "## 优化规则\n\n" +
  "1. **保留用户核心意图**，不改变形象的基本设定和风格方向\n" +
  "2. 若用户提供了偏好颜色，将其自然融入服饰、配色、色彩基调；**未提供则根据描述合理推断**\n" +
  "3. 若用户指定了画面尺寸，正方形时构图居中饱满，其他比例相应调整；**未提供则默认正方形构图**\n" +
  "4. **参考图片处理逻辑：**\n" +
  "   - **有参考图时**：识别图片中的造型、色彩、风格、姿态等视觉元素，将其与创意描述融合，冲突时以用户文字描述为主\n" +
  "   - **无参考图时**：忽略此项，完全依赖创意描述展开\n" +
  "5. **补全关键视觉要素**，按以下维度展开：\n" +
  "   - 整体造型（体型、姿态、构图）\n" +
  "   - 头部特征（发型、表情、五官风格）\n" +
  "   - 服饰配件（颜色、材质、细节）\n" +
  "   - 标志性道具或元素\n" +
  "   - 色彩基调\n" +
  "   - 风格定位（如：扁平插画风、Q版卡通、国潮风等）\n" +
  "6. **语言简洁精准**，避免抽象形容，多用可视化的具体描述\n" +
  "7. **字数控制在150字以内**\n" +
  "8. **画面中只能出现一个 IP 形象**：单一主体、单个角色，居中呈现；" +
  "严禁出现多个分身、多个角色、三视图/多视角拼图、角色阵列或重复形象。\n\n" +
  "## 输出格式\n\n" +
  "直接输出优化后的描述文本，不需要解释说明，不需要标题。" +
  "（在描述中明确体现「画面仅一个该 IP 形象，单一角色居中，无分身、无三视图」）";

/** 按场景/模式把表单字段拼成 messages */
export function buildMessages(req: GenerateRequest): ChatMessage[] {
  // IP 设计·帮我提案：根据 IP 特征构思三个设计方案
  if (req.scene === "ip-propose") {
    const feature = req.description?.trim() || "（未提供）";
    return [
      {
        role: "user",
        content:
          `「${feature}」，根据提供的信息，帮我构思三个合适的 IP 设计方案，输出格式要求为：\n` +
          `方案一：内容\n方案二：内容\n方案三：内容。\n` +
          `每个方案之间分段。不要有多余的总结和废话。`,
      },
    ];
  }

  // IP 故事·形象描述：严格依据用户之前填的创意描述 + 颜色 + 尺寸提炼，不识别图片、不臆造
  if (req.scene === "ip-story-desc") {
    const name = req.ipName?.trim() || "该 IP 形象";
    const base = req.description?.trim();
    const lines: string[] = [`- IP名称：${name}`];
    if (base) lines.push(`- 创意描述：${base}`);
    if (req.preferredColors && req.preferredColors.length) lines.push(`- 偏好颜色：${req.preferredColors.join("、")}`);
    if (req.canvasSize) lines.push(`- 画面尺寸：${req.canvasSize}`);
    return [
      {
        role: "system",
        content:
          "你是一个专业的IP形象描述助手。请【严格依据】用户给出的创意描述、偏好颜色、画面尺寸等信息，" +
          "把这个IP形象的外观特征（造型、配色、服饰、表情、标志性道具、风格定位等）整理成一段通顺的客观描述。" +
          "【重要】只能依据给定信息提炼，不得新增、臆造或更改任何信息里没有的设定；偏好颜色应自然融入配色描述。" +
          "要求：80字以内，只输出描述本身，不要标题、不要解释、不要换行。",
      },
      {
        role: "user",
        content: base
          ? `用户已填写以下信息：\n${lines.join("\n")}\n\n请据上面的信息，整理出「${name}」的形象描述。`
          : `IP名称：${name}\n（暂无更多信息）\n\n请根据名称合理给出「${name}」的简要形象描述。`,
      },
    ];
  }

  // IP 故事：根据 IP 形象描述 + 用户补充信息，撰写一段品牌 IP 故事
  if (req.scene === "ip-story") {
    const name = req.ipName?.trim() || "该 IP 形象";
    const desc = req.description?.trim() || "（未提供形象描述）";
    const sup = req.supplement?.trim();
    const lines = [`IP名称：${name}`, `IP形象描述：${desc}`];
    if (req.preferredColors && req.preferredColors.length) lines.push(`形象主色调：${req.preferredColors.join("、")}`);
    if (sup) lines.push(`补充信息（须紧扣的项目/公司/行业）：${sup}`);

    // 有补充信息时，强约束：故事必须真正落到用户给的关键词上，而非一笔带过
    const supRule = sup
      ? `\n\n【最重要】用户提供的关键词是「${sup}」。这段故事必须紧扣「${sup}」来写：\n` +
        `- 故事的应用场景、所服务的对象、解决的问题、传递的价值，都要落到「${sup}」上；\n` +
        `- 把 IP 的性格与道具，自然映射到「${sup}」所代表的领域价值上（请据「${sup}」本身合理发挥，不要套用与它无关的设定）；\n` +
        `- 不要只在结尾提一句「${sup}」，而要让整段故事都围绕它展开。`
      : "";

    return [
      {
        role: "system",
        content:
          "你是资深的品牌IP策划。请【紧扣给定的IP形象描述】，为这个IP撰写一段有温度、有记忆点的品牌故事：" +
          "包含它的出身/由来、性格设定、与品牌或场景的情感联结，以及它想向用户传递的价值。" +
          "【重要】故事要忠于形象描述里的设定（造型、配色、道具等），不要另起一个不相干的形象。" +
          "要求：语言生动亲切，结构自然成段，约200-300字，直接输出故事正文，不要标题、不要分点。",
      },
      {
        role: "user",
        content: `${lines.join("\n")}${supRule}\n\n请为「${name}」撰写一段品牌IP故事。`,
      },
    ];
  }

  // IP 设计：创意描述优化（有/无参考图共用一套模板，按条件动态拼装）
  if (req.scene === "ip") {
    const hasRef = !!req.hasReference;
    // 已填写信息（条件行：偏好颜色 / 画面尺寸 / 参考图片，未填则不出现）
    const lines = [`- 创意描述：${req.description?.trim() || "（未填写）"}`];
    if (req.preferredColors && req.preferredColors.length) {
      lines.push(`- 偏好颜色：${req.preferredColors.join("、")}`);
    }
    if (req.canvasSize) lines.push(`- 画面尺寸：${req.canvasSize}`);
    if (hasRef) lines.push(`- 参考图片：用户已上传参考图`);

    // 任务说明：有参考图时结合图片视觉内容，无参考图时仅依赖创意描述
    const task = hasRef
      ? "用户上传了参考图片，请同时结合参考图片的视觉内容与用户的创意描述，优化为一段适合AI图像生成模型理解的prompt。"
      : "根据用户的创意描述，优化为一段适合AI图像生成模型理解的prompt。";

    return [
      { role: "system", content: IP_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `用户已填写以下信息：\n${lines.join("\n")}\n\n` +
          `## 你的任务\n\n${task}\n\n` +
          `${IP_RULES}`,
      },
    ];
  }

  const brandLine = req.brandAsset && req.brandAsset !== "不套用"
    ? `请贴合品牌资产「${req.brandAsset}」的调性。`
    : "";

  // 公众号「先生成提纲」
  if (req.scene === "official" && req.mode === "outline") {
    return [
      {
        role: "system",
        content:
          "你是资深公众号编辑，服务于「农文旅」（农产品、乡村旅游、地域文化）领域。" +
          "用户会给出主题，请只输出一份结构清晰的公众号长文提纲（标题 + 若干小节标题与要点），不要写正文。",
      },
      {
        role: "user",
        content:
          `主题：${req.input || "（未填写）"}\n` +
          `${brandLine}\n请输出提纲，便于用户确认后再扩写全文。`,
      },
    ];
  }

  // 公众号「按提纲生成全文」
  if (req.scene === "official" && req.mode === "full" && req.outline) {
    return [
      {
        role: "system",
        content:
          "你是资深公众号编辑，服务于「农文旅」领域。请按用户提供的提纲扩写成一篇完整的公众号长文，" +
          "小标题清晰、段落流畅，约 1500-2000 字，可适当加入小标题与过渡。",
      },
      {
        role: "user",
        content:
          `原始主题：${req.input || ""}\n${brandLine}\n请严格依据以下提纲扩写全文：\n\n${req.outline}`,
      },
    ];
  }

  // 社媒推文（结构化 JSON）
  if (req.scene === "social") {
    const platforms = (req.platforms && req.platforms.length ? req.platforms : ["微信朋友圈"]).join("、");
    return [
      {
        role: "system",
        content:
          "你是农文旅领域的资深社媒营销策划。请基于用户给的产品信息，产出一份「推广策划案」，" +
          "并严格只输出如下结构的 JSON（不要任何额外文字、不要 markdown 代码块）：\n" +
          `{
  "titles": ["营销主标题1", "主标题2", "主标题3"],
  "highlights": [{"tag":"打法标签","text":"亮点文案"}],
  "posts": {
    "xhs": {"title":"小红书标题", "body":"小红书正文(可含emoji/换行)", "tags":["#标签1","#标签2"]},
    "wechat": {"body":"微信朋友圈正文(可含emoji/换行)"}
  }
}\n` +
          "若某平台未被选择则该平台字段可省略。titles 给 3 条，highlights 给 2-3 条。",
      },
      {
        role: "user",
        content:
          `产品名：${req.product || "（未填写）"}\n` +
          `品牌名：${req.brand || "（无）"}\n` +
          `目标人群：${req.audience || "通用人群"}\n` +
          `产品优势：${req.advantage || "（未填写）"}\n` +
          `推广平台：${platforms}\n` +
          (req.outline ? `内容大纲参考：${req.outline}\n` : "") +
          `请据此产出 JSON 策划案。`,
      },
    ];
  }

  // 品牌推广 / 其它（纯文本）
  const tone = req.tone && TONE_HINT[req.tone] ? TONE_HINT[req.tone] : "语气得体";
  return [
    {
      role: "system",
      content:
        "你是农文旅领域的资深品牌文案。请基于用户主题，产出调性统一的品牌推广文案，" +
        "可提炼品牌主张与核心卖点，结构清晰、有感染力。",
    },
    {
      role: "user",
      content:
        `主题/素材：${req.input || "（未填写）"}\n${brandLine}\n要求：${tone}，${lengthHint(req)}。`,
    },
  ];
}
