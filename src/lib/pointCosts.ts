/**
 * 算力价目：按「实际调用模型费用」换算。
 * 规则：1 元 = 100 算力（向上取整）；上线价默认 = 官方价 × 2 后再缩小一位。
 *
 * 单价来源（2026-08 对齐火山方舟刊例 / 渠道参考）：
 * - 图片：Seedream 4.0 / 4.5 / 5.0 Lite / Pro 编辑档（元/张）
 * - 视频：Seedance 按「模型 × 分辨率 ×（1.5 Pro 另计有声）」元/秒
 * - 数字人 OmniHuman：1 元/秒
 * - LLM / 文本生成（文案、调研、联想、扩写、脚本、提案、图转文等）：不计算力（0）
 * - 本地抠图 / 客户端打包：0
 */

import { resolveVideoModel, qualityToModelRes } from "@/data/video";

export const COMPUTE_PER_YUAN = 100;

/** 元 → 算力（向上取整，至少为 0） */
export function yuanToCompute(yuan: number): number {
  if (!Number.isFinite(yuan) || yuan <= 0) return 0;
  return Math.ceil(yuan * COMPUTE_PER_YUAN - 1e-9);
}

/** 上线算力 = 官方价两倍后再缩小一位 */
export function officialYuanToLive(yuan: number): number {
  if (!Number.isFinite(yuan) || yuan <= 0) return 0;
  return Math.ceil(yuan * 20 - 1e-9);
}

/** 上游人民币单价（元）— 固定项与默认展示 */
export const RMB = {
  /** Seedream 4.0 */
  image40: 0.2,
  /** Seedream 5.0 Lite */
  imageLite: 0.22,
  /** 本地出图（运营可改，默认 0.10 元 → 上线 2 算力） */
  imageLocal: 0.1,
  /** Seedream 4.5 */
  image45: 0.25,
  /** Seedream 5.0 Pro 编辑档 */
  imagePro: 0.32,
  /**
   * Seedance 1.5 Pro · 720P 有声（元/秒）
   * 火山方舟 5s 示例 ≈1.73 元 → 0.346 ≈ 0.35
   */
  videoSec720Audio: 0.35,
  /** OmniHuman 对口型（元/秒） */
  avatarSec: 1,
  /** 文本类 LLM 不计费；保留字段便于日后按需恢复 */
  llmSocial: 0,
  llmOfficial: 0,
  llmBrand: 0,
  llmResearch: 0,
  llmVision: 0,
} as const;

/* ---------- 图片：按模型 ---------- */

/** UI 模型名 / 别名 → 单张人民币 */
const IMAGE_YUAN_BY_MODEL: Record<string, number> = {
  "MoFun区域文化大模型": RMB.imageLocal,
  "Z-Image": RMB.imageLocal,
  "Z-Image-本地-文生图": RMB.imageLocal,
  "Seedream 4.0": RMB.image40,
  "Seedream 4.5": RMB.image45,
  "Seedream 5.0": RMB.imageLite,
  "Seedream 5.0 Lite": RMB.imageLite,
  "Seedream-5.0-lite": RMB.imageLite,
  高清重绘: RMB.imagePro,
  局部重绘: RMB.imagePro,
};

/** 单张图上游成本（元） */
export function imageYuanPerShot(model?: string): number {
  if (!model) return RMB.imageLite;
  const hit = IMAGE_YUAN_BY_MODEL[model];
  if (hit != null) return hit;
  const lower = model.toLowerCase();
  if (lower.includes("4.5") || lower.includes("4_5")) return RMB.image45;
  if (lower.includes("4.0") || lower.includes("4_0")) return RMB.image40;
  if (lower.includes("pro") || lower.includes("重绘")) return RMB.imagePro;
  if (lower.includes("z-image") || lower.includes("本地") || lower.includes("qwen") || lower.includes("mofun")) {
    return RMB.imageLocal;
  }
  if (lower.includes("seedream") || lower.includes("5.0")) {
    return RMB.imageLite;
  }
  return RMB.imageLite;
}

/** 单张图算力（优先运营端上线价） */
export function imageShotPoints(model?: string): number {
  const sku = imageSku(model);
  const live = livePoints(sku);
  if (live != null) return live;
  return officialYuanToLive(imageYuanPerShot(model));
}

/* ---------- 视频：模型 × 分辨率 × 有声 / 参考视频 ---------- */

type Res15 = "480p" | "720p" | "1080p";
type Res20 = Res15 | "4k";

