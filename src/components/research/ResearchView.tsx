"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { EditorRail } from "@/components/ui/EditorRail";
import { useToast } from "@/components/ui/Toast";
import { useGenerateStream } from "@/lib/useGenerateStream";
import { researchTypes } from "@/data/research";
import { RESEARCH_ICON } from "@/data/icons";
import type { IconName } from "@/data/icons";
import type { GenerateRequest } from "@/lib/types";

type ReportCard = {
  id: string;
  title: string;
  date: string;
  tag: "品牌调研" | "产业调研" | "爆款分析";
};

const REPORTS: ReportCard[] = [
  { id: "r1", title: "2025年第一季度萧山杨梅品牌市场调研", date: "2025-04-15", tag: "品牌调研" },
  { id: "r4", title: "2025年第三季度萧山区冷链产品市场调研", date: "2025-10-08", tag: "品牌调研" },
  { id: "r5", title: "2025年中国茶叶消费人群洞察报告", date: "2025-09-01", tag: "品牌调研" },
  { id: "r7", title: "农产品区域公用品牌建设案例分析", date: "2025-05-12", tag: "品牌调研" },
];

const HOT_REPORTS: ReportCard[] = [
  { id: "h1", title: "阳光玫瑰葡萄电商销售数据与价格监测", date: "2025-08-20", tag: "爆款分析" },
  { id: "h2", title: "2025年春季西湖龙井电商销售趋势分析", date: "2025-04-02", tag: "爆款分析" },
  { id: "h3", title: "临安山核桃全网直播带货数据监测报告", date: "2025-09-15", tag: "爆款分析" },
  { id: "h4", title: "富阳鲜笋生鲜电商评价与复购率分析", date: "2025-03-10", tag: "爆款分析" },
  { id: "h5", title: "特色酱腌菜淘宝天猫大盘数据分析", date: "2025-06-22", tag: "爆款分析" },
];

type ResearchModeKey = "brand" | "industry" | "hotsale";
type RecentByMode = Record<ResearchModeKey, string[]>;
const RECENT_STORAGE_KEY = "mofun_research_recent_v1";
const DEFAULT_RECENT: RecentByMode = {
  brand: ["萧山杨梅", "安吉白茶", "西湖龙井"],
  industry: ["预制菜产业", "茶产业链", "冷链物流"],
  hotsale: ["萧山萝卜干", "安吉白茶", "预制菜产业"],
};

function loadRecentByMode(): RecentByMode {
  if (typeof window === "undefined") return DEFAULT_RECENT;
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return DEFAULT_RECENT;
    const parsed = JSON.parse(raw) as Partial<RecentByMode>;
    return {
      brand: Array.isArray(parsed.brand) && parsed.brand.length ? parsed.brand : DEFAULT_RECENT.brand,
      industry: Array.isArray(parsed.industry) && parsed.industry.length ? parsed.industry : DEFAULT_RECENT.industry,
      hotsale: Array.isArray(parsed.hotsale) && parsed.hotsale.length ? parsed.hotsale : DEFAULT_RECENT.hotsale,
    };
  } catch {
    return DEFAULT_RECENT;
  }
}

function saveRecentByMode(v: RecentByMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(v));
  } catch {
    // ignore storage quota errors
  }
}
const INDUSTRY_REPORTS: ReportCard[] = [
  { id: "i1", title: "2025年上半年区域蔬菜产业链运行分析", date: "2025-07-02", tag: "产业调研" },
  { id: "i2", title: "县域茶产业供需与价格波动调研报告", date: "2025-06-18", tag: "产业调研" },
  { id: "i3", title: "冷链仓配能力对生鲜产业的影响评估", date: "2025-05-27", tag: "产业调研" },
];

