import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* 视频下载代理：前端通过此路由下载跨域 CDN 视频，使用自定义文件名，
   避免直接跳转到外部 CDN（download 属性对跨域 URL 无效）。
   GET /api/proxy-video?url=<视频URL>&name=<文件名> */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") || "";
  const name = req.nextUrl.searchParams.get("name") || "video";

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return Response.json({ error: "非法视频地址" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return Response.json({ error: "仅支持 http/https 地址" }, { status: 400 });
  }

  const upstream = await fetch(target.toString(), {
    signal: AbortSignal.timeout(55_000),
  }).catch(() => null);

  if (!upstream?.ok || !upstream.body) {
    return Response.json({ error: "拉取视频失败" }, { status: 502 });
  }

  const safeName = name.replace(/[^一-龥\w\s\-]/g, "").slice(0, 40) || "video";
  const ctype = upstream.headers.get("Content-Type") || "video/mp4";
  const cl = upstream.headers.get("Content-Length");

  const headers: Record<string, string> = {
    "Content-Type": ctype,
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.mp4`,
    "Cache-Control": "no-store",
  };
  if (cl) headers["Content-Length"] = cl;

  return new Response(upstream.body, { headers });
}
