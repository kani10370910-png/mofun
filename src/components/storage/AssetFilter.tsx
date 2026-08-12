"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { AssetCard } from "@/lib/types";

/** 我的作品：按创作模块大类筛选 */
export type WorksCategory = "all" | "content" | "image" | "video" | "research";

/** 我的素材：按品牌设计子功能平铺筛选 */
export type MaterialCategory =
  | "all"
  | "event"
  | "product"
  | "logo"
  | "ip"
  | "font"
  | "signage"
  | "upload";

export type SortKey = "updated" | "created" | "size";
export type SortDir = "asc" | "desc";

type SubOpt = { key: string; name: string };

const WORKS_CATEGORIES: { key: WorksCategory; name: string; dropdown?: boolean }[] = [
  { key: "all", name: "全部" },
  { key: "content", name: "文案策划", dropdown: true },
  { key: "image", name: "品牌设计", dropdown: true },
  { key: "video", name: "视频宣传", dropdown: true },
  { key: "research", name: "市场调研", dropdown: true },
];

const WORKS_SUBS: Record<Exclude<WorksCategory, "all">, SubOpt[]> = {
  content: [
    { key: "all", name: "全部文案" },
    { key: "social", name: "社媒推文" },
    { key: "official", name: "公众号帮写" },
    { key: "brand", name: "品牌推广" },
  ],
  image: [
    { key: "all", name: "全部品牌设计" },
    { key: "event", name: "活动" },
    { key: "product", name: "商拍" },
    { key: "logo", name: "logo" },
    { key: "ip", name: "IP设计" },
    { key: "font", name: "AI字体" },
    { key: "signage", name: "店招设计" },
  ],
  video: [
    { key: "all", name: "全部视频" },
    { key: "oneline", name: "一句话成片" },
    { key: "studio", name: "制作大片" },
    { key: "avatar", name: "数字人模特" },
  ],
  research: [
    { key: "all", name: "全部调研" },
    { key: "brand", name: "品牌调研" },
    { key: "industry", name: "产业调研" },
    { key: "hotsale", name: "爆款分析" },
  ],
};

const MATERIAL_CATEGORIES: { key: MaterialCategory; name: string }[] = [
  { key: "all", name: "全部" },
  { key: "event", name: "活动" },
  { key: "product", name: "商拍" },
  { key: "logo", name: "logo" },
  { key: "ip", name: "IP设计" },
  { key: "font", name: "AI字体" },
  { key: "signage", name: "店招设计" },
  { key: "upload", name: "其他" },
];

type SimpleSortKey = "recent" | "earliest";
const SIMPLE_SORTS: { key: SimpleSortKey; name: string; sort: SortKey; dir: SortDir }[] = [
  { key: "recent", name: "最近更新", sort: "updated", dir: "desc" },
  { key: "earliest", name: "最早创建", sort: "created", dir: "asc" },
];

function currentSimpleSort(sort: SortKey, sortDir: SortDir): SimpleSortKey {
  if (sort === "created" && sortDir === "asc") return "earliest";
  return "recent";
}

function applySimpleSort(
  key: SimpleSortKey,
  setSort: (v: SortKey) => void,
  setSortDir: (v: SortDir) => void,
) {
  const hit = SIMPLE_SORTS.find((s) => s.key === key) ?? SIMPLE_SORTS[0];
  setSort(hit.sort);
  setSortDir(hit.dir);
}

