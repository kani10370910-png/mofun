"use client";

import type { CSSProperties, ReactNode } from "react";

/** 把「竖版3:4 / 16:9 / 纵向 3:5」等转成 CSS aspect-ratio */
export function genSlotAspect(ratio?: string): string {
  const raw = (ratio || "").trim();
  const compact = raw.replace(/\s+/g, "");
  const m = compact.match(/(\d+(?:\.\d+)?)[:/／×x*](\d+(?:\.\d+)?)/);
  if (m) return `${Number(m[1])} / ${Number(m[2])}`;
  if (/纵向/.test(raw)) return "3 / 5";
  if (/横向/.test(raw)) return "5 / 3";
  if (/宽屏|智能/.test(raw)) return "16 / 9";
  if (/正方形|方形/.test(raw)) return "1 / 1";
  return "1 / 1";
}

export function parseAspectParts(aspect?: string): { w: number; h: number } {
  const m = (aspect || "").match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!m) return { w: 1, h: 1 };
  return { w: Number(m[1]) || 1, h: Number(m[2]) || 1 };
}

/** 聊天/占位画幅：按设置比例，并用最大高度收住竖图 */
export function genSlotFrameStyle(aspect?: string, maxH = 420, maxW = 560): CSSProperties {
  const a = aspect || "1 / 1";
  const { w, h } = parseAspectParts(a);
  const width = Math.min(maxW, (maxH * w) / Math.max(h, 0.01));
  return {
    aspectRatio: a,
    width,
    maxWidth: "100%",
    height: "auto",
    maxHeight: maxH,
    minHeight: 0,
    justifySelf: "start",
    alignSelf: "start",
  };
}

export function GeneratingSlot({
  aspect,
  label = "生成中",
  className = "",
  fill = false,
  framed = false,
  children,
}: {
  aspect?: string;
  label?: string;
  className?: string;
  /** 铺满父级（父级已有宽高 / 比例） */
  fill?: boolean;
  /** 按比例收最大高度，用于首页对话 */
  framed?: boolean;
  children?: ReactNode;
}) {
  const style: CSSProperties | undefined = fill
    ? undefined
    : framed
      ? genSlotFrameStyle(aspect || "1 / 1")
      : { aspectRatio: aspect || "1 / 1" };
  return (
    <div
      className={`gen-slot${fill ? " gen-slot-fill" : ""}${framed ? " is-framed" : ""}${className ? ` ${className}` : ""}`}
      style={style}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="gen-slot-pill">{label}</span>
      {children}
    </div>
  );
}
