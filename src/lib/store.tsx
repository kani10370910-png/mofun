"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AssetCard } from "@/lib/types";

/* 用户「我的作品 / 我的素材」运行时仓库：
   品牌设计/视频等模块「储存」后写入这里，仓库页读取展示；localStorage 持久化。
   删除：用户保存的直接移除；种子数据（data/storage）不可改，记入「已隐藏」集合过滤掉。 */

/** 作品/素材唯一标识（用于去重、删除、隐藏、收藏）：按 类型 + 名称，
   与 addWork 去重口径一致，保证收藏状态在「生成历史」与「仓库」之间互通。 */
export function assetKey(item: AssetCard): string {
  return `${item.kind}|${item.name}`;
}

interface LibraryState {
  works: AssetCard[];
  materials: AssetCard[];
  hiddenWorks: string[];
  hiddenMaterials: string[];
  favorites: string[];
  addWork: (item: AssetCard) => void;
  addMaterial: (item: AssetCard) => void;
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

function save(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 忽略写入失败（隐私模式等） */
  }
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [works, setWorks] = useState<AssetCard[]>([]);
  const [materials, setMaterials] = useState<AssetCard[]>([]);
  const [hiddenWorks, setHiddenWorks] = useState<string[]>([]);
  const [hiddenMaterials, setHiddenMaterials] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  // 挂载后从 localStorage 读取（避免 SSR 不一致）
  useEffect(() => {
    setWorks(load(WORKS_KEY));
    setMaterials(load(MATERIALS_KEY));
    setHiddenWorks(loadKeys(HIDDEN_WORKS_KEY));
    setHiddenMaterials(loadKeys(HIDDEN_MATERIALS_KEY));
    setFavorites(loadKeys(FAVORITES_KEY));
  }, []);

  const addWork = useCallback((item: AssetCard) => {
    setWorks((prev) => {
      // 按 名称 + 类型 去重，避免自动保存与手动保存、或重复触发产生重复卡片
      if (prev.some((w) => w.name === item.name && w.kind === item.kind)) return prev;
      const next = [item, ...prev];
      save(WORKS_KEY, next);
      return next;
    });
  }, []);

  const addMaterial = useCallback((item: AssetCard) => {
    setMaterials((prev) => {
      const next = [item, ...prev];
      save(MATERIALS_KEY, next);
      return next;
    });
  }, []);

  const removeWork = useCallback((item: AssetCard) => {
    const k = assetKey(item);
    // 先尝试从用户保存列表删除
    setWorks((prev) => {
      const next = prev.filter((w) => assetKey(w) !== k);
      if (next.length !== prev.length) {
        save(WORKS_KEY, next);
        return next;
      }
      return prev;
    });
    // 种子数据无法真正删除 —— 记入隐藏集合
    setHiddenWorks((prev) => {
      if (prev.includes(k)) return prev;
      const next = [...prev, k];
      save(HIDDEN_WORKS_KEY, next);
      return next;
    });
  }, []);

  const removeMaterial = useCallback((item: AssetCard) => {
    const k = assetKey(item);
    setMaterials((prev) => {
      const next = prev.filter((m) => assetKey(m) !== k);
      if (next.length !== prev.length) {
        save(MATERIALS_KEY, next);
        return next;
      }
      return prev;
    });
    setHiddenMaterials((prev) => {
      if (prev.includes(k)) return prev;
      const next = [...prev, k];
      save(HIDDEN_MATERIALS_KEY, next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((item: AssetCard) => {
    const k = assetKey(item);
    setFavorites((prev) => {
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      save(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const isFavorite = useCallback((item: AssetCard) => favorites.includes(assetKey(item)), [favorites]);

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
