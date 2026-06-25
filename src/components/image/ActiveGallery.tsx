"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { activeGalleryItems } from "@/data/image";
import type { ActiveGalleryItem, AssetCard } from "@/lib/types";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import { asset as assetUrl } from "@/lib/asset";
import { AutoBgImg } from "./AutoBgImg";
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
}: {
  sub: string;
  source?: ActiveGalleryItem[];
  tab?: "history" | "cases";
  setTab?: (t: "history" | "cases") => void;
  runRows?: EventRunRow[];
  onDeleteRun?: (id: string) => void;
  onCopyRun?: (prompt: string) => void;
}) {
  const toast = useToast();
  const [innerTab, setInnerTab] = useState<"history" | "cases">("history");
  const curTab = tab ?? innerTab;
  const switchTab = setTab ?? setInnerTab;
  const [pendingDel, setPendingDel] = useState<string | null>(null);

  const all = source ?? activeGalleryItems;
  const items = sub ? all.filter((it) => it.sub === sub) : all;
  const hasHistory = runRows.length > 0;

  return (
    <>
      <div className="tabs">
        <div className={curTab === "history" ? "tab on" : "tab"} onClick={() => switchTab("history")}>
          生成历史
        </div>
        <div className={curTab === "cases" ? "tab on" : "tab"} onClick={() => switchTab("cases")}>
          参考灵感
        </div>
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
            <div className="ag-card" key={it.name}>
              <div className={`ag-thumb ${it.grad}`}>
                <span className="ag-sub">{it.sub}</span>
                {it.img ? (
                  <AutoBgImg className="ag-img" src={assetUrl(it.img)} alt={it.name} />
                ) : (
                  <span className="ag-emoji">{it.emoji}</span>
                )}
                <div className="case-hover">
                  <button className="btn btn-primary btn-sm" onClick={() => toast(`套用「${it.name}」（演示）`)}>
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

/* 单条生成行：加载中显示进度占位，完成后显示真图卡 */
function EventRunRowView({
  row,
  onCopy,
  onDelete,
}: {
  row: EventRunRow;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const loading = row.pct < 100;
  return (
    <div className="lh-row">
      <div className="lh-meta">
        <span className="lh-title">
          <b className="lh-prompt">{row.prompt}</b>
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
        {row.grads.map((g, i) =>
          loading ? (
            <div className={`lh-img ${g} lh-loading`} key={i}>
              <span className="lh-progress">{row.pct}%完成</span>
              <span className="lh-think">
                <Icon name="sparkle" size={22} />
                <em>正在构思…</em>
              </span>
            </div>
          ) : (
            <EventResultCard key={i} img={row.imgs[i]} grad={g} name={row.prompt} />
          )
        )}
      </div>
    </div>
  );
}

/* 结果卡：真图 + 收藏 / 下载 / 另存为素材，存入仓库 */
function EventResultCard({ img, grad, name }: { img?: string; grad: string; name: string }) {
  const toast = useToast();
  const { addMaterial, addWork, toggleFavorite } = useLibrary();
  const [fav, setFav] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);

  const card = (kind: string): AssetCard => ({
    emoji: "🎨",
    grad: grad as AssetCard["grad"],
    kind,
    name: `${name.slice(0, 12) || "活动图"} · 活动`,
    sub: "品牌设计 · 活动",
    img,
    time: nowStamp(),
  });

  function handleFav() {
    setFav((v) => !v);
    const a = card("图片");
    addWork(a);
    toggleFavorite(a);
    toast(fav ? "已取消收藏" : "已收藏，可在「仓库 · 我的作品」查看");
  }

  // 下载真图：远程图经代理拉取避免跨域，data URL 直接下载
  async function handleDownload() {
    if (!img) return;
    try {
      const src = img.startsWith("data:") ? img : `/api/proxy-image?url=${encodeURIComponent(img)}`;
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
    <div className={`lh-img ev-result ${grad}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lh-result-img" src={assetUrl(img)} alt="活动生成图" loading="lazy" />
      <button className={fav ? "lh-fav on" : "lh-fav"} title={fav ? "取消收藏" : "收藏"} onClick={(e) => { e.stopPropagation(); handleFav(); }}>
        <Icon name="heart" size={15} />
      </button>
      <div className="lh-hover lh-hover-bottom">
        <button className="btn btn-ghost btn-sm" onClick={handleDownload}>
          下载
        </button>
      </div>
      <button className="lh-saveas" title="另存为我的素材" onClick={(e) => { e.stopPropagation(); setConfirmSave(true); }}>
        <Icon name="share" size={16} />
      </button>
      <span className="lh-mark">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lh-mark-logo" src={assetUrl("/brand-logo.png")} alt="魔方智绘" />
        由 AI 生成
      </span>
      {confirmSave && (
        <ConfirmModal
          title="是否另存为我的素材？"
          cancelText="取消"
          confirmText="储存"
          onCancel={() => setConfirmSave(false)}
          onConfirm={() => {
            addMaterial(card("素材"));
            setConfirmSave(false);
            toast("已另存为「仓库 · 我的素材」");
          }}
        />
      )}
    </div>
  );
}
