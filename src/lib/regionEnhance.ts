import {
  DEFAULT_LORA_IDS,
  defaultStrengthMap,
  getLorasByIds,
  getRegionPack,
  resolveRegionIdFromText,
} from "@/data/regionAssets";
import type { AuthUser } from "@/lib/auth";
import {
  modelSupportsCountyLora,
  resolveImageModelId,
} from "@/lib/imageModelCatalog";

export {
  COUNTY_EDIT_MODEL,
  COUNTY_T2I_MODEL,
  modelSupportsCountyLora,
  resolveImageModelId,
  toUiImageModelName,
  QWEN_I2I_LOCAL,
  QWEN_T2I_LOCAL,
  SEEDREAM_40,
  SEEDREAM_45,
  SEEDREAM_50,
  UI_QWEN_I2I,
  UI_QWEN_T2I,
} from "@/lib/imageModelCatalog";

export function accountRegionId(user?: AuthUser | null): string {
  const explicit = user?.regionId?.trim();
  if (explicit) {
    const pack = getRegionPack(explicit);
    if (pack.regionId === explicit) return explicit;
  }
  return resolveRegionIdFromText(
    [user?.address, user?.orgName, user?.company].filter(Boolean).join(" ")
  );
}

/** 县域短名，如「安吉」 */
export function accountRegionLabel(user?: AuthUser | null): string {
  return getRegionPack(accountRegionId(user)).regionName;
}

/** 顶栏等地展示用，如「安吉县」 */
export function accountRegionDisplay(user?: AuthUser | null): string {
  const name = accountRegionLabel(user);
  return /[县市区]$/.test(name) ? name : `${name}县`;
}

export function regionMeta(regionId?: string) {
  const pack = getRegionPack(regionId);
  return {
    regionId: pack.regionId,
    county: pack.regionName,
    kbContext: pack.knowledge.map((k) => `- ${k.title}：${k.summary}`).join("\n"),
  };
}

export function kbFields(enabled: boolean, regionId?: string): {
  useKB?: boolean;
  county?: string;
  kbContext?: string;
} {
  if (!enabled) return { useKB: false };
  const meta = regionMeta(regionId);
  return { useKB: true, county: meta.county, kbContext: meta.kbContext };
}

export function loraPromptSuffix(ids: string[], strengths: Record<string, number> = {}): string {
  const list = getLorasByIds(ids.length ? ids : DEFAULT_LORA_IDS);
  if (!list.length) return "";
  return (
    "【县域Lora】" +
    list
      .map((l) => `${l.name}（强度${Number(strengths[l.id] ?? l.strength).toFixed(2)}）：${l.blurb}`)
      .join("；")
  );
}

/** 出图/改图 prompt：增强开时注入知识库；县域模型族额外注入 Lora 说明 */
export function applyRegionToImagePrompt(opts: {
  prompt: string;
  regionEnhance: boolean;
  model?: string;
  loraIds?: string[];
  loraStrengths?: Record<string, number>;
  regionId?: string;
}): string {
  if (!opts.regionEnhance) return opts.prompt;
  const meta = regionMeta(opts.regionId);
  const parts = [opts.prompt, `【县域知识库·${meta.county}】\n${meta.kbContext}`];
  if (modelSupportsCountyLora(opts.model)) {
    const suffix = loraPromptSuffix(opts.loraIds ?? DEFAULT_LORA_IDS, opts.loraStrengths ?? {});
    if (suffix) parts.push(suffix);
  }
  return parts.filter(Boolean).join("\n");
}

export function imageRequestBody(opts: {
  prompt: string;
  size?: string;
  n?: number;
  image?: string | string[];
  model?: string;
  regionEnhance: boolean;
  loraIds?: string[];
  loraStrengths?: Record<string, number>;
  regionId?: string;
}) {
  const prompt = applyRegionToImagePrompt(opts);
  const useLora = opts.regionEnhance && modelSupportsCountyLora(opts.model);
  const ids = opts.loraIds?.length ? opts.loraIds : DEFAULT_LORA_IDS;
  const model = opts.model ? resolveImageModelId(opts.model) : undefined;
  return {
    prompt,
    ...(opts.size ? { size: opts.size } : {}),
    ...(opts.n ? { n: opts.n } : {}),
    ...(opts.image ? { image: opts.image } : {}),
    ...(model ? { model } : {}),
    ...(useLora
      ? {
          lora: ids.map((id) => ({
            id,
            strength: opts.loraStrengths?.[id] ?? defaultStrengthMap([id])[id],
          })),
        }
      : {}),
  };
}

export function defaultRegionForm() {
  return {
    regionEnhance: true,
    loraIds: [...DEFAULT_LORA_IDS],
    loraStrengths: defaultStrengthMap(DEFAULT_LORA_IDS),
  };
}

/** 点击生成类按钮且开启县域增强时：toast 告知本次会用增强效果 */
export function notifyRegionEnhance(
  toast: (text: string, type?: "info" | "warn" | "success") => void,
  enabled: boolean,
  model?: string,
) {
  if (!enabled) return;
  toast(
    modelSupportsCountyLora(model)
      ? "正在使用县域增强效果（县域 Lora 与知识库）"
      : "正在使用县域增强效果（县域知识库）",
  );
}

/** 制作大片设定：县域增强（兼容旧字段「知识库」） */
export function settingsUseRegionEnhance(settings?: Record<string, string> | null): boolean {
  if (!settings) return true;
  const v = settings["县域增强"] ?? settings["知识库"];
  return v !== "不使用";
}
