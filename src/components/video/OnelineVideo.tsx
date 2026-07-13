"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import { getProject, upsertProject, uniqueProjectName } from "@/lib/studioProjects";
import { ClearableTextarea } from "@/components/ui/ClearableTextarea";
import { PlayerAudio, buildExportAudio, type ExportAudio } from "@/lib/playerAudio";
import { asset as assetUrl } from "@/lib/asset";
import {
  videoSceneTpls,
  videoSceneCats,
  motionWords,
  videoStyles,
  videoRatios,
  videoQualities,
  videoModels,
  videoDurationRange,
} from "@/data/video";
import type { VideoRunRow, Grad, AssetCard } from "@/lib/types";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { VideoStyleModal } from "./VideoStyleModal";
import { LibraryPickerModal } from "@/components/image/LibraryPickerModal";
import { ClampText } from "@/components/ui/ClampText";

/* F10 一句话视频：文生视频(T2V) / 图生视频(I2V) 双 Tab。
   演示骨架：场景引导词库 + 参数 + 首尾帧 + 内容安全预检/复检 + 进度状态机 + 后处理/审核流。
   出片为演示占位（无真视频模型）；额度/RAG变量/安全检测/审核/通知均为前端模拟。 */

const GRADS: Grad[] = ["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4"];
// 敏感词演示：命中则安全预检拦截
const BLOCK_WORDS = ["反动", "暴恐", "色情", "血腥"];

// 参考图上传白名单与体积上限（首/尾帧共用）
const FRAME_EXT_WHITELIST = ["jpg", "jpeg", "png", "webp"];
const FRAME_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// 后端配额耗尽判定（HTTP 429 / quota_exceeded）
function isQuotaError(msg: string): boolean {
  return /429|quota|limit|次数/i.test(msg);
}
// 视频生成失败：将后端错误码 / HTTP 状态映射为用户可读中文（不暴露原始堆栈）
const VIDEO_ERROR_MAP: [RegExp, string][] = [
  [/timeout|504|超时/i, "生成超时（视频耗时过长），请稍后重试"],
  [/content|safety|policy|审核/i, "内容未通过审核，请修改描述"],
  [/model|unavailable|unavail/i, "模型暂时不可用，请稍后重试"],
];
function mapVideoError(msg: string): string {
  for (const [re, text] of VIDEO_ERROR_MAP) {
    if (re.test(msg)) return text;
  }
  return "生成失败，请重试";
}



// 预置「已完成」生成历史（演示）：保证每次进入都有现成记录，可直接点下载/重生成/存库/提交审核
const SEED_RUNS: VideoRunRow[] = [
  {
    id: "seed-1",
    mode: "t2v",
    prompt: "清晨的【县名】乡野被一层薄雾轻轻笼罩，青山、稻田与蜿蜒溪流在晨光中若隐若现，一座白墙黛瓦、飞檐翘角的特色民宿静立于田园深处，庭院里木质桌椅、藤编吊椅与绿植花草错落有致，石阶旁清泉叮咚，慢生活的气息扑面而来。镜头先以低空无人机航拍缓缓俯瞰民宿与周边山水全貌，再平稳下降平移切入庭院，跟拍主人在廊下生火煮茶、布置乡土餐食的温馨细节，几位客人围坐竹桌闲谈品茗，孩童在院中追逐嬉戏，一只花猫慵懒地卧在窗台。随后转为手持跟拍穿过木格回廊、推开房门，窗棂间透进柔和天光，床榻素净，墙角陶罐与晾晒的农家物产点缀其间。黄金时段暖光斜斜洒落，整体色调温润偏暖橙，浅景深虚化远处的竹林与层叠远山，聚焦人物惬意舒展的神情与端杯添茶的手部动作。镜头运动舒缓流畅，画面质感细腻富有电影感，情绪基调宁静温馨，传递返璞归真、远离喧嚣的田园度假氛围，仿佛能听见风声与鸟鸣，令人心生向往。",
    scene: "民宿农家乐",
    ratio: "智能",
    dur: "15秒",
    style: "智能匹配",
    time: "2026-07-01 14:02",
    status: "done",
    pct: 100,
    videoUrl: "/demo-videos/hist-minsu-15s.mp4",
    grad: "thumb-grad-1",
    withAudio: false,
  },
  {
    id: "seed-2",
    mode: "t2v",
    prompt: "清晨的【县名】乡野被一层薄雾轻轻笼罩，青山、稻田与蜿蜒溪流在晨光中若隐若现，一座白墙黛瓦、飞檐翘角的特色民宿静立于田园深处，庭院里木质桌椅、藤编吊椅与绿植花草错落有致，石阶旁清泉叮咚，慢生活的气息扑面而来。镜头先以低空无人机航拍缓缓俯瞰民宿与周边山水全貌，再平稳下降平移切入庭院，跟拍主人在廊下生火煮茶、布置乡土餐食的温馨细节，几位客人围坐竹桌闲谈品茗，孩童在院中追逐嬉戏，一只花猫慵懒地卧在窗台。随后转为手持跟拍穿过木格回廊、推开房门，窗棂间透进柔和天光，床榻素净，墙角陶罐与晾晒的农家物产点缀其间。黄金时段暖光斜斜洒落，整体色调温润偏暖橙，浅景深虚化远处的竹林与层叠远山，聚焦人物惬意舒展的神情与端杯添茶的手部动作。镜头运动舒缓流畅，画面质感细腻富有电影感，情绪基调宁静温馨，传递返璞归真、远离喧嚣的田园度假氛围，仿佛能听见风声与鸟鸣，令人心生向往。",
    scene: "民宿农家乐",
    ratio: "智能",
    dur: "5秒",
    style: "电影感",
    time: "2026-07-01 13:47",
    status: "done",
    pct: 100,
    videoUrl: "/demo-videos/hist-minsu-5s.mp4",
    grad: "thumb-grad-3",
    withAudio: false,
  },
];

// 演示海报池：无首帧的记录回退到这些样张，让预览/播放有真实画面
const POSTER_POOL = [
  "/poster-samples/20251219150028966406xict5e.jpg",
  "/poster-samples/20251222150201108065evwftz.jpg",
  "/poster-samples/20251223153921706507udqknx.jpg",
  "/poster-samples/20251225143202617562fe2mzh.jpg",
  "/poster-samples/202512251516181258973mq1jx.jpg",
];
// 按 id 稳定散列取一张回退海报（同一条记录每次取到同一张）
function posterFor(row: VideoRunRow): string {
  if (row.poster) return row.poster;
  let h = 0;
  for (let i = 0; i < row.id.length; i++) h = (h * 31 + row.id.charCodeAt(i)) >>> 0;
  return POSTER_POOL[h % POSTER_POOL.length];
}
// 从视频 URL 捕获第一帧作为封面（crossOrigin anonymous，CORS 失败返回 null）
function captureFirstFrame(videoUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "metadata";
    const cleanup = () => { video.src = ""; };
    const timer = setTimeout(() => { cleanup(); resolve(null); }, 12_000);
    video.onloadedmetadata = () => { video.currentTime = 0.5; };
    video.onseeked = () => {
      clearTimeout(timer);
      try {
        const c = document.createElement("canvas");
        c.width = video.videoWidth || 640;
        c.height = video.videoHeight || 360;
        c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.72));
      } catch { resolve(null); } finally { cleanup(); }
    };
    video.onerror = () => { clearTimeout(timer); cleanup(); resolve(null); };
    video.src = videoUrl;
  });
}

// 参考灵感：6 张安吉文旅具体范例（含真实提示词与样张），供右栏一键套用到提示词。
// cat/scene 对应真实场景模板，套用后预设 chip 自动高亮。
const INSPIRE: { cat: string; scene: string; emoji: string; prompt: string; poster: string; videoUrl: string; ratio: string; dur: string; style: string }[] = [
  { cat: "农业宣传", scene: "农产品推广", emoji: "🌾", prompt: "安吉白茶明前头采，茶农指尖采摘嫩芽，云雾茶山实景，产地直发宣传短视频", poster: "/poster-gen/ins-baicha.jpg", videoUrl: "/demo-videos/hist-baicha.mp4", ratio: "16:9", dur: "6秒", style: "写实" },
  { cat: "文化旅游", scene: "景区宣传", emoji: "⛰️", prompt: "安吉余村绿水青山，竹海骑行与古村漫步，适合亲子游的生态文旅目的地", poster: "/poster-gen/ins-yucun.jpg", videoUrl: "/demo-videos/hist-yucun.mp4", ratio: "9:16", dur: "10秒", style: "航拍大片" },
];

// "5秒" → 5
function durSeconds(dur: string): number {
  return parseInt(dur.match(/\d+/)?.[0] ?? "5", 10);
}

