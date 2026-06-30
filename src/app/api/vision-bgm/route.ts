import { NextRequest } from "next/server";
import { SYSTEM_VIDEO_BGM_INFER } from "@/lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 根据视频首帧画面自动推荐背景音乐风格。
   入参：{ imageUrl: string }
   返回：{ bgm: "舒缓" | "轻快" | "大气" | "国风" | null } */

const BGM_OPTIONS = ["舒缓", "轻快", "大气", "国风"] as const;

export async function POST(req: NextRequest) {
  const { imageUrl } = (await req.json()) as { imageUrl?: string };
  if (!imageUrl) return Response.json({ bgm: null }, { status: 400 });

  const apiKey = process.env.VISION_API_KEY || process.env.IMAGE_API_KEY || "";
  const baseURL = (process.env.VISION_BASE_URL || process.env.IMAGE_BASE_URL || "").replace(/\/$/, "");
  // qwen3-max-2026-01-23 支持视觉，且在当前网关已验证可用
  const model = process.env.VISION_MODEL || "qwen3-max-2026-01-23";

  if (!apiKey || !baseURL) return Response.json({ bgm: null }, { status: 503 });

  const r = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_VIDEO_BGM_INFER },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: "推荐背景音乐风格" },
          ],
        },
      ],
      max_tokens: 8,
      stream: false,
      enable_thinking: false,
    }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  if (!r?.ok) return Response.json({ bgm: null });

  const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  const bgm = BGM_OPTIONS.find((o) => text.includes(o)) ?? null;
  return Response.json({ bgm });
}
