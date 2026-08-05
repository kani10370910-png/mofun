/**
 * 对话回复：每一轮与用户交流后，都调用模型理解用户说话内容，再生成回复。
 * Harness 仍负责槽位推进与 askGroups/options；本模块产出可见正文。
 */
import { collectGenerate } from "@/lib/useGenerateStream";
import { assembleContext } from "../context";
import type { AgentRuntimeState, AssistantTurn } from "../types";
import { kbFields } from "@/lib/regionEnhance";

export type ChatHistoryItem = { role: "user" | "assistant"; text: string };

function buildUiStructureHint(turn: AssistantTurn): string {
  const lines: string[] = [];
  if (turn.askGroups?.length) {
    lines.push("【本轮追问卡片（界面会展示，你不要在正文里再列一遍选项）】");
    for (const g of turn.askGroups) {
      const opts = (g.options || []).map((o) => o.label).filter(Boolean);
      lines.push(
        `- ${g.label}：${g.ask}${opts.length ? `；可选：${opts.join(" / ")}` : ""}`
      );
    }
  }
  if (turn.options?.length) {
    lines.push(`【快捷选项】${turn.options.map((o) => o.label).join(" / ")}`);
  }
  if (turn.actions?.length) {
    lines.push(`【可执行动作】${turn.actions.map((a) => a.label).join(" / ")}`);
  }
  if (turn.proposals?.length) {
    lines.push(
      `【已有提案标题】${turn.proposals.map((p) => p.title).join("、")}（正文由提案卡片展示）`
    );
  }
  if (turn.state.directionPlan && turn.state.phase === "planned") {
    lines.push("【状态】方向策划已给出，引导用户确认后出图；可简要呼应策划要点。");
  }
  if (turn.state.phase === "ready") {
    lines.push("【状态】信息已齐，可引导提案或生成。");
  }
  if (turn.state.phase === "delivered") {
    lines.push("【状态】本轮已交付，可引导微调或延展。");
  }
  return lines.join("\n") || "【本轮界面】无额外卡片（自由对话引导即可）";
}

function formatHistory(history?: ChatHistoryItem[]): string {
  if (!history?.length) return "";
  const lines = history
    .filter((m) => m.text?.trim())
    .slice(-12)
    .map((m) => `${m.role === "user" ? "用户" : "小墨"}：${m.text.trim().slice(0, 400)}`);
  if (!lines.length) return "";
  return `【近期对话】\n${lines.join("\n")}`;
}

/**
 * 结合项目内容与对话历史：先理解用户本轮意图，再生成小墨回复。
 * 失败返回空串，由调用方回退编排器文案。
 */
export async function executeAgentReply(params: {
  state: AgentRuntimeState;
  userText: string;
  turn: AssistantTurn;
  /** 本轮参考图视觉摘要（已识别）；优先于 state.refVisionNotes */
  refVisionNotes?: string;
  /** 近期对话（不含本轮即将写入的助手回复） */
  recentHistory?: ChatHistoryItem[];
  /** 本轮已执行的工具结果摘要（提案/出图等），供模型理解后组织回复 */
  outcomeHint?: string;
}): Promise<string> {
  if (params.turn.text === "正在调用模型…") return "";

  const assembled = assembleContext(params.state, params.userText);
  const ui = buildUiStructureHint(params.turn);
  const history = formatHistory(params.recentHistory);
  const vision =
    (params.refVisionNotes || params.state.refVisionNotes || "").trim() ||
    (params.state.slots.referenceDesc || "").trim();
  const orchestratorNote = (params.turn.text || "").trim();
  const pack = [
    assembled.full,
    history,
    ui,
    vision
      ? `【用户上传的参考图（视觉识别结果，须结合理解与回复）】\n${vision}`
      : "",
    params.outcomeHint?.trim() ? `【本轮系统已执行结果】\n${params.outcomeHint.trim()}` : "",
    orchestratorNote
      ? `【编排器状态提示·仅供理解，不要照抄润色】\n${orchestratorNote.slice(0, 600)}`
      : "",
    params.userText?.trim()
      ? `【用户本轮输入】${params.userText.trim()}`
      : "【用户本轮输入】（点选了界面选项，无额外文字）",
    [
      "请严格按两步完成（不要输出「第一步」「第二步」字样）：",
      "A. 先理解：结合近期对话与本轮输入，判断用户想做什么、已确认什么、还缺什么；",
      "B. 再回复：以「小墨」身份，用 2～5 句口语直接回复用户。",
      "",
      "要求：",
      "1. 必须体现你理解了用户本轮说话/点选的含义，再说明接下来点哪里；",
      "2. 只陈述【已填槽】里确有的信息；用户没点选的品牌名/色系绝不要编造或从选项示例里挑一个当成已定；",
      "3. 【本对话品牌记忆】不能当作用户本轮已选；且不得使用其它对话的记忆；",
      "4. 引导用户点选界面卡片/选项，不要在正文里把选项再列成清单；",
      "5. 不能假装已经生成图片或完整文案；若【本轮系统已执行结果】说明已出图/提案，可如实告知并引导下一步；",
      "6. 不要输出「识别意图」「槽位」「phase」等内部标签；",
      "7. 不要复述或润色编排器模板句，按理解重新组织语言；",
      "8. 若有追问卡片：正文里说的「还要确认几点」必须与卡片条数一致，且只对应卡片上的问题；",
      "9. 若有【用户上传的参考图】：必须点出从图里看到的关键视觉特征，并说明会据此参考。",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  return collectGenerate({
    scene: "agent-chat",
    input: pack,
    ...kbFields(true),
  });
}
