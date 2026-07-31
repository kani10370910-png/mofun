"use client";

/* 绿幕数字人合成（方案 A）：
   ① personOnGreen：把人像抠出（@imgly 纯前端）放到纯绿底 → 绿幕人像，喂给 s2v 得到"绿底说话视频"。
   ② compositeGreenOverBg：canvas 逐帧 chroma-key 抠掉绿、叠到 i2v 动态背景上，MediaRecorder 录制导出。
   口型由 s2v 层保留（合成不改口型）；背景为独立 i2v 素材（氛围感）。 */

import { loadImage, pickMime } from "@/lib/videoFx";

export const GREEN_KEY = "#00b140"; // 标准绿幕色

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

// 取源图为 Blob：data URI / 同源直接 fetch；跨域走 /api/proxy-image 兜底避免 CORS
async function srcToBlob(src: string): Promise<Blob> {
  const isCross = /^https?:\/\//.test(src) && !src.startsWith(location.origin);
  const url = isCross ? `/api/proxy-image?url=${encodeURIComponent(src)}` : src;
  const r = await fetch(url);
  if (!r.ok) throw new Error("读取形象图失败");
  return r.blob();
}

/** 人像 → 抠图放纯绿底 → 绿幕人像 data URI（PNG）。用作 s2v 输入，使输出视频背景可 chroma-key。 */
export async function personOnGreen(imgSrc: string, keyColor = GREEN_KEY): Promise<string> {
  const { removeBackground } = await import("@imgly/background-removal");
  const srcBlob = await srcToBlob(imgSrc);
  const cutout = await removeBackground(srcBlob); // 透明 PNG
  const cutUrl = URL.createObjectURL(cutout);
  try {
    const img = await loadImage(cutUrl);
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth || 720;
    cv.height = img.naturalHeight || 1280;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = keyColor;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0);
    return cv.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(cutUrl);
  }
}

/** 已抠好的透明图（如官方形象的 -cut.png）→ 放纯绿底 → 绿幕人像 data URI（无需再抠图）。 */
export async function imageOnGreen(transparentSrc: string, keyColor = GREEN_KEY): Promise<string> {
  const img = await loadImage(transparentSrc);
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth || 720;
  cv.height = img.naturalHeight || 1280;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = keyColor;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, 0, 0);
  return cv.toDataURL("image/png");
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

// object-fit: cover 把视频帧铺满画布（居中裁切）
function coverDraw(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, W: number, H: number) {
  const vw = v.videoWidth || W, vh = v.videoHeight || H;
  const scale = Math.max(W / vw, H / vh);
  const dw = vw * scale, dh = vh * scale;
  ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
}
// object-fit: contain + 底部对齐：把人像完整放入画幅（不裁切头顶），水平居中、贴画幅底部
// scale 可 <1 让人物在场景里更自然（留出更多背景），默认 1（尽量占满而不裁切）
function containDrawBottom(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, W: number, H: number, scale = 1) {
  const vw = v.videoWidth || W, vh = v.videoHeight || H;
  const s = Math.min(W / vw, H / vh) * scale;
  const dw = vw * s, dh = vh * s;
  ctx.drawImage(v, (W - dw) / 2, H - dh, dw, dh);
}
// 静态图铺满画布（cover）
function coverDrawImg(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number) {
  const iw = img.naturalWidth || W, ih = img.naturalHeight || H;
  const scale = Math.max(W / iw, H / ih);
  const dw = iw * scale, dh = ih * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

export interface CompositeOpts {
  keyColor?: string;
  similarity?: number; // 抠除阈值 0–1（越大抠得越狠），默认 0.32
  smoothness?: number; // 边缘羽化带宽 0–1，默认 0.10
  width?: number;
  height?: number;
  fps?: number;
}

/** 绿底说话视频(fg) chroma-key 后叠到背景上，录制为合成视频 Blob。fg 的音频（口播）会保留。
    bg 可为动态背景视频（{ video }）或静态背景图（{ image }）。 */
export async function compositeGreenOverBg(bg: { video?: string; image?: string }, fgGreenUrl: string, opts: CompositeOpts = {}): Promise<Blob> {
  const key = hexToRgb(opts.keyColor ?? GREEN_KEY);
  const sim = opts.similarity ?? 0.32;
  const smooth = opts.smoothness ?? 0.10;
  const fps = opts.fps ?? 30;

  const mkVideo = (src: string, loop: boolean, muted: boolean) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.src = src;
    v.loop = loop;
    v.muted = muted;
    v.playsInline = true;
    return v;
  };
  const bgVideo = bg.video ? mkVideo(bg.video, true, true) : null; // 动态背景（循环静音）
  const bgImage = bg.image ? await loadImage(bg.image) : null;     // 静态背景图
  const fg = mkVideo(fgGreenUrl, false, false); // 前景（人）带音频（口播）
  await Promise.all([bgVideo ? once(bgVideo, "loadeddata") : Promise.resolve(), once(fg, "loadeddata")]);

  const W = opts.width ?? fg.videoWidth ?? 1280;
  const H = opts.height ?? fg.videoHeight ?? 720;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; // 缩放插值用高质量，减轻模糊
  const off = document.createElement("canvas");
  off.width = W; off.height = H;
  const octx = off.getContext("2d", { willReadFrequently: true })!;
  octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = "high";

  const stream = canvas.captureStream(fps);
  // 把前景视频的音轨（口播）并入录制流
  const fgStream = (fg as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
  const atrack = fgStream?.getAudioTracks?.()[0];
  if (atrack) stream.addTrack(atrack);

  const mime = pickMime();
  // 高码率减轻二次编码模糊：约 0.18 bit/像素/帧，下限 8Mbps、上限 16Mbps
  const bitrate = Math.max(8_000_000, Math.min(16_000_000, Math.round(W * H * fps * 0.18)));
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: bitrate });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((res) => { rec.onstop = () => res(new Blob(chunks, { type: mime || "video/webm" })); });

  await Promise.all([bgVideo ? bgVideo.play() : Promise.resolve(), fg.play()]);
  rec.start();

  const thr = sim * 441;         // 距离阈值（RGB 欧氏距离最大约 441）
  const band = smooth * 441;
  const draw = () => {
    if (bgVideo) coverDraw(ctx, bgVideo, W, H);       // 动态背景铺底
    else if (bgImage) coverDrawImg(ctx, bgImage, W, H); // 静态背景图铺底
    octx.clearRect(0, 0, W, H);        // 清空离屏：contain 未覆盖处保持透明，露出背景
    containDrawBottom(octx, fg, W, H, 0.85); // 前景 contain + 底部对齐 + 缩放 0.85（头顶留白，完整不裁切）
    const frame = octx.getImageData(0, 0, W, H);
    const px = frame.data;
    for (let i = 0; i < px.length; i += 4) {
      const dr = px[i] - key.r, dg = px[i + 1] - key.g, db = px[i + 2] - key.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < thr) px[i + 3] = 0;                                  // 纯绿 → 透明
      else if (dist < thr + band) px[i + 3] = ((dist - thr) / band) * 255; // 边缘羽化
      // 去溢色：绿色明显偏高时压到红/蓝的较大值，消除绿边
      if (px[i + 1] > px[i] + 12 && px[i + 1] > px[i + 2] + 12) px[i + 1] = Math.max(px[i], px[i + 2]);
    }
    octx.putImageData(frame, 0, 0);
    ctx.drawImage(off, 0, 0);          // 抠好的人叠到背景上
    if (fg.ended) { try { rec.stop(); } catch { /* ignore */ } bgVideo?.pause(); return; }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  return done;
}
