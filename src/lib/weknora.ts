/**
 * 腾讯 WEKNORA 知识库适配：按区县解析 knowledge_base_id，调用 /api/v1/knowledge-search。
 * 仅服务端使用。
 */

export type WeknoraChunk = {
  id?: string;
  content?: string;
  knowledge_title?: string;
  knowledge_filename?: string;
  score?: number;
  knowledge_id?: string;
};

export type WeknoraKbMeta = {
  id: string;
  name: string;
  description?: string;
};

function baseUrl(): string {
  const raw =
    process.env.WEKNORA_BASE_URL?.trim() ||
    process.env.KB_API_URL?.trim().replace(/\/api\/v1\/knowledge-search\/?$/i, "") ||
    "";
  return raw.replace(/\/$/, "");
}

function apiKey(): string {
  return (
    process.env.WEKNORA_API_KEY?.trim() ||
    process.env.KB_API_KEY?.trim() ||
    ""
  );
}

function timeoutMs(): number {
  return Number(process.env.WEKNORA_TIMEOUT_MS || process.env.KB_TIMEOUT_MS || 8000);
}

export function isWeknoraConfigured(): boolean {
  return !!baseUrl();
}

function authHeaders(): Record<string, string> {
  const key = apiKey();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (key) {
    // WEKNORA 官方用 X-API-Key；同时带 Bearer 兼容部分网关
    h["X-API-Key"] = key;
    h.Authorization = `Bearer ${key}`;
  }
  return h;
}

function parseKbMap(): Record<string, string> {
  try {
    const raw = process.env.WEKNORA_KB_MAP?.trim();
    if (!raw) return {};
    const j = JSON.parse(raw) as Record<string, string>;
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

/** 从 WEKNORA_KB_MAP / 默认 ID / 知识库列表名称匹配，解析目标知识库 ID 列表 */
export async function resolveWeknoraKbIds(opts: {
  regionId: string;
  county: string;
}): Promise<string[]> {
  const map = parseKbMap();
  const keys = [
    opts.regionId,
    opts.county,
    opts.county.replace(/[县市区]$/, ""),
    `${opts.county}县`,
    `${opts.county}区`,
    `${opts.county}市`,
  ].filter(Boolean);

  const fromMap: string[] = [];
  for (const k of keys) {
    const id = map[k];
    if (id && !fromMap.includes(id)) fromMap.push(id);
  }
  if (fromMap.length) return fromMap;

  const def = process.env.WEKNORA_DEFAULT_KB_ID?.trim();
  if (def) return [def];

  // 未配映射时：拉列表，用区县名模糊匹配知识库名称（如「安吉县」「湖州市」）
  const list = await listWeknoraKnowledgeBases();
  if (!list.length) return [];
  const needles = keys.map((k) => k.toLowerCase());
  const matched = list.filter((kb) => {
    const name = (kb.name || "").toLowerCase();
    const desc = (kb.description || "").toLowerCase();
    return needles.some((n) => n && (name.includes(n) || desc.includes(n)));
  });
  if (matched.length) return matched.map((m) => m.id);

  // 最后兜底：若只有一个知识库则用它
  if (list.length === 1) return [list[0].id];
  return [];
}

let kbListCache: { at: number; items: WeknoraKbMeta[] } | null = null;

export async function listWeknoraKnowledgeBases(): Promise<WeknoraKbMeta[]> {
  const root = baseUrl();
  if (!root) return [];
  if (kbListCache && Date.now() - kbListCache.at < 60_000) return kbListCache.items;

  try {
    const r = await fetch(`${root}/api/v1/knowledge-bases`, {
      method: "GET",
      headers: authHeaders(),
      signal: AbortSignal.timeout(timeoutMs()),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as {
      data?:
        | Array<{ id?: string; name?: string; description?: string }>
        | {
            items?: Array<{ id?: string; name?: string; description?: string }>;
            knowledge_bases?: Array<{ id?: string; name?: string; description?: string }>;
          };
      items?: Array<{ id?: string; name?: string; description?: string }>;
      success?: boolean;
    };
    const raw = Array.isArray(j.data)
      ? j.data
      : j.data?.items ||
        j.data?.knowledge_bases ||
        j.items ||
        [];
    const items = raw
      .map((x) => ({
        id: String((x as { id?: string }).id || "").trim(),
        name: String((x as { name?: string }).name || "").trim(),
        description: String((x as { description?: string }).description || "").trim(),
      }))
      .filter((x) => x.id);
    kbListCache = { at: Date.now(), items };
    return items;
  } catch {
    return [];
  }
}

export async function searchWeknora(opts: {
  query: string;
  regionId: string;
  county: string;
  topK: number;
}): Promise<{ id: string; title: string; summary: string; score?: number }[] | null> {
  const root = baseUrl();
  if (!root) return null;

  const kbIds = await resolveWeknoraKbIds({
    regionId: opts.regionId,
    county: opts.county,
  });
  if (!kbIds.length) return null;

  const searchUrl =
    process.env.KB_API_URL?.trim().includes("knowledge-search")
      ? process.env.KB_API_URL.trim()
      : `${root}/api/v1/knowledge-search`;

  const body =
    kbIds.length === 1
      ? { query: opts.query || opts.county, knowledge_base_id: kbIds[0] }
      : { query: opts.query || opts.county, knowledge_base_ids: kbIds };

  try {
    const r = await fetch(searchUrl, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs()),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      data?: WeknoraChunk[];
      items?: WeknoraChunk[];
      success?: boolean;
    };
    const chunks = j.data || j.items || [];
    const items = chunks
      .map((c, i) => {
        const summary = String(c.content || "").trim();
        const title =
          String(c.knowledge_title || c.knowledge_filename || "").trim() ||
          `资料${i + 1}`;
        return {
          id: String(c.id || `wk-${i}`),
          title,
          summary: summary.slice(0, 800),
          score: typeof c.score === "number" ? c.score : undefined,
        };
      })
      .filter((x) => x.summary);
    if (!items.length) return null;
    return items.slice(0, opts.topK);
  } catch {
    return null;
  }
}
