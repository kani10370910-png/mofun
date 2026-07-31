import { NextRequest } from "next/server";
import { SYSTEM_AVATAR_DESC_OPTIMIZE } from "@/lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 数字人 AI 生图·人物形象描述优化：把用户简短角色描述润色为高质量文生图人像描述。
   入参：{ input: string; gender?: string; age?: string }
   返回：{ text: string | null } */

export async function POST(req: NextRequest) {
  const { input, gender, age } = (await req.json()) as {
    input?: string;
    gender?: string; // 男/女
    age?: string; // 儿童/青年/老年
  };
  if (!input?.trim()) return Response.json({ text: null }, { status: 400 });

  const apiKey = process.env.IMAGE_API_KEY || process.env.LLM_API_KEY || "";
  const baseURL = (process.env.IMAGE_BASE_URL || process.env.LLM_BASE_URL || "").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "qwen3-max-2026-01-23";
  if (!apiKey || !baseURL) return Response.json({ text: null }, { status: 503 });

  // 把已选的性别/年龄作为约束一并给模型，避免优化后与用户所选不一致
  const ctx = [gender ? `性别：${gender}` : "", age ? `年龄：${age}` : ""].filter(Boolean).join("，");
  const userContent = ctx ? `${input.trim()}（${ctx}）` : input.trim();

  const r = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_AVATAR_DESC_OPTIMIZE },
        { role: "user", content: userContent },
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
