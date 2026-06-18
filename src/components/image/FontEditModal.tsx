"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { imageTools } from "@/data/image";
import type { Grad } from "@/lib/types";
import { ImageWorkbench, type ToolKey } from "./ImageWorkbench";

// 「更改颜色」预设色板
const PRESET_COLORS = ["#9b2c2c", "#e0571f", "#f2d574", "#3f7d3f", "#2f7a93"];

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

  // 打开了图片处理工作台：全屏覆盖
  if (workbench) {
    return <ImageWorkbench text={text} grad={grad} initialTool={workbench} onClose={() => setWorkbench(null)} />;
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="fe-modal" onClick={(e) => e.stopPropagation()}>
        {/* 左：大预览 + 改色 */}
        <div className="fe-modal-left">
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
              {imageTools.map((t) => (
                <button key={t.key} className="fe-tool" onClick={() => setWorkbench(t.key as ToolKey)}>
                  <Icon name={TOOL_ICON[t.key] ?? "sparkle"} size={18} />
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="fe-foot">
            <button className="btn fe-dl-ghost" onClick={() => toast("已下载透明背景图（演示）")}>
              透明背景图下载
            </button>
            <button className="btn fe-dl-primary" onClick={() => toast("已下载 2K 高清图（演示）")}>
              2K高清图下载
              <span className="fe-dl-badge">变清晰</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
