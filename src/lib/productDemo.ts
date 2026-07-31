/** 商拍 DEMO/离线演示：静态导出无 /api/image 时，用本地抠图·画布合成·预置案例图出图 */

import { DEMO, demoWait } from "@/lib/demo";
import { asset } from "@/lib/asset";
import { cutoutProduct } from "@/lib/productCutout";
import {
  PRODUCT_AI_SCENE_COLOR,
  PRODUCT_AI_SCENE_NONE,
  PRODUCT_AI_SCENE_WHITE,
  PRODUCT_AI_SCENE_UPLOAD,
} from "@/data/productStudio";

export const DEMO_PRODUCT_CASES = {
  white: asset("/productcase/tea-white.png"),
  garden: asset("/productcase/tea-garden.png"),
  homestay: asset("/productcase/tea-homestay.png"),
  mix: asset("/productcase/product-mix-seed.png"),
} as const;

/** 场景预设 → 本地底图（随站发布的 productcase） */
const SCENE_BG: Record<string, string> = {
  高山茶园: asset("/productcase/scene-tea-garden.png"),
  竹林青石: asset("/productcase/scene-bamboo.png"),
  稻田秋收: asset("/productcase/scene-rice.png"),
  果园枝头: asset("/productcase/scene-orchard.png"),
  山泉溪边: asset("/productcase/scene-spring.png"),
  农家餐桌: asset("/productcase/scene-table.png"),
  民宿窗台: asset("/productcase/scene-homestay.png"),
  厨房料理: asset("/productcase/scene-kitchen.png"),
  原木静物: asset("/productcase/scene-wood.png"),
  节日礼赠: asset("/productcase/scene-gift.png"),
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("img"));
    img.src = url;
  });
}

/** 纯色底 / 白底：本地抠图铺色；失败则居中贴商品图 */
async function demoSolidBg(productImg: string, color: string): Promise<string> {
  try {
    return await cutoutProduct(productImg, "color", color);
  } catch {
    const img = await loadImage(productImg);
    const size = 1024;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) return productImg;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    const scale = Math.min((size * 0.72) / img.width, (size * 0.72) / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return c.toDataURL("image/png");
  }
}

/** 场景底：商品主体叠到预置场景图上 */
async function demoSceneComposite(productImg: string, scenePreset: string): Promise<string> {
  const bgUrl = SCENE_BG[scenePreset] || DEMO_PRODUCT_CASES.garden;
  const [bg, product] = await Promise.all([loadImage(bgUrl), loadImage(productImg)]);
  const w = 1080;
  const h = 1080;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return DEMO_PRODUCT_CASES.garden;

  // 铺满背景
  const bgScale = Math.max(w / bg.width, h / bg.height);
  ctx.drawImage(bg, (w - bg.width * bgScale) / 2, (h - bg.height * bgScale) / 2, bg.width * bgScale, bg.height * bgScale);

  // 商品放底部中央（商拍常见构图）
  let fg = product;
  try {
    const cut = await cutoutProduct(productImg, "transparent");
    fg = await loadImage(cut);
  } catch { /* 抠图失败就用原图 */ }

  const maxW = w * 0.55;
  const maxH = h * 0.58;
  const scale = Math.min(maxW / fg.width, maxH / fg.height);
  const dw = fg.width * scale;
  const dh = fg.height * scale;
  const x = (w - dw) / 2;
  const y = h - dh - h * 0.08;
  // 轻阴影
  ctx.shadowColor = "rgba(0,0,0,.28)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 12;
  ctx.drawImage(fg, x, y, dw, dh);
  ctx.shadowColor = "transparent";
  return c.toDataURL("image/jpeg", 0.92);
}

/** 补充图场景：两图并排合成即最终演示结果 */
async function demoMixComposite(productImg: string, extraImg: string): Promise<string> {
  const load = (src: string) => loadImage(src);
  try {
    const [a, b] = await Promise.all([load(productImg), load(extraImg)]);
    const w = 1536;
    const h = 1024;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return DEMO_PRODUCT_CASES.mix;
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, w, h);
    const gap = 28;
    const pad = 36;
    const cellW = Math.floor((w - pad * 2 - gap) / 2);
    const cellH = h - pad * 2;
    [a, b].forEach((img, i) => {
      const scale = Math.min(cellW / img.width, cellH / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const x = pad + i * (cellW + gap) + (cellW - dw) / 2;
      const y = pad + (cellH - dh) / 2;
      ctx.fillStyle = "#fff";
      ctx.fillRect(pad + i * (cellW + gap), pad, cellW, cellH);
      ctx.drawImage(img, x, y, dw, dh);
    });
    return c.toDataURL("image/png");
  } catch {
    return DEMO_PRODUCT_CASES.mix;
  }
}

export type ProductDemoJob = {
  bgMode: string;
  scenePreset: string;
  bgColor: string;
  productImg: string;
  fusionImg?: string;
  /** 图生图参考（mix 时已合成的双图） */
  refImage?: string;
};

/**
 * 离线出一张商拍图。优先用用户上传图做本地合成；失败再用预置案例图。
 */
export async function demoProductGenerate(job: ProductDemoJob): Promise<string> {
  await demoWait(800 + Math.min(1200, (job.productImg?.length || 0) % 800));

  if (job.bgMode === "aiscene" || job.bgMode === "scene") {
    const preset = job.scenePreset;
    if (preset === PRODUCT_AI_SCENE_UPLOAD) {
      if (job.refImage) return job.refImage;
      if (job.productImg && job.fusionImg) return demoMixComposite(job.productImg, job.fusionImg);
      return job.fusionImg || job.productImg || DEMO_PRODUCT_CASES.mix;
    }
    if (preset === PRODUCT_AI_SCENE_COLOR || preset === PRODUCT_AI_SCENE_WHITE) {
      const color = preset === PRODUCT_AI_SCENE_WHITE ? "#FFFFFF" : job.bgColor || "#FFFFFF";
      if (job.productImg) return demoSolidBg(job.productImg, color);
      return DEMO_PRODUCT_CASES.white;
    }
    if (preset === PRODUCT_AI_SCENE_NONE) {
      if (job.productImg) return demoSolidBg(job.productImg, "#FFFFFF");
      return DEMO_PRODUCT_CASES.white;
    }
    // 产地/生活场景
    if (job.productImg) {
      try {
        return await demoSceneComposite(job.productImg, preset);
      } catch {
        return SCENE_BG[preset] || DEMO_PRODUCT_CASES.garden;
      }
    }
    return SCENE_BG[preset] || DEMO_PRODUCT_CASES.garden;
  }

  // 其它：有参考用参考，否则预置白底
  return job.refImage || job.productImg || DEMO_PRODUCT_CASES.white;
}

/** 是否应走离线演示（静态 DEMO，或探测到无文生图后端） */
export function shouldUseProductDemo(): boolean {
  return DEMO;
}
