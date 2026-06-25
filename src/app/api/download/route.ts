import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 图片下载代理：前端图片在跨域图床（无 CORS 头），浏览器无法 fetch→blob 直接下载。
   由服务端拉取后带 Content-Disposition: attachment 流回，浏览器即直接保存到本地、不跳转网页。

   用法：GET /api/download?url=<图片URL>&name=<文件名>
   仅允许 http/https 的图片地址，避免被当作通用代理（SSRF 防护）。 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") || "";
  const name = (req.nextUrl.searchParams.get("name") || "image").replace(/[\\/:*?"<>|]/g, "_");

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return Response.json({ error: "缺少或非法的图片地址" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return Response.json({ error: "仅支持 http/https 图片地址" }, { status: 400 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);

  // 连接偶发被重置（ECONNRESET，常见于本机代理抖动）时自动重试
  let upstream: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      upstream = await fetch(target.toString(), { signal: ctrl.signal });
      break;
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || attempt === 2) {
        clearTimeout(timer);
        return Response.json({ error: "拉取图片失败" }, { status: 502 });
      }
      await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
    }
  }
  clearTimeout(timer);
  if (!upstream) {
    return Response.json({ error: "拉取图片失败" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: `图片返回错误（${upstream.status}）` }, { status: 502 });
  }

  const ctype = upstream.headers.get("Content-Type") || "image/png";
  // 仅允许图片类型，避免被滥用为任意内容代理
  if (!ctype.startsWith("image/")) {
    return Response.json({ error: "目标不是图片" }, { status: 400 });
  }
  const ext = ctype.includes("jpeg") || ctype.includes("jpg") ? "jpg" : ctype.includes("webp") ? "webp" : "png";
  const filename = /\.(png|jpe?g|webp)$/i.test(name) ? name : `${name}.${ext}`;

  return new Response(upstream.body, {
    headers: {
      "Content-Type": ctype,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "no-store",
    },
  });
}
