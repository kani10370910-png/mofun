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

/** 按场景/模式把表单字段拼成 messages */
export function buildMessages(req: GenerateRequest): ChatMessage[] {
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
