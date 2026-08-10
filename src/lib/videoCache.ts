/* 生成视频的本地缓存：把外链视频的 blob 存入浏览器 IndexedDB（key = 原始视频 URL）。
   目的：生成的分镜视频自动缓存到本地，之后查看 / 下载优先用本地缓存，
   即使外部 CDN 直链过期或抖动也能稳定播放、下载。IndexedDB 不可用时静默降级（不影响功能）。 */

const DB_NAME = "mofun-media";
const STORE = "videos";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

/** 读取缓存的视频 blob；未命中或出错返回 null。 */
export async function getCachedVideo(key: string): Promise<Blob | null> {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** 写入 / 覆盖缓存的视频 blob；失败静默忽略。 */
export async function putCachedVideo(key: string, blob: Blob): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** 删除缓存条目（仓库删视频时清理孤儿 blob）。 */
export async function deleteCachedVideo(key: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** 从 mediaRef（`idb:runId` / https）解析可播放地址；idb 命中时返回 objectURL（调用方负责 revoke）。 */
export async function resolveMediaRef(mediaRef?: string): Promise<string | null> {
  if (!mediaRef?.trim()) return null;
  const ref = mediaRef.trim();
  if (/^https?:\/\//i.test(ref) || ref.startsWith("blob:") || ref.startsWith("/")) return ref;
  if (ref.startsWith("idb:")) {
    const key = ref.slice(4);
    const blob = await getCachedVideo(key);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }
  // 兜底：当作 IndexedDB key
  const blob = await getCachedVideo(ref);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

/** 仓库卡片：优先外链 videoUrl，否则解析 mediaRef。返回 { url, revoke? }。 */
export async function resolveAssetPlayback(item: {
  videoUrl?: string;
  mediaRef?: string;
}): Promise<{ url: string; revoke?: () => void } | null> {
  const direct = item.videoUrl?.trim();
  if (direct && !direct.startsWith("blob:")) {
    return { url: direct };
  }
  if (direct?.startsWith("blob:")) {
    return { url: direct };
  }
  const resolved = await resolveMediaRef(item.mediaRef);
  if (!resolved) return null;
  if (resolved.startsWith("blob:")) {
    return { url: resolved, revoke: () => URL.revokeObjectURL(resolved) };
  }
  return { url: resolved };
}
