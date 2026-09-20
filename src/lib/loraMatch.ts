/**
 * Lora 匹配器（一期）
 * - style：用户选风格 → 精确；auto → prompt 弱匹配
 * - region / 未来 follow_enhance 维：随 useLora，默认可手动覆盖
 */
import {
  ALL_LORA_ASSETS,
  getLoraAssetById,
  type LoraAsset,
  type LoraKind,
} from "@/data/loraCatalog";
import {
  DEFAULT_REGION_ID,
  defaultLoraIdsForRegion,
  filterLoraIdsForCity,
  getCityRegionId,
} from "@/data/regionAssets";
import { modelSupportsCountyLora } from "@/lib/imageModelCatalog";

export const WEAK_STYLE_MIN_SCORE = 2;
/** 风格最多 1；follow 维合计上限（含在地） */
export const MAX_STYLE_LORAS = 1;
export const MAX_FOLLOW_LORAS = 2;

export type LoraMatchInput = {
  useLora: boolean;
  model?: string;
  regionId?: string;
  /** 功能场景：event / logo / ip / font / product … */
  scene?: string;
  /** paintStyles.key；auto 或空走弱匹配 */
  artStyleKey?: string;
  /** 弱匹配语料 */
  prompt?: string;
  /** 仅覆盖 follow_enhance（在地等）；不覆盖风格 */
  manualLoraIds?: string[];
  /** 强度覆盖 */
  strengths?: Record<string, number>;
  /**
   * true：含 ready=false 的占位（测规则）
   * false/默认：出图前过滤未就绪项
   */
  includeUnready?: boolean;
};

export type MatchedLora = {
  id: string;
  kind: LoraKind;
  strength: number;
  score: number;
  reason: string;
  ready: boolean;
  upstream?: string;
};

export type LoraMatchResult = {
  items: MatchedLora[];
  /** 可发上游的子集 */
  readyItems: MatchedLora[];
  styleId?: string;
  followIds: string[];
};

function regionAllowed(asset: LoraAsset, regionId: string, cityId: string): boolean {
  if (asset.regionIds.includes("*")) return true;
  if (asset.regionIds.includes(regionId)) return true;
  const cityRegions = new Set(
    // 与 filter 一致：本市 + 下辖以 regionIds 是否含当前区县 / 市为准
    asset.regionIds,
  );
  return cityRegions.has(cityId);
}

function promptWantsTeaLora(prompt: string): boolean {
  return /白茶|茶叶|茶园|茶农|绿茶|红茶|采茶|茶山/.test(prompt);
}

function isTeaLora(asset: LoraAsset): boolean {
  return asset.direction === "白茶" || /白茶|茶叶/.test(`${asset.name}${asset.id}`);
}

function sceneOk(asset: LoraAsset, scene?: string): boolean {
  if (!scene || !asset.scenes?.length) return true;
  return asset.scenes.includes(scene);
}

function weakStyleScore(asset: LoraAsset, prompt: string): number {
  const text = prompt.toLowerCase();
  if (!text || !asset.styleKeywords?.length) return 0;
  let score = 0;
  for (const kw of asset.styleKeywords) {
    const k = kw.toLowerCase();
    if (!k) continue;
    if (text.includes(k)) score += k.length >= 3 ? 1.5 : 1;
  }
  score += (asset.priority || 0) * 0.01;
  return score;
}

function toMatched(
  asset: LoraAsset,
  score: number,
  reason: string,
  strengths?: Record<string, number>,
): MatchedLora {
  return {
    id: asset.id,
    kind: asset.kind,
    strength: strengths?.[asset.id] ?? asset.strength,
    score,
    reason,
    ready: asset.ready,
    upstream: asset.upstream,
  };
}

/** 同 kind+direction 去重，保留分高者 */
function dedupeByDirection(items: MatchedLora[]): MatchedLora[] {
  const best = new Map<string, MatchedLora>();
  for (const it of items) {
    const asset = getLoraAssetById(it.id);
    const key = `${it.kind}::${asset?.direction || it.id}`;
    const prev = best.get(key);
    if (!prev || it.score > prev.score) best.set(key, it);
  }
  return [...best.values()];
}

