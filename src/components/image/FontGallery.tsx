"use client";

import { useState, useEffect } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { fontCases, fontStories, fontHistory } from "@/data/image";
import type { FontCase, FontStory, Grad, AssetCard, FontHistoryGroup } from "@/lib/types";
import { nowStamp } from "@/lib/datetime";
import { GeneratingSlot } from "@/components/ui/GeneratingSlot";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { FontEditModal } from "./FontEditModal";
import { ResultCardActions } from "./ResultCardActions";
import { AutoBgImg } from "./AutoBgImg";
import { asset as assetUrl } from "@/lib/asset";
import { trimImageMargin, fontDirFitRatio } from "@/lib/trimImageMargin";

type FontTab = "history" | "inspire" | "story";

// 待删除目标：本次会话生成行（run）或静态历史行（hist，按组+行索引定位）
type DeleteTarget = { kind: "run"; id: string } | { kind: "hist"; gi: number; ii: number };

export interface FontRunRow {
  id: string;
  text: string; // 文字内容
  effect: string; // 字体名
  dir: string; // 横向 / 竖向
  desc?: string; // 当时用户填的文字效果描述
  time: string; // 生成时间（年月日时分）
  pct: number; // <100 加载中；100 完成
  loadingPhase?: number; // 加载阶段（0-3），用于切换加载文案
  error?: string;
  results: { grad: Grad; img?: string }[];
}

// 按生成时间算分组标题：今天 / 昨天 / 更早（月-日 时:分）
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

