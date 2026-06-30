"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
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
  videoVoices,
  videoBgms,
  videoModels,
  videoPipeline,
  audioTracks,
  videoDurationRange,
} from "@/data/video";
import type { VideoRunRow, Grad, AssetCard } from "@/lib/types";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";

/* F10 一句话视频：文生视频(T2V) / 图生视频(I2V) 双 Tab。
   演示骨架：场景引导词库 + 参数 + 首尾帧 + 内容安全预检/复检 + 进度状态机 + 后处理/审核流。
   出片为演示占位（无真视频模型）；额度/RAG变量/安全检测/审核/通知均为前端模拟。 */

const GRADS: Grad[] = ["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4"];
// 敏感词演示：命中则安全预检拦截
const BLOCK_WORDS = ["反动", "暴恐", "色情", "血腥"];

// 预置 3 条「已完成」生成历史（演示）：保证每次进入都有现成记录，可直接点下载/重生成/存库/提交审核
const SEED_RUNS: VideoRunRow[] = [
  {
    id: "seed-1",
    mode: "t2v",
    prompt: "安吉特产白茶，产地直发，新鲜直达，横版宣传短视频",
    scene: "农产品展示",
    ratio: "16:9",
    dur: "5秒",
    style: "写实",
    time: "2026-06-26 09:20",
    status: "done",
    pct: 100,
    grad: "thumb-grad-1",
    voice: "温柔女声",
    bgm: "舒缓",
    withAudio: true,
  },
  {
    id: "seed-2",
    mode: "t2v",
    prompt: "金秋丰收，安吉茶园喜获丰收，农民笑脸特写",
    scene: "丰收季节",
    ratio: "9:16",
    dur: "10秒",
    style: "电影感",
    time: "2026-06-26 09:05",
    status: "done",
    pct: 100,
    grad: "thumb-grad-3",
    voice: "沉稳男声",
    bgm: "大气",
    withAudio: true,
  },
  {
    id: "seed-3",
    mode: "i2v",
    prompt: "茶叶采摘动作，镜头缓缓推近",
    ratio: "16:9",
    dur: "5秒",
    style: "国风水墨",
    time: "2026-06-26 08:48",
    status: "done",
    pct: 100,
    poster: "/poster-samples/20251219175905342092j5c2dj.jpg",
    grad: "thumb-grad-2",
    voice: "不配音",
    bgm: "国风",
    withAudio: true,
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
// 参考灵感：取前 6 个县域场景模板 + 海报样张，供右栏一键套用到提示词
const INSPIRE = videoSceneTpls.slice(0, 6).map((t, i) => ({
  ...t,
  poster: POSTER_POOL[i % POSTER_POOL.length],
}));

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

// 调真实视频模型（Seedance 2.0 / MiniMax 等）生成含音画的视频文件；失败返回 null，前端自动降级 Ken Burns
async function genRealVideo(prompt: string, ratio: string, dur: string, videoModel: string): Promise<string | null> {
  try {
    const r = await fetch("/api/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, ratio, dur, model: videoModel }),
      signal: AbortSignal.timeout(110_000), // 稍低于后端 120s 上限
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { videoUrl?: string };
    return j.videoUrl ?? null;
  } catch {
    return null;
  }
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
async function optimizeVideoPrompt(input: string): Promise<string | null> {
  try {
    const r = await fetch("/api/video-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
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

// 由累计进度 pct 反推当前所处的音画管线阶段下标
function stageOf(pct: number): number {
  const i = videoPipeline.findIndex((s) => pct < s.to);
  return i === -1 ? videoPipeline.length - 1 : i;
}

// 据配音/BGM 选择推导本次实际生成的音轨：旁白随配音、BGM随背景音乐，音效+环境声始终自动生成
function tracksFor(voice?: string, bgm?: string) {
  return audioTracks.filter((t) => {
    if (t.key === "tts") return !!voice && voice !== "不配音";
    if (t.key === "bgm") return !!bgm && bgm !== "无";
    if (t.key === "sfx") return true; // 音效始终生成
    return false; // 其他音轨（已删除的 amb 等）不显示
  });
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
  const [sceneCat, setSceneCat] = useState(videoSceneCats[0]); // 场景一级分类筛选
  const [prompt, setPrompt] = useState("");
  const [expanding, setExpanding] = useState(false);
  // —— 图生视频 ——
  const [firstFrame, setFirstFrame] = useState(""); // 首帧图 URL
  const [lastFrame, setLastFrame] = useState(""); // 尾帧图 URL（首尾帧模式）
  const [endFrameOn, setEndFrameOn] = useState(false); // 首尾帧开关 F10-04
  const [motion, setMotion] = useState(""); // 运动描述
  const [motionCat, setMotionCat] = useState(motionWords[0].cat);
  // —— 公共参数 ——
  const [ratio, setRatio] = useState<string>(videoRatios[0]);
  const [durSec, setDurSec] = useState(5); // 视频时长（秒），滑杆控制
  const [quality, setQuality] = useState<string>(videoQualities[1]); // 默认 720P
  const [genAudio, setGenAudio] = useState(true); // 是否同时生成声音
  const [style, setStyle] = useState(videoStyles[0].name);
  const [voice, setVoice] = useState<string>(videoVoices[1]); // 配音音色，默认温柔女声
  const [bgm, setBgm] = useState<string>(videoBgms[1]); // 背景音乐，默认舒缓
  const [model, setModel] = useState<string>("Seedance 1.5 Pro"); // 视频生成模型
  const [count, setCount] = useState(1);

  const [runs, setRuns] = useState<VideoRunRow[]>(SEED_RUNS);
  const [resultTab, setResultTab] = useState<"history" | "inspire">("history"); // 右侧面板 Tab
  const [onlyFav, setOnlyFav] = useState(false); // 只看收藏
  const [playingId, setPlayingId] = useState<string | null>(null); // 播放器中预览记录的 id
  const playing = playingId ? (runs.find((r) => r.id === playingId) ?? null) : null; // 衍生：始终取 runs 最新状态
  const [busy, setBusy] = useState(false);
  const [safe, setSafe] = useState<null | "checking" | "blocked">(null); // 安全预检状态
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

  // 选场景模板：填充引导词（保留【变量】占位，模拟「县域知识库未录入」提示）
  function pickScene(s: string, p: string) {
    setScene(s);
    setPrompt(p);
    if (/【.+?】/.test(p)) toast("引导词含县域变量，发布时将从县域知识库自动填充（演示）");
  }

  // 套用右栏参考灵感：切到文生视频并填入对应场景提示词
  function useInspire(it: (typeof INSPIRE)[number]) {
    setTab("t2v");
    setSceneCat(it.cat);
    setScene(it.scene);
    setPrompt(it.prompt);
    toast("已套用参考灵感到提示词");
  }

  // AI 扩写（演示）：在原描述后补一段镜头/光影细节
  function expand() {
    const base = prompt.trim();
    if (!base) {
      toast("请先输入或选择一个场景引导词", "warn");
      return;
    }
    setExpanding(true);
    optimizeVideoPrompt(base).then((optimized) => {
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
        startGenerate(isI2v, text);
      }, 900)
    );
  }

  function startGenerate(isI2v: boolean, text: string) {
    enqueue({
      mode: isI2v ? "i2v" : "t2v",
      text,
      scene: isI2v ? undefined : scene || undefined,
      ratio,
      dur: `${durSec}秒`,
      style,
      poster: isI2v ? firstFrame : undefined,
      voice: genAudio ? voice : "不配音",
      bgm: genAudio ? bgm : "无",
      withAudio: genAudio,
      videoModel: model,
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
    voice?: string;
    bgm?: string;
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
      grad,
      voice: p.voice,
      bgm: p.bgm,
      withAudio: p.withAudio !== false, // 默认 true，显式传 false 时关闭
    };
    setRuns((prev) => [row, ...prev]);

    // 排队 → 无声视频 → 镜头分析 → 声音设计 → 多轨音频 → 对齐 → 混音封装（音画管线节奏）
    const upd = (patch: Partial<VideoRunRow>) =>
      setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

    // 「生成画面」：文生视频并行生成 2 帧关键图；图生视频用已上传的首帧
    const framesPromise: Promise<string[]> =
      p.mode === "i2v"
        ? Promise.resolve(p.poster ? [p.poster] : [])
        : genVideoFrames(p.text, p.ratio);
    let frameReady = false;
    let frameUrl: string | null = p.poster ?? null;
    let allFrames: string[] = p.poster ? [p.poster] : [];
    framesPromise.then((urls) => {
      frameReady = true;
      if (urls.length) {
        allFrames = urls;
        frameUrl = urls[0];
        upd({ poster: urls[0], frames: urls }); // 首帧铺卡片封面，全帧存入 row
        // 视觉驱动配乐：分析首帧画面自动匹配最佳 BGM 风格
        if (p.withAudio !== false) {
          void inferBgmFromFrame(urls[0]).then((bgmStyle) => {
            if (bgmStyle) {
              upd({ bgm: bgmStyle });
              toast(`🎵 AI 配乐：根据画面匹配「${bgmStyle}」背景音乐`);
            }
          });
        }
        // Ken Burns 帧 → 真实视频文件（canvas + MediaRecorder），生成后直接写 videoUrl 供播放器播放
        void recordKenBurnsVideo(urls, p.ratio, p.dur, p.text).then((blobUrl) => {
          if (blobUrl) upd({ videoUrl: blobUrl });
        });
      }
    });

    timers.current.push(window.setTimeout(() => upd({ status: "running", pct: 4 }), 800));
    let pct = 4;
    const iv = window.setInterval(() => {
      // 画面未就绪时进度封顶 90%（模型仍在出片），就绪后放行到 99%
      const cap = frameReady ? 99 : 90;
      pct = Math.min(cap, pct + 4);
      upd({ pct });
    }, 240);
    timers.current.push(iv as unknown as number);

    // 后台静默调真实视频模型（Seedance 2.0 等）；成功后直接升级 row.videoUrl，Ken Burns 版本已可用不阻塞
    if (p.mode === "t2v") {
      const vm = p.videoModel ?? model;
      genRealVideo(p.text, p.ratio, p.dur, vm)
        .then((videoUrl) => {
          if (videoUrl) {
            upd({ videoUrl });
            toast("🎬 音画视频就绪！播放器已升级为真实视频（含内置音轨）");
          }
        })
        .catch(() => { /* 忽略：Ken Burns 版本已就绪 */ });
    }

    // 完成时机：等画面生成完成（无论成败）+ 最短演示节奏，二者都满足才封装
    const minDelay = new Promise<void>((res) => timers.current.push(window.setTimeout(res, 3500)));
    void Promise.all([framesPromise.catch(() => []), minDelay]).then(() => {
      window.clearInterval(iv);
      const finalPoster = frameUrl ?? p.poster;
      // 混音封装完成 → MP4 有声视频
      upd({ status: "done", pct: 100, poster: finalPoster, frames: allFrames.length ? allFrames : undefined });
      setBusy(false);
      const hasAudio = row.withAudio !== false;
      const tracks = hasAudio ? tracksFor(p.voice, p.bgm) : [];
      addWork({
        emoji: "🎬",
        grad,
        kind: "视频",
        name: `${p.text.slice(0, 12) || "一句话视频"} · ${p.dur}`,
        sub: hasAudio ? "视频生成 · 一句话成片 · 有声" : "视频生成 · 一句话成片",
        img: finalPoster,
        time: nowStamp(),
        edit: { sub: "oneline", input: p.text, model, voice: p.voice ?? voice, bgm: p.bgm ?? bgm },
      });
      if (hasAudio) {
        toast(`🔊 有声视频已合成（${tracks.map((t) => t.name).join("·")}），已存入「我的作品」`);
      } else {
        toast("视频已生成（静音），已存入「我的作品」");
      }
    });
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
      voice: row.voice ?? voice,
      bgm: row.bgm ?? bgm,
    });
    toast("已按原参数重新生成");
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

  // 存内容库：写入「仓库 · 我的作品」并跳转到仓库页
  function saveToLibrary(row: VideoRunRow) {
    addWork(videoAsset(row));
    toast("已保存到「仓库 · 我的作品」，正在跳转…");
    router.push("/storage");
  }

  // 收藏：与品牌设计一致——写入「我的作品」并标记收藏，和仓库「只看收藏」互通
  function toggleFav(row: VideoRunRow) {
    const a = videoAsset(row);
    const was = isFavorite(a);
    addWork(a);
    toggleFavorite(a);
    toast(was ? "已取消收藏" : "已收藏，可在「仓库 · 我的作品」用「只看收藏」筛选");
  }

  // 下载视频：用 canvas 实时重放封面的 Ken Burns 运镜（与播放器一致），
  // 经 MediaRecorder 按视频时长录制为真实视频文件（mp4/webm）落盘到本地。
  async function downloadVideo(row: VideoRunRow) {
    if (dlRef.current) {
      toast("视频正在生成中，请稍候…");
      return;
    }
    // 真实视频：直接触发浏览器下载，无需 canvas 录制
    if (row.videoUrl) {
      const a = document.createElement("a");
      a.href = row.videoUrl;
      a.download = `${row.prompt.slice(0, 16) || "video"}.mp4`;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("已开始下载真实视频（MP4 · 含音画同步音轨）");
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

  const scenes = videoSceneTpls.filter((t) => t.cat === sceneCat);
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
                    <div className="filter-row" style={{ marginBottom: 10 }}>
                      {videoSceneCats.map((c) => (
                        <span key={c} className={sceneCat === c ? "sel-chip on" : "sel-chip"} onClick={() => setSceneCat(c)}>
                          {c}
                        </span>
                      ))}
                    </div>
                    <div id="ovSceneSub" className="preset-grid">
                      {scenes.map((s) => (
                        <button
                          key={s.scene}
                          type="button"
                          className={scene === s.scene ? "preset-chip on" : "preset-chip"}
                          onClick={() => pickScene(s.scene, s.prompt)}
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
                    <div className={`ov-frames ${endFrameOn ? "two" : ""}`}>
                      <FrameSlot
                        label="首帧"
                        url={firstFrame}
                        inputRef={firstRef}
                        onPick={(f) => pickFile("first", f)}
                        onClear={() => setFirstFrame("")}
                      />
                      {endFrameOn && (
                        <FrameSlot
                          label="尾帧"
                          url={lastFrame}
                          inputRef={lastRef}
                          onPick={(f) => pickFile("last", f)}
                          onClear={() => setLastFrame("")}
                        />
                      )}
                    </div>
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
                      {motionWords.map((m) => (
                        <span key={m.cat} className={motionCat === m.cat ? "sel-chip on" : "sel-chip"} onClick={() => setMotionCat(m.cat)}>
                          {m.cat}
                        </span>
                      ))}
                    </div>
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
                <div className="ov-ratio-row">
                  {videoRatios.map((r) => {
                    const [rw, rh] = ratioWH(r);
                    const H = 14;
                    const W = Math.min(Math.round(H * rw / rh), 30);
                    return (
                      <button
                        key={r}
                        type="button"
                        className={`ov-ratio-btn ${ratio === r ? "on" : ""}`}
                        onClick={() => setRatio(r)}
                      >
                        <span className="ov-ratio-ico" style={{ width: W, height: H }}>
                          {r === "智能" && <span className="ov-ratio-star">✦</span>}
                        </span>
                        <span className="ov-ratio-label">{r}</span>
                      </button>
                    );
                  })}
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
                <div className="preset-grid">
                  {videoStyles.map((s) => (
                    <button key={s.key} type="button" className={style === s.name ? "preset-chip on" : "preset-chip"} onClick={() => setStyle(s.name)}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <div className="ws-label">同时生成声音</div>
                <div className="seg">
                  <div className={genAudio ? "seg-item on" : "seg-item"} onClick={() => setGenAudio(true)}>开启</div>
                  <div className={!genAudio ? "seg-item on" : "seg-item"} onClick={() => setGenAudio(false)}>关闭</div>
                </div>
              </div>
              {/* —— 音频：配音 + 背景音乐（仅在「同时生成声音」开启时显示） —— */}
              {genAudio && (
                <>
                  <div className="field">
                    <div className="ws-label">配音</div>
                    <div className="chip-row">
                      {videoVoices.map((v) => (
                        <span key={v} className={voice === v ? "sel-chip on" : "sel-chip"} onClick={() => setVoice(v)}>
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <div className="ws-label">背景音乐</div>
                    <div className="chip-row">
                      {videoBgms.map((b) => (
                        <span key={b} className={bgm === b ? "sel-chip on" : "sel-chip"} onClick={() => setBgm(b)}>
                          {b === "无" ? "无背景音乐" : b}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}

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
              <button className="btn btn-primary btn-block gen-btn" disabled={busy || safe === "checking"} onClick={run}>
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
                    onSave={() => saveToLibrary(r)}
                    onDownload={() => downloadVideo(r)}
                    fav={isFavorite(videoAsset(r))}
                    onFav={() => toggleFav(r)}
                    toast={toast}
                  />
                ))}
              </div>
            )
          ) : (
            <div className="ag-grid">
              {INSPIRE.map((it) => (
                <div className="ag-card" key={it.scene} style={{ cursor: "pointer" }} onClick={() => useInspire(it)}>
                  <div className="ag-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="ag-img" src={it.poster} alt={it.scene} loading="lazy" />
                    <div className="case-hover">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          useInspire(it);
                        }}
                      >
                        套用灵感
                      </button>
                    </div>
                  </div>
                  <div className="ag-name">
                    {it.emoji} {it.scene}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {playing && (
        <VideoPlayerModal
          row={playing}
          onClose={() => setPlayingId(null)}
          onDownload={() => downloadVideo(playing)}
          onSave={() => {
            saveToLibrary(playing);
            setPlayingId(null);
          }}
          onStudio={() => router.push("/video?sub=studio&from=history")}
        />
      )}
    </>
  );
}


function FrameSlot({
  label,
  url,
  inputRef,
  onPick,
  onClear,
}: {
  label: string;
  url: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (f?: File) => void;
  onClear: () => void;
}) {
  return (
    <div className={`ov-frame ${url ? "filled" : ""}`} onClick={() => inputRef.current?.click()}>
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
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} />
          <button
            type="button"
            className="ov-frame-clear"
            onClick={(e) => {
              e.stopPropagation();
              if (url.startsWith("blob:")) URL.revokeObjectURL(url);
              onClear();
            }}
          >
            <Icon name="close" size={13} />
          </button>
        </>
      ) : (
        <>
          <Icon name="plus" size={18} />
          <span>上传{label}</span>
        </>
      )}
      <span className="ov-frame-tag">{label}</span>
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
  onSave,
  onDownload,
  fav,
  onFav,
  toast,
}: {
  row: VideoRunRow;
  onDelete: () => void;
  onPlay: () => void;
  onRegenerate: () => void;
  onSave: () => void;
  onDownload: () => void;
  fav: boolean;
  onFav: () => void;
  toast: (s: string) => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const loading = row.status === "pending" || row.status === "running";
  const done = row.status === "done";
  const durLabel = (row.dur.match(/\d+/)?.[0] ?? "5").padStart(2, "0");

  return (
    <div className="ov-run">
      <div className="ov-run-head">
        <span className="ov-run-mode">{row.mode === "i2v" ? "图生视频" : "文生视频"}</span>
        <span className="ov-run-prompt">{row.prompt}</span>
        <span className="lg-cat">{row.style} · {row.ratio} · {row.dur}</span>
        {!loading && (
          <button className="lh-ico lh-tip" data-tip="删除" aria-label="删除" onClick={onDelete}>
            <Icon name="trash" size={14} />
          </button>
        )}
        <span className="ov-run-time">{row.time}</span>
      </div>

      <div
        className={`ov-video ${row.grad} ${done ? "clickable" : ""}`}
        onClick={done ? onPlay : undefined}
        role={done ? "button" : undefined}
        title={done ? "点击播放预览" : undefined}
      >
        {(row.poster || done) ? (
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
            (() => {
              const si = stageOf(row.pct);
              const st = videoPipeline[si];
              const tracks = tracksFor(row.voice, row.bgm);
              return (
                <div className="ov-video-loading ov-pipe">
                  <div className="ov-pipe-now">
                    <span className="ov-pipe-text">
                      <b>{st.name}</b>
                      <i>{st.desc}</i>
                    </span>
                  </div>
                  <div className="ov-pipe-steps">
                    {videoPipeline.map((s, i) => (
                      <span
                        key={s.key}
                        className={`ov-pipe-dot ${i < si ? "done" : i === si ? "on" : ""}`}
                        title={s.name}
                      />
                    ))}
                  </div>
                  {st.key === "audio" && (
                    <div className="ov-pipe-tracks">
                      {tracks.map((t) => (
                        <span key={t.key} className="ov-track">
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="ov-video-bar"><span style={{ width: `${row.pct}%` }} /></div>
                  <div className="ov-video-pct">{row.pct}% · 合成有声视频</div>
                </div>
              );
            })()
          )
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

      {row.status === "done" && (
        <div className="ov-run-acts">
          <button className="btn btn-soft btn-sm" onClick={onDownload}>下载视频</button>
          <button className="btn btn-ghost btn-sm" onClick={onRegenerate}>重新生成</button>
          <button className="btn btn-ghost btn-sm" onClick={onSave}>存内容库</button>
          <button
            className="btn btn-primary btn-sm"
            disabled={reviewing}
            onClick={() => {
              setReviewing(true);
              toast("已提交审核，进入审核队列");
            }}
          >
            {reviewing ? "审核中…" : "提交审核"}
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
  onSave,
  onStudio,
}: {
  row: VideoRunRow;
  onClose: () => void;
  onDownload: () => void;
  onSave: () => void;
  onStudio: () => void;
}) {
  const total = durSeconds(row.dur);
  const tracks = row.withAudio !== false ? tracksFor(row.voice, row.bgm) : [];
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [t, setT] = useState(0); // 当前播放秒（浮点）
  const raf = useRef(0);
  const last = useRef(0);
  const seeking = useRef(false);
  const audio = useRef<PlayerAudio | null>(null);

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
          <span className="ov-run-mode">{row.mode === "i2v" ? "图生视频" : "文生视频"}</span>
          <span className="vp-title">{row.prompt}</span>
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

        <div className="vp-stage" style={{ aspectRatio: ratioToAspect(row.ratio) }}>
          {row.videoUrl ? (
            /* 真实视频：原生 <video>，内置音画同步音轨 */
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              className="vp-real-video"
              src={row.videoUrl}
              autoPlay
              controls
              playsInline
              loop
            />
          ) : (
            <>
              {/* Ken Burns 多帧播放（无真实视频时的降级方案） */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="vp-frame"
                src={frames[segIdx]}
                alt={row.prompt}
                style={{ transform: `scale(${scale}) translate(${tx}%, ${ty}%)` }}
              />
              {crossAlpha > 0 && nextIdx !== segIdx && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="vp-frame vp-frame-next"
                  src={frames[nextIdx]}
                  alt={row.prompt}
                  style={{ opacity: crossAlpha }}
                />
              )}
              <div className="vp-vignette" />
              <div className="vp-caption">{row.prompt}</div>
              {!playing && (
                <button className="vp-bigplay" onClick={() => setPlaying(true)} aria-label="播放">
                  ▶
                </button>
              )}
            </>
          )}
        </div>

        {/* 自定义控制条：仅 Ken Burns 降级模式下显示；真实视频使用 <video controls> 原生控制 */}
        {!row.videoUrl && (
          <div className="vp-controls">
            <button className="vp-ctrl" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "暂停" : "播放"}>
              {playing ? "❚❚" : "▶"}
            </button>
            <span className="vp-time">{fmt(t)}</span>
            <div
              className="vp-track"
              onPointerDown={(e) => {
                seeking.current = true;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                seekAt(e.clientX, e.currentTarget);
              }}
              onPointerMove={(e) => {
                if (seeking.current) seekAt(e.clientX, e.currentTarget);
              }}
              onPointerUp={(e) => {
                seeking.current = false;
                last.current = performance.now();
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
              }}
            >
              <span className="vp-fill" style={{ width: `${prog * 100}%` }} />
              <span className="vp-knob" style={{ left: `${prog * 100}%` }} />
            </div>
            <span className="vp-time">{fmt(total)}</span>
            <button
              className="vp-ctrl vp-mute"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "取消静音" : "静音"}
              title={muted ? "取消静音" : "静音"}
            >
              {muted ? "静音" : "音量"}
            </button>
          </div>
        )}

        <div className="vp-tracks">
          <span className="vp-tracks-label">音轨</span>
          {row.videoUrl ? (
            <span className="vp-atrack">
              音画同步 · Seedance 2.0 内置音轨
            </span>
          ) : (
            tracks.map((t) => (
              <span key={t.key} className="vp-atrack">
                {t.name}
                {t.key === "tts" && row.voice ? ` · ${row.voice}` : ""}
                {t.key === "bgm" && row.bgm ? ` · ${row.bgm}` : ""}
              </span>
            ))
          )}
        </div>

        <div className="vp-foot">
          <button className="btn btn-soft btn-sm" onClick={onDownload}>
            <Icon name="download" size={14} /> 下载视频
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onSave}>
            存内容库
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
