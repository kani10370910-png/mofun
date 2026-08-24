import fs from "fs";

const rows = JSON.parse(fs.readFileSync("docs/studio-prompts-inventory.json", "utf8"));
const kindOrder = ["系统提示词", "用户提示词", "拼接到用户输入的模板", "输出约束"];
const byKind = Object.fromEntries(kindOrder.map((k) => [k, []]));
for (const r of rows) {
  const k = kindOrder.includes(r.kind) ? r.kind : "拼接到用户输入的模板";
  byKind[k].push(r);
}
const sections = [
  ["一、系统提示词", "系统提示词"],
  ["二、用户提示词", "用户提示词"],
  ["三、拼接到用户输入的模板 / 后缀", "拼接到用户输入的模板"],
  ["四、输出约束", "输出约束"],
];

let md = "";
md += "# 制作大片 · 提示词列表\n\n";
md += "> 模块：视频素材 → 制作大片（脚本 / 角色场景道具 / 分镜 / 出片）\n";
md += `> 共 **${rows.length}** 条，按「系统提示词 / 用户提示词 / 拼接模板 / 输出约束」分类。\n\n`;
md += "## 调用关系简述\n\n";
md += "1. **脚本** → `/api/generate` · `studio-script-pro`（模板一句话）；备选/遗留：`studio-idea` → `studio-summary` → `studio-shots`；Agent 多用 `studio-script`\n";
md += "2. **资产** → `studio-assets` → `studio-asset-desc` / `studio-char-info` → `/api/image`（资产生图后缀 + 风格词 + KB）\n";
md += "3. **分镜** → `studio-shot-elements-fill`；逐镜扩写 `/api/video-prompt`（`SYSTEM_VIDEO_PROMPT_OPTIMIZE` + `targetChars` + `prevContext`）\n";
md += "4. **出片** → `runShot` 本地拼指令 → `/api/video`（**不走** `/api/video-generate`）\n";
md += "5. **配音/审核** → `studio-speakers` / `studio-voice-match` / `studio-safe-rewrite`；`studio-style-match` 锁定风格\n\n";
md += "### 与「一句话成片」的关系\n\n";
md += "- **共用**：`SYSTEM_VIDEO_PROMPT_OPTIMIZE`、六种 `videoStyles.stylePrompt`、知识库注入逻辑等\n";
md += "- **一句话专用、制作大片未走**：`SYSTEM_VIDEO_GENERATE`、场景模板 `videoSceneTpls` 等\n";
md += "- **`StudioHome`**：无独立 LLM 硬编码提示词\n\n";
md += "## 目录\n\n";
for (const [title, kind] of sections) {
  const list = byKind[kind] || [];
  md += `### ${title}（${list.length}）\n\n`;
  for (const r of list) md += `- [${r.id}. ${r.scene}](#${r.id})\n`;
  md += "\n";
}
md += "---\n\n";
for (const [title, kind] of sections) {
  md += `## ${title}\n\n`;
  for (const r of byKind[kind] || []) {
    md += `<a id="${r.id}"></a>\n\n`;
    md += `### ${r.id}. ${r.scene}\n\n`;
    md += "| 字段 | 内容 |\n|---|---|\n";
    md += `| 提示词位置 | \`${String(r.location || "").replace(/\|/g, "\\|")}\` |\n`;
    md += `| 提示词分类 | ${r.kind} |\n`;
    if (r.call_relation) {
      md += `| 调用时机 | ${String(r.call_relation).replace(/\|/g, "\\|")} |\n`;
    }
    if (r.reused_by) {
      md += `| 复用说明 | ${String(r.reused_by).replace(/\|/g, "\\|")} |\n`;
    }
    md += "\n**具体提示词：**\n\n```\n";
    md += `${String(r.prompt ?? "").replace(/\r\n/g, "\n").trim()}\n`;
    md += "```\n\n";
  }
}

const out = "docs/制作大片提示词列表.md";
fs.writeFileSync(out, md, "utf8");
console.log(`wrote ${out} (${rows.length} items, ${Buffer.byteLength(md, "utf8")} bytes)`);
for (const [title, kind] of sections) {
  console.log(title, (byKind[kind] || []).length);
}
