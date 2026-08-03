/** 小墨 Agent · 类型（对齐 docs/Agent框架-小墨.md · Harness 对话框架构） */

export type SpecialistId =
  | "image.ip"
  | "image.logo"
  | "image.event"
  | "image.product"
  | "image.signage"
  | "image.font"
  | "content.social"
  | "content.official"
  | "content.brand"
  | "video.oneline"
  | "video.avatar"
  | "video.studio"
  | "research.brand"
  | "research.industry"
  | "research.hotsale"
  | "meta.category";

export type ToolName =
  | "propose"
  | "generate"
  | "memory_read"
  | "memory_write";

/**
 * SkillId：与工作台「二级功能」1:1 对齐的可调用工作流包
 * Skill ≠ Specialist：一个专家可挂多个 Skill（如商拍六种换底、大片四步）
 */
export type SkillId =
  // 品牌设计 · IP
  | "skill.image.ip"
  | "skill.image.ip_extend"
  | "skill.image.ip_story"
  | "skill.image.vi_extend"
  // 品牌设计 · Logo / 活动 / 字体
  | "skill.image.logo"
  | "skill.image.event"
  | "skill.image.event_i2i"
  | "skill.image.font"
  // 品牌设计 · 商拍（按换底模式拆）
  | "skill.image.product"
  | "skill.image.product_bg"
  | "skill.image.product_multi"
  | "skill.image.product_cutwhite"
  | "skill.image.product_transparent"
  | "skill.image.product_color"
  | "skill.image.product_scene"
  // 品牌设计 · 店招
  | "skill.image.signage"
  | "skill.image.signage_storefront"
  // 文案
  | "skill.content.social"
  | "skill.content.social_wechat"
  | "skill.content.social_xhs"
  | "skill.content.official"
  | "skill.content.brand"
  // 视频
  | "skill.video.oneline"
  | "skill.video.oneline_i2v"
  | "skill.video.avatar"
  | "skill.video.studio"
  | "skill.video.studio_assets"
  | "skill.video.studio_storyboard"
  | "skill.video.studio_preview"
  // 调研
  | "skill.research.brand"
  | "skill.research.industry"
  | "skill.research.hotsale"
  // 模版 / 仓库
  | "skill.template.apply"
  | "skill.storage.works"
  | "skill.storage.materials"
  | "skill.storage.brand";

/** Skill 策略：按需挂到当前 Specialist，不预加载全部说明书 */
export type SkillGatePolicy = "direction_plan" | "ref_image" | "none";

export type SkillOutputKind = "text" | "image" | "proposals" | "guide";

export type SkillDef = {
  id: SkillId;
  name: string;
  /** 窄描述：启动时可见，用于匹配 / 展示 / 装配 */
  description: string;
  /** 默认绑定的专家（无专家的能力如模版/仓库可空） */
  specialistId?: SpecialistId;
  /** 工作台入口 */
  workbench: { view: string; sub?: string; href: string };
  triggerKeywords: string[];
  requiredSlotKeys: string[];
  exits: Array<"propose" | "generate">;
  gatePolicy: SkillGatePolicy;
  /** 绑定的工具名（按需） */
  tools: ToolName[];
  /** 提案 LLM scene（若支持 propose） */
  proposeScene?: string;
  /** 生成 / 出图前扩写 LLM scene */
  generateScene?: string;
  /** 交付形态 */
  output: SkillOutputKind;
  /** 对话内步骤摘要（装配给模型，非逐步引擎） */
  steps: string[];
  /** 相对默认 Skill 的自动切换条件 */
  when?: { slot: string; equals: string };
  /** 是否为该专家的默认 Skill */
  isDefault?: boolean;
};

export type GateDenial = {
  ok: false;
  code:
    | "no_specialist"
    | "plan_unconfirmed"
    | "missing_ref_image"
    | "slots_incomplete";
  message: string;
};

export type GateAllow = { ok: true };
export type GateResult = GateAllow | GateDenial;

export type ReplySlot = {
  key: string;
  label: string;
  priority: 1 | 2 | 3;
  ask: string;
  options?: string[];
  extractHints: string[];
  defaultValue?: string;
  mapsToForm: string;
  /** 仅当某槽等于某值时才追问（如 mode=扩展） */
  when?: { slot: string; equals: string };
  /** 同组编号的槽同一轮一起问（参考 Miora：每次两个相关问题） */
  group: number;
};

export type SpecialistDef = {
  id: SpecialistId;
  label: string;
  keywords: string[];
  route: { view: string; sub: string };
  greet: string;
  slots: ReplySlot[];
  /** 开工后可选出口 */
  exits: Array<"propose" | "generate">;
  handoffLabel: string;
};

export type AgentActionKind =
  | "option"
  | "propose"
  | "generate"
  | "handoff"
  | "defaults"
  | "pick_proposal"
  | "category"
  /** 确认方向策划后出图 */
  | "confirm_plan"
  /** 调整策划文案方向 */
  | "revise_plan"
  /** 出图后：换视觉方向 */
  | "change_direction"
  /** 出图后：调配色 */
  | "adjust_colors"
  /** 出图后：VI / 全套延展 */
  | "extend_vi";

export type AgentAction = {
  id: string;
  label: string;
  kind: AgentActionKind;
  slotKey?: string;
  value?: string;
  href?: string;
  proposalId?: string;
  specialistId?: SpecialistId;
  /** 指定调用的 Skill（如 IP 故事 / VI 延展） */
  skillId?: SkillId;
};

export type AgentProposal = {
  id: string;
  title: string;
  text: string;
};

export type AskGroupItem = {
  key: string;
  label: string;
  ask: string;
  filled?: string;
  options?: AgentAction[];
};

export type AgentRuntimeState = {
  specialistId?: SpecialistId;
  slots: Record<string, string>;
  unansweredStreak: number;
  phase: "route" | "clarify" | "ready" | "planned" | "proposed" | "delivered";
  proposals?: AgentProposal[];
  chosenProposalId?: string;
  /** 当前这一轮正在问的槽（通常 2 个） */
  pendingAskKeys?: string[];
  /** 方向策划正文（确认闸门） */
  directionPlan?: string;
  planConfirmed?: boolean;
  /** 当前挂载的 Skill（如 VI 延展 / IP 故事）；空则按专家默认 Skill 解析 */
  skillId?: SkillId;
  lastImageCount?: number;
  /** 本轮/会话中用户上传的参考图（data URL 或可访问 URL） */
  refImages?: string[];
  /** 参考图经视觉模型识别后的文字摘要，供对话与槽位使用 */
  refVisionNotes?: string;
};

/** 会话 phase（Harness 主循环可见状态） */
export type HarnessPhase = AgentRuntimeState["phase"];

/**
 * 会话进度轨（只活在 AgentRuntimeState / 会话历史里，禁止写入 Brand Memory）
 * 与 brand 轨正交，防 memory rot。
 */
export type SessionProgress = Pick<
  AgentRuntimeState,
  | "specialistId"
  | "slots"
  | "phase"
  | "pendingAskKeys"
  | "directionPlan"
  | "planConfirmed"
  | "skillId"
  | "chosenProposalId"
  | "unansweredStreak"
>;

export type AssistantTurn = {
  text: string;
  thinking?: string;
  tipLabel?: string;
  summaryLines?: string[];
  /** Miora 风格：双问题卡片 */
  askGroups?: AskGroupItem[];
  options?: AgentAction[];
  actions?: AgentAction[];
  proposals?: AgentProposal[];
  state: AgentRuntimeState;
};
