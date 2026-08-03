/**
 * 模版套用：把功能页「参考灵感」内容填入对应工作台
 */
import { templates } from "@/data/templates";
import type { Template, TemplateFill } from "@/lib/types";

const IMAGE_SUB_ENTRY: Record<string, string> = {
  海报: "event",
  长图: "event",
  菜单: "event",
  易拉宝: "event",
  宣传单: "event",
  商拍: "product",
  logo: "logo",
  IP设计: "ip",
  AI字体: "font",
  店招设计: "signage",
};

const CONTENT_SUB_ENTRY: Record<string, string> = {
  社媒推文: "social",
  公众号帮写: "official",
  品牌推广: "brand",
};

const VIDEO_SUB_ENTRY: Record<string, string> = {
  一句话成片: "oneline",
  数字人模特: "avatar",
  制作大片: "studio",
};

export function resolveTemplateRoute(t: Template): { view: string; sub: string } {
  if (t.type === "image") {
    return { view: "image", sub: IMAGE_SUB_ENTRY[t.sub] ?? "event" };
  }
  if (t.type === "content") {
    return { view: "content", sub: CONTENT_SUB_ENTRY[t.sub] ?? "social" };
  }
  return { view: "video", sub: VIDEO_SUB_ENTRY[t.sub] ?? "oneline" };
}

/** 套用跳转：只带 sub + tpl 键，长文案由工作台按模版回填 */
export function buildTemplateApplyHref(t: Template): string {
  const { view, sub } = resolveTemplateRoute(t);
  const q = new URLSearchParams();
  q.set("sub", sub);
  q.set("tpl", `${t.type}::${t.sub}::${t.name}`);
  return `/${view}?${q.toString()}`;
}

export function findTemplateByName(name: string | null | undefined): Template | undefined {
  if (!name?.trim()) return undefined;
  const raw = name.trim();
  const byKey = templates.find((t) => `${t.type}::${t.sub}::${t.name}` === raw);
  if (byKey) return byKey;
  return templates.find((t) => t.name === raw);
}

/** 把 TemplateFill 摊平为各编辑器已识别的 initial 键 */
export function templateFillToInitial(fill: TemplateFill | undefined, routeSub: string): Record<string, string> {
  if (!fill) return {};
  const o: Record<string, string> = {};
  const put = (k: string, v?: string) => {
    if (v?.trim()) o[k] = v.trim();
  };

  put("input", fill.input);
  put("product", fill.product);
  put("brand", fill.brand);
  put("slogan", fill.slogan);
  put("audience", fill.audience);
  put("advantage", fill.advantage);
  put("title", fill.title);
  put("keywords", fill.keywords);
  put("platforms", fill.platforms);
  put("style", fill.style);
  put("text", fill.text);
  put("effect", fill.effect);
  put("dir", fill.dir);
  put("colors", fill.colors);
  put("ratio", fill.ratio);

  if (routeSub === "event") {
    put("eventSub", fill.eventSub);
  }

  return o;
}

/** 从 URL 的 tpl 解析回填字段（可与 query 合并，query 优先） */
export function resolveTplInitial(
  tplName: string | null | undefined,
  routeSub: string,
  query: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  const t = findTemplateByName(tplName);
  const fromFill = templateFillToInitial(t?.fill, routeSub);
  return { ...fromFill, ...query };
}
