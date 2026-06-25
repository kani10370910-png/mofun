"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 灵感缩略图：检测图片中「主体文字」的实际边界，裁掉多余背景并统一补齐边距，
 * 使每张图的「主体到卡片边框的留白」宽度一致——
 * 原图留白过宽的裁掉，过窄的补上，主体占比统一。背景填充图片自身底色。
 *
 * 流程（图片加载后在离屏 canvas 上做，同源 /public 图片可安全读像素）：
 *  1) 采四角得背景色 bg；
 *  2) 扫全图，找出与 bg 差异明显的像素（=主体）的最小包围盒；
 *  3) 把包围盒按「目标留白比例」外扩，居中重绘到固定尺寸的输出 canvas（底色填 bg）；
 *  4) 输出 dataURL 作为最终显示图。
 */

// 主体四周统一留白：占输出画布的比例（0.14 = 左右上下各留 14%）
const PAD_RATIO = 0.14;
// 判定为「主体（非背景）」的颜色差异阈值
const DIFF = 42;

export function AutoBgImg({
  src,
  alt,
  className,
  ratio = 1, // 输出画布宽高比（应与缩略框一致：logo=1，字体=1.4）
}: {
  src: string;
  alt: string;
  className?: string;
  ratio?: number;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [out, setOut] = useState<{ url: string; bg: string } | null>(null);

  // src 变化（如筛选切换复用了同一组件实例）时重置处理结果，重新裁切新图
  useEffect(() => {
    setOut(null);
  }, [src]);

  function handleLoad() {
    const img = imgRef.current;
    if (!img || out) return; // 已处理过则跳过（避免替换 src 后再次触发）
    try {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) return;

      // 采样画布（缩小，省性能）
      const SW = Math.min(w, 200);
      const SH = Math.round((SW / w) * h);
      const c = document.createElement("canvas");
      c.width = SW;
      c.height = SH;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, SW, SH);
      const data = ctx.getImageData(0, 0, SW, SH).data;

      // 1) 四角众数取背景色
      const block = Math.max(2, Math.round(Math.min(SW, SH) * 0.12));
      const counts = new Map<string, { n: number; r: number; g: number; b: number }>();
      const addBg = (x: number, y: number) => {
        const i = (y * SW + x) * 4;
        const a = data[i + 3];
        if (a < 200) return;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
        const e = counts.get(key);
        if (e) { e.n++; e.r += r; e.g += g; e.b += b; }
        else counts.set(key, { n: 1, r, g, b });
      };
      for (const [cx, cy] of [
        [0, 0], [SW - block, 0], [0, SH - block], [SW - block, SH - block],
      ] as [number, number][]) {
        for (let y = cy; y < cy + block; y++) for (let x = cx; x < cx + block; x++) addBg(x, y);
      }
      let bgC: { n: number; r: number; g: number; b: number } | null = null;
      for (const e of counts.values()) if (!bgC || e.n > bgC.n) bgC = e;
      const br = bgC ? Math.round(bgC.r / bgC.n) : 255;
      const bgGreen = bgC ? Math.round(bgC.g / bgC.n) : 255;
      const bb = bgC ? Math.round(bgC.b / bgC.n) : 255;
      const bg = `rgb(${br}, ${bgGreen}, ${bb})`;

      // 2) 主体包围盒：用行/列投影，剔除「整行/整列只有零星像素」的飞白笔锋噪点，
      //    让包围盒贴紧真正的字块主体——避免淡淡的拖尾把 bbox 上下沿撑大、导致主体偏置。
      const rowCnt = new Array<number>(SH).fill(0);
      const colCnt = new Array<number>(SW).fill(0);
      let total = 0;
      for (let y = 0; y < SH; y++) {
        for (let x = 0; x < SW; x++) {
          const i = (y * SW + x) * 4;
          const a = data[i + 3];
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const diff = a < 200
            ? 0 // 透明视作背景
            : Math.abs(r - br) + Math.abs(g - bgGreen) + Math.abs(b - bb);
          if (diff > DIFF) { rowCnt[y]++; colCnt[x]++; total++; }
        }
      }
      // 没检测到主体（纯背景图）则放弃裁切，仅填背景色
      if (total === 0) {
        setOut({ url: src, bg });
        return;
      }
      // 阈值：每行/列至少有「该方向像素数的 4%、且≥2」个主体像素，才算属于主体
      const rowThr = Math.max(2, Math.round(SW * 0.04));
      const colThr = Math.max(2, Math.round(SH * 0.04));
      let minX = SW, minY = SH, maxX = -1, maxY = -1;
      for (let y = 0; y < SH; y++) if (rowCnt[y] >= colThr) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
      for (let x = 0; x < SW; x++) if (colCnt[x] >= rowThr) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
      // 阈值过严把主体滤没了，则回退为不裁切
      if (maxX < minX || maxY < minY) {
        setOut({ url: src, bg });
        return;
      }

      // 采样坐标 → 原图坐标
      const scaleX = w / SW, scaleY = h / SH;
      const sx = minX * scaleX, sy = minY * scaleY;
      const sw = (maxX - minX + 1) * scaleX;
      const sh = (maxY - minY + 1) * scaleY;

      // 3) 输出画布：按缩略框比例，主体居中，四周统一留白比例
      const OW = 600;
      const OH = Math.round(OW / ratio);
      const oc = document.createElement("canvas");
      oc.width = OW;
      oc.height = OH;
      const octx = oc.getContext("2d");
      if (!octx) return;
      octx.fillStyle = bg;
      octx.fillRect(0, 0, OW, OH);
      const availW = OW * (1 - PAD_RATIO * 2); // 主体可用宽
      const availH = OH * (1 - PAD_RATIO * 2); // 主体可用高
      // 以「高度统一」为基准：主体高度都拉到可用高 → 各图主体高度一致、上下留白一致。
      // 仅当这样会令宽度超出可用宽（很宽的横排长文字）时，才降到按宽度限制，避免溢出/裁切。
      let k = availH / sh;
      if (sw * k > availW) k = availW / sw;
      const dw = sw * k, dh = sh * k;
      const dx = (OW - dw) / 2, dy = (OH - dh) / 2;
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = "high";
      octx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);

      setOut({ url: oc.toDataURL("image/png"), bg });
    } catch {
      // 读像素失败（跨域等）则保持原图，不影响显示
    }
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      className={className}
      src={out ? out.url : src}
      alt={alt}
      loading="lazy"
      onLoad={handleLoad}
      style={out ? { backgroundColor: out.bg } : undefined}
    />
  );
}
