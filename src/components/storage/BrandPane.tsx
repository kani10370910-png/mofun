"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import type { AssetCard, Brand, BrandAsset } from "@/lib/types";
import { asset } from "@/lib/asset";
import { useAuth } from "@/lib/AuthContext";
import { identityScopedStorageKey } from "@/lib/identity";
import { useLibrary, assetKey } from "@/lib/store";
import { LibraryPickerModal } from "@/components/image/LibraryPickerModal";
import { AssetCardView } from "./StorageView";

function safeFilename(name: string) {
  return (name || "asset").replace(/[\\/:*?"<>|]/g, "_");
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}

function downloadBrandAsset(a: BrandAsset, brandName: string, brandLogoSrc?: string) {
  const base = safeFilename(a.name);
  const logos = logoImgsOf(a);
  if ((a.type === "logo" || a.type === "custom") && logos.length) {
    logos.forEach((src, i) => {
      const href = asset(src);
      const ext = src.match(/^data:image\/(\w+)/)?.[1] || src.match(/\.(\w+)(?:$|\?)/)?.[1] || "png";
      const suffix = logos.length > 1 ? `-${i + 1}` : "";
      triggerDownload(href, `${base}${suffix}.${ext === "jpeg" ? "jpg" : ext}`);
    });
    return;
  }
  if (a.type === "logo" && brandLogoSrc) {
    const href = asset(brandLogoSrc);
    const ext = brandLogoSrc.match(/^data:image\/(\w+)/)?.[1] || brandLogoSrc.match(/\.(\w+)(?:$|\?)/)?.[1] || "png";
    triggerDownload(href, `${base}.${ext === "jpeg" ? "jpg" : ext}`);
    return;
  }
  if (a.type === "color" && a.colors?.length) {
    const css = a.colors.map((c, i) => `  --brand-color-${i + 1}: ${c};`).join("\n");
    downloadTextFile(
      `${base}.css`,
      `/* ${brandName} · ${a.name} */\n:root {\n${css}\n}\n/* ${a.sub} */\n`,
      "text/css;charset=utf-8",
    );
    return;
  }
  downloadTextFile(
    `${base}.txt`,
    [
      `${brandName} · ${a.name}`,
      `类型: ${a.type === "custom" ? a.customLabel || "自定义" : a.type}`,
      a.sub,
      a.colors?.length ? `色值: ${a.colors.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

function logoImgsOf(a: BrandAsset): string[] {
  if (a.imgs?.length) return a.imgs.filter(Boolean);
  if (a.img) return [a.img];
  return [];
}

function withLogoImgs(assetItem: BrandAsset): BrandAsset {
  if (assetItem.type === "logo" || assetItem.type === "custom") {
    const imgs = logoImgsOf(assetItem);
    return {
      ...assetItem,
      imgs,
      img: imgs[0],
      ...(assetItem.type === "custom" && assetItem.customLabel
        ? { customLabel: assetItem.customLabel }
        : {}),
    };
  }
  return {
    id: assetItem.id,
    type: assetItem.type,
    name: assetItem.name,
    sub: assetItem.sub,
    emoji: assetItem.emoji,
    colors: assetItem.colors,
  };
}

function downloadMaterialFile(item: AssetCard) {
  const src = item.img || item.videoUrl || item.mediaRef;
  if (src) {
    const href = asset(src);
    const ext = src.match(/\.(\w+)(?:$|\?)/)?.[1] || "png";
    triggerDownload(href, `${safeFilename(item.name)}.${ext}`);
    return true;
  }
  downloadTextFile(
    `${safeFilename(item.name)}.txt`,
    [`素材: ${item.name}`, `类型: ${item.kind}`, item.sub || ""].filter(Boolean).join("\n"),
  );
  return false;
}

function materialKeyOf(m: AssetCard) {
  return m.id || `${m.kind}|${m.name}|${m.img || m.mediaRef || ""}`;
}

/** 品牌文件角标只区分媒体类型，不展示「产品照 / 历史物料」等分类 */
function brandFileKindLabel(m: AssetCard) {
  if (m.kind === "视频" || m.videoUrl) return "视频";
  return "图片";
}

function colorSubLabel(colors: string[]) {
  const filled = colors.map((c) => c.trim()).filter(Boolean);
  const [c0, c1] = filled;
  if (c0 && c1) return `主色 ${c0.toUpperCase()} · 辅色 ${c1.toUpperCase()}`;
  if (c0) return `主色 ${c0.toUpperCase()}`;
  return EMPTY_ASSET_SUB;
}

const GRADS = ["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4", "thumb-grad-5", "thumb-grad-6"] as const;
const MINE_STORAGE_KEY = "mofun.brands.mine.v5";
const MINE_LEGACY_KEYS = ["mofun.brands.mine.v4", "mofun.brands.mine.v3"];
const OTHERS_STORAGE_KEY = "mofun.brands.others.v1";
const PUBLISHED_STORAGE_KEY = "mofun.brands.published.v1";
const HIDDEN_BRANDS_STORAGE_KEY = "mofun.brands.hidden.v1";
function brandStoreKey(base: string) {
  return identityScopedStorageKey(base);
}
const MINE_ID = "mine-primary";
const DEFAULT_COLORS = ["#188772", "#2bb89c", "#e6c07b", "#2d2d2d"];
const SEED_ASSET_IDS = new Set(["mine-a1", "mine-a2", "mine-a3", "mine-a4"]);
const EMPTY_ASSET_SUB = "还未填写";
const CORE_ASSET_TYPES = ["logo", "color", "font", "slogan"] as const;
type CoreAssetType = (typeof CORE_ASSET_TYPES)[number];

function isUserCompanyBrandId(id: string) {
  return id.startsWith("other-user-");
}

function canDeleteCompanyBrand(id: string) {
  return id !== MINE_ID;
}

function loadHiddenBrandIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(brandStoreKey(HIDDEN_BRANDS_STORAGE_KEY));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function hideBrandFromList(id: string) {
  if (typeof window === "undefined" || !id || id === MINE_ID) return;
  try {
    const hidden = loadHiddenBrandIds();
    hidden.add(id);
    window.localStorage.setItem(brandStoreKey(HIDDEN_BRANDS_STORAGE_KEY), JSON.stringify([...hidden]));
  } catch {
    /* ignore quota */
  }
}

function isPublishedBrandId(id: string) {
  return id.startsWith("pub-");
}

function isDemoPublishedCompanyId(companyId: string) {
  return companyId.startsWith("DEMO-PUB-");
}

type PublishedBrandRecord = {
  id: string;
  publisherCompanyId: string;
  publisherCompanyName: string;
  targetAccountId?: string;
  publishedAt: string;
  brand: Brand;
};

/** 固定演示：其他公司通过「发布给其他公司」共享的品牌（只读引用） */
function buildDemoPublishedRecords(): PublishedBrandRecord[] {
  const publishedAt = "2026-06-01T09:30:00.000Z";
  return [
    {
      id: "pub-DEMO-PUB-MOGAN",
      publisherCompanyId: "DEMO-PUB-MOGAN",
      publisherCompanyName: "莫干山民宿联盟",
      publishedAt,
      brand: {
        id: "pub-DEMO-PUB-MOGAN",
        name: "莫干山民宿联盟·旅居品牌",
        logo: "/poster-gen/hist-yucun.jpg",
        grad: "thumb-grad-3",
        industry: "文旅民宿",
        owned: false,
        assets: [
          {
            id: "demo-mg-a1",
            type: "logo",
            name: "莫干山民宿联盟 LOGO",
            sub: "已定稿 · 可用于合作门店与线上渠道",
            emoji: "",
            img: "/poster-gen/hist-yucun.jpg",
          },
          {
            id: "demo-mg-a2",
            type: "color",
            name: "标准色规范",
            sub: "主色 竹青 #2E7D5B · 辅色 暖木 #C4A574",
            colors: ["#2E7D5B", "#6FB3C9", "#C4A574", "#2d2d2d"],
          },
          {
            id: "demo-mg-a3",
            type: "font",
            name: "标准字体",
            sub: "标题 阿里巴巴普惠体 · 正文 思源黑体",
            emoji: "",
          },
          {
            id: "demo-mg-a4",
            type: "slogan",
            name: "品牌 Slogan",
            sub: "「来莫干山，住一晚治愈生活」",
            emoji: "",
          },
        ],
        works: [],
        materials: [
          {
            emoji: "",
            kind: "图片",
            name: "联盟门店门头.jpg",
            sub: "4032×3024",
            grad: "thumb-grad-3",
            img: "/poster-gen/hist-yucun.jpg",
          },
          {
            emoji: "",
            kind: "图片",
            name: "竹海景观航拍.jpg",
            sub: "6000×4000",
            grad: "thumb-grad-1",
            img: "/poster-gen/hist-baicha.jpg",
          },
        ],
      },
    },
    {
      id: "pub-DEMO-PUB-XUNWEI",
      publisherCompanyId: "DEMO-PUB-XUNWEI",
      publisherCompanyName: "浔味食品集团",
      publishedAt: "2026-05-18T14:00:00.000Z",
      brand: {
        id: "pub-DEMO-PUB-XUNWEI",
        name: "浔味食品·连锁品牌",
        logo: "/poster-gen/ins-baicha.jpg",
        grad: "thumb-grad-5",
        industry: "连锁餐饮 · 预包装食品",
        owned: false,
        assets: [
          {
            id: "demo-xw-a1",
            type: "logo",
            name: "浔味食品 LOGO",
            sub: "已定稿 · 门店与包装统一使用",
            emoji: "",
            img: "/poster-gen/ins-baicha.jpg",
          },
          {
            id: "demo-xw-a2",
            type: "color",
            name: "标准色规范",
            sub: "主色 酱红 #B84A3A · 辅色 米黄 #E8C07B",
            colors: ["#B84A3A", "#E8C07B", "#5A8F4E", "#2d2d2d"],
          },
          {
            id: "demo-xw-a3",
            type: "font",
            name: "标准字体",
            sub: "标题 站酷快乐体 · 正文 思源黑体",
            emoji: "",
          },
          {
            id: "demo-xw-a4",
            type: "slogan",
            name: "品牌 Slogan",
            sub: "「寻味江南，味在浔味」",
            emoji: "",
          },
        ],
        works: [],
        materials: [
          {
            emoji: "",
            kind: "图片",
            name: "招牌套餐实拍.jpg",
            sub: "2480×3508",
            grad: "thumb-grad-2",
            img: "/poster-gen/ins-baicha.jpg",
          },
          {
            emoji: "",
            kind: "图片",
            name: "标准店招效果.jpg",
            sub: "1920×1080",
            grad: "thumb-grad-5",
            img: "/poster-gen/ins-yucun.jpg",
          },
          {
            emoji: "",
            kind: "图片",
            name: "礼盒包装主视觉.png",
            sub: "2000×2000",
            grad: "thumb-grad-6",
            img: "/poster-gen/hist-yucun.jpg",
          },
        ],
      },
    },
  ];
}

function slotIdPrefix(brandId: string) {
  if (brandId === MINE_ID) return "mine";
  return brandId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "brand";
}

function isCoreAssetType(type: BrandAsset["type"]): type is CoreAssetType {
  return (CORE_ASSET_TYPES as readonly string[]).includes(type);
}

function coreAssetMeta(type: CoreAssetType): { name: string; emoji: string; idSuffix: string } {
  switch (type) {
    case "logo":
      return { name: "品牌 LOGO", emoji: "", idSuffix: "logo" };
    case "color":
      return { name: "标准色规范", emoji: "", idSuffix: "color" };
    case "font":
      return { name: "标准字体", emoji: "", idSuffix: "font" };
    case "slogan":
      return { name: "品牌 Slogan", emoji: "", idSuffix: "slogan" };
  }
}

function createEmptyCoreAsset(type: CoreAssetType, idPrefix = "mine"): BrandAsset {
  const meta = coreAssetMeta(type);
  return {
    id: `${idPrefix}-slot-${meta.idSuffix}`,
    type,
    name: meta.name,
    sub: EMPTY_ASSET_SUB,
    emoji: meta.emoji,
    ...(type === "color" ? { colors: [] } : {}),
  };
}

function isAssetFilled(a: BrandAsset): boolean {
  if (a.type === "logo" || a.type === "custom") {
    if (logoImgsOf(a).length > 0) return true;
    const s = (a.sub || "").trim();
    return !!s && s !== EMPTY_ASSET_SUB;
  }
  if (a.type === "color") {
    return (a.colors ?? []).some((c) => !!c?.trim());
  }
  const s = (a.sub || "").trim();
  return !!s && s !== EMPTY_ASSET_SUB;
}

function assetSubDisplay(a: BrandAsset): string {
  if (!isAssetFilled(a)) return EMPTY_ASSET_SUB;
  if (a.type === "color") return colorSubLabel(a.colors ?? []);
  return (a.sub || "").trim() || EMPTY_ASSET_SUB;
}

/** 四项默认资产固定展示标准名称，不用上传文件名 */
function assetTitleDisplay(a: BrandAsset): string {
  if (isCoreAssetType(a.type)) return coreAssetMeta(a.type).name;
  return a.name?.trim() || "未命名资产";
}

/** 保证 LOGO / 标准色 / 字体 / Slogan 四个默认项始终存在 */
function ensureCoreAssets(assets: BrandAsset[], idPrefix = "mine"): BrandAsset[] {
  const list = Array.isArray(assets) ? assets : [];
  const customs = list.filter((a) => a.type === "custom");
  const extras = list.filter((a) => a.type !== "custom" && !isCoreAssetType(a.type));
  const cores = CORE_ASSET_TYPES.map((type) => {
    const existing = list.find((a) => a.type === type);
    if (!existing) return createEmptyCoreAsset(type, idPrefix);
    const filled = isAssetFilled(existing);
    return {
      ...existing,
      name: coreAssetMeta(type).name,
      sub: filled ? existing.sub : EMPTY_ASSET_SUB,
      colors: type === "color" ? existing.colors ?? [] : existing.colors,
      emoji: existing.emoji || coreAssetMeta(type).emoji,
    };
  });
  return [...cores, ...customs, ...extras];
}

function resetCoreAsset(a: BrandAsset): BrandAsset {
  if (!isCoreAssetType(a.type)) return a;
  return {
    id: a.id,
    type: a.type,
    name: coreAssetMeta(a.type).name,
    sub: EMPTY_ASSET_SUB,
    emoji: a.emoji || coreAssetMeta(a.type).emoji,
    ...(a.type === "color" ? { colors: [] } : {}),
  };
}

function readImageFiles(files: FileList | File[]): Promise<AssetCard[]> {
  const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
  return Promise.all(
    list.map(
      (file, i) =>
        new Promise<AssetCard | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = typeof reader.result === "string" ? reader.result : "";
            if (!dataUrl) {
              resolve(null);
              return;
            }
            const now = new Date();
            resolve({
              id: `mat-${now.getTime()}-${i}`,
              emoji: "",
              kind: "图片",
              name: file.name.replace(/\.[^.]+$/, "") || "未命名素材",
              sub: `${Math.round(file.size / 1024)} KB`,
              grad: GRADS[i % GRADS.length],
              img: dataUrl,
              module: "upload",
              time: "刚刚",
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
              edit: { source: "upload", sub: "其他" },
            });
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        }),
    ),
  ).then((rows) => rows.filter((x): x is AssetCard => !!x));
}

/** 账户「我的品牌」：有且仅有一个；默认带 4 项核心资产槽位 */
function createDefaultMineBrand(): Brand {
  return {
    id: MINE_ID,
    name: "我的品牌",
    industry: "",
    logo: "/brand-logo.png",
    grad: GRADS[0],
    owned: true,
    assets: ensureCoreAssets([], "mine"),
    works: [],
    materials: [],
  };
}

function hasRealMaterialFile(m: AssetCard) {
  return !!(m.img || m.mediaRef || m.videoUrl);
}

/** 纯演示种子（无真实上传）→ 视为未上传，展示为空槽位 */
function isPureDemoMine(b: Brand) {
  const assetsAreSeed =
    b.assets.length === 0 ||
    b.assets.every(
      (a) =>
        SEED_ASSET_IDS.has(a.id) ||
        a.id.startsWith("mine-slot-") ||
        (isCoreAssetType(a.type) && !isAssetFilled(a)),
    );
  const noRealMaterials = b.materials.every((m) => !hasRealMaterialFile(m));
  const noRealLogo = !b.assets.some((a) => a.type === "logo" && logoImgsOf(a).length > 0);
  const hasCustom = b.assets.some((a) => a.type === "custom" && isAssetFilled(a));
  const coresEmpty = CORE_ASSET_TYPES.every((type) => {
    const a = b.assets.find((x) => x.type === type);
    return !a || !isAssetFilled(a);
  });
  return assetsAreSeed && coresEmpty && noRealMaterials && noRealLogo && !hasCustom;
}

function sanitizeMineBrand(raw: Brand): Brand {
  const b = normalizeMineBrand(raw);
  if (isPureDemoMine(b)) return createDefaultMineBrand();
  return {
    ...b,
    // 未实际上传文件的占位素材不展示
    materials: b.materials.filter(hasRealMaterialFile),
    works: Array.isArray(b.works) ? b.works : [],
  };
}

function normalizeMineBrand(raw: Brand): Brand {
  return {
    ...raw,
    id: MINE_ID,
    name: "我的品牌",
    owned: true,
    logo: raw.logo || "/brand-logo.png",
    assets: ensureCoreAssets(Array.isArray(raw.assets) ? raw.assets : [], "mine"),
    works: Array.isArray(raw.works) ? raw.works : [],
    materials: Array.isArray(raw.materials) ? raw.materials : [],
  };
}

function readStoredMine(key: string): Brand | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Brand | Brand[];
    const one = Array.isArray(parsed) ? parsed.find((b) => b?.owned) || parsed[0] : parsed;
    if (!one || typeof one !== "object") return null;
    return sanitizeMineBrand(one);
  } catch {
    return null;
  }
}

function loadMineBrand(): Brand {
  if (typeof window === "undefined") return createDefaultMineBrand();
  const current = readStoredMine(brandStoreKey(MINE_STORAGE_KEY));
  if (current) return current;
  if (brandStoreKey(MINE_STORAGE_KEY) === MINE_STORAGE_KEY) {
    for (const key of MINE_LEGACY_KEYS) {
      const legacy = readStoredMine(key);
      if (legacy && (legacy.assets.length > 0 || legacy.materials.length > 0)) return legacy;
    }
  }
  return createDefaultMineBrand();
}

function saveMineBrand(brand: Brand) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      brandStoreKey(MINE_STORAGE_KEY),
      JSON.stringify({ ...brand, id: MINE_ID, name: "我的品牌", owned: true }),
    );
  } catch {
    /* ignore quota */
  }
}

/** 其他公司品牌（只读参考）：固定三家演示 */
function otherCompanyBrands(seed: Brand[]): Brand[] {
  const list = (seed.length >= 3 ? seed.slice(0, 3) : seed).map((b, i) => {
    const copy = JSON.parse(JSON.stringify(b)) as Brand;
    return {
      ...copy,
      id: `other-${copy.id || i + 1}`,
      owned: false,
      logo: /^(\/|https?:|data:)/.test(copy.logo) ? copy.logo : "/brand-logo.png",
    };
  });
  while (list.length < 3) {
    const n = list.length + 1;
    list.push({
      id: `other-demo-${n}`,
      name: `示例企业 ${n}`,
      industry: "其他行业",
      logo: "/brand-logo.png",
      grad: GRADS[n % GRADS.length],
      owned: false,
      assets: [],
      works: [],
      materials: [],
    });
  }
  return list.slice(0, 3);
}

function normalizeUserCompanyBrand(raw: Brand): Brand | null {
  if (!raw || typeof raw !== "object" || !raw.name?.trim()) return null;
  const id = isUserCompanyBrandId(raw.id) ? raw.id : `other-user-${Date.now()}`;
  return {
    ...raw,
    id,
    name: raw.name.trim(),
    industry: raw.industry || "",
    owned: false,
    logo: raw.logo || "/brand-logo.png",
    grad: raw.grad || GRADS[0],
    assets: ensureCoreAssets(Array.isArray(raw.assets) ? raw.assets : [], slotIdPrefix(id)),
    works: Array.isArray(raw.works) ? raw.works : [],
    materials: Array.isArray(raw.materials) ? raw.materials.filter(hasRealMaterialFile) : [],
  };
}

function loadUserCompanyBrands(): Brand[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(brandStoreKey(OTHERS_STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Brand[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeUserCompanyBrand).filter((b): b is Brand => !!b);
  } catch {
    return [];
  }
}

function saveUserCompanyBrands(list: Brand[]) {
  if (typeof window === "undefined") return;
  try {
    const onlyUser = list.filter((b) => isUserCompanyBrandId(b.id));
    window.localStorage.setItem(brandStoreKey(OTHERS_STORAGE_KEY), JSON.stringify(onlyUser));
  } catch {
    /* ignore quota */
  }
}

function loadUserPublishedCatalog(): PublishedBrandRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PUBLISHED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PublishedBrandRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r.publisherCompanyId && !isDemoPublishedCompanyId(r.publisherCompanyId));
  } catch {
    return [];
  }
}

function loadPublishedCatalog(): PublishedBrandRecord[] {
  const userRecords = loadUserPublishedCatalog();
  const userPublisherIds = new Set(userRecords.map((r) => r.publisherCompanyId));
  const demosNotOverridden = buildDemoPublishedRecords().filter(
    (r) => !userPublisherIds.has(r.publisherCompanyId),
  );
  return [...userRecords, ...demosNotOverridden];
}

function savePublishedCatalog(records: PublishedBrandRecord[]) {
  if (typeof window === "undefined") return;
  try {
    const onlyUser = records.filter(
      (r) => r.publisherCompanyId && !isDemoPublishedCompanyId(r.publisherCompanyId),
    );
    window.localStorage.setItem(PUBLISHED_STORAGE_KEY, JSON.stringify(onlyUser));
  } catch {
    /* ignore quota */
  }
}

function findPublishRecord(publisherCompanyId: string): PublishedBrandRecord | null {
  if (!publisherCompanyId) return null;
  return loadUserPublishedCatalog().find((r) => r.publisherCompanyId === publisherCompanyId) ?? null;
}

function publishedRecordToBrand(rec: PublishedBrandRecord): Brand {
  const copy = JSON.parse(JSON.stringify(rec.brand)) as Brand;
  const prefix = slotIdPrefix(rec.id);
  const industryParts = [copy.industry?.trim(), `发布方 ${rec.publisherCompanyName}`].filter(Boolean);
  return {
    ...copy,
    id: rec.id,
    owned: false,
    name: copy.name?.trim() || rec.publisherCompanyName,
    industry: industryParts.join(" · "),
    assets: ensureCoreAssets(Array.isArray(copy.assets) ? copy.assets : [], prefix),
    materials: (copy.materials ?? []).filter(hasRealMaterialFile),
    works: Array.isArray(copy.works) ? copy.works : [],
  };
}

function loadPublishedBrandsForViewer(viewerCompanyId: string): Brand[] {
  return loadPublishedCatalog()
    .filter(
      (r) =>
        r.publisherCompanyId &&
        r.publisherCompanyId !== viewerCompanyId &&
        (!r.targetAccountId || r.targetAccountId === viewerCompanyId),
    )
    .map(publishedRecordToBrand);
}

function snapshotBrandForPublish(mine: Brand): Brand {
  const pubId = `pub-tmp`;
  const snapshot = JSON.parse(JSON.stringify(mine)) as Brand;
  const logos = snapshot.assets.find((a) => a.type === "logo");
  const logoImg = logos ? logoImgsOf(logos)[0] : "";
  return {
    ...snapshot,
    id: pubId,
    name: snapshot.name?.trim() || "我的品牌",
    industry: snapshot.industry?.trim() || "",
    owned: false,
    logo: logoImg || snapshot.logo || "/brand-logo.png",
    assets: ensureCoreAssets(snapshot.assets ?? [], "pub"),
    materials: (snapshot.materials ?? []).filter(hasRealMaterialFile),
    works: [],
  };
}

function hasPublishableContent(mine: Brand) {
  const filledAsset = (mine.assets ?? []).some(isAssetFilled);
  const hasFile = (mine.materials ?? []).some(hasRealMaterialFile);
  return filledAsset || hasFile;
}

function publishBrandToCatalog(
  mine: Brand,
  opts: { companyId: string; companyName: string; targetAccountId: string },
): PublishedBrandRecord {
  const id = `pub-${opts.companyId}`;
  const record: PublishedBrandRecord = {
    id,
    publisherCompanyId: opts.companyId,
    publisherCompanyName: opts.companyName.trim() || "未命名企业",
    targetAccountId: opts.targetAccountId.trim(),
    publishedAt: new Date().toISOString(),
    brand: { ...snapshotBrandForPublish(mine), id },
  };
  const next = loadUserPublishedCatalog().filter((r) => r.publisherCompanyId !== opts.companyId);
  next.push(record);
  savePublishedCatalog(next);
  return record;
}

function unpublishBrandFromCatalog(companyId: string) {
  if (!companyId) return;
  const next = loadUserPublishedCatalog().filter((r) => r.publisherCompanyId !== companyId);
  savePublishedCatalog(next);
}

function buildAccountBrands(seed: Brand[], viewerCompanyId = ""): Brand[] {
  const hidden = loadHiddenBrandIds();
  const visible = (list: Brand[]) => list.filter((b) => !hidden.has(b.id));
  return [
    loadMineBrand(),
    ...visible(otherCompanyBrands(seed)),
    ...visible(loadUserCompanyBrands()),
    ...visible(loadPublishedBrandsForViewer(viewerCompanyId)),
  ];
}

export function BrandPane({
  seed,
  seqStart,
  mode = "library",
}: {
  seed: Brand[];
  seqStart: number;
  /** library：仓库模板（他人只读）；mine：账户页「我的品牌」仅一个、不展示公司名称 */
  mode?: "library" | "mine";
}) {
  const toast = useToast();
  const { user } = useAuth();
  const isMine = mode === "mine";
  const viewerCompanyId = user?.companyId ?? "";
  const viewerCompanyName = user?.company?.trim() || user?.orgName?.trim() || "未命名企业";
  const [brands, setBrands] = useState<Brand[]>(() =>
    isMine ? buildAccountBrands(seed, viewerCompanyId) : JSON.parse(JSON.stringify(seed)),
  );
  const [activeIds, setActiveIds] = useState<string[]>(() => {
    if (!isMine) return [];
    return [MINE_ID];
  });
  const [seq, setSeq] = useState(seqStart);
  const [showForm, setShowForm] = useState(false);
  const [showPublishForm, setShowPublishForm] = useState(false);
  const [pendingUnpublish, setPendingUnpublish] = useState(false);
  const [pendingDeleteCompany, setPendingDeleteCompany] = useState<Brand | null>(null);
  const [addingAsset, setAddingAsset] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const myPublishRecord = isMine ? findPublishRecord(viewerCompanyId) : null;

  function rebuildBrandList() {
    if (!isMine) return;
    setBrands(buildAccountBrands(seed, viewerCompanyId));
  }

  useEffect(() => {
    if (!isMine) return;
    rebuildBrandList();
  }, [viewerCompanyId, isMine]);

  function updateRailScrollState() {
    const el = railRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(max > 2 && el.scrollLeft < max - 2);
  }

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;

    const sync = () => {
      requestAnimationFrame(updateRailScrollState);
    };

    sync();
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(el);
    for (const child of el.children) ro?.observe(child);

    return () => {
      el.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      ro?.disconnect();
    };
  }, [brands.length]);

  function scrollRail(dir: -1 | 1) {
    const el = railRef.current;
    if (!el) return;
    const step = Math.min(340, Math.max(240, el.clientWidth * 0.7));
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }

  useEffect(() => {
    if (!isMine) return;
    const mine = brands.find((b) => b.id === MINE_ID);
    if (mine) saveMineBrand(mine);
  }, [brands, isMine]);

  useEffect(() => {
    if (!isMine) return;
    saveUserCompanyBrands(brands);
  }, [brands, isMine]);

  function canEditBrand(brandId: string) {
    if (!isMine) return true;
    return brandId === MINE_ID || isUserCompanyBrandId(brandId);
  }

  function toggle(id: string) {
    if (isMine) {
      setActiveIds([id]);
      return;
    }
    setActiveIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function selectBrand(id: string) {
    setActiveIds([id]);
  }

  function addBrand(name: string, industry: string, logo: string) {
    const id = isMine ? `other-user-${Date.now()}` : "br" + seq;
    const brand: Brand = {
      id,
      name,
      industry: industry || "未填写行业",
      logo: logo || "",
      grad: GRADS[brands.length % GRADS.length],
      owned: false,
      assets: ensureCoreAssets([], slotIdPrefix(id)),
      works: [],
      materials: [],
    };
    setBrands((prev) => [...prev, brand]);
    if (!isMine) setSeq((s) => s + 1);
    setActiveIds([id]);
    toast(isMine ? "已添加公司品牌资产，可继续完善 LOGO、标准色等" : "已新增品牌，请继续添加该品牌的资产");
  }

  function addAsset(brandId: string, assetItem: BrandAsset) {
    if (!canEditBrand(brandId)) {
      toast("仅可编辑「我的品牌」或自行添加的公司品牌", "warn");
      return;
    }
    const nextItem = withLogoImgs(assetItem);
    const prefix = slotIdPrefix(brandId);
    setBrands((prev) =>
      prev.map((b) => {
        if (b.id !== brandId) return b;
        let assets = [...b.assets];
        if (isCoreAssetType(nextItem.type)) {
          const idx = assets.findIndex((a) => a.type === nextItem.type);
          if (idx >= 0) {
            assets[idx] = { ...nextItem, id: assets[idx].id };
          } else {
            assets = ensureCoreAssets([...assets, nextItem], prefix);
          }
        } else {
          assets = [...assets, nextItem];
        }
        const next = { ...b, assets: ensureCoreAssets(assets, prefix) };
        const logos = logoImgsOf(nextItem);
        if (nextItem.type === "logo" && logos[0]) next.logo = logos[0];
        return next;
      }),
    );
  }

  function updateAsset(brandId: string, assetItem: BrandAsset) {
    if (!canEditBrand(brandId)) {
      toast("仅可编辑「我的品牌」或自行添加的公司品牌", "warn");
      return;
    }
    const nextItem = withLogoImgs(assetItem);
    const prefix = slotIdPrefix(brandId);
    setBrands((prev) =>
      prev.map((b) => {
        if (b.id !== brandId) return b;
        const next = {
          ...b,
          assets: ensureCoreAssets(
            b.assets.map((a) => (a.id === nextItem.id ? nextItem : a)),
            prefix,
          ),
        };
        const logos = logoImgsOf(nextItem);
        if (nextItem.type === "logo" && logos[0]) next.logo = logos[0];
        return next;
      }),
    );
  }

  function removeAsset(brandId: string, assetId: string) {
    if (!canEditBrand(brandId)) {
      toast("仅可编辑「我的品牌」或自行添加的公司品牌", "warn");
      return;
    }
    const prefix = slotIdPrefix(brandId);
    setBrands((prev) =>
      prev.map((b) => {
        if (b.id !== brandId) return b;
        const target = b.assets.find((a) => a.id === assetId);
        if (target && isCoreAssetType(target.type)) {
          return {
            ...b,
            assets: ensureCoreAssets(
              b.assets.map((a) => (a.id === assetId ? resetCoreAsset(a) : a)),
              prefix,
            ),
          };
        }
        return {
          ...b,
          assets: ensureCoreAssets(
            b.assets.filter((a) => a.id !== assetId),
            prefix,
          ),
        };
      }),
    );
  }

  function addMaterials(brandId: string, items: AssetCard[]) {
    if (!canEditBrand(brandId)) {
      toast("仅可编辑「我的品牌」或自行添加的公司品牌", "warn");
      return;
    }
    if (!items.length) return;
    setBrands((prev) =>
      prev.map((b) => (b.id === brandId ? { ...b, materials: [...items, ...b.materials] } : b)),
    );
  }

  function removeMaterial(brandId: string, materialKey: string) {
    if (!canEditBrand(brandId)) {
      toast("仅可编辑「我的品牌」或自行添加的公司品牌", "warn");
      return;
    }
    setBrands((prev) =>
      prev.map((b) =>
        b.id === brandId
          ? {
              ...b,
              materials: b.materials.filter((m) => materialKeyOf(m) !== materialKey),
            }
          : b,
      ),
    );
  }

  function updateMaterial(brandId: string, materialKey: string, patch: Partial<AssetCard>) {
    if (!canEditBrand(brandId)) {
      toast("仅可编辑「我的品牌」或自行添加的公司品牌", "warn");
      return;
    }
    setBrands((prev) =>
      prev.map((b) =>
        b.id === brandId
          ? {
              ...b,
              materials: b.materials.map((m) =>
                materialKeyOf(m) === materialKey ? { ...m, ...patch } : m,
              ),
            }
          : b,
      ),
    );
  }

  function handlePublishMine(targetAccountId: string) {
    const mine = brands.find((b) => b.id === MINE_ID);
    if (!mine) return;
    if (!viewerCompanyId) {
      toast("请先完成企业认证后再发布", "warn");
      return;
    }
    if (!targetAccountId.trim()) {
      toast("请输入目标账户ID", "warn");
      return;
    }
    if (targetAccountId.trim() === viewerCompanyId) {
      toast("不能分享给自己的账户ID", "warn");
      return;
    }
    if (!hasPublishableContent(mine)) {
      toast("请至少完善一项品牌资产或上传品牌文件后再发布", "warn");
      return;
    }
    const wasPublished = !!myPublishRecord;
    publishBrandToCatalog(mine, {
      companyId: viewerCompanyId,
      companyName: viewerCompanyName,
      targetAccountId: targetAccountId.trim(),
    });
    rebuildBrandList();
    setShowPublishForm(false);
    toast(
      wasPublished
        ? "已更新发布内容，其他公司刷新后可看到最新版本（演示）"
        : "已发布给其他公司（演示），其他公司账号可在品牌列表中引用",
      "success",
    );
  }

  function handleUnpublishMine() {
    if (!viewerCompanyId) return;
    unpublishBrandFromCatalog(viewerCompanyId);
    rebuildBrandList();
    setPendingUnpublish(false);
    toast("已取消发布，其他公司将不再看到该品牌（演示）", "success");
  }

  function removeCompanyBrand(brandId: string) {
    if (!canDeleteCompanyBrand(brandId)) {
      toast("「我的品牌」不可删除", "warn");
      return;
    }
    if (!isUserCompanyBrandId(brandId)) {
      hideBrandFromList(brandId);
    }
    setBrands((prev) => prev.filter((b) => b.id !== brandId));
    setActiveIds((prev) => {
      const next = prev.filter((id) => id !== brandId);
      if (isMine && next.length === 0) return [MINE_ID];
      return next;
    });
    setPendingDeleteCompany(null);
    const msg = isUserCompanyBrandId(brandId)
      ? "已删除该公司品牌及全部内容"
      : "已从列表移出该品牌";
    toast(msg, "success");
  }

  const showList = brands;
  const expanded = activeIds
    .map((id) => brands.find((b) => b.id === id))
    .filter((b): b is Brand => !!b);

  return (
    <>
      <div className="toolbar">
        {!isMine && (
          <p className="empty-note" style={{ margin: 0 }}>
            按「家」管理品牌资产：可同时勾选多家，下方依次展开各家的品牌资产与品牌文件，未选中的看不到。
          </p>
        )}
        {!isMine && (
          <div className="brand-toolbar-actions">
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
              <Icon name="plus" size={15} /> 新增品牌资产
            </button>
          </div>
        )}
      </div>

      {showList.length === 0 ? (
        <div className="empty-state am-brand-empty">
          暂无品牌资产
        </div>
      ) : (
        <div className="brand-card-rail-wrap">
          <div className="brand-card-rail" role="list" ref={railRef}>
          {showList.map((b) => {
            const isMineCard = b.id === MINE_ID;
            const on = activeIds.includes(b.id);
            const deletable = canDeleteCompanyBrand(b.id);
            const logoSrc = /^(\/|https?:|data:)/.test(b.logo)
              ? b.logo.startsWith("/")
                ? asset(b.logo)
                : b.logo
              : asset("/brand-logo.png");
            return (
              <div
                key={b.id}
                role="listitem"
                className={
                  on
                    ? "brand-card brand-card--simple on"
                    : deletable
                      ? "brand-card brand-card--simple brand-card--deletable"
                      : "brand-card brand-card--simple"
                }
                tabIndex={0}
                aria-pressed={on}
                aria-label={
                  isMineCard
                    ? `我的品牌，${b.assets.length} 项资产`
                    : `${b.name}，${b.assets.length} 项资产`
                }
                onClick={() => (isMine ? selectBrand(b.id) : toggle(b.id))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (isMine) selectBrand(b.id);
                    else toggle(b.id);
                  }
                }}
              >
                {deletable && (
                  <button
                    type="button"
                    className="brand-card-del"
                    aria-label={`删除 ${b.name}`}
                    title="删除公司"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteCompany(b);
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
                <div className="bc-logo-box" aria-hidden>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoSrc} alt="" />
                </div>
                <div className="bc-meta">
                  {isMineCard ? (
                    <div className="bc-name bc-name--mine">我的品牌</div>
                  ) : (
                    <div className="bc-name">{b.name}</div>
                  )}
                  <div className="bc-stat-box">
                    {b.assets.length} 项资产 · {b.materials.length} 文件
                  </div>
                </div>
              </div>
            );
          })}
          </div>
          {showList.length > 1 && (
            <>
              <div
                className={`brand-rail-edge brand-rail-edge--left${canScrollLeft ? "" : " is-disabled"}`}
              >
                <button
                  type="button"
                  className="brand-rail-btn"
                  aria-label="向左查看"
                  disabled={!canScrollLeft}
                  onClick={() => scrollRail(-1)}
                >
                  <Icon name="chevron" size={16} className="brand-rail-btn-ico brand-rail-btn-ico--left" />
                </button>
              </div>
              <div
                className={`brand-rail-edge brand-rail-edge--right${canScrollRight ? "" : " is-disabled"}`}
              >
                <button
                  type="button"
                  className="brand-rail-btn"
                  aria-label="向右查看"
                  disabled={!canScrollRight}
                  onClick={() => scrollRail(1)}
                >
                  <Icon name="chevron" size={16} className="brand-rail-btn-ico" />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div id="brandExpandHost">
        {expanded.length === 0 ? (
          <div className="empty-state bd-empty-assets" style={{ marginTop: 18 }}>
            请先在上方选择一个品牌，以查看其品牌资产内容。
          </div>
        ) : (
          expanded.map((b) => {
            const isMineCard = b.id === MINE_ID;
            const isUserCompany = isUserCompanyBrandId(b.id);
            const isPublished = isPublishedBrandId(b.id);
            return (
              <BrandExpand
                key={b.id}
                brand={b}
                onAddAsset={(assetItem) => addAsset(b.id, assetItem)}
                onUpdateAsset={(assetItem) => updateAsset(b.id, assetItem)}
                onRemoveAsset={(assetId) => removeAsset(b.id, assetId)}
                onAddMaterials={(items) => addMaterials(b.id, items)}
                onRemoveMaterial={(key) => removeMaterial(b.id, key)}
                onUpdateMaterial={(key, patch) => updateMaterial(b.id, key, patch)}
                toast={toast}
                forceMine={isMineCard}
                hideCompanyName={isMineCard}
                allowEditCompany={isUserCompany}
                isPublishedBrand={isPublished}
                publishRecord={isMineCard ? myPublishRecord : null}
                onOpenPublish={isMineCard ? () => setShowPublishForm(true) : undefined}
                onRequestUnpublish={isMineCard ? () => setPendingUnpublish(true) : undefined}
                onDeleteCompany={
                  !isMineCard ? () => setPendingDeleteCompany(b) : undefined
                }
                externalAdding={isMineCard ? addingAsset : false}
                onExternalAddingChange={isMineCard ? setAddingAsset : undefined}
              />
            );
          })
        )}
      </div>

      {showForm && (
        <NewBrandForm
          onClose={() => setShowForm(false)}
          onSave={addBrand}
          toast={toast}
          title={isMine ? "添加公司品牌资产" : "新增品牌资产（一家）"}
          confirmText={isMine ? "确认添加" : "确认新增"}
        />
      )}

      {showPublishForm && (
        <PublishBrandModal
          onClose={() => setShowPublishForm(false)}
          onSave={handlePublishMine}
          toast={toast}
          defaultTargetAccountId={myPublishRecord?.targetAccountId || ""}
          isUpdate={!!myPublishRecord}
        />
      )}

      {pendingUnpublish && (
        <ConfirmModal
          title="确定取消发布吗？其他公司将无法再引用该品牌资产（演示）。"
          onCancel={() => setPendingUnpublish(false)}
          onConfirm={handleUnpublishMine}
        />
      )}

      {pendingDeleteCompany && (
        <ConfirmModal
          title={`确定删除「${pendingDeleteCompany.name}」吗？删除后，该公司的品牌资产与品牌文件将全部移除，且无法恢复。`}
          confirmText="删除"
          onCancel={() => setPendingDeleteCompany(null)}
          onConfirm={() => removeCompanyBrand(pendingDeleteCompany.id)}
        />
      )}
    </>
  );
}

function BrandExpand({
  brand,
  onAddAsset,
  onUpdateAsset,
  onRemoveAsset,
  onAddMaterials,
  onRemoveMaterial,
  onUpdateMaterial,
  toast,
  forceMine = false,
  hideCompanyName = false,
  allowEditCompany = false,
  isPublishedBrand = false,
  publishRecord = null,
  onOpenPublish,
  onRequestUnpublish,
  onDeleteCompany,
  externalAdding = false,
  onExternalAddingChange,
}: {
  brand: Brand;
  onAddAsset?: (asset: BrandAsset) => void;
  onUpdateAsset?: (asset: BrandAsset) => void;
  onRemoveAsset?: (assetId: string) => void;
  onAddMaterials?: (items: AssetCard[]) => void;
  onRemoveMaterial?: (materialKey: string) => void;
  onUpdateMaterial?: (materialKey: string, patch: Partial<AssetCard>) => void;
  toast: (s: string, kind?: "info" | "warn" | "success") => void;
  forceMine?: boolean;
  hideCompanyName?: boolean;
  allowEditCompany?: boolean;
  isPublishedBrand?: boolean;
  publishRecord?: PublishedBrandRecord | null;
  onOpenPublish?: () => void;
  onRequestUnpublish?: () => void;
  onDeleteCompany?: () => void;
  externalAdding?: boolean;
  onExternalAddingChange?: (open: boolean) => void;
}) {
  const editable = forceMine || !!brand.owned || allowEditCompany;
  const { addMaterial } = useLibrary();
  const uploadRef = useRef<HTMLInputElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const [editingAsset, setEditingAsset] = useState<BrandAsset | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<AssetCard | null>(null);
  const [pendingDeleteAsset, setPendingDeleteAsset] = useState<BrandAsset | null>(null);
  const [pendingDeleteMaterial, setPendingDeleteMaterial] = useState<AssetCard | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [showMaterialLibrary, setShowMaterialLibrary] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(() => new Set());
  const showAdd = adding || externalAdding;

  useEffect(() => {
    if (!uploadMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!uploadMenuRef.current?.contains(e.target as Node)) setUploadMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [uploadMenuOpen]);

  useEffect(() => {
    setBatchMode(false);
    setBatchSelected(new Set());
  }, [brand.id]);

  useEffect(() => {
    if (!batchMode) return;
    const valid = new Set(brand.materials.map((m) => assetKey(m) || materialKeyOf(m)));
    setBatchSelected((prev) => {
      const next = new Set<string>();
      for (const k of prev) if (valid.has(k)) next.add(k);
      return next.size === prev.size ? prev : next;
    });
  }, [brand.materials, batchMode]);

  function closeAdd() {
    setAdding(false);
    onExternalAddingChange?.(false);
  }

  /** 他人品牌文件入库「我的素材」时带上来源公司 */
  function materialForMyLibrary(m: AssetCard): AssetCard {
    const company = brand.name.trim() || "未知品牌";
    const mediaKind = brandFileKindLabel(m);
    const now = new Date().toISOString();
    return {
      ...m,
      id: m.id?.startsWith("brand-") ? m.id : `brand-${brand.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: mediaKind,
      time: m.time || "刚刚",
      createdAt: m.createdAt || now,
      updatedAt: now,
      sub: `来源公司 · ${company}`,
      module: mediaKind === "视频" ? "video" : m.module || "image",
      edit: {
        ...(m.edit || {}),
        source: "brand",
        company,
        brandId: brand.id,
        sub: company,
      },
    };
  }

  function copyBrandAsset(a: BrandAsset) {
    const text =
      a.type === "color" && a.colors?.length
        ? a.colors.join(" ")
        : a.type === "slogan"
          ? a.sub
          : `${a.name} · ${a.sub}`;
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    toast(`已复制「${a.name}」`, "success");
  }

  function useMaterial(m: AssetCard) {
    const res = addMaterial(materialForMyLibrary(m));
    if (!res.ok && res.reason === "quota") {
      toast("素材库已满，无法添加", "warn");
      return;
    }
    toast(
      res.action === "skipped" ? `「${m.name}」已在素材库中` : `已将「${m.name}」保存到素材`,
      "success",
    );
  }

  function exitBatch() {
    setBatchMode(false);
    setBatchSelected(new Set());
  }

  function toggleBatch() {
    if (batchMode) exitBatch();
    else {
      setBatchMode(true);
      setBatchSelected(new Set());
    }
  }

  function toggleBatchOne(key: string) {
    setBatchSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleBatchAll() {
    const keys = brand.materials.map((m) => assetKey(m) || materialKeyOf(m));
    setBatchSelected((prev) =>
      prev.size === keys.length && keys.length > 0 ? new Set() : new Set(keys),
    );
  }

  function useSelectedMaterials() {
    const selected = brand.materials.filter((m) =>
      batchSelected.has(assetKey(m) || materialKeyOf(m)),
    );
    if (!selected.length) {
      toast("请先选择品牌文件", "warn");
      return;
    }
    let added = 0;
    let skipped = 0;
    let quotaHit = false;
    for (const m of selected) {
      const res = addMaterial(materialForMyLibrary(m));
      if (!res.ok && res.reason === "quota") {
        quotaHit = true;
        break;
      }
      if (res.action === "skipped") skipped += 1;
      else if (res.ok) added += 1;
    }
    if (quotaHit && added === 0 && skipped === 0) {
      toast("素材库已满，无法添加", "warn");
      return;
    }
    const parts: string[] = [];
    if (added) parts.push(`已加入 ${added} 个`);
    if (skipped) parts.push(`${skipped} 个已在库中`);
    if (quotaHit) parts.push("素材库已满，其余未添加");
    toast(parts.join("，") || "已处理所选文件", added ? "success" : "warn");
    exitBatch();
  }

  const batchKeys = brand.materials.map((m) => assetKey(m) || materialKeyOf(m));
  const batchAllSelected = batchKeys.length > 0 && batchSelected.size === batchKeys.length;

  async function handleUploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const items = await readImageFiles(files);
      if (!items.length) {
        toast("请选择图片文件", "warn");
        return;
      }
      onAddMaterials?.(items);
      toast(items.length > 1 ? `已上传 ${items.length} 个品牌文件` : "已上传品牌文件", "success");
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  function addMaterialsFromLibrary(items: { img: string; name: string }[]) {
    if (!items.length) return;
    const now = Date.now();
    const cards: AssetCard[] = items.map((it, i) => ({
      id: `mat-lib-${now}-${i}`,
      emoji: "",
      kind: "图片",
      name: it.name || "仓库素材",
      sub: "来自仓库",
      grad: GRADS[(brand.materials.length + i) % GRADS.length],
      img: it.img,
      module: "upload",
      time: "刚刚",
      createdAt: new Date(now + i).toISOString(),
      updatedAt: new Date(now + i).toISOString(),
      edit: { source: "library", sub: "仓库" },
    }));
    onAddMaterials?.(cards);
    toast(cards.length > 1 ? `已从仓库添加 ${cards.length} 个品牌文件` : `已从仓库添加「${cards[0].name}」`, "success");
  }

  const logoSrc = /^(\/|https?:|data:)/.test(brand.logo)
    ? brand.logo.startsWith("/")
      ? asset(brand.logo)
      : brand.logo
    : forceMine
      ? asset("/brand-logo.png")
      : "";

  return (
    <div className="brand-expand">
      <div className="be-head">
        <div className="bd-title">
          <span className={`bd-logo ${brand.grad}`}>
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoSrc} alt="" className="bd-logo-img" />
            ) : (
              brand.logo
            )}
          </span>
          <div>
            {hideCompanyName ? (
              <>
                <b>我的品牌</b>
                {publishRecord ? (
                  <span className="bd-badge bd-badge-published">已发布给其他公司</span>
                ) : null}
              </>
            ) : (
              <>
                <b>{brand.name}</b>{" "}
                {editable ? (
                  forceMine || brand.owned ? (
                    <span className="bd-badge bd-badge-mine">我的品牌</span>
                  ) : (
                    <span className="bd-badge bd-badge-mine">公司品牌</span>
                  )
                ) : null}
                {brand.industry ? (
                  <div className="empty-note" style={{ margin: 0 }}>
                    {brand.industry}
                  </div>
                ) : null}
              </>
            )}
            {hideCompanyName && publishRecord ? (
              <div className="empty-note" style={{ margin: "4px 0 0" }}>
                最近发布：{formatPublishTime(publishRecord.publishedAt)} · 其他公司可下载/保存到素材
              </div>
            ) : null}
          </div>
        </div>
        {forceMine && onOpenPublish && (
          <div className="brand-actions be-head-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={onOpenPublish}>
              {publishRecord ? "更新分享我的资产" : "分享我的资产"}
            </button>
            {publishRecord && onRequestUnpublish ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onRequestUnpublish}>
                取消发布
              </button>
            ) : null}
          </div>
        )}
        {onDeleteCompany && (
          <div className="brand-actions be-head-actions">
            <button type="button" className="btn btn-ghost btn-sm brand-del-company" onClick={onDeleteCompany}>
              <Icon name="trash" size={15} /> 删除公司
            </button>
          </div>
        )}
      </div>

      <div className="bd-section">
        <div className="bd-section-head">
          <h4>
            品牌资产 <span className="bd-count">{brand.assets.length}</span>
          </h4>
          {editable && (
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
              <Icon name="plus" size={14} /> 添加资产
            </button>
          )}
        </div>
        {brand.assets.length > 0 ? (
          <div>
            {brand.assets.map((a) => {
              const filled = isAssetFilled(a);
              return (
              <div className="brand-asset-row" key={a.id}>
                {(a.type === "logo" || a.type === "custom") && logoImgsOf(a).length > 0 ? (
                  <div className="brand-asset-thumbs">
                    {logoImgsOf(a).map((src, i) => (
                      <div className="brand-asset-thumb" key={`${a.id}-img-${i}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={asset(src)} alt="" />
                      </div>
                    ))}
                  </div>
                ) : null}
                {a.type === "color" && filled ? (
                  <div className="brand-swatches">
                    {(a.colors ?? []).filter(Boolean).map((c, i) => (
                      <div key={i} className="swatch" style={{ background: c }} title={c} />
                    ))}
                  </div>
                ) : null}
                <div className="brand-asset-meta">
                  <h4>
                    {assetTitleDisplay(a)}
                    {a.type === "custom" && a.customLabel ? (
                      <span className="bd-badge bd-badge-custom">{a.customLabel}</span>
                    ) : null}
                  </h4>
                  <p className={filled ? undefined : "bd-asset-empty"}>{assetSubDisplay(a)}</p>
                </div>
                {editable ? (
                  <div className="brand-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingAsset(a)}>
                      编辑
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setPendingDeleteAsset(a)}>
                      {isCoreAssetType(a.type) ? "清空" : "删除"}
                    </button>
                  </div>
                ) : (
                  <div className="brand-actions">
                    {a.type === "color" || a.type === "font" || a.type === "slogan" ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={!filled}
                        onClick={() => copyBrandAsset(a)}
                      >
                        <Icon name="copy" size={14} /> 复制
                      </button>
                    ) : (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={!filled}
                        onClick={() => {
                          downloadBrandAsset(a, brand.name, brand.logo);
                          toast(`已开始下载「${a.name}」`);
                        }}
                      >
                        <Icon name="download" size={14} /> 下载
                      </button>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state bd-empty-assets">
            {editable ? "暂无品牌资产，请添加 LOGO、标准色、字体、Slogan 或自定义资产。" : "这家暂无品牌资产。"}
          </div>
        )}
      </div>

      <div className="bd-section">
        <div className="bd-section-head">
          <h4>
            品牌文件 <span className="bd-count">{brand.materials.length}</span>
          </h4>
          {editable ? (
            <>
              <input
                ref={uploadRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => void handleUploadFiles(e.target.files)}
              />
              <div className="bd-upload-wrap" ref={uploadMenuRef}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={uploading}
                  aria-expanded={uploadMenuOpen}
                  onClick={() => setUploadMenuOpen((v) => !v)}
                >
                  {uploading ? "上传中…" : "上传文件"}
                  <Icon name="chevron" size={13} className="bd-upload-chevron" />
                </button>
                {uploadMenuOpen && (
                  <div className="bd-upload-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUploadMenuOpen(false);
                        uploadRef.current?.click();
                      }}
                    >
                      本地上传
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUploadMenuOpen(false);
                        setShowMaterialLibrary(true);
                      }}
                    >
                      仓库上传
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            brand.materials.length > 0 && (
              <button
                type="button"
                className={batchMode ? "st-batch-btn on" : "st-batch-btn"}
                onClick={toggleBatch}
              >
                {batchMode ? "退出批量" : "批量保存到素材"}
              </button>
            )
          )}
        </div>
        <div
          className={
            brand.materials.length > 0
              ? batchMode
                ? "bd-waterfall st-batch-grid"
                : "bd-waterfall"
              : "grid grid-4"
          }
        >
          {brand.materials.length > 0 ? (
            brand.materials.map((m) => {
              const key = assetKey(m) || materialKeyOf(m);
              return (
                <div className="bd-waterfall-item" key={key}>
                  {editable ? (
                    <AssetCardView
                      item={m}
                      kindLabel={brandFileKindLabel(m)}
                      subLabel={m.name}
                      timeLabel={m.time || "刚刚"}
                      editLabel="重命名"
                      onEdit={() => setEditingMaterial(m)}
                      onDownload={() => {
                        downloadMaterialFile(m);
                        toast("开始下载素材");
                      }}
                      onDelete={() => setPendingDeleteMaterial(m)}
                    />
                  ) : (
                    <AssetCardView
                      item={m}
                      kindLabel={brandFileKindLabel(m)}
                      subLabel={m.name}
                      timeLabel={m.time || "刚刚"}
                      batchMode={batchMode}
                      selected={batchSelected.has(key)}
                      onToggleSelect={() => toggleBatchOne(key)}
                      onUse={batchMode ? undefined : () => useMaterial(m)}
                      onDownload={
                        batchMode
                          ? undefined
                          : () => {
                              downloadMaterialFile(m);
                              toast("开始下载素材");
                            }
                      }
                    />
                  )}
                </div>
              );
            })
          ) : (
            <div className="empty-state">暂无品牌文件。</div>
          )}
        </div>
      </div>

      {!editable && batchMode && (
        <div className="st-batch-bar bd-batch-bar" role="toolbar" aria-label="批量保存到素材">
          <label className="st-batch-all">
            <input type="checkbox" checked={batchAllSelected} onChange={toggleBatchAll} />
            <span>全选</span>
            <span className="st-batch-count">已选择 {batchSelected.size}</span>
          </label>
          <div className="st-batch-acts bd-batch-acts">
            <button type="button" className="st-batch-cancel" onClick={exitBatch}>
              取消
            </button>
            <button type="button" className="st-batch-act" onClick={useSelectedMaterials}>
              <Icon name="check" size={15} />
              保存到素材
            </button>
          </div>
        </div>
      )}

      {showAdd && editable && (
        <AssetForm
          mode="add"
          onClose={closeAdd}
          onSave={(assetItem) => {
            onAddAsset?.(assetItem);
            closeAdd();
            toast("已添加品牌资产", "success");
          }}
          toast={toast}
        />
      )}

      {editingAsset && editable && (
        <AssetForm
          mode="edit"
          initial={editingAsset}
          onClose={() => setEditingAsset(null)}
          onSave={(assetItem) => {
            onUpdateAsset?.(assetItem);
            setEditingAsset(null);
            toast("已保存品牌资产", "success");
          }}
          toast={toast}
        />
      )}

      {editingMaterial && editable && (
        <MaterialEditForm
          initial={editingMaterial}
          onClose={() => setEditingMaterial(null)}
          onSave={(name) => {
            onUpdateMaterial?.(materialKeyOf(editingMaterial), {
              name,
              updatedAt: new Date().toISOString(),
            });
            setEditingMaterial(null);
            toast("已重命名", "success");
          }}
          toast={toast}
        />
      )}

      {pendingDeleteAsset && (
        <ConfirmModal
          title={
            isCoreAssetType(pendingDeleteAsset.type)
              ? `确定清空「${pendingDeleteAsset.name}」吗？清空后显示为「还未填写」。`
              : `确定删除「${pendingDeleteAsset.name}」吗？`
          }
          onCancel={() => setPendingDeleteAsset(null)}
          onConfirm={() => {
            const wasCore = isCoreAssetType(pendingDeleteAsset.type);
            onRemoveAsset?.(pendingDeleteAsset.id);
            setPendingDeleteAsset(null);
            toast(wasCore ? "已清空为还未填写" : "已删除品牌资产");
          }}
        />
      )}

      {pendingDeleteMaterial && (
        <ConfirmModal
          title={`确定删除素材「${pendingDeleteMaterial.name}」吗？`}
          onCancel={() => setPendingDeleteMaterial(null)}
          onConfirm={() => {
            onRemoveMaterial?.(materialKeyOf(pendingDeleteMaterial));
            setPendingDeleteMaterial(null);
            toast("已删除素材");
          }}
        />
      )}

      {showMaterialLibrary && (
        <LibraryPickerModal
          multiple
          onClose={() => setShowMaterialLibrary(false)}
          onPickMany={(items) => {
            addMaterialsFromLibrary(items);
            setShowMaterialLibrary(false);
          }}
        />
      )}
    </div>
  );
}

function AssetForm({
  mode,
  initial,
  onClose,
  onSave,
  toast,
}: {
  mode: "add" | "edit";
  initial?: BrandAsset;
  onClose: () => void;
  onSave: (asset: BrandAsset) => void;
  toast: (s: string) => void;
}) {
  const [type, setType] = useState<BrandAsset["type"]>(initial?.type || "logo");
  const [customLabel, setCustomLabel] = useState(initial?.customLabel || "");
  const [name, setName] = useState(() => {
    if (initial && isCoreAssetType(initial.type)) return coreAssetMeta(initial.type).name;
    return initial?.name || "";
  });
  const [sub, setSub] = useState(
    initial?.sub && initial.sub !== EMPTY_ASSET_SUB ? initial.sub : "",
  );
  const lockCoreName = isCoreAssetType(type);
  const [colors, setColors] = useState<string[]>(
    initial?.colors?.some((c) => !!c?.trim())
      ? [...initial.colors].slice(0, 4)
      : [...DEFAULT_COLORS],
  );
  const [imgs, setImgs] = useState<string[]>(() => (initial ? logoImgsOf(initial) : []));
  const [activeLogoSlot, setActiveLogoSlot] = useState<number | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const activeLogoSlotRef = useRef<number | null>(null);
  const LOGO_MAX = 8;

  function setColorAt(index: number, value: string) {
    setColors((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function normalizeHex(raw: string): string | null {
    let s = raw.trim();
    if (!s) return null;
    if (!s.startsWith("#")) s = `#${s}`;
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      const [, r, g, b] = s;
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    return null;
  }

  function commitColorHex(index: number, raw: string) {
    const normalized = normalizeHex(raw);
    setColorAt(index, normalized || DEFAULT_COLORS[index] || "#188772");
  }

  function applyLogoAt(slot: number, dataUrl: string, from: "local" | "library", fileName?: string) {
    setImgs((prev) => {
      const next = [...prev];
      if (slot < 0 || slot >= next.length) next.push(dataUrl);
      else next[slot] = dataUrl;
      return next.slice(0, LOGO_MAX);
    });
    if (!sub.trim()) setSub(from === "library" ? "来自仓库" : "已上传 · 本地保存");
  }

  function removeLogoAt(slot: number) {
    setImgs((prev) => prev.filter((_, i) => i !== slot));
  }

  function openLocalUpload(slot: number) {
    activeLogoSlotRef.current = slot;
    setActiveLogoSlot(slot);
    logoInputRef.current?.click();
  }

  function openLibrary(slot: number) {
    activeLogoSlotRef.current = slot;
    setActiveLogoSlot(slot);
    setShowLibrary(true);
  }

  function handleLogoFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) {
      toast("请选择图片文件");
      return;
    }
    const startSlot = activeLogoSlotRef.current ?? activeLogoSlot ?? imgs.length;
    Promise.all(
      list.map(
        (file) =>
          new Promise<{ url: string; name: string } | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = typeof reader.result === "string" ? reader.result : "";
              resolve(dataUrl ? { url: dataUrl, name: file.name } : null);
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          }),
      ),
    ).then((rows) => {
      const ok = rows.filter((x): x is { url: string; name: string } => !!x);
      if (!ok.length) {
        toast("读取图片失败");
        return;
      }
      setImgs((prev) => {
        const next = [...prev];
        ok.forEach((row, i) => {
          if (i === 0 && startSlot < next.length) next[startSlot] = row.url;
          else next.push(row.url);
        });
        return next.slice(0, LOGO_MAX);
      });
      if (!sub.trim()) setSub("已上传 · 本地保存");
    });
  }

  const logoSlots = imgs.length < LOGO_MAX ? [...imgs, ""] : imgs;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="gen-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bf-head">
          <div className="gen-title" style={{ textAlign: "left" }}>
            {mode === "edit" ? "编辑品牌资产" : "添加品牌资产"}
          </div>
          <button className="bf-close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        {mode === "add" && (
          <div className="field">
            <div className="ws-label">类型</div>
            <select
              value={type}
              onChange={(e) => {
                const next = e.target.value as BrandAsset["type"];
                setType(next);
                if (isCoreAssetType(next)) setName(coreAssetMeta(next).name);
              }}
            >
              <option value="logo">LOGO</option>
              <option value="color">标准色</option>
              <option value="font">字体</option>
              <option value="slogan">Slogan</option>
              <option value="custom">自定义</option>
            </select>
            {type === "custom" && (
              <input
                type="text"
                className="bf-custom-type"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="请输入自定义类型名称，例如：吉祥物"
                style={{ marginTop: 8 }}
              />
            )}
          </div>
        )}
        {mode === "edit" && type === "custom" && (
          <div className="field">
            <div className="ws-label">自定义类型</div>
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="请输入自定义类型名称"
            />
          </div>
        )}
        <div className="field">
          <div className="ws-label">
            名称 {lockCoreName ? null : <span className="req">*</span>}
          </div>
          {lockCoreName ? (
            <div className="bd-core-asset-name">{coreAssetMeta(type).name}</div>
          ) : (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                type === "custom"
                  ? "例如：品牌吉祥物"
                  : type === "color"
                    ? "例如：标准色规范"
                    : "例如：品牌 LOGO"
              }
            />
          )}
        </div>
        <div className="field">
          <div className="ws-label">{type === "slogan" ? "Slogan 文案" : "说明"}</div>
          <input
            type="text"
            value={sub}
            onChange={(e) => setSub(e.target.value)}
            placeholder={
              type === "slogan"
                ? "例如：绿水青山就是金山银山"
                : type === "font"
                  ? "例如：标题 阿里巴巴普惠体 · 正文 思源黑体"
                  : "例如：已定稿 · SVG / PNG"
            }
          />
        </div>
        {(type === "logo" || type === "custom") && (
          <div className="field">
            <div className="ws-label">{type === "custom" ? "图片（可多张）" : "LOGO 图片（可多张）"}</div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                handleLogoFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="bf-logo-grid">
              {logoSlots.map((src, slot) => {
                const filled = !!src;
                return (
                  <div key={`logo-slot-${slot}`} className={`bf-logo-box${filled ? " has-img" : ""}`}>
                    {filled ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset(src)} alt="" className="bf-logo-preview" />
                    ) : (
                      <span className="bf-logo-preview bf-logo-preview--empty">
                        <Icon name="upload" size={18} />
                        未上传
                      </span>
                    )}
                    <div className="bf-logo-hover" role="group" aria-label={`图片 ${slot + 1}`}>
                      <button type="button" onClick={() => openLocalUpload(slot)}>
                        上传
                      </button>
                      <button type="button" onClick={() => openLibrary(slot)}>
                        仓库
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={!filled}
                        onClick={() => removeLogoAt(slot)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {type === "color" && (
          <div className="field">
            <div className="ws-label">标准色（最多 4 色）</div>
            <div className="bf-colors">
              {colors.slice(0, 4).map((c, i) => {
                const pickerValue = normalizeHex(c) || DEFAULT_COLORS[i] || "#188772";
                return (
                  <div className="bf-color-item" key={i}>
                    <input
                      type="color"
                      className="bf-color"
                      value={pickerValue}
                      onChange={(e) => setColorAt(i, e.target.value.toUpperCase())}
                      title={`色值 ${i + 1}`}
                      aria-label={`标准色 ${i + 1}`}
                    />
                    <input
                      type="text"
                      className="bf-color-hex"
                      value={c}
                      spellCheck={false}
                      maxLength={7}
                      placeholder="#000000"
                      aria-label={`标准色 ${i + 1} 色值`}
                      onChange={(e) => {
                        const next = e.target.value.toUpperCase();
                        setColorAt(i, next);
                        const normalized = normalizeHex(next);
                        if (normalized) setColorAt(i, normalized);
                      }}
                      onBlur={(e) => commitColorHex(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitColorHex(i, (e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="gen-actions">
          <button className="btn btn-ghost btn-block" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              const assetName = lockCoreName ? coreAssetMeta(type).name : name.trim();
              if (!assetName) {
                toast("请填写资产名称");
                return;
              }
              if (type === "custom" && !customLabel.trim()) {
                toast("请填写自定义类型名称");
                return;
              }
              const nextColors = type === "color" ? colors.slice(0, 4) : undefined;
              const nextSub =
                type === "color"
                  ? sub.trim() || colorSubLabel(nextColors || [])
                  : sub.trim() || EMPTY_ASSET_SUB;
              const emojiByType = "";
              onSave(
                withLogoImgs({
                  id: initial?.id || `ba-${Date.now()}`,
                  type,
                  name: assetName,
                  sub: nextSub,
                  emoji: initial?.emoji || emojiByType,
                  ...(nextColors ? { colors: nextColors } : {}),
                  ...(type === "logo" || type === "custom" ? { imgs, img: imgs[0] } : {}),
                  ...(type === "custom" ? { customLabel: customLabel.trim() } : {}),
                }),
              );
            }}
          >
            {mode === "edit" ? "保存" : "确认添加"}
          </button>
        </div>
      </div>
      {showLibrary && (
        <LibraryPickerModal
          onClose={() => setShowLibrary(false)}
          onPick={(pickedImg, pickedName) => {
            applyLogoAt(activeLogoSlotRef.current ?? activeLogoSlot ?? imgs.length, pickedImg, "library", pickedName);
            setShowLibrary(false);
            setActiveLogoSlot(null);
            activeLogoSlotRef.current = null;
          }}
        />
      )}
    </div>
  );
}

function MaterialEditForm({
  initial,
  onClose,
  onSave,
  toast,
}: {
  initial: AssetCard;
  onClose: () => void;
  onSave: (name: string) => void;
  toast: (s: string) => void;
}) {
  const [name, setName] = useState(initial.name || "");

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="gen-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bf-head">
          <div className="gen-title" style={{ textAlign: "left" }}>
            重命名
          </div>
          <button className="bf-close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="field">
          <div className="ws-label">
            名称 <span className="req">*</span>
          </div>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="文件名称" />
        </div>
        <div className="gen-actions">
          <button className="btn btn-ghost btn-block" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              if (!name.trim()) {
                toast("请填写名称");
                return;
              }
              onSave(name.trim());
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function formatPublishTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "刚刚";
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function PublishBrandModal({
  onClose,
  onSave,
  toast,
  defaultTargetAccountId,
  isUpdate,
}: {
  onClose: () => void;
  onSave: (targetAccountId: string) => void;
  toast: (s: string) => void;
  defaultTargetAccountId: string;
  isUpdate: boolean;
}) {
  const [targetAccountId, setTargetAccountId] = useState(defaultTargetAccountId);

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="gen-panel bd-publish-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bf-head">
          <div className="gen-title" style={{ textAlign: "left" }}>
            {isUpdate ? "更新分享我的资产" : "分享我的资产"}
          </div>
          <button className="bf-close" type="button" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="field">
          <div className="ws-label">
            目标账户ID <span className="req">*</span>
          </div>
          <input
            type="text"
            value={targetAccountId}
            onChange={(e) => setTargetAccountId(e.target.value)}
            placeholder="例如：ENT-JXK-001"
          />
        </div>
        <div className="gen-actions">
          <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => {
              if (!targetAccountId.trim()) {
                toast("请填写目标账户ID");
                return;
              }
              onSave(targetAccountId.trim());
            }}
          >
            {isUpdate ? "确认更新分享" : "确认分享"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewBrandForm({
  onClose,
  onSave,
  toast,
  title = "新增品牌资产（一家）",
  confirmText = "确认新增",
}: {
  onClose: () => void;
  onSave: (name: string, industry: string, logo: string) => void;
  toast: (s: string) => void;
  title?: string;
  confirmText?: string;
}) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [logo, setLogo] = useState("");

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="gen-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bf-head">
          <div className="gen-title" style={{ textAlign: "left" }}>
            {title}
          </div>
          <button className="bf-close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="field">
          <div className="ws-label">
            公司 / 品牌名称 <span className="req">*</span>
          </div>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：萧山杨梅·产业品牌" />
        </div>
        <div className="field">
          <div className="ws-label">所属行业</div>
          <input type="text" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="例如：农产品区域公用品牌" />
        </div>
        <div className="field">
          <div className="ws-label">品牌标识</div>
          <input type="text" value={logo} maxLength={8} onChange={(e) => setLogo(e.target.value)} placeholder="可选简称或首字" />
        </div>
        <div className="gen-actions">
          <button className="btn btn-ghost btn-block" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              if (!name.trim()) {
                toast("请填写公司 / 品牌名称");
                return;
              }
              onSave(name.trim(), industry.trim(), logo.trim());
              onClose();
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
