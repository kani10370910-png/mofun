/** 社媒推文 / 品牌推广 · 生成历史本地存储 */

import type { ParsedSocialPlan } from "@/components/content/SocialPlanResult";

export interface SocialPlanHistoryItem {
  id: string;
  kind: "social" | "brand";
  product: string;
  title: string;
  time: string;
  plan: ParsedSocialPlan;
  raw?: string;
  intent?: string;
  platforms?: string[];
  regionEnhance?: boolean;
  regionId?: string;
}

import { identityScopedStorageKey } from "@/lib/identity";

const KEY = "mofun.socialPlans";
function storageKey() {
  return identityScopedStorageKey(KEY);
}
const MAX = 40;

export function loadSocialPlans(): SocialPlanHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SocialPlanHistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSocialPlans(rows: SocialPlanHistoryItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(rows.slice(0, MAX)));
  } catch (e) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
      window.dispatchEvent(new CustomEvent("mofun:storage-quota"));
    }
  }
}

export function addSocialPlan(row: SocialPlanHistoryItem): SocialPlanHistoryItem[] {
  const next = [row, ...loadSocialPlans().filter((r) => r.id !== row.id)].slice(0, MAX);
  saveSocialPlans(next);
  return next;
}

export function removeSocialPlan(id: string): SocialPlanHistoryItem[] {
  const next = loadSocialPlans().filter((r) => r.id !== id);
  saveSocialPlans(next);
  return next;
}
