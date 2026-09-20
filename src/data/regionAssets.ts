/** 区县资产包：知识库摘要供扩写/出图引用；Lora 列表随区县模型通道真实挂载 */

export type RegionLora = {
  id: string;
  name: string;
  blurb: string;
  strength: number;
  /** 方向 / 类型：同方向仅能选一个 */
  direction: string;
  /** 列表/卡片缩略示意（emoji） */
  emoji?: string;
  /** 所属地域名，便于搜索与列表展示 */
  regionName: string;
  /** 上游 Comfy / 网关挂载名；缺省用 id，可用 env LORA_UPSTREAM_MAP 覆盖 */
  upstream?: string;
};

export type RegionKnowledge = { id: string; title: string; summary: string };

export type RegionAssetPack = {
  regionId: string;
  regionName: string;
  /** 该地域默认 / 推荐 Lora（兼容旧字段：取 loras[0]） */
  lora: RegionLora;
  loras: RegionLora[];
  knowledge: RegionKnowledge[];
};

/** 全站区县 Lora 目录（「查看更多」列表）；同 direction 互斥 */
export const ALL_REGION_LORAS: RegionLora[] = [
  {
    id: "lora-anji-tea",
    name: "安吉白茶风格",
    blurb: "强化云雾茶园、嫩芽、清新国风笔触，避免通用茶叶贴纸感。",
    strength: 0.7,
    direction: "白茶",
    emoji: "",
    regionName: "安吉",
  },
  {
    id: "lora-anji-tea-qingya",
    name: "安吉白茶·清雅",
    blurb: "更偏淡雅留白与青绿晕染，适合轻量包装与清新主视觉。",
    strength: 0.65,
    direction: "白茶",
    emoji: "",
    regionName: "安吉",
  },
  {
    id: "lora-anji-bamboo",
    name: "竹海清风",
    blurb: "竹海层峦、青翠留白与清透光影，适合文旅主视觉与清新包装。",
    strength: 0.65,
    direction: "竹海",
    emoji: "",
    regionName: "安吉",
  },
  {
    id: "lora-anji-yucun",
    name: "余村共富",
    blurb: "绿水青山、乡村共富场景，暖阳民居与生态田园氛围。",
    strength: 0.6,
    direction: "共富",
    emoji: "",
    regionName: "安吉",
  },
  {
    id: "lora-anji-changshuo",
    name: "昌硕书画意",
    blurb: "金石书画笔意、水墨疏密与印章朱砂点缀，偏文化艺术气质。",
    strength: 0.55,
    direction: "书画",
    emoji: "",
    regionName: "安吉",
  },
  {
    id: "lora-anji-luobo",
    name: "萝卜干风味",
    blurb: "乡土腌制食材气质，暖黄木色与烟火市集氛围，适合特产包装。",
    strength: 0.6,
    direction: "萝卜干",
    emoji: "",
    regionName: "安吉",
  },
  {
    id: "lora-anji-luobo-1",
    name: "萝卜干风味·醇香",
    blurb: "同方向强化醇香烟火感与陶罐纹理，偏餐饮门店主视觉。",
    strength: 0.62,
    direction: "萝卜干",
    emoji: "",
    regionName: "安吉",
  },
  {
    id: "lora-deqing-moganshan",
    name: "莫干山避暑",
    blurb: "竹林山居、避暑清凉与民国风洋房，适合度假文旅海报。",
    strength: 0.68,
    direction: "避暑",
    emoji: "",
    regionName: "德清",
  },
  {
    id: "lora-changxing-taihe",
    name: "太湖溇港",
    blurb: "太湖水岸、溇港渔家与芦苇烟波，水色偏青灰蓝。",
    strength: 0.62,
    direction: "溇港",
    emoji: "",
    regionName: "长兴",
  },
  {
    id: "lora-huzhou-silk",
    name: "湖州丝绸",
    blurb: "丝绸光泽、织纹肌理与江南雅致配色，适合轻工与礼品视觉。",
    strength: 0.58,
    direction: "丝绸",
    emoji: "",
    regionName: "湖州",
  },
  {
    id: "lora-wuxing-lotus",
    name: "南太湖莲香",
    blurb: "莲叶田田、水乡晨雾与柔粉青绿，清新夏日氛围。",
    strength: 0.6,
    direction: "莲香",
    emoji: "",
    regionName: "吴兴",
  },
];

