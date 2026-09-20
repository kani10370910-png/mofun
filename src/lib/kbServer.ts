/**
 * 服务端知识库检索：优先运营端知识库，其次 WEKNORA / 远程 RAG。
 * 仅在 Route Handler 中使用。
 */
import {
  DEFAULT_REGION_ID,
  getRegionPack,
  REGION_GEO,
} from "@/data/regionAssets";
import { isWeknoraConfigured, searchWeknora } from "@/lib/weknora";

export type KbHit = {
  id: string;
  title: string;
  summary: string;
  score?: number;
};

export type KbRetrieveResult = {
  regionId: string;
  county: string;
  items: KbHit[];
  kbContext: string;
  source: "remote" | "local" | "weknora" | "ops";
};

export type KbRequestFields = {
  useKB?: boolean;
  regionId?: string;
  county?: string;
  kbContext?: string;
};

function formatContext(items: KbHit[]): string {
  return items
    .map((k) => `- ${k.title}：${k.summary}`)
    .filter((line) => line.length > 4)
    .join("\n");
}

function opsApiBase() {
  return (process.env.OPS_API_BASE || process.env.NEXT_PUBLIC_OPS_API_BASE || "http://localhost:4100").replace(
    /\/$/,
    "",
  );
}

function countyOf(regionId?: string, county?: string) {
  if (county?.trim()) return county.trim();
  const geo = REGION_GEO[regionId || ""] || REGION_GEO[DEFAULT_REGION_ID];
  return geo?.county || getRegionPack(regionId).regionName;
}

function cityOf(regionId?: string) {
  const geo = REGION_GEO[regionId || ""] || REGION_GEO[DEFAULT_REGION_ID];
  return geo?.city || "";
}

async function retrieveOps(opts: {
  query: string;
  regionId: string;
  county: string;
  topK: number;
}): Promise<{ items: KbHit[]; county: string; source: "ops" } | null> {
  try {
    const r = await fetch(`${opsApiBase()}/public/kb/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: opts.query,
        regionId: opts.regionId,
        county: opts.county,
        city: cityOf(opts.regionId),
        topK: opts.topK,
      }),
      signal: AbortSignal.timeout(Number(process.env.KB_TIMEOUT_MS || 8000)),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      items?: Array<{ id?: string; title?: string; summary?: string }>;
      county?: string;
    };
    const items = (j.items || [])
      .map((it, i) => ({
        id: it.id || `ops-${i}`,
        title: (it.title || "").trim(),
        summary: (it.summary || "").trim(),
      }))
      .filter((x) => x.title && x.summary);
    return { items, county: (j.county || opts.county).trim(), source: "ops" };
  } catch {
    return null;
  }
}
async function retrieveGenericRemote(opts: {
  query: string;
  regionId: string;
  county: string;
  topK: number;
}): Promise<KbHit[] | null> {
  const url = process.env.KB_API_URL?.trim();
  if (!url || isWeknoraConfigured()) return null;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.KB_API_KEY ? { Authorization: `Bearer ${process.env.KB_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        query: opts.query,
        regionId: opts.regionId,
        county: opts.county,
        topK: opts.topK,
      }),
      signal: AbortSignal.timeout(Number(process.env.KB_TIMEOUT_MS || 8000)),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      items?: Array<{ id?: string; title?: string; summary?: string; content?: string }>;
    };
    const items = (j.items || [])
      .map((it, i) => ({
        id: it.id || `kb-${i}`,
        title: (it.title || "").trim(),
        summary: (it.summary || it.content || "").trim(),
      }))
      .filter((x) => x.summary);
    return items.length ? items : null;
  } catch {
    return null;
  }
}

async function retrieveRemote(opts: {
  query: string;
  regionId: string;
  county: string;
  topK: number;
}): Promise<{ items: KbHit[]; county?: string; source: "ops" | "weknora" | "remote" } | null> {
  const ops = await retrieveOps(opts);
  if (ops) return ops;
  if (isWeknoraConfigured()) {
    const items = await searchWeknora(opts);
    if (items?.length) return { items, source: "weknora" };
  }
  const generic = await retrieveGenericRemote(opts);
  if (generic?.length) return { items: generic, source: "remote" };
  return null;
}

