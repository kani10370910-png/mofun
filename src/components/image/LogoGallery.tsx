"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
<<<<<<< HEAD
import { logoHistory, logoCats, logoCases } from "@/data/image";
=======
import { logoCats, logoCases } from "@/data/image";
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
import type { LogoHistoryGroup, LogoResult, AssetCard, LogoCase } from "@/lib/types";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import { LogoDownloadModal } from "./LogoDownloadModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
<<<<<<< HEAD
=======
import { AutoBgImg } from "./AutoBgImg";
import { asset as assetUrl } from "@/lib/asset";
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664

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
<<<<<<< HEAD
  // 静态历史本地化为可删 state；按组定位行的删除
  const [history, setHistory] = useState<LogoHistoryGroup[]>(() =>
    logoHistory.map((g) => ({ ...g, items: [...g.items] }))
  );
  // 删除确认弹框的待删目标（null = 关闭）
  const [pending, setPending] = useState<DeleteTarget | null>(null);
  // 收藏：按结果唯一 key 记录，可切换并供「只看收藏」筛选
  const [favs, setFavs] = useState<Set<string>>(() => {
    const init = new Set<string>();
    logoHistory.forEach((g, gi) =>
      g.items.forEach((it, ii) => it.results.forEach((r, i) => r.fav && init.add(`h-${gi}-${ii}-${i}`)))
    );
    return init;
  });
=======
  // 生成历史默认为空：用户未真实生成时显示空状态（演示数据 logoHistory 保留在数据层备用，不默认加载）
  const [history, setHistory] = useState<LogoHistoryGroup[]>([]);
  // 删除确认弹框的待删目标（null = 关闭）
  const [pending, setPending] = useState<DeleteTarget | null>(null);
  // 收藏：按结果唯一 key 记录，可切换并供「只看收藏」筛选
  const [favs, setFavs] = useState<Set<string>>(() => new Set());
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
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

<<<<<<< HEAD
=======
  const hasHistory = runRows.length > 0 || history.some((g) => g.items.length > 0);

>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
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
<<<<<<< HEAD
=======
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
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
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
<<<<<<< HEAD
=======
        )
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
      ) : (
        <div>
          <div className="filter-row" style={{ marginBottom: 16 }}>
            {logoCats.map((c) => (
              <span key={c} className={cat === c ? "sel-chip on" : "sel-chip"} onClick={() => setCat(c)}>
                {c}
              </span>
            ))}
          </div>
<<<<<<< HEAD
          <div className="grid grid-4">
=======
          <div className="inspo-grid">
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
            {logoCases
              .filter((c) => cat === "全部" || c.cat === cat)
              .map((c) => (
                <div className="lg-case" key={c.img ?? c.name} onClick={() => onUseCase(c)}>
                  <div className="lg-case-thumb">
                    {c.img ? (
<<<<<<< HEAD
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="lg-case-img" src={c.img} alt={c.name} loading="lazy" />
=======
                      <AutoBgImg className="lg-case-img" src={assetUrl(c.img)} alt={c.name} />
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
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
  const [confirmSave, setConfirmSave] = useState(false);
  const { addMaterial, addWork, toggleFavorite } = useLibrary();

  const asset = (kind: string): AssetCard => ({
    emoji: result.emoji,
    grad: result.grad as AssetCard["grad"],
    kind,
    name: `${name} · LOGO`,
    sub: "品牌设计 · logo",
    img: result.img,
    time: nowStamp(),
  });

  // 收藏：本地切换（控制「只看收藏」筛选）+ 同步写入仓库（存为作品并标记收藏）
  function handleToggleFav() {
    onToggleFav?.();
    const a = asset("图片");
    addWork(a); // 确保该图在「我的作品」里（已存在则去重忽略）
    toggleFavorite(a);
    toast(fav ? "已取消收藏" : "已收藏，可在「仓库 · 我的作品」用「只看收藏」筛选");
  }

  return (
    <div className={`lh-img ${result.grad}`}>
      {result.img ? (
        // eslint-disable-next-line @next/next/no-img-element
<<<<<<< HEAD
        <img className="lh-result-img" src={result.img} alt={name} loading="lazy" />
=======
        <img className="lh-result-img" src={assetUrl(result.img!)} alt={name} loading="lazy" />
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
      ) : (
        <span className="lh-emoji">{result.emoji}</span>
      )}
      {/* 右上角收藏按钮：hover 显示，点亮后可用「只看收藏」筛选 */}
      <button
        className={fav ? "lh-fav on" : "lh-fav"}
        title={fav ? "取消收藏" : "收藏"}
        onClick={(e) => {
          e.stopPropagation();
          handleToggleFav();
        }}
      >
        <Icon name="heart" size={15} />
      </button>
      <div className="lh-hover lh-hover-bottom">
        <button className="btn btn-ghost btn-sm" onClick={() => setShowDownload(true)}>
          下载可编辑文件
        </button>
      </div>
      {/* 右下角「另存为」图标按钮（hover 显示）：先弹确认框 */}
      <button
        className="lh-saveas"
        title="另存为我的素材"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmSave(true);
        }}
      >
        <Icon name="share" size={16} />
      </button>
      <span className="lh-mark">由 AI 生成</span>
      {confirmSave && (
        <ConfirmModal
          title="是否另存为我的素材？"
          cancelText="取消"
          confirmText="储存"
          onCancel={() => setConfirmSave(false)}
          onConfirm={() => {
            addMaterial(asset("素材"));
            setConfirmSave(false);
            toast("已另存为「仓库 · 我的素材」");
          }}
        />
      )}
      {showDownload && (
        <LogoDownloadModal emoji={result.emoji} grad={result.grad} img={result.img} onClose={() => setShowDownload(false)} />
      )}
    </div>
  );
}
