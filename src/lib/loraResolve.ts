/**
 * 区县 / 风格 Lora → 上游通道名。仅服务端出图时使用。
 * 可用 LORA_UPSTREAM_MAP（JSON）覆盖内部 id。
 */
import { getLoraAssetById } from "@/data/loraCatalog";
import {
  DEFAULT_REGION_ID,
  defaultLoraIdsForRegion,
  defaultStrengthMap,
  filterLoraIdsForCity,
  getCityRegionId,
  getLoraById,
} from "@/data/regionAssets";
import { modelSupportsCountyLora } from "@/lib/imageModelCatalog";

export type LoraInput = { id?: string; name?: string; strength?: number };
export type UpstreamLora = { id: string; name: string; strength: number };

function upstreamMap(): Record<string, string> {
  try {
    const raw = process.env.LORA_UPSTREAM_MAP?.trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveUpstreamLoraName(idOrName?: string): string {
  if (!idOrName) return "";
  const map = upstreamMap();
  if (map[idOrName]) return map[idOrName];
  const catalog = getLoraAssetById(idOrName);
  if (catalog) {
    if (map[catalog.id]) return map[catalog.id];
    return catalog.upstream || catalog.id;
  }
  const meta = getLoraById(idOrName);
  if (map[meta.id]) return map[meta.id];
  return meta.upstream || meta.id || idOrName;
}

export function resolveUpstreamLoras(
  loras: LoraInput[] | undefined,
  opts?: { model?: string; regionId?: string; useLora?: boolean },
): UpstreamLora[] {
  if (opts?.useLora === false) return [];
  const model = opts?.model;
  if (model && !modelSupportsCountyLora(model)) return [];

  let list = loras?.filter((l) => l.id || l.name) || [];
  if (!list.length && opts?.useLora) {
    const regionId = opts.regionId || DEFAULT_REGION_ID;
    const ids = filterLoraIdsForCity(defaultLoraIdsForRegion(regionId), getCityRegionId(regionId));
    const strengths = defaultStrengthMap(ids);
    list = ids.map((id) => ({ id, strength: strengths[id] }));
  }
  if (!list.length) return [];

  return list.map((l) => {
    const meta = getLoraById(l.id || l.name);
    const upstream = resolveUpstreamLoraName(l.id || meta.id || l.name);
    const strength = Number(l.strength ?? meta.strength ?? 0.7);
    return {
      id: upstream,
      name: upstream,
      strength: Number.isFinite(strength) ? Math.max(0.05, Math.min(1.2, strength)) : meta.strength,
    };
  });
}
