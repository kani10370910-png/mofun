"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { EditorRail } from "@/components/ui/EditorRail";
import { useToast } from "@/components/ui/Toast";
import { useGenerateStream } from "@/lib/useGenerateStream";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import { contentScenes, planHistory } from "@/data/content";
import { CONTENT_ICON } from "@/data/icons";
import type { IconName } from "@/data/icons";
import type { ContentSceneKey, GenerateRequest } from "@/lib/types";
import {
  BrandPromotionPanel,
  ContentSocialPanel,
  OfficialAccountPanel,
  initBrandPromotionForm,
  initOfficialForm,
  initSocialForm,
  type BrandPromotionFormState,
  type OfficialFormState,
  type SocialFormState,
} from "./ContentForms";
import { ContentResult } from "./ContentResult";
import { OfficialResult } from "./OfficialResult";
import { SocialPlanResult, parseSocialPlan, type ParsedSocialPlan } from "./SocialPlanResult";
import {
  addOfficialArticle,
  loadOfficialArticles,
  saveOfficialArticles,
  type OfficialArticle,
} from "@/lib/officialArticlesStorage";
import { stripOfficialMarkdown } from "@/lib/agent/skills/prompts/officialArticle";

const iconOf = (k: string): IconName => CONTENT_ICON[k] ?? "content";

