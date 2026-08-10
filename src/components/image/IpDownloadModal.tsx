"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import { imgToDataUrl, displaySrc } from "@/lib/image";
import { findWorkForSession, mergeBundleItem, primaryBundle } from "@/lib/workBundle";
import { buildWorkSummaryText } from "@/lib/workMeta";
import { IpPeriphModal } from "./IpPeriphModal";
import { PointsCost } from "@/components/ui/PointsCost";
import { POINT_COST, imageShotPoints } from "@/lib/pointCosts";

/* IP 设计生成信息弹窗（点「编辑/下载」弹出）：
   左侧大图预览（可放大），右侧：生成信息 + 图片处理（AI抠图/生成三视图）+ 生成周边入口 + 2K 高清下载。
   AI抠图、生成周边均为独立全屏工作台。 */

export function IpDownloadModal({
  img,
  name,
  desc,
  onClose,
}: {
  img?: string;
  name: string;
  desc?: string; // 延展内容/画面描述
  onClose: () => void;
}) {
  const toast = useToast();
  const { addWork, updateAsset, works } = useLibrary();
  const [zoom, setZoom] = useState(false);
  const [mattingBusy, setMattingBusy] = useState(false); // AI 抠图中（就地处理）
  const [periph, setPeriph] = useState(false); // 生成周边工作台
  const [tvBusy, setTvBusy] = useState(false); // 生成三视图中
  // 左侧大图：默认原图；点结果小图后切换为该图
  const [curImg, setCurImg] = useState<string | undefined>(img);
  // 图片处理结果（如三视图）：小图网格展示，第一格固定为原图
  // 预置演示结果：进入即有处理结果可预览/勾选/下载（借 poster-samples 真图当占位）
  const [results, setResults] = useState<{ id: string; label: string; url: string; loading: boolean; error?: boolean }[]>([
    { id: "seed-ipdl-1", label: "三视图", url: "/poster-samples/20260204165107990130xe92i6.jpg", loading: false },
    { id: "seed-ipdl-2", label: "抠图", url: "/poster-samples/202602041724199902428j5nhr.jpg", loading: false },
  ]);
  // 已勾选待下载的处理结果 id 集合（可批量下载）；原图用固定 id 参与勾选
  const ORIG_ID = "__original__";
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 把生成的图追加到同一次 IP 作品 bundle（无父作品则新建一条）
  function saveToWorks(url: string, label: string) {
    const parent = findWorkForSession(works, name);
    if (parent) {
      const bundle = mergeBundleItem(primaryBundle(parent), { label, img: url });
      updateAsset({ ...parent, bundle, updatedAt: new Date().toISOString() });
      return;
    }
    addWork({
      emoji: "🧸",
      grad: "thumb-grad-1",
      kind: "图片",
      name: `${name} · IP 设计`,
      sub: "品牌设计 · IP 设计",
      img: url,
      bundle: [{ label, img: url }],
      module: "image",
      time: nowStamp(),
      edit: {
        sub: "ip",
        title: name,
        input: desc?.trim() || name,
      },
      text: buildWorkSummaryText({
        sub: "ip",
        title: name,
        input: desc?.trim() || name,
      }),
    });
  }

  // 生成三视图：以当前 IP 图为参考（图生图），保持人物一致性，出正/侧/背三视图横排
  async function genThreeView() {
    if (tvBusy || !img) return;
    setTvBusy(true);
    // 先放一个 loading 占位到结果小图区
    const id = `tv-${Date.now()}`;
    setResults((prev) => [{ id, label: "三视图", url: "", loading: true }, ...prev]);
    try {
      const prompt =
        "保持与参考图完全相同的角色（相同发型、五官、服饰、配色、风格），" +
        "生成该角色的三视图：左为正面、中为侧面、右为背面，三个视图横向并排、统一比例与高度、" +
        "同一光照与配色，纯白背景，扁平插画风，不要文字标注。";
      // IP 图统一转 data URL 作参考图（本地 blob 也能图生图保一致）
      const refImage = await imgToDataUrl(img);
      const r = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, size: "2048x2048", ...(refImage ? { image: refImage } : {}) }),
      });
      const j = await r.json();
      const url = j?.images?.[0] as string | undefined;
      if (!r.ok || !url) throw new Error(j?.error || "生成失败");
      // 回填结果小图 + 切到左侧大图预览 + 存入「我的作品」
      setResults((prev) => prev.map((x) => (x.id === id ? { ...x, url, loading: false } : x)));
      setCurImg(url);
      saveToWorks(url, "三视图");
      toast("已生成三视图，已存入「仓库 · 我的作品」");
    } catch (e) {
      setResults((prev) => prev.map((x) => (x.id === id ? { ...x, loading: false, error: true } : x)));
      toast(`三视图生成失败：${(e as Error)?.message || "请重试"}`, "warn");
    } finally {
      setTvBusy(false);
    }
  }

  // AI 抠图：浏览器本地去背景（@imgly/background-removal，纯前端 WASM，无需 Key），
  // 结果（透明 PNG）直接进「处理结果」小图区 + 切到左侧大图，不再进独立工作台。
  async function runMatting() {
    if (mattingBusy || !img) return;
    setMattingBusy(true);
    const id = `cut-${Date.now()}`;
    setResults((prev) => [{ id, label: "抠图", url: "", loading: true }, ...prev]);
    try {
      // 原图同源可处理地址：blob/data 直接用；跨域图床走代理绕 CORS
      const srcUrl =
        img.startsWith("blob:") || img.startsWith("data:")
          ? img
          : `/api/proxy-image?url=${encodeURIComponent(img)}`;
      const srcBlob = await fetch(srcUrl).then((r) => {
        if (!r.ok) throw new Error("读取图片失败");
        return r.blob();
      });
      const { removeBackground } = await import("@imgly/background-removal");
      const cutout = await removeBackground(srcBlob);
      const outUrl = URL.createObjectURL(cutout);
      setResults((prev) => prev.map((x) => (x.id === id ? { ...x, url: outUrl, loading: false } : x)));
      setCurImg(outUrl);
      saveToWorks(outUrl, "抠图");
      toast("抠图完成，已存入「仓库 · 我的作品」");
    } catch (e) {
      setResults((prev) => prev.map((x) => (x.id === id ? { ...x, loading: false, error: true } : x)));
      toast(`抠图失败：${(e as Error)?.message || "请重试"}`, "warn");
    } finally {
      setMattingBusy(false);
    }
  }


  // 下载一张图：跨域 http(s) 图床走 /api/download 代理（加 attachment 头绕 CORS）；
  // 站内相对路径 / blob: / data: 是同源，直接下载并补上图片扩展名（否则会被路由当非法地址返回 JSON）
  function downloadUrl(url: string, label: string) {
    const safe = `${name || "ip"}-${label}-${Date.now()}`.replace(/[\\/:*?"<>|]/g, "_");
    const a = document.createElement("a");
    if (/^https?:\/\//i.test(url)) {
      a.href = `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(safe)}`;
      a.download = safe;
    } else {
      const path = url.split(/[?#]/)[0];
      const ext =
        path.match(/\.(png|jpe?g|webp|gif|svg)$/i)?.[1] ||
        url.match(/^data:image\/(png|jpe?g|webp|gif|svg\+xml)/i)?.[1]?.replace("+xml", "") ||
        "png";
      a.href = url;
      a.download = `${safe}.${ext.toLowerCase().replace("jpeg", "jpg")}`;
    }
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // 下载高清原图：始终下载 IP 原图（不随左侧预览切换）
  function downloadOriginal() {
    if (!img) return;
    downloadUrl(img, "2K原图");
    toast("已开始下载 2K 高清原图到本地");
  }

  // 批量下载勾选的图（原图 + 处理结果），逐个触发、间隔避免浏览器拦截连续下载
  function downloadSelected() {
    const items = results.filter((r) => r.url && selected.has(r.id));
    const withOrig = Boolean(img && selected.has(ORIG_ID));
    const total = items.length + (withOrig ? 1 : 0);
    if (total === 0) return;
    let i = 0;
    if (withOrig) { const orig = img as string; window.setTimeout(() => downloadUrl(orig, "原图"), i++ * 400); }
    items.forEach((r) => { window.setTimeout(() => downloadUrl(r.url, r.label), i++ * 400); });
    toast(`已开始下载 ${total} 张图到本地`);
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="ipdl-panel" onClick={(e) => e.stopPropagation()}>
        {/* 左：大图预览（点周边小图后切换为该图） */}
        <div className="ipdl-preview">
          {curImg ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="ipdl-preview-img" src={displaySrc(curImg)} alt={name} />
              <button className="ipdl-zoom" aria-label="放大查看" onClick={() => setZoom(true)}>
                <Icon name="toolExpand" size={18} />
              </button>
            </>
          ) : (
            <span className="ipdl-preview-ph">🧸</span>
          )}
          <span className="ipdl-mark">由 AI 生成</span>
        </div>

        {/* 右：生成信息 + 工具 + 下载 */}
        <div className="ipdl-info">
          <div className="ipdl-head">
            <div className="ipdl-title">IP设计生成信息</div>
            <button className="ipdl-close" aria-label="关闭" onClick={onClose}>
              <Icon name="close" size={22} />
            </button>
          </div>

          <div className="ipdl-scroll">
            <div className="ipdl-field">
              <div className="ipdl-label">IP图片：</div>
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ipdl-thumb" src={displaySrc(img)} alt={name} />
              ) : (
                <span className="ipdl-thumb ipdl-thumb-ph">🧸</span>
              )}
            </div>

            {desc && (
              <div className="ipdl-field">
                <div className="ipdl-label">延展内容：</div>
                <div className="ipdl-desc">{desc}</div>
              </div>
            )}

            {/* 图片处理：生成周边 + AI 抠图 + 生成三视图 */}
            <div className="ipdl-group">
              <div className="ipdl-group-title">图片处理</div>
              <div className="ipdl-tools">
                <button className="ipdl-tool" onClick={() => img && setPeriph(true)} disabled={!img}>
                  <Icon name="sparkle" size={20} />
                  <span>生成周边 <PointsCost amount={POINT_COST.imageIpPeriph} /></span>
                </button>
                <button className="ipdl-tool" onClick={runMatting} disabled={mattingBusy || !img}>
                  {mattingBusy ? <span className="dl-spinner" /> : <Icon name="toolMatting" size={20} />}
                  <span>{mattingBusy ? "抠图中…" : <>AI抠图 <PointsCost amount={POINT_COST.imageMatte} /></>}</span>
                </button>
                <button className="ipdl-tool" onClick={genThreeView} disabled={tvBusy || !img}>
                  {tvBusy ? <span className="dl-spinner" /> : <Icon name="toolExpand" size={20} />}
                  <span>{tvBusy ? "生成中…" : <>生成三视图 <PointsCost amount={imageShotPoints()} /></>}</span>
                </button>
              </div>
            </div>

            {/* 图片处理结果小图：第一格原图 + 生成的三视图等；点击切左侧大图 */}
            {(img || results.length > 0) && (
              <div className="ipdl-group">
                <div className="ipdl-group-title">处理结果</div>
                <div className="ipdl-result-grid">
                  {img && (
                    <div
                      className={`periph-cell${curImg === img ? " on" : ""}`}
                      onClick={() => setCurImg(img)}
                      title="点击预览：原图"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={displaySrc(img)} alt="原图" />
                      {/* 右上角勾选：原图也可选中，参与批量下载（点勾选不触发换图） */}
                      <span
                        className={`ipdl-check${selected.has(ORIG_ID) ? " on" : ""}`}
                        role="checkbox"
                        aria-checked={selected.has(ORIG_ID)}
                        aria-label="选择原图"
                        onClick={(e) => { e.stopPropagation(); toggleSelect(ORIG_ID); }}
                      >
                        {selected.has(ORIG_ID) && <Icon name="check" size={14} />}
                      </span>
                      <span className="periph-cell-tag">原图</span>
                    </div>
                  )}
                  {results.map((r) => (
                    <div
                      key={r.id}
                      className={`periph-cell${r.url && r.url === curImg ? " on" : ""}${!r.url ? " is-disabled" : ""}`}
                      onClick={() => r.url && setCurImg(r.url)}
                      title={r.url ? `点击预览：${r.label}` : r.label}
                    >
                      {r.loading ? (
                        <span className="periph-cell-load"><span className="dl-spinner" /></span>
                      ) : r.error ? (
                        <span className="periph-cell-ph">🖼️</span>
                      ) : (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={displaySrc(r.url)} alt={r.label} />
                          {/* 右上角勾选：选中后可批量下载（点勾选不触发换图） */}
                          <span
                            className={`ipdl-check${selected.has(r.id) ? " on" : ""}`}
                            role="checkbox"
                            aria-checked={selected.has(r.id)}
                            aria-label={`选择${r.label}`}
                            onClick={(e) => { e.stopPropagation(); toggleSelect(r.id); }}
                          >
                            {selected.has(r.id) && <Icon name="check" size={14} />}
                          </span>
                        </>
                      )}
                      <span className="periph-cell-tag">{r.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 底部两个常驻按钮：下载高清原图 + 下载勾选的处理结果 */}
          <div className="ipdl-foot">
            <div className="ipdl-foot-row">
              <button className="ipdl-download" onClick={downloadOriginal} disabled={!img}>
                <span className="ipdl-clear-tag">变清晰</span>
                下载高清原图
              </button>
              <button className="ipdl-foot-dl-sel" onClick={downloadSelected} disabled={selected.size === 0}>
                <Icon name="download" size={15} /> 下载选中（{selected.size}）
              </button>
            </div>
          </div>
        </div>

        {/* 放大预览（当前左侧大图） */}
        {zoom && curImg && (
          <div className="img-zoom-mask" onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
            <button className="img-zoom-close" aria-label="关闭" onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
              <Icon name="close" size={22} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="img-zoom-img" src={displaySrc(curImg)} alt={name} onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </div>

      {/* 生成周边工作台（以 IP 原图为参考保持角色一致） */}
      {periph && <IpPeriphModal img={img} name={name} onClose={() => setPeriph(false)} />}
    </div>
  );
}
