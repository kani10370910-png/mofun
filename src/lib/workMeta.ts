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
    const v = humanizeWorkText(value || "").trim();
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

  // text 常为 buildWorkSummaryText 回写的「标签：值」摘要；edit 已有字段时不再重复挂「正文内容」
  if (item.text?.trim() && !edit?.input) {
    const editPayloadKeys = edit
      ? Object.keys(edit).filter((k) => k !== "sub" && !SKIP_KEYS.has(k))
      : [];
    const summaryLike = /^(文字内容|提示词|创意描述|字体效果|排列方向|正文内容)[:：]/m.test(item.text);
    if (editPayloadKeys.length === 0 || !summaryLike) {
      push("正文内容", item.text);
    }
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
    const one = humanizeWorkText(item.text).replace(/\s+/g, " ").trim();
    return one.length > maxLen ? `${one.slice(0, maxLen)}…` : one;
  }
  const fields = workMetaFields(item);
  const primary =
    fields.find((f) => /提示|描述|创意|文字|脚本/.test(f.label)) ?? fields[0];
  if (!primary) return "";
  const line = `${primary.label}：${primary.value.replace(/\s+/g, " ").trim()}`;
  return line.length > maxLen ? `${line.slice(0, maxLen)}…` : line;
}

/**
 * 把入库 text / 提示词里的 JSON、转义串整理成可读正文。
 * 例：`镜头脚本: { "content": "世界观…" }` → 纯中文设定文案。
 */
export function humanizeWorkText(raw: string): string {
  let s = raw.trim();
  if (!s) return "";

  // 「镜头脚本：{...}」这类前缀
  const labeled = s.match(/^(镜头脚本|提示词|创意描述|正文内容|画面描述)[:：]\s*([\s\S]+)$/);
  if (labeled) s = labeled[2].trim();

  // 整段是 JSON
  if (s.startsWith("{") || s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s) as unknown;
      const extracted = extractJsonReadable(parsed);
      if (extracted) return extracted;
    } catch {
      /* 非严格 JSON，继续下方清洗 */
    }
  }

  // 混在文案里的 {"content":"..."} 片段
  const embedded = s.match(/\{\s*"content"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (embedded?.[1]) {
    try {
      return JSON.parse(`"${embedded[1]}"`) as string;
    } catch {
      return embedded[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
  }

  return s;
}

function extractJsonReadable(parsed: unknown): string | undefined {
  if (typeof parsed === "string") return parsed.trim() || undefined;
  if (!parsed || typeof parsed !== "object") return undefined;
  if (Array.isArray(parsed)) {
    const parts = parsed.map(extractJsonReadable).filter(Boolean) as string[];
    return parts.length ? parts.join("\n") : undefined;
  }
  const o = parsed as Record<string, unknown>;
  for (const key of ["content", "script", "text", "prompt", "input", "desc", "description"]) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  // 常见嵌套：{ data: { content } }
  for (const key of ["data", "result", "payload"]) {
    const nested = extractJsonReadable(o[key]);
    if (nested) return nested;
  }
  return undefined;
}

/** 仓库卡片悬停气泡：主文案 + 少量关键字段，避免刷屏 */
export function workHoverTipText(item: AssetCard): string {
  const fields = workMetaFields(item)
    .map((f) => ({
      label: f.label,
      value: humanizeWorkText(f.value),
    }))
    .filter((f) => f.value);

  const uniq: { label: string; value: string }[] = [];
  const seenBody = new Set<string>();
  for (const f of fields) {
    const bodyKey = f.value.replace(/\s+/g, " ").trim();
    if (seenBody.has(bodyKey)) continue;
    const stripped = bodyKey.replace(
      /^(文字内容|提示词|创意描述|字体效果|排列方向|生成数量|正文内容|风格名称)[:：]\s*/,
      "",
    );
    if (stripped !== bodyKey && seenBody.has(stripped)) continue;
    seenBody.add(bodyKey);
    if (stripped !== bodyKey) seenBody.add(stripped);
    uniq.push({ label: f.label, value: f.value });
  }

  if (uniq.length) {
    const primary =
      uniq.find((f) => /提示|描述|创意|文字内容|脚本|正文/.test(f.label)) ?? uniq[0];
    // 气泡里只带 2～3 条辅字段，避免又长又重复
    const rest = uniq
      .filter((f) => f !== primary)
      .filter((f) => !/生成数量|count/i.test(f.label))
      .slice(0, 3);
    const primaryLine =
      /提示|描述|创意|脚本|正文/.test(primary.label)
        ? `${primary.label}：${primary.value}`
        : primary.value.includes("：") || primary.value.includes(":")
          ? primary.value
          : `${primary.label}：${primary.value}`;
    return [primaryLine, ...rest.map((f) => `${f.label}：${f.value}`)].join("\n");
  }

  const fromText = humanizeWorkText(item.text || "");
  if (fromText) {
    if (/^[^：:\n]+[:：]/m.test(fromText) && fromText.includes("\n")) return fromText;
    return fromText;
  }

  return item.name?.trim() || "";
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
