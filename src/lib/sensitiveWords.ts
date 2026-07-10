/* 文本内容审核（本地前置）：敏感词库 + 匹配。用于在输入框里把有问题的文字标红提示，
   服务端/模型侧仍有完整审核。词库可按业务扩充。 */

export const SENSITIVE_WORDS = [
  // 色情低俗
  "色情", "裸露", "裸体", "色图", "porn", "nude", "sex",
  // 暴恐血腥
  "暴力", "血腥", "恐怖袭击", "杀人", "自杀", "枪支", "爆炸物",
  // 违禁
  "毒品", "吸毒", "赌博", "诈骗", "洗钱",
  // 侮辱谩骂（示例）
  "fuck", "shit", "傻逼", "去死",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 预编译匹配所有敏感词（大小写无关）
const PATTERN = new RegExp(`(${SENSITIVE_WORDS.map(escapeRegExp).join("|")})`, "gi");

export interface TextSegment {
  text: string;
  bad: boolean; // true = 命中敏感词，需标红
}

/** 把文本切成「正常 / 敏感」片段，供标红渲染。空串返回单个正常段。 */
export function segmentSensitive(text: string): TextSegment[] {
  if (!text) return [{ text: "", bad: false }];
  const segs: TextSegment[] = [];
  let last = 0;
  PATTERN.lastIndex = 0;
  for (const m of text.matchAll(PATTERN)) {
    const idx = m.index ?? 0;
    if (idx > last) segs.push({ text: text.slice(last, idx), bad: false });
    segs.push({ text: m[0], bad: true });
    last = idx + m[0].length;
  }
  if (last < text.length) segs.push({ text: text.slice(last), bad: false });
  return segs.length ? segs : [{ text, bad: false }];
}

/** 返回文本中命中的敏感词（去重），无则空数组。 */
export function findSensitiveWords(text: string): string[] {
  if (!text) return [];
  PATTERN.lastIndex = 0;
  const hits = new Set<string>();
  for (const m of text.matchAll(PATTERN)) hits.add(m[0]);
  return [...hits];
}

export function hasSensitive(text: string): boolean {
  if (!text) return false;
  PATTERN.lastIndex = 0;
  return PATTERN.test(text);
}
