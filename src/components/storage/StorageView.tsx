"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { myWorks, myMaterials, brands as seedBrands, BRAND_SEQ_START } from "@/data/storage";
import type { AssetCard } from "@/lib/types";
import { useLibrary, assetKey, assetDedupeKey } from "@/lib/store";
import { asset } from "@/lib/asset";
import { nowStamp } from "@/lib/datetime";
import { stashReedit } from "@/lib/reedit";
import { deleteCachedVideo, resolveAssetPlayback } from "@/lib/videoCache";
import { BrandPane } from "./BrandPane";
import {
  MaterialsFilterBar,
  StorageNewUpload,
  useMaterialsFilter,
  WorksFilterBar,
  useWorksFilter,
  type MaterialCategory,
} from "./AssetFilter";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { expandWorkForRemoval, groupWorksForDisplay, primaryBundle } from "@/lib/workBundle";

function isHidden(item: AssetCard, hidden: string[]): boolean {
  return hidden.includes(assetKey(item)) || hidden.includes(assetDedupeKey(item));
}

function purgeMediaIfNeeded(item: AssetCard) {
  const ref = item.mediaRef;
  if (ref?.startsWith("idb:")) {
    void deleteCachedVideo(ref.slice(4));
  }
}

function formatAssetTime(item: AssetCard): string {
  if (item.time?.trim()) return item.time;
  const src = item.updatedAt || item.createdAt;
  if (!src) return "";
  const d = new Date(src);
  if (Number.isNaN(d.getTime())) return "";
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function materialSubLabel(item: AssetCard): string {
  if (item.module === "upload" || item.edit?.source === "upload" || /个人上传/.test(item.sub || "")) {
    return "个人上传";
  }
  const sub = item.edit?.sub?.trim();
  if (sub) return `品牌设计 · ${sub}`;
  const kind = (item.kind || "").toLowerCase();
  if (/logo/.test(kind)) return "品牌设计 · logo";
  if (/\bip\b|ip设计/.test(kind)) return "品牌设计 · IP设计";
  if (/字体|font|艺术字/.test(kind)) return "品牌设计 · AI字体";
  if (/店招|signage/.test(kind)) return "品牌设计 · 店招设计";
  if (/商拍|产品|product/.test(kind)) return "品牌设计 · 商拍";
  if (/活动|event/.test(kind)) return "品牌设计 · 活动";
  return "品牌设计 · 素材";
}

// 作品「二次编辑」：按作品类型 / 来源路由到对应功能模块，并带上记录内容回填
export function editTargetOf(item: AssetCard): { href: string; label: string } {
  const text = `${item.kind} ${item.sub} ${item.name}`;
  let base = "/image?sub=event";
  let label = "宣传图片";
  if (item.module === "research" || text.includes("市场调研") || text.includes("调研报告") || text.includes("爆款分析")) {
    base = "/research";
    label = "市场调研";
  } else if (item.kind === "文案" || text.includes("内容创作")) {
    base = "/content";
    label = "内容创作";
  } else if (item.module === "video" || item.kind === "视频" || text.includes("视频生成") || text.includes("数字人")) {
    base = item.edit?.sub === "avatar" ? "/video?sub=avatar" : item.edit?.sub === "studio" ? "/video?sub=studio" : "/video";
    label = "视频生成";
  } else if (text.includes("logo") || text.includes("LOGO")) {
    base = "/image?sub=logo";
    label = "品牌设计 · logo";
  } else if (text.includes("AI字体") || text.includes("字体")) {
    base = "/image?sub=font";
    label = "品牌设计 · AI字体";
  } else if (text.includes("IP")) {
    base = "/image?sub=ip";
    label = "品牌设计 · IP设计";
  } else if (text.includes("店招")) {
    base = "/image?sub=signage";
    label = "店招设计";
  } else if (text.includes("商拍") || text.includes("商品")) {
    base = "/image?sub=product";
    label = "商拍";
  }

  if (item.edit && Object.keys(item.edit).length) {
    const params = new URLSearchParams();
    const heavyKeys = new Set([
      "productImg",
      "logoImg",
      "refImg",
      "fusionImg1",
      "fusionImg2",
      "fusionImg3",
    ]);
    for (const [k, v] of Object.entries(item.edit)) {
      if (k === "sub") continue;
      if (heavyKeys.has(k)) continue;
      if (v.length > 400) continue; // 避免 URL 过长，超长字段交给 reedit session 恢复
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    if (qs) base += (base.includes("?") ? "&" : "?") + qs;
  }
  return { href: base, label };
}

type Tab = "works" | "materials" | "brand";
const TABS: { key: Tab; name: string }[] = [
  { key: "works", name: "我的作品" },
  { key: "materials", name: "我的素材" },
  { key: "brand", name: "品牌资产" },
];

export function StorageView({ initialTab = "works" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const toast = useToast();
  const { addMaterial } = useLibrary();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [materialJumpCat, setMaterialJumpCat] = useState<MaterialCategory | null>(null);

  function handleUploadFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) {
      toast("请选择图片文件", "warn");
      return;
    }
    let ok = 0;
    let fail = 0;
    const grads = ["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4", "thumb-grad-5", "thumb-grad-6"] as const;
    Promise.all(
      list.map(
        (file) =>
          new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = typeof reader.result === "string" ? reader.result : "";
              if (!dataUrl) {
                fail += 1;
                resolve();
                return;
              }
              const time = nowStamp();
              const saved = addMaterial({
                emoji: "图",
                kind: "图片",
                name: file.name.replace(/\.[^.]+$/, "") || "个人上传",
                sub: "个人上传",
                grad: grads[ok % grads.length],
                img: dataUrl,
                module: "upload",
                time,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                edit: { source: "upload", sub: "个人上传" },
              });
              if (saved.ok) ok += 1;
              else fail += 1;
              resolve();
            };
            reader.onerror = () => {
              fail += 1;
              resolve();
            };
            reader.readAsDataURL(file);
          }),
      ),
    ).then(() => {
      if (ok) {
        setMaterialJumpCat("upload");
        setTab("materials");
        toast(ok > 1 ? `已上传 ${ok} 张到「个人上传」` : "已上传到「个人上传」");
      }
      if (fail) toast(`${fail} 个文件上传失败`, "warn");
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    });
  }

  const stickyHead = (filters?: ReactNode) => (
    <div className="st-sticky-head">
      <div className="st-topbar">
        <div className="tabs st-tabs">
          {TABS.map((t) => (
            <div
              key={t.key}
              className={tab === t.key ? "tab on" : "tab"}
              onClick={() => setTab(t.key)}
            >
              {t.name}
            </div>
          ))}
        </div>
        {tab === "materials" && (
          <div className="st-top-actions">
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => handleUploadFiles(e.target.files)}
            />
            <StorageNewUpload
              onAction={(id) => {
                if (id === "upload-image") {
                  uploadInputRef.current?.click();
                  return;
                }
                if (id === "upload-video") {
                  toast("我的素材仅支持图片，请使用「上传图片」", "warn");
                  return;
                }
                toast("上传（演示）");
              }}
            />
          </div>
        )}
      </div>
      {filters}
    </div>
  );

  return (
    <div className="page storage-page">
      <div id="storageBody">
        {tab === "works" && <WorksPane toast={toast} stickyHead={stickyHead} />}
        {tab === "materials" && (
          <MaterialsPane
            toast={toast}
            stickyHead={stickyHead}
            jumpCategory={materialJumpCat}
            onJumpConsumed={() => setMaterialJumpCat(null)}
          />
        )}
        {tab === "brand" && (
          <>
            {stickyHead()}
            <BrandPane seed={seedBrands} seqStart={BRAND_SEQ_START} />
          </>
        )}
      </div>
    </div>
  );
}

