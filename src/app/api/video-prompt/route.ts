import { NextRequest } from "next/server";
import { SYSTEM_VIDEO_PROMPT_OPTIMIZE } from "@/lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 根据用户的简短视频描述，优化为适合视频生成模型的专业提示词。
   入参：{ input: string; style?: string }
   返回：{ text: string | null } */

export async function POST(req: NextRequest) {
  const { input, style, targetChars, prevContext } = (await req.json()) as {
    input?: string;
    style?: string;
    targetChars?: number;
    prevContext?: string; // 上一镜头画面内容，用于镜头间叙事衔接
  };
  if (!input?.trim()) return Response.json({ text: null }, { status: 400 });
  const userContent = style ? `${input.trim()}，风格：${style}` : input.trim();

  const apiKey = process.env.IMAGE_API_KEY || process.env.LLM_API_KEY || "";
  const baseURL = (process.env.IMAGE_BASE_URL || process.env.LLM_BASE_URL || "").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "qwen3-max-2026-01-23";

  if (!apiKey || !baseURL) return Response.json({ text: null }, { status: 503 });

  // 可选：调用方指定目标字数（覆盖系统提示词内的 180–220 字长度规则）
  const messages: Array<{ role: string; content: string }> = [{ role: "system", content: SYSTEM_VIDEO_PROMPT_OPTIMIZE }];
  if (targetChars && targetChars > 0) {
    messages.push({ role: "system", content: `本次请将输出长度控制在约 ${targetChars} 字左右，覆盖前述长度规则。` });
  }
  // 可选：前面所有镜头内容，用于全片叙事衔接
  if (prevContext && prevContext.trim()) {
    messages.push({
      role: "system",
      content: `前面各镜头的画面内容依次如下：\n${prevContext.trim()}\n本镜头需在上述整段叙事脉络基础上自然承接、连贯过渡，与前面所有镜头在场景、主体、风格与镜头运动上保持一致连贯，形成流畅递进的故事线，避免割裂或跳跃。`,
    });
  }
  messages.push({ role: "user", content: userContent });
  const maxTokens = targetChars && targetChars > 0 ? Math.min(1200, Math.round(targetChars * 2.2)) : 400;

  const r = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
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
