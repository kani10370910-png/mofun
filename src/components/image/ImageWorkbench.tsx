"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { Grad } from "@/lib/types";

export type ToolKey = "enhance" | "erase" | "matting" | "expand" | "repair" | "vector";

const TOOLS: { key: ToolKey; name: string; ico: "toolEnhance" | "toolErase" | "toolMatting" | "toolExpand" | "toolRepair" | "toolVector" }[] = [
  { key: "enhance", name: "AI变清晰", ico: "toolEnhance" },
  { key: "erase", name: "AI消除", ico: "toolErase" },
  { key: "matting", name: "AI抠图", ico: "toolMatting" },
  { key: "expand", name: "AI扩图", ico: "toolExpand" },
  { key: "repair", name: "细节修复", ico: "toolRepair" },
  { key: "vector", name: "转矢量", ico: "toolVector" },
];

/* 图片处理全屏工作台：左工具栏 + 中画布 + 右操作记录 + 底部按工具切换 */
export function ImageWorkbench({
  text,
  grad,
  initialTool = "enhance",
  onClose,
}: {
  text: string;
  grad: Grad;
  initialTool?: ToolKey;
  onClose: () => void;
}) {
  const toast = useToast();
  const [tool, setTool] = useState<ToolKey>(initialTool);
  const [histTab, setHistTab] = useState<"op" | "saved">("op");

  return (
    <div className="iw-root">
      {/* 顶栏 */}
      <header className="iw-top">
        <button className="iw-back" onClick={onClose}>
          <span className="iw-back-arrow">‹</span> 返回
        </button>
        <div className="iw-top-mid">
          <button className="iw-top-act" onClick={() => toast("重新上传（演示）")}>
            <Icon name="plus" size={16} /> 重新上传
          </button>
          {tool !== "matting" && (
            <>
              <button className="iw-top-act" onClick={() => toast("已重置原图（演示）")}>
                <Icon name="refresh" size={16} /> 重置原图
              </button>
              <button className="iw-top-act" onClick={() => toast("对比原图（演示）")}>
                <Icon name="image" size={16} /> 对比原图
              </button>
            </>
          )}
        </div>
        <div className="iw-top-right">
          <button className="btn iw-btn-ghost" onClick={() => toast("制作包装（演示）")}>
            制作包装
          </button>
          <button className="btn iw-btn-dark" onClick={() => toast("已下载（演示）")}>
            下载
          </button>
        </div>
      </header>

      <div className="iw-body">
        {/* 左侧工具栏 */}
        <aside className="iw-rail">
          {TOOLS.map((t) => (
            <button
              key={t.key}
              className={tool === t.key ? "iw-tool on" : "iw-tool"}
              onClick={() => setTool(t.key)}
            >
              <Icon name={t.ico} size={22} />
              <span>{t.name}</span>
            </button>
          ))}
        </aside>

        {/* 中间画布 */}
        <main className="iw-canvas">
          {tool === "matting" ? (
            <div className="iw-matting">
              <div className="iw-mat-pane">
                <span className="iw-mat-tag">原图</span>
                <span className="iw-canvas-text">{text}</span>
              </div>
              <div className="iw-mat-pane iw-mat-alpha">
                <span className="iw-canvas-text" style={{ opacity: 0.15 }}>
                  {text}
                </span>
              </div>
            </div>
          ) : (
            <div className={`iw-stage ${tool === "expand" ? "iw-stage-expand" : ""}`}>
              {tool === "expand" && <div className="iw-expand-frame" />}
              <span className="iw-canvas-text">{text}</span>
            </div>
          )}
        </main>

        {/* 右侧记录面板 */}
        <aside className="iw-side">
          <div className="iw-side-tabs">
            <span className={histTab === "op" ? "iw-side-tab on" : "iw-side-tab"} onClick={() => setHistTab("op")}>
              操作记录
            </span>
            <span className={histTab === "saved" ? "iw-side-tab on" : "iw-side-tab"} onClick={() => setHistTab("saved")}>
              保存记录
            </span>
            <button className="iw-side-collapse" title="收起" onClick={() => toast("收起记录（演示）")}>
              <Icon name="chevron" size={16} />
            </button>
          </div>
          <div className="iw-side-empty">
            <div className="iw-empty-box">📦</div>
            <div className="iw-empty-text">暂无操作记录</div>
          </div>
        </aside>
      </div>

      {/* 底部：按工具切换 */}
      <footer className="iw-foot">
        <ToolFooter tool={tool} toast={toast} />
      </footer>
    </div>
  );
}

