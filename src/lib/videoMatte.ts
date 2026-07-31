"use client";

/* RVM 视频抠像合成（方案 B，替代绿幕方案 A）：
   数字人视频照常由 s2v 用「原图」生成（人物清晰、无绿底掉画质），
   本模块用 RVM(Robust Video Matting, 字节开源) 逐帧抠出人像 alpha，
   直接叠到 i2v 动态背景/静态背景上，无 chroma-key、无绿边。
   模型：/models/rvm_mobilenetv3_fp32.onnx；ort wasm：/ort/。 */

import { loadImage, pickMime, drawWrappedText } from "@/lib/videoFx";

/* 时间轴字幕：一段口播按句拆分、依权威时长分配的字幕条。数字人换背景合成/无背景直出共用。 */
export interface SubCue { start: number; end: number; text: string }

/** 把一段文本切成「随声逐句出」的短字幕节：先按句末标点分句，过长的句子再按逗号切，
    仍过长则按顿号/字数硬切，保证每条字幕≈两行内可读、不堆一起、不被「…」截断。 */
function splitCueSegments(script: string, maxChars: number): string[] {
  const raw = (script || "").replace(/[ \t]+/g, " ").trim();
  if (!raw) return [];
  const sents = raw.split(/(?<=[。！？!?；;\n])/).map((s) => s.trim()).filter(Boolean);
  const segs: string[] = [];
  const hardWrap = (t: string) => { for (let i = 0; i < t.length; i += maxChars) segs.push(t.slice(i, i + maxChars)); };
  for (const s of sents) {
    if (s.length <= maxChars) { segs.push(s); continue; }
    // 句子过长：先按逗号(，,)贪心聚合到 maxChars，再对仍超长的节按顿号(、)聚合，最后字数硬切
    const clauses = s.split(/(?<=[，,])/).map((c) => c.trim()).filter(Boolean);
    let buf = "";
    const flush = () => { if (buf) { segs.push(buf); buf = ""; } };
    for (const c of clauses) {
      if (c.length > maxChars) {
        flush();
        const parts = c.split(/(?<=、)/).map((p) => p.trim()).filter(Boolean);
        let b2 = "";
        for (const p of parts) {
          if (p.length > maxChars) { if (b2) { segs.push(b2); b2 = ""; } hardWrap(p); continue; }
          if ((b2 + p).length > maxChars) { segs.push(b2); b2 = ""; }
          b2 += p;
        }
        if (b2) segs.push(b2);
        continue;
      }
      if ((buf + c).length > maxChars) flush();
      buf += c;
    }
    flush();
  }
  return segs;
}

/** 把口播文案切成随声逐句出的短字幕、依内容时长按字数比例分配时间轴 —— 与「制作大片」分句字幕同规则。 */
export function buildAvatarCues(script: string, duration: number, maxChars = 20): SubCue[] {
  const segs = splitCueSegments(script, maxChars);
  if (!segs.length || !(duration > 0)) return [];
  const totalChars = segs.reduce((n, s) => n + s.length, 0) || 1;
  const cues: SubCue[] = [];
  let acc = 0;
  for (const s of segs) {
    const d = duration * (s.length / totalChars);
    cues.push({ start: +acc.toFixed(3), end: +(acc + d).toFixed(3), text: s });
    acc += d;
  }
  cues[cues.length - 1].end = duration; // 末句补齐到结尾，避免累积误差留白
  return cues;
}

