import { NextRequest } from "next/server";
import {
  clampModelDuration,
  modelNativeAudio,
  modelSupportsFlf,
  modelSupportsI2v,
  qualityToModelRes,
  resolveVideoModel,
} from "@/data/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 500; // 图生视频/首尾帧实测约 230s（含排队），留足余量至 500s

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
    referenceImageUrl?: string; // 参考图（role: reference_image）：锁角色/风格，但不作首帧、不定义输出画面（单张，向后兼容）
    referenceImageUrls?: string[]; // 多张参考图：整片各镜锁场景/角色/道具与风格一致（不作首帧）
    generateAudio?: boolean; // 让视频模型自带音频（Seedance 原生能力）
    resolution?: string; // 分辨率：480p/720p/1080p/2k/4k（由前端视频质量档位映射）
    quality?: string; // 可选：UI 画质档（480P/720P/…），优先于 resolution 做模型能力映射
    audioUrl?: string; // 参考音频（Seedance 2.0 音频输入）：MP3/WAV，2-15s。模型据此匹配对白嗓音特征、音画同步
    audioUrls?: string[]; // 多段参考音频（最多 3 段、合计≤15s）
  };

  const apiKey  = process.env.VIDEO_API_KEY  || process.env.IMAGE_API_KEY  || "";
  const baseURL = (process.env.VIDEO_BASE_URL || process.env.IMAGE_BASE_URL || "").replace(/\/$/, "");
  const model   = body.model || process.env.VIDEO_MODEL || "seedance-1.5-pro";
  const resolved = resolveVideoModel(model);

  console.log("[video] model:", model, "| resolved:", resolved.modelId, "| baseURL:", baseURL || "(empty)", "| key:", apiKey ? "set" : "MISSING", "| imageUrl:", body.imageUrl ? body.imageUrl.slice(0, 40) + `… (${(body.imageUrl.length/1024).toFixed(0)}KB)` : "none", "| tailImageUrl:", body.tailImageUrl ? `(${(body.tailImageUrl.length/1024).toFixed(0)}KB)` : "none");
  if (!apiKey || !baseURL) return Response.json({ error: "no API key" }, { status: 503 });

  // 按模型能力校验图生 / 首尾帧
  if (body.tailImageUrl && !modelSupportsFlf(model)) {
    return Response.json(
      { error: `${resolved.name} 不支持首尾帧生成，请改用文生视频或更换模型` },
      { status: 400 },
    );
  }
  if (body.imageUrl && !body.tailImageUrl && !modelSupportsI2v(model)) {
    return Response.json(
      { error: `${resolved.name} 不支持图生视频，请改用文生视频或更换模型` },
      { status: 400 },
    );
  }

  // 按时长按模型能力夹紧（1.0：2–12；1.5：4–12；2.0 族：2–15）
  const rawDur = parseInt(String(body.dur).match(/\d+/)?.[0] ?? String(resolved.durMin), 10);
  const duration = clampModelDuration(Number.isFinite(rawDur) ? rawDur : resolved.durMin, model);
  const headers  = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };

  // 无原生有声的模型强制关闭 generate_audio
  const wantAudio = body.generateAudio !== false;
  const generateAudio = wantAudio && modelNativeAudio(model);

  // 画质 → 模型允许的 resolution
  const resolution = body.quality
    ? qualityToModelRes(body.quality, model)
    : body.resolution
      ? qualityToModelRes(
          body.resolution.toUpperCase().replace(/P$/, "P").replace("1080P", "1080P"),
          model,
        )
      : qualityToModelRes("720P", model);

  const forwardBody = { ...body, resolution };

  if (isKlingModel(model)) {
    return handleKling({ baseURL, headers, model, body: forwardBody, duration });
  }
  return handleSeedance({
    baseURL,
    headers,
    model: resolved.modelId,
    body: forwardBody,
    duration,
    generateAudio,
  });
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
  body: { prompt: string; ratio: string; imageUrl?: string; tailImageUrl?: string; referenceImageUrl?: string; referenceImageUrls?: string[]; resolution?: string; audioUrl?: string; audioUrls?: string[] };
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
  // 参考图：锁场景/角色/道具与风格（主体参考），role=reference_image，不作首帧、不定义输出画面。
  // 与 first_frame 独立——首帧仍由脚本文生或承接帧决定，故视频不会从参考立绘画面起头。
  // 支持多张：整片各镜都注入本镜相关元素的参考图，保证跨镜一致。
  const referenceImages = p.body.referenceImageUrls?.length
    ? p.body.referenceImageUrls
    : p.body.referenceImageUrl
      ? [p.body.referenceImageUrl]
      : [];
  for (const url of referenceImages) {
    content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
  }
  // 音频输入（Seedance 2.0 多模态）：MP3/WAV，模型据此匹配对白嗓音特征 / 音画同步。最多 3 段。
  const audios = p.body.audioUrls?.length ? p.body.audioUrls : p.body.audioUrl ? [p.body.audioUrl] : [];
  for (const url of audios.slice(0, 3)) {
    content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" });
  }

  // 图生模式（i2v / 首尾帧 flf2v）的输出尺寸由输入帧决定，seedance 不接受显式 resolution，
  // 传了会报 "resolution not valid for … in flf2v/i2v"。故仅纯文生视频（t2v）才带 resolution。
  const isImageMode = Boolean(p.body.imageUrl || p.body.tailImageUrl);
  const submitBody: Record<string, unknown> = {
    model: p.model,
    content,
    ratio,
    duration: p.duration,
    ...(isImageMode ? {} : { resolution: p.body.resolution || "720p" }),
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

  // 渐进式降级：提交被拒/被判敏感时（常见于参考图或首帧里的人物被内容审核拦）分级处理。
  // 核心原则：绝不悄悄丢掉首帧（first_frame）——那会同时毁掉「与上一镜的衔接」和「人物」，
  // 产出一段脱节又换人的片子还标成已生成，正是要避免的。故：先原样重试 → 只去参考图（保住首帧衔接）
  //   → 只有本就没有首帧（首镜纯文生）才允许退化为纯文生；否则宁可保留失败态让用户重试。
  const submit = (c: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) =>
    fetch(`${p.baseURL}/v1/video/generations`, {
      method: "POST",
      headers: p.headers,
      body: JSON.stringify({ ...submitBody, content: c, ...extra }),
      signal: AbortSignal.timeout(90_000),
    }).catch(() => null);

  let degraded = false;
  let degradeReason = ""; // 首次被拒的归类原因，随 degraded 回传给前端显示在「未锁人物」角标上
  const hadFirstFrame = content.some((c) => c.role === "first_frame");
  if (submitRes && !submitRes.ok) {
    // 先抓首次被拒原文并归类（审核敏感 / 图片地址网关拉不到 / 其它），便于用户对症——是要换图还是换图床。
    const firstText = await submitRes.clone().text().catch(() => "");
    const low = firstText.toLowerCase();
    const isRealPerson = /real person|privacy|personinfo|人像|真人/.test(low);
    const isMixErr = /cannot be mixed|first\/last frame|mixed/.test(low);
    degradeReason = isRealPerson
      ? "首帧图含真人被模型隐私审核拦截"
      : isMixErr
        ? "首帧与参考图不能同时使用"
        : /sensitive|敏感|policy|risk|审核|content_detected|violat|nsfw/.test(low)
          ? "参考图被内容审核判为敏感"
          : /download|fetch|not found|无法|加载|invalid image|decode|url/.test(low)
            ? "参考图地址网关读取失败"
            : `网关拒绝请求（${firstText.slice(0, 60) || `HTTP ${submitRes.status}`}）`;
    console.warn("[video/seedance] 首次被拒原文 →", firstText.slice(0, 200));
    const hasRef = content.some((c) => c.role === "reference_image");
    // ① 原样重试：普通内容审核偶发误杀，同一请求重试常能过。
    //    但「真人输入图 PrivacyInformation」「首帧+参考图不能混用」是确定性拒绝（Seedance 硬性拒收含真人的输入图），重试无意义 → 跳过，快速失败。
    if (!isMixErr && !isRealPerson) {
      for (let i = 0; i < 2 && !submitRes.ok; i++) {
        console.warn(`[video/seedance] 提交被拒，原样重试 ${i + 1}/2 →`, submitRes.status);
        await new Promise((r) => setTimeout(r, 1_200));
        const again = await submit(content);
        if (again) submitRes = again;
      }
    }
    // ② 有首帧+参考图时：优先回退到「纯参考图模式」——丢首帧、留参考图（即首镜那种 referenceGenerate）。
    //    Seedance 2.0 不允许 first_frame 与 reference_image 混用，且真人首帧会被隐私审核拦；
    //    改用纯参考图既避开这两条限制，又保住跨镜人物/风格一致（代价：失去与上一镜尾帧的无缝衔接）。
    if (!submitRes.ok && hadFirstFrame && hasRef) {
      const refOnly = content.filter((c) => c.role !== "first_frame" && c.role !== "last_frame");
      console.warn("[video/seedance] 降级「纯参考图·丢首帧」→", submitRes.status);
      const retry = await submit(refOnly, { resolution: p.body.resolution || "720p" });
      if (retry) { submitRes = retry; if (retry.ok) degraded = true; }
    }
    // ③ 仍被拒 → 只去参考图（保留首帧 i2v，保衔接）。对不含真人的镜头有效。
    if (!submitRes.ok) {
      const noRef = content.filter((c) => c.role !== "reference_image");
      if (noRef.length !== content.length) {
        console.warn("[video/seedance] 降级「去参考图·保留首帧」→", submitRes.status);
        const retry = await submit(noRef);
        if (retry) { submitRes = retry; if (retry.ok) degraded = true; }
      }
    }
    // ④ 还不行 → 纯文生（丢所有图）。⚠️ 只对「本就没有首帧」的镜头（首镜纯文生）兜底；
    //    有首帧的承接镜绝不退化为纯文生——那会同时毁掉「与上一镜尾帧的衔接」和「跨镜人物一致」，
    //    产出一段脱节又换人的视频还标成已生成。此时宁可保留失败态、把真实原因回传，让用户重试或换模型。
    if (!submitRes.ok && !hadFirstFrame) {
      const noImg = content.filter((c) => c.type !== "image_url");
      if (noImg.length !== content.length) {
        console.warn("[video/seedance] 兜底纯文生（无首帧镜）→", submitRes.status);
        const retry = await submit(noImg, { resolution: p.body.resolution || "720p" });
        if (retry) { submitRes = retry; if (retry.ok) degraded = true; }
      }
    }
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
    // 承接镜（有首帧）为保证衔接不退化为纯文生 → 回传对症提示，尤其真人首帧被拦时引导换成接受真人首帧的 Mini 模型。
    const friendly = hadFirstFrame
      ? /真人|隐私|real person|privacy/.test(degradeReason || errMsg)
        ? "承接上一镜的首帧里含真人，被模型隐私审核拦截（Seedance 各版本含 Mini 都可能触发，且多为偶发）。已多次重试仍未过、且为保证衔接未退化为纯文生。请直接点「重试」（偶发审核，重试常能过）；若反复被拦，把上一镜结尾改成人物侧身/半身远景（正脸越明确越易被拦），或改用「参考图锁脸」方式。"
        : `${degradeReason || errMsg}。承接镜为保证与上一镜衔接不会退化为纯文生，请重试本镜。`
      : errMsg;
    return Response.json({ error: friendly }, { status: submitRes.status });
  }

  const data = await submitRes.json() as { id?: string; task_id?: string; video_url?: string; status?: string };
  console.log("[video/seedance] submit ok →", JSON.stringify(data).slice(0, 200));

  // 同步直接返回
  if (data?.video_url) return Response.json({ videoUrl: data.video_url, degraded, ...(degraded ? { degradeReason } : {}) });

  const taskId = data?.id ?? data?.task_id;
  if (!taskId) return Response.json({ error: "no task_id", raw: data }, { status: 502 });

  // 异步轮询：图生视频/首尾帧实测约 230s（含排队），网关偶发 TLS 抖动会拖慢，给 420s 余量
  const deadline = Date.now() + 420_000;
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
      return Response.json({ videoUrl, degraded, ...(degraded ? { degradeReason } : {}) });
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

  const deadline = Date.now() + 420_000;
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
