"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import { ipExtendPresets, ipPresetPrompts } from "@/data/image";
import { imgToDataUrl, displaySrc } from "@/lib/image";
import { ClearableTextarea } from "@/components/ui/ClearableTextarea";

/* 生成周边工作台（全屏，仿 AI 抠图工作台）：
   - 顶栏：左上「返回」（回到 IP设计生成信息弹窗），标题「生成周边」居中
   - 左：当前预览大图（默认 IP 原图，点结果小图切换）
   - 右：周边品类多选 + 已生成结果小图（可勾选批量下载）
   - 底栏：生成周边 / 下载选中
   出图为图生图（以 IP 图为参考保持角色一致），成功后存入「仓库 · 我的作品」。 */

interface PeriphResult {
  id: string;
  label: string;
  url: string;
  loading: boolean;
  error?: boolean;
}

// 预置周边演示结果：进入即有已生成周边可预览/勾选/下载（借 poster-samples 真图当占位）
const SEED_PERIPH: PeriphResult[] = [
  { id: "seed-periph-1", label: "抱枕", url: "/poster-samples/20260204165107990130xe92i6.jpg", loading: false },
  { id: "seed-periph-2", label: "马克杯", url: "/poster-samples/202602041724199902428j5nhr.jpg", loading: false },
  { id: "seed-periph-3", label: "手提袋", url: "/poster-samples/20260205151245452052s6e2qk.jpg", loading: false },
];

