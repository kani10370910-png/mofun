/**
 * 服务端知识库检索：优先 WEKNORA / 远程 RAG，否则按账号区县本地包 + query 取 TopK。
 * 仅在 Route Handler 中使用。
 */
import {
  DEFAULT_REGION_ID,
  getRegionPack,
  type RegionKnowledge,
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
  source: "remote" | "local" | "weknora";
};

export type KbRequestFields = {
  useKB?: boolean;
  regionId?: string;
  county?: string;
  kbContext?: string;
};

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[\s,，。！？、；;:：/\\|+（）()【】\[\]“”"']+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function scoreEntry(query: string, k: RegionKnowledge): number {
  const text = `${k.title} ${k.summary}`.toLowerCase();
  const tokens = tokenize(query);
  if (!tokens.length) return 1;
  let s = 0;
  for (const t of tokens) {
    if (text.includes(t)) s += 2;
    else if (t.length >= 3 && [...t].some((_, i) => i < t.length - 1 && text.includes(t.slice(i, i + 2)))) {
      s += 0.3;
    }
  }
  if (/风貌|物产|符号|茶|竹|丝绸|莲|山|湖/.test(k.title + k.summary)) s += 0.4;
  return s;
}

function formatContext(items: KbHit[]): string {
  return items
    .map((k) => `- ${k.title}：${k.summary}`)
    .filter((line) => line.length > 4)
    .join("\n");
}

/** 通用远程 RAG（非 WEKNORA 协议） */
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
}): Promise<{ items: KbHit[]; source: "weknora" | "remote" } | null> {
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
  const pack = getRegionPack(opts.regionId || DEFAULT_REGION_ID);
  const county = (opts.county || pack.regionName).trim();
  const query = (opts.query || "").trim();
  const topK = Math.max(1, Math.min(12, opts.topK ?? 5));

  const remote = await retrieveRemote({
    query,
    regionId: pack.regionId,
    county,
    topK,
  });
  if (remote?.items.length) {
    const items = remote.items.slice(0, topK);
    return {
      regionId: pack.regionId,
      county,
      items,
      kbContext: formatContext(items),
      source: remote.source,
    };
  }

  let ranked: KbHit[] = pack.knowledge.map((k) => ({
    ...k,
    score: scoreEntry(query, k),
  }));
  if (query) {
    const hit = ranked.filter((x) => (x.score || 0) > 0).sort((a, b) => (b.score || 0) - (a.score || 0));
    ranked = hit.length ? hit : pack.knowledge;
  }
  const items = ranked.slice(0, topK);
  const kbContext = formatContext(items) || (opts.kbContext || "").trim();
  if (!kbContext) {
    return {
      regionId: pack.regionId,
      county,
      items: [],
      kbContext: "",
      source: "local",
    };
  }
  return {
    regionId: pack.regionId,
    county,
    items,
    kbContext,
    source: "local",
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

/** 出图 prompt：把检索结果融合成「在地视觉参考」，不把系统标签画进画面 */
export function applyKbToImagePrompt(prompt: string, kb: KbRetrieveResult | null): string {
  if (!kb?.kbContext || !prompt.trim()) return prompt;
  if (promptAlreadyHasKb(prompt)) return prompt;
  const visual = kb.items.map((i) => i.summary).filter(Boolean).join("；") || kb.kbContext.replace(/^- /gm, "");
  if (!visual.trim()) return prompt;
  return (
    `${prompt}\n` +
    `${IMAGE_KB_MARK}融合${kb.county}气质与下列氛围（只影响构图、配色、光影与物产意象；` +
    `严禁把「本地知识库」「区县知识库」「县域知识库」「Lora」及本段任何说明性文字绘制到画面上；` +
    `画面文字仅限用户活动/品牌所需文案）：${visual}`
  );
}
