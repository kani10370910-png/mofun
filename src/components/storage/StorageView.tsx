"use client";

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { myWorks, myMaterials } from "@/data/storage";
import type { AssetCard } from "@/lib/types";
import { useLibrary, assetKey, assetDedupeKey } from "@/lib/store";
import { asset } from "@/lib/asset";
import { nowStamp } from "@/lib/datetime";
import { stashReedit } from "@/lib/reedit";
import { deleteCachedVideo, resolveAssetPlayback } from "@/lib/videoCache";
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
import { workHoverTipText } from "@/lib/workMeta";

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

/** 仓库角标：去掉「品牌设计 ·」前缀（如「品牌设计 · 活动」→「活动」） */
function stripBrandDesignPrefix(label: string): string {
  const t = (label || "").trim();
  if (!t) return "";
  const stripped = t.replace(/^品牌设计\s*[·•]\s*/, "").trim();
  return stripped || t;
}

function materialSubLabel(item: AssetCard): string {
  if (item.edit?.source === "brand") {
    const company = item.edit.company?.trim() || item.edit.sub?.trim();
    return company ? `来源公司 · ${company}` : "来源公司";
  }
  if (/^来源公司/.test(item.sub || "")) return item.sub!;
  if (item.module === "upload" || item.edit?.source === "upload" || /个人上传|其他/.test(item.sub || "")) {
    return "其他";
  }
  // 我的素材页：角标只显示「素材」，不再带「品牌设计 · …」
  return "素材";
}

function workSubLabel(item: AssetCard): string {
  const raw = (item.sub || "").trim();
  if (!raw) return item.kind === "素材" ? "作品" : item.kind || "作品";
  return stripBrandDesignPrefix(raw);
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

type Tab = "works" | "materials";
const TABS: { key: Tab; name: string }[] = [
  { key: "works", name: "我的作品" },
  { key: "materials", name: "我的素材" },
];

export function StorageView({ initialTab = "works" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab === "materials" ? "materials" : "works");
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
                emoji: "",
                kind: "图片",
                name: file.name.replace(/\.[^.]+$/, "") || "其他",
                sub: "其他",
                grad: grads[ok % grads.length],
                img: dataUrl,
                module: "upload",
                time,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                edit: { source: "upload", sub: "其他" },
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
        toast(ok > 1 ? `已上传 ${ok} 张到「其他」` : "已上传到「其他」");
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
                subLabel={workSubLabel(w)}
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
  onUse,
  onDownload,
  onDelete,
  fav,
  onToggleFav,
  batchMode,
  selected,
  onToggleSelect,
  onOpen,
  bundleCount,
  editLabel = "编辑",
}: {
  item: AssetCard;
  kindLabel?: string;
  subLabel?: string;
  timeLabel?: string;
  onEdit?: () => void;
  onUse?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  fav?: boolean;
  onToggleFav?: () => void;
  batchMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpen?: () => void;
  bundleCount?: number;
  editLabel?: string;
}) {
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [mediaLost, setMediaLost] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [tipStyle, setTipStyle] = useState<CSSProperties>({});
  const [tipPlace, setTipPlace] = useState<"above" | "below">("above");
  const tipRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const footTextRef = useRef<HTMLDivElement>(null);
  const tipCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTipClose() {
    if (tipCloseTimer.current) {
      clearTimeout(tipCloseTimer.current);
      tipCloseTimer.current = null;
    }
  }

  function openTipNow() {
    clearTipClose();
    placeTip();
    setTipOpen(true);
  }

  function scheduleTipClose() {
    clearTipClose();
    tipCloseTimer.current = setTimeout(() => setTipOpen(false), 140);
  }

  useEffect(() => () => clearTipClose(), []);

  function placeTip() {
    const anchor = footTextRef.current;
    if (!anchor || typeof window === "undefined") return;
    const r = anchor.getBoundingClientRect();
    const gap = 10;
    const maxW = Math.min(320, Math.max(200, r.width + 24));
    const spaceAbove = r.top;
    const spaceBelow = window.innerHeight - r.bottom;
    const preferAbove = spaceAbove >= 140 || spaceAbove >= spaceBelow;
    setTipPlace(preferAbove ? "above" : "below");
    let left = r.left + r.width / 2 - maxW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - maxW - 8));
    if (preferAbove) {
      setTipStyle({
        position: "fixed",
        left,
        width: maxW,
        bottom: window.innerHeight - r.top + gap,
        top: "auto",
        maxHeight: Math.min(240, Math.max(96, spaceAbove - 16)),
      });
    } else {
      setTipStyle({
        position: "fixed",
        left,
        width: maxW,
        top: r.bottom + gap,
        bottom: "auto",
        maxHeight: Math.min(240, Math.max(96, spaceBelow - 16)),
      });
    }
  }

  useEffect(() => {
    if (!tipOpen) return;
    placeTip();
    const onReposition = () => placeTip();
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [tipOpen]);

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

  // 浮层在 portal 内：滚轮优先滚气泡
  useEffect(() => {
    if (!tipOpen) return;
    const tip = tipRef.current;
    if (!tip) return;
    const onWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = tip;
      const canScroll = scrollHeight > clientHeight + 1;
      if (!canScroll) return;
      e.preventDefault();
      e.stopPropagation();
      tip.scrollTop = Math.max(0, Math.min(scrollHeight - clientHeight, scrollTop + e.deltaY));
    };
    tip.addEventListener("wheel", onWheel, { passive: false });
    return () => tip.removeEventListener("wheel", onWheel);
  }, [tipOpen]);

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

  const showMenu = !batchMode && (onEdit || onUse || onDownload || onDelete);
  // 左上角角标：优先用传入的 subLabel（我的素材固定为「素材」等）
  const sourceLabel = (subLabel || item.sub || "").trim() || kindLabel || (item.kind === "素材" ? "图片" : item.kind);
  // 时间上方：有名称用名称，否则用提示词；单行省略
  const promptText =
    item.edit?.input?.trim() ||
    item.edit?.prompt?.trim() ||
    item.edit?.editInput?.trim() ||
    item.text?.trim() ||
    "";
  const titleText = item.name?.trim() || promptText;
  // 悬停层：可读生成信息（解析 JSON / 镜头脚本，避免原样抛结构）
  const tipText = workHoverTipText(item) || titleText;

  return (
    <div
      ref={cardRef}
      className={`${selected ? "asset-card selected" : "asset-card"}${tipOpen ? " tip-open" : ""}`}
      onClick={batchMode ? onToggleSelect : onOpen}
      onMouseLeave={() => scheduleTipClose()}
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
            {sourceLabel && <span className="at-kind" title={sourceLabel}>{sourceLabel}</span>}
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
        <div
          ref={footTextRef}
          className="asset-foot-text"
          onMouseEnter={() => {
            if (!tipText) return;
            openTipNow();
          }}
        >
          {titleText && (
            <div className="asset-title-wrap">
              <div className="asset-title">{titleText}</div>
            </div>
          )}
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
                {onUse && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onUse();
                    }}
                  >
                    <Icon name="check" size={16} />
                    保存到素材
                  </button>
                )}
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
                    {editLabel}
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
      {tipOpen && tipText && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={tipRef}
              className={`asset-title-tip show place-${tipPlace}`}
              role="tooltip"
              style={tipStyle}
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={() => {
                clearTipClose();
                setTipOpen(true);
              }}
              onMouseLeave={() => scheduleTipClose()}
            >
              {tipText}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
