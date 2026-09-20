import type { AssetCard, Grad } from "./types";
import type { EventRunRow } from "@/components/image/ActiveGallery";
import type { FontRunRow } from "@/components/image/FontGallery";
import type { IpRunRow } from "@/components/image/IpGallery";
import type { LogoRunRow } from "@/components/image/LogoGallery";

/** URL initial 与 sessionStorage 暂存卡片的 edit 合并（卡片优先，保证完整） */
export function mergeReeditInitial(
  initial: Record<string, string | undefined> | undefined,
  card: AssetCard | null | undefined,
): Record<string, string | undefined> {
  const base = { ...(initial ?? {}) };
  const edit = card?.edit;
  if (!edit) return base;
  for (const [k, v] of Object.entries(edit)) {
    if (k === "sub" || !v?.trim()) continue;
    base[k] = v.trim();
  }
  return base;
}

/** 从作品卡片提取全部图片（含 bundle 多图） */
export function collectBundleImages(c: AssetCard): string[] {
  if (c.bundle?.length) {
    const imgs = c.bundle.map((b) => b.img).filter((x): x is string => !!x);
    if (imgs.length) return imgs;
  }
  return c.img ? [c.img] : [];
}

export function parseColorList(raw?: string): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const list = raw.split(/[、,，]/).map((s) => s.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

function gradList(count: number, fallback?: AssetCard["grad"]): Grad[] {
  if (count <= 0) return fallback ? [fallback] : [];
  return Array.from({ length: count }, (_, i) => fallback || (`thumb-grad-${(i % 6) + 1}` as Grad));
}

function ipTitle(c: AssetCard): string {
  const e = c.edit;
  if (e?.title?.trim()) return e.title.trim();
  return c.name.replace(/\s*·\s*IP 设计.*$/, "").trim() || c.name;
}

export function buildEventReedit(c: AssetCard, id: string, overrides?: Partial<EventRunRow>): EventRunRow {
  const e = c.edit || {};
  const imgs = collectBundleImages(c);
  return {
    id,
    prompt: e.input || c.name,
    sub: e.eventSub || overrides?.sub || "自定义",
    ratioName: e.ratio || "",
    time: c.time || "",
    pct: 100,
    imgs,
    grads: gradList(imgs.length, c.grad),
    ...overrides,
  };
}

export function buildIpReedit(c: AssetCard, id: string): IpRunRow {
  const e = c.edit || {};
  const imgs = collectBundleImages(c);
  const colors = parseColorList(e.colors);
  const rawDesc = e.rawDesc?.trim();
  const desc = e.input?.trim();
  const ratioName = e.ratio?.trim();
  const title = ipTitle(c);
  return {
    id,
    title,
    desc,
    rawDesc: rawDesc || undefined,
    colors,
    ratioName,
    create: rawDesc || desc || colors?.length || ratioName
      ? { desc: rawDesc || desc || "", colors, ratioName }
      : undefined,
    time: c.time || "",
    pct: 100,
    grads: gradList(imgs.length, c.grad),
    imgs,
  };
}

export function buildLogoReedit(c: AssetCard, id: string): LogoRunRow {
  const e = c.edit || {};
  const imgs = collectBundleImages(c);
  const img = imgs[0];
  return {
    id,
    prompt: e.input || e.brand || c.name,
    style: e.style || "",
    desc: e.input,
    time: c.time || "",
    pct: 100,
    results: imgs.length
      ? imgs.map((imgUrl, i) => ({
          emoji: "",
          grad: gradList(imgs.length, c.grad)[i],
          fav: false,
          img: imgUrl,
        }))
      : [{ emoji: "", grad: c.grad, fav: false, ...(img ? { img } : {}) }],
  };
}

export function buildFontReedit(c: AssetCard, id: string): FontRunRow {
  const e = c.edit || {};
  const imgs = collectBundleImages(c);
  return {
    id,
    text: e.text || c.name,
    effect: e.effect || "",
    dir: e.dir || "横向",
    time: c.time || "",
    pct: 100,
    results: imgs.length
      ? imgs.map((imgUrl, i) => ({ grad: gradList(imgs.length, c.grad)[i], img: imgUrl }))
      : [{ grad: c.grad, ...(imgs[0] ? { img: imgs[0] } : {}) }],
  };
}

export function buildProductReedit(c: AssetCard, id: string): EventRunRow {
  const e = c.edit || {};
  return buildEventReedit(c, id, {
    prompt: e.input || c.name,
    sub: e.task || "商拍",
    ratioName: e.size || e.ratio || "",
  });
}

export function buildSignageReedit(c: AssetCard, id: string): EventRunRow {
  const e = c.edit || {};
  const shop = e.shopName?.trim();
  return buildEventReedit(c, id, {
    prompt: shop ? `${shop}${e.input && e.input !== shop ? ` · ${e.input}` : ""}` : e.input || c.name,
    sub: e.channel || e.style || "店招",
    ratioName: e.size || e.ratio || "",
  });
}
