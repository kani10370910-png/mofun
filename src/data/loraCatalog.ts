/**
 * 全站 Lora 元数据目录（一期：规则可跑，风格权重可后补）。
 * - region：复用 regionAssets 在地包
 * - style·活动：paintStyles（国潮/水彩…）
 * - style·logo：logoStyles（图文插画/简约/文字/字母/徽章/新中式），预览图见 previewImg
 * - 未来维度：增加 kind + selection=follow_enhance 即可随增强开关
 */
import {
  ALL_REGION_LORAS,
  DEFAULT_REGION_ID,
  type RegionLora,
} from "@/data/regionAssets";
import { logoStyles } from "@/data/image";

/** 维度：style 需用户选风格；其余默认随增强 / useLora */
export type LoraKind = "region" | "style" | (string & {});

export type LoraSelection = "user_style" | "follow_enhance";

export type LoraAsset = {
  id: string;
  kind: LoraKind;
  name: string;
  blurb: string;
  strength: number;
  /** 同 kind 内互斥组 */
  direction: string;
  selection: LoraSelection;
  /** 在地归属；风格为 ["*"] */
  regionIds: string[];
  /** 精确匹配 UI paintStyles / logoStyles key */
  styleKeys?: string[];
  /** auto 弱匹配用关键词（小写比对） */
  styleKeywords?: string[];
  /** 空 = 全场景 */
  scenes?: string[];
  /** UI 风格样张路径（如 logo 风格卡图） */
  previewImg?: string;
  priority: number;
  upstream?: string;
  /** false = 仅元数据占位，不发上游 */
  ready: boolean;
};

function regionNameToId(name: string): string {
  const map: Record<string, string> = {
    安吉: "anji",
    德清: "deqing",
    长兴: "changxing",
    湖州: "huzhou",
    吴兴: "wuxing",
  };
  return map[name] || DEFAULT_REGION_ID;
}

function fromRegionLora(l: RegionLora): LoraAsset {
  return {
    id: l.id,
    kind: "region",
    name: l.name,
    blurb: l.blurb,
    strength: l.strength,
    direction: l.direction,
    selection: "follow_enhance",
    regionIds: [regionNameToId(l.regionName)],
    priority: 50,
    upstream: l.upstream,
    ready: true,
  };
}

/** 活动等画面风格占位：与 paintStyles.key 对齐；不含 logo（logo 用下方专表） */
const EVENT_STYLE_LORAS: LoraAsset[] = [
  {
    id: "lora-style-guochao",
    kind: "style",
    name: "国潮画风",
    blurb: "新中式国潮插画笔触与纹样（全站共用，不按区县拆包）。",
    strength: 0.6,
    direction: "画面风格",
    selection: "user_style",
    regionIds: ["*"],
    styleKeys: ["guochao"],
    styleKeywords: ["国潮", "新中式", "祥云", "回纹", "朱红", "鎏金", "国风", "东方"],
    scenes: ["event", "ip", "font", "product"],
    priority: 80,
    ready: false,
  },
  {
    id: "lora-style-watercolor",
    kind: "style",
    name: "水彩画风",
    blurb: "水彩晕染与纸纹气质，全站共用。",
    strength: 0.58,
    direction: "画面风格",
    selection: "user_style",
    regionIds: ["*"],
    styleKeys: ["watercolor"],
    styleKeywords: ["水彩", "晕染", "水痕", "淡彩", "清新诗意"],
    scenes: ["event", "ip", "font", "product"],
    priority: 80,
    ready: false,
  },
  {
    id: "lora-style-flat",
    kind: "style",
    name: "扁平矢量画风",
    blurb: "大色块扁平矢量，全站共用。",
    strength: 0.55,
    direction: "画面风格",
    selection: "user_style",
    regionIds: ["*"],
    styleKeys: ["flat"],
    styleKeywords: ["扁平", "矢量", "色块", "几何简化", "无渐变"],
    scenes: ["event", "ip", "font", "product"],
    priority: 80,
    ready: false,
  },
  {
    id: "lora-style-cartoon",
    kind: "style",
    name: "卡通动漫画风",
    blurb: "卡通动漫造型与赛璐璐分面，全站共用。",
    strength: 0.55,
    direction: "画面风格",
    selection: "user_style",
    regionIds: ["*"],
    styleKeys: ["cartoon"],
    styleKeywords: ["卡通", "动漫", "二次元", "可爱", "赛璐璐"],
    scenes: ["event", "ip", "font", "product"],
    priority: 80,
    ready: false,
  },
  {
    id: "lora-style-lineart",
    kind: "style",
    name: "线描画风",
    blurb: "工笔线描 / 线稿气质，全站共用。",
    strength: 0.52,
    direction: "画面风格",
    selection: "user_style",
    regionIds: ["*"],
    styleKeys: ["lineart"],
    styleKeywords: ["线描", "线稿", "勾勒", "素描", "工笔细线"],
    scenes: ["event", "ip", "font", "product"],
    priority: 80,
    ready: false,
  },
  {
    id: "lora-style-engraving",
    kind: "style",
    name: "版画画风",
    blurb: "木刻版画刀痕与高对比，全站共用。",
    strength: 0.55,
    direction: "画面风格",
    selection: "user_style",
    regionIds: ["*"],
    styleKeys: ["engraving"],
    styleKeywords: ["版画", "木刻", "刀刻", "黑白套色", "雕版"],
    scenes: ["event", "ip", "font", "product"],
    priority: 80,
    ready: false,
  },
  {
    id: "lora-style-photo",
    kind: "style",
    name: "写实摄影画风",
    blurb: "商业摄影质感，全站共用。",
    strength: 0.5,
    direction: "画面风格",
    selection: "user_style",
    regionIds: ["*"],
    styleKeys: ["photo"],
    styleKeywords: ["写实", "摄影", "实拍", "棚拍", "景深", "相机"],
    scenes: ["event", "ip", "font", "product"],
    priority: 80,
    ready: false,
  },
  {
    id: "lora-style-pattern",
    kind: "style",
    name: "纹样装饰画风",
    blurb: "传统纹样连续装饰，全站共用。",
    strength: 0.55,
    direction: "画面风格",
    selection: "user_style",
    regionIds: ["*"],
    styleKeys: ["pattern"],
    styleKeywords: ["纹样", "二方连续", "四方连续", "吉祥图案", "织物纹饰"],
    scenes: ["event", "ip", "font", "product"],
    priority: 80,
    ready: false,
  },
];

