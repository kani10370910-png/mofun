import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // Seedance 2.0 生成最长约 90s，给足余量

const SIZE_MAP: Record<string, string> = {
  "16:9": "1280x720",
  "9:16": "720x1280",
  "1:1":  "720x720",
  "4:3":  "960x720",
  "3:4":  "720x960",
  "21:9": "1280x549",
  "智能": "1280x720",
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { prompt: string; ratio: string; dur: string; model?: string };
  const apiKey  = process.env.VIDEO_API_KEY  || process.env.IMAGE_API_KEY  || "";
  const baseURL = (process.env.VIDEO_BASE_URL || process.env.IMAGE_BASE_URL || "").replace(/\/$/, "");
  const model   = body.model || process.env.VIDEO_MODEL || "seedance-2-pro";

  if (!apiKey || !baseURL) return Response.json({ error: "no API key" }, { status: 503 });

  const size     = SIZE_MAP[body.ratio] ?? "1280x720";
  const duration = parseInt(String(body.dur).match(/\d+/)?.[0] ?? "5", 10);
  const headers  = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };

  // 提交视频生成任务
  const submitRes = await fetch(`${baseURL}/video/generations`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, prompt: body.prompt, size, duration }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  if (!submitRes?.ok) {
    const err = await submitRes?.json().catch(() => ({}));
    return Response.json({ error: err }, { status: submitRes?.status ?? 503 });
  }

  const data = await submitRes.json();

  // 同步返回：直接含 video_url
  const directUrl = (data as Record<string, unknown>)?.video_url
    ?? (data as { url?: string })?.url
    ?? ((data as { data?: { video_url?: string } })?.data?.video_url);
  if (typeof directUrl === "string" && directUrl) return Response.json({ videoUrl: directUrl });

  // 异步任务：轮询直到完成（最多 90s）
  const taskId: string | undefined =
    (data as { id?: string })?.id ??
    (data as { task_id?: string })?.task_id ??
    (data as { data?: { id?: string } })?.data?.id;

  if (!taskId) return Response.json({ error: "unknown response", raw: data }, { status: 502 });

  const pollUrl = `${baseURL}/video/generations/${taskId}`;
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4_000));
    const pr = await fetch(pollUrl, { headers, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!pr?.ok) continue;
    const pd = await pr.json() as { video_url?: string; url?: string; status?: string; data?: { video_url?: string; status?: string } };
    const videoUrl = pd?.video_url ?? pd?.url ?? pd?.data?.video_url;
    const status   = pd?.status ?? pd?.data?.status;
    if (videoUrl) return Response.json({ videoUrl });
    if (status === "failed" || status === "error") {
      return Response.json({ error: "generation failed", raw: pd }, { status: 500 });
    }
  }

  return Response.json({ error: "timeout" }, { status: 504 });
}
