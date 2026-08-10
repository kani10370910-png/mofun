import { NextRequest } from "next/server";
import { SYSTEM_VIDEO_GENERATE } from "@/lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 文生视频·立即生成·字段组装
   入参：表单全部字段（见 VideoGenerateInput）
   出参：{ finalPrompt, appliedStyle, notes }
   - finalPrompt：LLM 按 SYSTEM_VIDEO_GENERATE 规则组装好的完整画面描述，直送视频模型
   - appliedStyle：实际应用的风格名称（智能匹配时 LLM 负责预测，不返回「智能匹配」）
   - notes：需告知用户的说明条目（如「智能匹配→航拍大片」「1080P消耗2倍额度」） */

interface VideoGenerateInput {
  scene?: string;
  sceneCat?: string;
  prompt: string;
  model?: string;
  ratio?: string;
  durSec?: number;
  quality?: string;
  style?: string;
  genAudio?: boolean;
  voice?: string;
  bgm?: string;
  count?: number;
  useKB?: boolean;
  county?: string;
  kbContext?: string;
}

interface VideoGenerateOutput {
  finalPrompt: string;
  appliedStyle: string;
  notes: string[];
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as VideoGenerateInput;
  if (!body.prompt?.trim()) return Response.json({ error: "prompt required" }, { status: 400 });

  const apiKey = process.env.IMAGE_API_KEY || process.env.LLM_API_KEY || "";
  const baseURL = (process.env.IMAGE_BASE_URL || process.env.LLM_BASE_URL || "").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "qwen3-max-2026-01-23";

  if (!apiKey || !baseURL) return Response.json({ error: "api not configured" }, { status: 503 });

  // 将表单字段格式化为清单，送入 LLM 用户消息
  const lines: string[] = [
    `场景模板：${body.scene || "（不使用预设）"}`,
    `场景分类：${body.sceneCat || "农旅融合"}`,
    `提示词：${body.prompt.trim()}`,
    `视频模型：${body.model || "Seedance 1.5 Pro"}`,
    `视频比例：${body.ratio || "智能"}`,
    `视频时长：${body.durSec ?? 5}秒`,
    `视频质量：${body.quality || "720P"}`,
    `视频风格：${body.style || "智能匹配"}`,
    `同时生成声音：${body.genAudio !== false ? "开启" : "关闭"}`,
  ];
  if (body.genAudio !== false) {
    lines.push(`配音：${body.voice || "温柔女声"}`);
    lines.push(`背景音乐：${body.bgm || "舒缓"}`);
  }
  lines.push(`生成数量：${body.count ?? 1}`);
  if (body.useKB) {
    lines.push(`本地增强：开启${body.county ? `（${body.county}）` : ""}`);
    if (body.kbContext) lines.push(`本地知识库：\n${body.kbContext}`);
  } else {
    lines.push("本地增强：关闭");
  }
  const userContent = lines.join("\n");

  const r = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_VIDEO_GENERATE },
        { role: "user", content: userContent },
      ],
      max_tokens: 800,
      stream: false,
      enable_thinking: false,
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);

  if (!r?.ok) return Response.json({ error: "llm error" }, { status: 500 });

  const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";

  // 去除模型可能额外包裹的 markdown 代码块标记
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as VideoGenerateOutput;
    return Response.json(parsed);
  } catch {
    // 解析失败：把原始提示词透传回去，前端降级手动组装
    return Response.json({ finalPrompt: body.prompt.trim(), appliedStyle: body.style ?? "智能匹配", notes: [] });
  }
}