/** Seedance 1.5 Pro：火山方舟 5s 刊例 / 5 → 元/秒 */
const SEEDANCE_15_PRO: Record<Res15, { silent: number; audio: number }> = {
  "480p": { silent: 0.08, audio: 0.16 },
  "720p": { silent: 0.172, audio: 0.346 },
  "1080p": { silent: 0.388, audio: 0.778 },
};

/** Seedance 1.0 Pro：无原生有声；按刊例 token 相对 1.5 无声约 1.875× 估算 */
const SEEDANCE_10_PRO: Record<Res15, number> = {
  "480p": 0.15,
  "720p": 0.322,
  "1080p": 0.726,
};

/**
 * Seedance 2.0：刊例「输入不含视频」5s / 5 → 元/秒
 * 含参考视频按官方 token 比折算（480/720: 28/46，1080: 31/51，4K: 16/26）
 */
const SEEDANCE_20: Record<Res20, number> = {
  "480p": 0.462,
  "720p": 0.994,
  "1080p": 2.478,
  "4k": 5.054,
};
const SEEDANCE_20_REF: Record<Res20, number> = {
  "480p": 0.281,
  "720p": 0.605,
  "1080p": 1.506,
  "4k": 3.11,
};
const SEEDANCE_20_FAST: Record<Res15, { plain: number; ref: number }> = {
  "480p": { plain: 0.372, ref: 0.226 },
  "720p": { plain: 0.8, ref: 0.487 },
  "1080p": { plain: 0.8, ref: 0.487 },
};
const SEEDANCE_20_MINI: Record<Res15, { plain: number; ref: number }> = {
  "480p": { plain: 0.23, ref: 0.14 },
  "720p": { plain: 0.496, ref: 0.302 },
  "1080p": { plain: 0.496, ref: 0.302 },
};
const SEEDANCE_25: Record<Res15, { plain: number; ref: number }> = {
  "480p": { plain: 0.231, ref: 0.141 },
  "720p": { plain: 0.497, ref: 0.303 },
  "1080p": { plain: 1.118, ref: 0.68 },
};

function normalizeRes20(qualityOrRes?: string): Res20 {
  const q = String(qualityOrRes || "720P");
  if (/4k/i.test(q)) return "4k";
  if (/1080|2k/i.test(q)) return "1080p";
  if (/480/i.test(q)) return "480p";
  return "720p";
}

function normalizeResKey(qualityOrRes?: string, modelNameOrId?: string): Res15 {
  const r = qualityToModelRes(qualityOrRes || "720P", modelNameOrId);
  if (r === "480p") return "480p";
  if (r === "1080p") return "1080p";
  return "720p";
}

export type VideoCostOpts = {
  /** 显示名或 modelId */
  model?: string;
  /** UI 画质：480P / 720P / 1080P / 2K / 4K */
  quality?: string;
  /** 是否原生有声（仅 1.5 Pro 等区分计价；模型不支持时视为 false） */
  withAudio?: boolean;
  /** 输入是否含参考视频（仅 seedance-2.0 分档） */
  hasRefVideo?: boolean;
  /** 一次生成条数（文生视频可多条） */
  count?: number;
};

function seedance20Sku(res: Res20, hasRef: boolean, studio: boolean): string {
  const tag = res === "480p" ? "480" : res === "1080p" ? "1080" : res === "4k" ? "4k" : "720";
  const ref = hasRef ? "-ref" : "";
  if (studio) {
    if (tag === "720" && !hasRef) return "studio-shot-20";
    return `studio-shot-20-${tag}${ref}`;
  }
  if (tag === "720" && !hasRef) return "vid-20-720";
  return `vid-20-${tag}${ref}`;
}