const PACKS: Record<string, RegionAssetPack> = {
  anji: {
    regionId: "anji",
    regionName: "安吉",
    loras: ALL_REGION_LORAS.filter((l) => l.regionName === "安吉"),
    lora: ALL_REGION_LORAS[0],
    knowledge: [
      {
        id: "k1",
        title: "明前茶",
        summary: "晨雾、嫩绿与清透光影，适合清新国风氛围，不要当作画面标题或产品名。",
      },
      {
        id: "k2",
        title: "产地风貌",
        summary: "层叠山峦与竹海留白、青绿配色，只影响风景气质，不要把海拔数字写成海报标语。",
      },
      {
        id: "k3",
        title: "文化符号",
        summary: "竹、云纹、印章留白等装饰符号；禁止把示例口号画进画面，除非用户原文包含。",
      },
    ],
  },
  deqing: {
    regionId: "deqing",
    regionName: "德清",
    loras: ALL_REGION_LORAS.filter((l) => l.regionName === "德清"),
    lora: ALL_REGION_LORAS.find((l) => l.regionName === "德清") || ALL_REGION_LORAS[0],
    knowledge: [
      { id: "k1", title: "山居度假", summary: "莫干山山居、竹林清凉与民宿生活方式，适合文旅与活动视觉。" },
      { id: "k2", title: "在地风貌", summary: "起伏山岭与林间建筑并存，画面偏清透、克制、自然。" },
      { id: "k3", title: "表达方向", summary: "适合避暑、疗愈、慢生活等主题传播。" },
    ],
  },
  changxing: {
    regionId: "changxing",
    regionName: "长兴",
    loras: ALL_REGION_LORAS.filter((l) => l.regionName === "长兴"),
    lora: ALL_REGION_LORAS.find((l) => l.regionName === "长兴") || ALL_REGION_LORAS[0],
    knowledge: [
      { id: "k1", title: "水域意象", summary: "太湖岸线与溇港水系，适合蓝灰青系视觉表达。" },
      { id: "k2", title: "在地场景", summary: "渔家、湿地、芦苇等元素增强地域识别。" },
      { id: "k3", title: "传播主题", summary: "适合生态、文旅、农文产品等本地宣传。" },
    ],
  },
  huzhou: {
    regionId: "huzhou",
    regionName: "湖州",
    loras: ALL_REGION_LORAS.filter((l) => l.regionName === "湖州"),
    lora: ALL_REGION_LORAS.find((l) => l.regionName === "湖州") || ALL_REGION_LORAS[0],
    knowledge: [
      { id: "k1", title: "丝绸质感", summary: "强调织纹、光泽与雅致留白，适合轻工礼品视觉。" },
      { id: "k2", title: "江南调性", summary: "柔和配色与秩序化构图，兼顾商业感和文化感。" },
      { id: "k3", title: "应用方向", summary: "适用于品牌海报、礼盒包装与活动KV。" },
    ],
  },
  wuxing: {
    regionId: "wuxing",
    regionName: "吴兴",
    loras: ALL_REGION_LORAS.filter((l) => l.regionName === "吴兴"),
    lora: ALL_REGION_LORAS.find((l) => l.regionName === "吴兴") || ALL_REGION_LORAS[0],
    knowledge: [
      { id: "k1", title: "莲香水乡", summary: "莲叶、晨雾与水系场景，形成清新夏日风格。" },
      { id: "k2", title: "色彩特征", summary: "偏青绿、浅蓝、柔粉，突出轻盈与自然感。" },
      { id: "k3", title: "传播适配", summary: "适合文旅节庆、特产推广和主题活动主视觉。" },
    ],
  },
};

export const DEFAULT_REGION_ID = "anji";
export const DEFAULT_LORA_ID = ALL_REGION_LORAS[0].id;
export const DEFAULT_LORA_IDS = [DEFAULT_LORA_ID];

/** 区县 regionId → 所属市级 regionId（企业账号仅能调取本市及下辖知识库 / Lora） */
export const REGION_TO_CITY: Record<string, string> = {
  huzhou: "huzhou",
  anji: "huzhou",
  deqing: "huzhou",
  changxing: "huzhou",
  wuxing: "huzhou",
  hangzhou: "hangzhou",
  xiaoshan: "hangzhou",
};

/** 地域包 → 省 / 市 / 区县展示名 */
export const REGION_GEO: Record<string, { province: string; city: string; county: string }> = {
  anji: { province: "浙江省", city: "湖州市", county: "安吉县" },
  deqing: { province: "浙江省", city: "湖州市", county: "德清县" },
  changxing: { province: "浙江省", city: "湖州市", county: "长兴县" },
  wuxing: { province: "浙江省", city: "湖州市", county: "吴兴区" },
  huzhou: { province: "浙江省", city: "湖州市", county: "湖州市" },
  hangzhou: { province: "浙江省", city: "杭州市", county: "杭州市" },
  xiaoshan: { province: "浙江省", city: "杭州市", county: "萧山区" },
};

export function formatRegionGeoLabel(regionId: string = DEFAULT_REGION_ID): string {
  const geo = REGION_GEO[regionId] || REGION_GEO[DEFAULT_REGION_ID];
  if (geo.county === geo.city) return `${geo.province} · ${geo.city}`;
  return `${geo.province} · ${geo.city} · ${geo.county}`;
}

/** 解析地域包所属市级 id */
export function getCityRegionId(regionId: string = DEFAULT_REGION_ID): string {
  return REGION_TO_CITY[regionId] || regionId;
}

/** 某市可访问的全部地域包 id（市本级 + 下辖区县） */
export function getCityJurisdictionRegionIds(cityRegionId: string): string[] {
  const ids = Object.entries(REGION_TO_CITY)
    .filter(([, city]) => city === cityRegionId)
    .map(([rid]) => rid);
  return ids.length ? ids : [cityRegionId];
}

