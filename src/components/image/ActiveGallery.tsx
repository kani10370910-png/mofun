"use client";

import { useState } from "react";
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

// 按生成时间分组标题：今天 / 昨天 / 更早
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
  return `${mo}-${d} ${h}:${mi}`;
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

/* 通用右侧画廊（活动 / 商拍 / 店招共用）：生成历史（进度卡 + 真图）+ 参考灵感。
   - source：参考灵感案例数据源（默认活动案例）
   - tab/setTab：受控 tab（父级在点「立即生成」时切到生成历史）
   - runRows：本次会话的生成行（进度 + 真图）
   - onDeleteRun / onCopyRun：删除、复制描述到左侧 */
export function ActiveGallery({
  sub,
  source,
  tab,
  setTab,
  runRows = [],
  onDeleteRun,
  onCopyRun,
  onUseCase,
  onPickCate,
}: {
  sub: string;
  source?: ActiveGalleryItem[];
  tab?: "history" | "cases";
  setTab?: (t: "history" | "cases") => void;
  runRows?: EventRunRow[];
  onDeleteRun?: (id: string) => void;
  onCopyRun?: (prompt: string) => void;
  onUseCase?: (it: ActiveGalleryItem) => void; // 套用模版：回填画面描述 + 成图类型 + 尺寸
  onPickCate?: (it: ActiveGalleryItem) => void; // 点卡片：左侧成图类型 + 尺寸跳到该卡（不填描述）
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
                    onlyFav={onlyFav}
                    favs={favs}
                    onToggleFav={toggleFav}
                    onCopy={() => onCopyRun?.(row.prompt)}
                    onDelete={() => setPendingDel(row.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        )
      ) : items.length > 0 ? (
        <div className="ag-grid">
          {items.map((it) => (
            <div
              className="ag-card"
              key={it.name}
              onClick={() => onPickCate?.(it)} // 点卡片：左侧成图类型 + 尺寸跳到该卡
              style={onPickCate ? { cursor: "pointer" } : undefined}
            >
              <div className={`ag-thumb ${it.grad}`}>
                <span className="ag-sub">{it.sub}</span>
                {it.img ? (
                  // 海报样张：按宽铺满直接展示（不走 AutoBgImg 智能裁切，那是给 logo 文字缩略用的）；
                  // 超高部分由 .ag-img 的 object-position 在 hover 时从上滚到下展示全图
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="ag-img" src={assetUrl(it.img)} alt={it.name} loading="lazy" />
                ) : (
                  <span className="ag-emoji">{it.emoji}</span>
                )}
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
              <div className="ag-name">{it.name}</div>
            </div>
          ))}
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
  onlyFav,
  favs,
  onToggleFav,
  onCopy,
  onDelete,
}: {
  row: EventRunRow;
  onlyFav: boolean;
  favs: Set<string>;
  onToggleFav: (key: string) => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const loading = row.pct < 100;
  // 完成后按收藏筛选；加载中不筛（保留进度占位）
  const cells = row.grads.map((g, i) => ({ g, i, key: `${row.id}-${i}` }));
  const shown = !loading && onlyFav ? cells.filter(({ key }) => favs.has(key)) : cells;
  // 「只看收藏」下整行无收藏则隐藏该行
  if (!loading && onlyFav && shown.length === 0) return null;
  return (
    <div className="lh-row">
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
                <em>正在构思…</em>
              </span>
            </div>
          ) : (
            <EventResultCard
              key={i}
              img={row.imgs[i]}
              grad={g}
              name={row.prompt}
              fav={favs.has(key)}
              onToggleFav={() => onToggleFav(key)}
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
}: {
  img?: string;
  grad: string;
  name: string;
  fav?: boolean;
  onToggleFav?: () => void;
}) {
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false); // 编辑器
  const [deepOpen, setDeepOpen] = useState(false); // 深度编辑（分层画布）
  const [zoom, setZoom] = useState(false); // 点击图片（非按钮处）放大预览

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
      onClick={() => setZoom(true)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lh-result-img" src={assetUrl(img)} alt="活动生成图" loading="lazy" />
      {/* hover 居中：编辑 / 深度编辑（点按钮不触发放大预览） */}
      <div className="lh-hover lh-hover-center">
        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}>编辑</button>
        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setDeepOpen(true); }}>深度编辑</button>
      </div>
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
      {editOpen && <ImageEditModal img={img} name={name} onClose={() => setEditOpen(false)} />}
      {deepOpen && <DeepEditModal img={img} name={name} onClose={() => setDeepOpen(false)} />}
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
