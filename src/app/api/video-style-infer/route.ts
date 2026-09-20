import { NextRequest } from "next/server";
import { SYSTEM_VIDEO_STYLE_INFER } from "@/lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 智能匹配：根据用户的视频描述预测最贴合的视频风格。
   入参：{ input: string }
   返回：{ style: "写实" | "纪录片" | "航拍大片" | "温暖治愈" | "电影感" | "国风水墨" | null } */

const STYLE_OPTIONS = ["写实", "纪录片", "航拍大片", "温暖治愈", "电影感", "国风水墨"] as const;

export async function POST(req: NextRequest) {
  const { input } = (await req.json()) as { input?: string };
  if (!input?.trim()) return Response.json({ style: null }, { status: 400 });

  const apiKey = process.env.IMAGE_API_KEY || process.env.LLM_API_KEY || "";
  const baseURL = (process.env.IMAGE_BASE_URL || process.env.LLM_BASE_URL || "").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "qwen3.8-27b";

  if (!apiKey || !baseURL) return Response.json({ style: null }, { status: 503 });

  const r = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_VIDEO_STYLE_INFER },
        { role: "user", content: input.trim() },
      ],
      max_tokens: 16,
      stream: false,
      enable_thinking: false,
    }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  if (!r?.ok) return Response.json({ style: null });

  const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  const style = STYLE_OPTIONS.find((o) => text.includes(o)) ?? null;
  return Response.json({ style });
}