function ToolFooter({ tool, toast }: { tool: ToolKey; toast: (s: string) => void }) {
  const [scale, setScale] = useState<"2x" | "4x">("4x");
  const [brush, setBrush] = useState(30);
  const [matModel, setMatModel] = useState("模型1");
  const [width, setWidth] = useState("1312");
  const [height, setHeight] = useState("800");
  const [vecModel, setVecModel] = useState<"basic" | "pro">("pro");

  if (tool === "enhance") {
    const out = scale === "2x" ? "2624 X 1600 px" : "5248 X 3200 px";
    return (
      <div className="iw-foot-row">
        <span className="iw-foot-label">放大倍数</span>
        <div className="iw-seg">
          <button className={scale === "2x" ? "iw-seg-item on" : "iw-seg-item"} onClick={() => setScale("2x")}>
            2X
          </button>
          <button className={scale === "4x" ? "iw-seg-item on" : "iw-seg-item"} onClick={() => setScale("4x")}>
            4X
          </button>
        </div>
        <span className="iw-foot-dim">1312 X 800 px</span>
        <span className="iw-foot-arrow">→</span>
        <span className="iw-foot-dim">{out}</span>
        <button className="iw-foot-go" onClick={() => toast("开始放大（演示）")}>
          开始放大 <span className="iw-go-credit">2算力/次</span>
        </button>
      </div>
    );
  }

  if (tool === "erase") {
    return (
      <div className="iw-foot-row">
        <span className="iw-foot-label">画笔粗细</span>
        <input
          type="range"
          className="iw-brush"
          min={5}
          max={100}
          value={brush}
          onChange={(e) => setBrush(Number(e.target.value))}
        />
        <button className="iw-foot-go iw-foot-go-soft" onClick={() => toast("开始消除（演示）")}>
          开始消除 <span className="iw-go-credit">2算力/次</span>
        </button>
        <div className="iw-foot-extra">
          <button className="iw-mini" title="抓手">✋</button>
          <button className="iw-mini" title="撤销">↶</button>
          <button className="iw-mini" title="重做">↷</button>
          <button className="iw-mini" title="重置">⟳</button>
          <span className="iw-zoom">80% ⌄</span>
        </div>
      </div>
    );
  }

  if (tool === "matting") {
    return (
      <div className="iw-foot-row">
        <span className="iw-foot-label">切换抠图模型：</span>
        <div className="iw-mat-models">
          {["模型1", "模型2", "模型3", "模型4"].map((m) => (
            <button key={m} className={matModel === m ? "iw-mat-model on" : "iw-mat-model"} onClick={() => setMatModel(m)}>
              {m}
            </button>
          ))}
        </div>
        <button className="iw-foot-soft-btn" onClick={() => toast("智能识别（演示）")}>
          <Icon name="sparkle" size={15} /> 智能识别
        </button>
        <button className="iw-foot-soft-btn" onClick={() => toast("快速选择（演示）")}>
          <Icon name="search" size={15} /> 快速选择
        </button>
        <button className="iw-foot-go iw-foot-go-dark" onClick={() => toast("开始抠图（演示）")}>
          开始抠图 <span className="iw-go-credit">2算力/次</span>
        </button>
      </div>
    );
  }

  if (tool === "expand") {
    return (
      <div className="iw-foot-row">
        <span className="iw-foot-label">宽度</span>
        <span className="iw-num-box">
          <input value={width} onChange={(e) => setWidth(e.target.value)} /> <i>px</i>
        </span>
        <span className="iw-foot-label">高度</span>
        <span className="iw-num-box">
          <input value={height} onChange={(e) => setHeight(e.target.value)} /> <i>px</i>
        </span>
        <button className="iw-foot-go iw-foot-go-dark" onClick={() => toast("扩图（演示）")}>
          扩图 <span className="iw-go-credit">4算力/次</span>
        </button>
      </div>
    );
  }

  if (tool === "repair") {
    return (
      <div className="iw-foot-row iw-foot-center">
        <button className="iw-foot-go iw-foot-go-dark" onClick={() => toast("开始修复（演示）")}>
          开始修复 <span className="iw-go-credit">2算力/次</span>
        </button>
      </div>
    );
  }

  // vector
  return (
    <div className="iw-foot-row iw-foot-center">
      <div className="iw-vec-models">
        <button className={vecModel === "basic" ? "iw-vec-model on" : "iw-vec-model"} onClick={() => setVecModel("basic")}>
          <span className="iw-vec-dot" /> 基础矢量模型
        </button>
        <button className={vecModel === "pro" ? "iw-vec-model on" : "iw-vec-model"} onClick={() => setVecModel("pro")}>
          <span className="iw-vec-dot on" /> 增强矢量模型 <span className="iw-vec-pro">pro</span>
        </button>
      </div>
      <button className="iw-foot-go iw-foot-go-dark" onClick={() => toast("开始转换（演示）")}>
        开始转换 <span className="iw-go-credit">8算力/次</span>
      </button>
    </div>
  );
}
