#!/usr/bin/env node
/** 商拍参考灵感：调用文生图 API 生成案例图，写入 public/productcase/ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const apiKey = process.env.IMAGE_API_KEY || "";
const baseURL = (process.env.IMAGE_BASE_URL || "https://www.anyfast.ai/v1").replace(/\/$/, "");
const model = process.env.IMAGE_MODEL || "dall-e-3";
const outDir = path.join(root, "public", "productcase");

const cases = [
  {
    file: "tea-white.png",
    prompt: "铁罐装绿茶商品白底主图，主体居中，标签清晰，柔和棚拍光，四周留白均匀，电商过审风格，写实摄影",
  },
  {
    file: "tea-garden.png",
    prompt: "茶叶罐置于高山茶园木台前景，背景茶垄与薄雾，清晨自然光，商品主体清晰，真实产地氛围，不夸张不失真",
  },
  {
    file: "tea-homestay.png",
    prompt: "商品放置于原木民宿窗台，窗外山景虚化，暖色自然光，生活化但突出商品主体，写实商业摄影",
  },
  {
    file: "product-mix-seed.png",
    prompt: "电商商拍图片结合：绿发动漫风格少女双手捧着一双棕色工装靴展示，人物与鞋子自然融合，干净背景，商品为主体，写实与插画结合",
  },
];

async function generateImage(prompt) {
  const r = await fetch(`${baseURL}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt, n: 1, size: "2048x2048" }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`API ${r.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  const item = json.data?.[0];
  if (!item) throw new Error("无返回图片");
  if (item.url) return { kind: "url", value: item.url };
  if (item.b64_json) return { kind: "b64", value: item.b64_json };
  throw new Error("无 url / b64_json");
}

async function saveImage(result, dest) {
  if (result.kind === "b64") {
    fs.writeFileSync(dest, Buffer.from(result.value, "base64"));
    return;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const r = await fetch(result.value, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`下载失败 ${r.status}`);
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!apiKey) {
    console.error("缺少 IMAGE_API_KEY，请在 .env.local 配置");
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  for (const c of cases) {
    const dest = path.join(outDir, c.file);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 10_000) {
      console.log(`跳过（已存在）: ${c.file}`);
      continue;
    }
    console.log(`生成中: ${c.name || c.file} …`);
    const result = await generateImage(c.prompt);
    await saveImage(result, dest);
    console.log(`已保存: public/productcase/${c.file} (${fs.statSync(dest).size} bytes)`);
  }
  console.log("完成。请在 productGalleryItems 中使用 /productcase/*.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