/** 把当前时刻对应的字幕烧到画面底部（含护底暗角），样式与 videoFx 导出字幕一致。ctx 尺寸 = W×H。 */
function drawCaptionAt(ctx: CanvasRenderingContext2D, cues: SubCue[], t: number, W: number, H: number) {
  const cur = cues.find((c) => t >= c.start && t < c.end) ?? (t >= (cues[cues.length - 1]?.end ?? 0) ? cues[cues.length - 1] : undefined);
  if (!cur?.text) return;
  // 底部暗角，保证字幕在任意背景上可读
  const g = ctx.createLinearGradient(0, H * 0.72, 0, H);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.save();
  ctx.fillStyle = g; ctx.fillRect(0, Math.round(H * 0.72), W, Math.round(H * 0.28));
  const pad = Math.round(W * 0.045);
  const fs = Math.max(14, Math.round(H * 0.04));
  ctx.fillStyle = "#fff";
  ctx.font = `600 ${fs}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 10;
  drawWrappedText(ctx, cur.text, pad, H - pad, W - 2 * pad, fs * 1.35, 2);
  ctx.restore();
}

type Ort = typeof import("onnxruntime-web");
type Session = import("onnxruntime-web").InferenceSession;
type Tensor = import("onnxruntime-web").Tensor;

let _ort: Ort | null = null;
let _session: Session | null = null;
let _backend = "";

/** 懒加载 RVM 会话（单例）。优先 WebGPU，回退 WASM。 */
export async function loadMatteSession(): Promise<{ ort: Ort; session: Session; backend: string }> {
  if (_ort && _session) return { ort: _ort, session: _session, backend: _backend };
  const ort = await import("onnxruntime-web");
  ort.env.wasm.wasmPaths = "/ort/";
  // 跨源隔离(COOP/COEP)可用时开多线程提速；否则回退单线程（不会报错，只是慢）。
  const isolated = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
  ort.env.wasm.numThreads = isolated ? Math.min(8, (navigator.hardwareConcurrency || 4)) : 1;
  // RVM 含 AveragePool(ceil_mode)，WebGPU 内核不支持（推理期报错），故固定用 WASM。
  const session = await ort.InferenceSession.create("/models/rvm_mobilenetv3_fp32.onnx", { executionProviders: ["wasm"] });
  _backend = `wasm×${ort.env.wasm.numThreads}`;
  _ort = ort; _session = session;
  return { ort, session, backend: _backend };
}

// RVM 递归状态（帧间传递，初始为 [1,1,1,1] 零张量）
function initRec(ort: Ort): Tensor[] {
  return [0, 0, 0, 0].map(() => new ort.Tensor("float32", new Float32Array(1), [1, 1, 1, 1]));
}

// 取图为 ImageBitmap：data URI 直接 / 同源直接 / 跨域走代理（避免 CORS 污染画布导致 getImageData 失败）
export async function imgSrcToBitmap(src: string): Promise<ImageBitmap> {
  let blob: Blob;
  if (src.startsWith("data:")) {
    blob = await fetch(src).then((r) => r.blob());
  } else {
    const isCross = /^https?:\/\//.test(src) && !src.startsWith(location.origin);
    const url = isCross ? `/api/proxy-image?url=${encodeURIComponent(src)}` : src;
    blob = await fetch(url).then((r) => { if (!r.ok) throw new Error("形象图读取失败"); return r.blob(); });
  }
  return createImageBitmap(blob);
}

/** 抠出单张图里的人像 → 返回带透明通道的 canvas（供「编辑形象」预览合成用）。 */
export async function matteImageToCanvas(imgSrc: string, procLong = 512, crop = true): Promise<HTMLCanvasElement> {
  const { ort, session } = await loadMatteSession();
  const img = await imgSrcToBitmap(imgSrc);
  const iw = img.width || 720, ih = img.height || 1280;
  const s = Math.min(1, procLong / Math.max(iw, ih));
  const w = Math.max(32, Math.round(iw * s)), h = Math.max(32, Math.round(ih * s));
  const proc = document.createElement("canvas"); proc.width = w; proc.height = h;
  const pctx = proc.getContext("2d", { willReadFrequently: true })!;
  pctx.drawImage(img, 0, 0, w, h);
  const src = imageDataToSrc(ort, pctx.getImageData(0, 0, w, h).data, w, h);
  const z = () => new ort.Tensor("float32", new Float32Array(1), [1, 1, 1, 1]);
  const out = await session.run({ src, r1i: z(), r2i: z(), r3i: z(), r4i: z(), downsample_ratio: new ort.Tensor("float32", new Float32Array([Math.max(0.25, Math.min(1, 512 / Math.max(w, h)))]), [1]) });
  const pha = out.pha.data as Float32Array;
  // 人像 RGB + alpha 遮罩
  const cut = document.createElement("canvas"); cut.width = w; cut.height = h;
  const cx = cut.getContext("2d")!;
  cx.drawImage(img, 0, 0, w, h);
  const id = cx.getImageData(0, 0, w, h);
  for (let i = 0; i < pha.length; i++) id.data[i * 4 + 3] = Math.round(pha[i] * 255);
  cx.putImageData(id, 0, 0);
  if (!crop) return cut; // 整图返回（与合成的整帧 fgc 锚点一致，供 layerRect 变换）
  // 裁剪到人物 alpha 包围盒：定位「人」而非「整张图画布」，避免原图空白把人顶出画面
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (pha[y * w + x] > 0.08) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  if (maxX >= 0 && cw > 10 && ch > 10 && (cw < w - 2 || ch < h - 2)) {
    const crop = document.createElement("canvas"); crop.width = cw; crop.height = ch;
    crop.getContext("2d")!.drawImage(cut, minX, minY, cw, ch, 0, 0, cw, ch);
    return crop;
  }
  return cut;
}

/** 通用「平/纯背景」抠图：从四角估背景色，自图像边缘 flood-fill 去除连通的背景色区域 → alpha。
    适合卡通/插画/贴纸等 RVM(真人模型) 抠不出、但背景较平整的图。返回带透明背景的整帧 canvas。 */
export async function matteFlatBg(imgSrc: string, procLong = 900): Promise<HTMLCanvasElement> {
  const img = await imgSrcToBitmap(imgSrc);
  const s = Math.min(1, procLong / Math.max(img.width || 1, img.height || 1));
  const w = Math.max(8, Math.round((img.width || 720) * s)), h = Math.max(8, Math.round((img.height || 1280) * s));
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  // 背景色：四角各取一片小样本的中位色
  const cs = [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]].map(([x, y]) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]] as [number, number, number]; });
  const bg = [0, 1, 2].map((c) => cs.map((p) => p[c]).sort((a, b) => a - b)[1]);
  const tol = 46; const tol2 = tol * tol;
  const near = (p: number) => { const dr = d[p * 4] - bg[0], dg = d[p * 4 + 1] - bg[1], db = d[p * 4 + 2] - bg[2]; return dr * dr + dg * dg + db * db <= tol2; };
  // 从所有边缘像素 flood-fill，标记与背景色连通的区域
  const mask = new Uint8Array(w * h); const stack: number[] = [];
  const push = (x: number, y: number) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const p = y * w + x; if (mask[p] || !near(p)) return; mask[p] = 1; stack.push(p); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) { const p = stack.pop()!; const x = p % w, y = (p / w) | 0; push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1); }
  // 背景 alpha=0，前景=255
  for (let p = 0; p < w * h; p++) d[p * 4 + 3] = mask[p] ? 0 : 255;
  // 轻羽化：对 alpha 做一次 3x3 均值，软化锯齿边
  const a0 = new Uint8Array(w * h); for (let p = 0; p < w * h; p++) a0[p] = d[p * 4 + 3];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sum = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; sum += a0[ny * w + nx]; n++; }
    d[(y * w + x) * 4 + 3] = Math.round(sum / n);
  }
  ctx.putImageData(id, 0, 0);
  return cv;
}

// 画布不透明像素占比
function opaqueFrac(cv: HTMLCanvasElement): number {
  const w = cv.width, h = cv.height;
  const a = cv.getContext("2d")!.getImageData(0, 0, w, h).data;
  let o = 0; for (let i = 3; i < a.length; i += 4) if (a[i] > 128) o++;
  return o / (w * h);
}
// 原图整幅、不透明的 canvas（抠图彻底失效时的兜底，至少人物可见）
async function opaqueCanvas(imgSrc: string, procLong: number): Promise<HTMLCanvasElement> {
  const img = await imgSrcToBitmap(imgSrc);
  const s = Math.min(1, procLong / Math.max(img.width || 1, img.height || 1));
  const w = Math.max(8, Math.round((img.width || 720) * s)), h = Math.max(8, Math.round((img.height || 1280) * s));
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return cv;
}

/** 自动抠图：真人走 RVM；RVM 结果不合理（卡通/插画常见：整幅抹光 frac≈0 或整幅保留 frac≈1）时改用平背景 flood-fill；
    都不行则返回原图（不透明），绝不返回全透明空白。 */
export async function matteAuto(imgSrc: string, procLong = 512): Promise<HTMLCanvasElement> {
  const rvm = await matteImageToCanvas(imgSrc, procLong, false);
  const frac = opaqueFrac(rvm);
  if (frac > 0.1 && frac <= 0.9) return rvm; // RVM 合理：找到了主体又去掉了背景
  // RVM 失效（抹光或没抠）→ 试平背景 flood-fill
  try {
    const flat = await matteFlatBg(imgSrc);
    const ff = opaqueFrac(flat);
    if (ff > 0.05 && ff < 0.95) return flat; // 去掉了一部分背景且保留了主体
  } catch { /* ignore */ }
  // 两法都不理想：RVM 若把人抹光了(frac 很低)，返回原图兜底；否则(frac 高=基本没抠)也返回原图，避免空白
  return opaqueCanvas(imgSrc, procLong);
}

// 画布 ImageData(RGBA) → RVM src 张量 [1,3,H,W]（RGB, 归一化 0–1, CHW）
function imageDataToSrc(ort: Ort, data: Uint8ClampedArray, w: number, h: number): Tensor {
  const N = w * h;
  const f = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) {
    f[i] = data[i * 4] / 255;
    f[N + i] = data[i * 4 + 1] / 255;
    f[2 * N + i] = data[i * 4 + 2] / 255;
  }
  return new ort.Tensor("float32", f, [1, 3, h, w]);
}

/* 统一的图层变换：基准 fit（背景 cover / 人物 contain）× scale，中心平移 (tx,ty)（归一化到画幅）。
   编辑器(DOM)、合成预览(canvas)、导出合成(canvas) 三处共用同一算法 → 所见即所得。
   tx/ty=0 居中；tx=0.5 右移半个画幅。返回图层在画幅内的绘制矩形。 */
export function layerRect(
  W: number, H: number, sw: number, sh: number,
  mode: "cover" | "contain", scale = 1, tx = 0, ty = 0,
): { dx: number; dy: number; dw: number; dh: number } {
  const fit = mode === "cover" ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  const dw = sw * fit * scale, dh = sh * fit * scale;
  return { dx: W / 2 + tx * W - dw / 2, dy: H / 2 + ty * H - dh / 2, dw, dh };
}

function mkVideo(src: string, loop: boolean, muted: boolean) {
  const v = document.createElement("video");
  v.crossOrigin = "anonymous"; v.src = src; v.loop = loop; v.muted = muted; v.playsInline = true;
  return v;
}
function once(el: HTMLMediaElement, ev: string): Promise<void> {
  return new Promise((res, rej) => {
    const ok = () => { cleanup(); res(); };
    const bad = () => { cleanup(); rej(new Error(`${ev} 失败`)); };
    const cleanup = () => { el.removeEventListener(ev, ok); el.removeEventListener("error", bad); };
    el.addEventListener(ev, ok, { once: true });
    el.addEventListener("error", bad, { once: true });
  });
}

function seekTo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    const on = () => { v.removeEventListener("seeked", on); res(); };
    v.addEventListener("seeked", on);
    v.currentTime = t;
  });
}

export interface MatteOpts {
  width?: number;
  height?: number;
  fps?: number;
  // 画布式变换（与 layerRect 一致）：人物 contain 基准、背景 cover 基准，各自 ×scale + 平移 (x,y)
  personScale?: number;  // 人物缩放，默认 1
  personX?: number;      // 人物左右平移 -1–1，默认 0
  personY?: number;      // 人物上下平移 -1–1，默认 0
  bgScale?: number;      // 背景缩放，默认 1
  bgX?: number;          // 背景左右平移，默认 0
  bgY?: number;          // 背景上下平移，默认 0
  bgOffsetY?: number;    // 旧字段（背景单轴偏移），兼容
  procLong?: number;     // 抠像处理分辨率长边（越小越快、越糊），默认 384
  contentSec?: number;   // 权威内容时长（=口播 realSec）；s2v 视频时长元数据常虚高（尾部冻结帧），以此为准截断

  // 音频：抠像耗时长、用户手势过期后未静音播放会被浏览器拦截，故 pass2 前景静音，
  // 口播音轨改由外部 TTS 音频经 Web Audio 注入（audioCtx 需在点击手势时已 resume）。
  audioBlob?: Blob;
  audioCtx?: AudioContext;
  captions?: SubCue[]; // 时间轴字幕（有则逐帧烧录到画面底部）
  onProgress?: (phase: "matte" | "compose", pct: number, backend: string) => void;
}

/** 两遍式 RVM 抠像合成（方案 B）：
    ① 离线：逐帧 seek 前景视频 → RVM 抠像，缓存每帧 alpha（可能慢，带进度）；
    ② 实时：播放前景+背景，用缓存 alpha 逐帧叠加、MediaRecorder 录制（流畅、音轨同步）。
    bg：动态背景视频 { video } 或静态背景图 { image }；fgUrl：s2v 输出的「原图人物」视频。 */
export async function compositeMatteOverBg(bg: { video?: string; image?: string }, fgUrl: string, opts: MatteOpts = {}): Promise<Blob> {
  const { ort, session, backend } = await loadMatteSession();
  const fps = opts.fps ?? 30;
  const personScale = opts.personScale ?? 1;
  const personX = opts.personX ?? 0;
  const personY = opts.personY ?? 0;
  const bgScale = opts.bgScale ?? 1;
  const bgX = opts.bgX ?? (opts.bgOffsetY != null ? 0 : 0);
  const bgY = opts.bgY ?? opts.bgOffsetY ?? 0; // 兼容旧 bgOffsetY
  const procLong = opts.procLong ?? 384;

  // 先把前景/背景视频完整下载成本地 blob 再播，消除边下边播的流式解码卡顿（录制才流畅）
  const revoke: string[] = [];
  const bufferUrl = async (u: string) => {
    const b = await fetch(u).then((r) => { if (!r.ok) throw new Error("视频下载失败"); return r.blob(); });
    const url = URL.createObjectURL(b); revoke.push(url); return url;
  };
  const fgBufUrl = await bufferUrl(fgUrl);
  const fg = mkVideo(fgBufUrl, false, false); // 前景带音频
  await once(fg, "loadedmetadata");
  const vw = fg.videoWidth || 720, vh = fg.videoHeight || 1280;
  // 内容时长以口播 realSec 为准（s2v 时长元数据常虚高）；未提供则回退视频自身时长
  const metaDur = fg.duration && isFinite(fg.duration) ? fg.duration : 10;
  const duration = opts.contentSec && opts.contentSec > 0 ? Math.min(opts.contentSec, metaDur) : metaDur;
  const total = Math.max(1, Math.floor(duration * fps));
  const W = opts.width ?? vw, H = opts.height ?? vh;

  // 抠像处理分辨率（缩小以提速），保持前景宽高比
  const pScale = Math.min(1, procLong / Math.max(vw, vh));
  const pw = Math.max(32, Math.round(vw * pScale));
  const ph = Math.max(32, Math.round(vh * pScale));
  const ratio = Math.max(0.25, Math.min(1, 512 / Math.max(pw, ph))); // RVM downsample_ratio

  // ===== PASS 1：离线逐帧抠像，缓存 alpha =====
  const proc = document.createElement("canvas"); proc.width = pw; proc.height = ph;
  const pctx = proc.getContext("2d", { willReadFrequently: true })!;
  const alphas: Uint8Array[] = [];
  let rec4 = initRec(ort);
  const downsample = new ort.Tensor("float32", new Float32Array([ratio]), [1]);
  fg.pause();
  for (let i = 0; i < total; i++) {
    await seekTo(fg, Math.min(duration - 1e-3, (i + 0.5) / fps));
    pctx.drawImage(fg, 0, 0, pw, ph);
    const src = imageDataToSrc(ort, pctx.getImageData(0, 0, pw, ph).data, pw, ph);
    const outMap = await session.run({ src, r1i: rec4[0], r2i: rec4[1], r3i: rec4[2], r4i: rec4[3], downsample_ratio: downsample });
    const pha = outMap.pha.data as Float32Array; // [1,1,ph,pw] 0–1
    const a = new Uint8Array(pha.length);
    for (let k = 0; k < pha.length; k++) a[k] = pha[k] * 255;
    alphas.push(a);
    rec4 = [outMap.r1o, outMap.r2o, outMap.r3o, outMap.r4o] as Tensor[];
    opts.onProgress?.("matte", (i + 1) / total, backend);
  }

  // ===== PASS 2：实时叠加录制（用缓存 alpha，无推理，流畅） =====
  const bgVideo = bg.video ? mkVideo(await bufferUrl(bg.video), true, true) : null; // 背景视频也先缓冲，避免循环时卡顿
  const bgImage = bg.image ? await loadImage(bg.image) : null;
  const bw = bgImage?.naturalWidth ?? bgVideo?.videoWidth ?? W;
  const bh = bgImage?.naturalHeight ?? bgVideo?.videoHeight ?? H;
  if (bgVideo) await once(bgVideo, "loadeddata");

  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const octx = out.getContext("2d")!; octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = "high";
  const fgc = document.createElement("canvas"); fgc.width = vw; fgc.height = vh;
  const fgx = fgc.getContext("2d", { willReadFrequently: true })!;
  const alc = document.createElement("canvas"); alc.width = pw; alc.height = ph;
  const alx = alc.getContext("2d")!;
  const alphaImg = alx.createImageData(pw, ph);
  // RGB 恒为 255，只在每帧更新 alpha 通道 → 减少每帧计算，录制更流畅
  for (let k = 0; k < pw * ph; k++) { alphaImg.data[k * 4] = alphaImg.data[k * 4 + 1] = alphaImg.data[k * 4 + 2] = 255; }

  const stream = out.captureStream(fps);
  // 音频：优先用外部 TTS（Web Audio，规避静音播放限制）；否则退回前景自带音轨（前景未静音时）
  let audioSource: AudioBufferSourceNode | null = null;
  if (opts.audioBlob && opts.audioCtx) {
    const ctx = opts.audioCtx;
    const buf = await ctx.decodeAudioData(await opts.audioBlob.arrayBuffer());
    const dest = ctx.createMediaStreamDestination();
    audioSource = ctx.createBufferSource();
    audioSource.buffer = buf;
    audioSource.connect(dest);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    fg.muted = true; // 用 TTS 音轨，前景静音（同时规避自动播放拦截）
  } else {
    fg.muted = true; // 无外部音频：静音播放（规避拦截），输出为无声视频
  }

  const mime = pickMime();
  const bitrate = Math.max(8_000_000, Math.min(16_000_000, Math.round(W * H * fps * 0.18)));
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: bitrate });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((res) => { rec.onstop = () => { revoke.forEach((u) => URL.revokeObjectURL(u)); res(new Blob(chunks, { type: mime || "video/webm" })); }; });

  const compose = (mediaTime: number) => {
    const idx = Math.max(0, Math.min(total - 1, Math.floor(mediaTime * fps)));
    // 缓存 alpha → 图（RGB 已预置 255，只写 alpha 通道），上采样贴合前景尺寸
    const a = alphas[idx], ad = alphaImg.data;
    for (let k = 0; k < a.length; k++) ad[k * 4 + 3] = a[k];
    alx.putImageData(alphaImg, 0, 0);
    // 前景帧 + alpha 遮罩 → 透明人像
    fgx.globalCompositeOperation = "source-over";
    fgx.clearRect(0, 0, vw, vh);
    fgx.drawImage(fg, 0, 0, vw, vh);
    fgx.globalCompositeOperation = "destination-in";
    fgx.drawImage(alc, 0, 0, vw, vh);
    fgx.globalCompositeOperation = "source-over";
    // 背景 cover 基准 + 人物 contain 基准，各自 ×scale + 平移（与 BgEditor / CompositePreview 同一 layerRect）
    if (bgVideo) { const r = layerRect(W, H, bgVideo.videoWidth || bw, bgVideo.videoHeight || bh, "cover", bgScale, bgX, bgY); octx.drawImage(bgVideo, r.dx, r.dy, r.dw, r.dh); }
    else if (bgImage) { const r = layerRect(W, H, bw, bh, "cover", bgScale, bgX, bgY); octx.drawImage(bgImage, r.dx, r.dy, r.dw, r.dh); }
    else octx.clearRect(0, 0, W, H);
    { const r = layerRect(W, H, vw, vh, "contain", personScale, personX, personY); octx.drawImage(fgc, r.dx, r.dy, r.dw, r.dh); }
    if (opts.captions?.length) drawCaptionAt(octx, opts.captions, mediaTime, W, H);
    opts.onProgress?.("compose", Math.min(1, mediaTime / duration), backend);
  };

  let stopped = false;
  const stop = () => { if (stopped) return; stopped = true; try { rec.stop(); } catch { /* ignore */ } bgVideo?.pause(); };
  // 离屏播放视频用 rAF 逐帧绘制（rVFC 对不可见视频会被节流，故不用）。
  // 到达内容时长即停（避免录到 s2v 尾部的冻结帧，输出与口播等长）。
  const loop = () => {
    compose(fg.currentTime);
    if (fg.ended || fg.currentTime >= duration - 1e-3) return stop();
    requestAnimationFrame(loop);
  };

  await seekTo(fg, 0);
  await Promise.all([bgVideo ? bgVideo.play() : Promise.resolve(), fg.play()]);
  rec.start();
  // 音频播完也停（口播长度=权威成片长度，双保险）
  if (audioSource) audioSource.onended = () => stop();
  try { audioSource?.start(); } catch { /* ignore */ }
  loop();
  return done;
}

/** 无背景直出：把时间轴字幕烧进 s2v 原视频（不抠像、不换背景）。过 canvas 逐帧绘制原帧+字幕并 MediaRecorder 录制。
    音频：优先外部 TTS（Web Audio 注入、前景静音，规避自动播放拦截）；否则抓前景自带音轨；都不行则输出无声。
    到达内容时长即停（与 compositeMatteOverBg 一致，避免录到 s2v 尾部冻结帧）。 */
export async function burnCaptionsOnVideo(
  fgUrl: string,
  opts: { captions: SubCue[]; contentSec?: number; fps?: number; audioBlob?: Blob; audioCtx?: AudioContext; onProgress?: (pct: number) => void },
): Promise<Blob> {
  const fps = opts.fps ?? 30;
  const revoke: string[] = [];
  const fgBufUrl = await (async () => {
    const b = await fetch(fgUrl).then((r) => { if (!r.ok) throw new Error("视频下载失败"); return r.blob(); });
    const url = URL.createObjectURL(b); revoke.push(url); return url;
  })();
  const useExtAudio = !!(opts.audioBlob && opts.audioCtx);
  const fg = mkVideo(fgBufUrl, false, useExtAudio); // 用外部 TTS 时前景静音；否则保留自带音轨
  await once(fg, "loadedmetadata");
  const vw = fg.videoWidth || 720, vh = fg.videoHeight || 1280;
  const metaDur = fg.duration && isFinite(fg.duration) ? fg.duration : 10;
  const duration = opts.contentSec && opts.contentSec > 0 ? Math.min(opts.contentSec, metaDur) : metaDur;

  const out = document.createElement("canvas"); out.width = vw; out.height = vh;
  const octx = out.getContext("2d")!; octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = "high";

  const stream = out.captureStream(fps);
  let audioSource: AudioBufferSourceNode | null = null;
  if (useExtAudio) {
    const ctx = opts.audioCtx!;
    const buf = await ctx.decodeAudioData(await opts.audioBlob!.arrayBuffer());
    const dest = ctx.createMediaStreamDestination();
    audioSource = ctx.createBufferSource();
    audioSource.buffer = buf; audioSource.connect(dest);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  } else {
    try {
      const fgStream = (fg as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
      fgStream?.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch { /* 无音轨 → 无声输出 */ }
  }

  const mime = pickMime();
  const bitrate = Math.max(6_000_000, Math.min(16_000_000, Math.round(vw * vh * fps * 0.18)));
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: bitrate });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  // 关键：离屏 <video> 常被浏览器只推进时钟而不解码新帧（drawImage 一直画同一帧→画面冻结）。
  // 故挂到 DOM（离屏、不可见但参与渲染），并优先用 requestVideoFrameCallback 在“真有新帧解码”时才绘制。
  fg.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
  document.body.appendChild(fg);
  const cleanupDom = () => { try { fg.remove(); } catch { /* ignore */ } };
  const done = new Promise<Blob>((res) => { rec.onstop = () => { cleanupDom(); revoke.forEach((u) => URL.revokeObjectURL(u)); res(new Blob(chunks, { type: mime || "video/webm" })); }; });

  const draw = (t: number) => {
    octx.clearRect(0, 0, vw, vh);
    try { octx.drawImage(fg, 0, 0, vw, vh); } catch { /* 帧未就绪时跳过 */ }
    if (opts.captions.length) drawCaptionAt(octx, opts.captions, t, vw, vh);
    opts.onProgress?.(Math.min(1, t / duration));
  };

  let stopped = false;
  const stop = () => { if (stopped) return; stopped = true; try { rec.stop(); } catch { /* ignore */ } };
  const reachedEnd = (t: number) => fg.ended || t >= duration - 1e-3;
  type RVFC = HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number };
  const rvfc = (fg as RVFC).requestVideoFrameCallback?.bind(fg);
  const step = (t: number) => {
    if (stopped) return;
    draw(t);
    if (reachedEnd(t)) return stop();
    if (rvfc) rvfc((_now, meta) => step(meta.mediaTime));
    else requestAnimationFrame(() => step(fg.currentTime));
  };

  await seekTo(fg, 0);
  try { await fg.play(); }
  catch { fg.muted = true; try { await fg.play(); } catch { /* 播放被拦截：仍录制（可能少音轨） */ } }
  rec.start();
  if (audioSource) { audioSource.onended = () => stop(); try { audioSource.start(); } catch { /* ignore */ } }
  step(0);
  return done;
}

/* DEMO 模式：无后端时由本地人像图直接渲染一段口播 demo 视频（纯客户端，无 API）。
   画幅=人像原生比例；选了背景则先抠像再叠到背景上（RVM 抠一次静态图，比逐帧稳）；
   加轻微缓慢缩放增加“活”感。用于线上静态部署时「立即生成」出结果。 */
export async function renderAvatarDemoVideo(
  person: string,
  bg: { img?: string; dyn?: string; personScale?: number; personX?: number; personY?: number; bgScale?: number; bgX?: number; bgY?: number; bgOffsetY?: number } | null,
  opts: { seconds?: number; fps?: number; captions?: SubCue[] } = {},
): Promise<Blob> {
  const seconds = opts.seconds ?? 6;
  const fps = opts.fps ?? 30;
  const personBmp = await imgSrcToBitmap(person);
  const base = 720;
  const aw = personBmp.width || 3, ah = personBmp.height || 4;
  const W = aw >= ah ? base : Math.round((base * aw) / ah);
  const H = aw >= ah ? Math.round((base * ah) / aw) : base;

  const useBg = !!bg?.img;
  let matte: HTMLCanvasElement | null = null;
  let bgBmp: ImageBitmap | null = null;
  if (useBg) {
    try { matte = await matteImageToCanvas(person, 512, false); } catch { matte = null; }
    try { bgBmp = await imgSrcToBitmap(bg!.img!); } catch { bgBmp = null; }
  }
  const pScale = bg?.personScale ?? 1, pX = bg?.personX ?? 0, pY = bg?.personY ?? 0;
  const bScale = bg?.bgScale ?? 1, bX = bg?.bgX ?? 0, bY = bg?.bgY ?? bg?.bgOffsetY ?? 0;

  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const ctx = out.getContext("2d")!; ctx.imageSmoothingQuality = "high";
  const stream = out.captureStream(fps);
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((res) => { rec.onstop = () => res(new Blob(chunks, { type: mime || "video/webm" })); });

  const startAt = performance.now();
  const totalMs = seconds * 1000;
  let stopped = false;
  const stop = () => { if (stopped) return; stopped = true; try { rec.stop(); } catch { /* ignore */ } };
  const draw = () => {
    if (stopped) return;
    const p = Math.min(1, (performance.now() - startAt) / totalMs);
    const z = 1 + 0.06 * p; // 轻微缩放
    ctx.clearRect(0, 0, W, H);
    if (useBg && bgBmp) {
      const br = layerRect(W, H, bgBmp.width, bgBmp.height, "cover", bScale, bX, bY);
      ctx.drawImage(bgBmp, br.dx, br.dy, br.dw, br.dh);
      const fg = matte ?? personBmp; // 抠像失败兜底：整图
      const pr = layerRect(W, H, fg.width, fg.height, "contain", pScale * z, pX, pY);
      ctx.drawImage(fg, pr.dx, pr.dy, pr.dw, pr.dh);
    } else {
      const dw = W * z, dh = H * z;
      ctx.drawImage(personBmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    if (opts.captions?.length) drawCaptionAt(ctx, opts.captions, p * seconds, W, H);
    if (p >= 1) return stop();
    requestAnimationFrame(draw);
  };
  rec.start();
  requestAnimationFrame(draw);
  // 墙钟兜底：即便标签页被切后台 rAF 被节流，也保证按时长停止录制（不会卡死在“生成中”）
  setTimeout(stop, totalMs + 800);
  return done;
}
