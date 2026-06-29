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
  shown.forEach((l, i) => ctx.fillText(l, x, startY + i * lineH));
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
