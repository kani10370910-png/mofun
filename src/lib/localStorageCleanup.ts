/** 一次性剔除 localStorage 里体积过大的内嵌图，释放浏览器配额 */
const CLEAN_KEY = "mofun.storage.cleaned-v2";

export function purgeLocalStorageBloatOnce() {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(CLEAN_KEY)) return;
  try {
    window.localStorage.removeItem("mofun-case-imgs-v1");
    const w = window.localStorage.getItem("mofun.works");
    if (w) {
      const arr = JSON.parse(w) as Array<{ img?: string }>;
      window.localStorage.setItem(
        "mofun.works",
        JSON.stringify(
          arr.map((x) => ({
            ...x,
            img:
              typeof x.img === "string" && (x.img.startsWith("data:") || x.img.startsWith("blob:"))
                ? undefined
                : x.img,
          })),
        ),
      );
    }
    window.localStorage.setItem(CLEAN_KEY, "1");
  } catch {
    /* ignore */
  }
}
