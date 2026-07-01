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
    tailImageUrl?: string; // 首尾帧模式的尾帧图（Seedance firstTailGenerate）
    generateAudio?: boolean; // 让视频模型自带音频（Seedance 原生能力）
  };

  const apiKey  = process.env.VIDEO_API_KEY  || process.env.IMAGE_API_KEY  || "";
  const baseURL = (process.env.VIDEO_BASE_URL || process.env.IMAGE_BASE_URL || "").replace(/\/$/, "");
  const model   = body.model || process.env.VIDEO_MODEL || "seedance-2.0";

  console.log("[video] model:", model, "| baseURL:", baseURL || "(empty)", "| key:", apiKey ? "set" : "MISSING", "| imageUrl:", body.imageUrl ? body.imageUrl.slice(0, 40) + `… (${(body.imageUrl.length/1024).toFixed(0)}KB)` : "none", "| tailImageUrl:", body.tailImageUrl ? `(${(body.tailImageUrl.length/1024).toFixed(0)}KB)` : "none");
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
  body: { prompt: string; ratio: string; imageUrl?: string; tailImageUrl?: string };
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
  // 首尾帧模式：追加尾帧，网关据「first_frame + last_frame」双帧自动走 firstTailGenerate
  if (p.body.tailImageUrl) {
    content.push({
      type: "image_url",
      image_url: { url: p.body.tailImageUrl },
      role: "last_frame",
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

  // i2v 携带 base64 首帧，网关校验/上传耗时较长，给足 90s 上传窗口。
  // 网关偶发瞬时抖动（fetch 直接抛错），正常提交仅需 ~2s，故对「抛异常」重试至多 3 次。
  let submitRes: Response | null = null;
  let submitErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    submitErr = null;
    submitRes = await fetch(`${p.baseURL}/v1/video/generations`, {
      method: "POST",
      headers: p.headers,
      body: JSON.stringify(submitBody),
      signal: AbortSignal.timeout(90_000),
    }).catch((e) => {
      submitErr = e;
      return null;
    });
    // 拿到响应（无论 2xx/4xx）即停止重试；只有 fetch 抛异常才重试
    if (submitRes) break;
    console.warn(`[video/seedance] submit 第 ${attempt}/3 次抛异常 →`, submitErr instanceof Error ? `${submitErr.name}: ${submitErr.message}` : submitErr);
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1_500));
  }

  if (!submitRes?.ok) {
    // 三次都抛异常（submitRes 为 null）：区分超时 / 连接失败，回传可读原因
    if (!submitRes) {
      const isTimeout = submitErr instanceof Error && (submitErr.name === "TimeoutError" || submitErr.name === "AbortError");
      const reason = isTimeout
        ? "提交生成任务超时，请稍后重试（图片过大时可先压缩）"
        : "视频生成网关暂时无响应，请稍后重试";
      console.error("[video/seedance] submit 重试 3 次仍失败 →", submitErr instanceof Error ? `${submitErr.name}: ${submitErr.message}` : submitErr);
      return Response.json({ error: reason }, { status: 502 });
    }
    const raw = await submitRes.json().catch(() => ({})) as { error?: { message?: string }; message?: string; code?: string };
    const errMsg = raw?.error?.message ?? raw?.message ?? raw?.code ?? `HTTP ${submitRes.status}`;
    console.error("[video/seedance] submit failed", submitRes.status, errMsg);
    return Response.json({ error: errMsg }, { status: submitRes.status });
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
    const rawStatus = pd?.status ?? pd?.data?.status ?? pd?.data?.data?.status;
    // 大小写无关 + 前缀匹配：Anyfast 文档不统一，实测有 IN_PROGRESS/SUCCEEDED 大写风格，
    // 也可能是 succeeded/completed/SUCCESS。统一小写后用 includes 兜住所有写法。
    const status = (rawStatus ?? "").toLowerCase();
    const videoUrl =
      pd?.video_url ??
      pd?.url ??
      pd?.data?.video_url ??
      pd?.data?.result_url ??
      pd?.data?.data?.content?.video_url;
    const isDone = status.includes("succ") || status.includes("complet"); // succeeded/success/completed
    const isFail = status.includes("fail") || status.includes("error");
    if (videoUrl && (isDone || !rawStatus)) {
      return Response.json({ videoUrl });
    }
    if (isFail) {
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
