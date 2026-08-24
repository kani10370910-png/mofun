/**
 * 文案型输入：切到「纯文字排版」出图——只用文案本身作文字内容，
 * 不把整段输入强行塞进画面，也不扩写成风景/产品主视觉。
 */

const COPY_HINTS =
  /卖点|配料|成分|原料|酒精度|保质期|产地|规格|净含量|食用|详情页|淘宝|天猫|电商|slogan|口号|核心卖点|产品名称|产品名|品名|适配场景|饮用场景|工艺|陈酿|溯源|执行标准|生产许可证|贮藏|温馨提示|品牌故事|产品参数/i;

/** 是否更像「文案」，而非短画面描述 */
export function isCopyHeavyPrompt(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hintHits = (t.match(new RegExp(COPY_HINTS.source, "gi")) || []).length;
  if (t.length >= 180 && hintHits >= 2) return true;
  if (t.length >= 120 && hintHits >= 3) return true;
  if (lines.length >= 6 && (hintHits >= 2 || t.length >= 100)) return true;
  const kvLines = lines.filter((l) => /[:：]/.test(l) || /^[-•·\d]+[.、)）]/.test(l)).length;
  if (kvLines >= 4 && t.length >= 80) return true;
  return false;
}

/**
 * 从输入中抽出「文案正文」：去掉常见指令外壳，只保留要排版的文字。
 */
export function extractCopyBody(raw: string): string {
  let t = (raw || "").trim();
  if (!t) return "";

  // 去掉常见「请生成/设计一张…」指令头，保留其后文案
  t = t.replace(
    /^(请)?(帮我)?(生成|设计|制作|画)(一张|一幅)?[^。\n]{0,40}(详情页|长图|海报|主图)?[，,：:\s]*/i,
    "",
  );
  // 去掉「画面描述：」「提示词：」一类前缀
  t = t.replace(/^(画面描述|创意描述|提示词|文案|文案内容)\s*[:：]\s*/i, "");

  // 若有【文案】…【/文案】块，只取块内
  const block = t.match(/【\s*文案\s*】([\s\S]*?)(?:【\s*\/?\s*文案\s*】|$)/i);
  if (block?.[1]?.trim()) return block[1].trim();

  return t.trim() || raw.trim();
}

/**
 * 仅以文案做「文字排版」出图提示词（纯排版，非风景/产品图）。
 * 字号硬约束：单字边长 ≤ 24px（标题与正文均不得超过）。
 */
export function buildCopyLayoutImagePrompt(
  raw: string,
  opts?: { style?: string; ratioLabel?: string; widthPx?: number },
): string {
  const copy = extractCopyBody(raw);
  const style = (opts?.style || "").trim();
  const styleHint =
    style && style !== "智能匹配" ? `版式气质可参考「${style}」。` : "版式干净、易读、适合电商阅读。";
  const ratioHint = opts?.ratioLabel
    ? `画幅约 ${opts.ratioLabel}，竖向分区排版。`
    : "竖向分区排版。";

  const w = Math.max(64, Math.round(Number(opts?.widthPx) || 1080));
  /** 产品硬上限：单字不超过 24px */
  const maxGlyph = 24;
  // 按 24px 字 + 少量字距，满行大约能排多少字（左右各留约 1.5 字边距）
  const minCharsPerLine = Math.max(20, Math.floor((w * 0.88) / maxGlyph));

  return [
    "生成一张纯「文字排版」图：画面主体就是文案排版，不要画风景大图、不要画产品实拍主视觉、不要插画场景。",
    styleHint,
    ratioHint,
    `画布宽度按 ${w} 像素计。`,
    "文字内容只使用下方【文案】，不要添加【文案】之外的标题或说明；浅色底、层级清晰。",
    [
      "【字号硬性上限·必须严格遵守】",
      `1) 每个汉字（含标题、正文、标点所占视觉格）的宽与高均不得超过 ${maxGlyph} 像素，禁止任何字超过 ${maxGlyph}px。`,
      `2) 正文满行至少排约 ${minCharsPerLine} 个汉字（版心内从左到右），用小字密排；禁止一行只有十几个大字。`,
      `3) 标题可比正文略醒目，但单字仍严禁超过 ${maxGlyph}px；超限必须缩小字号并增加行数。`,
      `4) 宁可变小、多分行，也不允许单字大于 ${maxGlyph} 像素。`,
    ].join(""),
    "",
    "【文案】",
    copy,
  ].join("\n");
}
