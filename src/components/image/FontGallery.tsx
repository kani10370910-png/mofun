"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { fontCases, fontStories, fontHistory } from "@/data/image";
import type { FontCase, FontStory, Grad, AssetCard, FontHistoryGroup } from "@/lib/types";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { FontEditModal } from "./FontEditModal";
import { AutoBgImg } from "./AutoBgImg";

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
  results: { grad: Grad }[];
}

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
  onUseCase,
  onUseStory,
  onCopy,
  onDeleteRun,
}: {
  tab: FontTab;
  setTab: (t: FontTab) => void;
  runRows: FontRunRow[];
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
  const cats = ["全部", "书法体", "现代体", "艺术体"];
  // 静态历史本地化为可删 state；按组定位行的删除
  const [history, setHistory] = useState<FontHistoryGroup[]>(() =>
    fontHistory.map((g) => ({ ...g, items: [...g.items] }))
  );
  // 删除确认弹框的待删目标（null = 关闭）
  const [pending, setPending] = useState<DeleteTarget | null>(null);
  // 收藏：按结果唯一 key 记录，可切换并供「只看收藏」筛选
  const [favs, setFavs] = useState<Set<string>>(() => {
    const init = new Set<string>();
    fontHistory.forEach((g, gi) =>
      g.items.forEach((it, ii) => it.results.forEach((r, i) => r.fav && init.add(`h-${gi}-${ii}-${i}`)))
    );
    return init;
  });
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
                            {it.desc && <span className="lh-desc">{it.desc}</span>}
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
                          {shown.map(({ r, key }) => (
                            <FontResultCard
                              key={key}
                              grad={r.grad}
                              text={it.text}
                              effect={it.effect}
                              dir={it.dir}
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
              .map((c, i) => (
                <div className="font-case" key={i} onClick={() => onUseCase(c)}>
                  <div className={c.img ? "font-case-thumb has-img" : "font-case-thumb"}>
                    {c.img ? (
                      <AutoBgImg className="font-case-img" src={c.img} alt={c.text} ratio={1.4} />
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
                  <img className="font-story-img" src={s.cover} alt={s.name} loading="lazy" />
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
        <div className="fe-modal-mask" onClick={() => setStoryView(null)}>
          <div className="fs-detail" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="fs-detail-img"
              src={storyView.introduce}
              alt={storyView.name}
              title="点击立即使用该字体"
              onClick={() => {
                onUseStory(storyView);
                setStoryView(null);
              }}
            />
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
  toast,
  onCopy,
  onDelete,
  onlyFav,
  isFav,
  onToggleFav,
}: {
  row: FontRunRow;
  toast: (s: string) => void;
  onCopy: (text: string, effect: string) => void;
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
          <b className="lh-prompt">{row.text}</b>
          {row.desc && <span className="lh-desc">{row.desc}</span>}
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
      <div className="lh-imgs">
        {shown.map(({ r, i, key }) =>
          loading ? (
            <div className={`lh-img ${r.grad} lh-loading`} key={i}>
              <span className="lh-progress">{row.pct}%完成</span>
              <span className="lh-think">
                <span className="font-spinner" />
                <em>{i === 0 ? "调配色彩…" : "正在构思…"}</em>
              </span>
            </div>
          ) : (
            <FontResultCard
              key={key}
              grad={r.grad}
              text={row.text}
              effect={row.effect}
              dir={row.dir}
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
  text,
  effect,
  dir,
  toast,
  fav = false,
  onToggleFav,
}: {
  grad: Grad;
  text: string;
  effect: string;
  dir: string;
  toast: (s: string) => void;
  fav?: boolean;
  onToggleFav?: () => void;
}) {
  const { addWork, addMaterial, toggleFavorite } = useLibrary();
  const [editOpen, setEditOpen] = useState(false);
  const asset = (kind: string): AssetCard => ({
    emoji: "🔤",
    grad: grad as AssetCard["grad"],
    kind,
    name: `${text} · 艺术字`,
    sub: "品牌设计 · AI字体",
    time: nowStamp(),
  });

  // 收藏：本地切换（控制「只看收藏」筛选）+ 同步写入仓库（存为作品并标记收藏）
  function handleToggleFav() {
    onToggleFav?.();
    const a = asset("图片");
    addWork(a); // 确保该字在「我的作品」里（已存在则去重忽略）
    toggleFavorite(a);
    toast(fav ? "已取消收藏" : "已收藏，可在「仓库 · 我的作品」用「只看收藏」筛选");
  }

  return (
    <div className={`lh-img ${grad}`}>
      <span className="lh-font-text">{text}</span>
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
      <div className="lh-hover">
        <button className="btn btn-ghost btn-sm" onClick={() => setEditOpen(true)}>
          编辑
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            addWork(asset("图片"));
            toast("已储存到「仓库 · 我的作品」");
          }}
        >
          储存到我的作品
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            addMaterial(asset("素材"));
            toast("已储存为「仓库 · 我的素材」");
          }}
        >
          储存为我的素材
        </button>
      </div>
      <span className="lh-mark">由 AI 生成</span>
      {editOpen && (
        <FontEditModal text={text} effect={effect} dir={dir} grad={grad} onClose={() => setEditOpen(false)} />
      )}
    </div>
  );
}
