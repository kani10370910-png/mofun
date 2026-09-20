/**
 * 智能体闭环：分析 → RAG / 联网 → 计划 → 审查 → Prompt 优化 → 再审 → 出图 → 验收。
 * 所有 Skill 共用，失败时回退规则匹配，不假装已检索。
 */
import { collectGenerate } from "@/lib/useGenerateStream";
import { kbFields } from "@/lib/regionEnhance";
import { getHarnessCache, loopStepOn, type HarnessSkillItem } from "./opsConfig";
import { extractOptimizedPrompt } from "./userCopy";

export type CyclePlan = {
  intent: string;
  skillCode: string;
  specialistId: string;
  skillName: string;
  ragQuery: string;
  needWeb: boolean;
  webQuery: string;
  generateTool: "generate" | "propose";
  optimize: boolean;
  notes: string;
};

export type CycleBundle = {
  plan: CyclePlan;
  ragBrief: string;
  webBrief: string;
  reviewOk: boolean;
  reviewReason: string;
};

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const t = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function throttleText(fn: (s: string) => void, ms = 80) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = "";
  const fire = () => {
    last = Date.now();
    timer = null;
    fn(pending);
  };
  return (s: string) => {
    pending = s;
    const wait = ms - (Date.now() - last);
    if (wait <= 0) fire();
    else if (!timer) timer = setTimeout(fire, wait);
  };
}

