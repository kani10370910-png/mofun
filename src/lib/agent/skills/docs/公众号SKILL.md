---
name: mofun-wechat-official
disable: false
---

# 公众号帮写 Skill（魔方智绘）

把桌面「zhd-wechat-format」能力收敛进产品：**一次生成适合粘贴微信公众号的纯文本长文**（结构清晰，无 Markdown），不依赖本地 Python 画廊/草稿箱脚本。

## 何时使用

用户提到：公众号、长文、微信排版、公众号文章、写一篇推文（长文语境）。

工作台：文案策划 → 公众号帮写（`content.official` / `skill.content.official`）。

## 产品内能力（已落地）

1. **成文**：标题 + 关键词 + 可选大纲 + 风格/字数 → 完整正文
2. **纯文本结构**：小标题用「一、二、」、段落空行、列表用「1）」或「·」，禁止 `**` / `#` / `>` 等 Markdown
3. **风格 → 排版气质**：政企/娱乐/短剧/情感/干货 映射原 Skill 主题族指导节奏
4. **提纲模式**：`mode=outline` 时只出提纲（同样纯文本）
5. **兜底清洗**：`stripOfficialMarkdown` 去掉模型偶发残留标记

实现：`src/lib/agent/skills/prompts/officialArticle.ts` → `llm` scene `official`。

## 相对原 Skill 的取舍

| 原 Skill | 本项目 |
|----------|--------|
| `format.py` 主题画廊 / 内联 HTML | 生成纯文本正文，用户粘贴公众号后台 |
| `publish.py` 推草稿箱 | 未接入（需 AppID/Secret，后续可选） |
| Obsidian Vault / config.json | 不使用 |
| 封面图脚本 | 保留提示词模板 `buildOfficialCoverPrompt`，可接图片生成 |

## 输出纪律

- 直接正文，无寒暄与元评论
- **禁止 Markdown**（含加粗星号）
- 不编造政策文号、数据与链接
- 有大纲则严格展开；无大纲则自拟合理结构
