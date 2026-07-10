import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 媒体同源代理：把外部网关的视频/图片经本站转发，使前端可在 canvas 中截帧而不触发跨域污染。
   仅用于「抽取上一镜视频最后一帧」等本地合成场景。转发 Range 头以支持 seek。 */

// 基本 SSRF 防护：仅允许 http(s)，拒绝内网/回环地址
function isSafeUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return false;
  }
  return true;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new Response("missing url", { status: 400 });
  if (!isSafeUrl(url)) return new Response("url not allowed", { status: 400 });

  const range = req.headers.get("range");
  // CDN（volces 等）偶发瞬时失败/抖动，重试至多 4 次，保证抽帧/下载稳定
  let upstream: Response | null = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    upstream = await fetch(url, {
      headers: range ? { Range: range } : {},
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);
    if (upstream && upstream.ok && upstream.body) break;
    upstream = null;
    if (attempt < 4) await new Promise((r) => setTimeout(r, 400 * attempt));
  }

  if (!upstream || !upstream.body) return new Response("upstream error", { status: 502 });

  const headers = new Headers();
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control", "etag", "last-modified"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("content-type")) headers.set("content-type", "video/mp4");
  headers.set("Access-Control-Allow-Origin", "*");

  return new Response(upstream.body, { status: upstream.status, headers });
}