// "智能" / "16:9" → "16/9"（CSS aspect-ratio 格式）
function ratioToAspect(ratio: string): string {
  if (ratio === "智能") return "16/9";
  return ratio.replace(":", "/");
}

// "智能" / "16:9" → [16, 9]（下载时画布比例）
function ratioWH(ratio: string): [number, number] {
  if (ratio === "智能") return [16, 9];
  const parts = ratio.split(":").map(Number);
  return [parts[0] ?? 16, parts[1] ?? 9];
}

// 视频比例 → 图像模型出图尺寸：豆包 Seedream 要求 ≥3686400 像素，按比例取面积≈4M、64 对齐的尺寸
function ratioToSize(ratio: string): string {
  const [w, h] = ratioWH(ratio);
  const k = Math.sqrt(4_000_000 / (w * h));
  const align = (n: number) => Math.max(64, Math.ceil((n * k) / 64) * 64);
  return `${align(w)}x${align(h)}`;
}

// 并行生成 2 张关键帧（开场 + 中景），为视频提供真实画面变化；任一失败则返回成功的帧，全失败返回 []
async function genVideoFrames(prompt: string, ratio: string): Promise<string[]> {
  const size = ratioToSize(ratio);
  const prompts = [prompt, `${prompt}，近景特写，不同机位视角`];
  const fetchFrame = (p: string) =>
    fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: p, size }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: { images?: string[] }) => j.images?.[0] ?? null);
  const results = await Promise.allSettled(prompts.map(fetchFrame));
  return results
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((u): u is string => !!u);
}

// blob URL → 压缩后的 base64 JPEG（限 1280px 长边，避免大图上传超时）
async function blobUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await fetch(url).then((r) => r.blob());
    return new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1280;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d")?.drawImage(img, 0, 0, w, h);
        const dataUrl = c.toDataURL("image/jpeg", 0.88);
        console.log(`[i2v] 图片压缩 ${img.width}×${img.height} → ${w}×${h}，base64 大小 ${(dataUrl.length / 1024).toFixed(0)} KB`);
        resolve(dataUrl);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => resolve(null); // canvas 失败，不发送无效 blob URL 给外部 API
      img.src = URL.createObjectURL(blob);
    });
  } catch {
    return null;
  }
}

// 调真实视频模型（Seedance 2.0 / MiniMax 等）生成含音画的视频文件；失败返回 null，前端自动降级 Ken Burns
// imageUrl：图生视频首帧图；tailImageUrl：首尾帧模式的尾帧图（触发 firstTailGenerate）；文生视频均不传
async function genRealVideo(prompt: string, ratio: string, dur: string, videoModel: string, generateAudio: boolean, imageUrl?: string, tailImageUrl?: string): Promise<string> {
  const r = await fetch("/api/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, ratio, dur, model: videoModel, generateAudio, ...(imageUrl ? { imageUrl } : {}), ...(tailImageUrl ? { tailImageUrl } : {}) }),
    signal: AbortSignal.timeout(450_000), // 需大于路由 420s 轮询窗口，避免前端先行放弃
  });
  const j = (await r.json()) as { videoUrl?: string; error?: unknown };
  if (!r.ok || !j.videoUrl) {
    const reason = typeof j.error === "string" ? j.error
      : j.error && typeof j.error === "object" && "message" in j.error ? String((j.error as { message?: unknown }).message)
      : r.status === 504 ? "生成超时（视频耗时过长）"
      : `HTTP ${r.status}`;
    throw new Error(reason);
  }
  return j.videoUrl;
}

// Ken Burns 多帧动画 → 真实视频文件（canvas + MediaRecorder），返回 object URL；不支持时返回 null
async function recordKenBurnsVideo(
  srcFrames: string[],
  ratio: string,
  dur: string,
  prompt: string
): Promise<string | null> {
  if (typeof MediaRecorder === "undefined" || !document.createElement("canvas").captureStream) return null;
  try {
    const proxyUrl = (u: string) =>
      /^https?:\/\//i.test(u) ? `/api/proxy-image?url=${encodeURIComponent(u)}` : u;
    const imgs = await Promise.all(
      srcFrames.map((u) => {
        const el = new Image();
        el.crossOrigin = "anonymous";
        el.src = proxyUrl(u);
        return el.decode().then(() => el);
      })
    );
    const [rw, rh] = ratioWH(ratio);
    const base = 720;
    const cw = rw >= rh ? Math.round((base * rw) / rh) : base;
    const ch = rw >= rh ? base : Math.round((base * rh) / rw);
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const total = durSeconds(dur);
    const n = imgs.length;
    const KB = [
      { zoom: 0.14, tx: -0.04, ty: -0.025 },
      { zoom: 0.10, tx: +0.035, ty: +0.02 },
      { zoom: -0.08, tx: 0, ty: 0 },
    ];
    const paintImg = (img: HTMLImageElement, localP: number, alpha: number, kbIdx: number) => {
      const m = KB[kbIdx % KB.length];
      const z = 1 + m.zoom * localP;
      const ir = img.width / img.height;
      const cr = cw / ch;
      let dw: number, dh: number;
      if (ir > cr) { dh = ch; dw = ch * ir; } else { dw = cw; dh = cw / ir; }
      dw *= z; dh *= z;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, (cw - dw) / 2 + m.tx * localP * cw, (ch - dh) / 2 + m.ty * localP * ch, dw, dh);
      ctx.globalAlpha = 1;
    };
    const drawFrame = (p: number) => {
      const raw = p * n;
      const segIdx = Math.min(Math.floor(raw), n - 1);
      const localP = raw - segIdx;
      const nextIdx = Math.min(segIdx + 1, n - 1);
      const crossAlpha = localP > 0.75 ? (localP - 0.75) / 0.25 : 0;
      ctx.clearRect(0, 0, cw, ch);
      paintImg(imgs[segIdx], localP, 1, segIdx);
      if (crossAlpha > 0 && nextIdx !== segIdx) paintImg(imgs[nextIdx], 0, crossAlpha, nextIdx);
      const g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, "rgba(0,0,0,0.18)"); g.addColorStop(0.3, "rgba(0,0,0,0)");
      g.addColorStop(0.62, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.58)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
      const pad = Math.round(cw * 0.045), fs = Math.round(ch * 0.04);
      ctx.fillStyle = "#fff"; ctx.font = `600 ${fs}px system-ui,-apple-system,sans-serif`;
      ctx.textBaseline = "bottom"; ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 10;
      drawWrappedText(ctx, prompt, pad, ch - pad, cw - 2 * pad, fs * 1.35, 2);
      ctx.shadowBlur = 0;
    };
    const mime = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"]
      .find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(canvas.captureStream(30), mime ? { mimeType: mime } : undefined);
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const finished = new Promise<string>((resolve) => {
      rec.onstop = () => resolve(URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || "video/webm" })));
    });
    rec.start();
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const p = Math.min(1, (performance.now() - t0) / 1000 / total);
        drawFrame(p);
        if (p >= 1) resolve(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await new Promise((r) => window.setTimeout(r, 150));
    rec.stop();
    return await finished;
  } catch { return null; }
}

// 调 AI 优化用户的视频提示词：补充镜头运动、光线氛围、画面质感等专业描述
async function optimizeVideoPrompt(input: string, style?: string): Promise<string | null> {
  try {
    const r = await fetch("/api/video-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, style }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) return null;
    const { text } = (await r.json()) as { text?: string | null };
    return text ?? null;
  } catch {
    return null;
  }
}

// 根据视频首帧画面推断匹配的背景音乐风格（调用 vision-bgm 路由，用 qwen3 多模态视觉能力）
async function inferBgmFromFrame(frameUrl: string): Promise<string | null> {
  try {
    const r = await fetch("/api/vision-bgm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: frameUrl }),
    });
    if (!r.ok) return null;
    const { bgm } = (await r.json()) as { bgm?: string | null };
    return bgm ?? null;
  } catch {
    return null;
  }
}

