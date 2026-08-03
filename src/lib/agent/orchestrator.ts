import { getSpecialist, recallSpecialists, SPECIALISTS } from "./specialists";
import { buildDirectionPlan, needsDirectionGate } from "./directionPlan";
import { injectMemorySlots, persistSlotsToMemory } from "./memory";
import { assembleContext } from "./context";
import { getSkill } from "./skills";
import type {
  AgentAction,
  AgentProposal,
  AgentRuntimeState,
  AskGroupItem,
  AssistantTurn,
  ReplySlot,
  SpecialistDef,
  SpecialistId,
} from "./types";

const YOU_DECIDE = /^(你定|随便|都可以|默认|都行|看你|你来)$/;
const FAST_GEN = /直接出|快速出|别问了|马上生成|立刻出图/;

export function emptyAgentState(): AgentRuntimeState {
  return {
    slots: {},
    unansweredStreak: 0,
    phase: "route",
  };
}

function activeSlots(spec: SpecialistDef, slots: Record<string, string>): ReplySlot[] {
  return spec.slots.filter((s) => {
    if (!s.when) return true;
    return slots[s.when.slot] === s.when.equals;
  });
}

function missingSlots(spec: SpecialistDef, slots: Record<string, string>, maxPriority: 1 | 2 = 1): ReplySlot[] {
  return activeSlots(spec, slots).filter((s) => s.priority <= maxPriority && !slots[s.key]);
}

function nextAskPair(spec: SpecialistDef, slots: Record<string, string>): ReplySlot[] {
  const miss = missingSlots(spec, slots, 2);
  if (!miss.length) return [];
  const g = miss[0].group;
  const same = miss.filter((s) => s.group === g).slice(0, 2);
  if (same.length >= 2) return same;
  // 同组只剩 1 项时，从后续未填项补一条，保证卡片尽量双问
  const rest = miss.filter((s) => !same.some((x) => x.key === s.key));
  if (rest.length) return [...same, rest[0]];
  return same;
}

function isReady(spec: SpecialistDef, slots: Record<string, string>): boolean {
  return missingSlots(spec, slots, 1).length === 0;
}

/** 当前管线是否必须用户上传参考图/商品图 */
function requiresUserRefImage(state: AgentRuntimeState): boolean {
  const sid = state.specialistId;
  if (!sid) return false;
  if (sid === "image.event" && state.slots.pipeline === "图生图") return true;
  if (sid === "video.oneline" && state.slots.pipeline === "图生视频") return true;
  if (sid === "image.product") return true;
  if (sid === "image.ip" && state.slots.mode === "扩展设计") return true;
  return false;
}

function hasUserRefImage(state: AgentRuntimeState): boolean {
  return Boolean(state.refImages && state.refImages.length > 0);
}

const UPLOAD_CONFIRM_RE = /我已上传/;

function isUploadConfirmValue(v: string): boolean {
  return UPLOAD_CONFIRM_RE.test(v);
}

function isUploadSlotKey(key: string): boolean {
  return key === "refUpload" || key === "ipImage" || key === "productImage";
}

function refUploadSlots(spec: SpecialistDef, slots: Record<string, string>): ReplySlot[] {
  return activeSlots(spec, slots).filter((s) => isUploadSlotKey(s.key) && !slots[s.key]);
}

function forceRefUploadTurn(
  spec: SpecialistDef,
  state: AgentRuntimeState,
  think: boolean,
  lead?: string
): AssistantTurn {
  for (const k of ["refUpload", "ipImage", "productImage"]) {
    if (state.slots[k] && isUploadConfirmValue(state.slots[k]) && !hasUserRefImage(state)) {
      delete state.slots[k];
    }
  }
  const pair = refUploadSlots(spec, state.slots);
  const askPair =
    pair.length > 0
      ? pair.slice(0, 2)
      : [
          {
            key: "refUpload",
            label: "参考图",
            priority: 1 as const,
            ask: "请先点下方输入框旁的附件上传图片，上传完成后再点选：",
            options: ["我已上传参考图"],
            extractHints: [] as string[],
            mapsToForm: "reference",
            group: 0,
          },
        ];
  return askGroupTurn(
    spec,
    state,
    askPair,
    think,
    lead ||
      "这一步需要你先上传图片：请点输入框旁的附件 📎，上传后再点「我已上传参考图」继续（未上传无法生成）。"
  );
}

function buildAck(slots: Record<string, string>, keys: string[]): string {
  const vals = keys.map((k) => slots[k]).filter(Boolean);
  if (vals.length >= 2) return `${vals[0]} × ${vals[1]}，这个组合很清晰。`;
  if (vals.length === 1) return `收到「${vals[0]}」。`;
  return "";
}

function askGroupTurn(
  spec: SpecialistDef,
  state: AgentRuntimeState,
  pair: ReplySlot[],
  think: boolean,
  lead: string
): AssistantTurn {
  // 已识别的槽不再展示为问题
  const toAsk = pair.filter((slot) => !state.slots[slot.key]);
  if (!toAsk.length) {
    return {
      text: lead || "信息已齐。",
      tipLabel: spec.label,
      state: { ...state, phase: "clarify", pendingAskKeys: undefined },
    };
  }

  const askGroups: AskGroupItem[] = toAsk.map((slot) => ({
    key: slot.key,
    label: slot.label,
    ask: slot.ask,
    options: (slot.options ?? []).map((o, i) => ({
      id: `opt-${slot.key}-${i}`,
      label: o,
      kind: "option" as const,
      slotKey: slot.key,
      value: o,
    })),
  }));

    // 「你定」+ IP 创意描述可「帮我提案」（对齐功能页）
    const extras: AgentAction[] = [];
    if (toAsk.some((s) => s.defaultValue)) {
      extras.push({ id: "act-defaults", label: "你定 / 用推荐继续", kind: "defaults" });
    }
    if (spec.id === "image.ip" && toAsk.some((s) => s.key === "creativeDesc")) {
      extras.push({ id: "act-ip-propose", label: "✨ 帮我提案", kind: "propose" });
    }

  const tip =
    toAsk.length >= 2
      ? `${lead}\n（请两项都选好后再发送；也可一次说完）`
      : lead;

  return {
    text: tip,
    tipLabel: spec.label,
    thinking: think
      ? `本轮追问未填项：${toAsk.map((p) => p.label).join(" + ")}（已识别的不再问）`
      : undefined,
    askGroups,
    actions: extras.length ? extras : undefined,
    state: {
      ...state,
      phase: "clarify",
      pendingAskKeys: toAsk.map((p) => p.key),
      unansweredStreak: state.unansweredStreak,
    },
  };
}

