"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { Template } from "@/lib/types";
import { asset } from "@/lib/asset";

const TYPE_NAME: Record<string, string> = {
  content: "文案策划",
  image: "品牌设计",
  video: "视频宣传",
};

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

function parseUses(uses: string): number {
  const raw = String(uses || "0").trim().toLowerCase();
  const m = raw.match(/^([\d.]+)\s*([km万])?$/i);
  if (!m) return Number.parseInt(raw.replace(/\D/g, ""), 10) || 0;
  const n = Number.parseFloat(m[1]);
  const u = m[2];
  if (u === "k") return Math.round(n * 1000);
  if (u === "m") return Math.round(n * 1_000_000);
  if (u === "万") return Math.round(n * 10_000);
  return Math.round(n);
}

function formatCount(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, "")}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(n);
}

export function templatePrompt(t: Template): string {
  const f = t.fill;
  if (f?.input?.trim()) return f.input.trim();
  // 字体类等可能没有 input，用可读摘要
  if (f?.text || f?.effect) {
    return [f.text && `文字：${f.text}`, f.effect && `效果：${f.effect}`, f.style && `风格：${f.style}`]
      .filter(Boolean)
      .join("\n");
  }
  return t.name;
}

type InfoRow = { label: string; value: string; swatches?: string[] };

/** 信息区：该灵感真实对应的分类与回填字段（有什么显示什么） */
function templateInfoRows(t: Template): InfoRow[] {
  const f = t.fill;
  const rows: InfoRow[] = [
    { label: "类型", value: TYPE_NAME[t.type] ?? t.type },
    { label: "分类", value: t.sub },
    { label: "场景", value: t.scene },
  ];
  if (t.hot) rows.push({ label: "标记", value: "热门推荐" });

  if (!f) return rows;

  const push = (label: string, value?: string, swatches?: string[]) => {
    const v = value?.trim();
    if (!v && !swatches?.length) return;
    rows.push({ label, value: v || "", swatches });
  };

  push("成图类型", f.eventSub && f.eventSub !== t.sub ? f.eventSub : undefined);
  push("产品", f.product);
  push("品牌", f.brand);
  push("副文案", f.slogan);
  push("标题", f.title);
  push("关键词", f.keywords);
  push("平台", f.platforms);
  push("受众", f.audience);
  push("卖点", f.advantage);
  push("风格", f.style);
  push("文字", f.text);
  push("效果", f.effect);
  push("方向", f.dir);
  push("比例", f.ratio);
  if (f.colors?.trim()) {
    const swatches = f.colors
      .split(/[,，\s]+/)
      .map((c) => c.trim())
      .filter((c) => /^#?[0-9a-fA-F]{3,8}$/.test(c))
      .map((c) => (c.startsWith("#") ? c : `#${c}`));
    push("配色", f.colors, swatches.length ? swatches : undefined);
  }

  return rows;
}

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}

type Props = {
  template: Template;
  onClose: () => void;
  onApply: (t: Template) => void;
};