function visibleThinkStream(raw: string): string {
  const t = raw.replace(/^```(?:json)?\s*/i, "").trim();
  if (!t) return "";
  const brace = t.indexOf("{");
  const head = (brace >= 0 ? t.slice(0, brace) : t).replace(/\s+$/g, "").trim();
  const jsonPart = brace >= 0 ? t.slice(brace) : "";
  const pick = (key: string, label: string) => {
    const m = jsonPart.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
    return m?.[1] ? `${label}：${m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"')}` : "";
  };
  const fields = [
    pick("intent", "意图"),
    pick("skillName", "选用"),
    pick("ragQuery", "检索词"),
    pick("notes", "备注"),
    pick("reason", "说明"),
  ].filter(Boolean);
  const readable = [head, ...fields].filter(Boolean).join("\n");
  if (readable) return readable;
  return t.replace(/[{}\[\]"]/g, " ").replace(/\s+/g, " ").trim();
}

async function llmText(
  input: string,
  scene: "agent-chat" | "t2i-associate" = "agent-chat",
  onChunk?: (full: string) => void,
): Promise<string> {
  return collectGenerate(
    {
      scene,
      input,
      skipWorkflow: true,
      ...kbFields(true),
    },
    undefined,
    onChunk,
  );
}

function skillCatalog(): HarnessSkillItem[] {
  return getHarnessCache()?.skills || [];
}

function fallbackPlan(text: string, hit?: HarnessSkillItem | null): CyclePlan {
  return {
    intent: text.slice(0, 80) || "未说明",
    skillCode: hit?.code || "",
    specialistId: hit?.id || "",
    skillName: hit?.name || "",
    ragQuery: text.slice(0, 80),
    needWeb: false,
    webQuery: "",
    generateTool: "generate",
    optimize: true,
    notes: "规则回退：按关键词挂 Skill",
  };
}

export async function retrieveRag(query: string): Promise<string> {
  const q = query.trim();
  if (!q) return "";
  try {
    const r = await fetch("/api/kb/retrieve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, topK: 8, ...kbFields(true) }),
    });
    if (!r.ok) return "";
    const j = (await r.json()) as { kbContext?: string; items?: { title?: string; summary?: string }[] };
    if (j.kbContext?.trim()) return j.kbContext.trim();
    return (j.items || [])
      .map((x) => `- ${x.title || ""}：${x.summary || ""}`.trim())
      .filter((x) => x.length > 4)
      .join("\n");
  } catch {
    return "";
  }
}

export async function retrieveWeb(query: string): Promise<string> {
  const q = query.trim();
  if (!q) return "";
  try {
    const r = await fetch("/api/web-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, topK: 4 }),
    });
    if (!r.ok) return "";
    const j = (await r.json()) as { items?: { title?: string; text?: string }[]; source?: string };
    const lines = (j.items || [])
      .map((x) => `- ${x.title || ""}：${x.text || ""}`.trim())
      .filter((x) => x.length > 4);
    if (!lines.length) return "";
    return `来源 ${j.source || "web"}\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

export async function analyzeAndPlan(
  text: string,
  hit?: HarnessSkillItem | null,
  onProgress?: (s: string) => void,
): Promise<CyclePlan> {
  const skills = skillCatalog()
    .map((s) => `${s.code} | ${s.id} | ${s.name}`)
    .join("\n");
  const raw = await llmText(
    [
      "你是创作调度。根据用户原话判断要做什么。",
      "先用 3～6 句中文写出判断过程：用户要做什么、选哪个技能、要不要检索知识库/联网、是先问清还是直接出图。想到哪写到哪，不要等想完再写。",
      "判断写完后另起一行，只输出一个 JSON，不要 Markdown。",
      "字段：intent, skillCode, specialistId, skillName, ragQuery, needWeb, webQuery, generateTool, optimize, notes",
      "skillCode 必须从下列编码里选，选不准就留空：",
      skills || "（无运营 Skill 列表）",
      `关键词已匹配：${hit?.code || "无"} ${hit?.name || ""}`,
      "generateTool 只能是 generate 或 propose。用户明确要出图用 generate。",
      "needWeb 仅在知识库可能不够（要流行造型、竞品、公开参考）时为 true。",
      `用户原话：${text}`,
    ].join("\n"),
    "agent-chat",
    (full) => {
      const vis = visibleThinkStream(full);
      if (vis) onProgress?.(vis);
    },
  );
  const j = parseJsonObject(raw);
  if (!j) return fallbackPlan(text, hit);
  const skillCode = String(j.skillCode || hit?.code || "");
  const catalog = skillCatalog().find((s) => s.code === skillCode || s.id === skillCode) || hit || undefined;
  return {
    intent: String(j.intent || text).slice(0, 600),
    skillCode: catalog?.code || skillCode,
    specialistId: catalog?.id || String(j.specialistId || hit?.id || ""),
    skillName: catalog?.name || String(j.skillName || hit?.name || ""),
    ragQuery: String(j.ragQuery || text).slice(0, 200),
    needWeb: j.needWeb === true || j.needWeb === "true",
    webQuery: String(j.webQuery || "").slice(0, 200),
    generateTool: String(j.generateTool || "generate") === "propose" ? "propose" : "generate",
    optimize: j.optimize !== false,
    notes: String(j.notes || "").slice(0, 500),
  };
}

export async function reviewPlan(
  plan: CyclePlan,
  text: string,
  ragBrief: string,
  webBrief: string,
  onProgress?: (s: string) => void,
) {
  const fallbackReason = [
    plan.skillName && `技能「${plan.skillName}」匹配当前需求`,
    plan.notes,
    ragBrief ? "已对照知识库要点" : "知识库未命中，按用户原话推进",
    webBrief ? "已补充联网资料" : "",
    "名称、性格、风格等字段待问卷补齐后再出图",
  ]
    .filter(Boolean)
    .join("。");
  const raw = await llmText(
    [
      "审查这份制作计划。先用几句中文写出审查过程，想到哪写到哪。",
      "写完后另起一行只输出 JSON：ok, retry, skillCode, reason",
      "ok=true 表示 Skill 选对、检索步骤合理，即使还缺用户字段。",
      "retry=true 仅当 Skill 选错，必须换 skillCode。",
      "reason 用 2～5 句中文写清：为什么选这个技能、知识库/联网是否够用、还缺用户哪类信息、下一步做什么。不要写「回退」「通过」这种空话。",
      `用户原话：${text}`,
      `计划：${JSON.stringify(plan)}`,
      `RAG：${ragBrief || "（无）"}`,
      `联网：${webBrief || "（无）"}`,
    ].join("\n"),
    "agent-chat",
    (full) => {
      const vis = visibleThinkStream(full);
      if (vis) onProgress?.(vis);
    },
  );
  const j = parseJsonObject(raw);
  if (!j) {
    const leftover = raw.replace(/```[\s\S]*?```/g, "").replace(/[{}\[\]"]/g, " ").replace(/\s+/g, " ").trim();
    return {
      ok: true,
      retry: false,
      skillCode: plan.skillCode,
      reason: leftover.length > 20 ? leftover.slice(0, 800) : fallbackReason,
    };
  }
  const reason = String(j.reason || "").trim();
  return {
    ok: j.ok !== false,
    retry: j.retry === true,
    skillCode: String(j.skillCode || plan.skillCode),
    reason: !reason || /回退为通过|审查通过/.test(reason) ? fallbackReason : reason.slice(0, 800),
  };
}

function formatPlanDetail(plan: CyclePlan): string {
  return [
    plan.skillName && `选用：${plan.skillName}`,
    plan.intent && `意图：${plan.intent}`,
    plan.ragQuery && `检索词：${plan.ragQuery}`,
    plan.needWeb && `联网：${plan.webQuery || "需要"}`,
    `路径：${plan.generateTool === "propose" ? "先出方向提案" : "先问清再出图"}`,
    plan.notes && `备注：${plan.notes}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runCycleStart(
  text: string,
  hit?: HarnessSkillItem | null,
  trace?: (phase: "think" | "read" | "web" | "review", status?: "start" | "end" | "delta", detail?: string) => void,
): Promise<CycleBundle> {
  const begin = (phase: "think" | "read" | "web" | "review", detail?: string) => trace?.(phase, "start", detail);
  const end = (phase: "think" | "read" | "web" | "review", detail?: string) => trace?.(phase, "end", detail);
  const delta = (phase: "think" | "read" | "web" | "review") =>
    throttleText((s: string) => trace?.(phase, "delta", s), 80);
  begin("think", hit?.name ? `已看到「${hit.name}」相关需求，正在分析用户原话…` : "正在分析用户原话，匹配技能与出图路径…");
  let plan = loopStepOn("analyze")
    ? await analyzeAndPlan(text, hit, delta("think"))
    : fallbackPlan(text, hit);
  end("think", formatPlanDetail(plan));
  let resolved = skillCatalog().find((s) => s.code === plan.skillCode || s.id === plan.skillCode) || hit || null;
  let ragBrief = "";
  if (loopStepOn("rag")) {
    begin("read", `正在检索知识库：${plan.ragQuery || text}`);
    ragBrief = await retrieveRag(plan.ragQuery || text);
    end("read", ragBrief || "知识库暂无足够条目");
  }
  let webBrief = "";
  const kbEmpty = !ragBrief.trim();
  const needWeb = kbEmpty || (loopStepOn("web") && plan.needWeb);
  if (needWeb) {
    const q = plan.webQuery || plan.ragQuery || text;
    begin("web", kbEmpty ? `知识库未命中，正在联网检索：${q}` : `正在联网检索：${q}`);
    webBrief = await retrieveWeb(q);
    end("web", webBrief || "未取到公开结果");
  }
  let review = { ok: true, retry: false, skillCode: plan.skillCode, reason: "" };
  if (loopStepOn("review")) {
    begin("review", "正在对照计划与检索结果做审查…");
    review = await reviewPlan(plan, text, ragBrief, webBrief, delta("review"));
    if (review.retry && review.skillCode && review.skillCode !== plan.skillCode) {
      const alt = skillCatalog().find((s) => s.code === review.skillCode || s.id === review.skillCode);
      if (alt) {
        plan = { ...plan, skillCode: alt.code, specialistId: alt.id, skillName: alt.name, notes: review.reason };
        resolved = alt;
      }
    }
    end("review", review.reason || "计划可用，继续下一步");
  }
  if (resolved && !plan.skillName) plan.skillName = resolved.name;
  return {
    plan,
    ragBrief,
    webBrief,
    reviewOk: review.ok || !review.retry,
    reviewReason: review.reason,
  };
}

export async function optimizeUserPrompt(params: {
  userText: string;
  skillName?: string;
  specialistId?: string;
  ragBrief?: string;
  webBrief?: string;
  onProgress?: (s: string) => void;
}): Promise<string> {
  const imageLike = !params.specialistId || /^image\./.test(params.specialistId);
  const tick = params.onProgress ? throttleText(params.onProgress, 80) : undefined;
  const raw = await llmText(
    [
      imageLike
        ? "把用户已确认的生成物描述扩写成一段可直接出图的中文提示词。"
        : "把用户已确认的信息整理成一段可直接交给生成模型的完整任务说明。",
      "只输出正文，不要标题、不要解释。边写边出，不要等想完再写。",
      "保留用户点名的主体、颜色、品牌名、文字；禁止换成知识库或示例里的特产名。",
      params.specialistId === "image.logo" ? "这是平面 Logo：白底、标志居中，禁止人物海报大场景。" : "",
      params.specialistId === "image.ip" ? "这是单个 IP 设定图：主体居中，不要做成活动海报大场景。" : "",
      `Skill：${params.skillName || ""}`,
      `RAG（只作气质，不要把专名画成字）：${params.ragBrief || "无"}`,
      `联网要点（可借鉴结构，不可抄品牌）：${params.webBrief || "无"}`,
      `用户描述：${params.userText}`,
    ]
      .filter(Boolean)
      .join("\n"),
    imageLike ? "t2i-associate" : "agent-chat",
    tick,
  );
  return extractOptimizedPrompt(raw, params.userText) || params.userText.trim();
}

export async function reviewBeforeGenerate(params: {
  userText: string;
  plan?: CyclePlan | null;
  optimized: string;
}): Promise<{ ok: boolean; reason: string }> {
  const raw = await llmText(
    [
      "出图前审查。只输出 JSON：ok, reason",
      "ok=false 仅当优化稿跑偏（改了主体、写成另一种品类、或把用户没说的专名写进画面字）。",
      `计划：${params.plan ? JSON.stringify(params.plan) : "无"}`,
      `用户确认信息：${params.userText}`,
      `优化稿：${params.optimized}`,
    ].join("\n"),
  );
  const j = parseJsonObject(raw);
  if (!j) return { ok: true, reason: "" };
  return { ok: j.ok !== false, reason: String(j.reason || "") };
}

export async function acceptAfterGenerate(params: {
  plan?: CyclePlan | null;
  userText: string;
  imageCount: number;
  error?: string;
}): Promise<{ ok: boolean; retryGenerate: boolean; restartSkill: boolean; reason: string }> {
  if (params.error) return { ok: false, retryGenerate: true, restartSkill: false, reason: params.error };
  if (!params.imageCount) return { ok: false, retryGenerate: true, restartSkill: false, reason: "没有生成结果" };
  const raw = await llmText(
    [
      "对照计划做交付验收。只输出 JSON：ok, retryGenerate, restartSkill, reason",
      "restartSkill=true 仅当成品品类完全错了。画偏但品类对则 retryGenerate=true。",
      `计划：${params.plan ? JSON.stringify(params.plan) : "无"}`,
      `用户信息：${params.userText}`,
      `生成数量：${params.imageCount}`,
    ].join("\n"),
  );
  const j = parseJsonObject(raw);
  if (!j) return { ok: true, retryGenerate: false, restartSkill: false, reason: "" };
  return {
    ok: j.ok !== false,
    retryGenerate: j.retryGenerate === true,
    restartSkill: j.restartSkill === true,
    reason: String(j.reason || ""),
  };
}

export function parseStoredPlan(raw?: string): CyclePlan | null {
  if (!raw?.trim()) return null;
  try {
    const j = JSON.parse(raw) as CyclePlan;
    if (!j || typeof j !== "object") return null;
    return j;
  } catch {
    return null;
  }
}

export function applyCycleToHit(hit: HarnessSkillItem | undefined, bundle: CycleBundle): HarnessSkillItem | undefined {
  const code = bundle.plan.skillCode;
  if (!code) return hit;
  const alt = skillCatalog().find((s) => s.code === code || s.id === code);
  return alt || hit;
}

const BANNED_DEMO = ["山间纪", "慢时光", "稻小金", "萧山萝卜干", "云间茶舍", "稻香小馆", "山间茶叙"];
const POSTER_TROPES = /竖排主标题|画面大字|横标「|油纸伞|红木条案|青衣女子|石桥流水|灯笼暖光/;

function quizSkillKind(skillName?: string, skillId?: string): string {
  const s = `${skillName || ""} ${skillId || ""}`.toLowerCase();
  if (/logo|标志|商标/.test(s)) return "logo";
  if (/\bip\b|吉祥物/.test(s)) return "ip";
  if (/海报|物料|活动|包装|event/.test(s)) return "event";
  if (/商拍|商品|product/.test(s)) return "product";
  if (/店招|门头|signage/.test(s)) return "signage";
  if (/字体|艺术字|font/.test(s)) return "font";
  if (/视频|成片|oneline|数字人|avatar|大片|studio/.test(s)) return "video";
  if (/文案|公众号|社媒|content/.test(s)) return "content";
  if (/调研|research/.test(s)) return "research";
  return "";
}

function fieldExampleRule(kind: string, key: string): string {
  if (key === "creativeDesc") {
    if (kind === "logo") {
      return "Logo 创意描述：只写标志怎么构成（图形元素、汉字/字母、徽章或负形），18～48 字。禁止人物场景、海报标题墙、条案折扇灯笼。";
    }
    if (kind === "ip") {
      return "IP 创意描述：写角色外形（五官、服饰、体态），18～48 字。禁止写成节庆海报大场景。";
    }
    if (kind === "product") {
      return "商拍创意描述：写商品摆法、台面与光线，18～60 字。";
    }
    if (kind === "signage") {
      return "店招创意描述：写店名排法、招牌材质与装饰，18～48 字。";
    }
    if (kind === "video") {
      return "成片描述：写镜头里谁在哪做什么、光线与运动，24～80 字。";
    }
    if (kind === "event") {
      return "海报画面描述：主体、画面上的文案原文、氛围光影，36～80 字。三条构图要有区分。";
    }
    return "按当前 Skill 写可点选的具体描述，必须和该功能相关，不要套用无关海报场景。";
  }
  if (key === "brandName" || key === "shopName" || key === "productName") return "2～6 个字的名称。";
  if (key === "fontText") return "要写成艺术字的短词，2～8 字。";
  if (key === "topic" || key === "slogan") {
    if (kind === "content") return "社媒/文案题目或口号，不超过 16 字。";
    if (kind === "video") return "短视频主题短句，不超过 16 字。";
    return "短句即可，不超过 16 字。";
  }
  if (key === "brandDesc") return "品牌气质一句话，不超过 20 字。";
  return "贴合该 Skill 的可点选例子。";
}

function extractMentionedName(text: string): string {
  const quoted = text.match(/[「『""]([^」』""]{1,12})[」』""]/);
  if (quoted?.[1]) return quoted[1].trim();
  const named = text.match(/(?:叫|名为|名字是|品牌(?:名称|名)?(?:是|叫)?)\s*([^\s，。,.！？]{1,12})/);
  if (named?.[1] && !/^(一个|一张|logo|标志|ip|海报)/i.test(named[1])) return named[1].trim();
  return "";
}

function hashPick<T>(text: string, pool: T[]): T {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

function fallbackQuizSamples(key: string, userText: string, extracted: string, kind = ""): string[] {
  const nameSets = [
    ["青禾", "林间造", "拾味"],
    ["云上集", "野步", "禾盏"],
    ["小满季", "青箬", "涧南"],
  ];
  const names = extracted ? [extracted, ...hashPick(userText, nameSets).filter((n) => n !== extracted)].slice(0, 3) : hashPick(userText, nameSets);
  if (key === "brandName" || key === "shopName" || key === "productName") return names;
  if (key === "fontText") return extracted ? [extracted, ...names.slice(0, 2)] : names;
  if (key === "brandDesc") {
    return ["手作好物，节奏慢一点", "产地直达，适合送礼", "自然健康，日常能用"];
  }
  if (key === "creativeDesc") {
    if (kind === "logo") {
      return [
        "茶叶芽与远山咬合成圆形徽章，中心放品牌汉字，线条干净",
        "品牌名首字做几何负形，配细线字母，适合方形头像",
        "手写感汉字居中，下方细字拼音，留白充足像印章",
      ];
    }
    if (kind === "ip") {
      return ["拟人化金色稻穗，圆眼憨笑，汉服马甲", "戴斗笠的果灵，紫红配色圆润", "小熊猫文创形象，围巾与笑眼"];
    }
    if (kind === "product") {
      return ["白底静物光，商品居中，材质纹理清晰", "原木台面斜侧光，一份包装打开", "窗边柔光特写，水珠与标签可读"];
    }
    if (kind === "signage") {
      return ["店名横排大字清晰，木质底金字", "墨色匾额竖排店名，两侧灯笼点缀", "极简通栏，店名居中配一行细字口号"];
    }
    if (kind === "video") {
      return ["茶园晨雾中采茶，镜头缓推", "包装开箱特写，手部动作慢而清晰", "古镇夜市烟火，固定机位看人流"];
    }
    return [
      "近处红木条案上放青瓷与折扇，右上竖排主标题「四季山居」，灯笼暖光、朱红印章，国潮留白",
      "青衣女子立于竹林，油纸伞斜倚肩头，画面大字「春来正好」，薄雾与暖金轮廓光，节庆而不喧闹",
      "石桥流水、远处飞檐，前景茶摊热气升腾，横标「山城夜话」，灯火暖黄，国风夜市气息",
    ];
  }
  if (key === "topic" || key === "slogan") {
    return ["产地新鲜到家", "今日时令，刚刚采下", "把山里的味道带回来"];
  }
  return names;
}

function cleanQuizSamples(raw: string[], userText: string, extracted: string, key = "", kind = ""): string[] {
  const allowBanned = BANNED_DEMO.filter((n) => userText.includes(n));
  const poster = kind === "event" && key === "creativeDesc";
  const maxLen = poster ? 90 : key === "creativeDesc" ? 56 : 36;
  const minLen = poster ? 18 : key === "creativeDesc" ? 10 : 0;
  const out: string[] = [];
  if (extracted && !poster && (key === "brandName" || key === "shopName" || key === "productName" || key === "fontText")) {
    out.push(extracted);
  }
  for (const item of raw) {
    const t = item.replace(/^[\s\-•\d.、]+/, "").trim();
    if (!t || t.length > maxLen || t.length < minLen) continue;
    if (BANNED_DEMO.includes(t) && !allowBanned.includes(t)) continue;
    if (kind && kind !== "event" && key === "creativeDesc" && POSTER_TROPES.test(t)) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= 3) break;
  }
  return out.slice(0, 3);
}

/** 按用户原话 + Skill 现写问卷例子，不复用演示品牌名。 */
export async function generateQuizExamples(params: {
  userText: string;
  skillName?: string;
  skillId?: string;
  ragBrief?: string;
  webBrief?: string;
  fields: { key: string; label: string; ask: string }[];
}): Promise<Record<string, string[]>> {
  const extracted = extractMentionedName(params.userText);
  const kind = quizSkillKind(params.skillName, params.skillId);
  const empty: Record<string, string[]> = {};
  if (!params.fields.length) return empty;
  const fieldRules = params.fields.map((f) => `${f.key}（${f.label}）：${fieldExampleRule(kind, f.key)}`).join("\n");
  const raw = await llmText(
    [
      "为问卷每道开放题写 3 个可点选的中文例子。只输出一个 JSON 对象，key 必须是字段名，value 是字符串数组。",
      "例子必须贴合用户原话和当前 Skill，像真实可选方案，不要解释。",
      kind ? `当前功能是「${params.skillName || kind}」，例子必须和这个功能相关，禁止拿别的功能的场景来凑。` : "",
      "禁止使用这些演示名（除非用户自己写了）：" + BANNED_DEMO.join("、"),
      extracted ? `用户已点名「${extracted}」，品牌名/店名/商品名/文字内容的第一项必须就是它。` : "用户没点名时再新造，不要抄知识库特产名。",
      fieldRules,
      `Skill：${params.skillName || ""} ${params.skillId || ""}`,
      `RAG（只借气质）：${(params.ragBrief || "无").slice(0, 240)}`,
      `联网：${(params.webBrief || "无").slice(0, 160)}`,
      `用户原话：${params.userText}`,
      `字段：${JSON.stringify(params.fields)}`,
    ].filter(Boolean).join("\n"),
  );
  const j = parseJsonObject(raw);
  const out: Record<string, string[]> = {};
  for (const f of params.fields) {
    const arr = j && Array.isArray(j[f.key]) ? (j[f.key] as unknown[]).map((x) => String(x || "")) : [];
    const cleaned = cleanQuizSamples(arr, params.userText, extracted, f.key, kind);
    out[f.key] = cleaned.length ? cleaned : fallbackQuizSamples(f.key, params.userText, extracted, kind);
  }
  return out;
}