function useBatchSelect(items: AssetCard[]) {
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!batchMode) return;
    const valid = new Set(items.map(assetKey));
    setSelected((prev) => {
      const next = new Set<string>();
      for (const k of prev) if (valid.has(k)) next.add(k);
      return next.size === prev.size ? prev : next;
    });
  }, [items, batchMode]);

  function enterBatch() {
    setBatchMode(true);
    setSelected(new Set());
  }
  function exitBatch() {
    setBatchMode(false);
    setSelected(new Set());
  }
  function toggleBatch() {
    if (batchMode) exitBatch();
    else enterBatch();
  }
  function toggleOne(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleAll() {
    const keys = items.map(assetKey);
    setSelected((prev) => (prev.size === keys.length && keys.length > 0 ? new Set() : new Set(keys)));
  }

  const allSelected = items.length > 0 && selected.size === items.length;

  return {
    batchMode,
    selected,
    allSelected,
    toggleBatch,
    exitBatch,
    toggleOne,
    toggleAll,
    selectedItems: items.filter((it) => selected.has(assetKey(it))),
  };
}

function BatchBar({
  selectedCount,
  allSelected,
  onToggleAll,
  onDelete,
  onCancel,
}: {
  selectedCount: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="st-batch-bar" role="toolbar" aria-label="批量操作">
      <label className="st-batch-all">
        <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
        <span>全选</span>
        <span className="st-batch-count">已选择 {selectedCount}</span>
      </label>
      <div className="st-batch-acts">
        <button type="button" className="st-batch-act danger" onClick={onDelete}>
          <Icon name="trash" size={15} />
          删除
        </button>
      </div>
      <button type="button" className="st-batch-cancel" onClick={onCancel}>
        <Icon name="content" size={15} />
        取消
      </button>
    </div>
  );
}

