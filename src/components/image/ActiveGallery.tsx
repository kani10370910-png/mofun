"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { activeGalleryItems } from "@/data/image";
import type { ActiveGalleryItem, AssetCard } from "@/lib/types";
import { ResultCardActions } from "./ResultCardActions";
import { ClampText } from "@/components/ui/ClampText";
import { ImageEditModal } from "./ImageEditModal";
import { DeepEditModal } from "./DeepEditModal";
import { nowStamp } from "@/lib/datetime";
import { asset as assetUrl } from "@/lib/asset";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

/* 活动一次生成（文生图/图生图）的历史行：进度推进中 imgs 为空，完成后填入真图 URL */
export interface EventRunRow {
  id: string;
  prompt: string; // 画面描述（行头展示 + 复制）
  sub: string; // 成图子类（海报/长图/…）或「自定义」
  ratioName: string; // 图片比例名
  time: string;
  pct: number; // <100 加载中；100 完成
  imgs: string[]; // 生成的真图 URL（与 grads 等长，空串=该位失败）
  grads: string[];
  error?: string;
}

const EVENT_LOAD_PHASES = [
  "正在构思画面…",
  "AI 正在排版构图…",
  "细化视觉细节中，稍等片刻…",
  "即将完成，请耐心等待…",
];

// 按生成时间分组标题：今天 / 昨天 / 更早
function groupLabel(time: string): string {
  const m = time.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return "今天";
  const [, y, mo, d] = m;
  const that = new Date(Number(y), Number(mo) - 1, Number(d));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - that.getTime()) / 864e5);
  if (diffDays <= 0) return "今天";
  if (diffDays === 1) return "昨天";
  return `${y}-${mo}-${d}`;
}

function groupRuns(rows: EventRunRow[]): [string, EventRunRow[]][] {
  const order: string[] = [];
  const map = new Map<string, EventRunRow[]>();
  for (const r of rows) {
    const label = groupLabel(r.time);
    if (!map.has(label)) {
      map.set(label, []);
      order.push(label);
    }
    map.get(label)!.push(r);
  }
  return order.map((l) => [l, map.get(l)!]);
}

const CASE_IMG_CACHE_KEY = "mofun-case-imgs-v1";

function loadCaseImgCache(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CASE_IMG_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveCaseImgCache(map: Record<string, string>) {
  try {
    localStorage.setItem(CASE_IMG_CACHE_KEY, JSON.stringify(map));
  } catch { /* 存储满则跳过 */ }
}

async function generateCaseImage(prompt: string, w?: number, h?: number): Promise<string> {
  const size = w && h ? `${Math.max(w, 1024)}x${Math.max(h, 1024)}` : "2048x2048";
  const r = await fetch("/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ prompt, size }),
  });
  const j = (await r.json()) as { images?: string[]; error?: string };
  if (!r.ok) throw new Error(j.error || "生成失败");
  return j.images?.[0] || "";
}

/* 通用右侧画廊（活动 / 商拍 / 店招共用）：生成历史（进度卡 + 真图）+ 参考灵感。
   - source：参考灵感案例数据源（默认活动案例）
   - tab/setTab：受控 tab（父级在点「立即生成」时切到生成历史）
   - runRows：本次会话的生成行（进度 + 真图）
   - onDeleteRun / onCopyRun：删除、复制描述到左侧 */
