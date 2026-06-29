"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/data/icons";
import { useToast } from "@/components/ui/Toast";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import { imgToDataUrl, displaySrc } from "@/lib/image";
import { imageTools } from "@/data/image";
import { DeepEditModal } from "./DeepEditModal";

/* 活动图「编辑/下载」工作台（全屏，参考稿定/美图的图片编辑器）：
   - 顶栏：返回 / 重新上传 / 重置原图 / 对比原图 / 下载
   - 左侧：6 个工具竖栏（AI变清晰 / AI消除 / AI抠图 / AI扩图 / 细节修复 / 转矢量）
   - 中间：画布预览（扩图时显示裁剪框，抠图时左右对比）
   - 右侧：操作记录 / 保存记录 双 tab
   - 底部：随选中工具变化的操作区（放大倍数 / 画笔 / 抠图模型 / 宽高 / 矢量模型）
   能复用现有能力的工具接真 AI（抠图=WASM；变清晰/扩图/修复=图生图）；
   消除（涂抹）与转矢量先占位演示。 */

const toolIcon = (key: string): IconName =>
  ("tool" + key.charAt(0).toUpperCase() + key.slice(1)) as IconName;

// 走图生图的工具指令
const TOOL_PROMPT: Record<string, string> = {
  enhance: "在不改变画面内容的前提下，将这张图高清化：提升清晰度与细节锐度，去除噪点与模糊，保持原有构图与配色。",
  expand: "在不裁切主体的前提下，自然向外扩展这张图的画面边界，补全延展区域，保持风格、光影、配色一致。",
  repair: "修复画面中的瑕疵、模糊与破损区域，补全细节，使整体更精致自然，保持原有内容不变。",
};

interface OpRecord {
  id: string;
  label: string;
  url: string;
  loading: boolean;
  error?: boolean;
  fmt: "PNG" | "SVG"; // 格式角标
}

// 预置编辑历史演示：进入编辑器即有历史记录可另存/下载（借 poster-samples 真图当占位）
const SEED_RECORDS: OpRecord[] = [
  { id: "seed-rec-1", label: "AI变清晰", url: "/poster-samples/20260204165107990130xe92i6.jpg", loading: false, fmt: "PNG" },
  { id: "seed-rec-2", label: "AI扩图", url: "/poster-samples/202602041724199902428j5nhr.jpg", loading: false, fmt: "PNG" },
];