function videoLiveSkuCandidates(id: string, opts?: VideoCostOpts): string[] {
  const hasRef = Boolean(opts?.hasRefVideo);
  const audio = Boolean(opts?.withAudio);
  if (id === "seedance-2.0") {
    const res = normalizeRes20(opts?.quality);
    return [seedance20Sku(res, hasRef, false), seedance20Sku(res, hasRef, true)];
  }
  if (id === "seedance-2.0-fast" || id === "seedance-2.0-mini") {
    const res = normalizeResKey(opts?.quality, id);
    const tag = res === "480p" ? "480" : "720";
    const ref = hasRef ? "-ref" : "";
    const mid = id.endsWith("mini") ? "mini" : "fast";
    if (tag === "720" && !hasRef) return [`vid-20-${mid}`, `studio-shot-20-${mid}`];
    return [`vid-20-${mid}-${tag}${ref}`, `studio-shot-20-${mid}-${tag}${ref}`];
  }
  if (id === "seedance-2.5") {
    const res = normalizeResKey(opts?.quality, id);
    const tag = res === "480p" ? "480" : res === "1080p" ? "1080" : "720";
    const ref = hasRef ? "-ref" : "";
    return [`vid-25-${tag}${ref}`, `studio-shot-25-${tag}${ref}`];
  }
  if (id === "seedance-1.5-pro") {
    const res = normalizeResKey(opts?.quality, id);
    const tag = res === "480p" ? "480" : res === "1080p" ? "1080" : "720";
    const a = audio ? "a" : "";
    if (tag === "720" && audio) return ["vid-15pro-720a", "studio-shot"];
    return [`vid-15pro-${tag}${a}`, `studio-shot-15-${tag}${a}`];
  }
  if (id === "seedance-1.0-pro") {
    const res = normalizeResKey(opts?.quality, id);
    if (res === "720p") return ["vid-10pro-720", "studio-shot-10"];
    const tag = res === "480p" ? "480" : "1080";
    return [`vid-10pro-${tag}`, `studio-shot-10-${tag}`];
  }
  return [];
}

/** 视频每秒人民币成本 */
export function videoYuanPerSecond(opts?: VideoCostOpts): number {
  const model = resolveVideoModel(opts?.model);
  const wantAudio = Boolean(opts?.withAudio) && model.nativeAudio;
  const id = model.modelId;

  if (id === "seedance-1.5-pro") {
    const row = SEEDANCE_15_PRO[normalizeResKey(opts?.quality, id)];
    return wantAudio ? row.audio : row.silent;
  }
  if (id === "seedance-1.0-pro") {
    return SEEDANCE_10_PRO[normalizeResKey(opts?.quality, id)];
  }
  if (id === "seedance-2.0-fast") {
    const row = SEEDANCE_20_FAST[normalizeResKey(opts?.quality, id)];
    return opts?.hasRefVideo ? row.ref : row.plain;
  }
  if (id === "seedance-2.0-mini") {
    const row = SEEDANCE_20_MINI[normalizeResKey(opts?.quality, id)];
    return opts?.hasRefVideo ? row.ref : row.plain;
  }
  if (id === "seedance-2.5") {
    const row = SEEDANCE_25[normalizeResKey(opts?.quality, id)];
    return opts?.hasRefVideo ? row.ref : row.plain;
  }
  if (id === "seedance-2.0" || id.startsWith("seedance-2")) {
    const res = normalizeRes20(opts?.quality);
    return opts?.hasRefVideo ? SEEDANCE_20_REF[res] : SEEDANCE_20[res];
  }

  const fallback = SEEDANCE_15_PRO["720p"];
  return wantAudio ? fallback.audio : fallback.silent;
}

const img = officialYuanToLive(RMB.imageLite); // 5
const imgPro = officialYuanToLive(RMB.imagePro); // 7

/**
 * 固定展示用算力（默认参数下的一次点击）。
 * 动态场景请用下方 helper（模型 / 画质 / 张数 / 秒数）。
 */
export const POINT_COST = {
  imagePerShot: img,
  imageEventT2i: img * 4,
  imageEventT2iPerImage: img,
  imageEventI2i: img,
  imageEvent: img * 4,

  imageLogo: img,

  imageIp: img * 4,
  imageIpExt: img * 4,
  imageIpPeriph: img,

  imageFont: img,

  imageProduct: img,
  imageSignage: img,
  imageProductBase: img,
  imageSignageBase: img,

  imageEnhance: img,
  imageExpand: imgPro,
  imageRepair: img,
  imageMatte: officialYuanToLive(0.1),
  imageErase: 0,
  imageVectorBasic: officialYuanToLive(0.3),
  imageVectorPro: officialYuanToLive(0.3),
  imageLogoEditable: 0,

  /** 文案 / 联想 / AI 扩写等：文本生成不计算力 */
  contentSocial: 0,
  contentOfficial: 0,
  contentBrand: 0,

  /** 默认：Seedance 1.5 Pro · 720P 有声 · 5 秒 · 1 条 */
  videoOneline: officialYuanToLive(RMB.videoSec720Audio * 5),
  videoAvatar: officialYuanToLive(RMB.avatarSec * 8),
  videoStudioShot: officialYuanToLive(RMB.videoSec720Audio * 5),

  /** 调研报告（文本）不计算力 */
  research: 0,
  /** 图转文 / 视觉理解 → 文本，不计算力 */
  vision: 0,
  /** 制作大片 · 一句话生成完整镜头脚本（文本） */
  studioScript: 0,
  /** IP 提案 / IP 故事（文本） */
  ipPropose: 0,
  ipStory: 0,
  homeHero: img,
  demoSpend: img,
} as const;

