"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AssetCard, WorkBundleItem } from "@/lib/types";
import { purgeLocalStorageBloatOnce } from "@/lib/localStorageCleanup";
import { IDENTITY_EVENT, identityScopedStorageKey } from "@/lib/identity";

/* 用户「我的作品 / 我的素材」运行时仓库：
   品牌设计/视频等模块「储存」后写入这里，仓库页读取展示；localStorage 持久化。
   Schema v2：补 id / text / mediaRef / createdAt；入库返回成败；作品与素材同等瘦身。 */

/** 作品/素材唯一标识（收藏/隐藏兼容）：优先稳定 id，否则回退 类型+名称 */
export function assetKey(item: AssetCard): string {
  if (item.id?.trim()) return item.id.trim();
  return `${item.kind}|${item.name}`;
}

/** 业务去重键（同名同类型视为同一条目，支持 upsert） */
export function assetDedupeKey(item: AssetCard): string {
  return `${item.kind}|${item.name}`;
}

export type LibraryWriteResult = {
  ok: boolean;
  action?: "created" | "updated" | "skipped";
  reason?: "quota" | "invalid";
  item?: AssetCard;
};

interface LibraryState {
  works: AssetCard[];
  materials: AssetCard[];
  hiddenWorks: string[];
  hiddenMaterials: string[];
  favorites: string[];
  addWork: (item: AssetCard) => LibraryWriteResult;
  addMaterial: (item: AssetCard) => LibraryWriteResult;
  updateAsset: (item: AssetCard, bucket?: "works" | "materials") => LibraryWriteResult;
  removeWork: (item: AssetCard) => void;
  removeMaterial: (item: AssetCard) => void;
  toggleFavorite: (item: AssetCard) => void;
  isFavorite: (item: AssetCard) => boolean;
}

const LibraryContext = createContext<LibraryState | null>(null);

const WORKS_KEY = "mofun.works";
const MATERIALS_KEY = "mofun.materials";
const HIDDEN_WORKS_KEY = "mofun.hiddenWorks";
const HIDDEN_MATERIALS_KEY = "mofun.hiddenMaterials";
const FAVORITES_KEY = "mofun.favorites";
const SCHEMA_FLAG = "mofun.library.schema-v2";

function scoped(base: string) {
  return identityScopedStorageKey(base);
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `a-${crypto.randomUUID()}`;
  } catch { /* ignore */ }
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function load(key: string): AssetCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as AssetCard[]) : [];
  } catch {
    return [];
  }
}

