#!/usr/bin/env node
/**
 * qwen3.7-plus 稳定性试跑：连续 N 条短文本 chat/completions。
 * 用法：node scripts/bench-qwen37-plus.mjs [count=100] [concurrency=2]
 * 读 .env.local：LLM_* 优先，回退 IMAGE_*（院平台 / AnyFast 兼容网关）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    // 文件内后写覆盖先写（避免重复 LLM_API_KEY 时仍用旧 Key）
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const COUNT = Math.max(1, Number(process.argv[2] || 100));
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.argv[3] || 2)));
const MODEL = process.env.BENCH_MODEL || "qwen3.7-plus";
const PROFILE = (process.env.BENCH_PROFILE || "").toLowerCase(); // aiit | anyfast | llm | image
// 院平台优先（产品表供应商）；可用 BENCH_BASE_URL 覆盖。
let apiKey = process.env.BENCH_API_KEY || "";
let baseURL = (process.env.BENCH_BASE_URL || "").replace(/\/$/, "");
let keySource = process.env.BENCH_API_KEY ? "BENCH_API_KEY" : "";
if (!apiKey || !baseURL) {
  if (PROFILE === "anyfast" || PROFILE === "image") {
    apiKey = apiKey || process.env.IMAGE_API_KEY || process.env.LLM_API_KEY || "";
    baseURL = baseURL || (process.env.IMAGE_BASE_URL || "https://www.anyfast.com.cn/v1").replace(/\/$/, "");
    keySource = keySource || (process.env.IMAGE_API_KEY ? "IMAGE_API_KEY" : "LLM_API_KEY");
  } else if (PROFILE === "llm") {
    apiKey = apiKey || process.env.LLM_API_KEY || process.env.IMAGE_API_KEY || "";
    baseURL = baseURL || (process.env.LLM_BASE_URL || "https://api.deepseek.com/v1").replace(/\/$/, "");
    keySource = keySource || (process.env.LLM_API_KEY ? "LLM_API_KEY" : "IMAGE_API_KEY");
  } else {
    // 默认：院平台 + LLM_API_KEY（可用 BENCH_PROFILE=anyfast 试 AnyFast）
    apiKey = apiKey || process.env.LLM_API_KEY || process.env.IMAGE_API_KEY || "";
    baseURL = baseURL || (process.env.LLM_BASE_URL || "https://token.aiit.org.cn/v1").replace(/\/$/, "");
    keySource = keySource || (process.env.LLM_API_KEY ? "LLM_API_KEY" : "IMAGE_API_KEY");
  }
}
const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 60000);

if (!apiKey) {
  console.error("缺少 LLM_API_KEY / IMAGE_API_KEY，请在 .env.local 配置后重试。");
  process.exit(1);
}

const PROMPTS = [
  "用一句话扩写：安吉白茶采摘节主视觉，茶园云雾，国风清新。",
  "活动联想：德清莫干山民宿周末促销，输出3个海报标题。",
  "优化IP描述：一只拟人化竹笋，穿斗笠，友善微笑，区县文旅吉祥物。",
  "把下面改成分镜一句：清晨茶农背篓进山，镜头缓推。",
  "写一句店招 slogan：安吉白茶旗舰店，明前芽茶产地直发。",
];

function promptFor(i) {
  return `${PROMPTS[i % PROMPTS.length]}（样本#${i + 1}）`;
}

async function oneCall(i) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "你是简洁的中文文案助手，回复控制在80字以内。" },
          { role: "user", content: promptFor(i) },
        ],
        stream: false,
        temperature: 0.7,
        max_tokens: 160,
      }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }
    const content =
      json?.choices?.[0]?.message?.content ||
      json?.choices?.[0]?.text ||
      "";
    const ms = Date.now() - t0;
    if (!res.ok) {
      const snip = text.replace(/\s+/g, " ").slice(0, 160);
      return { ok: false, i, ms, status: res.status, error: snip || `HTTP ${res.status}` };
    }
    if (!String(content).trim()) {
      return { ok: false, i, ms, status: res.status, error: "empty_content" };
    }
    return { ok: true, i, ms, status: res.status, chars: String(content).trim().length };
  } catch (e) {
    const ms = Date.now() - t0;
    const name = e?.name === "AbortError" ? "timeout" : e?.message || String(e);
    return { ok: false, i, ms, status: 0, error: name };
  } finally {
    clearTimeout(timer);
  }
}

function pct(n, d) {
  return d ? ((100 * n) / d).toFixed(1) : "0.0";
}

function summarize(results) {
  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  const lats = ok.map((r) => r.ms).sort((a, b) => a - b);
  const p = (q) => (lats.length ? lats[Math.min(lats.length - 1, Math.floor(q * (lats.length - 1)))] : 0);
  const errMap = new Map();
  for (const f of fail) {
    const key = `${f.status}:${String(f.error).slice(0, 80)}`;
    errMap.set(key, (errMap.get(key) || 0) + 1);
  }
  return {
    total: results.length,
    ok: ok.length,
    fail: fail.length,
    successRate: `${pct(ok.length, results.length)}%`,
    latencyMs: {
      min: lats[0] || 0,
      p50: p(0.5),
      p95: p(0.95),
      max: lats[lats.length - 1] || 0,
      avg: lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0,
    },
    errors: [...errMap.entries()].map(([k, c]) => ({ count: c, detail: k })),
  };
}

console.log(
  JSON.stringify(
    {
      model: MODEL,
      baseURL,
      count: COUNT,
      concurrency: CONCURRENCY,
      keySource,
      key: apiKey ? "set" : "missing",
    },
    null,
    2,
  ),
);

const results = new Array(COUNT);
let next = 0;
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (true) {
    const i = next++;
    if (i >= COUNT) return;
    const r = await oneCall(i);
    results[i] = r;
    const mark = r.ok ? "OK" : "FAIL";
    console.log(`[${i + 1}/${COUNT}] ${mark} ${r.ms}ms${r.ok ? ` chars=${r.chars}` : ` ${r.status} ${r.error}`}`);
  }
});

const tStart = Date.now();
await Promise.all(workers);
const elapsed = Date.now() - tStart;
const summary = { ...summarize(results), elapsedMs: elapsed, rps: Number((COUNT / (elapsed / 1000)).toFixed(2)) };

const outDir = path.join(root, "tools");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `bench-qwen37-plus-${Date.now()}.json`);
fs.writeFileSync(outFile, JSON.stringify({ summary, results }, null, 2), "utf8");

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));
console.log(`saved: ${outFile}`);

process.exit(summary.fail > 0 && summary.ok === 0 ? 2 : 0);
