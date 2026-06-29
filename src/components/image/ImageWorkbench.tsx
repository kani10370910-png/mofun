"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import type { AssetCard, Grad } from "@/lib/types";

export type ToolKey = "enhance" | "erase" | "matting" | "expand" | "repair" | "vector";

/* 生成「文字矢量图」SVG 源码：把文字渲染成可缩放的 SVG（应用颜色与排版方向） */
function buildTextSvg(text: string, color: string, vertical: boolean): string {
  const chars = Array.from(text);
  const unit = 240; // 每字格子尺寸
  const gap = 24;
  const fontFamily = "STXingkai, 行楷, STKaiti, 楷体, serif";
  if (vertical) {
    const w = unit;
    const h = chars.length * unit + (chars.length - 1) * gap + 80;
    const glyphs = chars
      .map((c, i) => {
        const cy = 40 + i * (unit + gap) + unit / 2;
        return `  <text x="${w / 2}" y="${cy}" font-size="${unit}" fill="${color}" font-family="${fontFamily}" text-anchor="middle" dominant-baseline="central">${escapeXml(c)}</text>`;
      })
      .join("\n");
    return svgDoc(w, h, glyphs);
  }
  const w = chars.length * unit + (chars.length - 1) * gap + 80;
  const h = unit + 80;
  const glyphs = chars
    .map((c, i) => {
      const cx = 40 + i * (unit + gap) + unit / 2;
      return `  <text x="${cx}" y="${h / 2}" font-size="${unit}" fill="${color}" font-family="${fontFamily}" text-anchor="middle" dominant-baseline="central">${escapeXml(c)}</text>`;
    })
    .join("\n");
  return svgDoc(w, h, glyphs);
}

