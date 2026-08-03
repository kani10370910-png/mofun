/**
 * D · 执行边界（Harness L8）
 * 「能用 hook 别用 prompt」——未确认方案 / 缺参考图等硬拒绝，不依赖模型自律。
 */
import { needsDirectionGate } from "./directionPlan";
import { resolveActiveSkill } from "./skills";
import { getSpecialist } from "./specialists";
import type { AgentAction, AgentRuntimeState, GateResult, SkillId } from "./types";

export type GenerateGateOpts = {
  refImage?: string;
  /** 显式指定 Skill（含兼容别名 vi_extend） */
  skill?: SkillId | "vi_extend" | string;
  /** 用户本轮显式确认（confirm_plan / extend_vi） */
  confirming?: boolean;
};

/** 提案前：必须有专家；建议槽齐（不齐时仍允许「先出方案」出口，由 UI 决定） */
export function assertCanPropose(state: AgentRuntimeState): GateResult {
  if (!state.specialistId) {
    return { ok: false, code: "no_specialist", message: "尚未识别创作方向，请先说明想做什么。" };
  }
  const spec = getSpecialist(state.specialistId);
  if (!spec) {
    return { ok: false, code: "no_specialist", message: "尚未识别创作方向。" };
  }
  return { ok: true };
}

/** 出图 / 生成前硬闸门 */
export function assertCanGenerate(
  state: AgentRuntimeState,
  opts?: GenerateGateOpts
): GateResult {
  if (!state.specialistId) {
    return { ok: false, code: "no_specialist", message: "尚未识别创作方向，请先说明想做什么。" };
  }
  const spec = getSpecialist(state.specialistId);
  if (!spec) {
    return { ok: false, code: "no_specialist", message: "尚未识别创作方向。" };
  }

  const skill = resolveActiveSkill(state, opts);
  const isVi = skill?.id === "skill.image.vi_extend";
  const planOk = Boolean(state.planConfirmed || opts?.confirming || isVi);

  const needsPlan =
    skill?.gatePolicy === "direction_plan" || needsDirectionGate(state.specialistId);

  if (needsPlan && !planOk) {
    return {
      ok: false,
      code: "plan_unconfirmed",
      message: "请先确认方向策划，再开始生成。（未确认方案不会出图）",
    };
  }

  const needsRef =
    skill?.gatePolicy === "ref_image" ||
    state.specialistId === "image.product" ||
    (state.specialistId === "image.ip" && state.slots.mode === "扩展设计") ||
    (state.specialistId === "image.event" && state.slots.pipeline === "图生图") ||
    (state.specialistId === "video.oneline" && state.slots.pipeline === "图生视频");

  if (needsRef && !opts?.refImage && (
    skill?.id?.startsWith("skill.image.product") ||
    state.specialistId === "image.product"
  )) {
    return {
      ok: false,
      code: "missing_ref_image",
      message: "商拍需要商品实拍图。请先点输入框旁的附件上传商品图，再点「直接出图」。",
    };
  }

  if (
    (skill?.id === "skill.image.ip_extend" ||
      (state.specialistId === "image.ip" && state.slots.mode === "扩展设计")) &&
    !opts?.refImage &&
    !isVi
  ) {
    return {
      ok: false,
      code: "missing_ref_image",
      message: "请先点附件上传 IP 图，再生成。",
    };
  }

  if (
    (skill?.id === "skill.image.event_i2i" ||
      skill?.id === "skill.video.oneline_i2v" ||
      (state.specialistId === "image.event" && state.slots.pipeline === "图生图") ||
      (state.specialistId === "video.oneline" && state.slots.pipeline === "图生视频")) &&
    !opts?.refImage
  ) {
    return {
      ok: false,
      code: "missing_ref_image",
      message:
        state.specialistId === "video.oneline" || skill?.id === "skill.video.oneline_i2v"
          ? "图生视频需要参考图。请先点附件上传，再生成。"
          : "图生图需要参考图。请先点附件上传，再生成。",
    };
  }

  return { ok: true };
}

/** 生成失败时的固定重试卡（禁止模型编造成功文案） */
export function failureRetryActions(kind: "propose" | "generate"): AgentAction[] {
  if (kind === "propose") {
    return [
      { id: "act-propose", label: "重试提案", kind: "propose" },
      { id: "act-confirm-plan", label: "确认方案，开始生成", kind: "confirm_plan" },
    ];
  }
  return [
    { id: "act-generate", label: "重试生成", kind: "generate" },
    { id: "act-propose", label: "先出方案", kind: "propose" },
  ];
}
