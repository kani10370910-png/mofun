import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function opsBase() {
  return (process.env.OPS_API_BASE || process.env.NEXT_PUBLIC_OPS_API_BASE || "http://localhost:4100").replace(
    /\/$/,
    "",
  );
}

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  try {
    const r = await fetch(`${opsBase()}/public/models/${encodeURIComponent(code)}`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const data = await r.json().catch(() => ({ error: "运营端模型读取失败" }));
    return NextResponse.json(data, {
      status: r.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: `无法连接运营 API（${opsBase()}）。请确认 mofun-ops-api 已启动。` },
      { status: 502 },
    );
  }
}
