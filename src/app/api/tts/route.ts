import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 真实语音合成（TTS）：OpenAI 兼容的 /audio/speech（AnyFast 等网关）。
   读 TTS_API_KEY / TTS_BASE_URL / TTS_MODEL（留空则复用文生图的 IMAGE_* 配置与同一网关）。
   入参 { text, voice }，voice 为应用内中文音色名，按下表映射到网关音色；返回二进制音频（mp3）。
   密钥只在服务端使用，不进前端。 */

// 应用内音色名 → OpenAI 兼容网关音色 id（可用 TTS_VOICE_xxx 环境变量覆盖）
function mapVoice(voice?: string): string {
  const v = (voice || "").trim();
  const table: Record<string, string> = {
    温柔女声: process.env.TTS_VOICE_FEMALE || "nova",
    沉稳男声: process.env.TTS_VOICE_MALE || "onyx",
    活力男声: process.env.TTS_VOICE_ENERGETIC || "echo",
  };
  if (table[v]) return table[v];
  // 已是网关音色 id（如 nova/onyx/alloy…）则直接透传，否则用默认女声
  if (/^[a-z][a-z0-9_-]{1,30}$/i.test(v)) return v;
  return process.env.TTS_VOICE_DEFAULT || "nova";
}

export async function POST(req: NextRequest) {
  let body: { text?: string; voice?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const text = (body.text || "").trim();
  if (!text) return Response.json({ error: "缺少 text" }, { status: 400 });
  if (text.length > 1000) return Response.json({ error: "文本过长（≤1000 字）" }, { status: 400 });

  // 复用文生图网关：TTS_* 优先，未配置则回退 IMAGE_*（多数 OpenAI 兼容网关同一 key 同时支持图像与语音）
  const apiKey = process.env.TTS_API_KEY || process.env.IMAGE_API_KEY || "";
  if (!apiKey) {
    return Response.json(
      { error: "尚未配置语音合成 API Key：请在 .env.local 填写 TTS_API_KEY（或复用 IMAGE_API_KEY）后重启服务。" },
      { status: 503 },
    );
  }
  // 归一化到 `<root>/v1`：无论配的是网关根（…com.cn）还是已带 /v1，都拼成 …/v1/audio/speech
  const rawBase = (process.env.TTS_BASE_URL || process.env.IMAGE_BASE_URL || "https://www.anyfast.com.cn").replace(/\/+$/, "");
  const baseURL = /\/v\d+$/.test(rawBase) ? rawBase : `${rawBase}/v1`;
  const model = body.model || process.env.TTS_MODEL || "tts-1";
  const voice = mapVoice(body.voice);
  const timeoutMs = Number(process.env.TTS_TIMEOUT_MS || 60000);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, voice, input: text, response_format: "mp3" }),
    signal: ctrl.signal,
  };

  let upstream: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      upstream = await fetch(`${baseURL}/audio/speech`, init);
      break;
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || attempt === 2) {
        clearTimeout(timer);
        return Response.json({ error: "无法连接语音合成服务，请检查网络或 TTS_BASE_URL。" }, { status: 502 });
      }
      await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
    }
  }
  clearTimeout(timer);
  if (!upstream) {
    return Response.json({ error: "无法连接语音合成服务。" }, { status: 502 });
  }

  if (!upstream.ok) {
    const errText = await upstream.text();
    return Response.json(
      { error: `语音合成服务返回错误（${upstream.status}）。${errText.slice(0, 300)}` },
      { status: 502 },
    );
  }

  // 直接把音频字节透传给前端播放
  const audio = await upstream.arrayBuffer();
  if (!audio.byteLength) {
    return Response.json({ error: "语音合成未返回音频。" }, { status: 502 });
  }
  const ct = upstream.headers.get("content-type") || "audio/mpeg";
  return new Response(audio, {
    status: 200,
    headers: {
      "Content-Type": ct.includes("audio") ? ct : "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
