import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function opsBase() {
  return (process.env.OPS_API_BASE || process.env.NEXT_PUBLIC_OPS_API_BASE || "http://localhost:4100").replace(
    /\/$/,
    "",
  );
}

export async function GET() {
  try {
    const r = await fetch(`${opsBase()}/public/harness`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!r.ok) {
      return NextResponse.json({ error: "运营端 Harness 读取失败" }, { status: 502 });
    }
    const data = await r.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: `无法连接运营 API（${opsBase()}）。请确认 mofun-ops-api 已启动。` },
      { status: 502 },
    );
  }
}
