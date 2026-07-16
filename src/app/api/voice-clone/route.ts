import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* ============================================================
   声音复刻（使用自己的声音）· 火山 Mega TTS 声音复刻
   --------------------------------------------------------
   录一段/上传一段自己的声音 → 训练成一个 speaker_id →
   之后台词就能用「你的声音」合成（合成走 /api/tts 的 clone 分支，
   cluster=volcano_icl，voice_type=该 speaker_id）。

   需要在火山控制台开通「声音复刻」并申请 speaker_id 名额，然后配：
     VOLC_TTS_APPID / VOLC_TTS_TOKEN           （与普通 TTS 共用）
     VOLC_ICL_SPEAKER_IDS = S_xxx,S_yyy,...     （已申请的可用音色 id，逗号分隔）
   服务端读取，不外泄。

   动作：
   - action:"train"  { audio(base64), format, speakerId? } → 上传音频训练，返回 speakerId
   - action:"status" { speakerId } → 查询训练状态，done/ok
   ============================================================ */

const HOST = "https://openspeech.bytedance.com";
// 声音复刻资源标识：声音复刻2.0(大模型)=seed-icl-2.0；1.0=seed-icl-1.0。可用 env 覆盖。
const RESOURCE = process.env.VOLC_ICL_RESOURCE_ID || "seed-icl-2.0";
// 训练模型：0=MEGA 1=ICL1.0 2=DiT标准 3=DiT还原 4=ICL2.0 5=ICL3.0。大模型复刻用 4。
const MODEL_TYPE = Number(process.env.VOLC_ICL_MODEL_TYPE || 4);

export async function POST(req: NextRequest) {
  let body: { action?: string; audio?: string; format?: string; speakerId?: string; used?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const appid = process.env.VOLC_TTS_APPID || "";
  const token = process.env.VOLC_TTS_TOKEN || "";
  const speakerPool = (process.env.VOLC_ICL_SPEAKER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!appid || !token) {
    return Response.json(
      { error: "尚未配置火山语音凭据：请在 .env.local 填写 VOLC_TTS_APPID / VOLC_TTS_TOKEN。" },
      { status: 503 },
    );
  }
  if (!speakerPool.length) {
    return Response.json(
      { error: "尚未配置声音复刻名额：请在火山控制台开通「声音复刻」并把申请到的 speaker_id 填到 .env.local 的 VOLC_ICL_SPEAKER_IDS（逗号分隔）。" },
      { status: 503 },
    );
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer;${token}`,
    "Resource-Id": RESOURCE,
  };

  // 查询训练状态
  if (body.action === "status") {
    const speakerId = (body.speakerId || "").trim();
    if (!speakerId) return Response.json({ error: "缺少 speakerId" }, { status: 400 });
    try {
      const r = await fetch(`${HOST}/api/v1/mega_tts/status`, {
        method: "POST",
        headers,
        body: JSON.stringify({ appid, speaker_id: speakerId }),
        signal: AbortSignal.timeout(30_000),
      });
      const j = (await r.json().catch(() => ({}))) as { status?: number; message?: string; BaseResp?: { StatusMessage?: string } };
      // 火山 status：0 未找到 / 1 训练中 / 2 成功 / 3 失败 / 4 可用
      const st = Number(j.status);
      const ok = st === 2 || st === 4;
      const failed = st === 3;
      return Response.json({
        speakerId,
        status: st,
        done: ok || failed,
        ok,
        message: j.message || j.BaseResp?.StatusMessage || "",
      });
    } catch (e) {
      return Response.json({ error: `查询状态失败：${String(e instanceof Error ? e.message : e)}` }, { status: 502 });
    }
  }

  // 训练（上传音频）
  const audio = body.audio || "";
  if (!audio) return Response.json({ error: "缺少 audio（base64 音频）" }, { status: 400 });
  const b64 = audio.replace(/^data:[^;]+;base64,/, "");
  const format = (body.format || "mp3").replace(/[^a-z0-9]/gi, "").toLowerCase() || "mp3";
  // 分配一个可用的 speaker_id：优先取「池中还没被用过」的（used 由前端传已克隆的音色 id），
  // 都用过则退回池中第一个（覆盖重训）。指定 speakerId 时以它为准。
  const used = Array.isArray(body.used) ? body.used : [];
  const speakerId = (body.speakerId || speakerPool.find((id) => !used.includes(id)) || speakerPool[0]).trim();

  try {
    const r = await fetch(`${HOST}/api/v1/mega_tts/audio/upload`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        appid,
        speaker_id: speakerId,
        audios: [{ audio_bytes: b64, audio_format: format }],
        source: 2,
        language: 0, // 0=中文
        model_type: MODEL_TYPE, // 4=ICL2.0 大模型声音复刻
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const j = (await r.json().catch(() => ({}))) as { BaseResp?: { StatusCode?: number; StatusMessage?: string }; speaker_id?: string; message?: string };
    const code = j.BaseResp?.StatusCode;
    if (r.ok && (code === 0 || code === undefined)) {
      return Response.json({ speakerId, submitted: true });
    }
    return Response.json(
      { error: `提交训练失败：${j.BaseResp?.StatusMessage || j.message || `HTTP ${r.status}`}` },
      { status: 502 },
    );
  } catch (e) {
    return Response.json({ error: `提交训练失败：${String(e instanceof Error ? e.message : e)}` }, { status: 502 });
  }
}