type StickyHead = (filters?: ReactNode) => ReactNode;

function WorksPane({
  toast,
  stickyHead,
}: {
  toast: (s: string, type?: "info" | "warn" | "success") => void;
  stickyHead: StickyHead;
}) {
  const { works, hiddenWorks, removeWork, toggleFavorite, isFavorite } = useLibrary();
  const router = useRouter();
  const [pendingDel, setPendingDel] = useState<AssetCard | null>(null);
  const [pendingBatchDel, setPendingBatchDel] = useState(false);
  const all = [...works, ...myWorks].filter((w) => !isHidden(w, hiddenWorks));
  const f = useWorksFilter(all, isFavorite);
  const displayed = groupWorksForDisplay(f.filtered);
  const batch = useBatchSelect(displayed);

  return (
    <>
      {stickyHead(
        <WorksFilterBar
          category={f.category}
          setCategory={f.setCategory}
          categorySub={f.categorySub}
          setCategorySub={f.setCategorySub}
          sort={f.sort}
          setSort={f.setSort}
          sortDir={f.sortDir}
          setSortDir={f.setSortDir}
          favOnly={f.favOnly}
          setFavOnly={f.setFavOnly}
          kw={f.kw}
          setKw={f.setKw}
          batchMode={batch.batchMode}
          onToggleBatch={batch.toggleBatch}
          onExitBatch={batch.exitBatch}
          showSideControls
        />
      )}
      {displayed.length === 0 ? (
        <div className="preview-empty" style={{ minHeight: 220 }}>
          <div>没有符合条件的作品，换个关键词或分类试试</div>
        </div>
      ) : (
        <div className={batch.batchMode ? "grid grid-4 st-batch-grid" : "grid grid-4"}>
          {displayed.map((w) => {
            const key = assetKey(w);
            const target = editTargetOf(w);
            const bundleCount = primaryBundle(w).length;
            return (
              <AssetCardView
                key={key}
                item={w}
                bundleCount={bundleCount > 1 ? bundleCount : undefined}
                fav={isFavorite(w)}
                onToggleFav={() => toggleFavorite(w)}
                batchMode={batch.batchMode}
                selected={batch.selected.has(key)}
                onToggleSelect={() => batch.toggleOne(key)}
                onEdit={
                  batch.batchMode
                    ? undefined
                    : () => {
                        const nonce = stashReedit(w);
                        const href = target.href + (target.href.includes("?") ? "&" : "?") + "reedit=" + nonce;
                        toast(`正在打开「${target.label}」…`);
                        router.push(href);
                      }
                }
                onDelete={batch.batchMode ? undefined : () => setPendingDel(w)}
              />
            );
          })}
        </div>
      )}

      {batch.batchMode && (
        <BatchBar
          selectedCount={batch.selected.size}
          allSelected={batch.allSelected}
          onToggleAll={batch.toggleAll}
          onDelete={() => {
            if (!batch.selected.size) return toast("请先选择作品", "warn");
            setPendingBatchDel(true);
          }}
          onCancel={batch.exitBatch}
        />
      )}

      {pendingDel && (
        <ConfirmModal
          title="确定删除这个作品吗？"
          onCancel={() => setPendingDel(null)}
          onConfirm={() => {
            for (const it of expandWorkForRemoval(pendingDel, all)) {
              purgeMediaIfNeeded(it);
              removeWork(it);
            }
            setPendingDel(null);
            toast("已删除该作品");
          }}
        />
      )}

      {pendingBatchDel && (
        <ConfirmModal
          title={`确定删除选中的 ${batch.selected.size} 个作品吗？`}
          onCancel={() => setPendingBatchDel(false)}
          onConfirm={() => {
            const seen = new Set<string>();
            for (const it of batch.selectedItems) {
              for (const raw of expandWorkForRemoval(it, all)) {
                const k = assetKey(raw);
                if (seen.has(k)) continue;
                seen.add(k);
                purgeMediaIfNeeded(raw);
                removeWork(raw);
              }
            }
            setPendingBatchDel(false);
            toast(`已删除 ${batch.selected.size} 项`);
            batch.exitBatch();
          }}
        />
      )}
    </>
  );
}

