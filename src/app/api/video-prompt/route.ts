import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 根据用户的简短视频描述，优化为适合视频生成模型的专业提示词。
   入参：{ input: string }
   返回：{ text: string | null } */

export async function POST(req: NextRequest) {
  const { input } = (await req.json()) as { input?: string };
  if (!input?.trim()) return Response.json({ text: null }, { status: 400 });

  const apiKey = process.env.IMAGE_API_KEY || process.env.LLM_API_KEY || "";
  const baseURL = (process.env.IMAGE_BASE_URL || process.env.LLM_BASE_URL || "").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "qwen3-max-2026-01-23";

  if (!apiKey || !baseURL) return Response.json({ text: null }, { status: 503 });

  const r = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "你是专业的AI视频生成提示词优化专家。用户输入视频主题或简短描述，你改写为适合视频生成模型的专业提示词。" +
            "要求：①保留用户原意与核心主体；②补充镜头运动（如航拍俯瞰缓缓推近、水平平移跟拍）；" +
            "③补充光线氛围（如晨光逆光暖色调、黄金时刻柔光）；④补充画面质感（如电影质感、浅景深、4K清晰）；" +
            "⑤结构流畅，不超过120字；⑥只输出优化后的提示词本身，不要加任何解释、前缀或引号。",
        },
        { role: "user", content: input.trim() },
      ],
      max_tokens: 250,
      stream: false,
      enable_thinking: false,
    }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  if (!r?.ok) return Response.json({ text: null });

  const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() ?? null;
  return Response.json({ text });
}
