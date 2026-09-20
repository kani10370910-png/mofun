"use client";

import { useEffect, useState } from "react";
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
import {
  addSocialPlan,
  loadSocialPlans,
  removeSocialPlan,
  type SocialPlanHistoryItem,
} from "@/lib/socialPlansStorage";
import { stripOfficialMarkdown } from "@/lib/agent/skills/prompts/officialArticle";
import { RegionEnhanceStrip } from "@/components/image/RegionEnhanceStrip";
import { accountRegionId, imageRequestBody, kbFields, notifyRegionEnhance } from "@/lib/regionEnhance";
import { useAuth } from "@/lib/AuthContext";
import { IDENTITY_EVENT } from "@/lib/identity";
import { useTakeCharge } from "@/lib/chargeGenerate";
import { POINT_COST } from "@/lib/pointCosts";

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
  const { user } = useAuth();
  const takeCharge = useTakeCharge();
  const regionId = accountRegionId(user);
  const [regionEnhance, setRegionEnhance] = useState(true);
  const [useLora, setUseLora] = useState(true);
  const [useKB, setUseKB] = useState(true);

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
  const [socialHistory, setSocialHistory] = useState<SocialPlanHistoryItem[]>(() =>
    typeof window === "undefined" ? [] : loadSocialPlans()
  );
  const [officialArticles, setOfficialArticles] = useState<OfficialArticle[]>(() =>
    typeof window === "undefined" ? [] : loadOfficialArticles()
  );

  useEffect(() => {
    const reload = () => {
      setSocialHistory(loadSocialPlans());
      setOfficialArticles(loadOfficialArticles());
    };
    reload();
    window.addEventListener(IDENTITY_EVENT, reload);
    return () => window.removeEventListener(IDENTITY_EVENT, reload);
  }, [user?.userId, user?.companyId, user?.joinedOrg, user?.enterpriseVerified]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  /** 是否展开查看完整方案：生成后只落历史条目，点击后才打开全部 */
  const [planDetailOpen, setPlanDetailOpen] = useState(false);
  const [posterLoading, setPosterLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [viewedOfficial, setViewedOfficial] = useState<OfficialArticle | null>(null);

  const planKind: "social" | "brand" | null =
    active === "social" ? "social" : active === "brand" ? "brand" : null;
  const sceneHistory = planKind
    ? socialHistory.filter((h) => h.kind === planKind)
    : [];

  function rememberPlan(row: SocialPlanHistoryItem) {
    const next = addSocialPlan(row);
    setSocialHistory(next);
    setActivePlanId(row.id);
    // 生成后只写入一条历史，不自动展开全文
    setSocialPlan(null);
    setSocialFallback("");
    setPlanDetailOpen(false);
  }

  function openHistoryPlan(h: SocialPlanHistoryItem) {
    // 再次点击同一条则收起
    if (planDetailOpen && activePlanId === h.id) {
      setPlanDetailOpen(false);
      setSocialPlan(null);
      setSocialFallback("");
      return;
    }
    setActivePlanId(h.id);
    setSocialPlan(h.plan);
    setSocialFallback(h.raw || "");
    setMode(h.kind);
    setPlanDetailOpen(true);
  }

  function switchScene(key: string) {
    setActive(key as ContentSceneKey);
    setTopTab("history");
    setMode("none");
    setSocialPlan(null);
    setSocialFallback("");
    setActivePlanId(null);
    setPlanDetailOpen(false);
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
      ...kbFields(useKB, regionId),
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
    const charged = takeCharge(POINT_COST.contentBrand, "品牌策划");
    if (!charged.ok) {
      toast(charged.message, "warn");
      return;
    }
    notifyRegionEnhance(toast, { useLora, useKB });
    setMode("brand");
    setSocialPlan(null);
    setSocialFallback("");
    setPlanDetailOpen(false);

    const full = await generate(buildBrandReq());
    const parsed =
      parseSocialPlan(full, brandForm.product) ||
      buildPlanFallback({
        product: brandForm.product.trim(),
        advantage: brandForm.advantage,
        audience: brandForm.audience,
        platforms: brandForm.platforms,
        raw: full,
      });
    setSocialFallback(full);
    if (full.trim()) {
      const time = nowStamp();
      rememberPlan({
        id: `brand-${Date.now()}`,
        kind: "brand",
        product: brandForm.product.trim(),
        title: `${brandForm.product.trim().slice(0, 16) || "品牌推广"} · 策划方案`,
        time,
        plan: parsed,
        raw: full,
        platforms: brandForm.platforms,
        regionEnhance,
        regionId,
      });
      const saved = addWork({
        emoji: "",
        grad: "thumb-grad-6",
        kind: "文案",
        name: `${brandForm.product.trim().slice(0, 12) || "品牌推广"} · 策划方案`,
        sub: "内容创作 · 品牌推广",
        module: "content",
        text: full,
        time,
        edit: { sub: "brand", product: brandForm.product, brand: brandForm.brand, advantage: brandForm.advantage },
      });
      toast(saved.ok ? "策划方案已生成并存入「我的作品」" : "策划方案已生成（仓库写入失败）", saved.ok ? undefined : "warn");
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
    const charged = takeCharge(POINT_COST.contentOfficial, "公众号文章");
    if (!charged.ok) {
      toast(charged.message, "warn");
      return;
    }
    notifyRegionEnhance(toast, { useLora, useKB });
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
      ...kbFields(useKB, regionId),
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
      regionEnhance,
      regionId,
    };
    setOfficialArticles(addOfficialArticle(row));
    const saved = addWork({
      emoji: "",
      grad: "thumb-grad-6",
      kind: "文案",
      name: `${row.title.slice(0, 12)}${row.title.length > 12 ? "…" : ""}`,
      sub: "内容创作 · 公众号帮写",
      module: "content",
      text: full,
      time: row.time,
      edit: { sub: "official", input: row.title },
    });
    toast(saved.ok ? "文章已生成并存入「我的作品」" : "文章已生成（仓库写入失败）", saved.ok ? undefined : "warn");
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
    const charged = takeCharge(POINT_COST.contentSocial, "社媒策划");
    if (!charged.ok) {
      toast(charged.message, "warn");
      return;
    }
    notifyRegionEnhance(toast, { useLora, useKB });
    setMode("social");
    setSocialPlan(null);
    setSocialFallback("");
    setPlanDetailOpen(false);

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
      intent: socialForm.intent,
      hook: socialForm.hook,
      cta: socialForm.cta,
      tone: socialForm.tone,
      rewriteSource: socialForm.rewriteSource.trim() || undefined,
      rewriteMode: socialForm.rewriteSource.trim() ? socialForm.rewriteMode : undefined,
      input: socialForm.product.trim(),
      ...kbFields(useKB, regionId),
    };
    const full = await generate(req);
    const parsed =
      parseSocialPlan(full, socialForm.product) ||
      buildPlanFallback({
        product: socialForm.product.trim(),
        advantage: socialForm.advantage,
        audience: audienceValue,
        platforms: socialForm.platforms,
        raw: full,
      });
    setSocialFallback(full);
    if (full.trim()) {
      const time = nowStamp();
      rememberPlan({
        id: `social-${Date.now()}`,
        kind: "social",
        product: socialForm.product.trim(),
        title: `${socialForm.product.trim().slice(0, 16) || "社媒推文"} · ${socialForm.intent || "推广文案"}`,
        time,
        plan: parsed,
        raw: full,
        intent: socialForm.intent,
        platforms: socialForm.platforms,
        regionEnhance,
        regionId,
      });
      const saved = addWork({
        emoji: "",
        grad: "thumb-grad-2",
        kind: "文案",
        name: `${socialForm.product.trim().slice(0, 12) || "社媒推文"} · 推广文案`,
        sub: "内容创作 · 社媒推文",
        module: "content",
        text: full,
        time,
        edit: { sub: "social", product: socialForm.product, brand: socialForm.brand, advantage: socialForm.advantage },
      });
      toast(saved.ok ? "推广文案已生成并存入「我的作品」" : "推广文案已生成（仓库写入失败）", saved.ok ? undefined : "warn");
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
    const highlightText = picked.highlights.filter(Boolean).join("；");
    // 内置海报提示词（约 500 字）：承接任意 AI 策划方案，稳定产出可投放推广海报
    const prompt =
      `请根据以下品牌策划方案，生成一张可直接用于社媒投放的商业推广海报。` +
      `主题产品：${product}${brand ? `；品牌名称：${brand}` : ""}。` +
      `营销主标题（须完整准确出现在画面中，禁止错字漏字）：${picked.title}。` +
      (highlightText ? `营销亮点（择 1-3 条以短标签或要点形式呈现）：${highlightText}。` : "") +
      (audience ? `目标人群：${audience}，画面气质与构图需贴合该人群审美与消费场景。` : "") +
      (advantage ? `产品核心优势：${advantage}，用视觉语言强化信任感与购买欲。` : "") +
      `画面要求：竖版 3:4 或接近方版构图，产品/核心场景占视觉中心，主体清晰、光影自然、质感真实；` +
      `背景服务于主题氛围，可融入产地、节令或生活方式元素，但不得喧宾夺主。` +
      `排版要求：信息层级分明——主标题最大最醒目，品牌名次之，亮点标签简洁可读；` +
      `中文字体规整清晰，字间距适中，避免挤压、扭曲、叠字与乱码；留白合理，整体干净高级。` +
      `风格要求：商业广告摄影与现代营销设计结合，色彩和谐有记忆点，适合朋友圈/小红书等平台传播。` +
      `通用适配：无论农产品、文旅、活动、门店或品牌策划，均按方案内容自动匹配场景与调性，不得偏离主题。` +
      `细节强化：突出新鲜度、品质感或体验感中的核心卖点，画面叙事完整，具备传播记忆点。` +
      `禁止：水印、二维码占位乱码、无关英文堆砌、低清晰度、过度滤镜、文字不可读。` +
      `最终目标：一眼看懂卖什么、谁在推、为什么买，转化导向明确。`;

    notifyRegionEnhance(toast, { useLora, useKB });
    setPosterLoading(true);
    try {
      const r = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          imageRequestBody({
            prompt,
            size: "2048x2048",
            n: 1,
            useLora: false,
            useKB,
            regionId,
          }),
        ),
      });
      const j = (await r.json().catch(() => ({}))) as { images?: string[]; error?: string };
      const img = j.images?.[0];
      if (!r.ok || !img) {
        toast(j.error || "海报生成失败，请稍后重试", "warn");
        throw new Error("poster-generate-failed");
      }
      addWork({
        emoji: "",
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

  async function genImageByModel(picked: { platform: string; text: string; style?: string }) {
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
    const styleHint =
      picked.style === "餐桌场景"
        ? "构图偏餐桌/开箱/家用消费场景，生活气息强。"
        : picked.style === "产地空镜"
          ? "构图偏产地田园空镜与物产氛围，环境叙事强，产品可作点睛。"
          : picked.style === "人物手持"
            ? "构图偏人物手持/试吃/展示产品，有互动感与种草感。"
            : "构图偏真实产品静物摄影，质感扎实、主体突出。";
    // 内置配图提示词（约 500 字）：承接任意社媒/品牌文案，稳定产出可投放配图
    const prompt =
      `请根据以下推广文案信息，生成一张可直接用于社媒信息流投放的商业配图。` +
      `主题产品：${product}${brand ? `；品牌名称：${brand}` : ""}。` +
      `发布平台：${picked.platform}，画面比例与视觉节奏需适配该平台浏览习惯。` +
      `配图风格：${picked.style || "实拍感"}。${styleHint}` +
      (audience ? `目标人群：${audience}，构图气质、场景氛围与该人群审美一致。` : "") +
      (advantage ? `产品卖点：${advantage}，用画面细节自然传达品质与价值，避免硬广堆砌。` : "") +
      (copyBrief ? `文案氛围参考：${copyBrief}。请提炼情绪与场景关键词指导画面，而非把全文印到图上。` : "") +
      `画面要求：真实可感的产品/场景摄影风，主体清晰、质感扎实、光影自然；` +
      `产品或核心场景置于视觉中心，背景可融入产地、田园、节令或生活方式元素，但不得抢夺主体。` +
      `构图干净、留白适中，适合手机竖滑浏览，高清细节，色彩和谐有记忆点。` +
      `文字要求：默认少字或无字；如需标题，仅允许少量点缀感中文（合计≤8字），字体规整清晰，禁止错字漏字、叠字与乱码。` +
      `通用适配：无论农产品、文旅、活动、门店或品牌推文，均按主题自动匹配场景与调性，不得偏离产品。` +
      `细节强化：突出新鲜度、产地感、品质感或体验感，画面叙事完整，具备种草传播力与信任感。` +
      `禁止：水印、二维码、大段文案、无关英文堆砌、低清晰度、过度滤镜、杂乱元素。` +
      `最终目标：一眼看懂推什么，停滑欲与点击欲强，适配朋友圈/小红书等社媒配图场景。`;

    notifyRegionEnhance(toast, { useLora, useKB });
    setImageLoading(true);
    try {
      const r = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          imageRequestBody({
            prompt,
            size: "2048x2048",
            n: 1,
            useLora: false,
            useKB,
            regionId,
          }),
        ),
      });
      const j = (await r.json().catch(() => ({}))) as { images?: string[]; error?: string };
      const img = j.images?.[0];
      if (!r.ok || !img) {
        toast(j.error || "配图生成失败，请稍后重试", "warn");
        throw new Error("image-generate-failed");
      }
      addWork({
        emoji: "",
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
          <div className="ws-panel sticky">
          <RegionEnhanceStrip
            useKB={useKB}
            onKBChange={(next) => {
              setUseKB(next);
              setRegionEnhance(useLora || next);
            }}
            regionId={regionId}
          />
          {panel}
        </div>

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
                      <Icon name="content" size={46} />
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
                  <div className="pe-ico"></div>
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
                  regionEnhance={viewedOfficial?.regionEnhance ?? (mode === "official" ? regionEnhance : undefined)}
                  regionId={viewedOfficial?.regionId ?? regionId}
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
            ) : mode === "none" && !(planKind && sceneHistory.length) ? (
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
            ) : showPlan || (planKind && sceneHistory.length > 0) ? (
              <>
                {planKind && (
                  <div className="social-hist-panel">
                    <div className="social-hist-head">
                      <span>生成历史</span>
                      <em>{sceneHistory.length} 条 · 点击打开全部</em>
                    </div>
                    {sceneHistory.length === 0 ? (
                      <div className="social-hist-empty">暂无历史，点击左侧「立即生成」后会自动保存在这里</div>
                    ) : (
                      <ul className="official-hist-list social-hist-list">
                        {sceneHistory.map((h) => (
                          <li
                            key={h.id}
                            className={`official-hist-item ${activePlanId === h.id ? "on" : ""}`}
                          >
                            <button
                              type="button"
                              className="official-hist-main"
                              onClick={() => openHistoryPlan(h)}
                            >
                              <div className="official-hist-title">{h.title}</div>
                              <div className="official-hist-meta">
                                {h.time}
                                {h.intent ? ` · ${h.intent}` : ""}
                                {h.platforms?.length ? ` · ${h.platforms.join("/")}` : ""}
                                {activePlanId === h.id && planDetailOpen ? " · 已展开" : ""}
                              </div>
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              aria-label="删除历史"
                              onClick={() => {
                                const next = removeSocialPlan(h.id);
                                setSocialHistory(next);
                                if (activePlanId === h.id) {
                                  setActivePlanId(null);
                                  setSocialPlan(null);
                                  setSocialFallback("");
                                  setPlanDetailOpen(false);
                                  setMode("none");
                                }
                              }}
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {state.loading ? (
                  <div className="preview-empty" style={{ minHeight: 220 }}>
                    <div>
                      <div className="pe-ico">
                        <span className="gen-cursor" />
                      </div>
                      {mode === "brand" ? "正在生成品牌策划方案…" : "正在生成推广文案…"}
                    </div>
                  </div>
                ) : planDetailOpen && socialPlan ? (
                  <SocialPlanResult
                    key={activePlanId || socialPlan.product}
                    plan={socialPlan}
                    onMakePoster={genPosterByModel}
                    posterLoading={posterLoading}
                    onMakeImage={genImageByModel}
                    imageLoading={imageLoading}
                    regionEnhance={
                      (activePlanId
                        ? socialHistory.find((h) => h.id === activePlanId)?.regionEnhance
                        : undefined) ?? regionEnhance
                    }
                    regionId={
                      (activePlanId
                        ? socialHistory.find((h) => h.id === activePlanId)?.regionId
                        : undefined) ?? regionId
                    }
                  />
                ) : planDetailOpen && socialFallback ? (
                  <ContentResult
                    scene={scene}
                    text={socialFallback}
                    loading={false}
                    regionEnhance={regionEnhance}
                    regionId={regionId}
                    product={mode === "brand" ? brandForm.product : socialForm.product}
                  />
                ) : sceneHistory.length > 0 ? (
                  <div className="preview-empty" style={{ minHeight: 200 }}>
                    <div>
                      <div className="pe-ico">
                        <Icon name="history" size={42} />
                      </div>
                      已生成 {sceneHistory.length} 条记录
                      <br />
                      <span style={{ fontSize: 13, color: "var(--c-muted)" }}>点击上方历史条目，打开完整方案</span>
                    </div>
                  </div>
                ) : null}
              </>
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
