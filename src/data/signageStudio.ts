import type { SizePreset } from "@/lib/types";

/* ============================================================
   店招设计 · 线上店招工作台（P0）
   ============================================================ */

/** 店招固定生图模型：即梦 Seedream（不提供前端切换） */
export const SIGNAGE_IMAGE_MODEL = "Seedream-5.0-lite";

export const SIGNAGE_DEAI_SUFFIX =
  "高清商业设计，店名文字清晰可读无乱码，非竖构图海报，非手机截图，非低清拉伸";

export const SIGNAGE_LOGO_KEEP =
  "【必须严格保留参考图中的 Logo 图形与配色】位置可微调，禁止改绘或替换品牌标识";

export type SignageChannel = "online" | "storefront";
export type SignageStorefrontType = "沿街门头" | "商场店铺" | "园区门头" | "景区门脸";
export interface SignageStorefrontSizePreset {
  name: string;
  w: number;
  h: number;
}

export type SignagePlatformKey =
  | "tb_banner"
  | "tb_pc"
  | "tb_wireless"
  | "tmall_banner"
  | "jd_banner"
  | "custom";

export interface SignagePlatform {
  key: SignagePlatformKey;
  name: string;
  sizeName: string;
  w: number;
  h: number;
  hint?: string;
}

/** 上架平台 → 尺寸联动 */
export const signagePlatforms: SignagePlatform[] = [
  { key: "tb_banner", name: "淘宝通栏", sizeName: "淘宝通栏1920×150", w: 1920, h: 150, hint: "全屏页头背景" },
  { key: "tb_pc", name: "淘宝PC招牌", sizeName: "淘宝PC950×120", w: 950, h: 120, hint: "默认招牌高度宜 ≤120" },
  { key: "tb_wireless", name: "无线店招", sizeName: "无线750×200", w: 750, h: 200, hint: "核心信息居中" },
  { key: "tmall_banner", name: "天猫通栏", sizeName: "天猫通栏1920×150", w: 1920, h: 150 },
  { key: "jd_banner", name: "京东通栏", sizeName: "京东通栏1920×150", w: 1920, h: 150 },
  { key: "custom", name: "自定义", sizeName: "自定义", w: 1920, h: 150 },
];

export const signageStudioSizes: SizePreset[] = [
  { name: "自定义", size: "自定义宽高", ico: "szLandscape" },
  ...signagePlatforms
    .filter((p) => p.key !== "custom")
    .map((p) => ({
      name: p.sizeName,
      size: `${p.w} × ${p.h} px`,
      ico: "szLandscape" as const,
    })),
];
export const signageStorefrontSizePresets: SignageStorefrontSizePreset[] = [
  { name: "沿街门头2400×800", w: 2400, h: 800 },
  { name: "标准门头3000×1000", w: 3000, h: 1000 },
  { name: "窄门头2000×700", w: 2000, h: 700 },
  { name: "方形灯箱1200×1200", w: 1200, h: 1200 },
];
export const signageStorefrontSizes: SizePreset[] = [
  { name: "自定义", size: "自定义宽高", ico: "szLandscape" },
  ...signageStorefrontSizePresets.map((p) => ({
    name: p.name,
    size: `${p.w} × ${p.h} px`,
    ico: "szLandscape" as const,
  })),
];

export const signageIndustries = ["茶叶", "特产生鲜", "餐饮农家乐", "文旅景区", "手作伴手礼"] as const;
export const signageStyles = ["新中式", "国潮", "清新产地", "促销爆款", "简约高级"] as const;
export const signageStorefrontTypes: SignageStorefrontType[] = ["沿街门头", "商场店铺", "园区门头", "景区门脸"];

export type SignageIndustry = (typeof signageIndustries)[number];
export type SignageStyle = (typeof signageStyles)[number];

export function platformByKey(key: SignagePlatformKey): SignagePlatform {
  return signagePlatforms.find((p) => p.key === key) || signagePlatforms[0];
}

export function platformBySizeName(sizeName: string): SignagePlatform | undefined {
  return signagePlatforms.find((p) => p.sizeName === sizeName);
}

export function storefrontSizeByName(sizeName: string): SignageStorefrontSizePreset | undefined {
  return signageStorefrontSizePresets.find((p) => p.name === sizeName);
}

export function resolveSignageSize(opts: {
  channel: SignageChannel;
  size: string;
  customW: string;
  customH: string;
  platform: SignagePlatformKey;
}): { w: number; h: number } {
  if (opts.size === "自定义") {
    const w = Math.max(64, Number(opts.customW) || 0);
    const h = Math.max(64, Number(opts.customH) || 0);
    return { w, h };
  }
  if (opts.channel === "storefront") {
    const hit = storefrontSizeByName(opts.size);
    if (hit) return { w: hit.w, h: hit.h };
  }
  const plat = platformBySizeName(opts.size) || platformByKey(opts.platform);
  return { w: plat.w, h: plat.h };
}

/** 拼装店招出图提示词 */
export function buildSignagePrompt(opts: {
  channel: SignageChannel;
  shopName: string;
  slogan?: string;
  industry: string;
  style: string;
  sizeLabel: string;
  storefrontType?: SignageStorefrontType;
  hasLogo?: boolean;
  extra?: string;
}): string {
  const name = opts.shopName.trim() || "店铺名称";
  const slogan = opts.slogan?.trim();
  const extra = opts.extra?.trim();
  const logoPart = opts.hasLogo ? `${SIGNAGE_LOGO_KEEP}。` : "";
  if (opts.channel === "storefront") {
    const storefrontType = opts.storefrontType || "沿街门头";
    return (
      `${logoPart}实体门头招牌设计，门头类型：${storefrontType}，出图比例 ${opts.sizeLabel}，` +
      `主招牌店名「${name}」字形清晰醒目、远距离可读，` +
      `${slogan ? `副文案「${slogan}」，` : ""}` +
      `行业：${opts.industry}，风格：${opts.style}，` +
      `体现真实门头材质与安装结构（灯箱/立体字/底板），` +
      `可见门店立面场景与招牌关系，整体为商业实拍级视觉效果，` +
      `避免竖版海报排版、避免乱码、避免夸张失真，${SIGNAGE_DEAI_SUFFIX}` +
      `${extra ? `，${extra}` : ""}`
    );
  }
  return (
    `${logoPart}横版电商店招，尺寸比例 ${opts.sizeLabel}，` +
    `店铺名「${name}」大字清晰可读、置于水平安全区中央，` +
    `${slogan ? `副文案「${slogan}」，` : ""}` +
    `行业：${opts.industry}，风格：${opts.style}，` +
    `左右可有装饰但勿挡店名，适合淘宝/天猫页头，` +
    `非海报竖构图，非手机屏幕截图，高清商业设计，${SIGNAGE_DEAI_SUFFIX}` +
    `${extra ? `，${extra}` : ""}`
  );
}