function MaterialsPane({
  toast,
  stickyHead,
  jumpCategory,
  onJumpConsumed,
}: {
  toast: (s: string, type?: "info" | "warn" | "success") => void;
  stickyHead: StickyHead;
  jumpCategory?: MaterialCategory | null;
  onJumpConsumed?: () => void;
}) {
  const { materials, hiddenMaterials, removeMaterial, toggleFavorite, isFavorite } = useLibrary();
  const [pendingDel, setPendingDel] = useState<AssetCard | null>(null);
  const [pendingBatchDel, setPendingBatchDel] = useState(false);
  const all = [...materials, ...myMaterials]
    .filter((m) => !isHidden(m, hiddenMaterials))
    // 我的素材仅展示品牌设计相关素材，不展示视频素材
    .filter((m) => m.kind !== "视频" && m.module !== "video");
  const f = useMaterialsFilter(all, isFavorite);
  const batch = useBatchSelect(f.filtered);

  useEffect(() => {
    if (!jumpCategory) return;
    f.setCategory(jumpCategory);
    onJumpConsumed?.();
    // 仅响应外部跳转分类，不把整个 filter 对象作为依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpCategory]);
  function downloadMaterial(item: AssetCard) {
    const src = item.img || item.videoUrl || item.mediaRef;
    if (!src) {
      toast("该素材暂无可下载文件", "warn");
      return;
    }
    try {
      const href = asset(src);
      const ext = src.match(/\.(\w+)(?:$|\?)/)?.[1] || "png";
      const safe = (item.name || "素材").replace(/[\\/:*?"<>|]/g, "_");
      const a = document.createElement("a");
      a.href = href;
      a.download = `${safe}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("开始下载素材");
    } catch {
      toast("下载失败，请稍后重试", "warn");
    }
  }

  return (
    <>
      {stickyHead(
        <MaterialsFilterBar
          category={f.category}
          setCategory={f.setCategory}
          sort={f.sort}
          setSort={f.setSort}
          sortDir={f.sortDir}
          setSortDir={f.setSortDir}
          favOnly={f.favOnly}
          setFavOnly={f.setFavOnly}
          kw={f.kw}
          setKw={f.setKw}
          batchMode={batch.batchMode}
          onToggleBatch={batch.toggleBatch}
          onExitBatch={batch.exitBatch}
          showSideControls
        />
      )}
      {f.filtered.length === 0 ? (
        <div className="preview-empty" style={{ minHeight: 200 }}>
          <div>没有符合条件的素材，换个关键词或分类试试</div>
        </div>
      ) : (
        <div className={batch.batchMode ? "grid grid-4 st-batch-grid" : "grid grid-4"}>
          {f.filtered.map((m) => {
            const key = assetKey(m);
            return (
              <AssetCardView
                key={key}
                item={m}
                kindLabel="图片"
                subLabel={materialSubLabel(m)}
                timeLabel={formatAssetTime(m)}
                fav={isFavorite(m)}
                onToggleFav={() => toggleFavorite(m)}
                batchMode={batch.batchMode}
                selected={batch.selected.has(key)}
                onToggleSelect={() => batch.toggleOne(key)}
                onDownload={batch.batchMode ? undefined : () => downloadMaterial(m)}
                onDelete={batch.batchMode ? undefined : () => setPendingDel(m)}
              />
            );
          })}
        </div>
      )}

      {batch.batchMode && (
        <BatchBar
          selectedCount={batch.selected.size}
          allSelected={batch.allSelected}
          onToggleAll={batch.toggleAll}
          onDelete={() => {
            if (!batch.selected.size) return toast("请先选择素材", "warn");
            setPendingBatchDel(true);
          }}
          onCancel={batch.exitBatch}
        />
      )}

      {pendingDel && (
        <ConfirmModal
          title="确定删除这个素材吗？"
          onCancel={() => setPendingDel(null)}
          onConfirm={() => {
            purgeMediaIfNeeded(pendingDel);
            removeMaterial(pendingDel);
            setPendingDel(null);
            toast("已删除该素材");
          }}
        />
      )}

      {pendingBatchDel && (
        <ConfirmModal
          title={`确定删除选中的 ${batch.selected.size} 个素材吗？`}
          onCancel={() => setPendingBatchDel(false)}
          onConfirm={() => {
            for (const it of batch.selectedItems) {
              purgeMediaIfNeeded(it);
              removeMaterial(it);
            }
            setPendingBatchDel(false);
            toast(`已删除 ${batch.selected.size} 项`);
            batch.exitBatch();
          }}
        />
      )}
    </>
  );
}

export function AssetCardView({
  item,
  kindLabel,
  subLabel,
  timeLabel,
  onEdit,
  onDownload,
  onDelete,
  fav,
  onToggleFav,
  batchMode,
  selected,
  onToggleSelect,
  onOpen,
  bundleCount,
}: {
  item: AssetCard;
  kindLabel?: string;
  subLabel?: string;
  timeLabel?: string;
  onEdit?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  fav?: boolean;
  onToggleFav?: () => void;
  batchMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpen?: () => void;
  bundleCount?: number;
}) {
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [mediaLost, setMediaLost] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".asset-more-wrap")) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  useEffect(() => {
    let revoke: (() => void) | undefined;
    let cancelled = false;
    setPlayUrl(null);
    setMediaLost(false);
    if (item.kind !== "视频" && !item.videoUrl && !item.mediaRef) return;
    void (async () => {
      const res = await resolveAssetPlayback(item);
      if (cancelled) {
        res?.revoke?.();
        return;
      }
      if (!res) {
        if (item.mediaRef || item.videoUrl) setMediaLost(true);
        return;
      }
      revoke = res.revoke;
      setPlayUrl(res.url);
    })();
    return () => {
      cancelled = true;
      revoke?.();
    };
  }, [item.videoUrl, item.mediaRef, item.kind]);

  const showMenu = !batchMode && (onEdit || onDownload || onDelete);
  const cardKindLabel = kindLabel || (item.kind === "素材" ? "图片" : item.kind);

  return (
    <div
      className={selected ? "asset-card selected" : "asset-card"}
      onClick={batchMode ? onToggleSelect : onOpen}
      role={batchMode ? "checkbox" : onOpen ? "button" : undefined}
      aria-checked={batchMode ? !!selected : undefined}
      style={batchMode || onOpen ? { cursor: "pointer" } : undefined}
    >
      <div className={`asset-thumb ${item.img || playUrl ? "" : item.grad}`}>
        {batchMode ? (
          <span className={selected ? "at-check on" : "at-check"} aria-hidden>
            {selected ? <Icon name="check" size={14} /> : null}
          </span>
        ) : (
          <>
            <span className="at-kind">{cardKindLabel}</span>
            {bundleCount != null && bundleCount > 1 && (
              <span className="at-bundle">{bundleCount} 项</span>
            )}
            {onToggleFav && (
              <button
                className={fav ? "at-fav on" : "at-fav"}
                title={fav ? "取消收藏" : "收藏"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFav();
                }}
              >
                <Icon name="heart" size={15} />
              </button>
            )}
          </>
        )}
        {playUrl ? (
          <video
            className="at-img"
            src={`${playUrl.startsWith("http") || playUrl.startsWith("/") ? asset(playUrl) : playUrl}#t=0.1`}
            muted
            playsInline
            preload="metadata"
          />
        ) : item.img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="at-img" src={asset(item.img!)} alt={item.name} loading="lazy" />
        ) : (
          <span className="at-emoji">{item.emoji}</span>
        )}
        {mediaLost && <span className="at-media-lost">媒体失效</span>}
      </div>
      <div className="asset-foot">
        <div className="asset-foot-text">
          {(subLabel || item.sub) && <div className="asset-sub">{subLabel || item.sub}</div>}
          {(timeLabel || item.time) && <div className="asset-time">{timeLabel || item.time}</div>}
        </div>
        {showMenu && (
          <div className={`asset-more-wrap${menuOpen ? " open" : ""}`}>
            <button
              type="button"
              className="asset-more-btn"
              aria-label="更多操作"
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
            >
              <Icon name="dots" size={16} />
            </button>
            {menuOpen && (
              <div className="asset-card-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                {onEdit && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit();
                    }}
                  >
                    <Icon name="pencil" size={16} />
                    编辑
                  </button>
                )}
                {onDownload && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onDownload();
                    }}
                  >
                    <Icon name="download" size={16} />
                    下载
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                  >
                    <Icon name="trash" size={16} />
                    删除
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