// 把本次会话生成行按分组标题归组（保持原有先后顺序）
function groupRuns(rows: FontRunRow[]): [string, FontRunRow[]][] {
  const order: string[] = [];
  const map = new Map<string, FontRunRow[]>();
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

// 案例文字的展示风格：艺术体→立体潮酷，现代体→质感黑，书法体→行楷
function catStyle(cat: string): "art" | "modern" | "cal" {
  if (cat === "艺术体") return "art";
  if (cat === "现代体") return "modern";
  return "cal";
}

/* AI 字体右侧画廊：生成历史（含内联进度 + 只看收藏 + 时间分组 + 静态历史）/ 参考灵感 / 字体故事 */
export function FontGallery({
  tab,
  setTab,
  runRows,
  highlightId,
  onUseCase,
  onUseStory,
  onCopy,
  onDeleteRun,
}: {
  tab: FontTab;
  setTab: (t: FontTab) => void;
  runRows: FontRunRow[];
  highlightId?: string; // 二次编辑重建的记录 id，命中则高亮定位
  onUseCase: (c: FontCase) => void;
  onUseStory: (s: FontStory) => void;
  onCopy: (text: string, effect: string) => void;
  onDeleteRun: (id: string) => void;
}) {
  const toast = useToast();
  const [cat, setCat] = useState("全部");
  const [onlyFav, setOnlyFav] = useState(false);
  // 字体故事详情弹窗：当前查看的字体（null = 关闭）
  const [storyView, setStoryView] = useState<FontStory | null>(null);
  const [storyImgError, setStoryImgError] = useState(false);
  const cats = ["全部", "书法体", "现代体", "艺术体"];
  // 预置演示历史：默认加载 fontHistory，保证进入即有完整生成历史可点击各功能
  const [history, setHistory] = useState<FontHistoryGroup[]>(fontHistory);
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

  const hasHistory = runRows.length > 0 || history.some((g) => g.items.length > 0);

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
          <div className={tab === "story" ? "tab on" : "tab"} onClick={() => setTab("story")}>
            字体故事
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
        hasHistory ? (
          <div id="fontHistory">
            {/* 本次会话新生成的（含进度行）置顶，按生成时间分组（今天/昨天/更早） */}
            {groupRuns(runRows).map(([label, rows]) => (
              <div className="lh-group" key={label}>
                <div className="lh-group-title">{label}</div>
                {rows.map((row) => (
                  <FontRunRowView
                    key={row.id}
                    row={row}
                    highlight={row.id === highlightId}
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
            {history.map((g, gi) => {
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
                            <b className="lh-prompt">{it.text}</b>
                          </span>
                          <span className="lg-cat">{it.effect}</span>
                          <span className="lg-cat">{it.dir}</span>
                          <button className="lh-ico lh-tip" data-tip="复制" aria-label="复制" onClick={() => onCopy(it.text, it.effect)}>
                            <Icon name="copy" size={14} />
                          </button>
                          <button className="lh-ico lh-tip" data-tip="删除" aria-label="删除" onClick={() => setPending({ kind: "hist", gi, ii })}>
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                        <div className="lh-imgs">
                          {shown.map(({ r, key }, idx) => (
                            <FontResultCard
                              key={key}
                              grad={r.grad}
                              img={r.img}
                              text={it.text}
                              effect={it.effect}
                              dir={it.dir}
                              index={idx + 1}
                              toast={toast}
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
        ) : (
          <div className="preview-empty">
            <div>
              <div className="pe-ico">
                <Icon name="image" size={42} />
              </div>
              还没有生成记录，填好左侧点「立即生成」试试
            </div>
          </div>
        )
      ) : tab === "inspire" ? (
        <div>
          <div className="filter-row" style={{ marginBottom: 16 }}>
            {cats.map((c) => (
              <span key={c} className={cat === c ? "sel-chip on" : "sel-chip"} onClick={() => setCat(c)}>
                {c}
              </span>
            ))}
          </div>
          <div className="inspo-grid">
            {fontCases
              .filter((c) => cat === "全部" || c.cat === cat)
              .map((c) => (
                <div className="font-case" key={c.img ?? c.text} onClick={() => onUseCase(c)}>
                  <div className={c.img ? "font-case-thumb has-img" : "font-case-thumb"}>
                    {c.img ? (
                      <AutoBgImg className="font-case-img" src={assetUrl(c.img)} alt={c.text} ratio={1.4} />
                    ) : (
                      <span className={`font-case-text fc-${catStyle(c.cat)}`}>{c.text}</span>
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
                  <div className="font-case-foot">
                    <span className="font-case-name">{c.text}</span>
                    <span className="font-tag">{c.cat}</span>
                    <span className="font-tag">{c.tag}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-3">
          {fontStories.map((s) => (
            <div className="font-story" key={s.name}>
              <div
                className={s.cover ? "font-story-thumb has-img" : `font-story-thumb fs-scene-${s.scene}`}
                onClick={() => s.introduce && setStoryView(s)}
              >
                {s.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="font-story-img" src={assetUrl(s.cover!)} alt={s.name} loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                ) : (
                  <span className="font-story-title">{s.title}</span>
                )}
                {s.introduce && (
                  <div className="font-story-hover">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStoryView(s);
                      }}
                    >
                      查看详情
                    </button>
                  </div>
                )}
              </div>
              <div className="font-story-foot">
                <span className="font-story-name">{s.name}</span>
                <button className="font-story-btn" onClick={() => onUseStory(s)}>
                  立即使用
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 字体故事详情弹窗：introduce 图本身即完整版面，自适应图片尺寸干净展示 */}
      {storyView && (
        <div className="fe-modal-mask" onClick={() => { setStoryView(null); setStoryImgError(false); }}>
          <div className="fs-detail" onClick={(e) => e.stopPropagation()}>
            {storyImgError ? (
              <div className="fs-detail-err">
                <p>字体故事图片暂时无法加载</p>
                <button className="btn btn-ghost btn-sm" onClick={() => { setStoryView(null); setStoryImgError(false); }}>关闭</button>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="fs-detail-img"
                src={assetUrl(storyView.introduce!)}
                alt={storyView.name}
                title="点击立即使用该字体"
                onError={() => setStoryImgError(true)}
                onClick={() => {
                  onUseStory(storyView);
                  setStoryView(null);
                  setStoryImgError(false);
                }}
              />
            )}
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

function FontRunRowView({
  row,
  highlight,
  toast,
  onCopy,
  onDelete,
  onlyFav,
  isFav,
  onToggleFav,
}: {
  row: FontRunRow;
  highlight?: boolean;
  toast: (s: string) => void;
  onCopy: (text: string, effect: string) => void;
  onDelete: () => void;
  onlyFav: boolean;
  isFav: (key: string) => boolean;
  onToggleFav: (key: string) => void;
}) {
  const loading = row.pct < 100;
  const cells = row.results.map((r, i) => ({ r, i, key: `r-${row.id}-${i}` }));
  const shown = !loading && !row.error && onlyFav ? cells.filter(({ key }) => isFav(key)) : cells;
  // 「只看收藏」下，已完成且无收藏结果的行整行隐藏
  if (!loading && !row.error && onlyFav && shown.length === 0) return null;
  return (
    <div className={`lh-row${highlight ? " reedit-hl" : ""}`} id={`imgrun-${row.id}`}>
      <div className="lh-meta">
        <span className="lh-title">
          <b className="lh-prompt">{row.text}</b>
        </span>
        <span className="lg-cat">{row.effect}</span>
        <span className="lg-cat">{row.dir}</span>
        {!loading && (
          <>
            <button className="lh-ico lh-tip" data-tip="复制" aria-label="复制" onClick={() => onCopy(row.text, row.effect)}>
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
      <div className="lh-imgs lh-imgs-native">
        {shown.map(({ r, i, key }) =>
          loading ? (
            <div
              className={`font-hist-card ${row.dir.includes("竖") ? "is-vert" : ""}`}
              key={i}
            >
              <GeneratingSlot fill />
            </div>
          ) : row.error ? (
            <div
              className={`font-hist-card ${r.grad}`}
              key={i}
            >
              <div className="font-hist-card__ph">
                <span className="lh-fail">{row.error}</span>
              </div>
            </div>
          ) : (
            <FontResultCard
              key={key}
              grad={r.grad}
              img={r.img}
              text={row.text}
              effect={row.effect}
              dir={row.dir}
              index={i + 1}
              toast={toast}
              fav={isFav(key)}
              onToggleFav={() => onToggleFav(key)}
            />
          )
        )}
      </div>
    </div>
  );
}

function FontResultCard({
  grad,
  img,
  text,
  effect,
  dir,
  index = 1,
  toast,
  fav = false,
  onToggleFav,
}: {
  grad: Grad;
  img?: string;
  text: string;
  effect: string;
  dir: string;
  index?: number;
  toast: (s: string) => void;
  fav?: boolean;
  onToggleFav?: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [zoom, setZoom] = useState(false); // 点击卡片（非按钮处）放大查看原图
  const [imgError, setImgError] = useState(false);
  const [zoomError, setZoomError] = useState(false);
  /** 收白边后的预览；失败则退回原图 */
  const [tightSrc, setTightSrc] = useState<string | null>(null);
  const asset = (kind: string): AssetCard => ({
    emoji: "",
    grad: grad as AssetCard["grad"],
    kind,
    name: `${text} · 艺术字 ${index}`,
    sub: "品牌设计 · AI字体",
    module: "image",
    img: tightSrc || img,
    time: nowStamp(),
  });

  useEffect(() => {
    if (!img) {
      setTightSrc(null);
      return;
    }
    let cancelled = false;
    setTightSrc(null);
    trimImageMargin(img, { padRatio: 0.04, assetFn: assetUrl, fitRatio: fontDirFitRatio(dir) })
      .then((url) => {
        if (!cancelled) setTightSrc(url);
      })
      .catch(() => {
        if (!cancelled) setTightSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [img, dir]);

  const showSrc = tightSrc || (img ? assetUrl(img) : "");
  // 换色/下载优先用收边后贴回 5:3/3:5 的图
  const editImg = tightSrc || img;
  const isVert = dir.includes("竖");

  return (
    <div
      className={`font-hist-card${isVert ? " is-vert" : ""}`}
      onClick={() => {
        if (editOpen) return;
        setZoom(true);
      }}
    >
      {img && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="font-hist-card__img"
          src={showSrc}
          alt={text}
          loading="lazy"
          draggable={false}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className={`font-hist-card__ph ${grad}`}>
          <span className="lh-font-text">{text}</span>
        </div>
      )}
      <div className="lh-hover lh-hover-bottom">
        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}>
          换色/下载
        </button>
      </div>
      {/* 收藏 + 另存为：全局通用组件（受控收藏，联动「只看收藏」筛选） */}
      <ResultCardActions asset={asset} fav={fav} onToggleFav={onToggleFav} />
      <span className="lh-mark">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lh-mark-logo" src={assetUrl("/brand-logo.png")} alt="魔方智绘" />
        由 AI 生成
      </span>
      {editOpen && (
        <FontEditModal
          text={text}
          effect={effect}
          dir={dir}
          grad={grad}
          img={editImg}
          onClose={() => setEditOpen(false)}
        />
      )}
      {/* 放大查看：优先收边后的图 */}
      {zoom && (
        <div className="img-zoom-mask" onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
          <button className="img-zoom-close" aria-label="关闭" onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
            <Icon name="close" size={22} />
          </button>
          {img && !zoomError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="img-zoom-img" src={showSrc} alt={text} onClick={(e) => e.stopPropagation()} onError={() => setZoomError(true)} />
          ) : (
            <div className={`img-zoom-card ${grad}`} onClick={(e) => e.stopPropagation()}>
              <span className={`izc-text ${dir.includes("竖") ? "izc-vert" : ""}`}>{text}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
