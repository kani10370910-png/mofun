/** 一次性剔除 localStorage 里体积过大的内嵌图，释放浏览器配额 */
const CLEAN_KEY = "mofun.storage.cleaned-v3";

function slimImgField<T extends { img?: string; videoUrl?: string; text?: string }>(x: T): T {
  const next = { ...x };
  if (typeof next.img === "string" && (next.img.startsWith("data:") || next.img.startsWith("blob:"))) {
    next.img = undefined;
  }
  if (typeof next.videoUrl === "string" && next.videoUrl.startsWith("blob:")) {
    next.videoUrl = undefined;
  }
  if (typeof next.text === "string" && next.text.length > 40_000) {
    next.text = `${next.text.slice(0, 40_000)}\n…（已截断）`;
  }
  return next;
}

export function purgeLocalStorageBloatOnce() {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(CLEAN_KEY)) return;
  try {
    window.localStorage.removeItem("mofun-case-imgs-v1");
    for (const key of ["mofun.works", "mofun.materials"] as const) {
      const w = window.localStorage.getItem(key);
      if (!w) continue;
      const arr = JSON.parse(w) as Array<{ img?: string; videoUrl?: string; text?: string }>;
      window.localStorage.setItem(key, JSON.stringify(arr.map(slimImgField)));
    }
    window.localStorage.setItem(CLEAN_KEY, "1");
  } catch {
    /* ignore */
  }
}
