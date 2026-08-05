/** 公众号帮写 · 历史文章本地存储 */

export interface OfficialArticle {
  id: string;
  title: string;
  keywords: string;
  text: string;
  time: string;
  length?: string;
  style?: string;
  regionEnhance?: boolean;
  regionId?: string;
}

const KEY = "mofun.officialArticles";
const MAX = 30;

export function loadOfficialArticles(): OfficialArticle[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfficialArticle[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOfficialArticles(rows: OfficialArticle[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX)));
  } catch (e) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
      window.dispatchEvent(new CustomEvent("mofun:storage-quota"));
    }
  }
}

export function addOfficialArticle(row: OfficialArticle): OfficialArticle[] {
  const next = [row, ...loadOfficialArticles().filter((r) => r.id !== row.id)].slice(0, MAX);
  saveOfficialArticles(next);
  return next;
}
