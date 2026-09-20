import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function writeSeedFile(raw: string) {
  try {
    const dest = path.resolve(process.cwd(), "..", "mofun-ops-api", "data", "canonical-chats.json");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, raw);
  } catch {
    /* ignore */
  }
}

function opsBase() {
  return (process.env.OPS_API_BASE || process.env.NEXT_PUBLIC_OPS_API_BASE || "http://localhost:4100").replace(
    /\/$/,
    "",
  );
}

async function proxy(req: Request, method: "GET" | "PUT") {
  try {
    const r = await fetch(`${opsBase()}/public/agent-chats`, {
      method,
      headers: method === "PUT" ? { "Content-Type": "application/json" } : undefined,
      body: method === "PUT" ? await req.text() : undefined,
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    const data = await r.json().catch(() => ({ error: "运营端对话记录读取失败" }));
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

export async function GET(req: Request) {
  return proxy(req, "GET");
}

export async function PUT(req: Request) {
  const raw = await req.text();
  writeSeedFile(raw);
  const cloned = new Request(req.url, { method: "PUT", headers: req.headers, body: raw });
  return proxy(cloned, "PUT");
}
