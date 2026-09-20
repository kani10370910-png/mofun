import type { EventRunRow } from "@/components/image/ActiveGallery";
import { SEED_PRODUCT_RUNS } from "@/data/productSeeds";

import { identityScopedStorageKey } from "@/lib/identity";

const KEY = "mofun.productRuns";
function storageKey() {
  return identityScopedStorageKey(KEY);
}

/** 去掉 data URL 等大字段，避免撑爆 localStorage */
function slimRuns(rows: EventRunRow[]): EventRunRow[] {
  return rows.map((r) => ({
    ...r,
    imgs: r.imgs.map((u) => (u.startsWith("data:") || u.startsWith("blob:") ? "" : u)),
  }));
}

export function loadProductRuns(): EventRunRow[] {
  if (typeof window === "undefined") return SEED_PRODUCT_RUNS;
  const key = storageKey();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return key === KEY ? SEED_PRODUCT_RUNS : [];
    const parsed = JSON.parse(raw) as EventRunRow[];
    if (!parsed.length) return key === KEY ? SEED_PRODUCT_RUNS : [];
    const seedMap = new Map(SEED_PRODUCT_RUNS.map((s) => [s.id, s]));
    return parsed.map((r) => {
      const s = seedMap.get(r.id);
      if (!s) return r;
      return {
        ...r,
        regionEnhance: r.regionEnhance ?? s.regionEnhance,
        regionId: r.regionId ?? s.regionId,
      };
    });
  } catch {
    return key === KEY ? SEED_PRODUCT_RUNS : [];
  }
}

export function saveProductRuns(rows: EventRunRow[]) {
  if (typeof window === "undefined") return;
  // 生成进度中不写盘，避免每 500ms 触发一次保存失败
  if (rows.some((r) => r.pct < 100 && !r.error)) return;
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(slimRuns(rows)));
  } catch (e) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
      window.dispatchEvent(new CustomEvent("mofun:storage-quota"));
    }
  }
}

/** 首次访问或版本升级：注入商拍预置假数据（本地无记录时） */
export function ensureProductSeedsLocal() {
  if (typeof window === "undefined") return;
  const SEED_VER = "2026-07-29-mix-seed-v2";
  if (window.localStorage.getItem("mofun.productRuns.ver") === SEED_VER) return;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as EventRunRow[]) : [];
    if (!parsed.length) {
      window.localStorage.setItem(KEY, JSON.stringify(slimRuns(SEED_PRODUCT_RUNS)));
    }
    window.localStorage.setItem("mofun.productRuns.ver", SEED_VER);
  } catch { /* ignore */ }
}