export function ActiveGallery({
  sub,
  source,
  caseStyle,
  autoGenerateCases,
  tab,
  setTab,
  runRows = [],
  highlightId,
  onDeleteRun,
  onCopyRun,
  onUseCase,
  onPickCate,
  resultEdit = true,
}: {
  sub: string;
  source?: ActiveGalleryItem[];
  caseStyle?: "default" | "ip";
  autoGenerateCases?: boolean; // 参考灵感缺图时按 prompt 调文生图（商拍）
  tab?: "history" | "cases";
  setTab?: (t: "history" | "cases") => void;
  runRows?: EventRunRow[];
  highlightId?: string; // 二次编辑重建的记录 id，命中则高亮定位
  onDeleteRun?: (id: string) => void;
  onCopyRun?: (prompt: string) => void;
  onUseCase?: (it: ActiveGalleryItem) => void; // 套用模版：回填画面描述 + 成图类型 + 尺寸
  onPickCate?: (it: ActiveGalleryItem) => void; // 点卡片：左侧成图类型 + 尺寸跳到该卡（不填描述）
  resultEdit?: boolean; // 生成历史结果卡是否显示编辑/深度编辑（商拍关闭）
}) {
  const toast = useToast();
  const [innerTab, setInnerTab] = useState<"history" | "cases">("history");
  const curTab = tab ?? innerTab;
  const switchTab = setTab ?? setInnerTab;
  const [pendingDel, setPendingDel] = useState<string | null>(null);
  const [onlyFav, setOnlyFav] = useState(false);
  // 收藏：按图片唯一 key（行id + 图序号）记录，供「只看收藏」筛选
  const [favs, setFavs] = useState<Set<string>>(() => new Set());
  const toggleFav = (key: string) =>
    setFavs((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const all = source ?? activeGalleryItems;
  const items = sub ? all.filter((it) => it.sub === sub) : all;
  const hasHistory = runRows.length > 0;
  const [caseImgs, setCaseImgs] = useState<Record<string, string>>(() => loadCaseImgCache());
  const [caseLoading, setCaseLoading] = useState<Set<string>>(() => new Set());
  const caseAttempted = useRef<Set<string>>(new Set());
  const caseImgsRef = useRef(caseImgs);
  caseImgsRef.current = caseImgs;
  const itemNames = items.map((it) => it.name).join("|");

  // 商拍参考灵感：无静态图时按 prompt 串行调文生图，结果缓存到 localStorage
  useEffect(() => {
    if (!autoGenerateCases || curTab !== "cases") return;
    let cancelled = false;

    (async () => {
      for (const it of items) {
        if (cancelled) break;
        if (!it.prompt || it.img || caseImgsRef.current[it.name] || caseAttempted.current.has(it.name)) continue;
        caseAttempted.current.add(it.name);
        setCaseLoading((prev) => new Set(prev).add(it.name));
        try {
          const url = await generateCaseImage(it.prompt, it.w, it.h);
          if (cancelled || !url) {
            caseAttempted.current.delete(it.name);
            continue;
          }
          setCaseImgs((prev) => {
            const next = { ...prev, [it.name]: url };
            saveCaseImgCache(next);
            return next;
          });
        } catch {
          caseAttempted.current.delete(it.name);
        }
        setCaseLoading((prev) => {
          const next = new Set(prev);
          next.delete(it.name);
          return next;
        });
      }
    })();

    return () => { cancelled = true; };
  }, [autoGenerateCases, curTab, itemNames, items]);

  return (
    <>
      <div className="lg-head">
        <div className="tabs">
          <div className={curTab === "history" ? "tab on" : "tab"} onClick={() => switchTab("history")}>
            生成历史
          </div>
          <div className={curTab === "cases" ? "tab on" : "tab"} onClick={() => switchTab("cases")}>
            参考灵感
          </div>
        </div>
        {curTab === "history" && hasHistory && (
          <label className="lg-fav-switch">
            <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} />
            <span className="lg-switch" />
            只看收藏
          </label>
        )}
      </div>

      {curTab === "history" ? (
        !hasHistory ? (
          <div className="preview-empty">
            <div>
              <div className="pe-ico">
                <Icon name="image" size={42} />
              </div>
              还没有生成记录，填好左侧点「立即生成」试试
            </div>
          </div>
        ) : (
          <div>
            {groupRuns(runRows).map(([label, rows]) => (
              <div className="lh-group" key={label}>
                <div className="lh-group-title">{label}</div>
                {rows.map((row) => (
                  <EventRunRowView
                    key={row.id}
                    row={row}
                    highlight={row.id === highlightId}
                    onlyFav={onlyFav}
                    favs={favs}
                    onToggleFav={toggleFav}
                    onCopy={() => onCopyRun?.(row.prompt)}
                    onDelete={() => setPendingDel(row.id)}
                    resultEdit={resultEdit}
                  />
                ))}
              </div>
            ))}
          </div>
        )
      ) : items.length > 0 ? (
        <div className="ag-grid">
          {items.map((it) => {
            const caseImg = it.img || caseImgs[it.name];
            const loading = caseLoading.has(it.name);
            return (
            <div
              className={caseStyle === "ip" ? "ag-card ag-card-ip" : "ag-card"}
              key={it.name}
              onClick={() => onPickCate?.(it)} // 点卡片：左侧成图类型 + 尺寸跳到该卡
              style={onPickCate ? { cursor: "pointer" } : undefined}
            >
              <div className={`ag-thumb ${it.grad}`}>
                {caseStyle !== "ip" && <span className="ag-sub">{it.sub}</span>}
                {caseImg ? (
                  // 海报样张：按宽铺满直接展示（不走 AutoBgImg 智能裁切，那是给 logo 文字缩略用的）；
                  // 超高部分由 .ag-img 的 object-position 在 hover 时从上滚到下展示全图
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="ag-img" src={assetUrl(caseImg)} alt={it.name} loading="lazy" />
                ) : loading ? (
                  <span className="ag-case-loading">
                    <Icon name="sparkle" size={28} />
                    <em>AI 生成中…</em>
                  </span>
                ) : it.emoji ? (
                  <span className="ag-emoji">{it.emoji}</span>
                ) : null}
                <div className="case-hover">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={(e) => {
                      e.stopPropagation(); // 套用按钮不触发卡片的「只切类型」
                      if (onUseCase) {
                        onUseCase(it);
                        toast(`已套用「${it.name}」，描述与成图类型已填入左侧`);
                      } else {
                        toast(`套用「${it.name}」（演示）`);
                      }
                    }}
                  >
                    套用模版
                  </button>
                </div>
              </div>
              {caseStyle === "ip" ? (
                <div className="ag-ip-meta">
                  <div className="ag-ip-name">{it.name}</div>
                  <div className="ag-ip-sub">{it.sub}</div>
                </div>
              ) : (
                <div className="ag-name">{it.name}</div>
              )}
            </div>
          );})}
        </div>
      ) : (
        <div className="preview-empty">
          <div>该分类暂无案例</div>
        </div>
      )}

      {pendingDel && (
        <ConfirmModal
          title="确定删除这个记录吗？"
          onCancel={() => setPendingDel(null)}
          onConfirm={() => {
            onDeleteRun?.(pendingDel);
            setPendingDel(null);
            toast("已删除该记录");
          }}
        />
      )}
    </>
  );
}

/* 单条生成行：加载中显示进度占位，完成后显示真图卡；支持「只看收藏」筛选 */
function EventRunRowView({
  row,
  highlight,
  onlyFav,
  favs,
  onToggleFav,
  onCopy,
  onDelete,
  resultEdit = true,
}: {
  row: EventRunRow;
  highlight?: boolean;
  onlyFav: boolean;
  favs: Set<string>;
  onToggleFav: (key: string) => void;
  onCopy: () => void;
  onDelete: () => void;
  resultEdit?: boolean;
}) {
  const loading = row.pct < 100;
  const [phaseIdx, setPhaseIdx] = useState(0);
  useEffect(() => {
    if (!loading) return;
    const t = window.setInterval(() => setPhaseIdx((p) => (p + 1) % EVENT_LOAD_PHASES.length), 8_000);
    return () => window.clearInterval(t);
  }, [loading]);
  // 完成后按收藏筛选；加载中/错误行不筛（保留进度占位/错误展示）
  const cells = row.grads.map((g, i) => ({ g, i, key: `${row.id}-${i}` }));
  const shown = !loading && !row.error && onlyFav ? cells.filter(({ key }) => favs.has(key)) : cells;
  // 「只看收藏」下整行无收藏（且无错误）则隐藏该行
  if (!loading && !row.error && onlyFav && shown.length === 0) return null;
  return (
    <div className={`lh-row${highlight ? " reedit-hl" : ""}`} id={`imgrun-${row.id}`}>
      <div className="lh-meta">
        <span className="lh-title lh-title-clamp">
          <b className="lh-prompt"><ClampText text={row.prompt} lines={2} /></b>
        </span>
        <span className="lg-cat">{row.sub}</span>
        {!loading && (
          <>
            <button className="lh-ico lh-tip" data-tip="复制" aria-label="复制" onClick={onCopy}>
              <Icon name="copy" size={14} />
            </button>
            <button className="lh-ico lh-tip" data-tip="删除" aria-label="删除" onClick={onDelete}>
              <Icon name="trash" size={14} />
            </button>
            <span className="lh-time-spacer" aria-hidden />
            <span className="lh-time">{row.time}</span>
          </>
        )}
      </div>
      <div className="lh-imgs">
        {shown.map(({ g, i, key }) =>
          loading ? (
            <div className={`lh-img ${g} lh-loading`} key={i}>
              <span className="lh-progress">{row.pct}%完成</span>
              <span className="lh-think">
                <Icon name="sparkle" size={22} />
                <em>{EVENT_LOAD_PHASES[phaseIdx]}</em>
              </span>
            </div>
          ) : row.error ? (
            <div className={`lh-img ${g}`} key={i} style={{ display: "grid", placeItems: "center", padding: 12, textAlign: "center" }}>
              <span className="lh-fail">{row.error}</span>
            </div>
          ) : (
            <EventResultCard
              key={i}
              img={row.imgs[i]}
              grad={g}
              name={row.prompt}
              fav={favs.has(key)}
              onToggleFav={() => onToggleFav(key)}
              resultEdit={resultEdit}
            />
          )
        )}
      </div>
    </div>
  );
}

/* 结果卡：真图 + 编辑/下载（打开编辑工作台）+ 收藏/另存（通用组件），存入仓库 */
function EventResultCard({
  img,
  grad,
  name,
  fav,
  onToggleFav,
  resultEdit = true,
}: {
  img?: string;
  grad: string;
  name: string;
  fav?: boolean;
  onToggleFav?: () => void;
  resultEdit?: boolean;
}) {
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false); // 编辑器
  const [deepOpen, setDeepOpen] = useState(false); // 深度编辑（分层画布）
  const [zoom, setZoom] = useState(false); // 点击图片（非按钮处）放大预览
  const [imgError, setImgError] = useState(false); // 图片加载失败（URL 失效/超时）
  const [reloadKey, setReloadKey] = useState(0); // 强制重新加载图片

  const card = (kind: string): AssetCard => ({
    emoji: "🎨",
    grad: grad as AssetCard["grad"],
    kind,
    name: `${name.slice(0, 12) || "活动图"} · 活动`,
    sub: "品牌设计 · 活动",
    img,
    time: nowStamp(),
  });

  // 纯下载：远程图经代理拉取避免跨域，data/blob 直接下载
  async function handleDownload() {
    if (!img) return;
    try {
      const src = img.startsWith("data:") || img.startsWith("blob:") ? img : `/api/proxy-image?url=${encodeURIComponent(img)}`;
      const resp = await fetch(src);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.slice(0, 12) || "活动图"}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("已开始下载");
    } catch {
      toast("下载失败，请重试", "warn");
    }
  }

  // 生成失败的占位（该位无图）
  if (!img) {
    return (
      <div className={`lh-img ${grad}`} style={{ display: "grid", placeItems: "center" }}>
        <span className="lh-emoji" title="该张生成失败">⚠️</span>
      </div>
    );
  }

  return (
    <div
      className={`lh-img ev-result ${grad}`}
      style={{ cursor: "zoom-in" }}
      onClick={() => !imgError && setZoom(true)}
    >
      {!imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="lh-result-img"
          src={`${assetUrl(img)}${reloadKey ? `#r${reloadKey}` : ""}`}
          alt="活动生成图"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="lh-img-err" onClick={(e) => e.stopPropagation()}>
          <Icon name="image" size={28} />
          <span>图片加载失败</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={(e) => { e.stopPropagation(); setImgError(false); setReloadKey((k) => k + 1); }}
          >
            重新加载
          </button>
        </div>
      )}
      {/* hover 居中：编辑 / 深度编辑（活动模块；商拍不提供） */}
      {resultEdit && (
        <div className="lh-hover lh-hover-center">
          <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}>编辑</button>
          <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setDeepOpen(true); }}>深度编辑</button>
        </div>
      )}
      {/* 收藏 + 另存为（通用组件）：下载作为额外图标，排在另存为左边 */}
      <ResultCardActions
        asset={card}
        fav={fav}
        onToggleFav={onToggleFav}
        extraActions={
          <button
            className="lh-saveas lh-tip"
            data-tip="下载"
            aria-label="下载"
            onClick={(e) => { e.stopPropagation(); handleDownload(); }}
          >
            <Icon name="download" size={16} />
          </button>
        }
      />
      <span className="lh-mark">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lh-mark-logo" src={assetUrl("/brand-logo.png")} alt="魔方智绘" />
        由 AI 生成
      </span>
      {resultEdit && editOpen && <ImageEditModal img={img} name={name} onClose={() => setEditOpen(false)} />}
      {resultEdit && deepOpen && <DeepEditModal img={img} name={name} onClose={() => setDeepOpen(false)} />}
      {/* 点击图片放大预览：点遮罩或关闭按钮收起 */}
      {zoom && (
        <div className="img-zoom-mask" onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
          <button className="img-zoom-close" aria-label="关闭" onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
            <Icon name="close" size={22} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="img-zoom-img" src={assetUrl(img)} alt={name} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