export async function retrieveKnowledge(opts: {
  useKB?: boolean;
  regionId?: string;
  county?: string;
  query?: string;
  kbContext?: string;
  topK?: number;
}): Promise<KbRetrieveResult | null> {
  if (!opts.useKB) return null;
  const regionId = opts.regionId && REGION_GEO[opts.regionId] ? opts.regionId : opts.regionId || DEFAULT_REGION_ID;
  const county = countyOf(regionId, opts.county);
  const query = (opts.query || "").trim();
  const topK = Math.max(1, Math.min(12, opts.topK ?? 5));

  const remote = await retrieveRemote({
    query,
    regionId,
    county,
    topK,
  });
  const items = (remote?.items || []).slice(0, topK);
  return {
    regionId,
    county: remote?.county || county,
    items,
    kbContext: formatContext(items),
    source: remote?.source || "ops",
  };
}

export function generateKbQuery(req: {
  input?: string;
  prompt?: string;
  product?: string;
  brand?: string;
  title?: string;
  description?: string;
  keywords?: string;
  outline?: string;
}): string {
  return [req.input, req.prompt, req.product, req.brand, req.title, req.description, req.keywords, req.outline]
    .filter((s): s is string => !!String(s || "").trim())
    .join(" ")
    .slice(0, 800);
}

/** 文本 / 出图请求：服务端补齐 county + kbContext */
export async function hydrateKbFields<T extends KbRequestFields>(
  body: T,
  query?: string,
): Promise<T> {
  if (!body.useKB) {
    return { ...body, useKB: false, kbContext: undefined };
  }
  const kb = await retrieveKnowledge({
    useKB: true,
    regionId: body.regionId,
    county: body.county,
    query,
    kbContext: body.kbContext,
  });
  if (!kb?.kbContext) {
    return { ...body, useKB: false, kbContext: undefined };
  }
  return {
    ...body,
    useKB: true,
    regionId: kb.regionId,
    county: kb.county,
    kbContext: kb.kbContext,
  };
}

const IMAGE_KB_MARK = "【在地视觉参考】";
const TEXT_KB_MARK = "【结合本地知识库】";

export function promptAlreadyHasKb(prompt: string): boolean {
  return prompt.includes(IMAGE_KB_MARK) || prompt.includes(TEXT_KB_MARK);
}

const DEMO_COPY = [
  "安吉高山白茶",
  "安吉白茶",
  "萧山杨梅",
  "杜家杨梅",
  "共富茶香",
  "白叶绿茶",
  "丰收茶季",
  "明前头采",
  "明前新茶",
  "初夏头茬",
  "酸甜爆汁",
  "核小肉厚",
  "海拔800米",
  "海拔八百米",
  "鲜爽回甘",
];

function stripDemoCopy(text: string, userPrompt: string): string {
  let out = text;
  for (const d of DEMO_COPY) {
    if (userPrompt.includes(d)) continue;
    out = out.split(d).join("");
  }
  return out.replace(/[；;]{2,}/g, "；").replace(/^；|；$/g, "").trim();
}

/** 出图 prompt：把检索结果融合成「在地视觉参考」，不把系统标签画进画面 */
export function applyKbToImagePrompt(prompt: string, kb: KbRetrieveResult | null): string {
  if (!kb?.kbContext || !prompt.trim()) return prompt;
  if (promptAlreadyHasKb(prompt)) return prompt;
  const rawVisual = kb.items.map((i) => i.summary).filter(Boolean).join("；") || kb.kbContext.replace(/^- /gm, "");
  const visual = stripDemoCopy(rawVisual, prompt);
  if (!visual.trim()) return prompt;
  return (
    `${prompt}\n` +
    `${IMAGE_KB_MARK}融合${kb.county}气质与下列氛围（只影响构图、配色、光影；` +
    `严禁把知识库里的产品名、口号、标语画成画面文字；` +
    `严禁把「本地知识库」「区县知识库」「县域知识库」「Lora」及本段任何说明性文字绘制到画面上；` +
    `画面文字仅限用户给出的品牌名与活动文案，用户未写的特产名不得出现）：${visual}`
  );
}
