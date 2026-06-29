"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { logoCats, logoCases, logoHistory } from "@/data/image";
import type { LogoHistoryGroup, LogoResult, AssetCard, LogoCase } from "@/lib/types";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import { LogoDownloadModal } from "./LogoDownloadModal";
import { ResultCardActions } from "./ResultCardActions";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { AutoBgImg } from "./AutoBgImg";
import { asset as assetUrl } from "@/lib/asset";

// 待删除目标：本次会话生成行（run）或静态历史行（hist，按组+行索引定位）
type DeleteTarget = { kind: "run"; id: string } | { kind: "hist"; gi: number; ii: number };

// 按生成时间算分组标题：今天 / 昨天 / 更早（月-日 时:分）
function groupLabel(time: string): string {
  const m = time.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return "今天";
  const [, y, mo, d, h, mi] = m;
  const that = new Date(Number(y), Number(mo) - 1, Number(d));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - that.getTime()) / 864e5);
  if (diffDays <= 0) return "今天";
  if (diffDays === 1) return "昨天";
  return `${mo}-${d} ${h}:${mi}`; // 更早：月-日 时:分
}

// 把本次会话生成行按分组标题归组（保持原有先后顺序）
function groupRuns(rows: LogoRunRow[]): [string, LogoRunRow[]][] {
  const order: string[] = [];
  const map = new Map<string, LogoRunRow[]>();
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

export interface LogoRunRow {
  id: string;
  prompt: string;
  style: string;
  desc?: string; // 当时用户填的创意描述
  time: string; // 生成时间（年月日时分）
  pct: number; // <100 加载中；100 完成
  results: LogoResult[];
}

/* logo 右侧画廊：生成历史（含内联加载进度）+ 参考灵感 */
export function LogoGallery({
  tab,
  setTab,
  runRows,
  onUseCase,
  onCopy,
  onDeleteRun,
}: {
  tab: "history" | "inspire";
  setTab: (t: "history" | "inspire") => void;
  runRows: LogoRunRow[];
  onUseCase: (c: LogoCase) => void;
  onCopy: (style: string, prompt: string) => void;
  onDeleteRun: (id: string) => void;
}) {
  const toast = useToast();
  const [onlyFav, setOnlyFav] = useState(false);
  const [cat, setCat] = useState("全部");
  // 预置演示历史：默认加载 logoHistory，保证进入即有完整生成历史可点击各功能
  const [history, setHistory] = useState<LogoHistoryGroup[]>(logoHistory);
  // 删除确认弹框的待删目标（null = 关闭）
  const [pending, setPending] = useState<DeleteTarget | null>(null);
  // 收藏：按结果唯一 key 记录，可切换并供「只看收藏」筛选
  const [favs, setFavs] = useState<Set<string>>(() => new Set());
  const isFav = (key: string) => favs.has(key);
  function toggleFav(key: string) {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function confirmDelete() {
    if (!pending) return;
    if (pending.kind === "run") {
      onDeleteRun(pending.id);
    } else {
      const { gi, ii } = pending;
      setHistory((prev) =>
        prev.map((g, i) => (i === gi ? { ...g, items: g.items.filter((_, j) => j !== ii) } : g))
      );
    }
    setPending(null);
    toast("已删除该记录");
  }

  const hasHistory = runRows.length > 0 || history.some((g) => g.items.length > 0);

  return (
    <>
      <div className="lg-head">
        <div className="tabs">
          <div className={tab === "history" ? "tab on" : "tab"} onClick={() => setTab("history")}>
            生成历史
          </div>
          <div className={tab === "inspire" ? "tab on" : "tab"} onClick={() => setTab("inspire")}>
            参考灵感
          </div>
        </div>
        {tab === "history" && (
          <label className="lg-fav-switch">
            <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} />
            <span className="lg-switch" />
            只看收藏
          </label>
        )}
      </div>

      {tab === "history" ? (
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
        <div id="logoHistory">
          {/* 本次会话新生成的（含进度行）置顶，按生成时间分组（今天/昨天/更早） */}
          {groupRuns(runRows).map(([label, rows]) => (
            <div className="lh-group" key={label}>
              <div className="lh-group-title">{label}</div>
              {rows.map((row) => (
                <LogoRunRowView
                  key={row.id}
                  row={row}
                  toast={toast}
                  onCopy={onCopy}
                  onDelete={() => setPending({ kind: "run", id: row.id })}
                  onlyFav={onlyFav}
                  isFav={isFav}
                  onToggleFav={toggleFav}
                />
              ))}
            </div>
          ))}
          {history.map((g: LogoHistoryGroup, gi) => {
            if (g.items.length === 0) return null;
            return (
              <div className="lh-group" key={g.group}>
                <div className="lh-group-title">{g.group}</div>
                {g.items.map((it, ii) => {
                  const shown = it.results
                    .map((r, i) => ({ r, i, key: `h-${gi}-${ii}-${i}` }))
                    .filter(({ key }) => !onlyFav || isFav(key));
                  if (onlyFav && shown.length === 0) return null;
                  return (
                    <div className="lh-row" key={ii}>
                      <div className="lh-meta">
                        <span className="lh-title">
                          <b className="lh-prompt">{it.prompt}</b>
                          {it.desc && <span className="lh-desc">{it.desc}</span>}
                        </span>
                        <span className="lg-cat">{it.style}</span>
                        <button className="lh-ico lh-tip" data-tip="复制" aria-label="复制" onClick={() => onCopy(it.style, it.prompt)}>
                          <Icon name="copy" size={14} />
                        </button>
                        <button className="lh-ico lh-tip" data-tip="删除" aria-label="删除" onClick={() => setPending({ kind: "hist", gi, ii })}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                      <div className="lh-imgs">
                        {shown.map(({ r, key }) => (
                          <LogoResultCard
                            key={key}
                            result={r}
                            toast={toast}
                            name={it.prompt}
                            fav={isFav(key)}
                            onToggleFav={() => toggleFav(key)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        )
      ) : (
        <div>
          <div className="filter-row" style={{ marginBottom: 16 }}>
            {logoCats.map((c) => (
              <span key={c} className={cat === c ? "sel-chip on" : "sel-chip"} onClick={() => setCat(c)}>
                {c}
              </span>
            ))}
          </div>
          <div className="inspo-grid">
            {logoCases
              .filter((c) => cat === "全部" || c.cat === cat)
              .map((c) => (
                <div className="lg-case" key={c.img ?? c.name} onClick={() => onUseCase(c)}>
                  <div className="lg-case-thumb">
                    {c.img ? (
                      <AutoBgImg className="lg-case-img" src={assetUrl(c.img)} alt={c.name} />
                    ) : (
                      <span className="lg-case-emoji">{c.emoji}</span>
                    )}
                    <div className="case-hover">
                      <button
                        className="btn btn-sm lg-case-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUseCase(c);
                        }}
                      >
                        制作同款
                      </button>
                    </div>
                  </div>
                  <div className="lg-case-foot">
                    <span className="lg-case-name">{c.name}</span>
                    <span className="lg-cat">{c.cat}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {pending && (
        <ConfirmModal
          title="确定删除这个记录吗？"
          onCancel={() => setPending(null)}
          onConfirm={confirmDelete}
        />
      )}
    </>
  );
}

function LogoRunRowView({
  row,
  toast,
  onCopy,
  onDelete,
  onlyFav,
  isFav,
  onToggleFav,
}: {
  row: LogoRunRow;
  toast: (s: string) => void;
  onCopy: (style: string, prompt: string) => void;
  onDelete: () => void;
  onlyFav: boolean;
  isFav: (key: string) => boolean;
  onToggleFav: (key: string) => void;
}) {
  const loading = row.pct < 100;
  const cells = row.results.map((r, i) => ({ r, i, key: `r-${row.id}-${i}` }));
  const shown = !loading && onlyFav ? cells.filter(({ key }) => isFav(key)) : cells;
  // 「只看收藏」下，已完成且无收藏结果的行整行隐藏
  if (!loading && onlyFav && shown.length === 0) return null;
  return (
    <div className="lh-row">
      <div className="lh-meta">
        <span className="lh-title">
          <b className="lh-prompt">{row.prompt}</b>
          {row.desc && <span className="lh-desc">{row.desc}</span>}
        </span>
        <span className="lg-cat">{row.style}</span>
        {!loading && (
          <>
            <button className="lh-ico lh-tip" data-tip="复制" aria-label="复制" onClick={() => onCopy(row.style, row.prompt)}>
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
        {shown.map(({ r, i, key }) =>
          loading ? (
            <div className={`lh-img ${r.grad} lh-loading`} key={i}>
              <span className="lh-progress">{row.pct}%完成</span>
              <span className="lh-think">
                <Icon name="sparkle" size={22} />
                <em>正在构思…</em>
              </span>
            </div>
          ) : (
            <LogoResultCard
              key={key}
              result={r}
              toast={toast}
              name={row.prompt}
              fav={isFav(key)}
              onToggleFav={() => onToggleFav(key)}
            />
          )
        )}
      </div>
    </div>
  );
}

function LogoResultCard({
  result,
  toast,
  name = "AI 生成 LOGO",
  fav = false,
  onToggleFav,
}: {
  result: LogoResult;
  toast: (s: string) => void;
  name?: string;
  fav?: boolean;
  onToggleFav?: () => void;
}) {
  const [showDownload, setShowDownload] = useState(false);
  const [zoom, setZoom] = useState(false); // 点击卡片（非按钮处）放大查看原图

  const asset = (kind: string): AssetCard => ({
    emoji: result.emoji,
    grad: result.grad as AssetCard["grad"],
    kind,
    name: `${name} · LOGO`,
    sub: "品牌设计 · logo",
    img: result.img,
    time: nowStamp(),
  });

  return (
    <div className={`lh-img ${result.grad}`} style={{ cursor: "zoom-in" }} onClick={() => setZoom(true)}>
      {result.img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="lh-result-img" src={assetUrl(result.img!)} alt={name} loading="lazy" />
      ) : (
        <span className="lh-emoji">{result.emoji}</span>
      )}
      <div className="lh-hover lh-hover-bottom">
        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setShowDownload(true); }}>
          下载可编辑文件
        </button>
      </div>
      {/* 收藏 + 另存为：全局通用组件（受控收藏，联动「只看收藏」筛选） */}
      <ResultCardActions asset={asset} fav={fav} onToggleFav={onToggleFav} />
      <span className="lh-mark">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lh-mark-logo" src={assetUrl("/brand-logo.png")} alt="魔方智绘" />
        由 AI 生成
      </span>
      {showDownload && (
        <LogoDownloadModal emoji={result.emoji} grad={result.grad} img={result.img} onClose={() => setShowDownload(false)} />
      )}
      {/* 放大查看：有真实图直接放大图片，否则用渐变大卡复刻 emoji */}
      {zoom && (
        <div className="img-zoom-mask" onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
          <button className="img-zoom-close" aria-label="关闭" onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
            <Icon name="close" size={22} />
          </button>
          {result.img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="img-zoom-img" src={assetUrl(result.img!)} alt={name} onClick={(e) => e.stopPropagation()} />
          ) : (
            <div className={`img-zoom-card ${result.grad}`} onClick={(e) => e.stopPropagation()}>
              <span className="izc-emoji">{result.emoji}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