function optionActions(slot: ReplySlot): AgentAction[] {
  return (slot.options ?? []).map((o, i) => ({
    id: `opt-${slot.key}-${i}`,
    label: o,
    kind: "option" as const,
    slotKey: slot.key,
    value: o,
  }));
}

/** 创作意图短句，不应写入品牌名等自由槽 */
function isCreationIntentOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/[「『""].+[」』""]/.test(t) || /叫|品牌名|名叫|品牌是|特产名/.test(t)) return false;
  if (
    /^(帮我|我想|我要|来|请)?(做|设计|写|生成|创建)/.test(t) &&
    /(ip|logo|海报|吉祥物|形象|店招|文案|视频|字体|标志)/i.test(t)
  ) {
    return true;
  }
  if (/^(做|设计|写|来)(一个|一张|一份|个)?.{0,16}$/.test(t) && /(ip|形象|吉祥物)/i.test(t)) {
    return true;
  }
  return false;
}

function looksLikeBadBrandValue(v: string): boolean {
  return (
    isCreationIntentOnly(v) ||
    /设计一个|做一个|帮我做|可爱的?\s*IP|吉祥物/i.test(v)
  );
}

function scrubBadSlots(slots: Record<string, string>): Record<string, string> {
  const next = { ...slots };
  if (next.brandName && looksLikeBadBrandValue(next.brandName)) delete next.brandName;
  if (next.brand && looksLikeBadBrandValue(next.brand)) delete next.brand;
  return next;
}

type IntentResolve =
  | { kind: "none" }
  | { kind: "keep"; specialistId: SpecialistId }
  | { kind: "switch"; specialistId: SpecialistId }
  | { kind: "set"; specialistId: SpecialistId }
  | { kind: "confirm"; candidates: SpecialistDef[] }
  | { kind: "category" };

const INTENT_EXPLICIT: Array<{ id: SpecialistId; re: RegExp }> = [
  { id: "image.font", re: /艺术字|字体|书法字|标题字/ },
  { id: "image.logo", re: /\blogo\b|标志|商标/i },
  { id: "image.ip", re: /\bip\b|吉祥物|表情包/i },
  { id: "image.signage", re: /店招|门头/ },
  { id: "image.product", re: /商拍|商品图|主图/ },
  { id: "image.event", re: /海报|易拉宝|长图|宣传单|活动视觉/ },
  { id: "content.social", re: /文案|推文|朋友圈文案/ },
  { id: "video.avatar", re: /口播|数字人/ },
  { id: "video.oneline", re: /一句话成片|短视频成片/ },
  { id: "video.studio", re: /制作大片|大片脚本/ },
];

function fuzzySpecialist(text: string): SpecialistId | undefined {
  if (/艺术字|字体|书法字|标题字/.test(text)) return "image.font";
  if (/ip|吉祥物|形象/i.test(text)) return "image.ip";
  if (/海报|活动/.test(text)) return "image.event";
  if (/logo|标志/i.test(text)) return "image.logo";
  if (/店招|门头/.test(text)) return "image.signage";
  if (/商拍|商品图/.test(text)) return "image.product";
  if (/视频|成片/.test(text)) return "video.oneline";
  if (/文案|推文/.test(text)) return "content.social";
  return undefined;
}

/**
 * 每句用户自由文本都跑意图识别。
 * - keep：继续当前专家（填槽/推进）
 * - switch/set：换到或锁定专家
 * - confirm：双意图接近，让用户选
 * - category：完全不清楚，问大类
 */
function resolveIntentEveryTurn(text: string, currentId?: SpecialistId): IntentResolve {
  const t = text.trim();
  if (!t) return currentId ? { kind: "keep", specialistId: currentId } : { kind: "category" };

  // 纯槽位短答（苔间 / 文旅）且已有专家 → 保持，不当成换意图
  const looksLikeSlotAnswer =
    t.length <= 24 &&
    !INTENT_EXPLICIT.some((e) => e.re.test(t)) &&
    !/^(做|生成|设计|换|改成|不要|换成|帮我)/.test(t);
  if (currentId && looksLikeSlotAnswer) {
    return { kind: "keep", specialistId: currentId };
  }

  const hits = recallSpecialists(t);
  const explicit = INTENT_EXPLICIT.find((e) => e.re.test(t));
  const fuzzy = fuzzySpecialist(t);

  const rankedId = explicit?.id || hits[0]?.id || fuzzy;

  if (!currentId) {
    if (!rankedId) return { kind: "category" };
    if (hits.length >= 2 && hits[0].id !== hits[1].id) {
      const close = hits.slice(0, 2);
      if (hits[0].id.startsWith("video.avatar") && /口播|数字人|模特/.test(t)) {
        return { kind: "set", specialistId: hits[0].id };
      }
      const score = (s: SpecialistDef) =>
        s.keywords.filter((k) => t.toLowerCase().includes(k.toLowerCase())).join("").length;
      if (score(close[0]) >= score(close[1]) + 2 || explicit) {
        return { kind: "set", specialistId: rankedId };
      }
      return { kind: "confirm", candidates: close };
    }
    return { kind: "set", specialistId: rankedId };
  }

  // 已有专家：每句仍识别；仅在明确指向其他能力时切换
  if (!rankedId || rankedId === currentId) {
    return { kind: "keep", specialistId: currentId };
  }

  const cur = getSpecialist(currentId);
  const curMatches = Boolean(cur?.keywords.some((k) => t.toLowerCase().includes(k.toLowerCase())));
  const newMatches = Boolean(
    explicit ||
      getSpecialist(rankedId)?.keywords.some((k) => t.toLowerCase().includes(k.toLowerCase())) ||
      fuzzy === rankedId
  );

  const switchCue = /(做|生成|设计|换|改成|不要|换成|改做|帮我)/.test(t);

  if (newMatches && (!curMatches || switchCue || Boolean(explicit && explicit.id !== currentId))) {
    // 双意图接近且当前仍匹配 → 确认卡
    if (curMatches && hits.length >= 2 && hits[0].id !== hits[1].id && !explicit) {
      return { kind: "confirm", candidates: hits.slice(0, 2) };
    }
    return { kind: "switch", specialistId: rankedId };
  }

  return { kind: "keep", specialistId: currentId };
}

