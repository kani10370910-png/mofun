import { stripOfficialMarkdown } from "./skills/prompts/officialArticle";

/** 去掉提案正文里的字数标注（如「约200字」），避免回填进用户描述 */
export function stripProposeWordCount(text: string): string {
  return (text || "")
    .replace(/[（(【\[［]?\s*约?\s*\d{2,4}(?:\s*[-–—~～至到]\s*\d{2,4})?\s*字\s*[）)】\]］]?/g, "")
    .replace(/[，,。．；;、\s]+$/g, "")
    .trim();
}

/** 解析「方案一/二/三」类 LLM 输出（顺带去掉 Markdown 标记） */
export function parseProposals(text: string): { id: string; title: string; text: string }[] {
  const t = stripOfficialMarkdown(text.trim());
  if (!t) return [];
  const parts = t
    .split(/\n*\s*方案[一二三四五六七八九十\d]+[：:、.\s]*/)
    .map((s) => stripProposeWordCount(stripOfficialMarkdown(s.trim())))
    .filter(Boolean);
  const titles = ["方案一", "方案二", "方案三", "方案四", "方案五"];
  if (parts.length >= 2) {
    return parts.slice(0, 5).map((full, i) => ({
      id: `p${i + 1}`,
      title: titles[i] ?? `方案${i + 1}`,
      text: full,
    }));
  }
  const segs = t
    .split(/\n{2,}/)
    .map((s) => stripProposeWordCount(stripOfficialMarkdown(s.trim())))
    .filter(Boolean);
  if (segs.length >= 2) {
    return segs.slice(0, 5).map((full, i) => ({
      id: `p${i + 1}`,
      title: titles[i] ?? `方案${i + 1}`,
      text: full,
    }));
  }
  return [{ id: "p1", title: "方案一", text: stripProposeWordCount(t) }];
}

/** 把社媒 JSON 转成可读正文 */
export function formatSocialOutput(raw: string): string {
  try {
    const j = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
    const lines: string[] = [];
    if (Array.isArray(j.titles) && j.titles.length) {
      lines.push("【标题备选】");
      j.titles.forEach((t: string, i: number) => lines.push(`${i + 1}. ${t}`));
      lines.push("");
    }
    if (Array.isArray(j.highlights) && j.highlights.length) {
      lines.push("【卖点】");
      j.highlights.forEach((h: { tag?: string; text?: string }) => {
        lines.push(`· ${h.tag || "卖点"}：${h.text || ""}`);
      });
      lines.push("");
    }
    const posts = j.posts || {};
    if (posts.wechat?.body) {
      lines.push("【朋友圈】");
      lines.push(posts.wechat.body);
      lines.push("");
    }
    if (posts.xhs) {
      lines.push("【小红书】");
      if (posts.xhs.title) lines.push(posts.xhs.title);
      if (posts.xhs.body) lines.push(posts.xhs.body);
      if (Array.isArray(posts.xhs.tags)) lines.push(posts.xhs.tags.join(" "));
    }
    return lines.join("\n").trim() || raw;
  } catch {
    return raw;
  }
}
