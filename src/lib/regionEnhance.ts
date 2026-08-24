import {
  DEFAULT_LORA_IDS,
  DEFAULT_REGION_ID,
  defaultLoraIdsForRegion,
  defaultStrengthMap,
  filterLoraIdsForCity,
  getCityRegionId,
  getLoraById,
  getLorasByIds,
  getRegionPack,
  isRegionAllowedForCity,
  formatRegionGeoLabel,
  resolveRegionIdFromText,
} from "@/data/regionAssets";
import type { AuthUser } from "@/lib/auth";
import { hasEnterpriseInfo } from "@/lib/auth";
import {
  COUNTY_EDIT_MODEL,
  COUNTY_T2I_MODEL,
  modelSupportsCountyLora,
  resolveImageModelId,
} from "@/lib/imageModelCatalog";
import { resolveUserOrgCityRegionId, resolveUserOrgRegionId } from "@/lib/org";

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
  UI_SEEDREAM_50,
} from "@/lib/imageModelCatalog";

export { defaultLoraIdsForRegion } from "@/data/regionAssets";

/** 本地增强双开关 */
export type RegionEnhanceFlags = {
  useLora: boolean;
  useKB: boolean;
};

export function regionEnhanceAny(flags: RegionEnhanceFlags | boolean | undefined): boolean {
  if (flags == null) return false;
  if (typeof flags === "boolean") return flags;
  return !!(flags.useLora || flags.useKB);
}

export function accountCityRegionId(user?: AuthUser | null): string {
  if (typeof window !== "undefined" && user && hasEnterpriseInfo(user)) {
    try {
      const fromOrg = resolveUserOrgCityRegionId(user);
      if (fromOrg) return getCityRegionId(fromOrg);
    } catch {
      /* ignore */
    }
    const fromProfile = resolveRegionIdFromText(
      [user.company, user.orgName, user.address].filter(Boolean).join(" ")
    );
    return getCityRegionId(fromProfile);
  }
  return getCityRegionId(accountRegionId(user));
}

export function accountRegionId(user?: AuthUser | null): string {
  // 企业版：按组织所属「市」限定知识库 / Lora；成员 OU 在市内时可使用下辖区县包
  if (typeof window !== "undefined" && user && hasEnterpriseInfo(user)) {
    try {
      const cityId = accountCityRegionId(user);
      const ouRegion = resolveUserOrgRegionId(user);
      if (ouRegion && isRegionAllowedForCity(ouRegion, cityId)) return ouRegion;
      return cityId;
    } catch {
      /* ignore */
    }
  }
  // 组织关系：成员所属 OU 的 region（含父链继承）优先
  if (typeof window !== "undefined" && user) {
    try {
      const fromOrg = resolveUserOrgRegionId(user);
      if (fromOrg) return fromOrg;
    } catch {
      /* ignore */
    }
  }
  const explicit = user?.regionId?.trim();
  if (explicit) {
    const pack = getRegionPack(explicit);
    if (pack.regionId === explicit) return explicit;
  }
  return resolveRegionIdFromText(
    [user?.address, user?.orgName, user?.company].filter(Boolean).join(" ")
  );
}

/** 企业账号所属市名称，如「湖州」 */
export function accountCityRegionLabel(user?: AuthUser | null): string {
  return getRegionPack(accountCityRegionId(user)).regionName;
}

/** 区县短名，如「安吉」 */
export function accountRegionLabel(user?: AuthUser | null): string {
  return getRegionPack(accountRegionId(user)).regionName;
}

/** 顶栏等地展示用，如「安吉县」 */
export function accountRegionDisplay(user?: AuthUser | null): string {
  const name = accountRegionLabel(user);
  return /[县市区]$/.test(name) ? name : `${name}县`;
}

/** 企业版：从注册地址 / 企业名推断区县；个人版返回 null */
export function resolveEnterpriseRegionId(user?: AuthUser | null): string | null {
  if (!user || !hasEnterpriseInfo(user)) return null;
  const explicit = user.regionId?.trim();
  if (explicit && getRegionPack(explicit).regionId === explicit) return explicit;
  const fromText = resolveRegionIdFromText(
    [user.address, user.company, user.orgName].filter(Boolean).join(" ")
  );
  return fromText;
}

/** 账号县域展示：企业版按企业位置，个人版由调用方用手机号号段 */
export function formatAccountRegionGeoLabel(user?: AuthUser | null): string {
  if (user && hasEnterpriseInfo(user)) {
    return formatRegionGeoLabel(accountRegionId(user));
  }
  const rid = user?.regionId?.trim();
  if (rid && getRegionPack(rid).regionId === rid) return formatRegionGeoLabel(rid);
  return formatRegionGeoLabel(DEFAULT_REGION_ID);
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
  regionId?: string;
  county?: string;
  kbContext?: string;
} {
  if (!enabled) return { useKB: false };
  const meta = regionMeta(regionId);
  return {
    useKB: true,
    regionId: meta.regionId,
    county: meta.county,
    /** 前端摘要仅作兜底；服务端会按 query + regionId 再检索 */
    kbContext: meta.kbContext,
  };
}

