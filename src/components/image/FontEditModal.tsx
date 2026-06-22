"use client";

<<<<<<< HEAD
import { useState } from "react";
=======
import { useEffect, useRef, useState } from "react";
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { imageTools } from "@/data/image";
import type { Grad } from "@/lib/types";
import { ImageWorkbench, type ToolKey } from "./ImageWorkbench";
<<<<<<< HEAD
=======
import { ColorPicker } from "./ColorPicker";
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664

// 「更改颜色」预设色板
const PRESET_COLORS = ["#9b2c2c", "#e0571f", "#f2d574", "#3f7d3f", "#2f7a93"];

<<<<<<< HEAD
=======
/* 自适应字号：渲染后测量，让文字整体（横排比宽、竖排比高）刚好容纳在容器内、不折行不溢出。
   通过给文字元素设 --fz 变量驱动 font-size。deps 变化（文字/方向/是否打开）时重新计算。*/
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
      // 可用区域 = 容器内容宽高（扣除内边距）再留 8% 安全余量，保证文字完整不被遮挡
      const cs = getComputedStyle(box);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const availW = (box.clientWidth - padX) * 0.92;
      const availH = (box.clientHeight - padY) * 0.92;
      // 当前文字尺寸
      const w = el.scrollWidth;
      const h = el.scrollHeight;
      const ratio = Math.min(availW / w || 1, availH / h || 1, 1);
      if (ratio < 1) el.style.setProperty("--fz", `${Math.floor(maxFont * ratio)}px`);
    };
    // 多次重测：首帧 + 下一帧 + 字体加载就绪后（行楷等系统字体异步可用会改变文字宽度）
    fit();
    const raf = requestAnimationFrame(fit);
    const timers = [80, 250, 600].map((d) => window.setTimeout(fit, d));
    // 行楷等系统字体异步可用会改变文字宽度，字体就绪后再测一次
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

>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
// 图片处理工具对应图标
const TOOL_ICON: Record<string, "toolEnhance" | "toolErase" | "toolMatting" | "toolExpand" | "toolVector" | "toolRepair"> = {
  enhance: "toolEnhance",
  erase: "toolErase",
  matting: "toolMatting",
  expand: "toolExpand",
  vector: "toolVector",
  repair: "toolRepair",
};

