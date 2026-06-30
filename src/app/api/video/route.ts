import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Seedance (字节跳动): /v1/video/generations，size 用像素尺寸
const SEEDANCE_SIZE_MAP: Record<string, string> = {
  "16:9": "1280x720",
  "9:16": "720x1280",
  "1:1":  "720x720",
  "4:3":  "960x720",
  "3:4":  "720x960",
  "21:9": "1280x549",
  "智能":  "1280x720",
};

// Kling (快手): /kling/v1/videos/*, aspect_ratio 直接传比例字符串
const KLING_ASPECT_MAP: Record<string, string> = {
  "21:9": "16:9",
  "智能":  "16:9",
};

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
  };

  const apiKey  = process.env.VIDEO_API_KEY  || process.env.IMAGE_API_KEY  || "";
  const baseURL = (process.env.VIDEO_BASE_URL || process.env.IMAGE_BASE_URL || "").replace(/\/$/, "");
  const model   = body.model || process.env.VIDEO_MODEL || "doubao-seed-2.0-pro";

  if (!apiKey || !baseURL) return Response.json({ error: "no API key" }, { status: 503 });

  const duration = parseInt(String(body.dur).match(/\d+/)?.[0] ?? "5", 10);
  const headers  = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };

  if (isKlingModel(model)) {
    return handleKling({ baseURL, headers, model, body, duration });
  }
  return handleSeedance({ baseURL, headers, model, body, duration });
}

/* ---------- Seedance ---------- */
async function handleSeedance(p: {
  baseURL: string;
  headers: Record<string, string>;
  model: string;
  body: { prompt: string; ratio: string; imageUrl?: string };
  duration: number;
}): Promise<Response> {
  const size = SEEDANCE_SIZE_MAP[p.body.ratio] ?? "1280x720";
  const submitBody: Record<string, unknown> = {
    model: p.model,
    prompt: p.body.prompt,
    size,
    duration: p.duration,
  };
  if (p.body.imageUrl) submitBody.image_url = p.body.imageUrl;

  const submitRes = await fetch(`${p.baseURL}/v1/video/generations`, {
    method: "POST",
    headers: p.headers,
    body: JSON.stringify(submitBody),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  if (!submitRes?.ok) {
    const err = await submitRes?.json().catch(() => ({}));
    return Response.json({ error: err }, { status: submitRes?.status ?? 503 });
  }

  const data = await submitRes.json();

  // 同步返回
  const directUrl =
    (data as Record<string, unknown>)?.video_url ??
    (data as { url?: string })?.url ??
    (data as { data?: { video_url?: string } })?.data?.video_url;
  if (typeof directUrl === "string" && directUrl) return Response.json({ videoUrl: directUrl });

  // 异步轮询
  const taskId: string | undefined =
    (data as { id?: string })?.id ??
    (data as { task_id?: string })?.task_id ??
    (data as { data?: { id?: string } })?.data?.id;
  if (!taskId) return Response.json({ error: "unknown response", raw: data }, { status: 502 });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4_000));
    const pr = await fetch(`${p.baseURL}/v1/video/generations/${taskId}`, {
      headers: p.headers,
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!pr?.ok) continue;
    const pd = await pr.json() as {
      video_url?: string;
      url?: string;
      status?: string;
      data?: { video_url?: string; status?: string };
    };
    const videoUrl = pd?.video_url ?? pd?.url ?? pd?.data?.video_url;
    const status   = pd?.status   ?? pd?.data?.status;
    if (videoUrl) return Response.json({ videoUrl });
    if (status === "failed" || status === "error") {
      return Response.json({ error: "generation failed", raw: pd }, { status: 500 });
    }
  }
  return Response.json({ error: "timeout" }, { status: 504 });
}

/* ---------- Kling ---------- */
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
    return Response.json({ error: err }, { status: submitRes?.status ?? 503 });
  }

  const data = await submitRes.json() as {
    data?: { task_id?: string };
    task_id?: string;
  };
  const taskId = data?.data?.task_id ?? data?.task_id;
  if (!taskId) return Response.json({ error: "no task_id", raw: data }, { status: 502 });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4_000));
    const pr = await fetch(`${p.baseURL}/kling/v1/videos/${taskId}`, {
      headers: p.headers,
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!pr?.ok) continue;
    const pd = await pr.json() as {
      data?: {
        task_status?: string;
        task_result?: { videos?: { url: string }[] };
      };
    };
    const status   = pd?.data?.task_status;
    const videoUrl = pd?.data?.task_result?.videos?.[0]?.url;
    if (videoUrl) return Response.json({ videoUrl });
    if (status === "failed") {
      return Response.json({ error: "generation failed", raw: pd }, { status: 500 });
    }
  }
  return Response.json({ error: "timeout" }, { status: 504 });
}
