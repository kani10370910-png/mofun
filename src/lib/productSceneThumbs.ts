/** 商拍场景预设缩略图：优先静态 productcase；有 API 时可选补生成并缓存 */

import { DEMO } from "@/lib/demo";
import { asset } from "@/lib/asset";
import { PRODUCT_IMAGE_MODEL, productScenePresets } from "@/data/productStudio";

const CACHE_KEY = "mofun.productSceneImgs.v1";

/** 内存缓存：即梦若返回大体积 data URL，localStorage 存不下，仍可供当次会话出图使用 */
let memCache: Record<string, string> = {};

export function loadProductSceneImgCache(): Record<string, string> {
  if (typeof window === "undefined") return { ...memCache };
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const disk = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    memCache = { ...disk, ...memCache };
    return { ...memCache };
  } catch {
    return { ...memCache };
  }
}

export function saveProductSceneImgCache(map: Record<string, string>) {
  memCache = { ...memCache, ...map };
  try {
    const slim: Record<string, string> = {};
    for (const [k, v] of Object.entries(memCache)) {
      if (!v) continue;
      if (v.startsWith("data:") && v.length > 80_000) continue;
      slim[k] = v;
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(slim));
  } catch {
    /* 存储满则跳过 */
  }
}

export function getCachedProductSceneImg(name: string): string | undefined {
  if (memCache[name]) return memCache[name];
  return loadProductSceneImgCache()[name];
}

/** 空景场景底图提示词（无商品），便于缩略图辨识与图生图参考 */
export function buildSceneThumbPrompt(name: string, scenePrompt: string): string {
  return (
    `空景商拍场景底图，画面中不要出现商品、人物、文字水印。` +
    `场景主题「${name}」：${scenePrompt}。` +
    `写实商业摄影，柔和自然光，构图留出前景台面或放置位，适合后续放置商品，高质量`
  );
}

export async function generateProductSceneThumb(name: string, scenePrompt: string): Promise<string> {
  const prompt = buildSceneThumbPrompt(name, scenePrompt);
  const r = await fetch("/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      prompt,
      size: "2048x2048",
      model: PRODUCT_IMAGE_MODEL,
    }),
  });
  const j = (await r.json()) as { images?: string[]; error?: string };
  if (!r.ok) throw new Error(j.error || "场景图生成失败");
  return j.images?.[0] || "";
}

/** 解析场景参考图：优先静态 productcase（可靠、无 CORS），其次即梦缓存 */
export function resolveProductSceneImg(name: string): string | undefined {
  const img = productScenePresets.find((s) => s.name === name)?.img;
  if (img) return asset(img);
  const cached = getCachedProductSceneImg(name);
  if (cached) return cached;
  return undefined;
}

/** 是否应跳过在线生成缩略图（DEMO / 已有静态图） */
export function shouldSkipSceneThumbGenerate(name: string): boolean {
  if (DEMO) return true;
  const preset = productScenePresets.find((s) => s.name === name);
  return !!preset?.img;
}
