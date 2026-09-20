export type CanonicalChatPayload = {
  canonical: boolean;
  list: unknown[];
  updatedAt?: string;
};

function isLocalHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

function opsBase() {
  return (process.env.NEXT_PUBLIC_OPS_API_BASE || "http://localhost:4100").replace(/\/$/, "");
}

function chatUrls() {
  return [`${opsBase()}/public/agent-chats`, "/public/agent-chats", "/api/public/agent-chats"];
}

export function pickCanonicalChatSessions<
  T extends {
    title?: string;
    updatedAt?: number;
    messages?: { role?: string; text?: string; images?: string[] }[];
  },
>(list: T[]): T[] {
  const scored = list
    .filter((s) => Array.isArray(s.messages) && s.messages.length > 0)
    .map((s) => {
      const bag = `${s.title || ""} ${s.messages?.map((m) => m.text || "").join("\n") || ""}`;
      const hasImage = (s.messages || []).some((m) => Array.isArray(m.images) && m.images.length > 0);
      const hasStory = /IP 故事|安吉晨雾|品牌IP诞生/.test(bag);
      const titleHit = /生成一个品牌设计/.test(bag);
      return {
        s,
        score: (hasImage ? 2 : 0) + (hasStory ? 2 : 0) + (titleHit ? 1 : 0),
        n: s.messages?.length || 0,
        updatedAt: Number(s.updatedAt || 0),
      };
    })
    .sort((a, b) => b.score - a.score || b.n - a.n || b.updatedAt - a.updatedAt);
  const best = scored[0];
  if (!best) return [];
  if (best.score >= 3 || (scored.length === 1 && best.n >= 4)) return [best.s];
  return best.score >= 2 ? [best.s] : [];
}

export async function fetchCanonicalChats(): Promise<CanonicalChatPayload | null> {
  for (const url of chatUrls()) {
    try {
      const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const data = (await r.json()) as CanonicalChatPayload;
      if (data && typeof data === "object") {
        return {
          canonical: Boolean(data.canonical),
          list: Array.isArray(data.list) ? data.list : [],
          updatedAt: data.updatedAt,
        };
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function pushCanonicalChats(list: unknown[]) {
  const body = JSON.stringify({ list });
  const headers = { "Content-Type": "application/json" };
  for (const url of chatUrls()) {
    try {
      const r = await fetch(url, {
        method: "PUT",
        headers,
        body,
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

export async function hydrateCanonicalHistory<T>(opts: {
  readLocal: () => T[];
  readLegacy: () => T[];
  writeLocal: (list: T[]) => void;
}): Promise<T[]> {
  const remote = await fetchCanonicalChats();
  if (remote?.canonical && remote.list.length) {
    const list = remote.list as T[];
    opts.writeLocal(list);
    return list;
  }
  if (isLocalHost()) {
    const merged = [...opts.readLocal(), ...opts.readLegacy()];
    const seen = new Set<string>();
    const uniq = merged.filter((item) => {
      const id = String((item as { id?: string }).id || "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const keep = pickCanonicalChatSessions(uniq as { title?: string; updatedAt?: number; messages?: { text?: string; images?: string[] }[] }[]) as T[];
    opts.writeLocal(keep);
    if (keep.length) void pushCanonicalChats(keep);
    return keep;
  }
  opts.writeLocal([]);
  return [];
}
