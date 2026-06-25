"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import type { AssetCard } from "@/lib/types";
import { MattingBrushEditor, type BrushApi } from "./MattingBrushEditor";

/* 加载图片为 HTMLImageElement（同源/已授权 CORS） */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("图片加载失败"));
    im.src = src;
  });
}

/* AI 抠图弹窗（全屏，演示）：
   - 顶栏：标题「AI 抠图」居中
   - 左：原图 ｜ 中：结果图（透明棋盘格）｜ 右：操作记录面板（参考 AI 字体·转矢量工作台）
   - 底部：智能识别 / 快速选择 / 开始抠图
   每次「开始抠图」生成一条记录（缩略图 + 保存为我的素材 / 下载），可点击选中切到结果图。
   当前图床网关无抠图 API，「开始抠图」走演示：转圈数秒后展示结果（用原图占位）。 */

const MODELS = ["模型1", "模型2", "模型3", "模型4"];

interface MattingRecord {
  id: number;
  model: string;
  url: string; // 抠图结果 URL（演示用原图）
}

export function IpMattingModal({
  img,
  name,
  onClose,
}: {
  img?: string;
  name: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const { addMaterial } = useLibrary();
  const [model, setModel] = useState(MODELS[0]);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [records, setRecords] = useState<MattingRecord[]>([]);
  const [selectedRec, setSelectedRec] = useState<number | null>(null);
  const [saved, setSaved] = useState<Set<number>>(() => new Set());
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [editing, setEditing] = useState(false); // 快速选择：画笔修整模式
  const [recog, setRecog] = useState<"smart" | "manual">("smart"); // 识别方式：智能识别 / 快速选择（仅高亮入口，不触发生成）
  const [editMask, setEditMask] = useState<HTMLCanvasElement | null>(null); // 进入修整时的初始蒙版
  const [brushApi, setBrushApi] = useState<BrushApi | null>(null); // 画笔工具控制（渲染在底栏）
  const idRef = useRef(1);
  const timer = useRef<number | null>(null);

  // 原图的同源可处理地址（blob/data 直接用；跨域走代理绕 CORS）
  const sameOriginSrc = !img
    ? ""
    : img.startsWith("blob:") || img.startsWith("data:")
    ? img
    : `/api/proxy-image?url=${encodeURIComponent(img)}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [onClose]);

  // 当前结果图：选中的记录优先，否则最近一条
  const current = records.find((r) => r.id === selectedRec) ?? records[records.length - 1];

  // 开始抠图：浏览器本地去背景（@imgly/background-removal，纯前端 WASM，无需任何 Key）。
  // 跨域图床图先经同源 /api/proxy-image 取成 blob（绕 CORS），本地 blob: 图直接用。
  async function startMatting() {
    if (phase === "running" || !img) return;
    setPhase("running");
    try {
      // 1) 取得可处理的图片源（同源 blob）
      const srcBlob = await fetch(sameOriginSrc).then((r) => {
        if (!r.ok) throw new Error("读取图片失败");
        return r.blob();
      });
      // 2) 本地去背景（首次会下载模型，稍慢）
      const { removeBackground } = await import("@imgly/background-removal");
      const cutout = await removeBackground(srcBlob);
      const outUrl = URL.createObjectURL(cutout);
      // 3) 生成一条记录并选中
      const id = idRef.current++;
      setRecords((prev) => [...prev, { id, model, url: outUrl }]);
      setSelectedRec(id);
      setPhase("done");
      toast("抠图完成");
    } catch (e) {
      setPhase("idle");
      toast(`抠图失败：${(e as Error)?.message || "请重试"}`, "warn");
    }
  }

  function pickModel(m: string) {
    setModel(m);
  }

  // 退出修整、回到智能识别模式
  function exitBrush() {
    setEditing(false);
    setRecog("smart");
    setBrushApi(null);
  }

  // 快速选择：进入画笔修整模式。若已有抠图结果，用其 alpha 作初始蒙版；否则空蒙版（全保留）
  async function enterBrush() {
    if (!img) return;
    setRecog("manual");
    let mask: HTMLCanvasElement | null = null;
    if (current?.url) {
      try {
        const cut = await loadImage(current.url);
        const c = document.createElement("canvas");
        c.width = cut.naturalWidth;
        c.height = cut.naturalHeight;
        c.getContext("2d")!.drawImage(cut, 0, 0);
        mask = c; // 透明 PNG 的 alpha 直接作蒙版
      } catch {
        mask = null;
      }
    }
    setEditMask(mask);
    setEditing(true);
  }

  // 修整产出的新透明结果：作为一条新记录并选中
  function onBrushResult(url: string) {
    setRecords((prev) => {
      // 编辑中实时更新最后一条「修整」记录，避免每涂一笔都新增
      const last = prev[prev.length - 1];
      if (last && last.model === "修整") {
        return prev.map((r) => (r.id === last.id ? { ...r, url } : r));
      }
      const id = idRef.current++;
      setSelectedRec(id);
      return [...prev, { id, model: "修整", url }];
    });
  }

  // 下载某条记录：抠图结果是本地 blob: URL（透明 PNG），直接锚点下载；
  // 万一是远程 URL 才走 /api/download 同源代理。
  function downloadRec(rec: MattingRecord) {
    const base = `${name || "ip"}-抠图-${rec.model}-${rec.id}`.replace(/[\\/:*?"<>|]/g, "_");
    const isLocal = rec.url.startsWith("blob:") || rec.url.startsWith("data:");
    const href = isLocal
      ? rec.url
      : `/api/download?url=${encodeURIComponent(rec.url)}&name=${encodeURIComponent(base)}`;
    const a = document.createElement("a");
    a.href = href;
    a.download = `${base}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("已开始下载抠图结果（透明 PNG）");
  }

  // 保存某条记录为我的素材
  function saveRec(rec: MattingRecord) {
    if (saved.has(rec.id)) {
      toast("该记录已保存到「我的素材」", "warn");
      return;
    }
    const card: AssetCard = {
      emoji: "✂️",
      grad: "thumb-grad-1",
      kind: "素材",
      name: `${name} · 抠图`,
      sub: "品牌设计 · IP 设计 · AI 抠图",
      img: rec.url,
      time: nowStamp(),
    };
    addMaterial(card);
    setSaved((prev) => new Set(prev).add(rec.id));
    toast("已保存到「仓库 · 我的素材」");
  }

  return (
    // 阻止冒泡：避免点击冒泡到外层「生成信息」弹窗的遮罩而把它一起关掉
    <div className="matting-mask" onClick={(e) => e.stopPropagation()}>
      <div className="matting-modal">
        {/* 顶栏：左上「返回」（仅关抠图、回到生成信息弹窗），标题居中，右上无 X */}
        <div className="matting-head">
          <button className="matting-back" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <Icon name="chevron" size={18} /> 返回
          </button>
          <div className="matting-title-center">AI 抠图</div>
        </div>

        {/* 三栏：原图 / 结果图 / 操作记录 */}
        <div className="matting-body">
          <div className="matting-pane">
            <span className="matting-tag">{editing ? "修整选区" : "原图"}</span>
            {editing && sameOriginSrc ? (
              <MattingBrushEditor imgSrc={sameOriginSrc} initialMaskCanvas={editMask} onResult={onBrushResult} onApi={setBrushApi} />
            ) : img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="matting-img" src={img} alt="原图" />
            ) : (
              <span className="matting-ph">🧸</span>
            )}
          </div>

          <div className="matting-pane matting-result">
            <span className="matting-tag">结果图</span>
            <div className="matting-checker">
              {phase === "running" ? (
                <div className="matting-loading">
                  <span className="matting-spinner" />
                  正在抠图…
                </div>
              ) : current ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="matting-img" src={current.url} alt="抠图结果" />
              ) : null}
            </div>
          </div>

          {/* 右侧操作记录面板（参考 AI 字体·转矢量工作台） */}
          <aside className={sideCollapsed ? "iw-side is-collapsed" : "iw-side"}>
            <div className="iw-side-tabs">
              <span className="iw-side-tab on">操作记录</span>
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
                <div className="iw-empty-text">暂无操作记录</div>
              </div>
            ) : (
              <div className="iw-side-list">
                {records.map((r) => (
                  <div
                    key={r.id}
                    className={selectedRec === r.id ? "iw-rec is-selected" : "iw-rec"}
                    onClick={() => setSelectedRec(r.id)}
                  >
                    <span className="iw-rec-tag">{r.model}</span>
                    <div className="iw-rec-thumb matting-rec-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.url} alt={`抠图结果 ${r.id}`} />
                    </div>
                    <div className="iw-rec-acts">
                      <button
                        className="iw-rec-act"
                        title="保存为我的素材"
                        aria-label="保存为我的素材"
                        onClick={(e) => {
                          e.stopPropagation();
                          saveRec(r);
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
                          downloadRec(r);
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

        {/* 底部：按模式切换。
            智能识别模式（默认）= 切换抠图模型 + 智能识别/快速选择/开始抠图；
            快速选择模式 = 画笔选区工具（增加/减少选区 + 撤销/重做/重置）+ 智能识别/快速选择切换 */}
        <footer className="iw-foot">
          {editing ? (
            <div className="iw-foot-row">
              {/* 画笔选区工具条 */}
              <div className="brush-bar in-foot">
                <button
                  className={brushApi?.mode === "add" ? "brush-mode add on" : "brush-mode add"}
                  onClick={() => brushApi?.setMode("add")}
                >
                  <span className="brush-dot add">+</span> 增加选区
                </button>
                <button
                  className={brushApi?.mode === "sub" ? "brush-mode sub on" : "brush-mode sub"}
                  onClick={() => brushApi?.setMode("sub")}
                >
                  <span className="brush-dot sub">−</span> 减少选区
                </button>
                <span className="brush-size">
                  <input
                    type="range"
                    min={8}
                    max={120}
                    value={brushApi?.brush ?? 40}
                    onChange={(e) => brushApi?.setBrush(Number(e.target.value))}
                  />
                </span>
              </div>
              <div className="brush-acts in-foot">
                <button className="brush-act" title="撤销" disabled={!brushApi?.canUndo} onClick={() => brushApi?.undo()}>
                  <Icon name="undo" size={16} />
                </button>
                <button className="brush-act" title="重做" disabled={!brushApi?.canRedo} onClick={() => brushApi?.redo()}>
                  <Icon name="redo" size={16} />
                </button>
                <button className="brush-act" title="重置" onClick={() => brushApi?.reset()}>
                  <Icon name="refresh" size={16} />
                </button>
              </div>
              <button className="iw-foot-soft-btn" onClick={exitBrush}>
                <Icon name="sparkle" size={15} /> 智能识别
              </button>
              <button className="iw-foot-soft-btn on" onClick={exitBrush}>
                <Icon name="search" size={15} /> 退出修整
              </button>
            </div>
          ) : (
            <div className="iw-foot-row">
              <span className="iw-foot-label">切换抠图模型：</span>
              <div className="iw-mat-models">
                {MODELS.map((m) => (
                  <button key={m} className={model === m ? "iw-mat-model on" : "iw-mat-model"} onClick={() => pickModel(m)}>
                    {m}
                  </button>
                ))}
              </div>
              <button
                className={recog === "smart" ? "iw-foot-soft-btn on" : "iw-foot-soft-btn"}
                onClick={() => { setRecog("smart"); setEditing(false); }}
                disabled={!img}
              >
                <Icon name="sparkle" size={15} /> 智能识别
              </button>
              <button className="iw-foot-soft-btn" onClick={enterBrush} disabled={!img}>
                <Icon name="search" size={15} /> 快速选择
              </button>
              <button
                className="iw-foot-go iw-foot-go-dark"
                onClick={startMatting}
                disabled={phase === "running" || !img}
              >
                {phase === "running" ? (
                  <><span className="matting-spinner matting-spinner-sm" /> 抠图中</>
                ) : (
                  <>开始抠图 <span className="iw-go-credit">2算力/次</span></>
                )}
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
