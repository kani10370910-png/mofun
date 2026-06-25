import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 多模态视觉理解：OpenAI 兼容的 /chat/completions（messages 里带 image_url）。
   用于「IP故事」根据图片识别 IP 形象描述。

   走视觉网关（默认复用图像网关 anyfast 的 Key/BaseURL，可用 VISION_* 覆盖）：
   - VISION_API_KEY  | 回退 IMAGE_API_KEY
   - VISION_BASE_URL | 回退 IMAGE_BASE_URL
   - VISION_MODEL    | 默认 doubao-seed-1-6-250615（豆包视觉），按网关支持的模型改

   入参：{ image: string(URL 或 data URL), prompt?: string }
   返回：{ text: string } —— 模型对图片的文字描述。 */
export async function POST(req: NextRequest) {
  let body: { image?: string; prompt?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const image = (body.image || "").trim();
  if (!image) return Response.json({ error: "缺少图片" }, { status: 400 });

  const apiKey = process.env.VISION_API_KEY || process.env.IMAGE_API_KEY || "";
  if (!apiKey) {
    return Response.json(
      { error: "尚未配置视觉模型 API Key：请在 .env.local 填写 VISION_API_KEY 或 IMAGE_API_KEY 后重启服务。" },
      { status: 503 },
    );
  }
  const baseURL = (process.env.VISION_BASE_URL || process.env.IMAGE_BASE_URL || "https://www.anyfast.com.cn/v1").replace(/\/$/, "");
  const model = process.env.VISION_MODEL || "doubao-seed-1-6-250615";
  const timeoutMs = Number(process.env.VISION_TIMEOUT_MS || 60000);

  const prompt =
    body.prompt?.trim() ||
    "请用一段话客观描述这张图里的IP/卡通形象的外观特征（造型、配色、服饰、表情、标志性元素、风格定位等），" +
      "便于据此撰写IP故事。80字以内，只输出描述本身，不要标题、不要换行。";

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
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
      temperature: 0.5,
      stream: false,
    }),
    signal: ctrl.signal,
  };

  // 连接偶发被重置（ECONNRESET，常见于本机代理抖动）时自动重试，最多 3 次、退避递增
  let upstream: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      upstream = await fetch(`${baseURL}/chat/completions`, init);
      break;
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || attempt === 2) {
        clearTimeout(timer);
        return Response.json({ error: "无法连接视觉模型服务，请检查网络或 VISION_BASE_URL。" }, { status: 502 });
      }
      await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
    }
  }
  clearTimeout(timer);
  if (!upstream) {
    return Response.json({ error: "无法连接视觉模型服务，请检查网络或 VISION_BASE_URL。" }, { status: 502 });
  }

  const raw = await upstream.text();
  if (!upstream.ok) {
    return Response.json(
      { error: `视觉模型服务返回错误（${upstream.status}）。${raw.slice(0, 300)}` },
      { status: 502 },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "视觉模型返回解析失败。" }, { status: 502 });
  }

  const text =
    (json as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content || "";
  if (!text.trim()) {
    return Response.json({ error: "视觉模型未返回描述。" }, { status: 502 });
  }
  return Response.json({ text: text.trim() });
}