function parseTime(t?: string): number | null {
  if (!t) return null;
  const iso = Date.parse(t);
  if (!Number.isNaN(iso)) return iso;
  const m = t.match(/(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0"] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)).getTime();
}

function itemStamp(it: AssetCard, which: "updated" | "created"): number {
  if (which === "updated") {
    return parseTime(it.updatedAt) ?? parseTime(it.createdAt) ?? parseTime(it.time) ?? 0;
  }
  return parseTime(it.createdAt) ?? parseTime(it.time) ?? parseTime(it.updatedAt) ?? 0;
}

function itemSizeScore(it: AssetCard): number {
  let n = it.text?.length || 0;
  if (it.img) n += 800_000;
  if (it.videoUrl || it.mediaRef) n += 4_000_000;
  return n;
}

function blobOf(it: AssetCard): string {
  return `${it.module || ""} ${it.kind} ${it.sub} ${it.name} ${it.edit?.sub || ""}`.toLowerCase();
}

function matchImageSub(b: string, sub: string): boolean {
  switch (sub) {
    case "event":
      return b.includes("活动") || b.includes("event");
    case "product":
      return b.includes("商拍") || b.includes("product") || b.includes("商品");
    case "logo":
      return b.includes("logo");
    case "ip":
      return /\bip\b/.test(b) || b.includes("ip设计") || b.includes("ip 设计");
    case "font":
      return b.includes("字体") || b.includes("font") || b.includes("艺术字");
    case "signage":
      return b.includes("店招") || b.includes("signage");
    default:
      return true;
  }
}

function matchVideoSub(b: string, sub: string): boolean {
  switch (sub) {
    case "oneline":
      return b.includes("一句话") || b.includes("oneline");
    case "studio":
      return b.includes("制作大片") || b.includes("分镜") || b.includes("studio");
    case "avatar":
      return b.includes("数字人") || b.includes("avatar");
    default:
      return true;
  }
}

function matchResearchSub(b: string, sub: string): boolean {
  switch (sub) {
    case "brand":
      return b.includes("品牌调研");
    case "industry":
      return b.includes("产业调研") || b.includes("产业");
    case "hotsale":
      return b.includes("爆款");
    default:
      return true;
  }
}

function matchContentSub(b: string, sub: string): boolean {
  switch (sub) {
    case "social":
      return b.includes("social") || b.includes("社媒");
    case "official":
      return b.includes("official") || b.includes("公众号");
    case "brand":
      return b.includes("品牌推广") || (b.includes("brand") && !b.includes("调研"));
    default:
      return true;
  }
}

export function matchWorksCategory(
  it: AssetCard,
  cat: WorksCategory,
  categorySub = "all",
): boolean {
  if (cat === "all") return true;
  const b = blobOf(it);

  if (cat === "content") {
    const isContent =
      it.module === "content" ||
      it.kind === "文案" ||
      b.includes("内容创作") ||
      (b.includes("文案") && !b.includes("调研"));
    if (!isContent) return false;
    if (categorySub === "all") return true;
    return matchContentSub(b, categorySub);
  }

  if (cat === "image") {
    const isImage =
      it.module === "image" ||
      it.kind === "图片" ||
      b.includes("品牌设计") ||
      b.includes("logo") ||
      b.includes("字体") ||
      b.includes("ip") ||
      b.includes("商拍") ||
      b.includes("店招") ||
      b.includes("活动") ||
      b.includes("首页对话") ||
      b.includes("vi延展");
    if (!isImage) return false;
    if (categorySub === "all") return true;
    return matchImageSub(b, categorySub);
  }

  if (cat === "video") {
    const isVideo =
      it.module === "video" ||
      it.kind === "视频" ||
      b.includes("视频") ||
      b.includes("数字人") ||
      b.includes("分镜");
    if (!isVideo) return false;
    if (categorySub === "all") return true;
    return matchVideoSub(b, categorySub);
  }

  const isResearch =
    it.module === "research" ||
    b.includes("调研") ||
    b.includes("爆款分析") ||
    b.includes("市场调研");
  if (!isResearch) return false;
  if (categorySub === "all") return true;
  return matchResearchSub(b, categorySub);
}

export function isPersonalUpload(it: AssetCard): boolean {
  if (it.module === "upload") return true;
  if (it.edit?.source === "upload") return true;
  // 从他人品牌同步的文件归入「其他」，不混入品牌设计子类
  if (it.edit?.source === "brand") return true;
  if (/^来源公司/.test(it.sub || "")) return true;
  const blob = `${it.sub || ""} ${it.name || ""} ${it.kind || ""}`;
  return /个人上传|其他/.test(blob);
}

export function matchMaterialCategory(it: AssetCard, cat: MaterialCategory): boolean {
  if (cat === "all") return true;
  if (cat === "upload") return isPersonalUpload(it);
  // 品牌设计子类不混入「其他」上传
  if (isPersonalUpload(it)) return false;
  return matchImageSub(blobOf(it), cat);
}

function filterAndSort(
  items: AssetCard[],
  opts: {
    kw: string;
    favOnly: boolean;
    isFav?: (it: AssetCard) => boolean;
    sort: SortKey;
    sortDir: SortDir;
    match: (it: AssetCard) => boolean;
  },
) {
  const k = opts.kw.trim().toLowerCase();
  const list = items.filter((it) => {
    if (opts.favOnly && opts.isFav && !opts.isFav(it)) return false;
    if (!opts.match(it)) return false;
    if (
      k &&
      !`${it.name} ${it.sub} ${it.kind} ${it.text || ""} ${it.module || ""}`
        .toLowerCase()
        .includes(k)
    ) {
      return false;
    }
    return true;
  });

  const sorted = [...list];
  const dir = opts.sortDir === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    let cmp = 0;
    if (opts.sort === "size") cmp = itemSizeScore(a) - itemSizeScore(b);
    else cmp = itemStamp(a, opts.sort) - itemStamp(b, opts.sort);
    return cmp * dir;
  });
  return sorted;
}

