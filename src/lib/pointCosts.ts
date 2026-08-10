/**
 * 算力价目：按「实际调用模型费用」换算。
 * 规则：1 元 = 100 算力（向上取整）。
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

/** 上游人民币单价（元）— 固定项与默认展示 */
export const RMB = {
  /** Seedream 4.0 */
  image40: 0.2,
  /** Seedream 5.0 Lite / MoFun·Qwen 等效 */
  imageLite: 0.22,
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
  "MoFun区域文化大模型": RMB.imageLite,
  "Z-Image": RMB.imageLite,
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
  if (lower.includes("seedream") || lower.includes("5.0") || lower.includes("qwen") || lower.includes("mofun")) {
    return RMB.imageLite;
  }
  return RMB.imageLite;
}

/** 单张图算力 */
export function imageShotPoints(model?: string): number {
  return yuanToCompute(imageYuanPerShot(model));
}

/* ---------- 视频：模型 × 分辨率 × 有声 ---------- */

type ResKey = "480p" | "720p" | "1080p";

/** Seedance 1.5 Pro：火山方舟 5s 刊例 / 5 → 元/秒 */
const SEEDANCE_15_PRO: Record<ResKey, { silent: number; audio: number }> = {
  "480p": { silent: 0.08, audio: 0.16 },
  "720p": { silent: 0.172, audio: 0.346 },
  "1080p": { silent: 0.388, audio: 0.778 },
};

/** Seedance 1.0 Pro：无原生有声；按刊例 token 相对 1.5 无声约 1.875× 估算 */
const SEEDANCE_10_PRO: Record<ResKey, number> = {
  "480p": 0.15,
  "720p": 0.322,
  "1080p": 0.726,
};

/**
 * Seedance 2.0 系列：火山方舟「输入不含视频」5s 示例 / 5 → 元/秒
 * （2.0 族按分辨率计费，原生有声不另乘；UI 关有声仍按同档）
 * fast/mini 的 1080 官方不支持 → 按 720 计（与 qualityToModelRes 降级一致）
 */
const SEEDANCE_20: Record<ResKey, number> = {
  "480p": 0.462,
  "720p": 0.994,
  "1080p": 2.478,
};
const SEEDANCE_20_FAST: Record<ResKey, number> = {
  "480p": 0.372,
  "720p": 0.8,
  "1080p": 0.8,
};
const SEEDANCE_20_MINI: Record<ResKey, number> = {
  "480p": 0.232,
  "720p": 0.496,
  "1080p": 0.496,
};

function normalizeResKey(qualityOrRes?: string, modelNameOrId?: string): ResKey {
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
  /** 一次生成条数（文生视频可多条） */
  count?: number;
};

/** 视频每秒人民币成本 */
export function videoYuanPerSecond(opts?: VideoCostOpts): number {
  const model = resolveVideoModel(opts?.model);
  const res = normalizeResKey(opts?.quality, model.modelId);
  const wantAudio = Boolean(opts?.withAudio) && model.nativeAudio;
  const id = model.modelId;

  if (id === "seedance-1.5-pro") {
    const row = SEEDANCE_15_PRO[res];
    return wantAudio ? row.audio : row.silent;
  }
  if (id === "seedance-1.0-pro") {
    return SEEDANCE_10_PRO[res];
  }
  if (id === "seedance-2.0-fast") return SEEDANCE_20_FAST[res];
  if (id === "seedance-2.0-mini") return SEEDANCE_20_MINI[res];
  if (id === "seedance-2.0" || id.startsWith("seedance-2")) return SEEDANCE_20[res];

  // 未知模型：按 1.5 Pro 720 有声/无声兜底
  const fallback = SEEDANCE_15_PRO["720p"];
  return wantAudio ? fallback.audio : fallback.silent;
}

const img = yuanToCompute(RMB.imageLite); // 22
const imgPro = yuanToCompute(RMB.imagePro); // 32

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
  imageMatte: 0,
  imageErase: 0,
  imageVectorBasic: 0,
  imageVectorPro: 0,
  imageLogoEditable: 0,

  /** 文案 / 联想 / AI 扩写等：文本生成不计算力 */
  contentSocial: 0,
  contentOfficial: 0,
  contentBrand: 0,

  /** 默认：Seedance 1.5 Pro · 720P 有声 · 5 秒 · 1 条 */
  videoOneline: yuanToCompute(RMB.videoSec720Audio * 5),
  videoAvatar: yuanToCompute(RMB.avatarSec * 8),
  videoStudioShot: yuanToCompute(RMB.videoSec720Audio * 5),

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
  const yuan = videoYuanPerSecond(opts) * s * n;
  return yuanToCompute(yuan);
}

/** 数字人对口型：按时长（秒），OmniHuman 1 元/秒 */
export function avatarSecondsPoints(seconds: number): number {
  const s = Math.max(1, Math.round(seconds || 8));
  return yuanToCompute(RMB.avatarSec * s);
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
  const pts = yuanToCompute(yuan * sec * n);
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
