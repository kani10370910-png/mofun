/**
 * 文案型输入：出「带图文的详情/长图设计」，文案作为版面中的文字模块，
 * 不是纯文字排版、不是只有字没有图。
 */

const COPY_HINTS =
  /卖点|配料|成分|原料|酒精度|保质期|产地|规格|净含量|食用|详情页|淘宝|天猫|电商|slogan|口号|核心卖点|产品名称|产品名|品名|适配场景|饮用场景|工艺|陈酿|溯源|执行标准|生产许可证|贮藏|温馨提示|品牌故事|产品参数/i;

/** 是否更像「含大量文案的物料 brief」，而非短画面描述 */
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

/** 从输入中抽出要出现在版面上的文案正文 */
export function extractCopyBody(raw: string): string {
  let t = (raw || "").trim();
  if (!t) return "";

  t = t.replace(
    /^(请)?(帮我)?(生成|设计|制作|画)(一张|一幅)?[^。\n]{0,40}(详情页|长图|海报|主图)?[，,：:\s]*/i,
    "",
  );
  t = t.replace(/^(画面描述|创意描述|提示词|文案|文案内容)\s*[:：]\s*/i, "");

  const block = t.match(/【\s*文案\s*】([\s\S]*?)(?:【\s*\/?\s*文案\s*】|$)/i);
  if (block?.[1]?.trim()) return block[1].trim();

  return t.trim() || raw.trim();
}

/**
 * 文案型 brief → 带配图/产品/场景的详情长图提示词（图文混排，非纯字）。
 */
export function buildCopyLayoutImagePrompt(
  raw: string,
  opts?: { style?: string; ratioLabel?: string; widthPx?: number },
): string {
  const copy = extractCopyBody(raw);
  const style = (opts?.style || "").trim();
  const styleHint =
    style && style !== "智能匹配"
      ? `整体视觉风格偏「${style}」，电商详情页质感。`
      : "整体为高级电商详情页/长图设计，有完整视觉层次。";
  const ratioHint = opts?.ratioLabel
    ? `画幅约 ${opts.ratioLabel}，竖向长图自上而下多段分区。`
    : "竖向长图自上而下多段分区。";

  const w = Math.max(64, Math.round(Number(opts?.widthPx) || 1080));
  const maxGlyph = 24;
  const minCharsPerLine = Math.max(20, Math.floor((w * 0.88) / maxGlyph));

  return [
    "设计一张竖向电商详情页/宣传长图，必须是「图文混排」：每段都要有配图或视觉主体，不能只有文字、不能白底纯字排。",
    styleHint,
    ratioHint,
    [
      "【版面结构·必须有图】",
      "顶部：产品主视觉/KV（产品瓶身或包装特写、场景氛围、品牌主色），配主标题与口号；",
      "中部：按卖点/工艺/场景/参数拆成 2–4 个模块，每模块左侧或上方有产品图/插画/图标/场景小图，右侧或下方排对应文案；",
      "底部：饮用场景或产地氛围图 + 参数/提示类小字信息区。",
      "背景可用渐变、纹理、竹叶/山水等装饰，但文字区须清晰可读。",
    ].join(""),
    [
      "【文字要求】",
      `下方【文案】中的信息须体现在对应模块里；单字不超过 ${maxGlyph}px，正文满行约 ${minCharsPerLine} 字，小字密排；`,
      "不要改写产品名与数字；不要只生成一张只有字的文档图。",
    ].join(""),
    "",
    "【文案】",
    copy,
  ].join("\n");
}
