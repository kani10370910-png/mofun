import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 视频生成通常需要 90-150s，留足余量

// Anyfast Seedance: ratio 字段直接传，智能 → adaptive
const SEEDANCE_RATIO_MAP: Record<string, string> = { "智能": "adaptive" };

// Kling: aspect_ratio 不支持 21:9 和智能
const KLING_ASPECT_MAP: Record<string, string> = { "21:9": "16:9", "智能": "16:9" };

function isKlingModel(model: string) {
  return model.startsWith("kling-");
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    prompt: string;
    ratio: string;
    dur: string;
    model?: string;
    imageUrl?: string;
    generateAudio?: boolean; // 让视频模型自带音频（Seedance 原生能力）
  };

  const apiKey  = process.env.VIDEO_API_KEY  || process.env.IMAGE_API_KEY  || "";
  const baseURL = (process.env.VIDEO_BASE_URL || process.env.IMAGE_BASE_URL || "").replace(/\/$/, "");
  const model   = body.model || process.env.VIDEO_MODEL || "seedance-2.0";

  console.log("[video] model:", model, "| baseURL:", baseURL || "(empty)", "| key:", apiKey ? "set" : "MISSING");
  if (!apiKey || !baseURL) return Response.json({ error: "no API key" }, { status: 503 });

  const duration = parseInt(String(body.dur).match(/\d+/)?.[0] ?? "5", 10);
  const headers  = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };

  if (isKlingModel(model)) {
    return handleKling({ baseURL, headers, model, body, duration });
  }
  return handleSeedance({ baseURL, headers, model, body, duration, generateAudio: body.generateAudio !== false });
}

/* ---------- Seedance (Anyfast) ----------
   文档：POST /v1/video/generations
   body: { model, content: [...], ratio, duration, resolution, generate_audio }
   content 数组：text + 可选 image_url(role: first_frame)
   轮询：GET /v1/video/generations/{id}，status === "succeeded"
*/
async function handleSeedance(p: {
  baseURL: string;
  headers: Record<string, string>;
  model: string;
  body: { prompt: string; ratio: string; imageUrl?: string };
  duration: number;
  generateAudio: boolean;
}): Promise<Response> {
  const ratio = SEEDANCE_RATIO_MAP[p.body.ratio] ?? p.body.ratio;

  const content: Array<Record<string, unknown>> = [];
  if (p.body.prompt) content.push({ type: "text", text: p.body.prompt });
  if (p.body.imageUrl) {
    content.push({
      type: "image_url",
      image_url: { url: p.body.imageUrl },
      role: "first_frame",
    });
  }

  const submitBody: Record<string, unknown> = {
    model: p.model,
    content,
    ratio,
    duration: p.duration,
    resolution: "720p",
    generate_audio: p.generateAudio,
    watermark: false,
  };

  const submitRes = await fetch(`${p.baseURL}/v1/video/generations`, {
    method: "POST",
    headers: p.headers,
    body: JSON.stringify(submitBody),
    signal: AbortSignal.timeout(40_000), // i2v 携带图片，上传可能较慢
  }).catch(() => null);

  if (!submitRes?.ok) {
    const raw = await submitRes?.json().catch(() => ({})) as { error?: { message?: string }; message?: string; code?: string };
    const errMsg = raw?.error?.message ?? raw?.message ?? raw?.code ?? `HTTP ${submitRes?.status ?? "??"}`;
    console.error("[video/seedance] submit failed", submitRes?.status, errMsg);
    return Response.json({ error: errMsg }, { status: submitRes?.status ?? 503 });
  }

  const data = await submitRes.json() as { id?: string; task_id?: string; video_url?: string; status?: string };
  console.log("[video/seedance] submit ok →", JSON.stringify(data).slice(0, 200));

  // 同步直接返回
  if (data?.video_url) return Response.json({ videoUrl: data.video_url });

  const taskId = data?.id ?? data?.task_id;
  if (!taskId) return Response.json({ error: "no task_id", raw: data }, { status: 502 });

  // 异步轮询（视频生成通常 90-150s，给 270s 余量）
  const deadline = Date.now() + 270_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2_000));
    const pr = await fetch(`${p.baseURL}/v1/video/generations/${taskId}`, {
      headers: p.headers,
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null);
    if (!pr?.ok) continue;
    const pd = await pr.json() as {
      status?: string;
      video_url?: string;
      url?: string;
      task_id?: string;
      data?: {
        status?: string;
        video_url?: string;
        result_url?: string;
        fail_reason?: string;
        data?: { content?: { video_url?: string }; status?: string };
      };
    };
    console.log("[video/seedance] poll →", JSON.stringify(pd).slice(0, 300));
    const status   = pd?.status ?? pd?.data?.status ?? pd?.data?.data?.status;
    const videoUrl =
      pd?.video_url ??
      pd?.url ??
      pd?.data?.video_url ??
      pd?.data?.result_url ??
      pd?.data?.data?.content?.video_url;
    // Anyfast 状态值可能是 succeeded / completed / SUCCESS（文档不统一）
    if (videoUrl && (status === "succeeded" || status === "completed" || status === "SUCCESS")) {
      return Response.json({ videoUrl });
    }
    if (videoUrl && !status) return Response.json({ videoUrl });
    if (status === "failed" || status === "error" || status === "FAILED") {
      const reason = pd?.data?.fail_reason || "generation failed";
      return Response.json({ error: reason }, { status: 500 });
    }
  }
  return Response.json({ error: "timeout" }, { status: 504 });
}

/* ---------- Kling (快手) ---------- */
async function handleKling(p: {
  baseURL: string;
  headers: Record<string, string>;
  model: string;
  body: { prompt: string; ratio: string; imageUrl?: string };
  duration: number;
}): Promise<Response> {
  const aspect   = KLING_ASPECT_MAP[p.body.ratio] ?? p.body.ratio;
  const endpoint = p.body.imageUrl ? "image2video" : "text2video";

  const klingBody: Record<string, unknown> = {
    model: p.model,
    prompt: p.body.prompt,
    aspect_ratio: aspect,
    duration: p.duration,
  };
  if (p.body.imageUrl) klingBody.image_url = p.body.imageUrl;

  const submitRes = await fetch(`${p.baseURL}/kling/v1/videos/${endpoint}`, {
    method: "POST",
    headers: p.headers,
    body: JSON.stringify(klingBody),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  if (!submitRes?.ok) {
    const err = await submitRes?.json().catch(() => ({}));
    console.error("[video/kling] submit failed", submitRes?.status, JSON.stringify(err));
    return Response.json({ error: err }, { status: submitRes?.status ?? 503 });
  }

  const data = await submitRes.json() as { data?: { task_id?: string }; task_id?: string };
  const taskId = data?.data?.task_id ?? data?.task_id;
  if (!taskId) return Response.json({ error: "no task_id", raw: data }, { status: 502 });

  const deadline = Date.now() + 270_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2_000));
    const pr = await fetch(`${p.baseURL}/kling/v1/videos/${taskId}`, {
      headers: p.headers,
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null);
    if (!pr?.ok) continue;
    const pd = await pr.json() as {
      data?: { task_status?: string; task_result?: { videos?: { url: string }[] } };
    };
    const status   = pd?.data?.task_status;
    const videoUrl = pd?.data?.task_result?.videos?.[0]?.url;
    if (videoUrl) return Response.json({ videoUrl });
    if (status === "failed") return Response.json({ error: "generation failed", raw: pd }, { status: 500 });
  }
  return Response.json({ error: "timeout" }, { status: 504 });
}
