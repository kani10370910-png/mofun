/**
 * Logo 风格出图提示词（产品表：风格 → 提示词 → 匹配 lora）
 * 占位：「用户输入的品牌名称」「用户输入的创意描述」
 */

export type LogoLoraHint = "字标" | "简约" | "新中式" | "扁平";

function joinPrompt(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join("，")
    .replace(/，+/g, "，")
    .replace(/^，|，$/g, "");
}

/** 各风格共用的画幅约束：避免主体过小、四周大片留白 */
export const LOGO_FRAME_HINT =
  "主体 Logo 尽量铺满画面，占画面约 75%-90%，四周仅保留少量留白，不要把标志缩成画面中心一小块";

/** 按风格拼出最终送模提示词 */
export function buildLogoStylePrompt(style: string, brand: string, desc: string): string {
  const name = brand.trim() || "品牌";
  const d = desc.trim();
  const s = (style || "智能匹配").trim();

  let body: string;
  switch (s) {
    case "智能匹配":
    case "智能模式":
      body = joinPrompt(["logo设计", `品牌名为"${name}"`, d, "高级感", "扁平化"]) + "。";
      break;

    case "图文插画":
      body =
        joinPrompt([
          "logo设计",
          "字标设计",
          `品牌名为"${name}"`,
          d,
          "与文字有关的插画图形",
          "文字与图形相互融合",
          "高级感",
          "扁平化",
        ]) + "。背景色为纯白色。";
      break;

    case "图文简约":
      body =
        joinPrompt([
          "简约logo设计",
          "品牌标志",
          `品牌名为"${name}"`,
          d,
          "高级感",
          "极简",
          "简约",
          "扁平化",
        ]) + "。背景色为纯白色。";
      break;

    case "文字logo":
      body =
        joinPrompt([
          "logo设计",
          "文字logo",
          "简约",
          `品牌名为"${name}"`,
          d,
          "字体笔画重构、文字艺术变形",
        ]) + "。背景色为纯白色。";
      break;

    case "字母logo":
      body =
        joinPrompt([
          "英文品牌logo设计",
          `品牌名为"${name}"`,
          d,
          "英文字母笔画重构、字母艺术变形",
        ]) + "。背景色为纯白色。";
      break;

    case "经典徽章":
      body =
        joinPrompt([
          "logo设计",
          "经典徽章风格",
          "复古古典",
          "主体是一个圆形徽章",
          `文字为"${name}"`,
          "文字环绕在圆形徽章下面或上面",
          "圆形徽章内有与文字有关的插画图形",
          d,
        ]) + "。背景色为纯白色。";
      break;

    case "新中式":
      body = joinPrompt([
        "新中式 LOGO",
        "logo设计",
        `品牌名为"${name}"`,
        d,
        "与文字有关的插画图形",
        "中式元素与现代元素的结合",
        "扁平化",
        "设计具有高级感和想象力",
        "抽象化表达",
        "大师作品",
      ]);
      break;

    case "扁平矢量":
      body =
        joinPrompt([
          "扁平LOGO风格",
          "logo设计",
          `品牌名为"${name}"`,
          d,
          "几何简化造型",
          "大色块清晰",
          "边缘干净",
          "高级感",
          "扁平化",
        ]) + "。背景色为纯白色。";
      break;

    default:
      body = joinPrompt(["logo设计", `品牌名为"${name}"`, d, `风格：${s}`, "高级感", "扁平化"]) + "。";
  }

  return `${body}${body.endsWith("。") ? "" : "。"}${LOGO_FRAME_HINT}。`;
}

/**
 * 表内「匹配 lora」：智能模式按关键词在简约/字标间择一；
 * 其余风格固定。当前 Seedream 通道未挂 logo 专用 lora 时，仅作映射预留。
 */
export function resolveLogoLoraHint(style: string, brand: string, desc: string): LogoLoraHint | null {
  const s = (style || "智能匹配").trim();
  const text = `${brand} ${desc}`;

  switch (s) {
    case "智能匹配":
    case "智能模式": {
      if (/字标|文字|字体|书法|笔画|字标设计|艺术字/.test(text)) return "字标";
      if (/简约|极简|扁平|几何|minimal|simple/.test(text)) return "简约";
      // 默认偏字标（表：按关键词匹配简约或字标）
      return /插画|徽章|国风|中式/.test(text) ? "字标" : "简约";
    }
    case "图文插画":
    case "文字logo":
    case "经典徽章":
      return "字标";
    case "图文简约":
    case "字母logo":
      return "简约";
    case "新中式":
      return "新中式";
    case "扁平矢量":
      return "扁平";
    default:
      return null;
  }
}
