/**
 * 从各功能页「参考灵感」生成模版库条目（封面 + 套用回填）
 * 来源：活动成图 / 商拍 / logo / IP / AI字体 / 店招 / 文案策划 / 一句话成片 / 数字人
 */
import type { Grad, Template } from "@/lib/types";
import {
  activeGalleryItems,
  fontCases,
  fontStories,
  ipCases,
  logoCases,
  productGalleryItems,
  signageGalleryItems,
} from "@/data/image";
import { planHistory } from "@/data/content";
import { avatarInspires, onelineInspires } from "@/data/videoInspires";

const GRADS: Grad[] = [
  "thumb-grad-1",
  "thumb-grad-2",
  "thumb-grad-3",
  "thumb-grad-4",
  "thumb-grad-5",
  "thumb-grad-6",
];

function gradAt(i: number): Grad {
  return GRADS[i % GRADS.length];
}

function usesAt(i: number): string {
  const n = 180 + ((i * 37) % 1800);
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function inferScene(text: string): string {
  if (/茶|笋|杨梅|萝卜|粮|米|农产|果|蔬/.test(text)) return "农产品";
  if (/民宿|农家乐|食堂|菜单/.test(text)) return "农家乐·民宿";
  if (/景区|旅游|竹乡|余村|文旅|打卡|游园/.test(text)) return "旅游景点";
  if (/节|元宵|开业|圣诞|节庆/.test(text)) return "节庆活动";
  if (/电商|主图|促销|礼盒|旗舰|店招|通栏/.test(text)) return "电商推广";
  if (/朋友圈|小红书|社媒|推文/.test(text)) return "社交媒体";
  if (/招商|投资|峰会|校招|招聘/.test(text)) return "招商宣传";
  if (/政策|科普|解读|能源|乡村建设/.test(text)) return "政策科普";
  return "电商推广";
}

/** EVENT 成图子类 → 模版分类 */
const EVENT_SUBS = new Set(["海报", "长图", "菜单", "易拉宝", "宣传单"]);

export function templatesFromInspiration(): Template[] {
  const out: Template[] = [];
  let i = 0;

  // —— 品牌设计 · 活动成图（海报/长图/菜单/易拉宝/宣传单）——
  for (const it of activeGalleryItems) {
    const sub = EVENT_SUBS.has(it.sub) ? it.sub : "海报";
    out.push({
      emoji: it.emoji || "🖼️",
      name: it.name,
      scene: inferScene(`${it.name} ${it.prompt || ""}`),
      type: "image",
      sub,
      hot: false,
      uses: usesAt(i),
      grad: it.grad || gradAt(i),
      img: it.img,
      fill: {
        eventSub: sub,
        input: it.prompt || it.name,
      },
    });
    i++;
  }

  // —— 商拍 ——
  for (const it of productGalleryItems) {
    out.push({
      emoji: it.emoji || "📷",
      name: it.name,
      scene: "电商推广",
      type: "image",
      sub: "商拍",
      hot: false,
      uses: usesAt(i),
      grad: it.grad || gradAt(i),
      img: it.img,
      fill: { input: it.prompt || it.name },
    });
    i++;
  }

  // —— logo ——
  for (const c of logoCases) {
    out.push({
      emoji: c.emoji || "🎨",
      name: c.name,
      scene: inferScene(c.name),
      type: "image",
      sub: "logo",
      hot: false,
      uses: usesAt(i),
      grad: c.grad || gradAt(i),
      img: c.img,
      fill: {
        brand: c.name,
        style: c.cat,
        input: c.desc || `参考「${c.name}」制作 LOGO，${c.cat}风格`,
      },
    });
    i++;
  }

  // —— IP ——
  for (const c of ipCases) {
    out.push({
      emoji: c.emoji || "🧸",
      name: `${c.name} IP 形象`,
      scene: inferScene(`${c.name} ${c.cat}`),
      type: "image",
      sub: "IP设计",
      hot: false,
      uses: usesAt(i),
      grad: c.grad || gradAt(i),
      img: c.img,
      fill: {
        input: c.desc,
        colors: c.colors?.join(","),
        ratio: c.ratioName || "正方形 1:1",
      },
    });
    i++;
  }

  // —— AI 字体 · 参考灵感 ——
  for (const c of fontCases) {
    out.push({
      emoji: "🔤",
      name: `${c.text} · ${c.tag}`,
      scene: "节庆活动",
      type: "image",
      sub: "AI字体",
      hot: false,
      uses: usesAt(i),
      grad: c.grad || gradAt(i),
      img: c.img,
      fill: {
        text: c.text,
        effect: c.tag,
        style: c.cat,
        dir: "横向",
      },
    });
    i++;
  }

  // —— AI 字体 · 字体故事 ——
  for (const s of fontStories) {
    out.push({
      emoji: "📖",
      name: `${s.name}字体故事`,
      scene: "节庆活动",
      type: "image",
      sub: "AI字体",
      hot: false,
      uses: usesAt(i),
      grad: gradAt(i),
      img: s.cover,
      fill: {
        text: s.title,
        effect: s.name,
        style: s.cat,
        dir: "横向",
      },
    });
    i++;
  }

  // —— 店招 ——
  for (const it of signageGalleryItems) {
    const nameM = it.prompt?.match(/店铺名「([^」]+)」/);
    const sloganM = it.prompt?.match(/副文案「([^」]+)」/);
    out.push({
      emoji: it.emoji || "🏪",
      name: it.name,
      scene: inferScene(`${it.name} ${it.prompt || ""}`),
      type: "image",
      sub: "店招设计",
      hot: false,
      uses: usesAt(i),
      grad: it.grad || gradAt(i),
      img: it.img,
      fill: {
        brand: nameM?.[1] || it.name,
        slogan: sloganM?.[1],
        input: it.prompt || it.name,
      },
    });
    i++;
  }

  // —— 文案策划 · 社媒参考灵感 ——
  for (const row of planHistory) {
    out.push({
      emoji: "💬",
      name: `${row.name}社媒推文`,
      scene: inferScene(row.name),
      type: "content",
      sub: "社媒推文",
      hot: false,
      uses: usesAt(i),
      grad: gradAt(i),
      fill: {
        product: row.name,
        platforms: row.platforms.join(","),
        advantage: row.highlights.map((h) => h.text).join("；"),
      },
    });
    i++;
  }

  // —— 一句话成片 ——
  for (const it of onelineInspires) {
    out.push({
      emoji: it.emoji || "🎬",
      name: `${it.scene}一句话成片`,
      scene: inferScene(`${it.cat} ${it.scene} ${it.prompt}`),
      type: "video",
      sub: "一句话成片",
      hot: false,
      uses: usesAt(i),
      grad: gradAt(i),
      img: it.poster,
      fill: { input: it.prompt },
    });
    i++;
  }

  // —— 数字人 ——
  for (const it of avatarInspires) {
    out.push({
      emoji: "📱",
      name: it.title,
      scene: "旅游景点",
      type: "video",
      sub: "数字人模特",
      hot: false,
      uses: usesAt(i),
      grad: gradAt(i),
      img: it.cover,
      fill: { input: it.script },
    });
    i++;
  }

  return out;
}

/** 模版唯一键：类型 + 分类 + 名称 */
export function templateKey(t: Template): string {
  return `${t.type}::${t.sub}::${t.name}`;
}

/**
 * 合并精选模版与灵感全量：灵感打底，精选覆盖同名项（保留热门标记与定制 fill/img）
 */
export function mergeTemplates(featured: Template[], fromInsp: Template[]): Template[] {
  const map = new Map<string, Template>();
  for (const t of fromInsp) map.set(templateKey(t), t);
  for (const t of featured) {
    const k = templateKey(t);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, t);
      continue;
    }
    map.set(k, {
      ...prev,
      ...t,
      img: t.img || prev.img,
      fill: t.fill ? { ...prev.fill, ...t.fill } : prev.fill,
      hot: t.hot || prev.hot,
      uses: t.uses || prev.uses,
    });
  }
  const list = [...map.values()];
  list.sort((a, b) => {
    if (a.hot !== b.hot) return a.hot ? -1 : 1;
    const typeOrder = { image: 0, content: 1, video: 2 } as const;
    if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
    return a.name.localeCompare(b.name, "zh");
  });
  return list;
}
