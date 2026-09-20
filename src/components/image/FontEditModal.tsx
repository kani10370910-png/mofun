"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { imageTools } from "@/data/image";
import type { Grad } from "@/lib/types";
import { asset } from "@/lib/asset";
import { ImageWorkbench, type ToolKey } from "./ImageWorkbench";
import { ColorPicker } from "./ColorPicker";

// 「更改颜色」预设色板
const PRESET_COLORS = ["#9b2c2c", "#e0571f", "#f2d574", "#3f7d3f", "#2f7a93"];

/* 自适应字号：仅无成图时的文字占位预览使用 */
function useFitText(
  boxRef: React.RefObject<HTMLElement | null>,
  textRef: React.RefObject<HTMLElement | null>,
  vertical: boolean,
  maxFont: number,
  deps: unknown[],
) {
  useEffect(() => {
    const box = boxRef.current;
    const el = textRef.current;
    if (!box || !el) return;
    const fit = () => {
      el.style.setProperty("--fz", `${maxFont}px`);
      const cs = getComputedStyle(box);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const availW = (box.clientWidth - padX) * 0.92;
      const availH = (box.clientHeight - padY) * 0.92;
      const w = el.scrollWidth;
      const h = el.scrollHeight;
      const ratio = Math.min(availW / w || 1, availH / h || 1, 1);
      if (ratio < 1) el.style.setProperty("--fz", `${Math.floor(maxFont * ratio)}px`);
    };
    fit();
    const raf = requestAnimationFrame(fit);
    const timers = [80, 250, 600].map((d) => window.setTimeout(fit, d));
    document.fonts?.ready.then(fit).catch(() => {});
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const TOOL_ICON: Record<string, "toolEnhance" | "toolErase" | "toolMatting" | "toolExpand" | "toolVector" | "toolRepair"> = {
  enhance: "toolEnhance",
  erase: "toolErase",
  matting: "toolMatting",
  expand: "toolExpand",
  vector: "toolVector",
  repair: "toolRepair",
};

/** 成图地址：站内 / data / blob 直接用；外链走代理以便 canvas 取像素 */
function canvasSafeSrc(src: string): string {
  if (!src) return src;
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;
  if (src.startsWith("/")) return asset(src);
  if (/^https?:\/\//i.test(src)) return `/api/proxy-image?url=${encodeURIComponent(src)}`;
  return asset(src);
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

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

/**
 * 把成图绘到 canvas：可换墨色、可抠白底为透明，可按长边放大。
 * 近白像素当背景；越暗越当「墨迹」。有换色时墨迹染成目标色；无换色则保留原色（冰雪彩字等）。
 */
function renderFontCanvas(
  source: HTMLImageElement,
  opts: { inkHex: string | null; transparent: boolean; longSide?: number },
): HTMLCanvasElement {
  const { inkHex, transparent, longSide } = opts;
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  let tw = sw;
  let th = sh;
  if (longSide && Math.max(sw, sh) > 0) {
    const scale = longSide / Math.max(sw, sh);
    tw = Math.max(1, Math.round(sw * scale));
    th = Math.max(1, Math.round(sh * scale));
  }
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(source, 0, 0, tw, th);

  if (!inkHex && !transparent) return canvas;

  const imgData = ctx.getImageData(0, 0, tw, th);
  const data = imgData.data;
  const [cr, cg, cb] = inkHex ? parseHex(inkHex) : [17, 17, 17];

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a === 0) continue;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    // 近白 → 背景；越暗墨量越大
    const ink = Math.min(1, Math.max(0, (0.94 - lum) / 0.94));
    if (transparent) {
      if (inkHex) {
        data[i] = cr;
        data[i + 1] = cg;
        data[i + 2] = cb;
      }
      data[i + 3] = Math.round(a * ink);
    } else if (inkHex) {
      data[i] = Math.round(cr * ink + 255 * (1 - ink));
      data[i + 1] = Math.round(cg * ink + 255 * (1 - ink));
      data[i + 2] = Math.round(cb * ink + 255 * (1 - ink));
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/* 无成图时的文字占位导出（兼容旧记录） */
function renderTextFallback(
  text: string,
  vertical: boolean,
  ink: string,
  transparent: boolean,
  longSide: number,
): HTMLCanvasElement {
  const chars = Array.from(text);
  const unit = 256;
  const pad = 80;
  const contentW = vertical ? unit : chars.length * unit;
  const contentH = vertical ? chars.length * unit : unit;
  const baseW = contentW + pad * 2;
  const baseH = contentH + pad * 2;
  const scale = longSide / Math.max(baseW, baseH);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(baseW * scale);
  canvas.height = Math.round(baseH * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  if (!transparent) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, baseW, baseH);
  }
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${unit * 0.82}px "STXingkai","行楷","STKaiti","楷体",serif`;
  chars.forEach((c, i) => {
    const cx = vertical ? pad + unit / 2 : pad + i * unit + unit / 2;
    const cy = vertical ? pad + i * unit + unit / 2 : pad + unit / 2;
    ctx.fillText(c, cx, cy);
  });
  return canvas;
}

/* AI 字体生成信息弹窗：左预览 + 改色，右信息 + 图片处理 + 下载 */
export function FontEditModal({
  text,
  effect,
  dir,
  grad,
  img,
  onClose,
}: {
  text: string;
  effect: string;
  dir: string;
  grad: Grad;
  /** 生成结果真图；有则预览/下载都基于它，不再用系统字体画字 */
  img?: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [fav, setFav] = useState(false);
  const [color, setColor] = useState<string | null>(null);
  const [workbench, setWorkbench] = useState<ToolKey | null>(null);
  const [picking, setPicking] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const colorBoxRef = useRef<HTMLDivElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const previewTextRef = useRef<HTMLSpanElement>(null);
  const fsBoxRef = useRef<HTMLDivElement>(null);
  const fsTextRef = useRef<HTMLSpanElement>(null);

  // 成图：原图 + 换色后的预览 dataURL
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imgLoadError, setImgLoadError] = useState(false);

  const vertical = dir === "竖向";
  const hasArt = !!img && !imgLoadError && !!sourceImg;

  // 加载成图
  useEffect(() => {
    if (!img) {
      setSourceImg(null);
      setPreviewUrl(null);
      setImgLoadError(false);
      return;
    }
    let cancelled = false;
    setImgLoadError(false);
    loadImage(canvasSafeSrc(img))
      .then((im) => {
        if (cancelled) return;
        setSourceImg(im);
      })
      .catch(() => {
        if (cancelled) return;
        setSourceImg(null);
        setImgLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [img]);

  // 换色 → 刷新预览
  useEffect(() => {
    if (!sourceImg) {
      setPreviewUrl(null);
      return;
    }
    if (!color) {
      setPreviewUrl(null);
      return;
    }
    try {
      const canvas = renderFontCanvas(sourceImg, { inkHex: color, transparent: false });
      setPreviewUrl(canvas.toDataURL("image/png"));
    } catch {
      setPreviewUrl(null);
    }
  }, [sourceImg, color]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  useEffect(() => {
    if (!picking) return;
    const onDown = (e: MouseEvent) => {
      if (colorBoxRef.current && !colorBoxRef.current.contains(e.target as Node)) setPicking(false);
    };
    const t = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
    };
  }, [picking]);

  async function downloadPng(opts: { transparent: boolean; longSide: number; suffix: string }) {
    const { transparent, longSide, suffix } = opts;
    try {
      let canvas: HTMLCanvasElement;
      if (img && !imgLoadError) {
        const im = sourceImg ?? (await loadImage(canvasSafeSrc(img)));
        canvas = renderFontCanvas(im, {
          inkHex: color,
          transparent,
          longSide,
        });
      } else {
        canvas = renderTextFallback(text, vertical, color ?? "#111111", transparent, longSide);
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        toast("导出失败，请重试", "warn");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${text || "字体"}-${suffix}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast(transparent ? "已下载透明背景图" : "已下载 2K 高清图");
    } catch {
      toast("导出失败，请稍后重试", "warn");
    }
  }

  useFitText(previewBoxRef, previewTextRef, vertical, 130, [text, vertical, hasArt]);
  useFitText(fsBoxRef, fsTextRef, vertical, 460, [text, vertical, fullscreen, hasArt]);

  const displaySrc = previewUrl || (img && !imgLoadError ? canvasSafeSrc(img) : null);

  if (workbench) {
    return (
      <ImageWorkbench
        text={text}
        grad={grad}
        initialTool={workbench}
        lockTo="vector"
        color={color ?? undefined}
        vertical={vertical}
        onClose={() => setWorkbench(null)}
      />
    );
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div
        className="modal-mask"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <div className="fe-edit-modal" onClick={(e) => e.stopPropagation()}>
          <div className="fe-modal-left">
            <div className="fe-preview" ref={previewBoxRef}>
              {displaySrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="fe-preview-img" src={displaySrc} alt={text} />
              ) : (
                <span
                  ref={previewTextRef}
                  className={vertical ? "fe-preview-text is-vertical" : "fe-preview-text"}
                  style={color ? { color } : undefined}
                >
                  {text}
                </span>
              )}
            </div>
            <div className="fe-colors" ref={colorBoxRef}>
              <span className="fe-colors-label">更改颜色：</span>
              <button
                className={picking ? "fe-color-add on" : "fe-color-add"}
                title={picking ? "完成取色" : "自定义颜色"}
                onClick={() => setPicking((v) => !v)}
              >
                <Icon name="plus" size={16} />
              </button>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  className={color === c ? "fe-color on" : "fe-color"}
                  style={{ background: c }}
                  title={c}
                  onClick={() => setColor(c)}
                />
              ))}
              {picking && (
                <div className="fe-colorpicker-up">
                  <ColorPicker value={color ?? "#000000"} onChange={setColor} />
                </div>
              )}
              <button
                className="fe-reset"
                title="重置颜色"
                onClick={() => {
                  setColor(null);
                  setPicking(false);
                }}
              >
                重置
              </button>
              <button className="fe-fullscreen-corner" title="全屏预览" onClick={() => setFullscreen(true)}>
                <Icon name="toolExpand" size={18} />
              </button>
            </div>
          </div>

          <div className="fe-modal-right">
            <div className="fe-head">
              <div className="fe-title">AI字体生成信息</div>
              <button
                className={fav ? "fe-fav on" : "fe-fav"}
                onClick={() => setFav((v) => !v)}
                aria-label="收藏"
              >
                <Icon name="heart" size={18} />
              </button>
            </div>

            <div className="fe-info">
              <div className="fe-info-label">文字内容：</div>
              <div className="fe-info-text">{text}</div>
              <div className="fe-info-meta">
                文字效果：{effect} <span className="fe-info-sep">|</span> 文字方向：{dir === "竖向" ? "竖排" : "横排"}
              </div>
            </div>

            <div className="fe-spacer" />

            <div className="fe-tools">
              <div className="fe-tools-title">图片处理</div>
              <div className="fe-tools-grid">
                {imageTools
                  .filter((t) => t.key === "vector")
                  .map((t) => (
                    <button key={t.key} className="fe-tool" onClick={() => setWorkbench(t.key as ToolKey)}>
                      <Icon name={TOOL_ICON[t.key] ?? "toolVector"} size={18} />
                      {t.name}
                    </button>
                  ))}
              </div>
            </div>

            <div className="fe-foot">
              <button
                className="btn fe-dl-ghost"
                onClick={() => downloadPng({ transparent: true, longSide: 2048, suffix: "透明背景" })}
              >
                透明背景图下载
              </button>
              <button
                className="btn fe-dl-primary"
                onClick={() => downloadPng({ transparent: false, longSide: 2048, suffix: "2K高清" })}
              >
                2K高清图下载
                <span className="fe-dl-badge">变清晰</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {fullscreen && (
        <div
          className="fe-fs-mask"
          ref={fsBoxRef}
          onClick={(e) => {
            e.stopPropagation();
            setFullscreen(false);
          }}
        >
          <button className="fe-fs-close" title="退出全屏" onClick={() => setFullscreen(false)}>
            <Icon name="close" size={22} />
          </button>
          {displaySrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="fe-fs-img" src={displaySrc} alt={text} onClick={(e) => e.stopPropagation()} />
          ) : (
            <span
              ref={fsTextRef}
              className={vertical ? "fe-fs-text is-vertical" : "fe-fs-text"}
              style={color ? { color } : undefined}
            >
              {text}
            </span>
          )}
        </div>
      )}
    </>,
    document.body,
  );
}
