import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WebHit = { title: string; text: string };

function asHits(raw: unknown): WebHit[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      const o = x as { title?: string; text?: string; snippet?: string; AbstractText?: string; Text?: string };
      const title = String(o.title || "").trim();
      const text = String(o.text || o.snippet || o.AbstractText || o.Text || "").trim();
      return { title, text };
    })
    .filter((x) => x.title || x.text);
}

/** 公开参考检索。配了 WEB_SEARCH_URL 走自建接口，否则用 DuckDuckGo Instant Answer（可能为空，不假装命中）。 */
export async function POST(req: NextRequest) {
  let body: { query?: string; topK?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体解析失败" }, { status: 400 });
  }
  const query = String(body.query || "").trim();
  const topK = Math.min(8, Math.max(1, Number(body.topK) || 4));
  if (!query) return Response.json({ items: [], source: "none" });

  const custom = process.env.WEB_SEARCH_URL?.trim();
  if (custom) {
    try {
      const r = await fetch(custom, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.WEB_SEARCH_KEY ? { Authorization: `Bearer ${process.env.WEB_SEARCH_KEY}` } : {}),
        },
        body: JSON.stringify({ query, topK }),
        signal: AbortSignal.timeout(4000),
      });
      if (r.ok) {
        const j = (await r.json()) as { items?: unknown };
        return Response.json({ items: asHits(j.items).slice(0, topK), source: "custom" });
      }
    } catch {
      /* 回退 DDG */
    }
  }

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const r = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { Accept: "application/json" } });
    if (!r.ok) return Response.json({ items: [], source: "none" });
    const j = (await r.json()) as {
      AbstractText?: string;
      Heading?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string } | { Topics?: Array<{ Text?: string }> }>;
    };
    const items: WebHit[] = [];
    if (j.AbstractText) items.push({ title: j.Heading || query, text: j.AbstractText });
    for (const t of j.RelatedTopics || []) {
      if ("Text" in t && t.Text) items.push({ title: query, text: t.Text });
      if ("Topics" in t) {
        for (const s of t.Topics || []) {
          if (s.Text) items.push({ title: query, text: s.Text });
        }
      }
    }
    return Response.json({ items: items.slice(0, topK), source: "ddg" });
  } catch {
    return Response.json({ items: [], source: "none" });
  }
}