function buildPlanFallback(opts: {
  product: string;
  advantage?: string;
  audience?: string;
  platforms: string[];
  raw: string;
}): ParsedSocialPlan {
  const lines = (opts.raw || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const shortLines = lines.filter((s) => s.length <= 32);
  const titles = (shortLines.length ? shortLines : lines).slice(0, 3);
  const tags = Array.from(new Set((opts.raw.match(/#[^\s#，。！？!?,]{2,18}/g) || []).slice(0, 5)));
  const body = lines.join("\n");
  const highlights: { tag: string; text: string }[] = [];
  if (opts.advantage?.trim()) highlights.push({ tag: "产品卖点", text: opts.advantage.trim() });
  if (opts.audience?.trim()) highlights.push({ tag: "目标人群", text: `适配${opts.audience.trim()}场景传播` });
  if (highlights.length === 0) highlights.push({ tag: "核心传播", text: "突出产地、口感与购买理由，提升转化。" });

  const posts: ParsedSocialPlan["posts"] = {};
  if (opts.platforms.includes("微信朋友圈")) posts.wechat = { body: body || "朋友圈文案生成中，请重试一次。" };
  if (opts.platforms.includes("小红书"))
    posts.xhs = { title: titles[0] || `${opts.product}种草推荐`, body: body || `${opts.product}值得入手`, tags };
  if (opts.platforms.includes("抖音"))
    posts.douyin = { title: titles[0] || `${opts.product}爆款脚本`, body: body || `${opts.product}口播脚本`, tags };
  if (opts.platforms.includes("微信公众号"))
    posts.official = { title: titles[0] || `${opts.product}推广稿`, body: body || `${opts.product}推广内容` };

  return {
    product: opts.product,
    titles: titles.length ? titles : [`${opts.product}推广策划`, `${opts.product}传播文案`, `${opts.product}种草方向`],
    highlights,
    posts,
  };
}

export function ContentEditor({
  initialSub,
  initialInput,
  initialProduct,
  initialBrand,
  initialAudience,
  initialAdvantage,
  initialKeywords,
  initialTitle,
  initialPlatforms,
}: {
  initialSub?: string;
  initialInput?: string;
  initialProduct?: string;
  initialBrand?: string;
  initialAudience?: string;
  initialAdvantage?: string;
  initialKeywords?: string;
  initialTitle?: string;
  initialPlatforms?: string;
}) {
  const toast = useToast();
  const { state, generate, stop, reset } = useGenerateStream();
  const { addWork } = useLibrary();

  const [active, setActive] = useState<ContentSceneKey>(
    (contentScenes.find((s) => s.key === initialSub)?.key as ContentSceneKey) ?? contentScenes[0].key
  );
  const scene = contentScenes.find((s) => s.key === active) ?? contentScenes[0];

  const seedPlats = (initialPlatforms || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const [officialForm, setOfficialForm] = useState<OfficialFormState>(() => {
    const f = initOfficialForm(
      initialSub === "official" ? initialTitle || initialInput || "" : ""
    );
    if (initialSub === "official" && initialKeywords) f.keywords = initialKeywords;
    return f;
  });
  const [socialForm, setSocialForm] = useState<SocialFormState>(() => {
    const f = initSocialForm(initialProduct || "");
    if (initialBrand) f.brand = initialBrand;
    if (initialAudience) f.audience = initialAudience;
    if (initialAdvantage) f.advantage = initialAdvantage;
    if (seedPlats.length) f.platforms = seedPlats;
    return f;
  });
  const [brandForm, setBrandForm] = useState<BrandPromotionFormState>(() => {
    const f = initBrandPromotionForm(initialSub === "brand" ? initialProduct || "" : "");
    if (initialSub === "brand") {
      if (initialBrand) f.brand = initialBrand;
      if (initialAudience) f.audience = initialAudience;
      if (initialAdvantage) f.advantage = initialAdvantage;
      if (initialInput) f.goal = initialInput;
      if (seedPlats.length) f.platforms = seedPlats;
    }
    return f;
  });

  const [mode, setMode] = useState<"none" | "official" | "social" | "brand">("none");
  const [topTab, setTopTab] = useState<"history" | "inspiration">("history");
  const [socialPlan, setSocialPlan] = useState<ParsedSocialPlan | null>(null);
  const [socialFallback, setSocialFallback] = useState("");
  const [posterLoading, setPosterLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [officialArticles, setOfficialArticles] = useState<OfficialArticle[]>(() =>
    typeof window === "undefined" ? [] : loadOfficialArticles()
  );
  const [viewedOfficial, setViewedOfficial] = useState<OfficialArticle | null>(null);

  function switchScene(key: string) {
    setActive(key as ContentSceneKey);
    setTopTab("history");
    setMode("none");
    setSocialPlan(null);
    setSocialFallback("");
    setViewedOfficial(null);
    reset();
  }

  function buildBrandReq(extra?: Partial<GenerateRequest>): GenerateRequest {
    const outlineParts = brandForm.platforms
      .map((name) => {
        const o = brandForm.outlines[name];
        if (!o) return "";
        const bits = [o.title && `主标题：${o.title}`, o.subtitle && `副标题：${o.subtitle}`, o.keywords && `关键词：${o.keywords}`]
          .filter(Boolean)
          .join("；");
        return bits ? `【${name}】${bits}` : "";
      })
      .filter(Boolean)
      .join("\n");

    return {
      scene: "brand",
      product: brandForm.product.trim(),
      brand: brandForm.brand.trim(),
      audience: brandForm.audience.trim(),
      advantage: brandForm.advantage.trim(),
      platforms: brandForm.platforms,
      outline: outlineParts || undefined,
      input: brandForm.goal.trim() || undefined,
      ...extra,
    };
  }

  async function genBrand() {
    if (!brandForm.product.trim()) {
      toast("请填写品牌名称及产品类型！", "warn");
      return;
    }
    if (!brandForm.audience.trim()) {
      toast("请填写目标市场/人群！", "warn");
      return;
    }
    if (!brandForm.advantage.trim()) {
      toast("请填写产品核心优势！", "warn");
      return;
    }
    if (brandForm.platforms.length === 0) {
      toast("请至少选择一个推广平台！", "warn");
      return;
    }
    setMode("brand");
    setSocialPlan(null);
    setSocialFallback("");

    const full = await generate(buildBrandReq());
    const parsed = parseSocialPlan(full, brandForm.product);
    if (parsed) setSocialPlan(parsed);
    else setSocialPlan(buildPlanFallback({
      product: brandForm.product.trim(),
      advantage: brandForm.advantage,
      audience: brandForm.audience,
      platforms: brandForm.platforms,
      raw: full,
    }));
    setSocialFallback(full);
    if (full.trim()) {
      addWork({
        emoji: "✨",
        grad: "thumb-grad-6",
        kind: "文案",
        name: `${brandForm.product.trim().slice(0, 12) || "品牌推广"} · 策划方案`,
        sub: "内容创作 · 品牌推广",
        time: nowStamp(),
        edit: { sub: "brand", product: brandForm.product, brand: brandForm.brand, advantage: brandForm.advantage },
      });
      toast("策划方案已生成并存入「我的作品」");
    }
  }

  async function genOfficial() {
    if (!officialForm.title.trim()) {
      toast("请填写文章标题！", "warn");
      return;
    }
    if (!officialForm.keywords.trim()) {
      toast("请填写核心关键词！", "warn");
      return;
    }
    if (officialForm.style === "自定义" && !officialForm.customStyle.trim()) {
      toast("请填写自定义风格说明！", "warn");
      return;
    }
    setMode("official");
    setViewedOfficial(null);
    const tone =
      officialForm.style === "自定义"
        ? "自定义"
        : officialForm.style;
    const req: GenerateRequest = {
      scene: "official",
      title: officialForm.title.trim(),
      keywords: officialForm.keywords.trim(),
      outline: officialForm.outline.trim() || undefined,
      length: officialForm.length,
      tone,
      styleHint: officialForm.style === "自定义" ? officialForm.customStyle.trim() : undefined,
      input: `${officialForm.title.trim()}｜${officialForm.keywords.trim()}`,
    };
    const full = stripOfficialMarkdown(await generate(req));
    if (!full.trim()) return;
    const row: OfficialArticle = {
      id: "oa-" + Date.now(),
      title: officialForm.title.trim(),
      keywords: officialForm.keywords.trim(),
      text: full,
      time: nowStamp(),
      length: officialForm.length,
      style: officialForm.style,
    };
    setOfficialArticles(addOfficialArticle(row));
    addWork({
      emoji: "📰",
      grad: "thumb-grad-6",
      kind: "文案",
      name: `${row.title.slice(0, 12)}${row.title.length > 12 ? "…" : ""}`,
      sub: "内容创作 · 公众号帮写",
      time: row.time,
      edit: { sub: "official", input: row.title },
    });
    toast("文章已生成并存入「我的作品」");
  }

  async function genSocial() {
    if (!socialForm.product.trim()) {
      toast("请填写产品名！", "warn");
      return;
    }
    if (!socialForm.audience.trim()) {
      toast("请选择目标人群！", "warn");
      return;
    }
    if (socialForm.audience === "自定义" && !socialForm.customAudience.trim()) {
      toast("请填写自定义目标人群描述！", "warn");
      return;
    }
    if (socialForm.platforms.length === 0) {
      toast("请至少选择一个推广平台！", "warn");
      return;
    }
    setMode("social");
    setSocialPlan(null);
    setSocialFallback("");

    const outlineParts = socialForm.platforms
      .map((name) => {
        const o = socialForm.outlines?.[name];
        if (!o) return "";
        const bits = [o.title && `主标题：${o.title}`, o.subtitle && `副标题：${o.subtitle}`, o.keywords && `关键词：${o.keywords}`]
          .filter(Boolean)
          .join("；");
        return bits ? `【${name}】${bits}` : "";
      })
      .filter(Boolean)
      .join("\n");

    const audienceValue =
      socialForm.audience === "自定义"
        ? socialForm.customAudience.trim()
        : socialForm.audience.trim();

    const req: GenerateRequest = {
      scene: "social",
      product: socialForm.product.trim(),
      brand: socialForm.brand.trim(),
      audience: audienceValue,
      advantage: socialForm.advantage.trim(),
      platforms: socialForm.platforms,
      outline: outlineParts || undefined,
      input: socialForm.product.trim(),
    };
    const full = await generate(req);
    const parsed = parseSocialPlan(full, socialForm.product);
    if (parsed) setSocialPlan(parsed);
    else
      setSocialPlan(
        buildPlanFallback({
          product: socialForm.product.trim(),
          advantage: socialForm.advantage,
          audience: audienceValue,
          platforms: socialForm.platforms,
          raw: full,
        }),
      );
    setSocialFallback(full);
    if (full.trim()) {
      addWork({
        emoji: "📕",
        grad: "thumb-grad-2",
        kind: "文案",
        name: `${socialForm.product.trim().slice(0, 12) || "社媒推文"} · 推广文案`,
        sub: "内容创作 · 社媒推文",
        time: nowStamp(),
        edit: { sub: "social", product: socialForm.product, brand: socialForm.brand, advantage: socialForm.advantage },
      });
      toast("推广文案已生成并存入「我的作品」");
    }
  }

  async function genPosterByModel(picked: { title: string; highlights: string[] }) {
    if (posterLoading) return;
    const isBrandMode = mode === "brand";
    const product = (isBrandMode ? brandForm.product : socialForm.product).trim() || socialPlan?.product || "产品";
    const brand = (isBrandMode ? brandForm.brand : socialForm.brand).trim();
    const audience = (
      isBrandMode
        ? brandForm.audience
        : socialForm.audience === "自定义"
          ? socialForm.customAudience
          : socialForm.audience
    ).trim();
    const advantage = (isBrandMode ? brandForm.advantage : socialForm.advantage).trim();
    const prompt =
      `电商营销海报设计，主题：${product}${brand ? `，品牌：${brand}` : ""}。` +
      `主标题：${picked.title}。` +
      (picked.highlights.length ? `亮点：${picked.highlights.join("；")}。` : "") +
      (audience ? `目标人群：${audience}。` : "") +
      (advantage ? `产品优势：${advantage}。` : "") +
      "版式要求：竖版海报，主标题大字清晰可读，信息层级明确，视觉聚焦产品卖点，商业广告风格，高清细节，无乱码。";

    setPosterLoading(true);
    try {
      const r = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          size: "2048x2048",
          n: 1,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { images?: string[]; error?: string };
      const img = j.images?.[0];
      if (!r.ok || !img) {
        toast(j.error || "海报生成失败，请稍后重试", "warn");
        throw new Error("poster-generate-failed");
      }
      addWork({
        emoji: "图",
        grad: "thumb-grad-5",
        kind: "图片",
        name: `${product.slice(0, 12)}${product.length > 12 ? "…" : ""} · 推广海报`,
        sub: "内容创作 · 社媒推文",
        img,
        time: nowStamp(),
      });
      toast("推广海报已生成，可在下方预览，并已存入「仓库」");
      return img;
    } finally {
      setPosterLoading(false);
    }
  }

  async function genImageByModel(picked: { platform: string; text: string }) {
    if (imageLoading) return;
    const isBrandMode = mode === "brand";
    const product = (isBrandMode ? brandForm.product : socialForm.product).trim() || socialPlan?.product || "产品";
    const brand = (isBrandMode ? brandForm.brand : socialForm.brand).trim();
    const audience = (
      isBrandMode
        ? brandForm.audience
        : socialForm.audience === "自定义"
          ? socialForm.customAudience
          : socialForm.audience
    ).trim();
    const advantage = (isBrandMode ? brandForm.advantage : socialForm.advantage).trim();
    const copyBrief = picked.text.replace(/\s+/g, " ").slice(0, 220);
    const prompt =
      `农文旅特产社媒配图，真实可感的产品/场景摄影风，主题：${product}` +
      `${brand ? `，品牌：${brand}` : ""}。` +
      `发布平台：${picked.platform}。` +
      (audience ? `目标人群：${audience}。` : "") +
      (advantage ? `产品卖点：${advantage}。` : "") +
      `文案氛围参考：${copyBrief}。` +
      "画面要求：突出产品质感与产地氛围，构图干净，光线自然，适合手机信息流，高清细节；" +
      "不要大段文字、不要水印、不要乱码字母，可有少量点缀感中文标题字（≤6字）或完全无字。";

    setImageLoading(true);
    try {
      const r = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          size: "2048x2048",
          n: 1,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { images?: string[]; error?: string };
      const img = j.images?.[0];
      if (!r.ok || !img) {
        toast(j.error || "配图生成失败，请稍后重试", "warn");
        throw new Error("image-generate-failed");
      }
      addWork({
        emoji: "图",
        grad: "thumb-grad-4",
        kind: "图片",
        name: `${product.slice(0, 12)}${product.length > 12 ? "…" : ""} · ${picked.platform}配图`,
        sub: "内容创作 · 社媒推文",
        img,
        time: nowStamp(),
      });
      toast("配图已生成，可在文案区下方预览，并已存入「仓库」");
      return img;
    } finally {
      setImageLoading(false);
    }
  }

  const panel =
    active === "social" ? (
      <ContentSocialPanel state={socialForm} setState={setSocialForm} onGenerate={genSocial} loading={state.loading} />
    ) : active === "official" ? (
      <OfficialAccountPanel
        state={officialForm}
        setState={setOfficialForm}
        onGenerate={genOfficial}
        loading={state.loading}
      />
    ) : (
      <BrandPromotionPanel state={brandForm} setState={setBrandForm} onGenerate={genBrand} loading={state.loading} />
    );

  const showPlan = mode === "social" || mode === "brand";
  const officialText = stripOfficialMarkdown(
    viewedOfficial?.text ?? (mode === "official" ? state.text : "")
  );
  const officialLoading = mode === "official" && state.loading && !viewedOfficial;
  const officialTitle = viewedOfficial?.title ?? officialForm.title;
  const socialInspiration = planHistory.slice(0, 8);

  return (
    <div className="page">
      <div className="editor-layout">
        <EditorRail items={contentScenes} activeKey={active} iconOf={iconOf} onPick={switchScene} />
        <div className="workspace">
          <div className="ws-panel sticky">{panel}</div>

          <div id="cResult">
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
              active === "social" ? (
                <div className="ph-grid">
                  {socialInspiration.map((row) => (
                    <button
                      type="button"
                      key={`${row.name}-${row.date}`}
                      className="ph-card"
                      onClick={() => {
                        setSocialForm((prev) => ({
                          ...prev,
                          product: row.name,
                          platforms: row.platforms,
                        }));
                        setTopTab("history");
                        setMode("none");
                        toast(`已套用「${row.name}」灵感，可直接点击生成`);
                      }}
                    >
                      <div className="ph-title">{row.name} 文案策划</div>
                      <div className="ph-plats">
                        {row.platforms.map((p) => (
                          <span key={p} className={`ph-plat ${p.includes("小红书") ? "xhs" : "wechat"}`}>
                            {p}
                          </span>
                        ))}
                      </div>
                      <div className="ph-block">
                        <div className="ph-label">营销主标题</div>
                        <div className="ph-fade">
                          {row.titles.map((t, i) => (
                            <div key={i} className="ph-line">
                              一{t}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="ph-block">
                        <div className="ph-label">神仙级大赏</div>
                        <div className="ph-fade">
                          {row.highlights.map((h, i) => (
                            <div key={i} className="ph-line-sub">
                              {h.tag} / {h.text}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="ph-foot">{row.by} | {row.date}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="preview-empty" style={{ minHeight: 320 }}>
                  <div>
                    <div className="pe-ico">
                      <Icon name="sparkle" size={46} />
                    </div>
                    该功能参考灵感建设中
                    <br />
                    <span style={{ fontSize: 13, color: "var(--c-muted)" }}>先切到「社媒推文」可查看灵感卡片示例</span>
                  </div>
                </div>
              )
            ) : state.error && active !== "official" ? (
              <div className="preview-empty" style={{ minHeight: 300 }}>
                <div>
                  <div className="pe-ico">⚠️</div>
                  {state.error}
                </div>
              </div>
            ) : active === "official" ? (
              <>
                {state.error && (
                  <div className="empty-note" style={{ color: "#c45c26", marginBottom: 10 }}>
                    {state.error}
                  </div>
                )}
                <OfficialResult
                  text={officialText}
                  loading={officialLoading}
                  title={officialTitle}
                  history={officialArticles}
                  onPickHistory={(row) => {
                    setViewedOfficial(row);
                    setMode("official");
                    setOfficialForm((f) => ({
                      ...f,
                      title: row.title,
                      keywords: row.keywords,
                    }));
                  }}
                  onDeleteHistory={(id) => {
                    const next = officialArticles.filter((r) => r.id !== id);
                    setOfficialArticles(next);
                    saveOfficialArticles(next);
                    if (viewedOfficial?.id === id) setViewedOfficial(null);
                  }}
                />
              </>
            ) : mode === "none" ? (
              <div className="preview-empty">
                <div>
                  <div className="pe-ico">
                    <Icon name="content" size={46} />
                  </div>
                  填好左侧需求，点击「生成」
                  <br />
                  AI 将按「{scene.tag}」格式产出
                </div>
              </div>
            ) : showPlan ? (
              socialPlan ? (
                <SocialPlanResult
                  plan={socialPlan}
                  onMakePoster={genPosterByModel}
                  posterLoading={posterLoading}
                  onMakeImage={genImageByModel}
                  imageLoading={imageLoading}
                />
              ) : socialFallback && !state.loading ? (
                <ContentResult scene={scene} text={socialFallback} loading={false} />
              ) : (
                <div className="preview-empty" style={{ minHeight: 300 }}>
                  <div>
                    <div className="pe-ico">
                      <span className="gen-cursor" />
                    </div>
                    {mode === "brand" ? "正在生成品牌策划方案…" : "正在生成推广文案…"}
                  </div>
                </div>
              )
            ) : null}

            {state.loading && (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={stop}>
                  停止生成
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
