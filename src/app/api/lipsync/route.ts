import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 500; // s2v 生成含排队常需数分钟，留足轮询窗口

/* ============================================================
   对口型（音频驱动人像说话）· 阿里云百炼 Wan2.2-S2V
   输入：一张人像图 + 一段音频 → 输出：该人物对口型说话的视频。
   注意：这是「图 + 音频 → 会说话的视频」，不是给已有视频改口型；
        画面是由静态人像图驱动生成的，适合对白特写镜头。

   管线（全在服务端完成，无需自建图床）：
   1) 申请临时上传凭证  GET /api/v1/uploads?action=getPolicy&model=wan2.2-s2v
   2) 把图/音频 POST 到返回的 OSS，拿到 oss:// 地址
   3) 提交异步任务       POST /api/v1/services/aigc/image2video/video-synthesis
   4) 轮询任务           GET  /api/v1/tasks/{task_id} 直到 SUCCEEDED
   5) 返回 video_url

   密钥：DASHSCOPE_API_KEY（在 .env.local 配，服务端读取，不外泄）
   ============================================================ */

const DASHSCOPE = "https://dashscope.aliyuncs.com";
const MODEL = process.env.LIPSYNC_MODEL || "wan2.2-s2v";

type UploadPolicy = {
  policy: string;
  signature: string;
  upload_dir: string;
  upload_host: string;
  oss_access_key_id: string;
  x_oss_object_acl: string;
  x_oss_forbid_overwrite: string;
};

// 解析 data URI / 纯 base64 → { buffer, contentType, ext }
function decodeMedia(input: string, fallbackType: string, fallbackExt: string) {
  const m = input.match(/^data:([^;]+);base64,(.*)$/s);
  const b64 = m ? m[2] : input;
  const contentType = m ? m[1] : fallbackType;
  const ext = contentType.split("/")[1]?.split("+")[0] || fallbackExt;
  return { buffer: Buffer.from(b64, "base64"), contentType, ext };
}

// 申请一次上传凭证（同一 model 的图/音频可复用同一凭证）
async function getUploadPolicy(apiKey: string): Promise<UploadPolicy> {
  const res = await fetch(
    `${DASHSCOPE}/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(MODEL)}`,
    { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(30_000) },
  );
  const json = (await res.json()) as { data?: UploadPolicy; message?: string };
  if (!res.ok || !json.data) {
    throw new Error(`获取上传凭证失败(${res.status})：${json.message || "未知错误"}`);
  }
  return json.data;
}

// 把一段媒体上传到百炼临时 OSS，返回 oss:// 地址
async function uploadToOss(
  policy: UploadPolicy,
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<string> {
  const key = `${policy.upload_dir}/${filename}`;
  const form = new FormData();
  form.append("OSSAccessKeyId", policy.oss_access_key_id);
  form.append("Signature", policy.signature);
  form.append("policy", policy.policy);
  form.append("key", key);
  form.append("x-oss-object-acl", policy.x_oss_object_acl);
  form.append("x-oss-forbid-overwrite", policy.x_oss_forbid_overwrite);
  form.append("success_action_status", "200");
  form.append("Content-Type", contentType);
  form.append("file", new Blob([new Uint8Array(buffer)], { type: contentType }), filename);

  const res = await fetch(policy.upload_host, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (res.status !== 200) {
    const t = await res.text().catch(() => "");
    throw new Error(`上传媒体失败(${res.status})：${t.slice(0, 300)}`);
  }
  return `oss://${key}`;
}

// 若输入已是公网 http(s) URL 直接用；否则解码并上传，返回可用地址 + 是否为 oss
async function resolveMedia(
  input: string,
  apiKeyPolicy: UploadPolicy | null,
  apiKey: string,
  kind: "image" | "audio",
): Promise<{ url: string; isOss: boolean; policy: UploadPolicy | null }> {
  if (/^https?:\/\//.test(input)) return { url: input, isOss: false, policy: apiKeyPolicy };
  const policy = apiKeyPolicy || (await getUploadPolicy(apiKey));
  const { buffer, contentType, ext } =
    kind === "image"
      ? decodeMedia(input, "image/png", "png")
      : decodeMedia(input, "audio/mpeg", "mp3");
  const filename = `${kind}-${buffer.length}.${ext}`;
  const url = await uploadToOss(policy, buffer, filename, contentType);
  return { url, isOss: true, policy };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    image?: string; // 人像图：data URI / base64 / 公网 URL
    audio?: string; // 配音：data URI / base64 / 公网 URL
    resolution?: string; // "480P" | "720P"
  };

  const apiKey = process.env.DASHSCOPE_API_KEY || "";
  if (!apiKey) {
    return Response.json(
      { error: "缺少 DASHSCOPE_API_KEY，请在 .env.local 配置阿里云百炼密钥" },
      { status: 503 },
    );
  }
  if (!body.image || !body.audio) {
    return Response.json({ error: "缺少 image 或 audio" }, { status: 400 });
  }

  try {
    // 1~2) 解析并上传图/音频（复用同一份上传凭证）
    let policy: UploadPolicy | null = null;
    const img = await resolveMedia(body.image, policy, apiKey, "image");
    policy = img.policy;
    const aud = await resolveMedia(body.audio, policy, apiKey, "audio");

    const usedOss = img.isOss || aud.isOss;

    // 3) 提交异步任务
    const submitHeaders: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    };
    // 用了 oss:// 临时地址时，必须让服务端解析该资源
    if (usedOss) submitHeaders["X-DashScope-OssResourceResolve"] = "enable";

    const submitRes = await fetch(
      `${DASHSCOPE}/api/v1/services/aigc/image2video/video-synthesis`,
      {
        method: "POST",
        headers: submitHeaders,
        body: JSON.stringify({
          model: MODEL,
          input: { image_url: img.url, audio_url: aud.url },
          parameters: { resolution: body.resolution || "480P" },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    const submitJson = (await submitRes.json()) as {
      output?: { task_id?: string; task_status?: string };
      message?: string;
      code?: string;
    };
    const taskId = submitJson.output?.task_id;
    if (!submitRes.ok || !taskId) {
      return Response.json(
        { error: `提交对口型任务失败(${submitRes.status})：${submitJson.message || submitJson.code || "未知"}` },
        { status: 502 },
      );
    }

    // 4) 轮询（每 5s，最多 ~7 分钟）
    const deadline = Date.now() + 7 * 60 * 1000;
    let videoUrl = "";
    let lastStatus = "";
    let failMsg = "";
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      const pollRes = await fetch(`${DASHSCOPE}/api/v1/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000),
      }).catch(() => null);
      if (!pollRes) continue;
      const pj = (await pollRes.json()) as {
        output?: { task_status?: string; video_url?: string; message?: string; results?: { video_url?: string } };
        message?: string;
      };
      lastStatus = pj.output?.task_status || lastStatus;
      if (lastStatus === "SUCCEEDED") {
        videoUrl = pj.output?.video_url || pj.output?.results?.video_url || "";
        break;
      }
      if (lastStatus === "FAILED" || lastStatus === "UNKNOWN") {
        failMsg = pj.output?.message || pj.message || "任务失败";
        break;
      }
    }

    if (!videoUrl) {
      return Response.json(
        { error: failMsg || `对口型生成超时（最后状态：${lastStatus || "无响应"}）` },
        { status: 504 },
      );
    }
    return Response.json({ videoUrl });
  } catch (e) {
    return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
