import type { ModelOption } from "@/lib/types";
import {
  UI_EDIT_HD,
  UI_EDIT_INPAINT,
  UI_QWEN_T2I,
  UI_SEEDREAM_40,
  UI_SEEDREAM_45,
  UI_SEEDREAM_50,
  UI_ZIMAGE,
} from "@/lib/imageModelCatalog";

/** Seedream 文生图三档（表顺序：4.0 → 4.5 → 5.0） */
export const SEEDREAM_GEN_MODELS: ModelOption[] = [
  { name: UI_SEEDREAM_40, desc: "高细节" },
  { name: UI_SEEDREAM_45, desc: "细节增强" },
  { name: UI_SEEDREAM_50, desc: "最新 Seedream" },
];

/** Logo 生成 */
export const LOGO_GEN_MODELS: ModelOption[] = [
  ...SEEDREAM_GEN_MODELS,
  { name: UI_QWEN_T2I, desc: "MoFun区域文化大模型" },
];

/** Font 生成（不含 MoFun / Z-Image） */
export const FONT_GEN_MODELS: ModelOption[] = SEEDREAM_GEN_MODELS;

/** IP 创意设计出图 */
export const IP_CREATE_MODELS: ModelOption[] = [
  ...SEEDREAM_GEN_MODELS,
  { name: UI_ZIMAGE, desc: "真实感增强" },
  { name: UI_QWEN_T2I, desc: "MoFun区域文化大模型" },
];

/** IP 扩展设计出图 */
export const IP_EXTEND_MODELS: ModelOption[] = [
  { name: UI_QWEN_T2I, desc: "MoFun区域文化大模型" },
  ...SEEDREAM_GEN_MODELS,
];

/** 活动文生图（LLM 扩写走 qwen3.8-27b，不在此列表） */
export const EVENT_T2I_MODELS: ModelOption[] = [
  { name: UI_ZIMAGE, desc: "真实感增强" },
  { name: UI_QWEN_T2I, desc: "可挂本地 Lora" },
  ...SEEDREAM_GEN_MODELS,
];

/** 活动图生图：高清重绘=Seedream 4.0，局部重绘=Seedream 4.5 */
export const EVENT_I2I_MODELS: ModelOption[] = [
  { name: UI_EDIT_HD, desc: "高清重绘 · Seedream 4.0" },
  { name: UI_EDIT_INPAINT, desc: "局部重绘 · Seedream 4.5" },
];

/** 制作大片·生成资产 */
export const STUDIO_ASSET_GEN_MODELS: ModelOption[] = EVENT_T2I_MODELS;

/** 制作大片·资产改图 */
export const STUDIO_ASSET_EDIT_MODELS: ModelOption[] = SEEDREAM_GEN_MODELS;

export const DEFAULT_LOGO_MODEL = UI_SEEDREAM_50;
export const DEFAULT_FONT_MODEL = UI_SEEDREAM_50;
export const DEFAULT_IP_CREATE_MODEL = UI_SEEDREAM_50;
export const DEFAULT_IP_EXTEND_MODEL = UI_QWEN_T2I;
export const DEFAULT_EVENT_T2I_MODEL = UI_QWEN_T2I;
export const DEFAULT_EVENT_I2I_MODEL = UI_EDIT_HD;
export const DEFAULT_STUDIO_GEN_MODEL = UI_QWEN_T2I;
export const DEFAULT_STUDIO_EDIT_MODEL = UI_SEEDREAM_50;
export const DEFAULT_AVATAR_IMAGE_MODEL = UI_QWEN_T2I;
export const DEFAULT_IP_VIEWS_MODEL = UI_SEEDREAM_50;
export const DEFAULT_IP_PERIPH_MODEL = UI_SEEDREAM_50;
export const DEFAULT_ENHANCE_MODEL = UI_QWEN_T2I;
