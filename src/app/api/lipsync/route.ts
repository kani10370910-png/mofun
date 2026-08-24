import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { volcVisualRequest } from "@/lib/volcSign";
import { tosUploadPublic } from "@/lib/tosUpload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Hobby 上限 300s；超时由前端提示后重试

/* ============================================================
   对口型（音频驱动人像说话）· 火山即梦 OmniHuman1.5
   输入：一张人像图 + 一段音频 → 输出：该人物对口型说话的视频。
   注意：这是「图 + 音频 → 会说话的视频」，不是给已有视频改口型；
        画面是由静态人像图驱动生成的，适合对白特写镜头。
   ============================================================ */

// 解析 data URI / 纯 base64 → { buffer, contentType, ext }
function decodeMedia(input: string, fallbackType: string, fallbackExt: string) {
  const m = input.match(/^data:([^;]+);base64,(.*)$/s);
  const b64 = m ? m[2] : input;
  const contentType = m ? m[1] : fallbackType;
  const ext = contentType.split("/")[1]?.split("+")[0] || fallbackExt;
  return { buffer: Buffer.from(b64, "base64"), contentType, ext };
}

/* ── 火山即梦 OmniHuman1.5（视觉智能 · AK/SK 签名）─────────────────────────
   提交 CVSubmitTask（req_key=jimeng_realman_avatar_picture_omni_v15）→ 轮询 CVGetResult → video_url。
   计费 1 元/秒、并发 1；音频 <60s（建议 ≤15s）；分辨率 1080P(默认)/720P；prompt ≤300 字。
   需在控制台开通 OmniHuman1.5，并配 VOLC_ACCESS_KEY / VOLC_SECRET_KEY。 */
const OMNI_REQ_KEY = process.env.OMNIHUMAN_REQ_KEY || "jimeng_realman_avatar_picture_omni_v15";
const OMNI_VERSION = "2022-08-31";

function omniKeysMissing(): Response | null {
  if (!process.env.VOLC_ACCESS_KEY || !process.env.VOLC_SECRET_KEY) {
    return Response.json({ error: "缺少 VOLC_ACCESS_KEY / VOLC_SECRET_KEY，请在 .env.local 配置火山引擎 Access Key（控制台→API 访问密钥→Access Key）" }, { status: 503 });
  }
  return null;
}

// 内网穿透公网基址（cloudflared/ngrok 给的 https 地址，如 https://xxx.trycloudflare.com）。
// 设了它 → 素材落盘到 public/omni-tmp 并用它拼公网 url（本地/自托管免 TOS）；没设 → 回退火山 TOS。
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const OMNI_TMP_DIR = path.join(process.cwd(), "public", "omni-tmp");

