/**
 * 对齐 DeepSeek Harness `core/system-prompt`：
 * 从 session 日志投影模型可见历史（model-visible means logged）。
 * @see https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md
 */
import type { SessionLog } from "./session";

export type HarnessChatMessage = { role: "user" | "assistant"; text: string };

export const HARNESS_SOUL = [
  "你是「小墨」，魔方智绘的创意助手。",
  "语气清晰、可执行，像同事协作，不堆砌营销空话。",
  "不要输出内部标签（phase、skill、槽位 key）。",
  "不能假装已经生成图片或文案。",
].join("\n");

export const HARNESS_TOOLS = [
  "【工具】",
  "- generate：按用户描述出图或出文案。",
  "- propose：先给几个方向提案。",
  "用户若明确要出图/改图/再来一版，回复第一行只写：TOOL: generate",
  "若只要方向方案，第一行写：TOOL: propose",
  "闲聊、问能力、描述还不完整时：不要写 TOOL 行，直接用 2～5 句口语回复，并请用户把画面或文案说具体。",
  "不要用访谈问卷或双问卡片；需要信息时用自然语言问一句即可。",
].join("\n");

/** 从追加式 session 日志投影对话历史 */
export function deriveMessages(session: SessionLog): HarnessChatMessage[] {
  const out: HarnessChatMessage[] = [];
  for (const ev of session.events) {
    const text = typeof ev.data.text === "string" ? ev.data.text.trim() : "";
    if (!text) continue;
    if (ev.type === "user/message") out.push({ role: "user", text });
    if (ev.type === "assistant/message") out.push({ role: "assistant", text });
  }
  return out.slice(-16);
}

export function parseToolDirective(raw: string): { tool?: "generate" | "propose"; text: string } {
  const lines = raw.replace(/^\uFEFF/, "").trim().split(/\n/);
  const first = (lines[0] || "").trim();
  const m = first.match(/^TOOL:\s*(generate|propose)\s*$/i);
  if (!m) return { text: raw.trim() };
  const rest = lines.slice(1).join("\n").trim();
  return { tool: m[1].toLowerCase() as "generate" | "propose", text: rest };
}

export function buildHarnessChatPack(params: {
  session: SessionLog;
  userText: string;
  visionNotes?: string;
}): string {
  const history = deriveMessages(params.session)
    .slice(0, -1)
    .map((m) => `${m.role === "user" ? "用户" : "小墨"}：${m.text.slice(0, 400)}`)
    .join("\n");
  return [
    HARNESS_SOUL,
    HARNESS_TOOLS,
    history ? `【近期对话】\n${history}` : "",
    params.visionNotes?.trim() ? `【参考图视觉摘要】\n${params.visionNotes.trim()}` : "",
    `【用户本轮】${params.userText.trim() || "（已附参考图）"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