// 智能匹配：根据用户提示词预测最贴合的视频风格（调用 video-style-infer 路由，用 qwen3 文本理解）
async function inferStyleFromPrompt(input: string): Promise<string | null> {
  try {
    const r = await fetch("/api/video-style-infer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!r.ok) return null;
    const { style } = (await r.json()) as { style?: string | null };
    return style ?? null;
  } catch {
    return null;
  }
}

// 文生视频·立即生成·字段组装：调 SYSTEM_VIDEO_GENERATE 让 LLM 统一处理字段缺省 + 风格预测 + 画面叙事扩写
async function callVideoGenerate(fields: {
  scene: string;
  sceneCat: string;
  prompt: string;
  model: string;
  ratio: string;
  durSec: number;
  quality: string;
  style: string;
  genAudio: boolean;
  count: number;
}): Promise<{ finalPrompt: string; appliedStyle: string; notes: string[] } | null> {
  try {
    const r = await fetch("/api/video-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    return (await r.json()) as { finalPrompt: string; appliedStyle: string; notes: string[] };
  } catch {
    return null;
  }
}

// canvas 字幕换行绘制：按字符折行，超过 maxLines 行末尾省略号，从底部向上排版
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  yBottom: number,
  maxW: number,
  lineH: number,
  maxLines: number
) {
  const lines: string[] = [];
  let line = "";
  for (const chr of Array.from(text)) {
    if (ctx.measureText(line + chr).width > maxW && line) {
      lines.push(line);
      line = chr;
    } else {
      line += chr;
    }
  }
  if (line) lines.push(line);

  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines && shown.length) {
    let last = shown[maxLines - 1];
    while (last && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
    shown[maxLines - 1] = last + "…";
  }
  const startY = yBottom - (shown.length - 1) * lineH;
  shown.forEach((l, i) => ctx.fillText(l, x, startY + i * lineH));
}

export function OnelineVideo() {
  const toast = useToast();
  const { addWork, isFavorite, toggleFavorite } = useLibrary();
  const router = useRouter();

  const [tab, setTab] = useState<"t2v" | "i2v">("t2v");
  // —— 文生视频 ——
  const [scene, setScene] = useState(""); // 当前选中场景（二级场景名）
  const [presetCleared, setPresetCleared] = useState(false); // 用户主动点过「不使用预设」（默认 false，避免初始就高亮）
  const [sceneCat, setSceneCat] = useState(videoSceneCats[0]); // 场景一级分类筛选
  const [prompt, setPrompt] = useState("");
  const [expanding, setExpanding] = useState(false);
  // —— 图生视频 ——
  const [firstFrame, setFirstFrame] = useState(""); // 首帧图 URL
  const [lastFrame, setLastFrame] = useState(""); // 尾帧图 URL（首尾帧模式）
  const [endFrameOn, setEndFrameOn] = useState(false); // 首尾帧开关 F10-04
  const [motion, setMotion] = useState(""); // 运动描述
  const [motionCat, setMotionCat] = useState(""); // "" = 不使用预设（默认，不展示预设运动词）
  const [libPickerTarget, setLibPickerTarget] = useState<"first" | "last" | null>(null); // 仓库图片选取目标槽
  // —— 公共参数 ——
  const [ratio, setRatio] = useState<string>(videoRatios[0]);
  const [durSec, setDurSec] = useState(5); // 视频时长（秒），滑杆控制
  const [quality, setQuality] = useState<string>(videoQualities[0]); // 默认 480P
  const [genAudio, setGenAudio] = useState(true); // 是否同时生成声音
  const [style, setStyle] = useState("智能匹配"); // 默认智能匹配（auto）
  const [styleOpen, setStyleOpen] = useState(false); // 视频风格选择浮层
  const [model, setModel] = useState<string>("Seedance 1.5 Pro"); // 视频生成模型
  const [count, setCount] = useState(1);

  const [runs, setRuns] = useState<VideoRunRow[]>(SEED_RUNS);
  const [resultTab, setResultTab] = useState<"history" | "inspire">("history"); // 右侧面板 Tab
  const [onlyFav, setOnlyFav] = useState(false); // 只看收藏
  const [playingId, setPlayingId] = useState<string | null>(null); // 播放器中预览记录的 id
  const [playingExtra, setPlayingExtra] = useState<VideoRunRow | null>(null); // 参考灵感等非历史记录的播放
  const playing = playingId ? (runs.find((r) => r.id === playingId) ?? null) : playingExtra; // 衍生：历史记录取 runs 最新状态，否则用外部记录
  const [busy, setBusy] = useState(false);
  const [safe, setSafe] = useState<null | "checking" | "blocked">(null); // 安全预检状态
  const [quotaOpen, setQuotaOpen] = useState(false); // 每日生成次数耗尽弹层

  // 写入「我的作品」：捕获 localStorage 配额溢出，存储失败不中断生成/收藏流程
  function safeAddWork(a: AssetCard) {
    try {
      addWork(a);
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        toast("本地存储空间不足，历史记录可能无法保存", "warn");
      }
    }
  }
  const timers = useRef<number[]>([]);
  const seq = useRef(0); // 自增序号，保证新生成记录 id 唯一
  const dlRef = useRef(false); // 视频录制中标志，防止并发下载
  const firstRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // 运动预设词开关：已在描述中则移除该词，否则追加（按「，」分词，顺带去重）
  function toggleMotionWord(w: string) {
    setMotion((cur) => {
      const tokens = cur
        .split(/[，,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (tokens.includes(w)) return tokens.filter((t) => t !== w).join("，");
      return [...tokens, w].join("，");
    });
  }

  // 选场景模板：填充引导词并带出所属分类（供生成侧「场景分类」变量）
  function pickScene(tpl: (typeof videoSceneTpls)[number]) {
    setScene(tpl.scene);
    setSceneCat(tpl.cat);
    setPrompt(tpl.prompt);
    setPresetCleared(false); // 选了具体预设，取消「不使用预设」高亮
    if (/【.+?】/.test(tpl.prompt)) toast("引导词含县域变量，发布时将从县域知识库自动填充（演示）");
  }

  // 套用右栏参考灵感：切到文生视频并填入对应场景提示词
  function useInspire(it: (typeof INSPIRE)[number]) {
    setTab("t2v");
    setSceneCat(it.cat);
    setScene(it.scene);
    setPresetCleared(false); // 套用灵感即选中具体场景，复位「不使用预设」高亮
    setPrompt(it.prompt);
    toast("已套用参考灵感到提示词");
  }

  // 点击参考灵感卡片（非按钮区）：用播放器打开对应视频查看
  function playInspire(it: (typeof INSPIRE)[number]) {
    setPlayingId(null);
    setPlayingExtra({
      id: `inspire-${it.scene}`,
      mode: "t2v",
      prompt: it.prompt,
      scene: it.scene,
      ratio: it.ratio,
      dur: it.dur,
      style: it.style,
      time: "",
      status: "done",
      pct: 100,
      poster: it.poster,
      videoUrl: it.videoUrl,
      grad: "thumb-grad-1",
      withAudio: true,
    });
  }

  // AI 扩写（演示）：在原描述后补一段镜头/光影细节
  function expand() {
    const base = prompt.trim();
    if (!base) {
      toast("请先输入或选择一个场景引导词", "warn");
      return;
    }
    setExpanding(true);
    optimizeVideoPrompt(base, style === "智能匹配" ? undefined : style).then((optimized) => {
      if (optimized) {
        setPrompt(optimized);
        toast("提示词已优化");
      } else {
        toast("优化失败，请重试", "warn");
      }
      setExpanding(false);
    });
  }

  function pickFile(which: "first" | "last", file?: File) {
    if (!file) return;
    // 拖拽/选择统一二次校验：格式白名单 + 10MB 体积上限
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!FRAME_EXT_WHITELIST.includes(ext)) {
      toast("仅支持 JPG、PNG、WEBP 格式图片", "warn");
      return;
    }
    if (file.size > FRAME_MAX_BYTES) {
      toast("图片大小不能超过 10 MB，请压缩后重试", "warn");
      return;
    }
    const url = URL.createObjectURL(file);
    if (which === "first") setFirstFrame(url);
    else setLastFrame(url);
  }

  // 立即生成：安全预检 → 入队 → 进度状态机（演示）
  function run() {
    if (busy) return;
    const isI2v = tab === "i2v";
    const text = (isI2v ? motion : prompt).trim();

    if (isI2v && !firstFrame) {
      toast("请先上传首帧图！", "warn");
      return;
    }
    if (isI2v && endFrameOn && !lastFrame) {
      toast("首尾帧模式需上传尾帧图！", "warn");
      return;
    }
    if (!text) {
      toast(isI2v ? "请输入运动描述！" : "请输入提示词或选择场景！", "warn");
      return;
    }

    // F10-07 安全预检（演示：命中敏感词阻断）
    setSafe("checking");
    timers.current.push(
      window.setTimeout(() => {
        if (BLOCK_WORDS.some((w) => text.includes(w))) {
          setSafe("blocked");
          toast("内容安全预检未通过：含敏感词，请修改后重试", "warn");
          timers.current.push(window.setTimeout(() => setSafe(null), 2600));
          return;
        }
        setSafe(null);
        setBusy(true); // 安全预检通过后立即锁定，防止 LLM 组装期间（最长 35s）重复触发
        void startGenerate(isI2v, text);
      }, 900)
    );
  }

  async function startGenerate(isI2v: boolean, text: string) {
    let appliedStyle = style;
    let finalText = text;

    if (!isI2v) {
      // 文生视频：调 SYSTEM_VIDEO_GENERATE 统一完成字段组装 + 风格预测 + 画面叙事扩写
      const result = await callVideoGenerate({
        scene, sceneCat, prompt: text, model, ratio, durSec,
        quality, style, genAudio, count,
      });
      if (result) {
        finalText = result.finalPrompt;
        appliedStyle = result.appliedStyle;
        result.notes.forEach((n) => toast(n));
      } else {
        // 降级：API 不可用时手动组装（与旧逻辑一致）
        const styleObj = videoStyles.find((s) => s.name === style);
        if (style === "智能匹配") {
          const inferred = await inferStyleFromPrompt(text);
          const matched = inferred ? videoStyles.find((s) => s.name === inferred) : null;
          if (matched) {
            appliedStyle = matched.name;
            finalText = matched.stylePrompt ? `${text}，${matched.stylePrompt}` : text;
            toast(`🎨 智能匹配：根据描述匹配「${matched.name}」风格`);
          }
        } else if (styleObj?.stylePrompt) {
          finalText = `${text}，${styleObj.stylePrompt}`;
        }
      }
    } else {
      // 图生视频：保留原有逻辑（风格预测 + stylePrompt 追加）
      const styleObj = videoStyles.find((s) => s.name === style);
      if (style === "智能匹配") {
        const inferred = await inferStyleFromPrompt(text);
        const matched = inferred ? videoStyles.find((s) => s.name === inferred) : null;
        if (matched) {
          appliedStyle = matched.name;
          finalText = matched.stylePrompt ? `${text}，${matched.stylePrompt}` : text;
          toast(`🎨 智能匹配：根据描述匹配「${matched.name}」风格`);
        }
      } else if (styleObj?.stylePrompt) {
        finalText = `${text}，${styleObj.stylePrompt}`;
      }
    }

    enqueue({
      mode: isI2v ? "i2v" : "t2v",
      text: finalText,
      scene: isI2v ? undefined : scene || undefined,
      ratio,
      dur: `${durSec}秒`,
      style: appliedStyle,
      poster: isI2v ? firstFrame : undefined,
      tailPoster: isI2v && endFrameOn ? lastFrame : undefined,
      withAudio: genAudio,
      videoModel: videoModels.find((m) => m.name === model)?.modelId ?? videoModels[0]?.modelId ?? model,
    });
  }

  // 入队 + 音画管线进度状态机（文生 / 图生 / 重新生成 三处共用）
  function enqueue(p: {
    mode: "t2v" | "i2v";
    text: string;
    scene?: string;
    ratio: string;
    dur: string;
    style: string;
    poster?: string;
    tailPoster?: string; // 首尾帧模式的尾帧图
    withAudio?: boolean;
    videoModel?: string; // 当前选中的视频模型（用于真实视频生成）
  }) {
    setBusy(true);
    const id = "v-" + ++seq.current;
    const grad = GRADS[seq.current % GRADS.length];
    const row: VideoRunRow = {
      id,
      mode: p.mode,
      prompt: p.text,
      scene: p.scene,
      ratio: p.ratio,
      dur: p.dur,
      style: p.style,
      time: nowStamp(),
      status: "pending",
      pct: 0,
      poster: p.poster,
      tailPoster: p.tailPoster,
      grad,
      withAudio: p.withAudio !== false, // 默认 true，显式传 false 时关闭
    };
    setRuns((prev) => [row, ...prev]);

    // 排队 → 无声视频 → 镜头分析 → 声音设计 → 多轨音频 → 对齐 → 混音封装（音画管线节奏）
    const upd = (patch: Partial<VideoRunRow>) =>
      setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

    // 进度动画：前段（4→40%）快速推进显示模型接收，后段（40→85%）缓慢等待出片，完成后跳 100%
    timers.current.push(window.setTimeout(() => upd({ status: "running", pct: 4 }), 800));
    let pct = 4;
    const iv = window.setInterval(() => {
      const step = pct < 40 ? 3 : 0.8; // 前段 3%/tick，后段 0.8%/tick
      pct = Math.min(85, pct + step);
      upd({ pct: Math.round(pct) });
    }, 400);
    timers.current.push(iv as unknown as number);

    // 调真实视频模型；i2v 携带首帧图（blob→base64 data URL），首尾帧模式再带尾帧
    void (async () => {
      const vm = p.videoModel ?? videoModels.find((m) => m.name === model)?.modelId ?? videoModels[0]?.modelId ?? model;
      // blob: URL 需转 base64 data URL 才能送到后端网关；其余（data:/https:）原样传
      const toSendable = async (u?: string) =>
        !u ? undefined : u.startsWith("blob:") ? (await blobUrlToDataUrl(u) ?? undefined) : u;
      let imgUrl: string | undefined;
      let tailImgUrl: string | undefined;
      if (p.mode === "i2v") {
        imgUrl = await toSendable(p.poster);
        tailImgUrl = await toSendable(p.tailPoster);
      }
      let videoUrl: string | null = null;
      let rawReason = "生成失败，请重试";
      try {
        videoUrl = await genRealVideo(p.text, p.ratio, p.dur, vm, p.withAudio !== false, imgUrl, tailImgUrl);
      } catch (e) {
        rawReason = e instanceof Error ? e.message : "生成失败，请重试";
      }
      window.clearInterval(iv);
      if (videoUrl) {
        const poster = await captureFirstFrame(videoUrl).catch(() => null);
        upd({ status: "done", pct: 100, videoUrl, ...(poster ? { poster } : {}) });
        safeAddWork({
          emoji: "🎬",
          grad,
          kind: "视频",
          name: `${p.text.slice(0, 12) || "一句话视频"} · ${p.dur}`,
          sub: p.withAudio !== false ? "视频生成 · 一句话成片 · 有声" : "视频生成 · 一句话成片",
          img: poster ?? p.poster, // 优先用捕获的首帧（t2v 无传入 poster 时也有封面）
          time: nowStamp(),
          edit: { sub: "oneline", input: p.text, model },
        });
        toast("🎬 视频已生成，已存入「我的作品」");
      } else if (isQuotaError(rawReason)) {
        // 每日次数耗尽：失败态标注额度已退还 + 弹配额提示层
        upd({ status: "failed", pct: 0, failReason: "今日免费生成次数已用完" });
        setQuotaOpen(true);
      } else {
        const failReason = mapVideoError(rawReason);
        upd({ status: "failed", pct: 0, failReason });
        toast(failReason, "warn");
      }
      setBusy(false);
    })();
  }

  // 重新生成：把该记录参数回填到表单，并按原参数立即重新入队
  function regenerate(row: VideoRunRow) {
    if (busy) return;
    setTab(row.mode);
    if (row.mode === "t2v") {
      setScene(row.scene ?? "");
      setPrompt(row.prompt);
    } else {
      setMotion(row.prompt);
    }
    setRatio(row.ratio);
    setDurSec(durSeconds(row.dur));
    setStyle(row.style);
    enqueue({
      mode: row.mode,
      text: row.prompt,
      scene: row.scene,
      ratio: row.ratio,
      dur: row.dur,
      style: row.style,
      poster: row.poster,
      tailPoster: row.tailPoster,
      withAudio: row.withAudio,
    });
    toast("已按原参数重新生成");
  }

  // 复制：把该记录参数回填到左侧表单（不自动生成），方便微调后再出片
  function copyToForm(row: VideoRunRow) {
    setTab(row.mode);
    if (row.mode === "t2v") {
      // 回填场景时同步一级分类，让对应预设 chip 正确高亮
      const tpl = videoSceneTpls.find((t) => t.scene === row.scene);
      if (tpl) { setSceneCat(tpl.cat); setPresetCleared(false); }
      setScene(row.scene ?? "");
      setPrompt(row.prompt);
    } else {
      setMotion(row.prompt);
    }
    setRatio(row.ratio);
    setDurSec(durSeconds(row.dur));
    setStyle(row.style);
    toast("参数已回填到左侧，可编辑后再生成");
  }

  // 视频记录 → 作品卡（收藏/存库口径一致；assetKey 取 类型+名称，name 对单条稳定）
  function videoAsset(row: VideoRunRow): AssetCard {
    return {
      emoji: "🎬",
      grad: row.grad,
      kind: "视频",
      name: `${row.prompt.slice(0, 12) || "一句话视频"} · ${row.dur}`,
      sub: "视频生成 · 一句话成片",
      img: row.poster || posterFor(row),
      time: nowStamp(),
      edit: { sub: "oneline", input: row.prompt },
    };
  }

  // 收藏：与品牌设计一致——写入「我的作品」并标记收藏，和仓库「只看收藏」互通
  function toggleFav(row: VideoRunRow) {
    const a = videoAsset(row);
    const was = isFavorite(a);
    safeAddWork(a);
    toggleFavorite(a);
    toast(was ? "已取消收藏" : "已收藏，可在「仓库 · 我的作品」用「只看收藏」筛选");
  }

  // 下载视频：用 canvas 实时重放封面的 Ken Burns 运镜（与播放器一致），
  // 经 MediaRecorder 按视频时长录制为真实视频文件（mp4/webm）落盘到本地。
  // 「去制作大片」：为这条一句话视频创建（或复用）一个制作大片项目，塞入 1 个已生成镜头，
  // 直接跳到 ④ 分镜视频。若同一条已建过项目则不覆盖（避免抹掉用户后续在大片里的编辑），直接打开。
  function openInStudio(row: VideoRunRow) {
    if (!row.videoUrl) {
      toast("这条还没有可用的视频，无法制作大片");
      return;
    }
    const pid = `p-oneline-${row.id}`;
    const existing = getProject(pid);
    const name = existing?.name ?? uniqueProjectName(row.prompt.slice(0, 12).trim() || "一句话成片");
    if (!existing) {
      const dur = Math.max(2, Math.min(15, durSeconds(row.dur) || 5));
      const ratio = /\d+\s*[:：]\s*\d+/.test(row.ratio) ? row.ratio : "16:9";
      // 单镜（默认一个镜头）：直接用这条一句话视频，标记为已生成
      const shot = {
        id: `shot-oneline-${row.id}`,
        shotDesc: row.prompt,
        caption: "",
        camera: "",
        shotSize: "",
        assetRefs: [] as string[],
        locked: false,
        dur,
        poster: row.poster || "",
        status: "done",
        pct: 100,
        videoUrl: row.videoUrl,
      };
      // 完整会话状态：脚本填入提示词、1 镜、落在「分镜视频」步骤
      const state = {
        projectName: name,
        stepKey: "clips",
        script: row.prompt,
        studioIdea: row.prompt,
        settings: { 模型: "Seedance 2.0 Fast", 视频比例: ratio, 视频风格: "智能匹配", 视频质量: "480P", 配音: "温柔女声", 配乐: "舒缓", 字幕: "显示", 知识库: "使用" },
        totalSec: dur,
        targetShots: 1,
        assets: [],
        shots: [shot],
        genMode: "text",
        subtitles: [],
      };
      upsertProject({ id: pid, name, updated: nowStamp(), ts: Date.now(), count: 1, cover: row.videoUrl, state });
    }
    router.push(`/video?sub=studio:clips&from=home&pid=${encodeURIComponent(pid)}&name=${encodeURIComponent(name)}`);
  }

  async function downloadVideo(row: VideoRunRow) {
    if (dlRef.current) {
      toast("视频正在生成中，请稍候…");
      return;
    }
    // 真实视频：通过代理路由下载，避免跨域 CDN 导致 download 属性失效
    if (row.videoUrl) {
      const filename = row.prompt.slice(0, 20) || "视频";
      const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(row.videoUrl)}&name=${encodeURIComponent(filename)}`;
      const a = document.createElement("a");
      a.href = proxyUrl;
      a.download = `${filename}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("已开始下载视频（MP4 · 含音画同步音轨）");
      return;
    }
    const src = row.poster || posterFor(row);
    // 极老浏览器兜底：不支持录制则退回下载封面图
    if (typeof MediaRecorder === "undefined" || !document.createElement("canvas").captureStream) {
      const a = document.createElement("a");
      a.href = src;
      a.download = `${row.prompt.slice(0, 16) || "video"}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("当前浏览器不支持视频录制，已下载封面图");
      return;
    }

    dlRef.current = true;
    toast(`正在生成视频（约 ${durSeconds(row.dur)} 秒），请稍候…`);
    try {
      // 加载所有帧（多帧时并行加载），跨域 URL 走同源代理防 canvas taint
      const srcFrames = (row.frames?.length ? row.frames : [src]).filter(Boolean);
      const proxyUrl = (u: string) =>
        /^https?:\/\//i.test(u) ? `/api/proxy-image?url=${encodeURIComponent(u)}` : u;
      const imgs = await Promise.all(
        srcFrames.map((u) => {
          const el = new Image();
          el.crossOrigin = "anonymous";
          el.src = proxyUrl(u);
          return el.decode().then(() => el);
        })
      );

      const [rw, rh] = ratioWH(row.ratio);
      const base = 720;
      const cw = rw >= rh ? Math.round((base * rw) / rh) : base;
      const ch = rw >= rh ? base : Math.round((base * rh) / rw);
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");

      const total = durSeconds(row.dur);
      const n = imgs.length;

      // 各帧 Ken Burns 运镜方向（循环使用）
      const KB = [
        { zoom: 0.14, tx: -0.04, ty: -0.025 }, // 推近 + 左上平移
        { zoom: 0.10, tx: +0.035, ty: +0.02 },  // 推近 + 右下平移
        { zoom: -0.08, tx: 0, ty: 0 },            // 缓缓拉远
      ];

      // 将单帧绘制到 canvas（含 alpha 合成，用于交叉淡入）
      const paintImg = (img: HTMLImageElement, localP: number, alpha: number, kbIdx: number) => {
        const m = KB[kbIdx % KB.length];
        const z = 1 + m.zoom * localP;
        const ir = img.width / img.height;
        const cr = cw / ch;
        let dw: number, dh: number;
        if (ir > cr) { dh = ch; dw = ch * ir; }
        else { dw = cw; dh = cw / ir; }
        dw *= z; dh *= z;
        const dx = (cw - dw) / 2 + m.tx * localP * cw;
        const dy = (ch - dh) / 2 + m.ty * localP * ch;
        ctx.globalAlpha = alpha;
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.globalAlpha = 1;
      };

      const drawFrame = (p: number) => {
        // 当前处于哪一帧段
        const raw = p * n;
        const segIdx = Math.min(Math.floor(raw), n - 1);
        const localP = raw - segIdx; // 0-1（在本帧段内的进度）
        const nextIdx = Math.min(segIdx + 1, n - 1);
        // 末尾 25% 开始交叉淡入下一帧
        const crossAlpha = localP > 0.75 ? (localP - 0.75) / 0.25 : 0;

        ctx.clearRect(0, 0, cw, ch);
        paintImg(imgs[segIdx], localP, 1, segIdx);
        if (crossAlpha > 0 && nextIdx !== segIdx) {
          paintImg(imgs[nextIdx], 0, crossAlpha, nextIdx);
        }

        // 暗角
        const g = ctx.createLinearGradient(0, 0, 0, ch);
        g.addColorStop(0, "rgba(0,0,0,0.18)");
        g.addColorStop(0.3, "rgba(0,0,0,0)");
        g.addColorStop(0.62, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(0,0,0,0.58)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cw, ch);
        // 字幕
        const pad = Math.round(cw * 0.045);
        const fs = Math.round(ch * 0.04);
        ctx.fillStyle = "#fff";
        ctx.font = `600 ${fs}px system-ui, -apple-system, sans-serif`;
        ctx.textBaseline = "bottom";
        ctx.shadowColor = "rgba(0,0,0,0.7)";
        ctx.shadowBlur = 10;
        drawWrappedText(ctx, row.prompt, pad, ch - pad, cw - 2 * pad, fs * 1.35, 2);
        ctx.shadowBlur = 0;
      };

      const videoStream = canvas.captureStream(30);
      // 混音：仅在「同时生成声音=开启」时才合成音轨进文件
      let expAudio: ExportAudio | null = null;
      if (row.withAudio !== false) {
        try {
          expAudio = await buildExportAudio({ bgm: row.bgm, voice: row.voice, prompt: row.prompt });
        } catch {
          expAudio = null;
        }
      }
      const stream = expAudio
        ? new MediaStream([...videoStream.getVideoTracks(), ...expAudio.stream.getAudioTracks()])
        : videoStream;
      // 含音轨时 webm/opus 兼容性最稳；无音轨时优先 mp4
      const candidates = expAudio
        ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
        : ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
      const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const finished = new Promise<void>((resolve) => {
        rec.onstop = () => {
          const type = rec.mimeType || "video/webm";
          const ext = type.includes("mp4") ? "mp4" : "webm";
          const blob = new Blob(chunks, { type });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${row.prompt.slice(0, 16) || "video"}.${ext}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 5000);
          const sound = expAudio ? `含${row.bgm && row.bgm !== "无" ? "背景音乐·" : ""}环境声${expAudio.hasNarration ? "·旁白" : ""}` : "无声";
          toast(`已下载视频到本地（.${ext} · ${sound}）`);
          expAudio?.dispose();
          resolve();
        };
      });

      rec.start();
      const t0 = performance.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          const p = Math.min(1, (performance.now() - t0) / 1000 / total);
          drawFrame(p);
          if (p >= 1) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await new Promise((r) => window.setTimeout(r, 150)); // 多录一点确保末帧入流
      rec.stop();
      await finished;
    } catch {
      toast("视频生成失败，请重试");
    } finally {
      dlRef.current = false;
    }
  }

  function deleteRun(id: string) {
    setRuns((prev) => prev.filter((r) => r.id !== id));
  }

  const scenes = videoSceneTpls; // 扁平单列表：不再按分类筛选，展示全部场景模板
  const motionGroup = motionWords.find((m) => m.cat === motionCat) ?? motionWords[0];
  const shownRuns = onlyFav ? runs.filter((r) => isFavorite(videoAsset(r))) : runs;

  return (
    <>
        {/* 左侧表单 */}
        <div className="workspace">
          <div className="ws-panel sticky">
            <div className="ws-scroll">
              {/* 文生 / 图生 双 Tab + 顶部吸顶 */}
              <div className="ev-sticky-top">
                <div className="ev-tabs">
                  <span className={tab === "t2v" ? "ev-tab on" : "ev-tab"} onClick={() => setTab("t2v")}>
                    文生视频
                  </span>
                  <span className={tab === "i2v" ? "ev-tab on" : "ev-tab"} onClick={() => setTab("i2v")}>
                    图生视频
                  </span>
                </div>
              </div>

              {tab === "t2v" ? (
                <>
                  {/* 场景模板库 F10-01 */}
                  <div className="field">
                    <div className="ws-label">场景模板</div>
                    <div id="ovSceneSub" className="preset-grid">
                      <button
                        type="button"
                        className={presetCleared ? "preset-chip on" : "preset-chip"}
                        onClick={() => {
                          // 再次点击取消选中（toggle）；首次选中时清空已填场景/提示词
                          if (presetCleared) {
                            setPresetCleared(false);
                          } else {
                            setPresetCleared(true);
                            setScene("");
                            setPrompt("");
                          }
                        }}
                      >
                        不使用预设
                      </button>
                      {scenes.map((s) => (
                        <button
                          key={s.scene}
                          type="button"
                          className={scene === s.scene && !presetCleared ? "preset-chip on" : "preset-chip"}
                          onClick={() => pickScene(s)}
                        >
                          {s.scene}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 提示词 + AI 扩写 F10-02 */}
                  <div className="field">
                    <div className="ws-label">
                      提示词 <span className="req">*</span>
                    </div>
                    <ClearableTextarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onClear={() => setPrompt("")}
                      placeholder="一句话描述要生成的视频，或上方选个场景自动填充（最多 500 字）"
                      maxLength={500}
                      toolbar={
                        <button type="button" className="ta-tool" disabled={expanding} onClick={expand}>
                          {expanding ? (
                            <><Icon name="refresh" size={14} className="ico-spin" /> 扩写中…</>
                          ) : (
                            <><Icon name="sparkle" size={14} /> AI 扩写</>
                          )}
                        </button>
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* 首帧上传 + 首尾帧开关 F10-03 / F10-04 */}
                  <div className="field">
                    <div className="ws-label-row">
                      <div className="ws-label">
                        参考图片 <span className="req">*</span>
                      </div>
                      <label className="ov-switch">
                        <input type="checkbox" checked={endFrameOn} onChange={(e) => setEndFrameOn(e.target.checked)} />
                        <span className="lg-switch" />
                        首尾帧
                      </label>
                    </div>

                    {!endFrameOn ? (
                      /* 单帧模式：upload-box 风格，与生图参考图一致 */
                      <FrameUploadBox
                        url={firstFrame}
                        inputRef={firstRef}
                        onPick={(f) => pickFile("first", f)}
                        onClear={() => setFirstFrame("")}
                        onLibrary={() => setLibPickerTarget("first")}
                      />
                    ) : (
                      /* 首尾帧模式：两个 upload-box 竖排，各自支持上传/拖拽/仓库 */
                      <div className="i2v-frames-dual">
                        <FrameUploadBox
                          label="首帧"
                          url={firstFrame}
                          inputRef={firstRef}
                          onPick={(f) => pickFile("first", f)}
                          onClear={() => setFirstFrame("")}
                          onLibrary={() => setLibPickerTarget("first")}
                        />
                        <FrameUploadBox
                          label="尾帧"
                          url={lastFrame}
                          inputRef={lastRef}
                          onPick={(f) => pickFile("last", f)}
                          onClear={() => setLastFrame("")}
                          onLibrary={() => setLibPickerTarget("last")}
                        />
                      </div>
                    )}

                    <div className="field-hint">
                      {endFrameOn ? "AI 自动补全首尾帧之间的过渡动画" : "上传单张首帧，AI 让画面动起来"}
                    </div>
                  </div>

                  {/* 视频预设（在前）+ 运动描述（在后） */}
                  <div className="field">
                    <div className="ws-label">
                      视频预设 <span className="ws-label-hint">点选预设快速填入运动描述</span>
                    </div>
                    <div className="filter-row" style={{ margin: "0 0 6px" }}>
                      <span className={motionCat === "" ? "sel-chip on" : "sel-chip"} onClick={() => { setMotionCat(""); setMotion(""); }}>
                        不用预设
                      </span>
                      {motionWords.map((m) => (
                        <span key={m.cat} className={motionCat === m.cat ? "sel-chip on" : "sel-chip"} onClick={() => setMotionCat(m.cat)}>
                          {m.cat}
                        </span>
                      ))}
                    </div>
                    {motionCat !== "" && (
                      <div className="ov-word-row">
                        {motionGroup.words.map((w) => {
                          const on = motion
                            .split(/[，,]/)
                            .map((s) => s.trim())
                            .includes(w);
                          return (
                            <button
                              key={w}
                              type="button"
                              className={on ? "ov-word on" : "ov-word"}
                              onClick={() => toggleMotionWord(w)}
                            >
                              {w}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="ws-label" style={{ marginTop: 14 }}>
                      运动描述 <span className="req">*</span>
                    </div>
                    <ClearableTextarea
                      value={motion}
                      onChange={(e) => setMotion(e.target.value)}
                      onClear={() => setMotion("")}
                      placeholder="描述画面如何运动，例如：花朵随风轻轻摆动，镜头缓缓推近"
                    />
                  </div>
                </>
              )}

              {/* —— 公共参数 F10-05 / F10-06 —— */}
              <div className="field">
                <div className="ws-label">视频模型</div>
                <Dropdown
                  title="模型选择"
                  triggerIcon="vidModel"
                  options={videoModels.map((m): DropdownOption => ({ name: m.name, desc: m.desc }))}
                  value={model}
                  onChange={(o) => { setModel(o.name); toast(`已选择视频模型：${o.name}`); }}
                />
              </div>
              <div className="field">
                <div className="ws-label">视频比例</div>
                <div className="chip-row">
                  {videoRatios.map((r) => (
                    <span key={r} className={ratio === r ? "sel-chip on" : "sel-chip"} onClick={() => setRatio(r)}>
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              <div className="field">
                <div className="ws-label">视频时长</div>
                <div className="ov-dur-row">
                  <input
                    type="range"
                    className="slider"
                    min={videoDurationRange.min}
                    max={videoDurationRange.max}
                    step={1}
                    value={durSec}
                    onChange={(e) => setDurSec(Number(e.target.value))}
                  />
                  <span className="ov-dur-val">{durSec} s</span>
                </div>
              </div>
              <div className="field">
                <div className="ws-label">视频质量</div>
                <div className="chip-row">
                  {videoQualities.map((q) => (
                    <span key={q} className={quality === q ? "sel-chip on" : "sel-chip"} onClick={() => setQuality(q)}>
                      {q}
                    </span>
                  ))}
                </div>
                {quality === "1080P" && <div className="field-hint">高清消耗 2 倍额度</div>}
              </div>
              <div className="field">
                <div className="ws-label">视频风格</div>
                {(() => {
                  const cur = videoStyles.find((s) => s.name === style) ?? videoStyles[0];
                  return (
                    <button type="button" className="style-card" onClick={() => setStyleOpen(true)}>
                      <span className={`sc-ico ${cur.grad}`}>{cur.emoji}</span>
                      <span className="sc-text">
                        <span className="sc-name">{cur.name}</span>
                        <span className="sc-sub">点击更换风格</span>
                      </span>
                      <span className="sc-arrow">
                        <Icon name="chevron" size={16} />
                      </span>
                    </button>
                  );
                })()}
              </div>
              <div className="field">
                <div className="ws-label">同时生成声音</div>
                <div className="seg">
                  <div className={genAudio ? "seg-item on" : "seg-item"} onClick={() => setGenAudio(true)}>开启</div>
                  <div className={!genAudio ? "seg-item on" : "seg-item"} onClick={() => setGenAudio(false)}>关闭</div>
                </div>
              </div>
              {tab === "t2v" && (
                <div className="field">
                  <div className="ws-label">生成数量</div>
                  <div className="seg">
                    {[1, 2].map((n) => (
                      <div key={n} className={count === n ? "seg-item on" : "seg-item"} onClick={() => setCount(n)}>
                        {n} 条
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="ws-foot">
              <button className="btn btn-primary btn-block gen-btn" disabled={busy || safe === "checking" || quotaOpen} onClick={run}>
                {safe === "checking" ? (
                  <><Icon name="shield" size={16} /> 内容安全检测中…</>
                ) : (
                  <><Icon name="sparkle" size={16} /> 立即生成</>
                )}
              </button>
              {safe === "blocked" && <p className="ov-block-note">⚠ 内容安全预检未通过，请修改提示词</p>}
            </div>
          </div>

        {/* 右侧：生成历史 / 参考灵感 双 Tab（与品牌设计一致） */}
        <div className="ws-panel ov-result">
          {styleOpen && (
            <VideoStyleModal
              current={style}
              onClose={() => setStyleOpen(false)}
              onPick={(name) => setStyle(name)}
            />
          )}
          <div className="lg-head">
            <div className="tabs">
              <div className={resultTab === "history" ? "tab on" : "tab"} onClick={() => setResultTab("history")}>
                生成历史
              </div>
              <div className={resultTab === "inspire" ? "tab on" : "tab"} onClick={() => setResultTab("inspire")}>
                参考灵感
              </div>
            </div>
            {resultTab === "history" && runs.length > 0 && (
              <label className="lg-fav-switch">
                <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} />
                <span className="lg-switch" />
                只看收藏
              </label>
            )}
          </div>

          {resultTab === "history" ? (
            shownRuns.length === 0 ? (
              <div className="preview-empty">
                <div>
                  <div className="pe-ico">
                    <Icon name={onlyFav ? "heart" : "video"} size={42} />
                  </div>
                  {onlyFav ? "还没有收藏，把鼠标移到卡片上点右上角♡收藏" : "还没有生成记录，填好左侧点「立即生成」试试"}
                </div>
              </div>
            ) : (
              <div className="ov-runs">
                {shownRuns.map((r) => (
                  <VideoRunCard
                    key={r.id}
                    row={r}
                    onDelete={() => deleteRun(r.id)}
                    onPlay={() => setPlayingId(r.id)}
                    onRegenerate={() => regenerate(r)}
                    onCopy={() => copyToForm(r)}
                    onDownload={() => downloadVideo(r)}
                    onStudio={() => openInStudio(r)}
                    fav={isFavorite(videoAsset(r))}
                    onFav={() => toggleFav(r)}
                  />
                ))}
              </div>
            )
          ) : (
            <div className="ov-inspire-grid">
              {INSPIRE.map((it) => (
                <InspireCard key={it.scene} it={it} onUse={() => useInspire(it)} onPlay={() => playInspire(it)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {libPickerTarget && (
        <LibraryPickerModal
          onPick={(img) => {
            if (libPickerTarget === "first") setFirstFrame(img);
            else setLastFrame(img);
          }}
          onClose={() => setLibPickerTarget(null)}
        />
      )}
      {playing && (
        <VideoPlayerModal
          row={playing}
          onClose={() => { setPlayingId(null); setPlayingExtra(null); }}
          onDownload={() => downloadVideo(playing)}
          onStudio={() => openInStudio(playing)}
        />
      )}
      {quotaOpen && (
        <div className="img-zoom-mask" onClick={() => setQuotaOpen(false)}>
          <div className="quota-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quota-modal-ico">⚡</div>
            <div className="quota-modal-title">今日免费生成次数已用完</div>
            <div className="quota-modal-desc">每日生成次数已达上限，明日零点自动刷新</div>
            <div className="quota-modal-btns">
              <button className="btn btn-ghost" onClick={() => setQuotaOpen(false)}>明日再来</button>
              <button className="btn btn-primary" onClick={() => setQuotaOpen(false)}>联系客服解锁次数</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


// 参考图上传框：upload-box 外观（对标生图），支持点击/拖拽上传 + 预览 + 清除 + 从仓库选图。
// label 有值时（首帧/尾帧）在左上角显示角标；onLibrary 有值时框下方显示「从仓库选图」链接。
function FrameUploadBox({
  label,
  url,
  inputRef,
  onPick,
  onClear,
  onLibrary,
}: {
  label?: string;
  url: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (f?: File) => void;
  onClear: () => void;
  onLibrary?: () => void;
}) {
  return (
    <div className="i2v-upbox-wrap">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div
        className={`upload-box ${url ? "filled" : ""}`}
        style={url ? { minHeight: 120, padding: 0, overflow: "hidden", position: "relative" } : undefined}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onPick(e.dataTransfer.files?.[0]);
        }}
      >
        {url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={label || "参考图"}
              style={{ width: "100%", height: 160, objectFit: "contain", display: "block", background: "#f3f4f6" }}
              onError={onClear} // 预览图加载失败 → 回退默认占位，可重新上传
            />
            {label && <span className="ov-frame-tag">{label}</span>}
            <button
              type="button"
              className="upload-clear"
              onClick={(e) => {
                e.stopPropagation();
                if (url.startsWith("blob:")) URL.revokeObjectURL(url);
                onClear();
              }}
            >
              <Icon name="close" size={14} />
            </button>
          </>
        ) : (
          <>
            <span className="ub-ico"><Icon name="image" size={26} /></span>
            <div className="ub-main">点击 / 拖拽上传{label || "图片"}</div>
            <div className="ub-sub">支持 jpg / jpeg / png，或从「仓库」选图</div>
          </>
        )}
      </div>
      {onLibrary && (
        <a className="ws-link i2v-upbox-lib" onClick={onLibrary}>
          <Icon name="storage" size={12} />从仓库选{label || "图"}
        </a>
      )}
    </div>
  );
}

function InspireCard({
  it,
  onUse,
  onPlay,
}: {
  it: (typeof INSPIRE)[number];
  onUse: () => void;
  onPlay: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  function handleEnter() {
    videoRef.current?.play().catch(() => undefined);
  }
  function handleLeave() {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
  }

  return (
    <div
      className="ag-card"
      style={{ cursor: "pointer" }}
      onClick={onPlay}
      title="点击查看视频"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div className="ag-thumb" style={{ aspectRatio: ratioToAspect(it.ratio) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ag-img" src={it.poster} alt={it.scene} loading="lazy" />
        <video
          ref={videoRef}
          className="ag-hover-video"
          src={it.videoUrl}
          muted
          loop
          playsInline
          preload="none"
        />
        <div className="case-hover">
          <button
            className="btn btn-primary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onUse();
            }}
          >
            套用灵感
          </button>
        </div>
      </div>
      <div className="ag-name">{it.scene}</div>
    </div>
  );
}
const STATUS_TEXT: Record<VideoRunRow["status"], string> = {
  pending: "排队中，预计等待 1 分钟",
  running: "AI 正在生成视频，请稍候…",
  done: "已完成",
  failed: "生成遇到问题，额度已退还",
};

function VideoRunCard({
  row,
  onDelete,
  onPlay,
  onRegenerate,
  onCopy,
  onDownload,
  onStudio,
  fav,
  onFav,
}: {
  row: VideoRunRow;
  onDelete: () => void;
  onPlay: () => void;
  onRegenerate: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onStudio: () => void;
  fav: boolean;
  onFav: () => void;
}) {
  const loading = row.status === "pending" || row.status === "running";
  const done = row.status === "done";
  const durLabel = (row.dur.match(/\d+/)?.[0] ?? "5").padStart(2, "0");

  return (
    <div className="ov-run">
      <div className="ov-run-head">
        {/* 提示词整宽置顶：默认 2 行省略，溢出时点击展开/收起（复用生图 ClampText 交互） */}
        <ClampText text={row.prompt} lines={2} className="ov-run-prompt" />
        <div className="ov-run-meta">
          <span className="ov-run-mode">{row.mode === "i2v" ? "图生视频" : "文生视频"}</span>
          <span className="lg-cat">{row.style} · {row.ratio} · {row.dur}</span>
          {!loading && (
            <button className="lh-ico lh-tip" data-tip="删除" aria-label="删除" onClick={onDelete}>
              <Icon name="trash" size={14} />
            </button>
          )}
          <span className="ov-run-time">{row.time}</span>
        </div>
      </div>

      <div
        className={`ov-video ${row.grad} ${done ? "clickable" : ""}`}
        style={{ aspectRatio: ratioToAspect(row.ratio) }}
        onClick={done ? onPlay : undefined}
        role={done ? "button" : undefined}
        title={done ? "点击播放预览" : undefined}
      >
        {row.videoUrl && !row.poster ? (
          // CORS 阻止 canvas 提取时，用 video 元素天然显示首帧
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video className="ov-video-poster" src={row.videoUrl} muted preload="metadata" />
        ) : (row.poster || done) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ov-video-poster" src={row.poster || posterFor(row)} alt="视频封面" />
        ) : null}
        {loading ? (
          row.status === "pending" ? (
            <div className="ov-video-loading">
              <Icon name="refresh" size={26} className="ico-spin" />
              <div className="ov-video-status">{STATUS_TEXT.pending}</div>
            </div>
          ) : (
            <div className="ov-video-loading">
              <div className="ov-video-bar"><span style={{ width: `${row.pct}%` }} /></div>
              <div className="ov-video-pct">{row.pct}% · 视频生成中</div>
            </div>
          )
        ) : row.status === "failed" ? (
          <div className="ov-video-loading">
            <Icon name="close" size={26} />
            <div className="ov-video-status" style={{ color: "var(--color-warn, #f59e0b)" }}>
              {row.failReason || "生成失败，请重试"}
            </div>
          </div>
        ) : (
          <>
            <button
              className={fav ? "lh-fav on" : "lh-fav"}
              title={fav ? "取消收藏" : "收藏"}
              onClick={(e) => {
                e.stopPropagation();
                onFav();
              }}
            >
              <Icon name="heart" size={15} />
            </button>
            <div className="ov-play">▶</div>
            <span className="ov-video-dur">00:{durLabel}</span>
            {row.withAudio !== false && <span className="ov-video-audio">有声</span>}
            <span className="lh-mark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="lh-mark-logo" src={assetUrl("/brand-logo.png")} alt="魔方智绘" />
              由 AI 生成
            </span>
          </>
        )}
      </div>

      {row.status === "failed" && (
        <div className="ov-run-acts">
          <button className="btn btn-soft btn-sm" onClick={onCopy}>
            <Icon name="edit" size={13} /> 重新编辑
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onRegenerate}>
            <Icon name="refresh" size={13} /> 再次生成
          </button>
        </div>
      )}

      {row.status === "done" && (
        <div className="ov-run-acts">
          <button className="btn btn-soft btn-sm" onClick={onDownload}>下载视频</button>
          <button className="btn btn-ghost btn-sm" onClick={onCopy}>
            <Icon name="edit" size={13} /> 重新编辑
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onRegenerate}>
            <Icon name="refresh" size={13} /> 再次生成
          </button>
          <button className="btn btn-primary btn-sm ov-run-studio" onClick={onStudio}>
            去制作大片 <Icon name="chevron" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/* 视频预览播放器：点击生成历史卡片打开。
   无真实视频模型，这里用海报图 + 实时 transform（Ken Burns 推拉）模拟一段可播放预览，
   播放时间由 requestAnimationFrame 驱动，播放/暂停/拖动进度条与画面运动严格同步、循环播放。 */
function VideoPlayerModal({
  row,
  onClose,
  onDownload,
  onStudio,
}: {
  row: VideoRunRow;
  onClose: () => void;
  onDownload: () => void;
  onStudio: () => void;
}) {
  const total = durSeconds(row.dur);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [videoError, setVideoError] = useState(false); // 真实视频加载失败 → 降级静态封面
  const [t, setT] = useState(0); // 当前播放秒（浮点）
  const raf = useRef(0);
  const last = useRef(0);
  const seeking = useRef(false);
  const audio = useRef<PlayerAudio | null>(null);
  const realVideoRef = useRef<HTMLVideoElement | null>(null);

  // 关闭「有声」时真实视频强制静音（视频文件可能自带音轨，React 的 muted 属性不总生效，用 ref 兜底）
  useEffect(() => {
    if (realVideoRef.current) realVideoRef.current.muted = row.withAudio === false;
  }, [row.withAudio]);

  // 声轨引擎：仅在「同时生成声音=开启」时创建，关闭时不生成任何音轨
  useEffect(() => {
    if (row.withAudio === false) return;
    audio.current = new PlayerAudio({ prompt: row.prompt, voice: row.voice, bgm: row.bgm });
    return () => {
      audio.current?.destroy();
      audio.current = null;
    };
  }, [row.prompt, row.voice, row.bgm]);

  // 播放/暂停 → 声音同步
  useEffect(() => {
    if (playing) audio.current?.play();
    else audio.current?.pause();
  }, [playing]);

  // 静音开关
  useEffect(() => {
    audio.current?.setMuted(muted, playing);
  }, [muted]); // eslint-disable-line react-hooks/exhaustive-deps

  // rAF 推进播放时间，到结尾循环回 0（循环时重读旁白）
  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      if (!seeking.current)
        setT((cur) => {
          if (cur + dt >= total) {
            audio.current?.restart();
            return 0;
          }
          return cur + dt;
        });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, total]);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const prog = Math.min(1, t / total);
  // 多帧支持：从 row.frames 读，降级到单张封面
  const frames = row.frames?.length ? row.frames : [posterFor(row)];
  const n = frames.length;
  const segLen = 1 / n;
  const segIdx = Math.min(Math.floor(prog / segLen), n - 1);
  const localP = Math.min(1, (prog - segIdx * segLen) / segLen); // 0-1，当前帧段内进度
  const nextIdx = Math.min(segIdx + 1, n - 1);
  const crossAlpha = localP > 0.75 ? (localP - 0.75) / 0.25 : 0;

  // Ken Burns 方向随帧序交替
  const KB_PRESETS = [
    { zoom: 0.14, tx: -4, ty: -2.5 },
    { zoom: 0.10, tx: +3.5, ty: +2 },
    { zoom: -0.08, tx: 0, ty: 0 },
  ];
  const curKb = KB_PRESETS[segIdx % KB_PRESETS.length] ?? KB_PRESETS[0];
  const scale = 1 + curKb.zoom * localP;
  const tx = curKb.tx * localP;
  const ty = curKb.ty * localP;
  const fmt = (s: number) => `00:${String(Math.floor(s)).padStart(2, "0")}`;

  function seekAt(clientX: number, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setT(ratio * total);
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="vp-panel" onClick={(e) => e.stopPropagation()}>
        <div className="vp-head">
          {/* 元数据行在上（含关闭），提示词整宽置于其下（2 行省略、点击展开） */}
          <div className="vp-head-meta">
            <span className="ov-run-mode">{row.mode === "i2v" ? "图生视频" : "文生视频"}</span>
            <span className="vp-meta-chips">
              <span className="vp-chip">{row.style}</span>
              <span className="vp-chip">{row.ratio}</span>
              <span className="vp-chip">{row.dur}</span>
              {row.withAudio !== false && <span className="vp-chip vp-chip-audio">有声</span>}
            </span>
            <button className="vp-close" onClick={onClose} aria-label="关闭">
              <Icon name="close" size={18} />
            </button>
          </div>
          <ClampText text={row.prompt} lines={2} className="vp-title" />
        </div>

        <div className="vp-stage">
          {row.videoUrl && !videoError ? (
            /* 真实视频：原生 <video>，内置音画同步音轨 */
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              ref={realVideoRef}
              className="vp-real-video"
              src={row.videoUrl}
              autoPlay
              controls
              playsInline
              loop
              muted={row.withAudio === false}
              // 隐藏原生控件溢出菜单的下载 / 播放速度 / 画中画
              controlsList="nodownload noplaybackrate"
              disablePictureInPicture
              onError={() => setVideoError(true)}
            />
          ) : (
            <>
              {/* 无真实视频 / 视频加载失败时展示静态封面（演示记录、降级兜底） */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="vp-frame" src={posterFor(row)} alt={row.prompt} />
              <div className="vp-vignette" />
              <div className="vp-caption">{row.prompt}</div>
              {videoError && <div className="vp-load-fail">视频加载失败，可尝试重新生成</div>}
            </>
          )}
        </div>


        <div className="vp-foot">
          <button className="btn btn-soft btn-sm" onClick={onDownload}>
            <Icon name="download" size={14} /> 下载视频
          </button>
          <div className="vp-foot-spacer" />
          <button className="btn btn-primary btn-sm" onClick={onStudio}>
            去制作大片 <Icon name="chevron" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
