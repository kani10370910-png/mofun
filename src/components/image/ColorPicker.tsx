"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

// 部分浏览器支持系统级取色（吸管），无类型声明，按需取用
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

/* 内联 HSV 取色面板：吸管 + 饱和度/明度方块 + 色相条 + HEX 实时显示 */
export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const init = hexToHsv(value) ?? { h: 0, s: 1, v: 0 };
  const [h, setH] = useState(init.h);
  const [s, setS] = useState(init.s);
  const [v, setV] = useState(init.v);

  const hex = hsvToHex(h, s, v);

  // Hex 输入框的草稿值：用户编辑中允许暂时不合法；合法（6 位）时即刻应用
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const hexText = hexDraft ?? hex.replace("#", "").toUpperCase();

  // 应用一个十六进制颜色到面板状态
  function applyHex(next: string) {
    const hsv = hexToHsv(next);
    if (!hsv) return;
    setH(hsv.h);
    setS(hsv.s);
    setV(hsv.v);
  }

  // 用户编辑 Hex 输入框：清洗为 0-9A-F、最长 6 位；满 6 位即应用到面板
  function onHexInput(raw: string) {
    const cleaned = raw.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase();
    setHexDraft(cleaned);
    if (cleaned.length === 6) applyHex(`#${cleaned}`);
  }

  // 失焦/回车：若不足 6 位则回退到当前实际颜色
  function commitHex() {
    if (!hexDraft || hexDraft.length !== 6) setHexDraft(null);
    else {
      applyHex(`#${hexDraft}`);
      setHexDraft(null);
    }
  }

  // 吸管：调用系统取色（支持的浏览器），失败/不支持则静默
  async function pickFromScreen() {
    const EyeDropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
    if (!EyeDropper) return;
    try {
      const { sRGBHex } = await new EyeDropper().open();
      applyHex(sRGBHex);
    } catch {
      /* 用户取消，忽略 */
    }
  }

  // 任意分量变化即回调
  useEffect(() => {
    onChange(hex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h, s, v]);

  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  function pickSV(clientX: number, clientY: number) {
    const el = svRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = clamp((clientX - r.left) / r.width);
    const y = clamp((clientY - r.top) / r.height);
    setS(x);
    setV(1 - y);
  }
  function pickHue(clientX: number) {
    const el = hueRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setH(clamp((clientX - r.left) / r.width) * 360);
  }

  // 拖拽：按下后跟随鼠标
  const drag = useRef<null | "sv" | "hue">(null);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (drag.current === "sv") pickSV(e.clientX, e.clientY);
      else if (drag.current === "hue") pickHue(e.clientX);
    };
    const up = () => (drag.current = null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="cp-panel">
      <div
        ref={svRef}
        className="cp-sv"
        style={{ background: `hsl(${h}, 100%, 50%)` }}
        onMouseDown={(e) => {
          drag.current = "sv";
          pickSV(e.clientX, e.clientY);
        }}
      >
        <div className="cp-sv-white" />
        <div className="cp-sv-black" />
        <div className="cp-sv-dot" style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }} />
      </div>
      <div className="cp-hue-row">
        <button type="button" className="cp-dropper" title="屏幕取色" onClick={pickFromScreen}>
          <Icon name="eyedropper" size={18} />
        </button>
        <div
          ref={hueRef}
          className="cp-hue"
          onMouseDown={(e) => {
            drag.current = "hue";
            pickHue(e.clientX);
          }}
        >
          <div className="cp-hue-dot" style={{ left: `${(h / 360) * 100}%` }} />
        </div>
      </div>
      <div className="cp-foot">
        <span className="cp-hex-label">Hex</span>
        <input
          className="cp-hex-val cp-hex-input"
          type="text"
          inputMode="text"
          spellCheck={false}
          maxLength={6}
          value={hexText}
          onChange={(e) => onHexInput(e.target.value)}
          onBlur={commitHex}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitHex();
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label="十六进制色值"
        />
      </div>
    </div>
  );
}

function clamp(n: number) {
  return Math.max(0, Math.min(1, n));
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}
