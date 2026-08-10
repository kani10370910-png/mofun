import type { AssetCard } from "@/lib/types";

const SKIP_KEYS = new Set([
  "sub",
  "runId",
  "productImg",
  "logoImg",
  "refImg",
  "fusionImg1",
  "fusionImg2",
  "fusionImg3",
]);

const KEY_LABELS: Record<string, string> = {
  input: "提示词",
  rawDesc: "创意描述",
  prompt: "提示词",
  colors: "偏好颜色",
  ratio: "画面比例",
  ratioName: "画面比例",
  eventSub: "成图类型",
  style: "风格",
  brand: "品牌名称",
  text: "文字内容",
  effect: "字体效果",
  dir: "排列方向",
  product: "产品",
  advantage: "卖点",
  task: "任务类型",
  taskKey: "任务键",
  bgMode: "背景模式",
  scenePreset: "场景预设",
  bgColor: "背景颜色",
  size: "出图尺寸",
  customW: "自定义宽",
  customH: "自定义高",
  count: "生成数量",
  angles: "角度",
  customAnglePrompt: "自定义角度描述",
  refinePreset: "优化预设",
  productLabel: "商品图文件",
  fusionLabel1: "补充图1",
  fusionLabel2: "补充图2",
  fusionLabel3: "补充图3",
  channel: "渠道",
  storefrontType: "门头类型",
  platform: "平台",
  logoLabel: "Logo文件",
  refLabel: "参考图文件",
  tab: "生成模式",
  refName: "参考图名称",
  editInput: "改图说明",
  refStrength: "参考强度",
  regionEnhance: "本地增强",
  productName: "商品名称",
  shopName: "店铺名称",
  slogan: "口号",
  industry: "行业",
  title: "IP 名称",
  model: "模型",
  dur: "时长",
};

/** 各模块 edit 字段展示顺序 */
const SUB_FIELD_ORDER: Record<string, string[]> = {
  ip: ["title", "rawDesc", "input", "colors", "ratio"],
  event: ["input", "eventSub", "ratio", "style"],
  logo: ["brand", "style", "input"],
  font: ["text", "effect", "dir"],
  product: ["productName", "task", "size", "input", "scenePreset", "bgMode"],
  signage: ["shopName", "channel", "platform", "storefrontType", "slogan", "industry", "style", "size", "input"],
  oneline: ["input", "model", "ratio", "dur", "style"],
  avatar: ["input"],
  social: ["product", "brand", "advantage"],
  official: ["input"],
  brand: ["product", "brand", "advantage"],
};

function orderedKeys(sub: string, edit: Record<string, string>): string[] {
  const base = SUB_FIELD_ORDER[sub] ?? [];
  const rest = Object.keys(edit).filter((k) => !SKIP_KEYS.has(k) && !base.includes(k));
  return [...base, ...rest];
}

/** 从作品 edit / text 提取可展示的生成信息条目 */
export function workMetaFields(item: AssetCard): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const seenValues = new Set<string>();

  const push = (label: string, value?: string) => {
    const v = value?.trim();
    if (!v || seenValues.has(v)) return;
    seenValues.add(v);
    out.push({ label, value: v });
  };

  const edit = item.edit;
  if (edit && Object.keys(edit).length) {
    const sub = edit.sub || "";
    for (const key of orderedKeys(sub, edit)) {
      if (SKIP_KEYS.has(key)) continue;
      push(KEY_LABELS[key] || key, edit[key]);
    }
  }

  if (item.text?.trim() && !edit?.input) {
    push("正文内容", item.text);
  }

  return out;
}

/** 入库用：把 edit 摘要写入 text，供卡片预览与详情展示 */
export function buildWorkSummaryText(edit?: Record<string, string>): string | undefined {
  if (!edit || !Object.keys(edit).length) return undefined;
  const lines = workMetaFields({ edit } as AssetCard).map((f) => `${f.label}：${f.value}`);
  return lines.length ? lines.join("\n") : undefined;
}

/** 卡片副文案：优先 text，否则取首条生成信息 */
export function workCardSnippet(item: AssetCard, maxLen = 72): string {
  if (item.text?.trim()) {
    const one = item.text.replace(/\s+/g, " ").trim();
    return one.length > maxLen ? `${one.slice(0, maxLen)}…` : one;
  }
  const fields = workMetaFields(item);
  const primary =
    fields.find((f) => /提示|描述|创意|文字/.test(f.label)) ?? fields[0];
  if (!primary) return "";
  const line = `${primary.label}：${primary.value.replace(/\s+/g, " ").trim()}`;
  return line.length > maxLen ? `${line.slice(0, maxLen)}…` : line;
}

const EMPTY_SLOT = new Set(["暂无", "无特殊要求", "我来补充", "跳过大纲"]);

function slotVal(v?: string): string | undefined {
  const s = v?.trim();
  if (!s || EMPTY_SLOT.has(s)) return undefined;
  return s;
}

/** 首页小墨对话出图：从专家槽位组装 edit */
export function buildHomeChatEdit(
  specialistId: string | undefined,
  slots: Record<string, string>,
  promptText?: string,
): Record<string, string> {
  const sub = specialistId?.split(".")[1] || "chat";
  const edit: Record<string, string> = { sub };

  if (sub === "ip") {
    if (slotVal(slots.brandName)) edit.title = slots.brandName.trim();
    if (slotVal(slots.creativeDesc)) edit.rawDesc = slots.creativeDesc.trim();
    if (slotVal(slots.colors)) edit.colors = slots.colors.trim();
    if (slotVal(slots.ratio)) edit.ratio = slots.ratio.trim();
  } else if (sub === "event") {
    if (slotVal(slots.theme)) edit.input = slots.theme.trim();
    if (slotVal(slots.format)) edit.eventSub = slots.format.trim();
    if (slotVal(slots.ratio)) edit.ratio = slots.ratio.trim();
    if (slotVal(slots.style)) edit.style = slots.style.trim();
  } else if (sub === "logo") {
    if (slotVal(slots.brandName)) edit.brand = slots.brandName.trim();
    if (slotVal(slots.style)) edit.style = slots.style.trim();
    if (slotVal(slots.creativeDesc)) edit.input = slots.creativeDesc.trim();
  } else if (sub === "font") {
    if (slotVal(slots.text)) edit.text = slots.text.trim();
    if (slotVal(slots.style)) edit.effect = slots.style.trim();
    if (slotVal(slots.dir)) edit.dir = slots.dir.trim();
  } else if (sub === "product") {
    if (slotVal(slots.scene)) edit.input = slots.scene.trim();
    if (slotVal(slots.ratio)) edit.ratio = slots.ratio.trim();
  } else if (sub === "signage") {
    if (slotVal(slots.shopName)) edit.shopName = slots.shopName.trim();
    if (slotVal(slots.slogan)) edit.slogan = slots.slogan.trim();
    if (slotVal(slots.industry)) edit.industry = slots.industry.trim();
    if (slotVal(slots.style)) edit.style = slots.style.trim();
    if (slotVal(slots.channel)) edit.input = slots.channel.trim();
  }

  if (promptText?.trim() && !edit.input) edit.input = promptText.trim();
  return edit;
}
