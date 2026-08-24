import type { SpecialistDef } from "@/lib/agent/types";

const UPLOAD_KEYS = new Set(["refUpload", "ipImage", "productImage"]);

function slotActive(spec: SpecialistDef, slots: Record<string, string>, key: string): boolean {
  const slot = spec.slots.find((s) => s.key === key);
  if (!slot) return false;
  if (!slot.when) return true;
  return slots[slot.when.slot] === slot.when.equals;
}

/** 用 Skill 默认值填空槽（上传类槽位绝不假装已上传） */
export function fillSkillDefaults(spec: SpecialistDef, slots: Record<string, string>): Record<string, string> {
  const next = { ...slots };
  for (const slot of spec.slots) {
    if (slot.when && next[slot.when.slot] !== slot.when.equals) continue;
    if (next[slot.key] || !slot.defaultValue) continue;
    if (UPLOAD_KEYS.has(slot.key) || /我已上传/.test(slot.defaultValue)) continue;
    next[slot.key] = slot.defaultValue;
  }
  return next;
}

/** 用户原句写入主 brief 槽，覆盖示例默认（如「春茶上市」） */
export function seedSlotsFromPrompt(
  spec: SpecialistDef,
  text: string,
  slots: Record<string, string>,
  hasRef: boolean
): Record<string, string> {
  const brief = text.trim().slice(0, 200);
  let next = { ...slots };

  if (hasRef && spec.id === "image.event") next.pipeline = "图生图";
  if (hasRef && spec.id === "video.oneline") next.pipeline = "图生视频";
  if (hasRef && spec.id === "image.ip") next.mode = next.mode || "创新设计";

  next = fillSkillDefaults(spec, next);

  if (hasRef) {
    if (slotActive(spec, next, "refUpload")) next.refUpload = "我已上传参考图";
    if (slotActive(spec, next, "ipImage")) next.ipImage = "我已上传";
    if (slotActive(spec, next, "productImage")) next.productImage = "我已上传，请出图";
  }

  if (!brief) return next;

  if (spec.id === "image.event") next.theme = brief;
  else if (spec.id === "image.ip") next.creativeDesc = brief;
  else if (spec.id === "image.logo") {
    next.creativeDesc = brief;
    if (!next.brandName) {
      next.brandName =
        brief.replace(/logo|标志|商标|设计|参考图(?:中|里)?/gi, "").trim().slice(0, 16) || "品牌";
    }
  } else if (spec.id === "image.font") next.text = brief.slice(0, 40);
  else if (spec.id === "image.signage") {
    if (!next.shopName) next.shopName = brief.slice(0, 16);
    next.slogan = brief;
  } else if (spec.id === "image.product") next.scene = brief;
  else if (spec.id === "content.social") next.topic = brief;
  else if (spec.id === "content.official") next.topic = brief;
  else if (spec.id === "content.brand") next.sellingPoints = brief;
  else if (spec.id === "video.oneline") next.oneLiner = brief;
  else if (spec.id === "video.avatar") next.script = brief;
  else if (spec.id === "video.studio") next.brief = brief;
  else if (spec.id.startsWith("research.")) {
    next.brand = next.brand || brief;
    next.industry = next.industry || brief;
    next.category = next.category || brief;
  }

  if (/国潮|中国风|国风/.test(brief) && spec.slots.some((s) => s.key === "style") && (!next.style || next.style === "智能匹配")) {
    next.style = spec.id === "image.event" ? "国潮" : next.style || "新中式";
  }

  return next;
}

export function needsRefUpload(spec: SpecialistDef, slots: Record<string, string>, hasRef: boolean): boolean {
  if (hasRef) return false;
  if (spec.id === "image.product") return true;
  if (spec.id === "image.ip" && slots.mode === "扩展设计") return true;
  if (spec.id === "image.event" && slots.pipeline === "图生图") return true;
  if (spec.id === "video.oneline" && slots.pipeline === "图生视频") return true;
  return false;
}
