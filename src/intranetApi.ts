/**
 * 内网用户端 API 进程：把现有 Next route handler 挂到 Node HTTP，
 * 供 Nginx 把 /api/ 反代过来。页面仍由静态站提供。
 */
import { existsSync, readdirSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOSTNAME || "0.0.0.0";
const API_ROOT = join(process.cwd(), "src", "app", "api");
const PUBLIC_ORIGIN = (process.env.PUBLIC_BASE_URL || "http://10.0.120.2").replace(/\/$/, "");

type RouteMod = {
  GET?: (req: Request, ctx?: unknown) => Promise<Response> | Response;
  POST?: (req: Request, ctx?: unknown) => Promise<Response> | Response;
  PUT?: (req: Request, ctx?: unknown) => Promise<Response> | Response;
  DELETE?: (req: Request, ctx?: unknown) => Promise<Response> | Response;
};

const cache = new Map<string, Promise<RouteMod>>();

function resolveRoute(pathname: string): { file: string; params: Record<string, string> } | null {
  const rel = pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
  const parts = rel.split("/").filter(Boolean);
  const params: Record<string, string> = {};
  let dir = API_ROOT;
  for (const part of parts) {
    const direct = join(dir, part);
    if (existsSync(direct)) {
      dir = direct;
      continue;
    }
    let dyn = "";
    try {
      dyn = readdirSync(dir).find((n) => n.startsWith("[") && n.endsWith("]")) || "";
    } catch {
      return null;
    }
    if (!dyn) return null;
    params[dyn.slice(1, -1)] = decodeURIComponent(part);
    dir = join(dir, dyn);
  }
  const file = join(dir, "route.ts");
  return existsSync(file) ? { file, params } : null;
}

function loadRoute(file: string): Promise<RouteMod> {
  const hit = cache.get(file);
  if (hit) return hit;
  const pending = import(pathToFileURL(file).href) as Promise<RouteMod>;
  cache.set(file, pending);
  return pending;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function makeRequest(req: IncomingMessage, body: Buffer): Request {
  const url = new URL(req.url || "/", `${PUBLIC_ORIGIN}/`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const init: RequestInit = { method: req.method || "GET", headers };
  if (body.length && req.method !== "GET" && req.method !== "HEAD") {
    init.body = new Uint8Array(body);
  }
  const request = new Request(url, init);
  Object.defineProperty(request, "nextUrl", { value: url });
  return request;
}

async function pipeResponse(web: Response, res: ServerResponse) {
  res.statusCode = web.status;
  web.headers.forEach((value, key) => {
    if (key.toLowerCase() === "transfer-encoding") return;
    res.setHeader(key, value);
  });
  if (!web.body) {
    res.end();
    return;
  }
  const reader = web.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    res.end();
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = Buffer.from(JSON.stringify(body));
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", String(payload.length));
  res.end(payload);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `${PUBLIC_ORIGIN}/`);
    if (url.pathname === "/health" || url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, service: "mofun-app" });
      return;
    }
    if (!url.pathname.startsWith("/api/")) {
      sendJson(res, 404, { error: "not found" });
      return;
    }

    const resolved = resolveRoute(url.pathname);
    if (!resolved) {
      sendJson(res, 404, { error: "接口不存在" });
      return;
    }

    const mod = await loadRoute(resolved.file);
    const method = (req.method || "GET").toUpperCase() as keyof RouteMod;
    const handler = mod[method];
    if (!handler) {
      sendJson(res, 405, { error: "方法不允许" });
      return;
    }

    const body = await readBody(req);
    const request = makeRequest(req, body);
    const web = await handler(request, { params: Promise.resolve(resolved.params) });
    await pipeResponse(web, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务异常";
    if (!res.headersSent) {
      sendJson(res, 500, { error: message });
    } else {
      res.end();
    }
  }
});

server.requestTimeout = 0;
server.headersTimeout = 0;
server.timeout = 0;
server.keepAliveTimeout = 65_000;

server.listen(PORT, HOST, () => {
  console.log(`[mofun-app] API listening on ${HOST}:${PORT}`);
});
