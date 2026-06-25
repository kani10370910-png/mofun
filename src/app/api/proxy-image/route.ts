import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 图片读取代理（同源）：前端需要把跨域图床图片 fetch→blob 做本地处理（如抠图）时，
   直接 fetch 跨域图会被 CORS 拦。由服务端拉取后**以图片字节内联返回**（不带 attachment），
   前端即可同源 fetch 拿到 blob。

   用法：GET /api/proxy-image?url=<图片URL>
   仅允许 http/https 的图片地址（SSRF 防护）。与 /api/download 区别：本路由用于「读取处理」，
   download 路由强制 attachment 用于「下载保存」。 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") || "";

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
  if (!upstream || !upstream.ok || !upstream.body) {
    return Response.json({ error: "拉取图片失败" }, { status: 502 });
  }

  const ctype = upstream.headers.get("Content-Type") || "image/png";
  if (!ctype.startsWith("image/")) {
    return Response.json({ error: "目标不是图片" }, { status: 400 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": ctype,
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
