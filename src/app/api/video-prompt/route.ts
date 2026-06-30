import { NextRequest } from "next/server";
import { SYSTEM_VIDEO_PROMPT_OPTIMIZE } from "@/lib/prompts";

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
        { role: "system", content: SYSTEM_VIDEO_PROMPT_OPTIMIZE },
        { role: "user", content: input.trim() },
      ],
      max_tokens: 400,
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
