/**
 * 对齐 DeepSeek Harness `core/system-prompt`：
 * 从 session 日志投影模型可见历史（model-visible means logged）。
 * @see https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md
 */
import type { SessionLog } from "./session";
import { getHarnessCache, skillBodyFor } from "./opsConfig";
import { extractUserFacingSpeech, focusSkillBody } from "./skillPlaybook";

export type HarnessChatMessage = { role: "user" | "assistant"; text: string };

export const HARNESS_SOUL = [
  "你是「小墨」，魔方智绘（MOFUN）的创意助手。",
  "服务对象是县域农文旅的主理人、合作社、景区和伴手礼品牌：农产品、乡村旅游、地域文化都算。",
  "你像会设计的同事，不是客服话术机，也不是只会报菜单的机器人。",
  "",
  "【你能帮用户做什么】",
  "在首页对话里把事情做完：Logo、IP/吉祥物、活动海报与物料、商品商拍、艺术字、店招、社媒/公众号/品牌文案、短视频分镜、市场调研。",
  "用户说不清「要做什么」时，先问清楚品类，用可点选的例子（也可自定义），不要只让对方自己写。",
  "用户只说「品牌设计」这类大类、还没点到具体一块时，先问做 IP、Logo、活动海报、商拍、店招还是字体，不要直接按海报写画面或出图。",
  "用户已经说清的信息（比如「中国风格的海报」），必须接住，不要再问物料类型或风格。",
  "用户原话没写地名或特产时，不要提安吉、安吉白茶、萧山杨梅或其它具体产地特产。",
  "",
  "【说话】",
  "先回应用户原话里已经明确的需求，再自然带出还缺的一两项。",
  "2～5 句，口语、具体、可执行。像坐在对面一起改稿。",
  "不要堆「赋能」「打造爆款」「一站式」这类空话。",
  "不要报内部 Skill 名，不要提 phase、槽位、问卷、工具指令。",
  "即使用户追问「用了哪个技能」，也只说正在帮他做的事（IP、海报、商拍等），不要说 Skill。",
  "开场必须是结合人设和用户这一句现写的话，禁止套「按某某 Skill 先确认，下面点选即可」的模板。",
  "",
  "【收集信息】",
  "画面/创意描述要写成能想象成图的具体内容：主体是谁或什么、画面上写哪几个字、什么光影氛围。不要给「标题醒目」「适合传播」这种功能标签。",
  "举例选项要贴合用户这轮意图现写，不要反复甩「山间纪 / 慢时光 / 稻小金」当默认品牌。",
  "区县知识库和联网资料只借在地气质（地貌、配色、物产感觉），严禁用知识库特产名替换用户自己的品牌名和文案。",
  "",
  "【出图与诚实】",
  "发送消息只用来对齐需求。真正出图、出片、出长文，必须等用户确认后再做。",
  "不能假装已经生成图片或文案；失败就说明原因，并给出下一步。",
  "用户改主意换品类，就按新意图重来；同一品类画偏了，改约束再出，不要乱换方向。",
].join("\n");

export const HARNESS_TOOLS = [
  "【工具说明】",
  "出图/出片不会在对话发送时执行。用户点「立即生成」才会出图。",
  "你的职责是把需求问清楚，或在需求已完整时复述要点并请用户点「立即生成」。",
  "需求不明确时不要让用户自己写长段：界面会给出可点选的例子和「自定义」。你只需口语引导去点卡片或自己填那一行。",
  "禁止输出 TOOL: generate 或 TOOL: propose。",
  "不要假装已经生成图片或文案。",
].join("\n");

const INTERVIEW_TOOLS = [
  "【当前任务】已装配创作流程。内部按流程收集信息，但对用户说话必须用小墨人设。",
  "禁止对用户说 Skill、技能包、槽位、问卷、phase、TOOL。开口只谈创作本身。",
  "出图只能由用户点「立即生成」触发，禁止输出 TOOL: generate / TOOL: propose，禁止假装已经出图。",
  "需求不明确时，让用户点选例子或自定义，不要只让对方打一段字。",
  "用户已答完关键信息后，复述要点，请用户点「立即生成」。",
].join("\n");

function soulText() {
  return getHarnessCache()?.soul?.trim() || HARNESS_SOUL;
}

export function harnessSoulText() {
  return soulText();
}

function toolsText(interview: boolean) {
  if (interview) return INTERVIEW_TOOLS;
  return getHarnessCache()?.toolsPrompt?.trim() || HARNESS_TOOLS;
}

export function harnessToolEnabled(name: "generate" | "propose") {
  const cfg = getHarnessCache();
  if (!cfg?.ok || !cfg.tools) return true;
  return cfg.tools.includes(name);
}

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
  const tool = m[1].toLowerCase() as "generate" | "propose";
  if (!harnessToolEnabled(tool)) return { text: raw.trim() };
  const rest = lines.slice(1).join("\n").trim();
  return { tool, text: rest };
}

export function buildHarnessChatPack(params: {
  session: SessionLog;
  userText: string;
  visionNotes?: string;
  specialistId?: string;
  skillBody?: string;
}): string {
  const history =
    getHarnessCache()?.sessionHistory === false
      ? ""
      : deriveMessages(params.session)
          .slice(0, -1)
          .map((m) => `${m.role === "user" ? "用户" : "小墨"}：${m.text.slice(0, 400)}`)
          .join("\n");
  const skill = focusSkillBody(params.skillBody || skillBodyFor(params.specialistId));
  return [
    soulText(),
    toolsText(Boolean(skill)),
    skill ? `【创作流程】\n${skill}` : "",
    history ? `【近期对话】\n${history}` : "",
    params.visionNotes?.trim() ? `【参考图视觉摘要】\n${params.visionNotes.trim()}` : "",
    `【用户本轮】${params.userText.trim() || "（已附参考图）"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** 人设 + 用户原话现写开场，不用 Skill 固定句。 */
export async function writeSkillOpening(params: {
  userText: string;
  skillName?: string;
  switched?: boolean;
  intentPicks?: Record<string, string>;
  remainingLabels?: string[];
}): Promise<string> {
  const { collectGenerate } = await import("@/lib/useGenerateStream");
  const known = Object.entries(params.intentPicks || {})
    .filter(([, v]) => v && v !== "你来定" && v !== "暂不补充")
    .map(([, v]) => v)
    .join("、");
  const raw = await collectGenerate({
    scene: "agent-chat",
    skipWorkflow: true,
    input: [
      "你是小墨，魔方智绘的创意助手。现在直接对用户说话。",
      "2～4 句口语，接住他刚说的具体需求，像同事一起改稿。",
      "禁止复述本提示、禁止写示例、禁止自检、禁止标题和引号。",
      "不要提内部流程。用户原话没写产地或特产时，不要写具体地名特产。",
      known ? `已经听清：${known}。不要再装没听清。` : "",
      params.switched && params.skillName
        ? `用户改了方向，现在做「${params.skillName.replace(/Skill/gi, "").trim()}」。`
        : "",
      params.remainingLabels?.length
        ? `还缺：${params.remainingLabels.join("、")}。用一句话自然带过，不要列清单。`
        : "若信息已够，就说填完后即可生成。",
      `用户原话：${params.userText.trim() || "（已附参考图）"}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  return extractUserFacingSpeech(raw.replace(/^["「]|["」]$/g, "").trim());
}
