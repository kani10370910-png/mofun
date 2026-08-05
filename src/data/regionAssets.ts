/** 地域增强资产包（演示）：展示用，不接真实 Lora / RAG */

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

/** 全站演示 Lora 目录（「查看更多」列表）；同 direction 互斥 */
export const ALL_REGION_LORAS: RegionLora[] = [
  {
    id: "lora-anji-tea",
    name: "安吉白茶风格",
    blurb: "强化云雾茶园、嫩芽、清新国风笔触，避免通用茶叶贴纸感。",
    strength: 0.7,
    direction: "白茶",
    emoji: "🍃",
    regionName: "安吉",
  },
  {
    id: "lora-anji-tea-qingya",
    name: "安吉白茶·清雅",
    blurb: "更偏淡雅留白与青绿晕染，适合轻量包装与清新主视觉。",
    strength: 0.65,
    direction: "白茶",
    emoji: "🍃",
    regionName: "安吉",
  },
  {
    id: "lora-anji-bamboo",
    name: "竹海清风",
    blurb: "竹海层峦、青翠留白与清透光影，适合文旅主视觉与清新包装。",
    strength: 0.65,
    direction: "竹海",
    emoji: "🎋",
    regionName: "安吉",
  },
  {
    id: "lora-anji-yucun",
    name: "余村共富",
    blurb: "绿水青山、乡村共富场景，暖阳民居与生态田园氛围。",
    strength: 0.6,
    direction: "共富",
    emoji: "🏡",
    regionName: "安吉",
  },
  {
    id: "lora-anji-changshuo",
    name: "昌硕书画意",
    blurb: "金石书画笔意、水墨疏密与印章朱砂点缀，偏文化艺术气质。",
    strength: 0.55,
    direction: "书画",
    emoji: "🖌️",
    regionName: "安吉",
  },
  {
    id: "lora-anji-luobo",
    name: "萝卜干风味",
    blurb: "乡土腌制食材气质，暖黄木色与烟火市集氛围，适合特产包装。",
    strength: 0.6,
    direction: "萝卜干",
    emoji: "🥕",
    regionName: "安吉",
  },
  {
    id: "lora-anji-luobo-1",
    name: "萝卜干风味·醇香",
    blurb: "同方向强化醇香烟火感与陶罐纹理，偏餐饮门店主视觉。",
    strength: 0.62,
    direction: "萝卜干",
    emoji: "🥕",
    regionName: "安吉",
  },
  {
    id: "lora-deqing-moganshan",
    name: "莫干山避暑",
    blurb: "竹林山居、避暑清凉与民国风洋房，适合度假文旅海报。",
    strength: 0.68,
    direction: "避暑",
    emoji: "🏔️",
    regionName: "德清",
  },
  {
    id: "lora-changxing-taihe",
    name: "太湖溇港",
    blurb: "太湖水岸、溇港渔家与芦苇烟波，水色偏青灰蓝。",
    strength: 0.62,
    direction: "溇港",
    emoji: "🌊",
    regionName: "长兴",
  },
  {
    id: "lora-huzhou-silk",
    name: "湖州丝绸",
    blurb: "丝绸光泽、织纹肌理与江南雅致配色，适合轻工与礼品视觉。",
    strength: 0.58,
    direction: "丝绸",
    emoji: "🧵",
    regionName: "湖州",
  },
  {
    id: "lora-wuxing-lotus",
    name: "南太湖莲香",
    blurb: "莲叶田田、水乡晨雾与柔粉青绿，清新夏日氛围。",
    strength: 0.6,
    direction: "莲香",
    emoji: "🪷",
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
        summary: "清明前后采摘，氨基酸含量高，鲜爽回甘，常作为品牌高端线叙事。",
      },
      {
        id: "k2",
        title: "产地风貌",
        summary: "海拔八百米高山茶园，晨雾与竹海交织，视觉符号偏青绿、留白与云雾。",
      },
      {
        id: "k3",
        title: "文化符号",
        summary: "白叶绿茶、一叶知秋、共富茶香等本地意象，适合融入主视觉与辅助图形。",
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

export function getRegionPack(regionId: string = DEFAULT_REGION_ID): RegionAssetPack {
  return PACKS[regionId] || PACKS[DEFAULT_REGION_ID];
}

export function getLoraById(id?: string): RegionLora {
  return ALL_REGION_LORAS.find((l) => l.id === id) || ALL_REGION_LORAS[0];
}

export function getLorasByIds(ids: string[]): RegionLora[] {
  const set = new Set(ids);
  return ALL_REGION_LORAS.filter((l) => set.has(l.id));
}

export function searchRegionLoras(query: string): RegionLora[] {
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

/** 根据账号资料文本（地址/企业名）推断地域包 */
export function resolveRegionIdFromText(text?: string): string {
  const t = (text || "").toLowerCase();
  if (!t) return DEFAULT_REGION_ID;
  if (t.includes("安吉")) return "anji";
  if (t.includes("德清")) return "deqing";
  if (t.includes("长兴")) return "changxing";
  if (t.includes("吴兴")) return "wuxing";
  if (t.includes("湖州")) return "huzhou";
  return DEFAULT_REGION_ID;
}
