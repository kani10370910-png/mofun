import type { EventRunRow } from "@/components/image/ActiveGallery";
import { identityScopedStorageKey } from "@/lib/identity";

const KEY = "mofun.signageRuns";
function storageKey() {
  return identityScopedStorageKey(KEY);
}

function slimRuns(rows: EventRunRow[]): EventRunRow[] {
  return rows.map((r) => ({
    ...r,
    imgs: r.imgs.map((u) => (u.startsWith("data:") || u.startsWith("blob:") ? "" : u)),
  }));
}

export function loadSignageRuns(): EventRunRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EventRunRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSignageRuns(rows: EventRunRow[]) {
  if (typeof window === "undefined") return;
  if (rows.some((r) => r.pct < 100 && !r.error)) return;
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(slimRuns(rows)));
  } catch (e) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
      window.dispatchEvent(new CustomEvent("mofun:storage-quota"));
    }
  }
}