/** 我的作品筛选 */
export function useWorksFilter(items: AssetCard[], isFav?: (it: AssetCard) => boolean) {
  const [kw, setKw] = useState("");
  const [category, setCategory] = useState<WorksCategory>("all");
  const [categorySub, setCategorySub] = useState("all");
  const [sort, setSort] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [favOnly, setFavOnly] = useState(false);

  const filtered = useMemo(
    () =>
      filterAndSort(items, {
        kw,
        favOnly,
        isFav,
        sort,
        sortDir,
        match: (it) => matchWorksCategory(it, category, categorySub),
      }),
    [items, kw, category, categorySub, sort, sortDir, favOnly, isFav],
  );

  return {
    kw,
    setKw,
    category,
    setCategory,
    categorySub,
    setCategorySub,
    sort,
    setSort,
    sortDir,
    setSortDir,
    favOnly,
    setFavOnly,
    filtered,
  };
}

/** 我的素材筛选（平铺芯片） */
export function useMaterialsFilter(items: AssetCard[], isFav?: (it: AssetCard) => boolean) {
  const [kw, setKw] = useState("");
  const [category, setCategory] = useState<MaterialCategory>("all");
  const [sort, setSort] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [favOnly, setFavOnly] = useState(false);

  const filtered = useMemo(
    () =>
      filterAndSort(items, {
        kw,
        favOnly,
        isFav,
        sort,
        sortDir,
        match: (it) => matchMaterialCategory(it, category),
      }),
    [items, kw, category, sort, sortDir, favOnly, isFav],
  );

  return {
    kw,
    setKw,
    category,
    setCategory,
    sort,
    setSort,
    sortDir,
    setSortDir,
    favOnly,
    setFavOnly,
    filtered,
  };
}

/** @deprecated 兼容旧引用；默认按「我的作品」逻辑 */
export function useAssetFilter(items: AssetCard[], isFav?: (it: AssetCard) => boolean) {
  return useWorksFilter(items, isFav);
}

export type WorksFilterState = ReturnType<typeof useWorksFilter>;
export type MaterialsFilterState = ReturnType<typeof useMaterialsFilter>;
export type AssetFilterState = WorksFilterState;

export function StorageSpaceSearch({
  kw,
  setKw,
}: {
  kw: string;
  setKw: (v: string) => void;
}) {
  return (
    <div className="st-space-search">
      <input
        type="text"
        value={kw}
        onChange={(e) => setKw(e.target.value)}
        placeholder="搜索我的空间"
        aria-label="搜索我的空间"
      />
      {kw ? (
        <button type="button" className="st-space-clear" onClick={() => setKw("")} aria-label="清空">
          <Icon name="close" size={14} />
        </button>
      ) : null}
      <span className="st-space-ico" aria-hidden>
        <Icon name="search" size={16} />
      </span>
    </div>
  );
}