/**
 * 核心匹配。不读写网络；纯函数。
 */
export function matchLoras(input: LoraMatchInput): LoraMatchResult {
  const empty: LoraMatchResult = { items: [], readyItems: [], followIds: [] };
  if (!input.useLora) return empty;
  if (input.model && !modelSupportsCountyLora(input.model)) return empty;

  const regionId = input.regionId || DEFAULT_REGION_ID;
  const cityId = getCityRegionId(regionId);
  const styleKey = (input.artStyleKey || "auto").trim() || "auto";
  const prompt = input.prompt || "";

  const stylePool = ALL_LORA_ASSETS.filter(
    (a) => a.selection === "user_style" && a.kind === "style" && sceneOk(a, input.scene),
  );
  const followPool = ALL_LORA_ASSETS.filter(
    (a) => a.selection === "follow_enhance" && sceneOk(a, input.scene),
  );

  const styleHits: MatchedLora[] = [];
  const followHits: MatchedLora[] = [];

  // —— 风格：精确 / 弱匹配 ——
  if (styleKey !== "auto") {
    const exact = stylePool.find((a) => a.styleKeys?.includes(styleKey));
    if (exact) {
      styleHits.push(toMatched(exact, 100 + exact.priority, `style_exact:${styleKey}`, input.strengths));
    }
  } else {
    const ranked = stylePool
      .map((a) => ({ a, score: weakStyleScore(a, prompt) }))
      .filter((x) => x.score >= WEAK_STYLE_MIN_SCORE)
      .sort((x, y) => y.score - x.score || y.a.priority - x.a.priority);
    if (ranked[0]) {
      styleHits.push(
        toMatched(ranked[0].a, ranked[0].score, "style_weak:auto", input.strengths),
      );
    }
  }

  // —— follow 维：手动优先，否则默认在地 ——
  const manual = (input.manualLoraIds || []).flatMap((id) => {
    const a = getLoraAssetById(id);
    if (!a || a.selection !== "follow_enhance") return [];
    return [a];
  });

  if (manual.length) {
    for (const a of manual) {
      if (!regionAllowed(a, regionId, cityId) && a.kind === "region") {
        // 区县越权：跳过该条
        continue;
      }
      // 市内管辖再滤一层（与现网 filterLoraIdsForCity 对齐）
      if (a.kind === "region") {
        const ok = filterLoraIdsForCity([a.id], cityId).includes(a.id);
        if (!ok) continue;
      }
      followHits.push(toMatched(a, 90 + a.priority, "follow_manual", input.strengths));
    }
  } else {
    const defaultIds = filterLoraIdsForCity(defaultLoraIdsForRegion(regionId), cityId);
    for (const id of defaultIds) {
      const a = followPool.find((x) => x.id === id) || getLoraAssetById(id);
      if (!a || a.selection !== "follow_enhance") continue;
      if (isTeaLora(a) && !promptWantsTeaLora(prompt)) continue;
      followHits.push(toMatched(a, 40 + a.priority, "follow_default_region", input.strengths));
    }
    // 预留：其它 follow kind 的「默认项」可在此按 kind 注册 defaultXxxForRegion
  }

  let styles = dedupeByDirection(styleHits).slice(0, MAX_STYLE_LORAS);
  let follows = dedupeByDirection(followHits).slice(0, MAX_FOLLOW_LORAS);

  if (!input.includeUnready) {
    styles = styles.filter((x) => x.ready);
    follows = follows.filter((x) => x.ready);
  }

  const items = [...styles, ...follows];
  const readyItems = items.filter((x) => x.ready);
  return {
    items,
    readyItems,
    styleId: styles[0]?.id,
    followIds: follows.map((x) => x.id),
  };
}

/** 给 imageRequestBody / 上游用的精简列表 */
export function matchLorasForUpstream(input: LoraMatchInput): { id: string; strength: number }[] {
  return matchLoras({ ...input, includeUnready: false }).readyItems.map((x) => ({
    id: x.id,
    strength: x.strength,
  }));
}
