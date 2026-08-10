/**
 * 产业调研专家 Skill 提示词
 * 来源：产品调研专家SKILL.md（industry-research-expert）
 */
import type { GenerateRequest } from "@/lib/types";

export type IndustryResearchFocus =
  | "full-report"
  | "tam-sam-som"
  | "competitive"
  | "pricing";

export const INDUSTRY_FOCUS_OPTIONS: { key: IndustryResearchFocus; label: string; hint: string }[] = [
  { key: "full-report", label: "完整投资分析报告", hint: "宏观/成本/SWOT/路线图九模块" },
  { key: "tam-sam-som", label: "市场规模测算", hint: "TAM / SAM / SOM" },
  { key: "competitive", label: "竞争格局分析", hint: "竞品定位与空白市场" },
  { key: "pricing", label: "定价敏感度分析", hint: "Van Westendorp 四问" },
];

export function detectIndustryFocus(raw?: string): IndustryResearchFocus {
  const t = (raw || "").toLowerCase();
  if (/tam|sam|som|市场规模|体量测算|市场测算/.test(t)) return "tam-sam-som";
  if (/竞争|竞品|格局|定位图|蓝海|空白市场/.test(t)) return "competitive";
  if (/定价|价格敏感|van\s*westendorp|价格带|opp/.test(t)) return "pricing";
  if (/投资分析|可行性|全链路|完整报告|产业报告/.test(t)) return "full-report";
  return "full-report";
}

const DATA_DISCIPLINE = [
  "【数据纪律】",
  "1. 数据、政策名、统计须有可核验公开来源；禁止编造 URL、报告名、政策文号或数字。",
  "2. 找不到可靠来源时，正文标注「(公开数据暂缺)」，不得伪造参考文献条目。",
  "3. 关键数据（产值、市场规模、核心指标）尽量用 2+ 独立来源交叉验证；冲突时写明区间与取舍理由。",
  "4. 正文事实数据用 [N] 标注；文末「参考文献」只列正文引用过的真实来源（可写「公开统计口径/行业协会/政策原文」类可核查描述；无真实 URL 时写「来源类型 + 名称」，勿编造链接）。",
  "5. 报告日期使用当前真实日期，禁止示例日期。",
].join("\n");

const SYSTEM_BASE =
  "你是「产业调研专家」（Industry Research Expert），为农文旅及一二三产提供可落地的产业分析与投资决策支持。" +
  "覆盖：一产（农林牧渔）、二产（采矿/制造/建筑/能源）、三产（零售/餐饮/文旅/物流/IT/金融等）。" +
  "按用户产业自动切换指标、政策框架与风险画像。输出 Markdown 正文，不要寒暄与前置解释。" +
  DATA_DISCIPLINE;

function fullReportUser(topic: string, span: string, region?: string): string {
  return [
    `产业主题：${topic}`,
    region ? `聚焦地区：${region}` : "",
    `时间跨度：${span}`,
    "",
    "请输出【完整产业投资分析报告】，结构如下（总篇幅约 3500–4500 字，References 另计；各模块可 ±15%）：",
    "1) 执行摘要（约 300 字）",
    "2) 产业背景（约 400 字，含历史/起源 ≥300 字）",
    "3) 宏观数据与政策（约 800 字，数据须引用）",
    "4) 成本收益结构（约 600 字，小规模 vs 大规模双情景）",
    "5) 政策与可用资源（约 400 字）",
    "6) SWOT + 战略模式选择（约 600 字）",
    "7) 实施路线图 + 风险预案（约 600 字）",
    "8) 对标案例对比（约 300 字）",
    "9) 参考文献（强制，列正文已引用的来源）",
    "",
    "要求：结论可执行；适配区县农文旅语境时可结合本地产业链；禁止假装已检索未给出的网页。",
  ]
    .filter(Boolean)
    .join("\n");
}

function tamUser(topic: string, span: string, region?: string): string {
  return [
    `产业/产品：${topic}`,
    region ? `地理范围：${region}` : "",
    `时间视界：${span}`,
    "",
    "请输出【TAM / SAM / SOM 市场规模测算】：",
    "1) 市场边界定义（产品、地理、客群、时间）",
    "2) TAM（自上而下宏观产业数据）",
    "3) SAM（地理/渠道/产品约束后）",
    "4) SOM（竞争与营销预算，1–3 年）",
    "5) 自下而上校验（客单价 × 预期客户）；若与自上而下差距 >3 倍，重估假设并说明",
    "6) 关键假设与数据缺口",
    "7) 参考文献",
  ]
    .filter(Boolean)
    .join("\n");
}

function competitiveUser(topic: string, span: string, region?: string): string {
  return [
    `分析对象：${topic}`,
    region ? `市场区域：${region}` : "",
    `时间跨度：${span}`,
    "",
    "请输出【竞争格局分析】：",
    "1) 竞争者识别（直接、间接、替代、潜在进入者）",
    "2) 多维情报（公开定价、用户口碑、融资/估值线索、核心功能或产品能力）",
    "3) 定位图说明（如「价格 vs 功能复杂度」），指出市场空白/蓝海机会",
    "4) 对本品类/本地品牌的可执行卡位建议",
    "5) 参考文献",
  ]
    .filter(Boolean)
    .join("\n");
}

function pricingUser(topic: string, span: string, region?: string): string {
  return [
    `产品/品类：${topic}`,
    region ? `目标市场：${region}` : "",
    `参考周期：${span}`,
    "",
    "请输出【Van Westendorp 定价敏感度分析】框架与结论建议：",
    "1) 四问设计：Too Expensive / Too Cheap / Expensive(High Side) / Cheap(Good Value)",
    "2) 结合品类与客群，给出合理价格锚点区间判断（标明假设）",
    "3) 识别 OPP（最优价格点）与可接受价格带",
    "4) 对区县农文旅/消费品的定价落地建议",
    "5) 数据缺口与校验方式",
    "6) 参考文献",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 组装 research-industry 的 chat messages */
export function buildIndustryResearchMessages(req: GenerateRequest): { role: "system" | "user"; content: string }[] {
  const focus = detectIndustryFocus([req.styleHint, req.keywords, req.input].filter(Boolean).join(" "));
  const topic = req.input?.trim() || "（未填写产业主题）";
  const span = req.length?.trim() || "近一年数据";
  // 允许 input 多行：第一行主题，后续「地区：xxx」
  const lines = topic.split(/\n/).map((s) => s.trim()).filter(Boolean);
  const main = lines[0] || topic;
  const regionLine = lines.find((l) => /^地区[:：]/.test(l));
  const region = regionLine?.replace(/^地区[:：]\s*/, "") || req.county?.trim() || undefined;

  let user = "";
  if (focus === "tam-sam-som") user = tamUser(main, span, region);
  else if (focus === "competitive") user = competitiveUser(main, span, region);
  else if (focus === "pricing") user = pricingUser(main, span, region);
  else user = fullReportUser(main, span, region);

  return [
    { role: "system", content: SYSTEM_BASE },
    { role: "user", content: user },
  ];
}
