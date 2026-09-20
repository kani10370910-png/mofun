import type { ResearchType } from "@/lib/types";
import type { IndustryResearchFocus } from "@/lib/agent/skills/prompts/industryResearch";

/* ---------- 市场调研：3 个功能 ---------- */
export const researchTypes: ResearchType[] = [
  { key: "brand", ico: "", name: "品牌市场调研", desc: "品牌认知、竞品对比与市场定位分析" },
  {
    key: "industry",
    ico: "",
    name: "产业调研",
    desc: "产业投资分析、市场规模测算、竞争格局与定价研究（数据可溯源）",
  },
  { key: "hotsale", ico: "", name: "爆款分析", desc: "热销品类、爆款要素与选品建议" },
];

export type ResearchInspiration = {
  id: string;
  title: string;
  date: string;
  tag: "品牌调研" | "产业调研" | "爆款分析";
  mode: "brand" | "industry" | "hotsale";
  /** 套用到左侧表单的主题 */
  topic: string;
  focus?: IndustryResearchFocus;
  summary: string;
  body: string;
};

/** 参考灵感（按调研模式筛选） */
export const researchInspirations: ResearchInspiration[] = [];
