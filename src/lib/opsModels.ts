/** 从运营端读取模型调用地址；密钥只在服务端按编码单独拉取。 */

export type OpsModel = {
  code: string;
  name: string;
  service_tag: string;
  client_type: string;
  base_url: string;
};

export type OpsModelCreds = OpsModel & {
  api_key?: string;
  api_key_backup?: string;
  supplier?: string;
};

const TTL_MS = 30_000;
let cache: { at: number; list: OpsModel[] } | null = null;

function opsBase() {
  return (process.env.OPS_API_BASE || process.env.NEXT_PUBLIC_OPS_API_BASE || "http://localhost:4100").replace(
    /\/$/,
    "",
  );
}

export async function listOpsModels(): Promise<OpsModel[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.list;
  try {
    const r = await fetch(`${opsBase()}/public/models`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!r.ok) {
      cache = { at: Date.now(), list: [] };
      return [];
    }
    const j = (await r.json()) as { list?: OpsModel[] };
    const list = (j.list || []).filter((m) => m?.code && m?.base_url);
    cache = { at: Date.now(), list };
    return list;
  } catch {
    cache = { at: Date.now(), list: [] };
    return [];
  }
}

export async function fetchOpsModel(codeOrName?: string): Promise<OpsModel | null> {
  const q = String(codeOrName || "").trim();
  if (!q) return null;
  const list = await listOpsModels();
  const lower = q.toLowerCase();
  return (
    list.find((m) => m.code === q) ||
    list.find((m) => m.name === q) ||
    list.find((m) => m.client_type === q) ||
    list.find((m) => m.code && (q.includes(m.code) || m.code.includes(q))) ||
    list.find((m) => m.name && (q.includes(m.name) || m.name.includes(q))) ||
    list.find((m) => m.client_type && lower.includes(m.client_type.toLowerCase())) ||
    null
  );
}

const credCache = new Map<string, { at: number; row: OpsModelCreds | null }>();

export async function fetchOpsModelCreds(codeOrName?: string): Promise<OpsModelCreds | null> {
  const q = String(codeOrName || "").trim();
  if (!q) return null;
  const hit = credCache.get(q);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.row;
  const urls = [`${opsBase()}/public/models/${encodeURIComponent(q)}`];
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const data = (await r.json()) as OpsModelCreds;
      if (data && (data.code || data.base_url || data.api_key)) {
        credCache.set(q, { at: Date.now(), row: data });
        return data;
      }
    } catch {
      /* try next */
    }
  }
  const listed = await fetchOpsModel(q);
  if (listed?.code && listed.code !== q) {
    const nested = await fetchOpsModelCreds(listed.code);
    credCache.set(q, { at: Date.now(), row: nested });
    return nested;
  }
  credCache.set(q, { at: Date.now(), row: listed });
  return listed;
}

export function opsApiKey(creds?: OpsModelCreds | null, fallback = "") {
  return String(creds?.api_key || creds?.api_key_backup || fallback || "").trim();
}

export function opsBaseUrl(creds?: OpsModelCreds | null, fallback = "") {
  return openaiCompatBase(String(creds?.base_url || fallback || ""));
}

/** OpenAI 兼容调用根地址（已含 /v1 则原样返回） */
export function openaiCompatBase(url: string): string {
  return String(url || "").trim().replace(/\/$/, "");
}

/** Seedance 网关根：代码会再拼 /v1/video/generations，所以去掉末尾 /v1 */
export function videoGatewayRoot(url: string): string {
  return String(url || "")
    .trim()
    .replace(/\/$/, "")
    .replace(/\/v1$/i, "");
}

/** WeKnora 根：代码会再拼 /api/v1/... */
export function weknoraRoot(url: string): string {
  return String(url || "")
    .trim()
    .replace(/\/$/, "")
    .replace(/\/api\/v1$/i, "");
}