export function StorageNewUpload({ onAction }: { onAction: (action: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="st-new-wrap" ref={ref}>
      <button
        type="button"
        className="st-new-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Icon name="plus" size={15} />
        上传
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div className="st-new-menu" role="menu">
          {[
            { id: "upload-image", label: "上传图片" },
            { id: "upload-video", label: "上传视频" },
          ].map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onAction(o.id);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function categoryChipLabel(cat: WorksCategory, sub: string, fallback: string): string {
  if (cat === "all" || sub === "all") return fallback;
  const opts = WORKS_SUBS[cat as Exclude<WorksCategory, "all">];
  return opts?.find((s) => s.key === sub)?.name || fallback;
}

/** 我的作品：文案/品牌/视频/调研 下拉筛选 */
export function WorksFilterBar({
  category,
  setCategory,
  categorySub,
  setCategorySub,
  sort,
  setSort,
  sortDir,
  setSortDir,
  favOnly,
  setFavOnly,
  kw,
  setKw,
  batchMode = false,
  onToggleBatch,
  onExitBatch,
  showSideControls = true,
}: {
  category: WorksCategory;
  setCategory: (v: WorksCategory) => void;
  categorySub: string;
  setCategorySub: (v: string) => void;
  sort: SortKey;
  setSort: (v: SortKey) => void;
  sortDir: SortDir;
  setSortDir: (v: SortDir) => void;
  favOnly: boolean;
  setFavOnly: (v: boolean) => void;
  kw: string;
  setKw: (v: string) => void;
  batchMode?: boolean;
  onToggleBatch?: () => void;
  onExitBatch?: () => void;
  showSideControls?: boolean;
}) {
  const [openCat, setOpenCat] = useState<WorksCategory | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const catsRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  function leaveBatch() {
    if (batchMode) onExitBatch?.();
  }

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (catsRef.current && !catsRef.current.contains(t)) setOpenCat(null);
      if (sortRef.current && !sortRef.current.contains(t)) setSortOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const simpleSort = currentSimpleSort(sort, sortDir);
  const sortLabel = SIMPLE_SORTS.find((s) => s.key === simpleSort)?.name || "最近更新";

  return (
    <div className="st-catbar">
      <div className="st-cats" ref={catsRef}>
        {WORKS_CATEGORIES.map((c) => {
          if (!c.dropdown) {
            return (
              <button
                key={c.key}
                type="button"
                className={category === c.key ? "st-cat on" : "st-cat"}
                onClick={() => {
                  leaveBatch();
                  setCategory(c.key);
                  setCategorySub("all");
                  setOpenCat(null);
                }}
              >
                {c.name}
              </button>
            );
          }

          const on = category === c.key;
          const label = categoryChipLabel(c.key, on ? categorySub : "all", c.name);
          const subs = WORKS_SUBS[c.key as Exclude<WorksCategory, "all">];
          const menuOpen = openCat === c.key;

          return (
            <div key={c.key} className="st-cat-dd">
              <button
                type="button"
                className={on ? "st-cat on" : "st-cat"}
                aria-expanded={menuOpen}
                onClick={() => {
                  leaveBatch();
                  if (category !== c.key) {
                    setCategory(c.key);
                    setCategorySub("all");
                    setOpenCat(c.key);
                  } else {
                    setOpenCat(menuOpen ? null : c.key);
                  }
                }}
              >
                {label}
                <Icon name="chevron" size={13} />
              </button>
              {menuOpen && (
                <div className="st-cat-menu" role="menu">
                  {subs.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className={on && categorySub === s.key ? "on" : ""}
                      role="menuitem"
                      onClick={() => {
                        leaveBatch();
                        setCategory(c.key);
                        setCategorySub(s.key);
                        setOpenCat(null);
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showSideControls && (
        <div className="st-cat-side">
          <StorageSpaceSearch
            kw={kw}
            setKw={(v) => {
              leaveBatch();
              setKw(v);
            }}
          />
          <div className="st-sort-dd" ref={sortRef}>
            <button
              type="button"
              className={sortOpen ? "st-sort-btn open" : "st-sort-btn"}
              onClick={() => {
                leaveBatch();
                setSortOpen((v) => !v);
              }}
              aria-expanded={sortOpen}
            >
              <span className="st-sort-label">{sortLabel}</span>
              <span className={sortOpen ? "st-sort-chev up" : "st-sort-chev"}>
                <Icon name="chevron" size={12} />
              </span>
            </button>
            {sortOpen && (
              <div className="st-sort-menu" role="menu">
                <div className="st-sort-group">
                  {SIMPLE_SORTS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className={simpleSort === s.key ? "on" : ""}
                      role="menuitemradio"
                      aria-checked={simpleSort === s.key}
                      onClick={() => {
                        leaveBatch();
                        applySimpleSort(s.key, setSort, setSortDir);
                        setSortOpen(false);
                      }}
                    >
                      <span>{s.name}</span>
                      {simpleSort === s.key && <Icon name="check" size={15} />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            className={favOnly ? "st-fav-btn on" : "st-fav-btn"}
            onClick={() => {
              leaveBatch();
              setFavOnly(!favOnly);
            }}
          >
            <Icon name="heart" size={15} />
            只看收藏
          </button>
          <button
            type="button"
            className={batchMode ? "st-batch-btn on" : "st-batch-btn"}
            onClick={onToggleBatch}
            aria-pressed={batchMode}
          >
            <Icon name="content" size={15} />
            批量
          </button>
        </div>
      )}
    </div>
  );
}

/** 我的素材：全部 + 活动/商拍/logo 等平铺芯片 */
export function MaterialsFilterBar({
  category,
  setCategory,
  sort,
  setSort,
  sortDir,
  setSortDir,
  favOnly,
  setFavOnly,
  kw,
  setKw,
  batchMode = false,
  onToggleBatch,
  onExitBatch,
  showSideControls = true,
}: {
  category: MaterialCategory;
  setCategory: (v: MaterialCategory) => void;
  sort: SortKey;
  setSort: (v: SortKey) => void;
  sortDir: SortDir;
  setSortDir: (v: SortDir) => void;
  favOnly: boolean;
  setFavOnly: (v: boolean) => void;
  kw: string;
  setKw: (v: string) => void;
  batchMode?: boolean;
  onToggleBatch?: () => void;
  onExitBatch?: () => void;
  showSideControls?: boolean;
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  function leaveBatch() {
    if (batchMode) onExitBatch?.();
  }

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (sortRef.current && !sortRef.current.contains(t)) setSortOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const simpleSort = currentSimpleSort(sort, sortDir);
  const sortLabel = SIMPLE_SORTS.find((s) => s.key === simpleSort)?.name || "最近更新";

  return (
    <div className="st-catbar">
      <div className="st-cats">
        {MATERIAL_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={category === c.key ? "st-cat on" : "st-cat"}
            onClick={() => {
              leaveBatch();
              setCategory(c.key);
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      {showSideControls && (
        <div className="st-cat-side">
          <StorageSpaceSearch
            kw={kw}
            setKw={(v) => {
              leaveBatch();
              setKw(v);
            }}
          />
          <div className="st-sort-dd" ref={sortRef}>
            <button
              type="button"
              className={sortOpen ? "st-sort-btn open" : "st-sort-btn"}
              onClick={() => {
                leaveBatch();
                setSortOpen((v) => !v);
              }}
              aria-expanded={sortOpen}
            >
              <span className="st-sort-label">{sortLabel}</span>
              <span className={sortOpen ? "st-sort-chev up" : "st-sort-chev"}>
                <Icon name="chevron" size={12} />
              </span>
            </button>
            {sortOpen && (
              <div className="st-sort-menu" role="menu">
                <div className="st-sort-group">
                  {SIMPLE_SORTS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className={simpleSort === s.key ? "on" : ""}
                      role="menuitemradio"
                      aria-checked={simpleSort === s.key}
                      onClick={() => {
                        leaveBatch();
                        applySimpleSort(s.key, setSort, setSortDir);
                        setSortOpen(false);
                      }}
                    >
                      <span>{s.name}</span>
                      {simpleSort === s.key && <Icon name="check" size={15} />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            className={favOnly ? "st-fav-btn on" : "st-fav-btn"}
            onClick={() => {
              leaveBatch();
              setFavOnly(!favOnly);
            }}
          >
            <Icon name="heart" size={15} />
            只看收藏
          </button>
          <button
            type="button"
            className={batchMode ? "st-batch-btn on" : "st-batch-btn"}
            onClick={onToggleBatch}
            aria-pressed={batchMode}
          >
            <Icon name="content" size={15} />
            批量
          </button>
        </div>
      )}
    </div>
  );
}

/** @deprecated 使用 WorksFilterBar / MaterialsFilterBar */
export function AssetFilterBar(props: Parameters<typeof WorksFilterBar>[0]) {
  return <WorksFilterBar {...props} />;
}
