/* 视频特效共享工具：海报样张池 + Ken Burns 画面绘制 + 录制能力。
   「制作大片」逐镜画面 / 合成预览 / 导出长视频复用此处，避免与一句话视频重复造轮子。
   说明：后端无真实视频 / 文生图模型，分镜画面统一用 public/poster-samples 样张 + 运镜动画呈现。 */

export const POSTER_POOL = [
  "/poster-samples/20251219150028966406xict5e.jpg",
  "/poster-samples/20251219155206556275bh8mcn.jpg",
  "/poster-samples/20251219175905342092j5c2dj.jpg",
  "/poster-samples/20251222150201108065evwftz.jpg",
  "/poster-samples/20251223153921706507udqknx.jpg",
  "/poster-samples/20251225143202617562fe2mzh.jpg",
  "/poster-samples/202512251516181258973mq1jx.jpg",
  "/poster-samples/20251225153650081304bh84jz.jpg",
  "/poster-samples/202512251546312686458uijkp.jpg",
  "/poster-samples/20251225154726126237fybah8.jpg",
];

// 按种子字符串稳定散列取一张海报（同一文本每次取到同一张）
export function posterFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return POSTER_POOL[h % POSTER_POOL.length];
}

// "5秒" / "15s" → 数字秒
export function durSeconds(dur: string): number {
  return parseInt(dur.match(/\d+/)?.[0] ?? "5", 10);
}

// "横屏 16:9" / "9:16" → 画布尺寸（长边=base）
export function ratioToCanvas(ratio: string, base = 720): { cw: number; ch: number } {
  const m = ratio.match(/(\d+)\s*[:：]\s*(\d+)/);
  const rw = m ? Number(m[1]) : 16;
  const rh = m ? Number(m[2]) : 9;
  return rw >= rh
    ? { cw: Math.round((base * rw) / rh), ch: base }
    : { cw: base, ch: Math.round((base * rh) / rw) };
}

// canvas 多行字幕：按字符折行，超过 maxLines 行末尾省略号，从底部向上排版
export function drawWrappedText(
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
  // 居中绘制：x 是左边界、maxW 是可用宽度，中心 = x + maxW/2（与预览的居中字幕一致）
  const cx = x + maxW / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "center";
  shown.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineH));
  ctx.textAlign = prevAlign;
}

// 绘制真实视频当前帧到 canvas（object-fit: cover 居中裁切）+ 底部暗角 + 可选字幕。
// 用于导出：逐镜播放真实分镜视频、每帧绘制并录制，字幕按时间轴烧录。
export function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  cw: number,
  ch: number,
  caption?: string
) {
  const vr = (video.videoWidth || 16) / (video.videoHeight || 9);
  const cr = cw / ch;
  let dw: number, dh: number;
  if (vr > cr) { dh = ch; dw = ch * vr; } else { dw = cw; dh = cw / vr; }
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;
  ctx.clearRect(0, 0, cw, ch);
  try { ctx.drawImage(video, dx, dy, dw, dh); } catch { /* 帧未就绪时跳过 */ }
  // 底部暗角（与 Ken Burns 一致）
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, "rgba(0,0,0,0.18)");
  g.addColorStop(0.3, "rgba(0,0,0,0)");
  g.addColorStop(0.62, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
  if (caption) {
    const pad = Math.round(cw * 0.045);
    const fs = Math.round(ch * 0.04);
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${fs}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "bottom";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 10;
    drawWrappedText(ctx, caption, pad, ch - pad, cw - 2 * pad, fs * 1.35, 2);
    ctx.shadowBlur = 0;
  }
}

// 绘制单帧 Ken Burns 运镜（进度 p：0→1 缓慢放大+左上平移），可选底部字幕
export function drawKenBurns(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number,
  p: number,
  caption?: string
) {
  const z = 1 + 0.14 * p;
  const ir = img.width / img.height;
  const cr = cw / ch;
  let dw: number, dh: number;
  if (ir > cr) {
    dh = ch;
    dw = ch * ir;
  } else {
    dw = cw;
    dh = cw / ir;
  }
  dw *= z;
  dh *= z;
  const dx = (cw - dw) / 2 - 0.04 * p * cw;
  const dy = (ch - dh) / 2 - 0.025 * p * ch;
  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(img, dx, dy, dw, dh);
  // 底部暗角
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, "rgba(0,0,0,0.18)");
  g.addColorStop(0.3, "rgba(0,0,0,0)");
  g.addColorStop(0.62, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
  // 字幕
  if (caption) {
    const pad = Math.round(cw * 0.045);
    const fs = Math.round(ch * 0.04);
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${fs}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "bottom";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 10;
    drawWrappedText(ctx, caption, pad, ch - pad, cw - 2 * pad, fs * 1.35, 2);
    ctx.shadowBlur = 0;
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed: " + src));
    img.src = src;
  });
}

export function recordSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof document !== "undefined" &&
    !!document.createElement("canvas").captureStream
  );
}

// 选一个浏览器支持的录制格式，优先 mp4
export function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return (
    ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((m) =>
      MediaRecorder.isTypeSupported(m)
    ) || ""
  );
}

export function mimeExt(mime: string): "mp4" | "webm" {
  return mime.includes("mp4") ? "mp4" : "webm";
}

/** 把视频重构到指定画幅（w×h）：前景 contain 完整居中（不裁切人物），背景用同一视频 cover+模糊填充，保留音轨。
    用于「视频比例」——s2v 输出跟随输入图比例，此步把它套进用户选择的画幅。src 为 blob/object URL 或同源 URL。 */
export async function reframeVideoToRatio(src: string, w: number, h: number, fps = 30): Promise<Blob> {
  const v = document.createElement("video");
  v.src = src;
  v.muted = false; // 需保留口播音轨
  v.playsInline = true;
  v.crossOrigin = "anonymous";
  await new Promise<void>((res, rej) => {
    v.addEventListener("loadeddata", () => res(), { once: true });
    v.addEventListener("error", () => rej(new Error("视频加载失败")), { once: true });
  });

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(fps);
  const vStream = (v as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
  const atrack = vStream?.getAudioTracks?.()[0];
  if (atrack) stream.addTrack(atrack);

  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((res) => { rec.onstop = () => res(new Blob(chunks, { type: mime || "video/webm" })); });

  const draw = () => {
    const vw = v.videoWidth || w, vh = v.videoHeight || h;
    // 背景：cover 铺满 + 模糊压暗，填充画幅空白（避免纯色黑边）
    const sCover = Math.max(w / vw, h / vh);
    const cw = vw * sCover, chh = vh * sCover;
    ctx.filter = "blur(24px) brightness(.6)";
    ctx.drawImage(v, (w - cw) / 2, (h - chh) / 2, cw, chh);
    ctx.filter = "none";
    // 前景：contain 完整居中，人物不裁切
    const sContain = Math.min(w / vw, h / vh);
    const fw = vw * sContain, fh = vh * sContain;
    ctx.drawImage(v, (w - fw) / 2, (h - fh) / 2, fw, fh);
    if (v.ended) { try { rec.stop(); } catch { /* ignore */ } return; }
    requestAnimationFrame(draw);
  };
  await v.play();
  rec.start();
  requestAnimationFrame(draw);
  return done;
}