export function loraPromptSuffix(ids: string[], strengths: Record<string, number> = {}): string {
  const list = getLorasByIds(ids.length ? ids : DEFAULT_LORA_IDS);
  if (!list.length) return "";
  return (
    "【区县Lora】" +
    list
      .map((l) => `${l.name}（强度${Number(strengths[l.id] ?? l.strength).toFixed(2)}）：${l.blurb}`)
      .join("；")
  );
}

function resolveFlags(opts: {
  regionEnhance?: boolean;
  useLora?: boolean;
  useKB?: boolean;
}): RegionEnhanceFlags {
  return {
    useLora: opts.useLora ?? opts.regionEnhance ?? false,
    useKB: opts.useKB ?? opts.regionEnhance ?? false,
  };
}

/**
 * 出图 prompt：知识库开时注入「在地视觉气质」。
 * Lora 不在此处拼进文字，只通过 imageRequestBody.lora 调上游通道。
 */
export function applyRegionToImagePrompt(opts: {
  prompt: string;
  regionEnhance?: boolean;
  useLora?: boolean;
  useKB?: boolean;
  model?: string;
  loraIds?: string[];
  loraStrengths?: Record<string, number>;
  regionId?: string;
}): string {
  const { useKB } = resolveFlags(opts);
  if (!useKB) return opts.prompt;
  const pack = getRegionPack(opts.regionId);
  const visual = pack.knowledge.map((k) => k.summary).filter(Boolean).join("；");
  if (!visual) return opts.prompt;
  return (
    `${opts.prompt}\n` +
    `【在地视觉参考】融合${pack.regionName}气质与下列氛围（只影响构图、配色、光影与物产意象；` +
    `严禁把「本地知识库」「区县知识库」「县域知识库」「Lora」及本段任何说明性文字绘制到画面上；` +
    `画面文字仅限用户活动/品牌所需文案）：${visual}`
  );
}

export function imageRequestBody(opts: {
  prompt: string;
  size?: string;
  n?: number;
  image?: string | string[];
  model?: string;
  /** @deprecated 同时控制 Lora + 知识库；优先用 useLora / useKB */
  regionEnhance?: boolean;
  useLora?: boolean;
  useKB?: boolean;
  loraIds?: string[];
  loraStrengths?: Record<string, number>;
  regionId?: string;
}) {
  const flags = resolveFlags(opts);
  /** 原始 prompt 交给 /api/image，由服务端检索知识库后再注入，避免双写 */
  const prompt = opts.prompt;
  /** 开启 Lora 但当前模型不支持时，自动改用区域文化大模型，保证 lora 能挂上 */
  let modelName = opts.model;
  if (flags.useLora && !modelSupportsCountyLora(modelName)) {
    modelName = opts.image ? COUNTY_EDIT_MODEL : COUNTY_T2I_MODEL;
  }
  const useLora = flags.useLora && modelSupportsCountyLora(modelName);
  const baseRegion = opts.regionId || DEFAULT_REGION_ID;
  const cityId = getCityRegionId(baseRegion);
  let ids = opts.loraIds?.length ? opts.loraIds : defaultLoraIdsForRegion(baseRegion);
  ids = filterLoraIdsForCity(ids, cityId);
  const model = modelName ? resolveImageModelId(modelName) : undefined;
  return {
    prompt,
    useKB: flags.useKB,
    useLora,
    regionId: baseRegion,
    ...(opts.size ? { size: opts.size } : {}),
    ...(opts.n ? { n: opts.n } : {}),
    ...(opts.image ? { image: opts.image } : {}),
    ...(model ? { model } : {}),
    ...(useLora
      ? {
          lora: ids.map((id) => {
            const l = getLoraById(id);
            return {
              id: l.id,
              name: l.upstream || l.name,
              strength: opts.loraStrengths?.[id] ?? defaultStrengthMap([id])[id] ?? l.strength,
            };
          }),
        }
      : {}),
  };
}

export function defaultRegionForm(regionId?: string) {
  const cityId = getCityRegionId(regionId);
  const loraIds = filterLoraIdsForCity(defaultLoraIdsForRegion(regionId), cityId);
  return {
    useLora: true,
    useKB: true,
    /** @deprecated 兼容旧字段：任一开启即为 true */
    regionEnhance: true,
    loraIds,
    loraStrengths: defaultStrengthMap(loraIds),
  };
}

/** 点击生成类按钮：按双开关 toast */
export function notifyRegionEnhance(
  toast: (text: string, type?: "info" | "warn" | "success") => void,
  flags: boolean | RegionEnhanceFlags,
  model?: string,
) {
  const resolved =
    typeof flags === "boolean"
      ? { useLora: flags, useKB: flags }
      : { useLora: !!flags.useLora, useKB: !!flags.useKB };
  const useLora = resolved.useLora && modelSupportsCountyLora(model);
  const useKB = resolved.useKB;
  if (!useLora && !useKB) return;
  if (useLora && useKB) toast("正在使用本地增强（Lora 与知识库）");
  else if (useLora) toast("正在使用本地增强（Lora）");
  else toast("正在使用本地增强（知识库）");
}

/** 制作大片设定：本地增强（兼容旧字段）→ 同时视为 Lora+知识库总开关 */
export function settingsUseRegionEnhance(settings?: Record<string, string> | null): boolean {
  if (!settings) return true;
  const v =
    settings["本地增强"] ?? settings["区县增强"] ?? settings["县域增强"] ?? settings["知识库"];
  return v !== "不使用";
}