export function IpPeriphModal({
  img,
  name,
  onClose,
}: {
  img?: string;
  name: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const { addWork } = useLibrary();

  // 周边预设品类（去掉「不使用预设」），默认选中第一个
  const presets = ipExtendPresets["周边"].filter((p) => p !== "不使用预设");
  const [picks, setPicks] = useState<Set<string>>(() => new Set([presets[0]]));
  // 「不使用预设」：开启后展示自定义文本框，用其内容作为自定义周边品类生成
  const [customOn, setCustomOn] = useState(false);
  const [customDesc, setCustomDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PeriphResult[]>(SEED_PERIPH);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // 当前预览大图：默认 IP 原图，点结果小图后切换
  const [curImg, setCurImg] = useState<string | undefined>(img);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 存入「仓库 · 我的作品」
  function saveToWorks(url: string, label: string) {
    addWork({
      emoji: "🧸",
      grad: "thumb-grad-1",
      kind: "图片",
      name: `${name} · ${label}`,
      sub: "品牌设计 · IP 设计",
      img: url,
      time: nowStamp(),
    });
  }

  // 选预设品类与「不使用预设」互斥：选品类则关闭自定义
  function togglePick(p: string) {
    setCustomOn(false);
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  // 切换「不使用预设」：开启时清空预设品类选择（互斥）
  function toggleCustom() {
    setCustomOn((on) => {
      const next = !on;
      if (next) setPicks(new Set());
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 下载一张图（走 /api/download 同源代理）
  function downloadUrl(url: string, label: string) {
    const filename = `${name || "ip"}-${label}-${Date.now()}`.replace(/[\\/:*?"<>|]/g, "_");
    const href = `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(filename)}`;
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // 下载所有勾选的周边图（逐个触发，间隔避免浏览器拦截连续下载）
  function downloadSelected() {
    const items = results.filter((r) => r.url && selected.has(r.id));
    if (items.length === 0) return;
    items.forEach((r, i) => {
      window.setTimeout(() => downloadUrl(r.url, r.label), i * 400);
    });
    toast(`已开始下载 ${items.length} 张周边图到本地`);
  }

  // 单张周边出图：图生图（以 IP 图为参考保持角色一致）→ 出周边产品图，失败重试避免限流
  // custom 为真时 category 是用户自定义描述（无预设提示词）
  async function genOnePeriph(category: string, refImage?: string, custom = false): Promise<string> {
    const parts = [
      `将参考图中的 IP 形象制作成「${category}」周边产品。` +
        `【人物一致性要求】周边上的角色形象必须与参考图完全一致：相同的脸型、五官、表情、发型与发色、` +
        `服饰与配色、整体风格，不得更换人物、不得改变性别与年龄`,
      `产品形态：真实的「${category}」实物商品，IP 形象作为印制/造型主体，居中清晰呈现`,
    ];
    // 预设品类附带其预设提示词；自定义描述直接用 category 文本，不查预设
    const pre = custom ? "" : ipPresetPrompts["周边"]?.[category];
    if (pre) parts.push(pre);
    parts.push("纯净浅色背景，电商产品图风格，单个产品，无多余文字水印");
    const prompt = parts.join("；");
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, size: "2048x2048", ...(refImage ? { image: refImage } : {}) }),
        });
        const j = await r.json();
        const url = (j?.images?.[0] as string) || "";
        if (url) return url;
      } catch {
        /* 落到重试 */
      }
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
    }
    return "";
  }

  // 点「生成周边」：对所选预设品类 +（开启「不使用预设」时）自定义描述逐个出图
  async function genPeriph() {
    if (busy) return;
    const chosen = presets.filter((p) => picks.has(p));
    // 待生成任务：预设品类 + 自定义项（label 用于展示，custom 标记走自定义提示词）
    const tasks: { label: string; custom: boolean }[] = chosen.map((label) => ({ label, custom: false }));
    if (customOn && customDesc.trim()) {
      tasks.push({ label: customDesc.trim().slice(0, 8), custom: true });
    }
    if (tasks.length === 0) {
      toast(customOn ? "请填写自定义周边描述，或选择一个品类！" : "请至少选择一个周边品类！", "warn");
      return;
    }
    setBusy(true);
    const refImage = img ? await imgToDataUrl(img) : "";
    if (!refImage) toast("参考图读取失败，周边可能与 IP 形象不一致", "warn");
    const rows: (PeriphResult & { custom: boolean; text: string })[] = tasks.map((t, i) => ({
      id: `periph-${Date.now()}-${i}`,
      label: t.label,
      url: "",
      loading: true,
      custom: t.custom,
      text: t.custom ? customDesc.trim() : t.label,
    }));
    setResults((prev) => [...rows, ...prev]);

    // 串行逐个出图（并发会限流），实时回填
    for (const row of rows) {
      const url = await genOnePeriph(row.text, refImage || undefined, row.custom);
      setResults((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, url, loading: false, error: !url } : r)),
      );
      if (url) {
        saveToWorks(url, `周边·${row.label}`);
        setCurImg(url); // 实时把最新成功的图切到左侧预览
      }
    }
    setBusy(false);
    toast("周边生成完成，已存入「仓库 · 我的作品」");
  }

  return (
    <div className="matting-mask" onClick={(e) => e.stopPropagation()}>
      <div className="matting-modal">
        {/* 顶栏：左上「返回」，标题居中 */}
        <div className="matting-head">
          <button className="matting-back" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <Icon name="chevron" size={18} /> 返回
          </button>
          <div className="matting-title-center">生成周边</div>
        </div>

        {/* 主体：左预览大图 / 右品类与结果 */}
        <div className="matting-body periph-body">
          <div className="matting-pane">
            <span className="matting-tag">预览</span>
            {curImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="matting-img" src={displaySrc(curImg)} alt={name} />
            ) : (
              <span className="matting-ph">🧸</span>
            )}
          </div>

          {/* 右侧：品类多选 + 结果小图 */}
          <aside className="periph-side">
            <div className="periph-side-title">周边品类（可多选）</div>
            <div className="periph-pres-row">
              {presets.map((p) => (
                <button key={p} className={picks.has(p) ? "periph-pres on" : "periph-pres"} onClick={() => togglePick(p)}>
                  {p}
                </button>
              ))}
              {/* 不使用预设：开启后弹出自定义文本框，并清空预设品类（互斥） */}
              <button className={customOn ? "periph-pres on" : "periph-pres"} onClick={toggleCustom}>
                不使用预设
              </button>
            </div>

            {/* 自定义周边描述（「不使用预设」开启时显示，样式同创意描述） */}
            {customOn && (
              <div className="periph-custom">
                <ClearableTextarea
                  className="ip-desc"
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  onClear={() => setCustomDesc("")}
                  placeholder="描述想要的周边，例如：帆布袋、T恤、亚克力立牌…"
                />
              </div>
            )}

            <div className="periph-side-title">生成结果</div>
            {img || results.length > 0 ? (
              <div className="periph-grid">
                {/* 第一格：IP 原图 */}
                {img && (
                  <button
                    className={`periph-cell${curImg === img ? " on" : ""}`}
                    onClick={() => setCurImg(img)}
                    title="点击预览：原图"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={displaySrc(img)} alt="原图" />
                    <span className="periph-cell-tag">原图</span>
                  </button>
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
                        <span
                          className={`ipdl-check${selected.has(r.id) ? " on" : ""}`}
                          role="checkbox"
                          aria-checked={selected.has(r.id)}
                          aria-label={`选择${r.label}`}
                          onClick={(e) => { e.stopPropagation(); toggleSelect(r.id); }}
                        >
                          {selected.has(r.id) && <Icon name="check" size={16} />}
                        </span>
                      </>
                    )}
                    <span className="periph-cell-tag">{r.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="periph-empty">
                <div className="iw-empty-box">📦</div>
                <div className="iw-empty-text">选择品类后点「生成周边」</div>
              </div>
            )}

            {/* 面板底部：生成周边 + 下载，并排横放 */}
            <div className="periph-foot-row">
              <button className="ipdl-foot-gen" onClick={genPeriph} disabled={busy}>
                {busy ? (
                  <><span className="dl-spinner" /> 正在生成…</>
                ) : (
                  <><Icon name="sparkle" size={15} /> 生成周边 <span className="ipdl-ext-credit">80算力</span></>
                )}
              </button>
              <button className="ipdl-foot-dl-sel" onClick={downloadSelected} disabled={selected.size === 0}>
                <Icon name="download" size={15} /> 下载{selected.size > 0 ? `（${selected.size}）` : ""}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
