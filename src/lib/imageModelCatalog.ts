/**
 * 全站文生图 / 图生图模型目录（对齐产品模型表）。
 * UI 只用友好展示名；发往 /api/image 前经 resolveImageModelId 映射为上游 ID。
 */

/** UI 展示名 */
export const UI_QWEN_T2I = "Qwen 文生图";
export const UI_QWEN_I2I = "Qwen 图生图";
export const UI_SEEDREAM_40 = "Seedream 4.0";
export const UI_SEEDREAM_45 = "Seedream 4.5";
export const UI_SEEDREAM_50 = "Seedream 5.0";
export const UI_EDIT_HD = "高清重绘";
export const UI_EDIT_INPAINT = "局部重绘";

/** 上游 / Comfy 通道 ID（不直接展示） */
export const QWEN_T2I_LOCAL = "Qwen-Image-本地-文生图";
export const QWEN_I2I_LOCAL = "Qwen-Image-本地-图生图";
export const SEEDREAM_40 = "doubao-seedream-4-0-250828";
export const SEEDREAM_45 = "doubao-seedream-4-5-251128";
export const SEEDREAM_50 = "doubao-seedream-5-0-260128";

/** 默认县域 Lora 通道（UI 名） */
export const COUNTY_T2I_MODEL = UI_QWEN_T2I;
export const COUNTY_EDIT_MODEL = UI_QWEN_I2I;

/** 任意历史名 / API id → UI 展示名 */
const TO_UI: Record<string, string> = {
  [UI_QWEN_T2I]: UI_QWEN_T2I,
  [UI_QWEN_I2I]: UI_QWEN_I2I,
  [QWEN_T2I_LOCAL]: UI_QWEN_T2I,
  [QWEN_I2I_LOCAL]: UI_QWEN_I2I,
  县域模型: UI_QWEN_T2I,
  县域编辑模型: UI_QWEN_I2I,
  基础编辑模型: UI_QWEN_I2I,
  "Qwen-Image": UI_QWEN_T2I,
  "qwen-image": UI_QWEN_T2I,
  [UI_SEEDREAM_40]: UI_SEEDREAM_40,
  [UI_SEEDREAM_45]: UI_SEEDREAM_45,
  [UI_SEEDREAM_50]: UI_SEEDREAM_50,
  [SEEDREAM_40]: UI_SEEDREAM_40,
  [SEEDREAM_45]: UI_SEEDREAM_45,
  [SEEDREAM_50]: UI_SEEDREAM_50,
  "Seedream-5.0-lite": UI_SEEDREAM_50,
  "seedream-4.0": UI_SEEDREAM_40,
  "seedream-4.5": UI_SEEDREAM_45,
  "seedream-5.0-lite": UI_SEEDREAM_50,
  高清重绘模型: UI_EDIT_HD,
  局部重绘模型: UI_EDIT_INPAINT,
  [UI_EDIT_HD]: UI_EDIT_HD,
  [UI_EDIT_INPAINT]: UI_EDIT_INPAINT,
};

/** UI / 旧名 → 上游 API model id */
const API_IDS: Record<string, string> = {
  [UI_QWEN_T2I]: QWEN_T2I_LOCAL,
  [UI_QWEN_I2I]: QWEN_I2I_LOCAL,
  [QWEN_T2I_LOCAL]: QWEN_T2I_LOCAL,
  [QWEN_I2I_LOCAL]: QWEN_I2I_LOCAL,
  县域模型: QWEN_T2I_LOCAL,
  县域编辑模型: QWEN_I2I_LOCAL,
  基础编辑模型: QWEN_I2I_LOCAL,
  "Qwen-Image": QWEN_T2I_LOCAL,
  "qwen-image": QWEN_T2I_LOCAL,
  [UI_SEEDREAM_40]: SEEDREAM_40,
  [UI_SEEDREAM_45]: SEEDREAM_45,
  [UI_SEEDREAM_50]: SEEDREAM_50,
  [SEEDREAM_40]: SEEDREAM_40,
  [SEEDREAM_45]: SEEDREAM_45,
  [SEEDREAM_50]: SEEDREAM_50,
  "Seedream-5.0-lite": SEEDREAM_50,
  "seedream-4.0": SEEDREAM_40,
  "seedream-4.5": SEEDREAM_45,
  "seedream-5.0-lite": SEEDREAM_50,
  [UI_EDIT_HD]: SEEDREAM_40,
  [UI_EDIT_INPAINT]: SEEDREAM_45,
  高清重绘模型: SEEDREAM_40,
  局部重绘模型: SEEDREAM_45,
  "Z-Image": "z-image",
};

const LORA_CAPABLE = new Set<string>([
  UI_QWEN_T2I,
  UI_QWEN_I2I,
  QWEN_T2I_LOCAL,
  QWEN_I2I_LOCAL,
  "县域模型",
  "县域编辑模型",
  "基础编辑模型",
  "Qwen-Image",
  "qwen-image",
]);

/** 规范成 UI 展示名（下拉回填旧 id 时用） */
export function toUiImageModelName(name?: string): string {
  if (!name) return "";
  return TO_UI[name] || name;
}

/** @deprecated 使用 toUiImageModelName；保留兼容 */
export function canonicalImageModelName(name?: string): string {
  return toUiImageModelName(name);
}

export function modelSupportsCountyLora(model?: string): boolean {
  if (!model) return false;
  const ui = toUiImageModelName(model);
  return LORA_CAPABLE.has(model) || LORA_CAPABLE.has(ui);
}

/** 客户端 / 服务端共用：把 UI 名解析成应发给上游的 model 字段 */
export function resolveImageModelId(name?: string): string | undefined {
  if (!name) return undefined;
  return API_IDS[name] || API_IDS[toUiImageModelName(name)] || name;
}