/* AI 字体生成信息弹窗：左预览 + 改色，右信息 + 图片处理 + 下载 */
export function FontEditModal({
  text,
  effect,
  dir,
  grad,
  onClose,
}: {
  text: string;
  effect: string;
  dir: string;
  grad: Grad;
  onClose: () => void;
}) {
  const toast = useToast();
  const [fav, setFav] = useState(false);
  const [color, setColor] = useState<string | null>(null);
  const [workbench, setWorkbench] = useState<ToolKey | null>(null);
<<<<<<< HEAD

  // 打开了图片处理工作台：全屏覆盖
  if (workbench) {
    return <ImageWorkbench text={text} grad={grad} initialTool={workbench} onClose={() => setWorkbench(null)} />;
  }

  return (
=======
  // 自定义取色器：点「+」展开 HSV 取色面板，选色实时应用到字体预览
  const [picking, setPicking] = useState(false);
  // 全屏预览：点右下角图标，字体大图铺满屏幕（沿用当前所选颜色）
  const [fullscreen, setFullscreen] = useState(false);
  const colorBoxRef = useRef<HTMLDivElement>(null);
  // 自适应字号用的容器/文字引用（主预览 + 全屏）
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const previewTextRef = useRef<HTMLSpanElement>(null);
  const fsBoxRef = useRef<HTMLDivElement>(null);
  const fsTextRef = useRef<HTMLSpanElement>(null);

  // 全屏预览时按 Esc 退出
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // 取色器展开时，点击其外部即收起
  useEffect(() => {
    if (!picking) return;
    const onDown = (e: MouseEvent) => {
      if (colorBoxRef.current && !colorBoxRef.current.contains(e.target as Node)) setPicking(false);
    };
    // 延后挂载，避免打开取色器的同一次点击立即触发关闭
    const t = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
    };
  }, [picking]);

  // 生成方向：竖向 → 竖排展示，其余 → 横排（主预览与全屏预览均跟随）
  const vertical = dir === "竖向";

  // 用 Canvas 把文字渲染成 PNG 下载（透明或白底、应用当前颜色与排版方向）
  function downloadPng(opts: { transparent: boolean; longSide: number; suffix: string }) {
    const { transparent, longSide, suffix } = opts;
    const ink = color ?? "#111111";
    const chars = Array.from(text);
    const unit = 256;
    const pad = 80;
    // 画布逻辑尺寸（横排横向排列，竖排纵向排列）
    const contentW = vertical ? unit : chars.length * unit;
    const contentH = vertical ? chars.length * unit : unit;
    const baseW = contentW + pad * 2;
    const baseH = contentH + pad * 2;
    // 按长边缩放到目标分辨率（如 2048）
    const scale = longSide / Math.max(baseW, baseH);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(baseW * scale);
    canvas.height = Math.round(baseH * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast("当前浏览器不支持导出图片", "warn");
      return;
    }
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
    canvas.toBlob((blob) => {
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
    }, "image/png");
  }

  // 主预览 / 全屏预览：自适应字号，多字也整体一行（横）或一列（竖）容纳
  useFitText(previewBoxRef, previewTextRef, vertical, 130, [text, vertical]);
  useFitText(fsBoxRef, fsTextRef, vertical, 460, [text, vertical, fullscreen]);

  // 打开了图片处理工作台：全屏覆盖
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

  return (
    <>
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
    <div className="modal-mask" onClick={onClose}>
      <div className="fe-modal" onClick={(e) => e.stopPropagation()}>
        {/* 左：大预览 + 改色 */}
        <div className="fe-modal-left">
<<<<<<< HEAD
          <div className="fe-preview">
            <span className="fe-preview-text" style={color ? { color } : undefined}>
              {text}
            </span>
            <button className="fe-fullscreen" title="全屏预览" onClick={() => toast("全屏预览（演示）")}>
              <Icon name="toolExpand" size={18} />
            </button>
          </div>
          <div className="fe-colors">
            <span className="fe-colors-label">更改颜色：</span>
            <button className="fe-color-add" title="自定义颜色" onClick={() => toast("自定义取色（演示）")}>
=======
          <div className="fe-preview" ref={previewBoxRef}>
            <span
              ref={previewTextRef}
              className={vertical ? "fe-preview-text is-vertical" : "fe-preview-text"}
              style={color ? { color } : undefined}
            >
              {text}
            </span>
          </div>
          <div className="fe-colors" ref={colorBoxRef}>
            <span className="fe-colors-label">更改颜色：</span>
            <button
              className={picking ? "fe-color-add on" : "fe-color-add"}
              title={picking ? "完成取色" : "自定义颜色"}
              onClick={() => setPicking((v) => !v)}
            >
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
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
<<<<<<< HEAD
=======
            {/* 自定义取色面板：选色实时应用到上方字体预览（cp-panel 自带浮层样式，向上弹避免溢出弹窗底部） */}
            {picking && (
              <div className="fe-colorpicker-up">
                <ColorPicker value={color ?? "#000000"} onChange={setColor} />
              </div>
            )}
            {/* 重置为默认（原始）颜色 */}
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
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
          </div>
        </div>

        {/* 右：信息 + 图片处理 + 下载 */}
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
<<<<<<< HEAD
              {imageTools.map((t) => (
                <button key={t.key} className="fe-tool" onClick={() => setWorkbench(t.key as ToolKey)}>
                  <Icon name={TOOL_ICON[t.key] ?? "sparkle"} size={18} />
                  {t.name}
                </button>
              ))}
=======
              {/* 字体场景仅保留「转矢量」一个图片处理功能 */}
              {imageTools
                .filter((t) => t.key === "vector")
                .map((t) => (
                  <button key={t.key} className="fe-tool" onClick={() => setWorkbench(t.key as ToolKey)}>
                    <Icon name={TOOL_ICON[t.key] ?? "sparkle"} size={18} />
                    {t.name}
                  </button>
                ))}
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
            </div>
          </div>

          <div className="fe-foot">
<<<<<<< HEAD
            <button className="btn fe-dl-ghost" onClick={() => toast("已下载透明背景图（演示）")}>
              透明背景图下载
            </button>
            <button className="btn fe-dl-primary" onClick={() => toast("已下载 2K 高清图（演示）")}>
=======
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
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
              2K高清图下载
              <span className="fe-dl-badge">变清晰</span>
            </button>
          </div>
        </div>
      </div>
    </div>
<<<<<<< HEAD
=======

    {/* 全屏预览：字体大图铺满屏幕，沿用当前所选颜色，点遮罩 / × / Esc 退出 */}
    {fullscreen && (
      <div className="fe-fs-mask" ref={fsBoxRef} onClick={() => setFullscreen(false)}>
        <button className="fe-fs-close" title="退出全屏" onClick={() => setFullscreen(false)}>
          <Icon name="close" size={22} />
        </button>
        <span
          ref={fsTextRef}
          className={vertical ? "fe-fs-text is-vertical" : "fe-fs-text"}
          style={color ? { color } : undefined}
        >
          {text}
        </span>
      </div>
    )}
    </>
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
  );
}
