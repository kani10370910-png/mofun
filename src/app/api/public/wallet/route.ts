import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function opsBase() {
  return (process.env.OPS_API_BASE || process.env.NEXT_PUBLIC_OPS_API_BASE || "http://localhost:4100").replace(
    /\/$/,
    "",
  );
}

export async function GET(req: Request) {
  try {
    const phone = new URL(req.url).searchParams.get("phone") || "";
    const tenantCode = new URL(req.url).searchParams.get("tenant_code") || "";
    const qs = `phone=${encodeURIComponent(phone)}${tenantCode ? `&tenant_code=${encodeURIComponent(tenantCode)}` : ""}`;
    const r = await fetch(`${opsBase()}/public/wallet?${qs}`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const data = await r.json().catch(() => ({ error: "运营端算力读取失败" }));
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

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const r = await fetch(`${opsBase()}/public/wallet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const data = await r.json().catch(() => ({ error: "运营端算力同步失败" }));
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