export type PointCostKey = keyof typeof POINT_COST;

/** 活动：文生图按张数×模型；图生图固定 1 张×编辑模型 */
export function eventImagePoints(
  tab: "t2i" | "i2i" | string,
  count?: number,
  model?: string,
): number {
  const per = imageShotPoints(model);
  if (tab === "i2i") return per;
  return per * Math.max(1, count ?? 4);
}

/** 一句话视频 / 大片镜头：按时长 × 模型 × 画质 × 有声 × 条数 */
export function videoSecondsPoints(seconds: number, opts?: VideoCostOpts): number {
  const s = Math.max(1, Math.round(seconds || 5));
  const n = Math.max(1, Math.round(opts?.count ?? 1));
  const id = resolveVideoModel(opts?.model).modelId;
  for (const sku of videoLiveSkuCandidates(id, opts)) {
    const per = livePoints(sku);
    if (per != null) return per * s * n;
  }
  const yuan = videoYuanPerSecond(opts) * s * n;
  return officialYuanToLive(yuan);
}

/** 数字人对口型：按时长（秒），OmniHuman 1 元/秒 */
export function avatarSecondsPoints(seconds: number): number {
  const s = Math.max(1, Math.round(seconds || 8));
  const per = livePoints("avatar-sec");
  if (per != null) return per * s;
  return officialYuanToLive(RMB.avatarSec * s);
}

/** 商拍 / 店招：张数 × 所选模型单价 */
export function multiImagePoints(count: number, model?: string): number {
  return imageShotPoints(model) * Math.max(1, count || 1);
}

/** 调试 / 展示：当前视频计价摘要 */
export function videoCostHint(opts?: VideoCostOpts & { seconds?: number }): string {
  const m = resolveVideoModel(opts?.model);
  const res = normalizeResKey(opts?.quality, m.modelId);
  const yuan = videoYuanPerSecond(opts);
  const sec = Math.max(1, Math.round(opts?.seconds ?? 5));
  const n = Math.max(1, Math.round(opts?.count ?? 1));
  const pts = officialYuanToLive(yuan * sec * n);
  const audio =
    m.nativeAudio && opts?.withAudio
      ? "有声"
      : m.nativeAudio
        ? "无声"
        : "无原生声";
  return `${m.name} · ${res.toUpperCase()} · ${audio} · ${yuan.toFixed(3)}元/秒 → ${pts}算力（${sec}s×${n}）`;
}

/** 按钮文案 */
export function pointsCostLabel(amount: number, opts?: { perTime?: boolean }): string {
  const n = Math.max(0, Math.floor(amount));
  return `${n}算力${opts?.perTime ? "/次" : ""}`;
}

/** 运营端上线价覆盖（C 端消耗只看 live_points） */
const liveMap: Record<string, number> = {};

export function applyLivePrices(prices: { sku: string; live_points: number }[]) {
  for (const row of prices) {
    if (!row?.sku) continue;
    liveMap[row.sku] = Math.max(0, Math.floor(Number(row.live_points) || 0));
  }
  if (liveMap["img-matte"] != null) {
    (POINT_COST as { imageMatte: number }).imageMatte = liveMap["img-matte"];
  }
  if (liveMap["img-vector"] != null) {
    (POINT_COST as { imageVectorBasic: number; imageVectorPro: number }).imageVectorBasic = liveMap["img-vector"];
    (POINT_COST as { imageVectorPro: number }).imageVectorPro = liveMap["img-vector"];
  }
  if (liveMap["llm-text"] != null) {
    const z = liveMap["llm-text"];
    Object.assign(POINT_COST, {
      contentSocial: z,
      contentOfficial: z,
      contentBrand: z,
      research: z,
      vision: z,
      studioScript: z,
      ipPropose: z,
      ipStory: z,
    });
  }
}

export function livePoints(sku: string): number | null {
  if (!sku || liveMap[sku] == null) return null;
  return liveMap[sku];
}

export function imageSku(model?: string): string {
  const name = String(model || "");
  const lower = name.toLowerCase();
  if (lower.includes("4.5") || lower.includes("4_5")) return "img-seedream-45";
  if (lower.includes("4.0") || lower.includes("4_0")) return "img-seedream-40";
  if (lower.includes("z-image") || lower.includes("本地") || lower.includes("mofun") || lower.includes("qwen")) {
    return "img-local";
  }
  return "img-seedream-50";
}
