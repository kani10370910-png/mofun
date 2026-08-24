/**
 * 收掉艺术字/成图四周多余白边，可选贴回固定画幅（如 5:3 / 3:5）。
 * 同源 /public、dataURL、blob 可直接读像素；外链需先走 proxy。
 */

const DIFF = 40;

export function canvasSafeImageSrc(src: string, assetFn?: (p: string) => string): string {
  if (!src) return src;
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;
  if (src.startsWith("/")) return assetFn ? assetFn(src) : src;
  if (/^https?:\/\//i.test(src)) return `/api/proxy-image?url=${encodeURIComponent(src)}`;
  return assetFn ? assetFn(src) : src;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("图片加载失败"));
    im.src = src;
  });
}

export type TrimImageOpts = {
  /** 主体外扩留白占裁后边长的比例 */
  padRatio?: number;
  assetFn?: (p: string) => string;
  /**
   * 贴回固定画幅（宽:高），例如横向 [5,3]、竖向 [3,5]。
   * 收边后把主体居中放入该比例画布，避免破坏 AI 字体 5:3 / 3:5 出图约定。
   */
  fitRatio?: readonly [number, number];
  /** fitRatio 时画布长边像素，默认 1200 */
  longSide?: number;
};

/**
 * @returns 处理后 PNG dataURL；失败则返回原 src
 */
export async function trimImageMargin(src: string, opts?: TrimImageOpts): Promise<string> {
  const padRatio = opts?.padRatio ?? 0.04;
  const fitRatio = opts?.fitRatio;
  const longSide = opts?.longSide ?? 1200;
  try {
    const safe = canvasSafeImageSrc(src, opts?.assetFn);
    const img = await loadImage(safe);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return src;

    const SW = Math.min(w, 360);
    const SH = Math.max(1, Math.round((SW / w) * h));
    const c = document.createElement("canvas");
    c.width = SW;
    c.height = SH;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return src;
    ctx.drawImage(img, 0, 0, SW, SH);
    const data = ctx.getImageData(0, 0, SW, SH).data;

    const block = Math.max(2, Math.round(Math.min(SW, SH) * 0.1));
    const counts = new Map<string, { n: number; r: number; g: number; b: number }>();
    const addBg = (x: number, y: number) => {
      const i = (y * SW + x) * 4;
      if (data[i + 3] < 200) return;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
      const e = counts.get(key);
      if (e) {
        e.n++;
        e.r += r;
        e.g += g;
        e.b += b;
      } else counts.set(key, { n: 1, r, g, b });
    };
    for (const [cx, cy] of [
      [0, 0],
      [SW - block, 0],
      [0, SH - block],
      [SW - block, SH - block],
    ] as [number, number][]) {
      for (let y = cy; y < cy + block; y++) for (let x = cx; x < cx + block; x++) addBg(x, y);
    }
    let bgC: { n: number; r: number; g: number; b: number } | null = null;
    for (const e of counts.values()) if (!bgC || e.n > bgC.n) bgC = e;
    const br = bgC ? Math.round(bgC.r / bgC.n) : 255;
    const bg = bgC ? Math.round(bgC.g / bgC.n) : 255;
    const bb = bgC ? Math.round(bgC.b / bgC.n) : 255;
    const fill = `rgb(${br},${bg},${bb})`;

    const rowCnt = new Array<number>(SH).fill(0);
    const colCnt = new Array<number>(SW).fill(0);
    let total = 0;
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        const i = (y * SW + x) * 4;
        const a = data[i + 3];
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const diff = a < 200 ? 0 : Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb);
        if (diff > DIFF) {
          rowCnt[y]++;
          colCnt[x]++;
          total++;
        }
      }
    }
    if (total === 0) return src;

    const rowThr = Math.max(2, Math.round(SW * 0.03));
    const colThr = Math.max(2, Math.round(SH * 0.03));
    let minX = SW, minY = SH, maxX = -1, maxY = -1;
    for (let y = 0; y < SH; y++) if (rowCnt[y] >= colThr) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
    for (let x = 0; x < SW; x++) if (colCnt[x] >= rowThr) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    if (maxX < minX || maxY < minY) return src;

    const scaleX = w / SW;
    const scaleY = h / SH;
    let sx = minX * scaleX;
    let sy = minY * scaleY;
    let sw = (maxX - minX + 1) * scaleX;
    let sh = (maxY - minY + 1) * scaleY;

    const padX = sw * padRatio;
    const padY = sh * padRatio;
    sx = Math.max(0, sx - padX);
    sy = Math.max(0, sy - padY);
    sw = Math.min(w - sx, sw + padX * 2);
    sh = Math.min(h - sy, sh + padY * 2);

    // 贴回固定画幅：主体 contain 居中，画布保持 5:3 / 3:5
    if (fitRatio) {
      const [rw, rh] = fitRatio;
      let cw: number;
      let ch: number;
      if (rw >= rh) {
        cw = longSide;
        ch = Math.max(1, Math.round((longSide * rh) / rw));
      } else {
        ch = longSide;
        cw = Math.max(1, Math.round((longSide * rw) / rh));
      }
      const oc = document.createElement("canvas");
      oc.width = cw;
      oc.height = ch;
      const octx = oc.getContext("2d");
      if (!octx) return src;
      octx.fillStyle = fill;
      octx.fillRect(0, 0, cw, ch);
      const margin = 0.06;
      const availW = cw * (1 - margin * 2);
      const availH = ch * (1 - margin * 2);
      const k = Math.min(availW / sw, availH / sh);
      const dw = sw * k;
      const dh = sh * k;
      const dx = (cw - dw) / 2;
      const dy = (ch - dh) / 2;
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = "high";
      octx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      return oc.toDataURL("image/png");
    }

    // 无固定画幅：仅裁切；几乎没白边可收则保持原图
    const cover = (sw * sh) / (w * h);
    if (cover > 0.92) return src;

    const ow = Math.max(1, Math.round(sw));
    const oh = Math.max(1, Math.round(sh));
    const oc = document.createElement("canvas");
    oc.width = ow;
    oc.height = oh;
    const octx = oc.getContext("2d");
    if (!octx) return src;
    octx.fillStyle = fill;
    octx.fillRect(0, 0, ow, oh);
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(img, sx, sy, sw, sh, 0, 0, ow, oh);
    return oc.toDataURL("image/png");
  } catch {
    return src;
  }
}

/** AI 字体：横向 5:3 / 竖向 3:5 */
export function fontDirFitRatio(dir?: string): readonly [number, number] {
  return dir?.includes("竖") ? ([3, 5] as const) : ([5, 3] as const);
}