/** Logo 风格元数据：key/预览图与 logoStyles 一致（智能匹配无样张，走弱匹配） */
const LOGO_STYLE_META: {
  key: string;
  id: string;
  blurb: string;
  keywords: string[];
  strength?: number;
}[] = [
  {
    key: "illust",
    id: "lora-logo-illust",
    blurb: "图文插画风 Logo：手绘/插画图形 + 品牌名，生动有故事感。",
    keywords: ["插画", "图文插画", "手绘", "卡通图形", "故事感", "三山两院"],
  },
  {
    key: "simple",
    id: "lora-logo-simple",
    blurb: "图文简约风 Logo：几何简洁图形 + 品牌名，留白充足。",
    keywords: ["简约", "图文简约", "几何", "极简", "干净", "藏书林"],
  },
  {
    key: "word",
    id: "lora-logo-word",
    blurb: "文字型 Logo：以字体设计为核心，可点缀印章落款。",
    keywords: ["文字logo", "字体", "字形", "书法字", "字标", "酿山秋"],
  },
  {
    key: "letter",
    id: "lora-logo-letter",
    blurb: "字母 Logo：首字母图形化组合，现代商务感。",
    keywords: ["字母", "字母logo", "首字母", "英文标", "字母组合", "hero"],
  },
  {
    key: "badge",
    id: "lora-logo-badge",
    blurb: "经典徽章 Logo：圆形/盾形徽章版式，复古专业。",
    keywords: ["徽章", "经典徽章", "印章", "绶带", "圆形标", "粤港记"],
  },
  {
    key: "newcn",
    id: "lora-logo-newcn",
    blurb: "新中式 Logo：国风线条、剪纸/水墨意象 + 书法字。",
    keywords: ["新中式", "国风", "水墨", "仙鹤", "扇面", "云鹤楼", "东方"],
  },
];

const LOGO_STYLE_LORAS: LoraAsset[] = LOGO_STYLE_META.map((m) => {
  const ui = logoStyles.find((s) => s.key === m.key);
  return {
    id: m.id,
    kind: "style" as const,
    name: ui?.name || m.key,
    blurb: m.blurb,
    strength: m.strength ?? 0.55,
    direction: "logo风格",
    selection: "user_style" as const,
    regionIds: ["*"],
    styleKeys: [m.key],
    styleKeywords: m.keywords,
    scenes: ["logo"],
    previewImg: ui?.img,
    priority: 85,
    ready: false,
  };
});

export const ALL_LORA_ASSETS: LoraAsset[] = [
  ...ALL_REGION_LORAS.map(fromRegionLora),
  ...EVENT_STYLE_LORAS,
  ...LOGO_STYLE_LORAS,
];

export function getLoraAssetById(id?: string): LoraAsset | undefined {
  if (!id) return undefined;
  return ALL_LORA_ASSETS.find((a) => a.id === id);
}

export function listLoraAssets(opts?: {
  kind?: LoraKind;
  readyOnly?: boolean;
  scene?: string;
}): LoraAsset[] {
  let list = ALL_LORA_ASSETS;
  if (opts?.kind) list = list.filter((a) => a.kind === opts.kind);
  if (opts?.readyOnly) list = list.filter((a) => a.ready);
  if (opts?.scene) {
    list = list.filter((a) => !a.scenes?.length || a.scenes.includes(opts.scene!));
  }
  return list;
}

export function selectionForKind(kind: LoraKind): LoraSelection {
  return kind === "style" ? "user_style" : "follow_enhance";
}

/** Logo 风格卡：与 UI 一致的 key → 预览图 */
export function logoStylePreviewMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of logoStyles) {
    if (s.img) map[s.key] = s.img;
  }
  return map;
}
