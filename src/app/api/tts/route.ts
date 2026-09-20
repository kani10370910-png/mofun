import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 真实语音合成（TTS）：火山「语音合成大模型」seed-tts-2.0（豆包 BigTTS）。
   读 VOLC_TTS_APPID / VOLC_TTS_TOKEN（服务端，不进前端），走 openspeech /api/v1/tts，cluster volcano_tts。
   入参 { text, voice(=voice_type 音色id), speed?, volume?, pitch?, emotion? }；返回二进制 mp3。 */
export async function POST(req: NextRequest) {
  let body: { text?: string; voice?: string; speed?: number; volume?: number; pitch?: number; emotion?: string; clone?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const text = (body.text || "").trim();
  if (!text) return Response.json({ error: "缺少 text" }, { status: 400 });
  if (text.length > 500) return Response.json({ error: "文本过长（≤500 字）" }, { status: 400 });

  const appid = process.env.VOLC_TTS_APPID || "";
  const token = process.env.VOLC_TTS_TOKEN || "";
  if (!appid || !token) {
    return Response.json(
      { error: "尚未配置火山语音凭据：请在 .env.local 填写 VOLC_TTS_APPID / VOLC_TTS_TOKEN 后重启服务。" },
      { status: 503 },
    );
  }
  const voice = (body.voice || "zh_female_shuangkuaisisi_moon_bigtts").trim();
  // 声音复刻音色（自己的声音）：voice_type 是 speaker_id（S_xxx），走 ICL 集群 + 声音复刻 Resource-Id
  const isClone = body.clone === true || /^S_/.test(voice);
  const cluster = isClone
    ? process.env.VOLC_ICL_CLUSTER || "volcano_icl"
    : process.env.VOLC_TTS_CLUSTER || "volcano_tts";

  const clamp = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, n)) : d;
  };
  // 大模型(BigTTS)音色只支持 speed_ratio + loudness_ratio；pitch 不支持（传了会被误判到小模型 → unsupported language）
  const speed_ratio = clamp(body.speed, 0.5, 2, 1); // 语速
  const loudness_ratio = clamp(body.volume, 0.5, 2, 1); // 音量（前端把 1–10 映射为比例）
  const emotion = (body.emotion || "").trim();

  const payload = {
    app: { appid, token, cluster },
    user: { uid: "mofun" },
    audio: {
      voice_type: voice,
      encoding: "mp3",
      speed_ratio,
      ...(loudness_ratio !== 1 ? { loudness_ratio } : {}),
      // 多情感音色可带 emotion（happy/sad/angry/surprise/neutral），非多情感音色不传
      ...(emotion ? { emotion, enable_emotion: true } : {}),
    },
    request: {
      reqid: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      text,
      operation: "query",
    },
  };

  let r: Response;
  try {
    r = await fetch("https://openspeech.bytedance.com/api/v1/tts", {
      method: "POST",
      // V1 合成接口靠 cluster(volcano_icl) 路由到复刻音色，无需额外 Resource-Id 头
      headers: { "Content-Type": "application/json", Authorization: `Bearer;${token}` }, // 火山要求分号格式
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(Number(process.env.TTS_TIMEOUT_MS || 30000)),
    });
  } catch {
    return Response.json({ error: "无法连接火山语音服务，请检查网络或稍后重试。" }, { status: 502 });
  }

  const j = (await r.json().catch(() => ({}))) as { code?: number; message?: string; data?: string };
  // 火山成功码 = 3000，data 为 base64 音频
  if (j.code === 3000 && j.data) {
    const buf = Buffer.from(j.data, "base64");
    if (!buf.byteLength) return Response.json({ error: "火山合成未返回音频。" }, { status: 502 });
    return new Response(buf, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  }

  // 常见失败：音色未在账号开通（3001 resource not granted）
  const msg = j.message || `火山语音返回错误（${r.status}）`;
  const friendly = /not granted|resource|未.*开通|授权/i.test(msg)
    ? `该音色未在你的火山账号开通（voice_type=${voice}）。请到火山控制台开通该音色，或换一个已开通的音色。`
    : msg;
  return Response.json({ error: friendly }, { status: 502 });
}