export function ResearchView({ initialSub }: { initialSub?: string }) {
  const toast = useToast();
  const { state, generate, stop, reset } = useGenerateStream();
  const [active, setActive] = useState(
    researchTypes.find((t) => t.key === initialSub)?.key ?? researchTypes[0].key
  );
  const [topic, setTopic] = useState("");
  const [timeScope, setTimeScope] = useState("近一年数据 (默认)");
  const [selectedReport, setSelectedReport] = useState<ReportCard | null>(null);
  const [generatedText, setGeneratedText] = useState("");
  const [topTab, setTopTab] = useState<"history" | "inspiration">("history");
  const [recentByMode, setRecentByMode] = useState<RecentByMode>(() => loadRecentByMode());
  const type = researchTypes.find((t) => t.key === active) ?? researchTypes[0];
  const iconOf = (k: string): IconName => RESEARCH_ICON[k] ?? "search";
  const isBrandResearch = active === "brand";
  const isIndustry = active === "industry";
  const isHotsale = active === "hotsale";
  const showList = !selectedReport;
  const showDetail = !!selectedReport;
  const reports = isHotsale ? HOT_REPORTS : isIndustry ? INDUSTRY_REPORTS : REPORTS;
  const modeKey: ResearchModeKey = isHotsale ? "hotsale" : isIndustry ? "industry" : "brand";
  const recentKeywords = recentByMode[modeKey] ?? [];

  function buildResearchReq(): GenerateRequest {
    const scene: GenerateRequest["scene"] = isHotsale
      ? "research-hotsale"
      : isIndustry
        ? "research-industry"
        : "research-brand";
    return {
      scene,
      input: topic.trim(),
      length: timeScope,
      keywords: type.name,
    };
  }

  async function runResearch() {
    if (!topic.trim()) {
      toast(isHotsale ? "请填写商品/产品名称！" : isIndustry ? "请填写产业主题！" : "请填写调研主体名称！", "warn");
      return;
    }
    setTopTab("history");
    setSelectedReport(null);
    setGeneratedText("");
    const full = await generate(buildResearchReq(), (v) => setGeneratedText(v));
    if (!full.trim()) return;
    const currentTopic = topic.trim();
    const nextRecent: RecentByMode = {
      ...recentByMode,
      [modeKey]: [currentTopic, ...(recentByMode[modeKey] || []).filter((k) => k !== currentTopic)].slice(0, 6),
    };
    setRecentByMode(nextRecent);
    saveRecentByMode(nextRecent);
    const row: ReportCard = {
      id: "generated-" + Date.now(),
      title: `${currentTopic.slice(0, 20)}${currentTopic.length > 20 ? "…" : ""}${isHotsale ? " 爆款分析报告" : " 调研报告"}`,
      date: new Date().toISOString().slice(0, 10),
      tag: isHotsale ? "爆款分析" : isIndustry ? "产业调研" : "品牌调研",
    };
    setSelectedReport(row);
    setGeneratedText(full);
    toast("智能调研已完成");
  }

  function pickReport(r: ReportCard) {
    setSelectedReport(r);
    setGeneratedText("");
  }

  return (
    <div className="page">
      <div className="editor-layout">
        <EditorRail items={researchTypes} activeKey={active} iconOf={iconOf} onPick={setActive} />
        <div className="workspace rs-workspace">
          <aside className="rs-left">
            <div className="rs-form">
              <div className="rs-form-main">
              <div className="rs-label">{isHotsale ? "商品/产品名称" : isIndustry ? "产业主题" : "调研主体名称"}</div>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={
                  isHotsale
                    ? "输入商品名称，例如：西湖龙井明前茶..."
                    : isIndustry
                      ? "输入产业方向，例如：预制菜冷链产业..."
                    : "请输入品牌/产品名称，例如：萧山青梅…"
                }
              />
              <div className="rs-label" style={{ marginTop: 14 }}>
                时间跨度
              </div>
              <select value={timeScope} onChange={(e) => setTimeScope(e.target.value)}>
                <option>近一年数据 (默认)</option>
                <option>近三年趋势</option>
                <option>近五年深度</option>
              </select>

              <div className="rs-label" style={{ marginTop: 14 }}>
                最近搜索
              </div>
              <div className="rs-recent">
                {recentKeywords.map((k) => (
                  <button type="button" key={k} className="rs-recent-chip" onClick={() => setTopic(k)}>
                    {k}
                  </button>
                ))}
              </div>
              </div>

              <div className="rs-form-foot">
                <button className="btn btn-primary btn-block rs-run" type="button" disabled={state.loading} onClick={runResearch}>
                  <Icon name="sparkle" size={15} /> {state.loading ? "生成中…" : "开始智能调研"}
                </button>
              </div>
            </div>
          </aside>

          <section id="cResult" className="rs-right">
            <div className="rtop-tabs">
              <button type="button" className={topTab === "history" ? "rtop-tab on" : "rtop-tab"} onClick={() => setTopTab("history")}>
                生成历史
              </button>
              <button
                type="button"
                className={topTab === "inspiration" ? "rtop-tab on" : "rtop-tab"}
                onClick={() => setTopTab("inspiration")}
              >
                参考灵感
              </button>
            </div>
            {topTab === "inspiration" ? (
              <div className="preview-empty" style={{ minHeight: 320 }}>
                <div>
                  <div className="pe-ico">
                    <Icon name="sparkle" size={46} />
                  </div>
                  参考灵感建设中
                  <br />
                  <span style={{ fontSize: 13, color: "var(--c-muted)" }}>后续将展示行业爆款案例、调研模板与方法论</span>
                </div>
              </div>
            ) : showList ? (
              <>
                <div className="rs-grid">
                  {reports.map((r) => (
                    <article key={r.id} className="rs-card" onClick={() => pickReport(r)}>
                      <div className="rs-card-top">
                        <span className={`rs-tag ${r.tag === "产业调研" ? "industry" : r.tag === "爆款分析" ? "hot" : "brand"}`}>{r.tag}</span>
                        <time>{r.date}</time>
                      </div>
                      <h4>{r.title}</h4>
                      <button type="button" className="rs-open">
                        <Icon name="official" size={14} /> 阅读报告
                      </button>
                    </article>
                  ))}
                </div>
              </>
            ) : showDetail ? (
              <>
                <div className="rs-detail-head">
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setSelectedReport(null); reset(); setGeneratedText(""); }}>
                    <Icon name="chevron" size={14} /> 返回报告大厅
                  </button>
                  <div className="rs-export">
                    <button className="btn btn-ghost btn-sm" type="button">
                      <Icon name="copy" size={14} /> 复制
                    </button>
                    <button className="btn btn-ghost btn-sm" type="button">
                      <Icon name="download" size={14} /> 导出 PDF
                    </button>
                    <button className="btn btn-ghost btn-sm" type="button">
                      <Icon name="download" size={14} /> 导出 Word
                    </button>
                  </div>
                </div>
                <div className="rs-detail-body">
                  <h2>{selectedReport.title}</h2>
                  {generatedText ? (
                    <div className="rs-generated">{generatedText}</div>
                  ) : (
                    <>
                      <p>
                        本次调研于 {selectedReport.date} 对「{topic || "萧山杨梅"}」市场与品牌情况展开，重点围绕增长趋势、渠道分布、价格结构与竞品表现给出结论。
                      </p>
                      <h3>2. 核心发现</h3>
                      <h4>产业规模增长</h4>
                      <div className="rs-chart">2020-2025年市场规模趋势（图表）</div>
                      <h4>市场竞争格局</h4>
                      <div className="rs-chart">主要销售渠道占比分布（图表）</div>
                      <h4>价格分析</h4>
                      <div className="rs-chart">核心竞品价格区间对比（图表）</div>
                      <h4>数据来源</h4>
                      <div className="rs-sources">
                        <div>萧山区农业农村局官方数据</div>
                        <div>2024中国农产品品牌洞察白皮书</div>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : null}
            {state.loading && (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={stop}>
                  停止生成
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