/** 目标地域是否在该市管辖范围内 */
export function isRegionAllowedForCity(regionId: string, cityRegionId: string): boolean {
  return getCityJurisdictionRegionIds(cityRegionId).includes(regionId);
}

/** 该市可用的全部 Lora（市 + 下辖区县） */
export function availableLorasForCity(cityRegionId: string): RegionLora[] {
  const seen = new Set<string>();
  const out: RegionLora[] = [];
  for (const rid of getCityJurisdictionRegionIds(cityRegionId)) {
    for (const l of getRegionPack(rid).loras) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      out.push(l);
    }
  }
  return out.length ? out : getRegionPack(cityRegionId).loras;
}

/** 过滤 Lora id，仅保留本市管辖范围内的模型 */
export function filterLoraIdsForCity(ids: string[], cityRegionId: string): string[] {
  const allowed = new Set(availableLorasForCity(cityRegionId).map((l) => l.id));
  const filtered = ids.filter((id) => allowed.has(id));
  if (filtered.length) return filtered;
  const defaults = defaultLoraIdsForRegion(cityRegionId);
  return defaults.filter((id) => allowed.has(id));
}

export function searchRegionLorasForCity(query: string, cityRegionId: string): RegionLora[] {
  const q = query.trim().toLowerCase();
  const pool = availableLorasForCity(cityRegionId);
  if (!q) return pool;
  return pool.filter(
    (l) =>
      l.name.toLowerCase().includes(q) ||
      l.blurb.toLowerCase().includes(q) ||
      l.regionName.toLowerCase().includes(q) ||
      l.direction.toLowerCase().includes(q)
  );
}

export function getRegionPack(regionId: string = DEFAULT_REGION_ID): RegionAssetPack {
  return PACKS[regionId] || PACKS[DEFAULT_REGION_ID];
}

export function defaultLoraIdsForRegion(regionId: string = DEFAULT_REGION_ID): string[] {
  const pack = getRegionPack(regionId);
  return pack.lora?.id ? [pack.lora.id] : [DEFAULT_LORA_ID];
}

export function getLoraById(id?: string): RegionLora {
  return ALL_REGION_LORAS.find((l) => l.id === id) || ALL_REGION_LORAS[0];
}

export function getLorasByIds(ids: string[]): RegionLora[] {
  const set = new Set(ids);
  return ALL_REGION_LORAS.filter((l) => set.has(l.id));
}

export function searchRegionLoras(query: string, cityRegionId?: string): RegionLora[] {
  if (cityRegionId) return searchRegionLorasForCity(query, cityRegionId);
  const q = query.trim().toLowerCase();
  if (!q) return ALL_REGION_LORAS;
  return ALL_REGION_LORAS.filter(
    (l) =>
      l.name.toLowerCase().includes(q) ||
      l.blurb.toLowerCase().includes(q) ||
      l.regionName.toLowerCase().includes(q) ||
      l.direction.toLowerCase().includes(q)
  );
}

/** 在已选列表中查找与目标同方向的 Lora */
export function findConflictLora(selectedIds: string[], candidateId: string): RegionLora | null {
  const candidate = getLoraById(candidateId);
  for (const id of selectedIds) {
    if (id === candidateId) continue;
    const cur = getLoraById(id);
    if (cur.direction === candidate.direction) return cur;
  }
  return null;
}

/** 多选：已选则取消；同方向冲突返回 conflict；否则加入 */
export function toggleSelectLora(
  selectedIds: string[],
  candidateId: string
): { next: string[]; conflict: RegionLora | null } {
  if (selectedIds.includes(candidateId)) {
    return { next: selectedIds.filter((id) => id !== candidateId), conflict: null };
  }
  const conflict = findConflictLora(selectedIds, candidateId);
  if (conflict) return { next: selectedIds, conflict };
  return { next: [...selectedIds, candidateId], conflict: null };
}

export function defaultStrengthMap(ids: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const id of ids) map[id] = getLoraById(id).strength;
  return map;
}

/** 根据企业名称 / 注册地址推断地域包 id */
export function resolveRegionIdFromText(text?: string): string {
  const t = (text || "").toLowerCase();
  if (!t) return DEFAULT_REGION_ID;
  if (t.includes("萧山")) return "xiaoshan";
  if (t.includes("杭州")) return "hangzhou";
  if (t.includes("安吉")) return "anji";
  if (t.includes("德清")) return "deqing";
  if (t.includes("长兴")) return "changxing";
  if (t.includes("吴兴")) return "wuxing";
  if (t.includes("湖州")) return "huzhou";
  if (t.includes("浙江")) return "huzhou";
  return DEFAULT_REGION_ID;
}

/** 从企业资料解析 regionId 并返回标准展示文案 */
export function resolveRegionLabelFromEnterpriseText(text?: string): string {
  return formatRegionGeoLabel(resolveRegionIdFromText(text));
}