export function ImageEditModal({
  img,
  name,
  onClose,
}: {
  img?: string;
  name: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const { addWork, addMaterial } = useLibrary();
  const origImg = img; // 原图（重置用）
  const [curImg, setCurImg] = useState<string | undefined>(img); // 画布当前图
  const [active, setActive] = useState("enhance"); // 当前选中工具
  const [busy, setBusy] = useState(false);
  const [records, setRecords] = useState<OpRecord[]>(SEED_RECORDS);
  const [sideFold, setSideFold] = useState(false); // 历史记录面板折叠
  const [compare, setCompare] = useState(false); // 对比原图
  const [deepOpen, setDeepOpen] = useState(false); // 深度编辑（分层可编辑海报）

  // 各工具底部操作区参数
  const [scale, setScale] = useState<2 | 4>(2); // 变清晰放大倍数
  const [brush, setBrush] = useState(40); // 消除画笔粗细
  const [matModel, setMatModel] = useState(1); // 抠图模型 1-4
  const [expandW, setExpandW] = useState("2048"); // 扩图宽
  const [expandH, setExpandH] = useState("2048"); // 扩图高
  const [vecPro, setVecPro] = useState(true); // 转矢量：增强模型

  function saveToWorks(url: string, label: string) {
    addWork({
      emoji: "🎨",
      grad: "thumb-grad-1",
      kind: "图片",
      name: `${name.slice(0, 12) || "活动图"} · ${label}`,
      sub: "品牌设计 · 活动",
      img: url,
      time: nowStamp(),
    });
  }

  // AI 抠图：浏览器本地去背景（纯前端 WASM）
  async function runMatting(label: string) {
    const id = `cut-${records.length}`;
    setRecords((prev) => [{ id, label, url: "", loading: true, fmt: "PNG" }, ...prev]);
    const srcUrl =
      curImg!.startsWith("blob:") || curImg!.startsWith("data:")
        ? curImg!
        : `/api/proxy-image?url=${encodeURIComponent(curImg!)}`;
    const srcBlob = await fetch(srcUrl).then((r) => {
      if (!r.ok) throw new Error("读取图片失败");
      return r.blob();
    });
    const { removeBackground } = await import("@imgly/background-removal");
    const cutout = await removeBackground(srcBlob);
    const outUrl = URL.createObjectURL(cutout);
    setRecords((prev) => prev.map((x) => (x.id === id ? { ...x, url: outUrl, loading: false } : x)));
    setCurImg(outUrl);
    saveToWorks(outUrl, label);
  }

  // 图生图工具（变清晰/扩图/修复）：当前图作参考 + 指令；扩图带目标宽高比例提示
  async function runImg2Img(toolKey: string, label: string) {
    const id = `i2i-${records.length}`;
    setRecords((prev) => [{ id, label, url: "", loading: true, fmt: "PNG" }, ...prev]);
    const ref = await imgToDataUrl(curImg!);
    if (!ref) throw new Error("读取图片失败");
    let prompt = TOOL_PROMPT[toolKey];
    let size = "2048x2048";
    if (toolKey === "enhance") {
      prompt += `（放大约 ${scale} 倍输出）`;
    } else if (toolKey === "expand") {
      const w = Math.max(512, Number(expandW) || 2048);
      const h = Math.max(512, Number(expandH) || 2048);
      // 保持目标宽高比，放大到 ≥369 万像素
      const scl = Math.sqrt(3686400 / (w * h));
      const r8 = (n: number) => Math.ceil((n * Math.max(1, scl)) / 8) * 8;
      size = `${r8(w)}x${r8(h)}`;
      prompt += `（目标画面比例约 ${w}:${h}）`;
    }
    const r = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, size, image: ref }),
    });
    const j = await r.json();
    const url = (j?.images?.[0] as string) || "";
    if (!url) throw new Error(j?.error || "生成失败");
    setRecords((prev) => prev.map((x) => (x.id === id ? { ...x, url, loading: false } : x)));
    setCurImg(url);
    saveToWorks(url, label);
  }

  // 执行当前工具的「开始」操作
  async function runCurrent() {
    if (busy || !curImg) return;
    const tool = imageTools.find((t) => t.key === active);
    const label = tool?.name || "处理";
    if (active === "vector") {
      toast("转矢量功能即将上线（演示）");
      return;
    }
    if (active === "erase") {
      toast("请在图上涂抹要消除的区域后再开始（涂抹功能即将上线，演示）");
      return;
    }
    setBusy(true);
    try {
      if (active === "matting") await runMatting(label);
      else await runImg2Img(active, label);
      toast(`${label}完成，已存入「仓库 · 我的作品」`);
    } catch (e) {
      setRecords((prev) => {
        const idx = prev.findIndex((x) => x.loading);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], loading: false, error: true };
        return next;
      });
      toast(`${label}失败：${(e as Error)?.message || "请重试"}`, "warn");
    } finally {
      setBusy(false);
    }
  }

  function resetImg() {
    setCurImg(origImg);
    toast("已重置为原图");
  }

  // 下载指定图（历史记录每条用）：跨域走代理，data/blob 直下
  function downloadImg(url: string, label = "活动图") {
    if (!url) return;
    const filename = `${name || "活动图"}-${label}`.replace(/[\\/:*?"<>|]/g, "_");
    const href = url.startsWith("data:") || url.startsWith("blob:")
      ? url
      : `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(filename)}`;
    const a = document.createElement("a");
    a.href = href;
    a.download = `${filename}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("已开始下载");
  }

  // 另存某条记录图为「我的素材」
  function saveMaterial(url: string, label: string) {
    addMaterial({
      emoji: "🎨",
      grad: "thumb-grad-1",
      kind: "素材",
      name: `${name.slice(0, 12) || "活动图"} · ${label}`,
      sub: "品牌设计 · 活动",
      img: url,
      time: nowStamp(),
    });
    toast("已另存为「仓库 · 我的素材」");
  }

  const isMatting = active === "matting";

  return (
    <div className="imedit-mask" onClick={(e) => e.stopPropagation()}>
      <div className="imedit-shell">
        {/* 顶栏 */}
        <div className="imedit-head">
          <button className="imedit-head-btn imedit-head-left" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <Icon name="chevron" size={18} className="ico-rot90" /> 返回
          </button>
          <div className="imedit-head-center">
            <button className="imedit-head-btn" onClick={resetImg}>
              <Icon name="refresh" size={16} /> 重置原图
            </button>
            <button
              className={`imedit-head-btn ${compare ? "on" : ""}`}
              onMouseDown={() => setCompare(true)}
              onMouseUp={() => setCompare(false)}
              onMouseLeave={() => setCompare(false)}
            >
              <Icon name="image" size={16} /> 对比原图
            </button>
          </div>
          <div className="imedit-head-right">
            <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); setDeepOpen(true); }}>
              <Icon name="toolExpand" size={15} /> 深度编辑
            </button>
          </div>
        </div>

        <div className="imedit-body2">
          {/* 左侧工具栏 */}
          <aside className="imedit-tools">
            {imageTools.map((t) => (
              <button
                key={t.key}
                className={`imedit-tool ${active === t.key ? "on" : ""}`}
                disabled={busy}
                onClick={() => setActive(t.key)}
              >
                <Icon name={toolIcon(t.key)} size={22} />
                <span>{t.name}</span>
              </button>
            ))}
          </aside>

          {/* 中间画布 + 底部操作区 */}
          <div className="imedit-main">
            <div className={`imedit-canvas ${isMatting ? "is-matting" : ""}`}>
              {busy && (
                <div className="imedit-loading">
                  <span className="matting-spinner" />
                  <span>处理中…</span>
                </div>
              )}
              {isMatting ? (
                <div className="imedit-matting-cmp">
                  <div className="imedit-cmp-pane">
                    <span className="imedit-cmp-tag">原图</span>
                    {curImg && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="imedit-img" src={displaySrc(curImg)} alt={name} />
                    )}
                  </div>
                  <div className="imedit-cmp-pane imedit-cmp-transparent">
                    {records[0] && !records[0].loading && !records[0].error && records[0].url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="imedit-img" src={displaySrc(records[0].url)} alt="抠图结果" />
                    ) : (
                      <span className="imedit-cmp-hint">抠图结果将显示在这里</span>
                    )}
                  </div>
                </div>
              ) : compare && origImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="imedit-img" src={displaySrc(origImg)} alt="原图" />
              ) : curImg ? (
                active === "expand" ? (
                  // 扩图：用贴合图片的容器包住图片+裁剪框，框相对图片定位（略向外，示意向四周扩展）
                  <div className="imedit-expand-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="imedit-img" src={displaySrc(curImg)} alt={name} />
                    <div className="imedit-crop-frame" aria-hidden />
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="imedit-img" src={displaySrc(curImg)} alt={name} />
                )
              ) : (
                <span className="imedit-ph">🖼️</span>
              )}
            </div>

            {/* 底部操作区：随工具变化 */}
            <div className="imedit-actbar">
              {active === "enhance" && (
                <>
                  <span className="imedit-act-label">放大倍数</span>
                  <div className="seg imedit-seg">
                    <div className={scale === 2 ? "seg-item on" : "seg-item"} onClick={() => setScale(2)}>2X</div>
                    <div className={scale === 4 ? "seg-item on" : "seg-item"} onClick={() => setScale(4)}>4X</div>
                  </div>
                  <button className="btn imedit-go" disabled={busy} onClick={runCurrent}>开始放大</button>
                </>
              )}
              {active === "erase" && (
                <>
                  <span className="imedit-act-label">画笔粗细</span>
                  <input type="range" className="slider imedit-brush" min={10} max={100} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
                  <button className="btn imedit-go" disabled={busy} onClick={runCurrent}>开始消除</button>
                </>
              )}
              {active === "matting" && (
                <>
                  <span className="imedit-act-label">切换抠图模型：</span>
                  <div className="imedit-matmodels">
                    {[1, 2, 3, 4].map((m) => (
                      <button key={m} className={matModel === m ? "imedit-matmodel on" : "imedit-matmodel"} onClick={() => setMatModel(m)}>
                        模型{m}
                      </button>
                    ))}
                  </div>
                  <button className="btn imedit-go" disabled={busy} onClick={runCurrent}>开始抠图</button>
                </>
              )}
              {active === "expand" && (
                <>
                  <span className="imedit-act-label">宽度</span>
                  <input className="imedit-num" type="number" value={expandW} onChange={(e) => setExpandW(e.target.value)} />
                  <span className="imedit-act-label">高度</span>
                  <input className="imedit-num" type="number" value={expandH} onChange={(e) => setExpandH(e.target.value)} />
                  <button className="btn imedit-go" disabled={busy} onClick={runCurrent}>扩图</button>
                </>
              )}
              {active === "repair" && (
                <button className="btn imedit-go" disabled={busy} onClick={runCurrent}>开始修复</button>
              )}
              {active === "vector" && (
                <>
                  <button className={vecPro ? "imedit-vecmodel" : "imedit-vecmodel on"} onClick={() => setVecPro(false)}>基础矢量模型</button>
                  <button className={vecPro ? "imedit-vecmodel on" : "imedit-vecmodel"} onClick={() => setVecPro(true)}>增强矢量模型 <b>pro</b></button>
                  <button className="btn imedit-go" disabled={busy} onClick={runCurrent}>开始转换</button>
                </>
              )}
            </div>
          </div>

          {/* 右侧历史记录：单 tab + 折叠；每条卡带格式角标 + 另存为素材 / 下载 */}
          <aside className="imedit-side">
            <div className="imedit-side-head">
              <div className="imedit-side-title">历史记录</div>
              <button className="imedit-side-fold" onClick={() => setSideFold((v) => !v)} aria-label={sideFold ? "展开" : "收起"}>
                <Icon name="chevron" size={16} className={sideFold ? "" : "ico-rot180"} />
              </button>
            </div>
            {!sideFold && (
              records.length === 0 ? (
                <div className="imedit-side-empty">
                  <div className="imedit-side-empty-ico">📦</div>
                  暂无历史记录
                </div>
              ) : (
                <div className="imedit-side-list">
                  {records.map((r) => (
                    <div key={r.id} className="imedit-rec">
                      <div
                        className="imedit-rec-thumb"
                        onClick={() => !r.loading && !r.error && r.url && setCurImg(r.url)}
                        title={r.label}
                      >
                        {r.loading ? (
                          <span className="matting-spinner matting-spinner-sm" />
                        ) : r.error ? (
                          <span className="imedit-result-err">⚠️</span>
                        ) : (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={displaySrc(r.url)} alt={r.label} />
                            <span className="imedit-rec-fmt">{r.fmt}</span>
                          </>
                        )}
                      </div>
                      {!r.loading && !r.error && r.url && (
                        <div className="imedit-rec-acts">
                          <button className="imedit-rec-act lh-tip" data-tip="另存为素材" aria-label="另存为素材" onClick={() => saveMaterial(r.url, r.label)}>
                            <Icon name="share" size={15} />
                          </button>
                          <button className="imedit-rec-act lh-tip" data-tip="下载" aria-label="下载" onClick={() => downloadImg(r.url, r.label)}>
                            <Icon name="download" size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </aside>
        </div>
      </div>
      {deepOpen && <DeepEditModal img={curImg} name={name} onClose={() => setDeepOpen(false)} />}
    </div>
  );
}
