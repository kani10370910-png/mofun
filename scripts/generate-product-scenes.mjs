#!/usr/bin/env node
/** 商拍场景预设空景底图：调用文生图 API 写入 public/productcase/scene-*.png（无 API 离线可用） */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const apiKey = process.env.IMAGE_API_KEY || "";
const baseURL = (process.env.IMAGE_BASE_URL || "https://www.anyfast.ai/v1").replace(/\/$/, "");
const model = process.env.IMAGE_MODEL || process.env.PRODUCT_IMAGE_MODEL || "Seedream-5.0-lite";
const outDir = path.join(root, "public", "productcase");

const scenes = [
  { file: "scene-tea-garden.png", name: "高山茶园", prompt: "层叠茶垄与薄雾的高山茶园，自然晨光" },
  { file: "scene-bamboo.png", name: "竹林青石", prompt: "翠绿竹林边的青石台面，斑驳光影" },
  { file: "scene-rice.png", name: "稻田秋收", prompt: "金黄稻田收获季，暖色自然光" },
  { file: "scene-orchard.png", name: "果园枝头", prompt: "果园枝头与木筐，户外柔光" },
  { file: "scene-spring.png", name: "山泉溪边", prompt: "清澈山泉溪石，清凉自然氛围" },
  { file: "scene-table.png", name: "农家餐桌", prompt: "农家粗陶餐桌，碗碟与餐布，烟火气" },
  { file: "scene-homestay.png", name: "民宿窗台", prompt: "原木民宿窗台，窗外山景虚化" },
  { file: "scene-kitchen.png", name: "厨房料理", prompt: "明亮厨房台面，料理使用氛围" },
  { file: "scene-wood.png", name: "原木静物", prompt: "原木桌面与竹编、粗陶点缀" },
  { file: "scene-gift.png", name: "节日礼赠", prompt: "节日礼赠氛围，丝带点缀克制" },
];

function buildPrompt(name, scenePrompt) {
  return (
    `空景商拍场景底图，画面中不要出现商品、人物、文字水印。` +
    `场景主题「${name}」：${scenePrompt}。` +
    `写实商业摄影，柔和自然光，构图留出前景台面或放置位，适合后续放置商品，高质量`
  );
}

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

  for (const c of scenes) {
    const dest = path.join(outDir, c.file);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 10_000) {
      console.log(`跳过（已存在）: ${c.file}`);
      continue;
    }
    console.log(`生成中: ${c.name} → ${c.file} …`);
    const result = await generateImage(buildPrompt(c.name, c.prompt));
    await saveImage(result, dest);
    console.log(`已保存: public/productcase/${c.file} (${fs.statSync(dest).size} bytes)`);
  }
  console.log("完成。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
