import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 文生图：OpenAI 兼容的 /images/generations（AnyFast 等）。
   读 IMAGE_API_KEY / IMAGE_BASE_URL / IMAGE_MODEL，密钥不进前端。
   返回 { images: string[] }，元素为图片 URL 或 data URL。 */
export async function POST(req: NextRequest) {
  let body: { prompt?: string; size?: string; n?: number; model?: string; image?: string | string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const prompt = (body.prompt || "").trim();
  if (!prompt) return Response.json({ error: "缺少 prompt" }, { status: 400 });

  const apiKey = process.env.IMAGE_API_KEY || "";
  if (!apiKey) {
    return Response.json(
      { error: "尚未配置文生图 API Key：请在 .env.local 填写 IMAGE_API_KEY 后重启服务。" },
      { status: 503 },
    );
  }
  const baseURL = (process.env.IMAGE_BASE_URL || "https://www.anyfast.ai/v1").replace(/\/$/, "");
  const model = body.model || process.env.IMAGE_MODEL || "dall-e-3";
  const timeoutMs = Number(process.env.IMAGE_TIMEOUT_MS || 120000);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: body.n || 1,
      // 豆包 Seedream 等模型要求图片不小于约 369 万像素（1920×1920），默认用 2048 见方
      size: body.size || "2048x2048",
      // 图生图：传参考图（公网 URL）以保持人物一致性；不传则纯文生图。
      // 豆包 Seedream 4.0+ 支持在 generations 接口里带 image 作参考。
      ...(body.image ? { image: body.image } : {}),
    }),
    signal: ctrl.signal,
  };

  // 连接偶发被重置（ECONNRESET，常见于本机代理抖动）时自动重试，最多 3 次、退避递增
  let upstream: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      upstream = await fetch(`${baseURL}/images/generations`, init);
      break;
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || attempt === 2) {
        clearTimeout(timer);
        return Response.json({ error: "无法连接文生图服务，请检查网络或 IMAGE_BASE_URL。" }, { status: 502 });
      }
      await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
    }
  }
  clearTimeout(timer);
  if (!upstream) {
    return Response.json({ error: "无法连接文生图服务，请检查网络或 IMAGE_BASE_URL。" }, { status: 502 });
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    return Response.json(
      { error: `文生图服务返回错误（${upstream.status}）。${text.slice(0, 300)}` },
      { status: 502 },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return Response.json({ error: "文生图返回解析失败。" }, { status: 502 });
  }

  // 兼容 OpenAI 格式：data[].url 或 data[].b64_json
  const data = (json as { data?: Array<{ url?: string; b64_json?: string }> })?.data || [];
  const images = data
    .map((d) => (d.url ? d.url : d.b64_json ? `data:image/png;base64,${d.b64_json}` : ""))
    .filter(Boolean);

  if (!images.length) {
    return Response.json({ error: "文生图未返回图片。" }, { status: 502 });
  }
  return Response.json({ images });
}