function applySpecialistSwitch(
  state: AgentRuntimeState,
  nextId: SpecialistId
): AgentRuntimeState {
  const keep: Record<string, string> = {};
  for (const k of ["style", "brandName", "brand", "colors", "audience"]) {
    if (state.slots[k] && !looksLikeBadBrandValue(state.slots[k])) keep[k] = state.slots[k];
  }
  return {
    ...state,
    specialistId: nextId,
    slots: keep,
    phase: "clarify",
    proposals: undefined,
    chosenProposalId: undefined,
    directionPlan: undefined,
    planConfirmed: false,
    pendingAskKeys: undefined,
    skillId: undefined,
    unansweredStreak: 0,
    lastImageCount: undefined,
  };
}

/** 一句填同组多项：如「苔间，文旅」或点选后的组合 */
function fillOpenSlotsFromText(
  text: string,
  open: ReplySlot[],
  slots: Record<string, string>
): { slots: Record<string, string>; filled: string[] } {
  const next = { ...slots };
  const filled: string[] = [];
  if (!text.trim() || !open.length) return { slots: next, filled };

  const mark = (key: string, val: string) => {
    if (!next[key]) {
      next[key] = val;
      filled.push(key);
    }
  };

  // 1) 整句 / 片段匹配选项槽（可一次命中多项）
  const parts = text
    .split(/[,，、/|；;]+|\s{1,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const slot of open) {
    if (next[slot.key] || !slot.options?.length) continue;
    const hit =
      slot.options.find((o) => text.includes(o)) ||
      slot.options.find((o) => parts.some((p) => p === o || o.includes(p) || p.includes(o)));
    if (hit) {
      mark(slot.key, hit);
      continue;
    }
    for (const h of slot.extractHints) {
      if (text.includes(h) || parts.some((p) => p.includes(h))) {
        const opt = slot.options.find((o) => o.includes(h)) || slot.options[0];
        mark(slot.key, opt);
        break;
      }
    }
  }

  if (isCreationIntentOnly(text)) return { slots: next, filled };

  // 2) 多段：按顺序填剩余自由槽，选项槽用片段再匹配
  const still = open.filter((s) => !next[s.key]);
  if (parts.length >= 2) {
    const used = new Set(filled.map((k) => next[k]));
    for (const p of parts) {
      for (const slot of still) {
        if (next[slot.key] || !slot.options?.length) continue;
        const hit = slot.options.find((o) => o === p || o.includes(p) || p.includes(o));
        if (hit) {
          mark(slot.key, hit);
          used.add(hit);
        }
      }
    }
    const freeStill = still.filter((s) => !next[s.key] && !s.options?.length);
    let i = 0;
    for (const slot of freeStill) {
      while (
        i < parts.length &&
        (used.has(parts[i]) ||
          looksLikeBadBrandValue(parts[i]) ||
          still.some((s) => s.options?.some((o) => o === parts[i] || o.includes(parts[i]))))
      ) {
        i++;
      }
      if (i >= parts.length) break;
      if (slot.key === "brandName" && parts[i].length > 24) {
        i++;
        continue;
      }
      mark(slot.key, parts[i]);
      used.add(parts[i]);
      i++;
    }
    return { slots: next, filled };
  }

  // 3) 单段：只填一个仍空的自由槽（不抢选项槽）
  const freeOne = still.find((s) => !s.options?.length);
  if (freeOne && !next[freeOne.key] && text.length <= 24 && !looksLikeBadBrandValue(text)) {
    mark(freeOne.key, text.slice(0, 40));
  }

  return { slots: next, filled };
}

function extractIntoSlots(text: string, spec: SpecialistDef, slots: Record<string, string>): Record<string, string> {
  const next = { ...slots };
  const t = text.toLowerCase();
  const intentOnly = isCreationIntentOnly(text);

  // 强线索槽：即使 when 尚未激活也先写入（如「海报」在未选文生图前）
  const extractable = spec.slots.filter((slot) => {
    if (next[slot.key]) return false;
    if (!slot.when) return true;
    const dep = next[slot.when.slot];
    // 依赖未填：仍允许提取；依赖已填且不等于条件：跳过
    if (!dep) return true;
    return dep === slot.when.equals;
  });

  for (const slot of extractable) {
    if (next[slot.key]) continue;

    // 选项精确/包含匹配
    if (slot.options) {
      const hit = slot.options.find((o) => text.includes(o) || t.includes(o.toLowerCase()));
      if (hit) {
        next[slot.key] = hit;
        continue;
      }
    }

    // 特殊：mode —— 仅明确说了才写入，避免「做一个 IP」跳过确认
    if (slot.key === "mode") {
      if (/扩展|延展|已有形象|已有.?IP/.test(text)) next[slot.key] = "扩展设计";
      else if (/创新设计|从零|新建形象/.test(text)) next[slot.key] = "创新设计";
    }

    // hint 匹配
    if (!next[slot.key] && slot.extractHints.length) {
      for (const h of slot.extractHints) {
        if (t.includes(h.toLowerCase())) {
          // 映射到更规范的选项值
          if (slot.key === "style") {
            if (/可爱|萌|q版|q 版/.test(t)) next[slot.key] = "可爱 Q 版";
            else if (/国潮|国风|中国风|中国风格/.test(t)) next[slot.key] = slot.options?.includes("国潮") ? "国潮" : slot.options?.includes("新中式") ? "新中式" : "国潮";
            else if (/田园|温馨/.test(t)) next[slot.key] = "田园温馨";
            else if (/潮酷/.test(t)) next[slot.key] = "潮酷";
            else next[slot.key] = slot.options?.[0] ?? h;
          } else if (slot.key === "subject") {
            if (/茶/.test(text)) next[slot.key] = /姑娘|小哥|人/.test(text) ? text.trim().slice(0, 24) : "茶拟人";
            else if (/竹|笋/.test(text)) next[slot.key] = "竹拟人";
            else if (/果|蔬|萝卜/.test(text)) next[slot.key] = "果蔬拟人";
            else if (/动物|猫|狗|兔/.test(text)) next[slot.key] = "小动物";
            else next[slot.key] = text.trim().slice(0, 24);
          } else if (slot.key === "usage") {
            if (/表情包/.test(text)) next[slot.key] = "表情包";
            else if (/包装/.test(text)) next[slot.key] = "包装延展";
            else if (/活动|物料/.test(text)) next[slot.key] = "活动物料";
            else if (/主视觉|吉祥物/.test(text)) next[slot.key] = "吉祥物主视觉";
            else next[slot.key] = slot.options?.[0] ?? h;
          } else if (slot.key === "format") {
            const formats = ["海报", "长图", "易拉宝", "宣传单", "菜单"];
            next[slot.key] = formats.find((f) => text.includes(f)) ?? "海报";
          } else if (slot.key === "platform") {
            if (/朋友圈/.test(text)) next[slot.key] = "朋友圈";
            else if (/小红书/.test(text)) next[slot.key] = "小红书";
            else if (/抖音/.test(text)) next[slot.key] = "抖音文案";
            else if (/微博/.test(text)) next[slot.key] = "微博";
          } else if (slot.key === "theme") {
            // 「节」单独字太宽，避免误填
            if (h === "节" && !/节庆|过节|节日|春节|中秋|国庆/.test(text)) continue;
            next[slot.key] = text.trim().slice(0, 40);
          } else if (slot.key === "industry") {
            const opt = slot.options?.find((o) => o.includes(h)) || slot.options?.[0] || h;
            next[slot.key] = opt;
          } else {
            next[slot.key] = slot.options?.[0] ?? h;
          }
          break;
        }
      }
    }
  }

  // 自由文本：最多填 1 个空自由槽（多项交给 fillOpenSlotsFromText）
  if (!intentOnly) {
    const freeKeys = [
      "theme",
      "topic",
      "brief",
      "oneLiner",
      "brandName",
      "shopName",
      "text",
      "brand",
      "sellingPoints",
      "script",
      "creativeDesc",
    ];
    const freeSlot = activeSlots(spec, next).find(
      (s) => !next[s.key] && freeKeys.includes(s.key) && (!s.options?.length || s.key === "creativeDesc")
    );
    if (freeSlot) {
      const okBrand =
        freeSlot.key === "brandName" || freeSlot.key === "brand" || freeSlot.key === "shopName"
          ? text.length <= 24 && !looksLikeBadBrandValue(text)
          : freeSlot.key === "creativeDesc"
            ? text.length >= 6 && !isCreationIntentOnly(text)
            : text.length >= 4;
      if (okBrand) next[freeSlot.key] = text.trim().slice(0, freeSlot.key === "creativeDesc" ? 200 : 80);
    }
  }

  return scrubBadSlots(next);
}

function applyYouDecide(spec: SpecialistDef, slots: Record<string, string>): Record<string, string> {
  const next = { ...slots };
  for (const slot of activeSlots(spec, next)) {
    if (!next[slot.key] && slot.defaultValue) {
      // 上传确认类槽位不能用默认值「假装已上传」
      if (isUploadSlotKey(slot.key) || isUploadConfirmValue(slot.defaultValue)) continue;
      next[slot.key] = slot.defaultValue;
    }
  }
  return next;
}

export function buildCreativeBrief(spec: SpecialistDef, slots: Record<string, string>, chosen?: AgentProposal): string {
  if (chosen) return chosen.text;
  if (spec.id === "image.ip") {
    if (slots.mode === "扩展设计") {
      return `对已有 IP 做「${slots.extendType || "场景"}」延展`;
    }
    const parts = [
      slots.creativeDesc || "",
      slots.colors ? `配色${slots.colors}` : "",
      slots.ratio ? `尺寸${slots.ratio}` : "",
      slots.refHint === "我已上传参考图" ? "含参考图" : "",
      "单一角色居中，吉祥物形象清晰",
    ].filter(Boolean);
    return parts.join("，");
  }
  if (spec.id === "image.event") {
    return [slots.theme, slots.format, slots.style, slots.ratio].filter(Boolean).join("，");
  }
  if (spec.id === "image.logo") {
    const desc =
      slots.creativeDesc &&
      slots.creativeDesc !== "无特殊要求" &&
      slots.creativeDesc !== "我来补充"
        ? slots.creativeDesc
        : "";
    return [slots.brandName, slots.style, desc, "Logo"].filter(Boolean).join("，");
  }
  if (spec.id === "image.signage") {
    return [slots.channel, slots.shopName, slots.industry, slots.style, slots.slogan !== "暂无" ? slots.slogan : ""]
      .filter(Boolean)
      .join("，");
  }
  if (spec.id === "image.font") {
    return [slots.text, slots.dir, slots.style].filter(Boolean).join("，");
  }
  if (spec.id === "image.product") {
    return [slots.scene, "商拍主图"].filter(Boolean).join("，");
  }
  if (spec.id === "content.social") {
    return [
      slots.platform,
      slots.topic,
      slots.audience,
      slots.brand !== "暂无" ? slots.brand : "",
      slots.advantage !== "暂无" ? slots.advantage : "",
      slots.outlineTitle && slots.outlineTitle !== "跳过大纲" ? `主题:${slots.outlineTitle}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (spec.id === "content.official") {
    return [slots.topic, slots.keywords, slots.style, slots.length].filter(Boolean).join(" · ");
  }
  if (spec.id === "content.brand") {
    return [slots.brand, slots.audience, slots.sellingPoints, slots.goal].filter(Boolean).join(" · ");
  }
  if (spec.id === "video.avatar") {
    return slots.script || `数字人口播 · ${slots.role || ""}`;
  }
  if (spec.id === "video.studio") {
    return slots.brief || "";
  }
  if (spec.id === "video.oneline") {
    return slots.oneLiner || "";
  }
  // fallback: join values
  return Object.values(slots).filter(Boolean).join("，");
}

function summaryLines(spec: SpecialistDef, slots: Record<string, string>): string[] {
  return activeSlots(spec, slots)
    .filter((s) => slots[s.key])
    .map((s) => `· ${s.label}：${slots[s.key]}`);
}

function exitActions(spec: SpecialistDef, slots: Record<string, string>, brief: string): AgentAction[] {
  const actions: AgentAction[] = [];
  if (spec.exits.includes("propose")) {
    actions.push({ id: "act-propose", label: "帮我出 3 个方案", kind: "propose" });
  }
  if (spec.exits.includes("generate")) {
    actions.push({
      id: "act-generate",
      label: spec.id.startsWith("content") || spec.id.startsWith("research") || spec.id.startsWith("video")
        ? "立即生成"
        : "直接出图",
      kind: "generate",
    });
  }
  void slots;
  void brief;
  return actions;
}

function categoryClarifyTurn(state: AgentRuntimeState, think: boolean): AssistantTurn {
  const cats: AgentAction[] = [
    { id: "cat-content", label: "文案", kind: "category", value: "content" },
    { id: "cat-image", label: "品牌设计", kind: "category", value: "image" },
    { id: "cat-video", label: "视频", kind: "category", value: "video" },
    { id: "cat-research", label: "调研", kind: "category", value: "research" },
  ];
  return {
    text: "我可以帮你做文案、品牌视觉、视频或调研。你更想先做哪一类？",
    tipLabel: undefined,
    thinking: think ? "意图不明确，先收窄大类。" : undefined,
    options: cats,
    state: { ...state, phase: "route" },
  };
}

function dualIntentTurn(hits: SpecialistDef[], state: AgentRuntimeState, think: boolean): AssistantTurn {
  return {
    text: "你更可能是想做下面哪一件？",
    thinking: think ? `候选：${hits.map((h) => h.label).join(" / ")}` : undefined,
    options: hits.slice(0, 3).map((h, i) => ({
      id: `intent-${i}`,
      label: h.label.replace(/^[^·]+·\s*/, ""),
      kind: "category" as const,
      specialistId: h.id,
      value: h.id,
    })),
    state: { ...state, phase: "route" },
  };
}

/** 方向策划确认闸门（竞品：先方案后出图） */
function plannedTurn(spec: SpecialistDef, state: AgentRuntimeState, think: boolean, lead?: string): AssistantTurn {
  if (requiresUserRefImage(state) && !hasUserRefImage(state)) {
    return forceRefUploadTurn(spec, state, think, lead);
  }
  const slots = injectMemorySlots(state.slots);
  const plan = buildDirectionPlan(spec, slots);
  const actions: AgentAction[] = [
    { id: "act-confirm-plan", label: "确认方案，开始生成", kind: "confirm_plan" },
  ];
  if (spec.exits.includes("propose")) {
    actions.push({ id: "act-propose", label: "先出 3 个备选方案", kind: "propose" });
  }
  actions.push({ id: "act-revise-plan", label: "调整方案方向", kind: "revise_plan" });

  const skill = getSkill(spec.id);
  return {
    text: (lead ? `${lead}\n\n` : "") + plan,
    tipLabel: spec.label,
    thinking: think
      ? `槽位已齐 → D 闸门（${skill?.gatePolicy || "direction_plan"}），确认后再调 generate。`
      : undefined,
    summaryLines: summaryLines(spec, slots),
    actions,
    state: {
      ...state,
      slots,
      directionPlan: plan,
      phase: "planned",
      unansweredStreak: 0,
      pendingAskKeys: undefined,
      planConfirmed: false,
    },
  };
}

/** 出图后相关建议（对齐 Miora） */
export function postDeliveryActions(spec: SpecialistDef): AgentAction[] {
  const actions: AgentAction[] = [];
  if (spec.id === "image.ip" || spec.id === "image.logo") {
    actions.push({
      id: "act-extend-vi",
      label: spec.id === "image.logo" ? "确认 Logo，生成 VI 延展" : "确认主视觉，生成 VI 延展",
      kind: "extend_vi",
      skillId: "skill.image.vi_extend",
    });
  }
  if (spec.id === "image.ip") {
    actions.push({
      id: "act-ip-story",
      label: "生成 IP 故事",
      kind: "generate",
      skillId: "skill.image.ip_story",
    });
  }
  actions.push({ id: "act-change-dir", label: "换一个视觉方向", kind: "change_direction" });
  actions.push({ id: "act-adjust-colors", label: "调整配色方案", kind: "adjust_colors" });
  actions.push({ id: "act-generate-again", label: "再生成一版", kind: "generate" });
  if (spec.exits.includes("propose")) {
    actions.push({ id: "act-propose-again", label: "重新出方案", kind: "propose" });
  }
  return actions;
}

function readyTurn(spec: SpecialistDef, state: AgentRuntimeState, think: boolean, lead?: string): AssistantTurn {
  // 必须上传参考图/商品图却尚未上传 → 卡住追问，不进提案/生成
  if (requiresUserRefImage(state) && !hasUserRefImage(state)) {
    return forceRefUploadTurn(spec, state, think, lead);
  }

  // 视觉类：强制方向策划闸门
  if (needsDirectionGate(spec.id)) {
    return plannedTurn(spec, state, think, lead);
  }

  const brief = buildCreativeBrief(spec, state.slots);
  const lines = summaryLines(spec, state.slots);
  return {
    text:
      (lead ? `${lead}\n\n` : "") +
      `当前方案：\n${lines.join("\n")}\n\n可以开始了：`,
    tipLabel: spec.label,
    thinking: think ? "必填槽已齐，给出提案 / 生成出口。" : undefined,
    summaryLines: lines,
    actions: exitActions(spec, state.slots, brief),
    state: { ...state, phase: "ready", unansweredStreak: 0, pendingAskKeys: undefined },
  };
}

/** 用户点击选项 / 发送文本 → 推进一回合 */
export function runAgentTurn(params: {
  text: string;
  state: AgentRuntimeState;
  think?: boolean;
  /** 结构化动作（点选项/出口时传入） */
  action?: AgentAction;
}): AssistantTurn {
  const think = params.think ?? true;
  let state: AgentRuntimeState = {
    ...params.state,
    slots: { ...params.state.slots },
  };
  const text = (params.text || "").trim();
  const action = params.action;
  // A · 每轮装配（决策仍走代码；full 供调试 / 未来路由，不改用户可见文案）
  void assembleContext(state, text);

  // —— 动作：选大类 ——
  if (action?.kind === "category") {
    if (action.specialistId) {
      state.specialistId = action.specialistId;
      state.phase = "clarify";
    } else if (action.value === "content") {
      state.specialistId = "content.social";
    } else if (action.value === "image") {
      return {
        text: "品牌设计里你更想做哪一块？",
        options: [
          { id: "i-ip", label: "IP 形象", kind: "category", specialistId: "image.ip", value: "image.ip" },
          { id: "i-logo", label: "Logo", kind: "category", specialistId: "image.logo", value: "image.logo" },
          { id: "i-event", label: "活动海报", kind: "category", specialistId: "image.event", value: "image.event" },
          { id: "i-product", label: "商拍", kind: "category", specialistId: "image.product", value: "image.product" },
          { id: "i-sign", label: "店招", kind: "category", specialistId: "image.signage", value: "image.signage" },
          { id: "i-font", label: "AI 字体", kind: "category", specialistId: "image.font", value: "image.font" },
        ],
        state,
      };
    } else if (action.value === "video") {
      return {
        text: "视频里你更想做哪一种？",
        options: [
          { id: "v-one", label: "一句话成片", kind: "category", specialistId: "video.oneline", value: "video.oneline" },
          { id: "v-av", label: "数字人口播", kind: "category", specialistId: "video.avatar", value: "video.avatar" },
          { id: "v-st", label: "制作大片", kind: "category", specialistId: "video.studio", value: "video.studio" },
        ],
        state,
      };
    } else if (action.value === "research") {
      return {
        text: "调研更偏向？",
        options: [
          { id: "r-b", label: "品牌调研", kind: "category", specialistId: "research.brand", value: "research.brand" },
          { id: "r-i", label: "产业调研", kind: "category", specialistId: "research.industry", value: "research.industry" },
          { id: "r-h", label: "爆款分析", kind: "category", specialistId: "research.hotsale", value: "research.hotsale" },
        ],
        state,
      };
    }
  }

  // —— 动作：确认策划 / 提案 / 生成 —— 由 HomeView 调真实 API
  if (
    action?.kind === "propose" ||
    action?.kind === "generate" ||
    action?.kind === "confirm_plan" ||
    action?.kind === "extend_vi"
  ) {
    if (action.kind === "confirm_plan" || action.kind === "extend_vi") {
      state.planConfirmed = true;
      if (action.kind === "extend_vi") state.skillId = "skill.image.vi_extend";
      persistSlotsToMemory(state.slots);
    }
    return {
      text: "正在调用模型…",
      tipLabel: state.specialistId ? getSpecialist(state.specialistId)?.label : undefined,
      state,
    };
  }

  // —— 动作：调整方案方向 ——
  if (action?.kind === "revise_plan" && state.specialistId) {
    const spec = getSpecialist(state.specialistId)!;
    return {
      text: "想先改哪一块？点选后我会更新方向策划。",
      tipLabel: spec.label,
      options: [
        { id: "rev-desc", label: "改创意描述", kind: "option", slotKey: "_clear", value: "creativeDesc" },
        { id: "rev-color", label: "改偏好颜色", kind: "option", slotKey: "_clear", value: "colors" },
        { id: "rev-ratio", label: "改画面尺寸", kind: "option", slotKey: "_clear", value: "ratio" },
        { id: "rev-free", label: "我补充说明", kind: "option", slotKey: "_redo", value: "redo" },
      ],
      state: { ...state, phase: "clarify", planConfirmed: false },
    };
  }

  // —— 动作：换视觉方向（出图后）——
  if (action?.kind === "change_direction" && state.specialistId) {
    const spec = getSpecialist(state.specialistId)!;
    delete state.slots.style;
    delete state.slots.colors;
    if (spec.id === "image.ip") {
      delete state.slots.creativeDesc;
      delete state.slots.subject;
      delete state.slots.brandName;
    }
    state.planConfirmed = false;
    state.skillId = undefined;
    state.phase = "clarify";
    const pair = nextAskPair(spec, state.slots);
    if (pair.length) {
      return askGroupTurn(spec, state, pair, think, "好的，我们换个视觉方向。再确认这两点：");
    }
    return plannedTurn(spec, state, think, "方向已重置，请确认新方案：");
  }

  // —— 动作：调整配色 ——
  if (action?.kind === "adjust_colors" && state.specialistId) {
    const spec = getSpecialist(state.specialistId)!;
    const presets = [
      { label: "自然草本绿", value: "#2D5836 / #F5F0E8 / #A8C5A0" },
      { label: "国潮红金", value: "#C41E3A / #1A1A1A / #F5E6C8" },
      { label: "柔粉可爱", value: "#FF8FAB / #FFF5F7 / #7EC8E3" },
      { label: "轻奢黑金", value: "#1C1C1C / #D4AF37 / #F4F4F4" },
      { label: "现代极简", value: "#222222 / #FFFFFF / #4A90A4" },
    ];
    return {
      text: "选一组配色，确认后按新色重新出图。",
      tipLabel: spec.label,
      options: presets.map((p, i) => ({
        id: `color-${i}`,
        label: `${p.label}（${p.value}）`,
        kind: "option" as const,
        slotKey: "colors",
        value: p.value,
      })),
      actions: [{ id: "act-confirm-color-gen", label: "用当前色直接出图", kind: "confirm_plan" }],
      state: { ...state, phase: "clarify", pendingAskKeys: ["colors"] },
    };
  }

  // —— 动作：选用方案 ——
  if (action?.kind === "pick_proposal" && state.specialistId) {
    const spec = getSpecialist(state.specialistId)!;
    const chosen = state.proposals?.find((p) => p.id === action.proposalId);
    if (chosen) {
      state.chosenProposalId = chosen.id;
      if (spec.id === "image.ip") {
        state.slots.creativeDesc = state.slots.creativeDesc || chosen.text.slice(0, 120);
      }
      if (spec.id === "video.avatar") {
        state.slots.script = chosen.text;
      }
      if (spec.id === "content.social" || spec.id === "image.event") {
        state.slots.topic = state.slots.topic || chosen.text.slice(0, 40);
        state.slots.theme = state.slots.theme || chosen.text.slice(0, 40);
      }
      if (needsDirectionGate(spec.id)) {
        return plannedTurn(spec, state, think, `已选用${chosen.title}。`);
      }
      return {
        text: `已选用${chosen.title}：\n${chosen.text}\n\n接下来可以：`,
        tipLabel: spec.label,
        actions: exitActions(spec, state.slots, chosen.text),
        state: { ...state, phase: "ready" },
      };
    }
  }

  // —— 清空某槽以便重问 ——
  if (action?.kind === "option" && action.slotKey === "_clear" && action.value && state.specialistId) {
    const spec = getSpecialist(state.specialistId)!;
    const key = action.value;
    if (key === "brandName") {
      delete state.slots.brandName;
      delete state.slots.industry;
    } else {
      delete state.slots[key];
    }
    state.phase = "clarify";
    state.planConfirmed = false;
    const pair = nextAskPair(spec, state.slots);
    if (pair.length) {
      return askGroupTurn(spec, state, pair, think, `好的，我们重看「${key}」相关信息：`);
    }
    return plannedTurn(spec, state, think);
  }

  // redo from propose
  if (action?.slotKey === "_redo") {
    state.phase = "clarify";
    state.proposals = undefined;
    state.planConfirmed = false;
    return {
      text: "好的，你再补充一点想法（主体、风格、用途都行），我重新帮你收窄。",
      tipLabel: state.specialistId ? getSpecialist(state.specialistId)?.label : undefined,
      state,
    };
  }

  // —— 动作：填槽 ——
  if (action?.kind === "option" && action.slotKey && action.value && action.slotKey !== "_clear" && action.slotKey !== "_redo") {
    if (action.value === "改成创新设计") {
      state.slots.mode = "创新设计";
      delete state.slots.extendType;
      delete state.slots.ipImage;
    } else if (action.value === "改成文生图") {
      state.slots.pipeline = "文生图";
      delete state.slots.refUpload;
    } else if (action.value === "改成文生视频") {
      state.slots.pipeline = "文生视频";
      delete state.slots.refUpload;
    } else if (action.value === "帮我写一版") {
      state.slots.script = state.slots.script || "（待生成口播稿）";
    } else if (isUploadSlotKey(action.slotKey) && isUploadConfirmValue(action.value) && !hasUserRefImage(state)) {
      // 未实际上传却点「我已上传」→ 不写入槽位，继续追问上传
      const specWait = state.specialistId ? getSpecialist(state.specialistId) : undefined;
      if (specWait) {
        return forceRefUploadTurn(
          specWait,
          state,
          think,
          "还没有检测到你上传的图片。请先点输入框旁的附件 📎 上传，上传后再点「我已上传参考图」。"
        );
      }
    } else {
      state.slots[action.slotKey] = action.value;
    }
    state.unansweredStreak = 0;
    // 配色选完 → 回到策划闸门
    if (action.slotKey === "colors" && state.specialistId) {
      const spec = getSpecialist(state.specialistId);
      if (spec && needsDirectionGate(spec.id)) {
        return plannedTurn(spec, state, think, `配色已更新为 ${action.value}。`);
      }
    }
  }

  // —— 动作：你定 / 快速出 ——
  if (action?.kind === "defaults" || YOU_DECIDE.test(text) || FAST_GEN.test(text)) {
    if (state.specialistId) {
      const specFast = getSpecialist(state.specialistId);
      if (specFast) {
        if (requiresUserRefImage(state) && !hasUserRefImage(state)) {
          return forceRefUploadTurn(
            specFast,
            state,
            think,
            "图生/商拍需要参考图，请先上传后再用推荐继续。"
          );
        }
        state.slots = applyYouDecide(specFast, injectMemorySlots(state.slots));
        state.unansweredStreak = 0;
        if (isReady(specFast, state.slots)) {
          const lead = FAST_GEN.test(text)
            ? "好的，按已有信息尽快推进。"
            : "好的，其余我按常用默认帮你定了。";
          return readyTurn(specFast, state, think, lead);
        }
      }
    }
  }

  // —— 每句自由文本：意图识别（点选选项不重跑，避免打断填槽）——
  let justSwitched = false;
  if (text && !action) {
    const intent = resolveIntentEveryTurn(text, state.specialistId);
    if (intent.kind === "category") {
      return categoryClarifyTurn(state, think);
    }
    if (intent.kind === "confirm") {
      return dualIntentTurn(intent.candidates, state, think);
    }
    if (intent.kind === "set") {
      state.specialistId = intent.specialistId;
    }
    if (intent.kind === "switch") {
      state = applySpecialistSwitch(state, intent.specialistId);
      justSwitched = true;
    }
    // keep：继续当前专家
  } else if (!state.specialistId && action?.specialistId) {
    state.specialistId = action.specialistId;
  }

  const spec = getSpecialist(state.specialistId!);
  if (!spec) return categoryClarifyTurn(state, think);

  // 品牌记忆注入空槽
  state.slots = injectMemorySlots(state.slots);

  // IP：默认创新；用户提到扩展再切过去（对齐 Miora 直接进入信息收集）
  if (spec.id === "image.ip" && !state.slots.mode) {
    state.slots.mode = /扩展|延展|已有/.test(text) ? "扩展设计" : "创新设计";
  }

  // 快速出：填默认后进闸门
  if (FAST_GEN.test(text) && !action) {
    state.slots = applyYouDecide(spec, state.slots);
    if (isReady(spec, state.slots)) {
      return readyTurn(
        spec,
        state,
        think,
        justSwitched
          ? `好的，改做${spec.label.replace(/^[^·]+·\s*/, "")}。跳过细节，直接进入方案确认：`
          : "好的，跳过细节，直接进入方案确认："
      );
    }
  }

  // 抽取 + 自由填槽（支持同组一次答两项）
  const filledThisTurn: string[] = [];
  if (action?.kind === "option" && action.slotKey) {
    filledThisTurn.push(action.slotKey);
  }
  state.slots = scrubBadSlots(state.slots);

  if (text && !action) {
    const before = { ...state.slots };
    state.slots = extractIntoSlots(text, spec, state.slots);

    for (const k of Object.keys(state.slots)) {
      if (state.slots[k] !== before[k]) filledThisTurn.push(k);
    }

    // 针对当前追问组：一句可填多项（「苔间，文旅」）
    const pendingKeys = state.pendingAskKeys?.length
      ? state.pendingAskKeys
      : nextAskPair(spec, state.slots).map((s) => s.key);
    const open = pendingKeys
      .map((k) => activeSlots(spec, state.slots).find((s) => s.key === k))
      .filter((s): s is ReplySlot => s != null && !state.slots[s.key]);

    if (open.length) {
      const multi = fillOpenSlotsFromText(text, open, state.slots);
      state.slots = multi.slots;
      for (const k of multi.filled) {
        if (!filledThisTurn.includes(k)) filledThisTurn.push(k);
      }
    }

    if (!filledThisTurn.length && !isCreationIntentOnly(text)) {
      state.unansweredStreak += 1;
    } else if (filledThisTurn.length) {
      state.unansweredStreak = 0;
    } else {
      // 纯意图开场，不算未答
      state.unansweredStreak = 0;
    }
  }

  // 连续 2 轮未答 → 默认继续
  if (state.unansweredStreak >= 2) {
    return {
      text: "我们先不卡在细节上啦。可以用默认设定继续生成。",
      tipLabel: spec.label,
      actions: [
        { id: "act-defaults", label: "用默认继续", kind: "defaults" },
        ...exitActions(spec, applyYouDecide(spec, state.slots), buildCreativeBrief(spec, applyYouDecide(spec, state.slots))),
      ],
      state,
    };
  }

  if (isReady(spec, state.slots)) {
    // priority 2 仍缺：继续成对追问
    const p2pair = nextAskPair(spec, state.slots);
    if (p2pair.length && p2pair[0].priority === 2 && state.phase !== "ready") {
      const ackKeys =
        filledThisTurn.length >= 2
          ? filledThisTurn.slice(0, 2)
          : (state.pendingAskKeys || []).filter((k) => state.slots[k]).slice(0, 2);
      const ack = buildAck(state.slots, ackKeys.length ? ackKeys : filledThisTurn);
      return askGroupTurn(
        spec,
        state,
        p2pair,
        think,
        ack ? `${ack}再确认两点：` : "再确认两点补充信息："
      );
    }
    const leadAck = buildAck(
      state.slots,
      filledThisTurn.length
        ? filledThisTurn.slice(0, 2)
        : Object.keys(state.slots).filter((k) => k !== "mode").slice(0, 2)
    );
    const lead = leadAck ? `${leadAck}信息差不多齐了。` : "好的，信息差不多齐了。";
    return readyTurn(spec, state, think, lead);
  }

  // 同组双问：只问未填项（已识别的跳过）；同组仅 1 项时由 nextAskPair 跨组补齐
  const pair = nextAskPair(spec, state.slots);
  if (!pair.length) {
    return readyTurn(spec, state, think);
  }

  const openPair = pair.filter((s) => !state.slots[s.key]);
  if (!openPair.length) {
    return readyTurn(spec, state, think);
  }

  const pairKeys = new Set(openPair.map((s) => s.key));
  const relatedFilled = activeSlots(spec, state.slots).filter(
    (s) =>
      state.slots[s.key] &&
      (filledThisTurn.includes(s.key) ||
        openPair.some((p) => p.group === s.group) ||
        pairKeys.has(s.key))
  );

  const isFirst =
    justSwitched || params.state.specialistId !== spec.id || params.state.phase === "route";
  const filledInPair = filledThisTurn.filter((k) =>
    openPair.some((s) => s.key === k) || relatedFilled.some((s) => s.key === k)
  );
  const switchLead = justSwitched
    ? `好的，改做${spec.label.replace(/^[^·]+·\s*/, "")}。`
    : "";

  let lead = "";
  if (relatedFilled.length && openPair.length) {
    const known = relatedFilled.map((s) => state.slots[s.key]).filter(Boolean);
    const ack = known.length
      ? known.length >= 2
        ? `${known[0]} × ${known[1]}，这个组合很清晰。`
        : `收到「${known[0]}」。`
      : "好的。";
    if (openPair.length === 1) {
      lead = `${switchLead}${ack}还差一点：${openPair[0].ask}`;
    } else {
      lead = `${switchLead}${ack}再确认下面两点（都可以一起答）：`;
    }
  } else if (isFirst && !filledInPair.length) {
    lead =
      openPair.length >= 2
        ? `${switchLead || spec.greet + "\n\n"}下面两个问题都可以一起答：点选选项，或一次输入。`
        : `${switchLead || spec.greet + "\n\n"}${openPair[0]?.ask || "请补充一点信息："}`;
  } else if (filledInPair.length) {
    const ack = buildAck(state.slots, filledInPair.slice(0, 2));
    lead =
      openPair.length >= 2
        ? `${switchLead}${ack || "好的。"}接下来这两个问题，同样可以一起答：`
        : `${switchLead}${ack || "好的。"}还差：${openPair[0]?.ask || "一点信息"}`;
  } else if (filledThisTurn.length) {
    lead =
      openPair.length >= 2
        ? `${switchLead}${spec.greet}\n\n下面两点请确认（已识别的不再重复问）：`
        : `${switchLead}${spec.greet}\n\n${openPair[0]?.ask || "请补充："}`;
  } else {
    lead =
      openPair.length >= 2
        ? `${switchLead}${spec.greet}\n下面两个问题都可以一起答：`
        : `${switchLead}${spec.greet}\n${openPair[0]?.ask || "请补充："}`;
  }

  return askGroupTurn(spec, state, openPair, think, lead);
}

export function listSpecialists(): SpecialistDef[] {
  return SPECIALISTS;
}