// OmniHuman1.5 CVSubmitTask 硬性要求 image_url / audio_url 为公网可访问地址（无 base64 入参，base64 会被忽略→Input invalid）。
// 已是公网 http(s) 直接用（如即梦生图原始 url、长文本异步 TTS 返回的 bytetos url）；否则托管成公网 url：
//   优先 PUBLIC_BASE_URL（内网穿透，写 public/omni-tmp）；否则上传火山 TOS（需账号开通对象存储）。
async function omniMediaUrl(src: string, kind: "image" | "audio"): Promise<string> {
  if (/^https?:\/\//i.test(src)) return src;
  const { buffer, contentType, ext } = decodeMedia(src, kind === "image" ? "image/jpeg" : "audio/mpeg", kind === "image" ? "jpg" : "mp3");
  const safeExt = kind === "audio" ? (/wav|wave/i.test(ext) ? "wav" : "mp3") : (ext || "jpg");
  const name = `${kind}-${Date.now()}-${Math.round(Math.random() * 1e6)}.${safeExt}`;
  if (PUBLIC_BASE_URL) {
    await fs.mkdir(OMNI_TMP_DIR, { recursive: true });
    await fs.writeFile(path.join(OMNI_TMP_DIR, name), buffer);
    return `${PUBLIC_BASE_URL}/omni-tmp/${name}`; // 穿透 → localhost:3000 → Next 静态服务 public/omni-tmp
  }
  return tosUploadPublic(buffer, `omni/${name}`, contentType);
}

// 提交任务 → 秒回 { taskId }（不阻塞轮询，抗断由前端轮询 status 完成）
async function omniSubmit(body: { image?: string; audio?: string; resolution?: string; performance?: string }): Promise<Response> {
  const miss = omniKeysMissing(); if (miss) return miss;
  const prompt = (body.performance || "").trim().slice(0, 300);
  const is1080 = /1080/.test(body.resolution || "");
  // OmniHuman1.5 CVSubmitTask 只接受公网 URL：image_url / audio_url 均为必选，无 base64 入参。
  // 已是公网 http(s) 直接用；否则必须先上传到公网可访问地址（下方 omniMediaUrl）。
  let imageUrl: string, audioUrl: string;
  try {
    imageUrl = await omniMediaUrl(body.image!, "image");
    audioUrl = await omniMediaUrl(body.audio!, "audio");
  } catch (e) {
    return Response.json({ error: `图片/音频转公网 URL 失败：${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
  const submitBody: Record<string, unknown> = {
    req_key: OMNI_REQ_KEY,
    image_url: imageUrl,
    audio_url: audioUrl,
    ...(prompt ? { prompt } : {}),
    output_resolution: is1080 ? 1080 : 720,
    pe_fast_mode: !is1080, // 官方建议：720P→true、1080P→false
  };
  try {
    const subRes = await volcVisualRequest("CVSubmitTask", OMNI_VERSION, submitBody);
    const subJson = (await subRes.json().catch(() => ({}))) as { code?: number; message?: string; data?: { task_id?: string } };
    const taskId = subJson.data?.task_id;
    if (!subRes.ok || !taskId) {
      console.error("[lipsync/omnihuman] submit fail", JSON.stringify(subJson).slice(0, 400));
      return Response.json({ error: `提交数字人任务失败：${subJson.message || subRes.status}` }, { status: 502 });
    }
    return Response.json({ taskId });
  } catch (e) {
    return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}

// 查询任务状态 → { status: queued|generating|done|failed, videoUrl?, error? }
async function omniStatus(taskId: string): Promise<Response> {
  const miss = omniKeysMissing(); if (miss) return miss;
  try {
    const qRes = await volcVisualRequest("CVGetResult", OMNI_VERSION, { req_key: OMNI_REQ_KEY, task_id: taskId }).catch(() => null);
    if (!qRes) return Response.json({ status: "generating" }); // 瞬时网络抖动，让前端继续轮询
    const qJson = (await qRes.json().catch(() => ({}))) as { code?: number; message?: string; data?: { status?: string; video_url?: string } };
    const status = (qJson.data?.status || "").toLowerCase();
    if (qJson.data?.video_url) {
      console.log("[lipsync/omnihuman] done:", qJson.data.video_url);
      return Response.json({ status: "done", videoUrl: qJson.data.video_url });
    }
    if (/fail|error/.test(status)) {
      console.error("[lipsync/omnihuman] task failed", JSON.stringify(qJson).slice(0, 400));
      return Response.json({ status: "failed", error: `数字人生成失败：${qJson.message || status || "未知"}` });
    }
    // 火山返回错误信封（有 message、无 data/status）→ 服务侧拒绝（如访问失效、Input invalid），判为失败，避免界面无限“生成中”
    if (!qJson.data && qJson.message) {
      console.error("[lipsync/omnihuman] service error:", qJson.message);
      return Response.json({ status: "failed", error: `数字人服务返回错误：${qJson.message}` });
    }
    // in_queue / generating / processing… → 归一为 queued / generating
    return Response.json({ status: /queue|pending|wait/.test(status) ? "queued" : "generating" });
  } catch (e) {
    return Response.json({ status: "generating", note: String(e instanceof Error ? e.message : e) });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    action?: "submit" | "status"; // submit=提交任务(秒回 taskId) / status=查询任务
    taskId?: string;              // action=status 时必填
    image?: string; // 人像图：data URI / base64 / 公网 URL
    audio?: string; // 配音：data URI / base64 / 公网 URL
    resolution?: string; // "480P" | "720P" | "1080P"
    performance?: string; // 角色表现：动作/情绪/运镜提示词（作 text/prompt 引导）
  };

  // 数字人模型：仅使用火山即梦（OmniHuman），不调用 wan2.2。
  // 查询任务状态（抗断轮询）
  if (body.action === "status") {
    if (!body.taskId) return Response.json({ error: "缺少 taskId" }, { status: 400 });
    return omniStatus(body.taskId);
  }

  // 提交任务
  if (!body.image || !body.audio) {
    return Response.json({ error: "缺少 image 或 audio" }, { status: 400 });
  }
  // 仅使用 OmniHuman（火山即梦）出片，失败直接返回错误，不回退 wan2.2。
  return omniSubmit(body); // 成功秒回 { taskId }，前端轮询 status
}