function svgDoc(w: number, h: number, inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${inner}
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

/* 把 SVG 源码转成可直接用于 <img src> 的 data URL（存入素材库的图片字段） */
function svgToDataUrl(svg: string): string {
  // 用 encodeURIComponent 处理中文，避免 btoa 对非 Latin1 字符报错
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* 触发浏览器下载一个文本文件（如 SVG） */
function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const TOOLS: { key: ToolKey; name: string; ico: "toolEnhance" | "toolErase" | "toolMatting" | "toolExpand" | "toolRepair" | "toolVector" }[] = [
  { key: "enhance", name: "AI变清晰", ico: "toolEnhance" },
  { key: "erase", name: "AI消除", ico: "toolErase" },
  { key: "matting", name: "AI抠图", ico: "toolMatting" },
  { key: "expand", name: "AI扩图", ico: "toolExpand" },
  { key: "repair", name: "细节修复", ico: "toolRepair" },
  { key: "vector", name: "转矢量", ico: "toolVector" },
];

/* 图片处理全屏工作台：左工具栏 + 中画布 + 右操作记录 + 底部按工具切换
   lockTo：锁定到某个工具（字体场景仅「转矢量」可用），其余工具禁用并提示 */
export function ImageWorkbench({
  text,
  grad,
  initialTool = "enhance",
  lockTo,
  color,
  vertical = false,
  onClose,
}: {
  text: string;
  grad: Grad;
  initialTool?: ToolKey;
  lockTo?: ToolKey;
  color?: string;
  vertical?: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const { addMaterial } = useLibrary();
  const [tool, setTool] = useState<ToolKey>(initialTool);
  // 字体颜色（默认黑）；对比原图时临时显示原始黑色
  const inkColor = color ?? "#111111";
  const [compare, setCompare] = useState(false);
  const shownColor = compare ? "#111111" : inkColor;
  // 转矢量结果：操作记录（转换生成）；记录带模型标记
  // 预置演示记录：进入即有转矢量结果可预览/另存/下载 SVG
  const [records, setRecords] = useState<{ id: number; svg: string; model: "basic" | "pro" }[]>([
    {
      id: -1,
      model: "basic",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#fff"/><text x="60" y="78" font-size="64" font-family="serif" font-weight="700" text-anchor="middle" fill="#111">茶</text></svg>`,
    },
    {
      id: -2,
      model: "pro",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#fff"/><circle cx="60" cy="60" r="40" fill="none" stroke="#111" stroke-width="4"/><text x="60" y="74" font-size="40" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#111">山</text></svg>`,
    },
  ]);
  // 已「保存为我的素材」的记录 id（避免重复存入素材库）
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [nextId, setNextId] = useState(1);
  const [sideCollapsed, setSideCollapsed] = useState(false);
  // 当前选中的记录卡片（点击高亮）
  const [selectedRec, setSelectedRec] = useState<number | null>(null);
  // 矢量模型选择（提升到此，供「开始转换」按钮判断是否已转换过该模型）
  const [vecModel, setVecModel] = useState<"basic" | "pro">("basic");
  const convertedModels = new Set(records.map((r) => r.model));

  // 生成当前文字的 SVG 矢量源码（应用当前颜色与方向）
  function currentSvg() {
    return buildTextSvg(text, inkColor, vertical);
  }
  // 「开始转换」：生成矢量结果并加入操作记录（同一模型已转换则忽略）
  function runConvert() {
    if (convertedModels.has(vecModel)) {
      toast("该模型已转换，请切换模型或查看记录", "warn");
      return;
    }
    const svg = currentSvg();
    setRecords((r) => [{ id: nextId, svg, model: vecModel }, ...r]);
    setNextId((n) => n + 1);
    toast("已生成矢量图，可保存或下载");
  }
  // 「保存为我的素材」：存入「仓库 · 我的素材」（同一条重复保存只存一次）
  function saveRecord(rec: { id: number; svg: string }) {
    if (savedIds.has(rec.id)) {
      toast("该矢量图已保存为我的素材");
      return;
    }
    setSavedIds((s) => new Set(s).add(rec.id));
    // 同步写入素材库：SVG 转 data URL 作为图片，供「仓库 · 我的素材」展示
    const material: AssetCard = {
      emoji: "🔤",
      grad: grad as AssetCard["grad"],
      kind: "素材",
      name: `${text || "矢量图"} · 矢量图`,
      sub: "品牌设计 · 转矢量",
      time: nowStamp(),
      img: svgToDataUrl(rec.svg),
    };
    addMaterial(material);
    toast("已保存为「仓库 · 我的素材」");
  }

  return (
    <div className="iw-root">
      {/* 顶栏 */}
      <header className="iw-top">
        <button className="iw-back" onClick={onClose}>
          <span className="iw-back-arrow">‹</span> 返回
        </button>
        <div className="iw-top-mid">
          {lockTo === "vector" ? (
            /* 字体场景：顶部中间仅展示当前「转矢量」工具，无重新上传/重置/对比 */
            <span className="iw-top-tool">
              <Icon name="toolVector" size={18} /> 转矢量
            </span>
          ) : (
            <>
              <button className="iw-top-act" onClick={() => toast("重新上传（演示）")}>
                <Icon name="plus" size={16} /> 重新上传
              </button>
              {tool !== "matting" && (
                <>
                  <button
                    className="iw-top-act"
                    onClick={() => {
                      setCompare(false);
                      toast("已恢复原图");
                    }}
                  >
                    <Icon name="refresh" size={16} /> 重置原图
                  </button>
                  {/* 对比原图：按下查看矢量化前的原始黑色字，松开恢复 */}
                  <button
                    className={compare ? "iw-top-act on" : "iw-top-act"}
                    onMouseDown={() => setCompare(true)}
                    onMouseUp={() => setCompare(false)}
                    onMouseLeave={() => setCompare(false)}
                    onClick={() => setCompare((v) => !v)}
                  >
                    <Icon name="image" size={16} /> 对比原图
                  </button>
                </>
              )}
            </>
          )}
        </div>
        <div className="iw-top-right">
          {/* 字体场景（lockTo 锁定）不提供「制作包装」与顶部「下载」（下载在记录卡片里） */}
          {!lockTo && (
            <>
              <button className="btn iw-btn-ghost" onClick={() => toast("制作包装（演示）")}>
                制作包装
              </button>
              <button className="btn iw-btn-dark" onClick={() => toast("已下载（演示）")}>
                下载
              </button>
            </>
          )}
        </div>
      </header>

      <div className="iw-body">
        {/* 左侧工具栏：字体场景（lockTo=vector）整体隐藏，转矢量已移到顶部中间 */}
        {lockTo !== "vector" && (
          <aside className="iw-rail">
            {TOOLS.map((t) => {
              const locked = !!lockTo && t.key !== lockTo;
              return (
                <button
                  key={t.key}
                  className={`iw-tool${tool === t.key ? " on" : ""}${locked ? " disabled" : ""}`}
                  aria-disabled={locked}
                  title={locked ? "该字体仅支持转矢量" : undefined}
                  onClick={() => (locked ? toast("当前字体仅支持转矢量操作", "warn") : setTool(t.key))}
                >
                  <Icon name={t.ico} size={22} />
                  <span>{t.name}</span>
                </button>
              );
            })}
          </aside>
        )}

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
              <span
                className={vertical ? "iw-canvas-text is-vertical" : "iw-canvas-text"}
                style={{ color: shownColor }}
              >
                {text}
              </span>
            </div>
          )}
        </main>

        {/* 右侧记录面板（可折叠） */}
        <aside className={sideCollapsed ? "iw-side is-collapsed" : "iw-side"}>
          <div className="iw-side-tabs">
            <span className="iw-side-tab on">历史记录</span>
            <button
              className={sideCollapsed ? "iw-side-collapse is-open" : "iw-side-collapse"}
              title={sideCollapsed ? "展开" : "收起"}
              onClick={() => setSideCollapsed((v) => !v)}
            >
              <Icon name="chevron" size={16} />
            </button>
          </div>
          {records.length === 0 ? (
            <div className="iw-side-empty">
              <div className="iw-empty-box">📦</div>
              <div className="iw-empty-text">暂无历史记录</div>
            </div>
          ) : (
            <div className="iw-side-list">
              {records.map((r) => (
                <div
                  key={r.id}
                  className={selectedRec === r.id ? "iw-rec is-selected" : "iw-rec"}
                  onClick={() => setSelectedRec(r.id)}
                >
                  <span className="iw-rec-tag">SVG</span>
                  <div className="iw-rec-thumb" dangerouslySetInnerHTML={{ __html: r.svg }} />
                  {/* 两个图标按钮：保存为我的素材 / 下载 */}
                  <div className="iw-rec-acts">
                    <button
                      className="iw-rec-act"
                      title="保存为我的素材"
                      aria-label="保存为我的素材"
                      onClick={(e) => {
                        e.stopPropagation();
                        saveRecord(r);
                      }}
                    >
                      <Icon name="share" size={16} />
                    </button>
                    <button
                      className="iw-rec-act"
                      title="下载"
                      aria-label="下载"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadTextFile(`${text || "矢量图"}-${r.id}.svg`, r.svg, "image/svg+xml");
                        toast("已下载 SVG 矢量文件");
                      }}
                    >
                      <Icon name="download" size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* 底部：按工具切换 */}
      <footer className="iw-foot">
        <ToolFooter
          tool={tool}
          toast={toast}
          onConvert={runConvert}
          vecModel={vecModel}
          setVecModel={setVecModel}
          convertDisabled={convertedModels.has(vecModel)}
        />
      </footer>
    </div>
  );
}

function ToolFooter({
  tool,
  toast,
  onConvert,
  vecModel,
  setVecModel,
  convertDisabled,
}: {
  tool: ToolKey;
  toast: (s: string) => void;
  onConvert: () => void;
  vecModel: "basic" | "pro";
  setVecModel: (m: "basic" | "pro") => void;
  convertDisabled: boolean;
}) {
  const [scale, setScale] = useState<"2x" | "4x">("4x");
  const [brush, setBrush] = useState(30);
  const [matModel, setMatModel] = useState("模型1");
  const [width, setWidth] = useState("1312");
  const [height, setHeight] = useState("800");

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
          <span className={vecModel === "basic" ? "iw-vec-dot on" : "iw-vec-dot"} /> 基础矢量模型
        </button>
        <button className={vecModel === "pro" ? "iw-vec-model on" : "iw-vec-model"} onClick={() => setVecModel("pro")}>
          <span className={vecModel === "pro" ? "iw-vec-dot on" : "iw-vec-dot"} /> 增强矢量模型 <span className="iw-vec-pro">pro</span>
        </button>
      </div>
      <button
        className={convertDisabled ? "iw-foot-go iw-foot-go-dark is-disabled" : "iw-foot-go iw-foot-go-dark"}
        disabled={convertDisabled}
        onClick={onConvert}
      >
        开始转换 <span className="iw-go-credit">{vecModel === "basic" ? "2" : "8"}算力/次</span>
      </button>
    </div>
  );
}