function loadKeys(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** 去掉不可持久化的 data:/blob: 图片；blob: 视频地址也剥离（应走 mediaRef/外链） */
export function slimAssetCard(item: AssetCard): AssetCard {
  const next = { ...item };
  if (typeof next.img === "string" && (next.img.startsWith("data:") || next.img.startsWith("blob:"))) {
    next.img = undefined;
  }
  if (typeof next.videoUrl === "string" && next.videoUrl.startsWith("blob:")) {
    // 保留 mediaRef（idb:…），去掉不可恢复的 blob
    next.videoUrl = undefined;
  }
  if (next.bundle?.length) {
    next.bundle = next.bundle.map((b: WorkBundleItem) => {
      const bi = { ...b };
      if (typeof bi.img === "string" && (bi.img.startsWith("data:") || bi.img.startsWith("blob:"))) {
        bi.img = undefined;
      }
      if (typeof bi.videoUrl === "string" && bi.videoUrl.startsWith("blob:")) {
        bi.videoUrl = undefined;
      }
      return bi;
    });
  }
  // 正文过大时截断，避免撑爆配额（保留约 40KB 字符）
  if (typeof next.text === "string" && next.text.length > 40_000) {
    next.text = `${next.text.slice(0, 40_000)}\n…（已截断）`;
  }
  return next;
}

function slimAssets(items: AssetCard[]): AssetCard[] {
  return items.map(slimAssetCard);
}

/** 补齐 Schema v2 字段；旧收藏键仍可用 kind|name */
export function normalizeAssetCard(item: AssetCard): AssetCard {
  const now = new Date().toISOString();
  const legacyKey = `${item.kind}|${item.name}`;
  const id = item.id?.trim() || `legacy-${legacyKey}`;
  return slimAssetCard({
    ...item,
    id,
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || item.createdAt || now,
    time: item.time || undefined,
    mediaRef: item.mediaRef || (item.videoUrl && !item.videoUrl.startsWith("blob:") ? item.videoUrl : undefined),
  });
}

function normalizeList(items: AssetCard[]): AssetCard[] {
  const seen = new Set<string>();
  const out: AssetCard[] = [];
  for (const raw of items) {
    const item = normalizeAssetCard(raw);
    const k = assetDedupeKey(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function save(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
      if ((key === scoped(WORKS_KEY) || key === scoped(MATERIALS_KEY) || key === WORKS_KEY || key === MATERIALS_KEY) && Array.isArray(value)) {
        try {
          window.localStorage.setItem(key, JSON.stringify(slimAssets(value as AssetCard[])));
          return true;
        } catch { /* fall through */ }
      }
      window.dispatchEvent(new CustomEvent("mofun:storage-quota"));
    }
    return false;
  }
}

function upsertList(
  prev: AssetCard[],
  incoming: AssetCard,
): { next: AssetCard[]; action: "created" | "updated"; item: AssetCard } {
  const item = normalizeAssetCard({ ...incoming, updatedAt: new Date().toISOString() });
  const dk = assetDedupeKey(item);
  const idx = prev.findIndex((x) => assetDedupeKey(x) === dk || (item.id && x.id === item.id));
  if (idx >= 0) {
    const merged = normalizeAssetCard({
      ...prev[idx],
      ...item,
      id: prev[idx].id || item.id,
      createdAt: prev[idx].createdAt || item.createdAt,
      updatedAt: new Date().toISOString(),
    });
    const next = [...prev];
    next[idx] = merged;
    // 更新后提到最前
    next.splice(idx, 1);
    return { next: [merged, ...next], action: "updated", item: merged };
  }
  return { next: [item, ...prev], action: "created", item };
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [works, setWorks] = useState<AssetCard[]>([]);
  const [materials, setMaterials] = useState<AssetCard[]>([]);
  const [hiddenWorks, setHiddenWorks] = useState<string[]>([]);
  const [hiddenMaterials, setHiddenMaterials] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  const reloadLibrary = useCallback(() => {
    purgeLocalStorageBloatOnce();
    const worksKey = scoped(WORKS_KEY);
    const matsKey = scoped(MATERIALS_KEY);
    const rawWorks = load(worksKey);
    const rawMats = load(matsKey);
    const worksNorm = normalizeList(rawWorks);
    const matsNorm = normalizeList(rawMats);
    setWorks(worksNorm);
    setMaterials(matsNorm);
    setHiddenWorks(loadKeys(scoped(HIDDEN_WORKS_KEY)));
    setHiddenMaterials(loadKeys(scoped(HIDDEN_MATERIALS_KEY)));
    setFavorites(loadKeys(scoped(FAVORITES_KEY)));
    if (!window.localStorage.getItem(SCHEMA_FLAG) || JSON.stringify(rawWorks) !== JSON.stringify(worksNorm)) {
      save(worksKey, worksNorm);
    }
    if (JSON.stringify(rawMats) !== JSON.stringify(matsNorm)) {
      save(matsKey, matsNorm);
    }
    try { window.localStorage.setItem(SCHEMA_FLAG, "1"); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    reloadLibrary();
    window.addEventListener(IDENTITY_EVENT, reloadLibrary);
    return () => window.removeEventListener(IDENTITY_EVENT, reloadLibrary);
  }, [reloadLibrary]);

  const addWork = useCallback((raw: AssetCard): LibraryWriteResult => {
    if (!raw?.name?.trim() || !raw?.kind?.trim()) {
      return { ok: false, reason: "invalid" };
    }
    let result: LibraryWriteResult = { ok: false, reason: "quota" };
    setWorks((prev) => {
      const { next, action, item } = upsertList(prev, raw);
      const saved = save(scoped(WORKS_KEY), next);
      result = saved
        ? { ok: true, action, item }
        : { ok: false, reason: "quota", item };
      return saved ? next : prev;
    });
    return result;
  }, []);

  const addMaterial = useCallback((raw: AssetCard): LibraryWriteResult => {
    if (!raw?.name?.trim() || !raw?.kind?.trim()) {
      return { ok: false, reason: "invalid" };
    }
    let result: LibraryWriteResult = { ok: false, reason: "quota" };
    setMaterials((prev) => {
      // 视频按 videoUrl / mediaRef 额外去重
      const media = raw.mediaRef || raw.videoUrl;
      if (media && prev.some((m) => (m.mediaRef || m.videoUrl) === media)) {
        const hit = prev.find((m) => (m.mediaRef || m.videoUrl) === media)!;
        result = { ok: true, action: "skipped", item: hit };
        return prev;
      }
      const { next, action, item } = upsertList(prev, raw);
      const saved = save(scoped(MATERIALS_KEY), next);
      result = saved
        ? { ok: true, action, item }
        : { ok: false, reason: "quota", item };
      return saved ? next : prev;
    });
    return result;
  }, []);

  const updateAsset = useCallback((raw: AssetCard, bucket: "works" | "materials" = "works"): LibraryWriteResult => {
    if (bucket === "materials") return addMaterial(raw);
    return addWork(raw);
  }, [addWork, addMaterial]);

  const removeWork = useCallback((item: AssetCard) => {
    const k = assetKey(item);
    const dk = assetDedupeKey(item);
    setWorks((prev) => {
      const next = prev.filter((w) => assetKey(w) !== k && assetDedupeKey(w) !== dk);
      if (next.length !== prev.length) {
        save(scoped(WORKS_KEY), next);
        return next;
      }
      return prev;
    });
    setHiddenWorks((prev) => {
      const keys = Array.from(new Set([...prev, k, dk]));
      if (keys.length === prev.length) return prev;
      save(scoped(HIDDEN_WORKS_KEY), keys);
      return keys;
    });
  }, []);

  const removeMaterial = useCallback((item: AssetCard) => {
    const k = assetKey(item);
    const dk = assetDedupeKey(item);
    setMaterials((prev) => {
      const next = prev.filter((m) => assetKey(m) !== k && assetDedupeKey(m) !== dk);
      if (next.length !== prev.length) {
        save(scoped(MATERIALS_KEY), next);
        return next;
      }
      return prev;
    });
    setHiddenMaterials((prev) => {
      const keys = Array.from(new Set([...prev, k, dk]));
      if (keys.length === prev.length) return prev;
      save(scoped(HIDDEN_MATERIALS_KEY), keys);
      return keys;
    });
  }, []);

  const toggleFavorite = useCallback((item: AssetCard) => {
    const k = assetKey(item);
    const dk = assetDedupeKey(item);
    setFavorites((prev) => {
      const on = prev.includes(k) || prev.includes(dk);
      const next = on
        ? prev.filter((x) => x !== k && x !== dk)
        : [...prev, k];
      save(scoped(FAVORITES_KEY), next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (item: AssetCard) => {
      const k = assetKey(item);
      const dk = assetDedupeKey(item);
      return favorites.includes(k) || favorites.includes(dk);
    },
    [favorites],
  );

  return (
    <LibraryContext.Provider
      value={{
        works,
        materials,
        hiddenWorks,
        hiddenMaterials,
        favorites,
        addWork,
        addMaterial,
        updateAsset,
        removeWork,
        removeMaterial,
        toggleFavorite,
        isFavorite,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary 必须在 LibraryProvider 内使用");
  return ctx;
}

/** 生成新条目建议 id（调用方可预先指定） */
export function createAssetId(): string {
  return newId();
}