export function TemplateDetail({ template: t, onClose, onApply }: Props) {
  const toast = useToast();
  const canvasRef = useRef<HTMLDivElement>(null);
  const boundSrcRef = useRef<string>("");
  const [zoom, setZoom] = useState(1);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [fitBase, setFitBase] = useState<{ w: number; h: number } | null>(null);

  const prompt = useMemo(() => templatePrompt(t), [t]);
  const infoRows = useMemo(() => templateInfoRows(t), [t]);
  const views = parseUses(t.uses);
  const imgSrc = t.img ? asset(t.img) : "";
  const zoomPct = Math.round(zoom * 100);

  const recomputeFit = useCallback((nw: number, nh: number) => {
    const el = canvasRef.current;
    if (!el || !nw || !nh) return;
    // 用画布可视区域做 contain，保证整图完整落在框内（长图/易拉宝也会缩小显示）
    const cw = Math.max(40, el.clientWidth);
    const ch = Math.max(40, el.clientHeight);
    const scale = Math.min(cw / nw, ch / nh);
    setFitBase({
      w: Math.max(1, Math.floor(nw * scale)),
      h: Math.max(1, Math.floor(nh * scale)),
    });
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setZoom((z) => clampZoom(z + ZOOM_STEP));
      if (e.key === "-" || e.key === "_") setZoom((z) => clampZoom(z - ZOOM_STEP));
      if (e.key === "0") setZoom(1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (!nat) return;
    recomputeFit(nat.w, nat.h);
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => recomputeFit(nat.w, nat.h));
    ro.observe(el);
    return () => ro.disconnect();
  }, [nat, recomputeFit]);

  function bumpZoom(delta: number) {
    setZoom((z) => clampZoom(z + delta));
  }

  function resetFit() {
    setZoom(1);
    const el = canvasRef.current;
    if (el) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }
  }

  /** 按原图像素 1:1 显示（相对「适应」的倍率） */
  function zoomActual() {
    if (!nat || !fitBase || fitBase.w <= 0) {
      setZoom(2);
      return;
    }
    setZoom(clampZoom(nat.w / fitBase.w));
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      toast("提示词已复制");
    } catch {
      toast("复制失败，请手动选择文本", "warn");
    }
  }

  async function downloadImg() {
    if (!imgSrc) {
      toast("该模版暂无封面可下载", "warn");
      return;
    }
    try {
      const res = await fetch(imgSrc);
      const blob = await res.blob();
      const a = document.createElement("a");
      const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
      a.href = URL.createObjectURL(blob);
      a.download = `${t.name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40)}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("开始下载");
    } catch {
      window.open(imgSrc, "_blank");
    }
  }

  const slotW = fitBase ? Math.round(fitBase.w * zoom) : undefined;
  const slotH = fitBase ? Math.round(fitBase.h * zoom) : undefined;

  function bindNatural(el: HTMLImageElement) {
    if (!el.naturalWidth || !el.naturalHeight) return;
    const key = `${el.currentSrc || el.src}|${el.naturalWidth}x${el.naturalHeight}`;
    const first = boundSrcRef.current !== key;
    if (first) {
      boundSrcRef.current = key;
      setNat({ w: el.naturalWidth, h: el.naturalHeight });
      setZoom(1);
    }
    requestAnimationFrame(() => recomputeFit(el.naturalWidth, el.naturalHeight));
  }

  return (
    <div
      className="tpl-detail"
      role="dialog"
      aria-modal="true"
      aria-label={t.name}
      onClick={onClose}
    >
      <div className="tpl-detail-body" onClick={(e) => e.stopPropagation()}>
        <div className="tpl-detail-stage">
          <div className="tpl-detail-title">{t.name}</div>
          <div
            ref={canvasRef}
            className={`tpl-detail-canvas${zoom !== 1 ? " is-zoomed" : ""}`}
          >
            {imgSrc ? (
              <div
                className="tpl-detail-img-slot"
                style={
                  slotW && slotH
                    ? { width: slotW, height: slotH }
                    : { width: "100%", height: "100%" }
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgSrc}
                  alt={t.name}
                  onLoad={(e) => bindNatural(e.currentTarget)}
                  ref={(el) => {
                    if (el && el.complete && el.naturalWidth) bindNatural(el);
                  }}
                  draggable={false}
                />
              </div>
            ) : (
              <div
                className={`tpl-detail-emoji ${t.grad}`}
                style={
                  slotW && slotH
                    ? { width: slotW, height: slotH, fontSize: Math.max(28, 48 * zoom) }
                    : undefined
                }
              >
                <span>{t.emoji}</span>
              </div>
            )}
          </div>
          <div className="tpl-detail-zoombar" aria-label="缩放">
            <button type="button" title="适应画布 (0)" onClick={resetFit} aria-label="适应画布">
              <Icon name="szSquare" size={15} />
            </button>
            <button
              type="button"
              title="缩小 (-)"
              onClick={() => bumpZoom(-ZOOM_STEP)}
              aria-label="缩小"
              disabled={zoom <= ZOOM_MIN}
            >
              −
            </button>
            <button
              type="button"
              className="tpl-detail-zoompct"
              title="点击恢复适应"
              onClick={resetFit}
            >
              {zoomPct}%
            </button>
            <button
              type="button"
              title="放大 (+)"
              onClick={() => bumpZoom(ZOOM_STEP)}
              aria-label="放大"
              disabled={zoom >= ZOOM_MAX}
            >
              +
            </button>
            <button type="button" title="原图尺寸" onClick={zoomActual} aria-label="原图尺寸">
              <Icon name="search" size={15} />
            </button>
          </div>
        </div>

        <aside className="tpl-detail-side">
          <div className="tpl-detail-head">
            <div className="tpl-detail-user">
              <span className="tpl-detail-avatar" aria-hidden>
                魔
              </span>
              <span className="tpl-detail-uname">魔方智绘</span>
            </div>
            <div className="tpl-detail-head-actions">
              <span className="tpl-detail-stat" title="浏览">
                <Icon name="eye" size={15} />
                {formatCount(views)}
              </span>
              <button type="button" className="tpl-detail-ico-btn" onClick={onClose} aria-label="关闭">
                <Icon name="close" size={16} />
              </button>
            </div>
          </div>

          <div className="tpl-detail-scroll">
            <section className="tpl-detail-sec">
              <div className="tpl-detail-sec-h">
                <span className="tpl-detail-sec-lab">
                  <Icon name="pencil" size={14} />
                  提示词
                </span>
                <button type="button" className="tpl-detail-copy" onClick={copyPrompt}>
                  复制
                </button>
              </div>
              <div className="tpl-detail-prompt">{prompt}</div>
            </section>

            <section className="tpl-detail-sec">
              <div className="tpl-detail-sec-h">
                <span className="tpl-detail-sec-lab">
                  <Icon name="outline" size={14} />
                  信息
                </span>
              </div>
              <dl className="tpl-detail-info">
                {infoRows.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>
                      {row.swatches?.length ? (
                        <span className="tpl-detail-swatches" title={row.value}>
                          {row.swatches.map((c) => (
                            <i key={c} style={{ background: c }} title={c} />
                          ))}
                          <span className="tpl-detail-swatch-txt">{row.value}</span>
                        </span>
                      ) : (
                        row.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          <div className="tpl-detail-foot">
            <button type="button" className="tpl-detail-apply" onClick={() => onApply(t)}>
              套用模版
            </button>
            <button type="button" className="tpl-detail-dl" onClick={downloadImg}>
              <Icon name="download" size={16} />
              下载
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
