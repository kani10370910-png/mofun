"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { readReedit } from "@/lib/reedit";
import {
  buildEventReedit,
  buildFontReedit,
  buildIpReedit,
  buildLogoReedit,
  buildProductReedit,
  buildSignageReedit,
  mergeReeditInitial,
  parseColorList,
} from "@/lib/reeditRestore";
import { Icon } from "@/components/ui/Icon";
import { EditorRail, type RailItem } from "@/components/ui/EditorRail";
import { GenModal } from "@/components/ui/GenModal";
import { useToast } from "@/components/ui/Toast";
import { useSimGenerate } from "@/lib/useSimGenerate";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import { buildWorkSummaryText } from "@/lib/workMeta";
import { imgToDataUrl, imageNaturalSize, parsePxDimensionsFromPrompt, seedreamOutputSize, parseDisplaySize, SEEDREAM_MIN_PIXELS, enforceIpCreatePrompt } from "@/lib/image";
import { asset } from "@/lib/asset";
import { trimImageMargin, fontDirFitRatio } from "@/lib/trimImageMargin";
import { collectGenerate } from "@/lib/useGenerateStream";
import { resolveEventPromptKind } from "@/lib/eventPromptKind";
import { logoSvgDataUrl } from "@/lib/logoSvg";
import { buildLogoStylePrompt } from "@/lib/logoStylePrompt";
import { loadLogoStyles, getLogoStylesCached } from "@/lib/opsCatalog";
import { isCopyHeavyPrompt, buildCopyLayoutImagePrompt } from "@/lib/copyLayoutPrompt";
import type { AssetCard } from "@/lib/types";
import { imageTypes, imageRatios, fontEffects, productGalleryItems, signageGalleryItems, paintStyles } from "@/data/image";
import { defaultLoraIdsForRegion, defaultStrengthMap } from "@/data/regionAssets";
import {
  QWEN_T2I_LOCAL,
  accountRegionId,
  imageRequestBody,
  kbFields,
  modelSupportsCountyLora,
  notifyRegionEnhance,
} from "@/lib/regionEnhance";
import { DEFAULT_EVENT_I2I_MODEL, DEFAULT_EVENT_T2I_MODEL, DEFAULT_FONT_MODEL, DEFAULT_IP_CREATE_MODEL, DEFAULT_IP_EXTEND_MODEL, DEFAULT_LOGO_MODEL } from "@/lib/featureModels";
import { useAuth } from "@/lib/AuthContext";
import { IDENTITY_EVENT } from "@/lib/identity";
import { beginGenerateCharge, chargeAuthPatch, markGenerateDispatched } from "@/lib/chargeGenerate";
import { eventImagePoints, imageShotPoints, POINT_COST } from "@/lib/pointCosts";
import {
  productScenePresets,
  productTasks,
  buildProductPrompt,
  buildAiScenePrompt,
  aiSceneExpandSub,
  aiSceneJobLabel,
  productGalleryBgPatch,
  taskToExpandSub,
  PRODUCT_REF_KEEP,
  PRODUCT_DEAI_SUFFIX,
  PRODUCT_IMAGE_MODEL,
  PRODUCT_AI_SCENE_NONE,
  PRODUCT_AI_SCENE_COLOR,
  PRODUCT_AI_SCENE_WHITE,
  PRODUCT_AI_SCENE_UPLOAD,
  expandProductDescLexicon,
  isProductBgAi,
  isProductBgLocalCut,
  isProductBgNeedUpload,
  isProductBgBatch,
  type ProductTaskKey,
} from "@/data/productStudio";
import { cutoutProduct } from "@/lib/productCutout";
import { resolveProductSceneImg } from "@/lib/productSceneThumbs";
import { ImageProductPanel, initProductStudio, type ProductStudioState } from "./ImageProductPanel";
import { ImageSignagePanel, initSignageStudio, type SignageStudioState } from "./ImageSignagePanel";
import { genStages } from "@/data/genStages";
import { IMG_ICON } from "@/data/icons";
import type { IconName } from "@/data/icons";
import type { ImageType, ImageTypeKey, LogoCase, FontCase, FontCat, FontStory } from "@/lib/types";
import {
  ImageDefaultPanel,
  ImageEventPanel,
  ImageLogoPanel,
  ratioOptsForSub,
  allImageSizePresets,
  type DefaultImageState,
  type EventImageState,
  type LogoImageState,
} from "./ImagePanels";
import { ImageResult } from "./ImageResult";
import { ImageIpPanel, ProposePanel, setProposeBackgroundToast, type IpGenPayload, type IpCopyPayload } from "./ImageIpPanel";
import { IpGallery, type IpRunRow, type IpExtendSeed } from "./IpGallery";
import { ActiveGallery, type EventRunRow } from "./ActiveGallery";
import { Img2TextModal, EVENT_IMG2TEXT_PROMPT } from "./Img2TextModal";
import { PaintStyleModal } from "./PaintStyleModal";
import { LibraryPickerModal } from "./LibraryPickerModal";
import { LogoGallery, type LogoRunRow } from "./LogoGallery";
import { FontPanel, type FontImageState } from "./FontPanel";
import { FontGallery, type FontRunRow } from "./FontGallery";
import { ensureProductSeedsLocal, loadProductRuns, saveProductRuns } from "@/lib/productRunsStorage";
import { loadSignageRuns, saveSignageRuns } from "@/lib/signageRunsStorage";
import { purgeLocalStorageBloatOnce } from "@/lib/localStorageCleanup";
import { DEMO } from "@/lib/demo";
import { demoProductGenerate, shouldUseProductDemo } from "@/lib/productDemo";
import { demoSignageGenerate, shouldUseSignageDemo } from "@/lib/signageDemo";
import {
  buildSignagePrompt,
  SIGNAGE_IMAGE_MODEL,
  resolveSignageSize,
  platformByKey,
} from "@/data/signageStudio";

const iconOf = (k: string): IconName => IMG_ICON[k] ?? "image";

/* 活动·预置生成历史（演示）：进入即有完整记录，可直接点编辑/深度编辑/下载/收藏/另存。
   结果图借用 public/poster-samples 真图，time 用固定值避免 SSR/CSR 不一致。*/
const SEED_EVENT_RUNS: EventRunRow[] = [
  {
    id: "seed-ev-1",
    prompt: "治愈清新风森之露洗发水海报，米白背景，鲜橙切片",
    sub: "海报",
    ratioName: "方版1:1",
    time: "2026-06-26 09:30",
    pct: 100,
    imgs: ["/poster-samples/20260204165107990130xe92i6.jpg"],
    grads: ["thumb-grad-1"],
    regionEnhance: true,
    regionId: "anji",
  },
  {
    id: "seed-ev-2",
    prompt: "简约科技风米家电动牙刷新品海报",
    sub: "海报",
    ratioName: "竖版3:4",
    time: "2026-06-26 09:12",
    pct: 100,
    imgs: ["/poster-samples/202602041724199902428j5nhr.jpg"],
    grads: ["thumb-grad-3"],
    regionEnhance: true,
    regionId: "anji",
  },
  {
    id: "seed-ev-3",
    prompt: "地球一小时公益海报，深绿黑色，发光字体",
    sub: "宣传单",
    ratioName: "竖版9:16",
    time: "2026-06-26 08:50",
    pct: 100,
    imgs: ["/poster-samples/20251225143202617562fe2mzh.jpg"],
    grads: ["thumb-grad-2"],
    regionEnhance: true,
    regionId: "anji",
  },
];

/* IP 设计·预置生成历史（演示）：谷粒仔两例，图在 public/ipseed/ */
const GULIZAI_DESC =
  "谷粒仔，一个由稻谷粒直接拟人化的Q版角色，身高约两个头身比，身体呈椭圆米粒状，表面有细腻的稻壳纹路。眼睛是两颗小黑豆，腮头一点红晕，嘴巴张开露出三颗小牙，表情憨态可掬。头戴一顶稻草编的小斗笠，斗笠边缘垂下两缕绿藤。身穿黄绿条纹的宽松背带裤，身后有一条稻穗尾巴。腰间挂一个竹编小篓，里面装满金黄稻粒。配色主色为亮黄与稻褐，气质质朴可爱，像田间奔跑的小农夫。正面朝向镜头，纯白背景";

const SEED_IP_RUNS: IpRunRow[] = [
  {
    id: "seed-ip-1",
    title: "谷粒仔",
    desc: GULIZAI_DESC,
    rawDesc: GULIZAI_DESC,
    colors: ["#E53935"],
    ratioName: "正方形 1:1",
    time: "2026-08-21 11:12",
    pct: 100,
    grads: ["thumb-grad-1"],
    imgs: ["/ipseed/gulizai-1.png?v=2"],
    create: {
      refImg: "/ipseed/gulizai-ref.png?v=2",
      desc: GULIZAI_DESC,
      colors: ["#E53935"],
      ratioName: "正方形 1:1",
    },
    regionEnhance: true,
    useLora: true,
    useKB: true,
    regionId: "anji",
  },
  {
    id: "seed-ip-2",
    title: "谷粒仔",
    desc: GULIZAI_DESC,
    rawDesc: GULIZAI_DESC,
    colors: ["#E53935"],
    ratioName: "正方形 1:1",
    time: "2026-08-21 11:04",
    pct: 100,
    grads: ["thumb-grad-2"],
    imgs: ["/ipseed/gulizai-2.png?v=3"],
    create: {
      desc: GULIZAI_DESC,
      colors: ["#E53935"],
      ratioName: "正方形 1:1",
    },
  },
];

/* AI 字体·预置生成历史（演示）：完整原图缩略，图在 public/fontseed/ */
const SEED_FONT_RUNS: FontRunRow[] = [
  {
    id: "seed-font-1",
    text: "凌冬将至",
    effect: "冬日体",
    dir: "竖向",
    time: "2026-08-21 14:14",
    pct: 100,
    results: [{ grad: "thumb-grad-1", img: "/fontseed/lindong-jiangzhi.png?v=10" }],
  },
  {
    id: "seed-font-2",
    text: "天下无双",
    effect: "墨痕手书",
    dir: "横向",
    time: "2026-08-21 14:13",
    pct: 100,
    results: [{ grad: "thumb-grad-2", img: "/fontseed/tianxia-wushuang.png?v=10" }],
  },
];

export function ImageEditor({ initialSub, initial }: { initialSub?: string; initial?: Record<string, string | undefined> }) {
  const toast = useToast();
  const sim = useSimGenerate();
  const { addWork } = useLibrary();
  const { user, updateUser } = useAuth();
  const regionId = accountRegionId(user);

  function takeCharge(amount: number, title: string) {
    const r = beginGenerateCharge(user, amount, title);
    if (!r.ok) return false;
    markGenerateDispatched(r.charge);
    updateUser(chargeAuthPatch(r.charge.wallet, user));
    return true;
  }

  /** 多图生成：整批作为一条作品入库（bundle 含各张图） */
  function saveAllImageWorks(
    imgs: Array<string | undefined | null>,
    base: {
      emoji: string;
      grad: AssetCard["grad"];
      nameBase: string;
      sub: string;
      edit?: Record<string, string>;
    },
  ): number {
    const stamp = nowStamp();
    const catLabel = base.sub.split("·").pop()?.trim() || "图";
    const bundle = imgs
      .map((img, i) => (img ? { label: `${catLabel} ${i + 1}`, img } : null))
      .filter(Boolean) as { label: string; img: string }[];
    if (!bundle.length) return 0;
    const res = addWork({
      emoji: base.emoji,
      grad: base.grad,
      kind: "图片",
      name: base.nameBase,
      sub: base.sub,
      module: "image",
      img: bundle[0].img,
      bundle,
      time: stamp,
      edit: base.edit,
      text: buildWorkSummaryText(base.edit),
    });
    return res.ok ? bundle.length : 0;
  }

  // 二次编辑：读取暂存的图片作品，据 edit.sub 重建为对应模块的一条历史记录并高亮定位
  const reeditNonce = initial?.reedit;
  const reeditCard = useMemo(() => {
    const c = readReedit(reeditNonce);
    return c && c.kind === "图片" ? c : null;
  }, [reeditNonce]);
  const reeditSub = reeditCard?.edit?.sub; // "event" | "ip" | "logo" | "font" | "product" | "signage"
  const reeditRowId = `reedit-${reeditNonce}`;
  const [highlightRow, setHighlightRow] = useState<string | null>(reeditCard ? reeditRowId : null);
  const quotaToastAt = useRef(0);
  const subHint = reeditSub || initialSub;
  const back = useMemo(() => mergeReeditInitial(initial, reeditCard), [initial, reeditCard]);

  // 监听 localStorage 空间不足事件（由 store.tsx 的 save() 触发）
  useEffect(() => {
    const handler = () => {
      const now = Date.now();
      if (now - quotaToastAt.current < 15_000) return;
      quotaToastAt.current = now;
      toast("本地存储空间不足，历史记录可能无法保存", "warn");
    };
    window.addEventListener("mofun:storage-quota", handler);
    return () => window.removeEventListener("mofun:storage-quota", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 二次编辑：滚动定位到重建的历史记录并高亮片刻
  useEffect(() => {
    if (!highlightRow) return;
    const t1 = window.setTimeout(
      () => document.getElementById(`imgrun-${highlightRow}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
      170,
    );
    const t2 = window.setTimeout(() => setHighlightRow(null), 3200);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [active, setActive] = useState<ImageTypeKey>(
    (imageTypes.find((t) => t.key === (reeditSub || initialSub))?.key as ImageTypeKey) ?? imageTypes[0].key
  );
  const type = imageTypes.find((t) => t.key === active) ?? imageTypes[0];

  // 二次编辑回填：URL 参数 + sessionStorage 暂存卡片的 edit 合并
  const [defForm, setDefForm] = useState<DefaultImageState>(() => {
    const d = initDefault(type);
    if (back.input && subHint !== "logo" && subHint !== "font") d.input = back.input;
    return d;
  });
  const [eventForm, setEventForm] = useState<EventImageState>(() => {
    const e = initEvent(type, regionId);
    if (subHint === "event") {
      if (back.input) e.input = back.input;
      if (back.eventSub) e.sub = back.eventSub;
      if (back.ratio && imageRatios.some((r) => r.name === back.ratio)) e.ratio = back.ratio;
      if (back.style) e.style = back.style;
    }
    return e;
  });
  const [productForm, setProductForm] = useState<ProductStudioState>(() => {
    const p = initProductStudio();
    if (subHint === "product") {
      if (back.input) p.desc = back.input;
      if (back.productName) p.productName = back.productName;
      if (back.productImg) p.productImg = back.productImg;
      if (back.productLabel) p.productLabel = back.productLabel;
      if (back.task || back.taskKey) {
        const key = back.taskKey || back.task;
        const hit = productTasks.find((t) => t.name === key || t.key === key);
        if (hit) p.task = hit.key;
      }
      if (back.bgMode) p.bgMode = back.bgMode as ProductStudioState["bgMode"];
      if (back.scenePreset) p.scenePreset = back.scenePreset;
      if (back.bgColor) p.bgColor = back.bgColor;
      if (back.size) p.size = back.size;
      if (back.customW) p.customW = back.customW;
      if (back.customH) p.customH = back.customH;
      if (back.count) {
        const c = Number(back.count);
        if (Number.isFinite(c) && c > 0) p.count = Math.max(1, Math.min(4, Math.round(c)));
      }
      if (back.angles) p.angles = back.angles.split(/[、,，]/).map((x) => x.trim()).filter(Boolean);
      if (back.customAnglePrompt) p.customAnglePrompt = back.customAnglePrompt;
      if (back.refinePreset) p.refinePreset = back.refinePreset;
      if (back.fusionImg1) p.fusionImgs[0] = back.fusionImg1;
      if (back.fusionImg2) p.fusionImgs[1] = back.fusionImg2;
      if (back.fusionImg3) p.fusionImgs[2] = back.fusionImg3;
      if (back.fusionLabel1) p.fusionLabels[0] = back.fusionLabel1;
      if (back.fusionLabel2) p.fusionLabels[1] = back.fusionLabel2;
      if (back.fusionLabel3) p.fusionLabels[2] = back.fusionLabel3;
      if (back.regionEnhance) {
        const on = back.regionEnhance === "true";
        p.regionEnhance = on;
        p.useLora = back.useLora != null ? back.useLora === "true" : on;
        p.useKB = false;
      }
    }
    return p;
  });
  const [signageForm, setSignageForm] = useState<SignageStudioState>(() => {
    const s = initSignageStudio();
    if (subHint === "signage") {
      if (back.shopName) s.shopName = back.shopName;
      else if (back.brand) s.shopName = back.brand;
      if (back.slogan) s.slogan = back.slogan;
      if (back.industry) s.industry = back.industry as SignageStudioState["industry"];
      if (back.style) s.style = back.style as SignageStudioState["style"];
      if (back.input) s.extraDesc = back.input;
      if (back.channel?.includes("实体")) s.channel = "storefront";
      if (back.channel?.includes("线上")) s.channel = "online";
      if (back.storefrontType) s.storefrontType = back.storefrontType as SignageStudioState["storefrontType"];
      if (back.platform) s.platform = back.platform as SignageStudioState["platform"];
      if (back.size) s.size = back.size;
      if (back.customW) s.customW = back.customW;
      if (back.customH) s.customH = back.customH;
      if (back.logoImg) s.logoImg = back.logoImg;
      if (back.logoLabel) s.logoLabel = back.logoLabel;
      if (back.refImg) s.refImg = back.refImg;
      if (back.refLabel) s.refLabel = back.refLabel;
      if (back.count) {
        const c = Number(back.count);
        if (Number.isFinite(c) && c > 0) s.count = Math.max(1, Math.min(4, Math.round(c)));
      }
      if (back.regionEnhance) {
        const on = back.regionEnhance === "true";
        s.regionEnhance = on;
        s.useLora = back.useLora != null ? back.useLora === "true" : on;
        s.useKB = back.useKB != null ? back.useKB === "true" : on;
      }
    }
    return s;
  });
  const [logoForm, setLogoForm] = useState<LogoImageState>(() => ({
    style: (subHint === "logo" && back.style) || "智能匹配",
    brand: (subHint === "logo" && back.brand) || "",
    input: (subHint === "logo" && back.input) || "",
    count: (() => {
      const c = Number(subHint === "logo" && back.count);
      return Number.isFinite(c) && c > 0 ? Math.max(1, Math.min(4, Math.round(c))) : 1;
    })(),
    model: DEFAULT_LOGO_MODEL,
    useLora: false,
    useKB: false,
    regionEnhance: false,
  }));
  const [fontForm, setFontForm] = useState<FontImageState>(() => {
    if (subHint !== "font") {
      const cat0 = "书法体" as FontImageState["cat"];
      return {
        text: "",
        dir: "h" as const,
        cat: cat0,
        effect: fontEffects.find((f) => f.cat === cat0)?.name || "",
        count: 1,
        model: DEFAULT_FONT_MODEL,
      };
    }
    const tagOrName = back.effect ? String(back.effect) : "";
    const fontCat = back.style ? String(back.style) : undefined;
    const matched =
      (tagOrName && fontEffects.find((f) => f.name === tagOrName)) ||
      (fontCat && tagOrName && fontEffects.find((f) => f.cat === fontCat && f.name.includes(tagOrName))) ||
      (tagOrName && fontEffects.find((f) => f.name.includes(tagOrName))) ||
      (fontCat && fontEffects.find((f) => f.cat === fontCat)) ||
      undefined;
    const cat = (matched?.cat || fontCat || "书法体") as FontImageState["cat"];
    return {
      text: back.text ? String(back.text) : "",
      dir: back.dir === "竖向" ? "v" : "h",
      cat,
      effect: matched?.name || fontEffects.find((f) => f.cat === cat)?.name || "",
      count: (() => {
        const c = Number(back.count);
        return Number.isFinite(c) && c > 0 ? Math.max(1, Math.min(4, Math.round(c))) : 1;
      })(),
      model: DEFAULT_FONT_MODEL,
    };
  });

  // 结果状态
  const [hasResult, setHasResult] = useState(false);
  // IP 设计「帮我提案」：在右侧结果区内嵌展示面板；proposeFill 用于把结果回填到左侧创意描述
  const [proposeOpen, setProposeOpen] = useState(false);
  const [proposeFill, setProposeFill] = useState(() =>
    subHint === "ip" && (back.rawDesc || back.input) ? String(back.rawDesc || back.input) : "",
  );
  // 帮我提案是否引用知识库（由左侧开关带入；立即生成始终不走知识库）
  const [proposeUseKB, setProposeUseKB] = useState(true);
  const [ipDesignTab, setIpDesignTab] = useState<"create" | "extend">(
    subHint === "ip" && String(back.mode || "") === "extend" ? "extend" : "create",
  );
  const [fillSeq, setFillSeq] = useState(() => (subHint === "ip" && (back.rawDesc || back.input || back.colors || back.ratio) ? 1 : 0));
  const [copyFill, setCopyFill] = useState<IpCopyPayload | null>(() => {
    if (subHint !== "ip") return null;
    const colors = parseColorList(back.colors);
    if (!back.rawDesc && !back.input && !colors?.length && !back.ratio) return null;
    return {
      kind: "create",
      desc: back.rawDesc || back.input || "",
      colors,
      ratioName: back.ratio ? String(back.ratio) : undefined,
    };
  });
  // 打开提案面板时，把左侧创意描述的已有内容复制进面板作为初始文本
  const [proposeInit, setProposeInit] = useState("");

  // 打开/关闭提案面板：打开时记录当前创意描述与知识库开关
  function handlePropose(open: boolean, initialDesc?: string, useKB?: boolean) {
    if (open) {
      setProposeInit(initialDesc ?? "");
      setProposeUseKB(useKB !== false);
    }
    setProposeOpen(open);
  }
  // 提案后台跑完时（面板已关）用 toast 提醒
  useEffect(() => {
    setProposeBackgroundToast((s, k) => toast(s, k));
    return () => setProposeBackgroundToast(null);
  }, [toast]);
  // 默认看「生成历史」（已有预置演示历史）；点生成时 runLogoGenerate 也会切到「生成历史」
  const [logoTab, setLogoTab] = useState<"history" | "inspire">("history");
  const [logoRuns, setLogoRuns] = useState<LogoRunRow[]>(() =>
    reeditCard && reeditSub === "logo" ? [buildLogoReedit(reeditCard, reeditRowId)] : [],
  );
  const [logoBusy, setLogoBusy] = useState(false);
  const logoTimer = useRef<number | null>(null);
  // AI字体：默认看「生成历史」（已有预置演示历史）
  const [fontTab, setFontTab] = useState<"history" | "inspire" | "story">("history");
  const [fontRuns, setFontRuns] = useState<FontRunRow[]>(() =>
    reeditCard && reeditSub === "font" ? [buildFontReedit(reeditCard, reeditRowId), ...SEED_FONT_RUNS] : SEED_FONT_RUNS,
  );
  const [fontBusy, setFontBusy] = useState(false);
  const fontTimer = useRef<number | null>(null);
  const fontTimeout = useRef<number | null>(null);
  // IP 设计：内联生成历史（含进度 + 真实出图）；预置演示历史，进入即有完整记录
  const [ipRuns, setIpRuns] = useState<IpRunRow[]>(() =>
    reeditCard && reeditSub === "ip" ? [buildIpReedit(reeditCard, reeditRowId), ...SEED_IP_RUNS] : SEED_IP_RUNS,
  );
  const [ipBusy, setIpBusy] = useState(false);
  const ipTimer = useRef<number | null>(null);
  const ipTimeout = useRef<number | null>(null); // 120s 超时兜底，防止 4 张串行永久卡住
  // 每日配额耗尽弹层
  const [quotaOpen, setQuotaOpen] = useState(false);
  // IP 右侧 tab：默认看「生成历史」（已有预置演示历史）
  const [ipTab, setIpTab] = useState<"history" | "inspire">("history");
  // 「延展设计」：把某张生成图作为待延展的 IP 图，带去 IP扩展设计子表单
  const [ipExtendSeed, setIpExtendSeed] = useState<IpExtendSeed | null>(null);
  // 活动：内联生成历史（进度卡 + 真实出图，文生图/图生图共用）；预置演示历史，进入即有完整记录
  const [eventRuns, setEventRuns] = useState<EventRunRow[]>(() =>
    reeditCard && reeditSub === "event" ? [buildEventReedit(reeditCard, reeditRowId), ...SEED_EVENT_RUNS] : SEED_EVENT_RUNS,
  );
  const [eventBusy, setEventBusy] = useState(false);
  const eventTimer = useRef<number | null>(null);
  const eventTimeout = useRef<number | null>(null); // 90s 超时兜底，防止生成永久卡住
  // 活动右侧 tab：默认看「生成历史」（空态会引导）；生成时也停在生成历史看进度
  const [eventTab, setEventTab] = useState<"history" | "cases">("history");
  // 商拍：复用活动同款历史/进度结构；预置 1 条 + localStorage 持久化
  const [productRuns, setProductRuns] = useState<EventRunRow[]>(() =>
    reeditCard && reeditSub === "product"
      ? [buildProductReedit(reeditCard, reeditRowId), ...loadProductRuns()]
      : loadProductRuns(),
  );
  const [productBusy, setProductBusy] = useState(false);
  const productTimer = useRef<number | null>(null);
  const productTimeout = useRef<number | null>(null);
  const [productTab, setProductTab] = useState<"history" | "cases">("history");

  const [signageRuns, setSignageRuns] = useState<EventRunRow[]>(() => {
    if (typeof window === "undefined") return [];
    const base = loadSignageRuns();
    return reeditCard && reeditSub === "signage"
      ? [buildSignageReedit(reeditCard, reeditRowId), ...base]
      : base;
  });
  const [signageBusy, setSignageBusy] = useState(false);
  const signageTimer = useRef<number | null>(null);
  const signageTimeout = useRef<number | null>(null);
  const [signageTab, setSignageTab] = useState<"history" | "cases">("history");
  const [signageLogoLibOpen, setSignageLogoLibOpen] = useState(false);
  const [signageRefLibOpen, setSignageRefLibOpen] = useState(false);

  // 商拍：首次写入预置历史；完成后才同步 localStorage
  useEffect(() => {
    const reload = () => {
      setProductRuns(loadProductRuns());
      setSignageRuns(loadSignageRuns());
    };
    reload();
    window.addEventListener(IDENTITY_EVENT, reload);
    return () => window.removeEventListener(IDENTITY_EVENT, reload);
  }, [user?.userId, user?.companyId, user?.joinedOrg, user?.enterpriseVerified]);

  useEffect(() => {
    purgeLocalStorageBloatOnce();
    ensureProductSeedsLocal();
  }, []);
  useEffect(() => {
    saveProductRuns(productRuns);
  }, [productRuns]);
  useEffect(() => {
    saveSignageRuns(signageRuns);
  }, [signageRuns]);

  // 活动·图转文面板：内嵌在右侧结果区（与「帮我提案」同款交互）
  const [i2tOpen, setI2tOpen] = useState(false);
  // 活动·画面风格选择面板：同款右侧浮层
  const [styleOpen, setStyleOpen] = useState(false);
  // 活动·图生图「仓库」选图弹窗（与 IP 设计一致）
  const [eventLibOpen, setEventLibOpen] = useState(false);
  const [productLibOpen, setProductLibOpen] = useState(false);
  const [productFusionLibOpen, setProductFusionLibOpen] = useState(false);

  // 点生成历史图片上的「延展设计」：切到 IP扩展设计并把该图作为 IP 图
  function handleIpExtend(seed: IpExtendSeed) {
    setProposeOpen(false);
    setIpExtendSeed(seed);
    toast(`已将「${seed.name}」带入 IP 扩展设计，可选择延展项后生成`);
  }

  function switchType(key: string) {
    const k = key as ImageTypeKey;
    if (k === "signage") {
      toast("该功能正在开发中", "warn");
      return;
    }
    setActive(k);
    setHasResult(false);
    setProposeOpen(false);
    if (ipTimer.current) {
      window.clearInterval(ipTimer.current);
      ipTimer.current = null;
    }
    if (ipTimeout.current) {
      window.clearTimeout(ipTimeout.current);
      ipTimeout.current = null;
    }
    if (eventTimer.current) {
      window.clearInterval(eventTimer.current);
      eventTimer.current = null;
    }
    if (eventTimeout.current) {
      window.clearTimeout(eventTimeout.current);
      eventTimeout.current = null;
    }
    if (productTimer.current) {
      window.clearInterval(productTimer.current);
      productTimer.current = null;
    }
    if (productTimeout.current) {
      window.clearTimeout(productTimeout.current);
      productTimeout.current = null;
    }
    if (signageTimer.current) {
      window.clearInterval(signageTimer.current);
      signageTimer.current = null;
    }
    if (signageTimeout.current) {
      window.clearTimeout(signageTimeout.current);
      signageTimeout.current = null;
    }
    sim.close();
    const t = imageTypes.find((x) => x.key === k) ?? imageTypes[0];
    setDefForm(initDefault(t));
    setEventForm(initEvent(t, regionId));
    setProductForm(initProductStudio());
    setSignageForm(initSignageStudio());
  }

  // 普通/活动/商拍：模拟生成（先校验必填）
  function runGenerate() {
    if (active === "event") {
      runEventGenerate();
      return;
    }
    if (active === "product") {
      runProductStudio();
      return;
    }
    if (active === "signage") {
      runSignageGenerate();
      return;
    } else if (active !== "ip" && !defForm.input.trim()) {
      // IP 设计有独立表单，必填在其组件内处理，这里跳过通用画面描述校验
      toast("请输入画面描述！", "warn");
      return;
    }
    setHasResult(false);
    sim.run("正在生成图片", genStages.image, () => {
      setHasResult(true);
      autoSaveImage();
    });
  }

  // 生成完成后默认保存到「仓库 · 我的作品」
  function autoSaveImage() {
    const desc = active === "event" ? eventForm.input : defForm.input;
    const name = (desc.trim().slice(0, 12) || type.name) + "（AI 生成）";
    const work: AssetCard = {
      emoji: type.ico,
      grad: type.grad as AssetCard["grad"],
      kind: "图片",
      name,
      sub: `${type.name} · AI 生成`,
      module: "image",
      time: nowStamp(),
      edit: { sub: active, input: desc },
    };
    addWork(work);
  }

  // logo 敏感词前置检查（与 IP 设计共用相同词库逻辑）
  const LOGO_BLOCKED = ["色情", "裸露", "暴力", "毒品", "赌博", "色图", "porn", "nude", "fuck", "shit"];
  function logoHasBlocked(text: string) {
    const lower = text.toLowerCase();
    return LOGO_BLOCKED.some((w) => lower.includes(w));
  }

  // logo：默认即梦 Seedream 5.0；知识库仍可开，Lora 对该模型无效
  async function runLogoGenerate() {
    if (logoBusy) return;
    const brand = logoForm.brand.trim();
    if (!brand) {
      toast("请输入品牌名称！", "warn");
      return;
    }
    if (logoHasBlocked(brand)) {
      toast("品牌名称包含不允许的词语，请修改后重试", "warn");
      return;
    }
    if (logoForm.input.trim() && logoHasBlocked(logoForm.input)) {
      toast("创意描述包含不允许的词语，请修改后重试", "warn");
      return;
    }
    notifyRegionEnhance(toast, { useLora: false, useKB: false }, logoForm.model || DEFAULT_LOGO_MODEL);
    setLogoBusy(true);
    setLogoTab("history");
    const id = "run-" + logoRuns.length + "-" + brand.length;
    const n = Math.max(1, Math.min(4, logoForm.count || 1));
    const grads = (["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4"] as const).slice(0, n);
    const style = logoForm.style || "智能匹配";
    const desc = logoForm.input.trim();

    const row: LogoRunRow = {
      id,
      prompt: brand,
      style,
      desc,
      time: nowStamp(),
      pct: 8,
      results: grads.map((g) => ({ grad: g, emoji: "", fav: false })),
      regionEnhance: false,
      useLora: false,
      useKB: false,
      regionId,
    };
    setLogoRuns((prev) => [row, ...prev]);

    let pct = 8;
    logoTimer.current = window.setInterval(() => {
      pct = Math.min(90, pct + 7 + (pct % 5));
      setLogoRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct } : r)));
    }, 500);

    const finish = (imgs: string[], err?: string) => {
      if (logoTimer.current) {
        window.clearInterval(logoTimer.current);
        logoTimer.current = null;
      }
      setLogoRuns((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                pct: 100,
                error: err,
                results: grads.map((g, i) => ({
                  grad: g,
                  emoji: "",
                  img: imgs[i] || imgs[0],
                  fav: false,
                })),
              }
            : r,
        ),
      );
      setLogoBusy(false);
      if (err) {
        toast(err, "warn");
        return;
      }
      toast("logo 生成完成，已存入「我的作品」");
      saveAllImageWorks(imgs, {
        emoji: "",
        grad: "thumb-grad-3",
        nameBase: `${brand} · LOGO`,
        sub: "品牌设计 · logo",
        edit: { sub: "logo", brand, style, input: logoForm.input, count: String(n) },
      });
    };

    try {
      await loadLogoStyles();
      // 选中风格的样张作图生参考（与 AI 字体一致）；智能匹配无样张则纯文生
      const styleMeta = getLogoStylesCached().find((s) => s.name === style);
      let styleRef = "";
      if (styleMeta?.img) {
        try {
          styleRef = await imgToDataUrl(asset(styleMeta.img));
        } catch {
          styleRef = "";
        }
      }
      // 按风格表拼提示词；有样张时再附加图生参考约束
      const stylePrompt = buildLogoStylePrompt(style, brand, desc);
      const promptBase = styleRef
        ? [
            `参考图为「${style}」风格样张：严格借鉴其构图版式、图形语言、线条疏密与整体气质`,
            `不要复现参考图中的原品牌名、原图形与原文字，品牌文字必须清晰呈现「${brand}」`,
            stylePrompt,
          ].join("。")
        : stylePrompt;

      const imgs: string[] = [];
      if (!takeCharge(imageShotPoints(logoForm.model || DEFAULT_LOGO_MODEL) * n, "Logo 出图")) {
        finish([], "算力不足");
        return;
      }
      for (let i = 0; i < grads.length; i++) {
        const r = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(90_000),
          body: JSON.stringify(
            imageRequestBody({
              prompt: grads.length > 1 ? `${promptBase}（变体 ${i + 1}）` : promptBase,
              size: seedreamOutputSize(1080, 1080), // 正方形 1:1 界面 1080 → 送模 1920²
              n: 1,
              model: logoForm.model || DEFAULT_LOGO_MODEL,
              useLora: false,
              useKB: false,
              regionId,
              artStyleKey: styleMeta?.key || "auto",
              scene: "logo",
              ...(styleRef ? { image: styleRef } : {}),
            }),
          ),
        });
        const j = (await r.json().catch(() => ({}))) as { images?: string[]; error?: string };
        const url = j?.images?.[0] || "";
        if (url) imgs.push(url);
      }
      if (imgs.length) {
        // 收白边后贴回 1:1，避免主体缩在画面中央过小
        const tightImgs = await Promise.all(
          imgs.map((u) =>
            trimImageMargin(u, { padRatio: 0.06, fitRatio: [1, 1], longSide: 1920, assetFn: asset }),
          ),
        );
        finish(tightImgs);
        return;
      }
      if (DEMO) {
        const fallback = grads.map((_, i) => logoSvgDataUrl(brand, style, i));
        finish(fallback);
        toast("云端出图暂不可用，已用本地预览稿", "warn");
        return;
      }
      finish([], "Logo 生成失败，请检查出图服务配置后重试");
    } catch {
      if (DEMO) {
        try {
          const fallback = grads.map((_, i) => logoSvgDataUrl(brand, style, i));
          finish(fallback);
          toast("云端出图失败，已用本地预览稿", "warn");
          return;
        } catch {
          /* fall through */
        }
      }
      finish([], "Logo 生成失败，请稍后重试或检查品牌名称是否含有特殊字符");
    }
  }

  // 参考灵感「制作同款」：把案例的风格 / 品牌名称 / 创意描述一一回填到左侧表单
  function useLogoCase(c: LogoCase) {
    const matchedStyle = getLogoStylesCached().find((s) => s.name === c.cat)?.name ?? "智能匹配";
    setLogoForm({
      ...logoForm,
      style: matchedStyle,
      brand: c.name,
      input: c.desc ?? `参考「${c.name}」制作 LOGO，${c.cat}风格，简洁现代、辨识度高`,
    });
    toast(`已套用「${c.name}」：风格、品牌名、创意描述已填入，可调整后点击「立即生成」`);
  }

  // 生成历史「复制」：把该记录的 logo 风格 / 品牌名称 / 创意描述回填到左侧表单
  function copyLogoHistory(style: string, prompt: string) {
    const matchedStyle = getLogoStylesCached().find((s) => s.name === style)?.name ?? style ?? "智能匹配";
    setLogoForm({
      ...logoForm,
      style: matchedStyle,
      brand: prompt,
      input: `参考历史记录「${prompt}」制作 LOGO，${style}风格，简洁现代、辨识度高`,
    });
    toast("已复制该记录到左侧，可调整后点击「立即生成」");
  }

  // 生成历史「删除」：移除本次会话生成的某一行
  function deleteLogoRun(id: string) {
    setLogoRuns((prev) => prev.filter((r) => r.id !== id));
  }

  // AI字体：Seedream 4.0 / 4.5 / 5.0（不挂载 Lora / 知识库）
  async function runFontGenerate() {
    if (fontBusy) return;
    const text = fontForm.text.trim();
    if (!text) {
      toast("请输入文字内容！", "warn");
      return;
    }
    if (LOGO_BLOCKED.some((w) => text.toLowerCase().includes(w))) {
      toast("文字内容包含不允许的词语，请修改后重试", "warn");
      return;
    }
    setFontBusy(true);
    setFontTab("history");
    const id = "font-" + fontRuns.length + "-" + text.length;
    const n = Math.max(1, Math.min(4, fontForm.count || 1));
    const grads = (["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4"] as const).slice(0, n);
    const dirLabel = fontForm.dir === "h" ? "横向" : "竖向";
    const effect = fontForm.effect;
    const cat = fontForm.cat;
    // 选中的文字效果：取其提示气质 + 预览样张作图生参考，贴近该字体真实笔触
    const effectMeta = fontEffects.find((f) => f.name === effect);
    // 与 IP/活动同一套：界面显示尺寸按比例放大到 ≥369 万再送 Seedream
    // 横向 →「横向 5:3」1800×1080；竖向 →「纵向 3:5」1080×1800
    const size =
      fontForm.dir === "v" ? seedreamOutputSize(1080, 1800) : seedreamOutputSize(1800, 1080);
    const row: FontRunRow = {
      id,
      text,
      effect,
      dir: dirLabel,
      time: nowStamp(),
      pct: 8,
      loadingPhase: 0,
      results: grads.map((g) => ({ grad: g })),
    };
    setFontRuns((prev) => [row, ...prev]);

    const budgetMs = grads.length * 90_000 + 20_000;
    if (fontTimeout.current) window.clearTimeout(fontTimeout.current);
    fontTimeout.current = window.setTimeout(() => {
      if (fontTimer.current) window.clearInterval(fontTimer.current);
      fontTimer.current = null;
      fontTimeout.current = null;
      setFontBusy(false);
      setFontRuns((prev) =>
        prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "生成超时，请稍后重试" } : r)),
      );
      toast("字体生成超时，请稍后重试", "warn");
    }, budgetMs);

    let pct = 8;
    let ticks = 0;
    fontTimer.current = window.setInterval(() => {
      pct = Math.min(90, pct + 4 + (pct % 5));
      ticks += 1;
      const phase = ticks < 20 ? 0 : ticks < 40 ? 1 : ticks < 70 ? 2 : 3;
      setFontRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct, loadingPhase: phase } : r)));
    }, 500);

    const finishTimers = () => {
      if (fontTimer.current) {
        window.clearInterval(fontTimer.current);
        fontTimer.current = null;
      }
      if (fontTimeout.current) {
        window.clearTimeout(fontTimeout.current);
        fontTimeout.current = null;
      }
    };

    try {
      // 把该文字效果的预览样张转成 data URL，作为图生图参考（失败则退回纯文生）
      const styleRef = effectMeta?.img
        ? await imgToDataUrl(asset(effectMeta.img))
        : "";
      const promptBase = [
        styleRef
          ? `严格按照参考图中的字体风格、笔触、线条粗细与装饰气质，生成完整清晰的中文艺术字「${text}」`
          : `中文艺术字效果图，完整清晰呈现文字「${text}」`,
        styleRef ? "不要复现参考图里的原文字内容，只借鉴其字形风格与视觉气质" : "",
        `字体气质：${effect}`,
        cat ? `品类风格：${cat}` : "",
        `${dirLabel}排版，字形可辨、装饰精美、适合品牌标题与海报字标`,
        "干净背景，无水印，无多余无关文字",
        "主体文字尽量铺满画面，四周留白尽量少，不要大片空白边距",
      ]
        .filter(Boolean)
        .join("。");

      const imgs: string[] = [];
      let lastErr = "";
      if (!takeCharge(imageShotPoints(fontForm.model || DEFAULT_FONT_MODEL) * n, "AI 字体出图")) {
        finishTimers();
        setFontBusy(false);
        setFontRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "算力不足" } : r)));
        toast("算力不足（不可透支）", "warn");
        return;
      }
      for (let i = 0; i < grads.length; i++) {
        const r = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(90_000),
          body: JSON.stringify(
            imageRequestBody({
              prompt: `${promptBase}（变体 ${i + 1}）`,
              size,
              n: 1,
              model: fontForm.model || DEFAULT_FONT_MODEL,
              useLora: false,
              useKB: false,
              scene: "font",
              ...(styleRef ? { image: styleRef } : {}),
            }),
          ),
        });
        const j = (await r.json().catch(() => ({}))) as { images?: string[]; error?: string };
        const url = j?.images?.[0] || "";
        if (url) imgs.push(url);
        else if (j?.error) lastErr = j.error;
      }
      finishTimers();
      if (!imgs.length) {
        const failMsg = lastErr
          ? (lastErr.includes(String(SEEDREAM_MIN_PIXELS)) || /size.*small|pixels/i.test(lastErr)
              ? "出图尺寸不符合模型要求，请重试"
              : lastErr.slice(0, 120))
          : "字体出图失败，请检查出图服务配置后重试";
        setFontRuns((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, pct: 100, error: failMsg }
              : r,
          ),
        );
        toast(failMsg.includes("服务") ? "字体生成失败，请稍后重试" : `字体生成失败：${failMsg}`, "warn");
        return;
      }
      // 收白边后贴回 5:3 / 3:5，保持出图画幅约定
      const fitRatio = fontDirFitRatio(dirLabel);
      const tightImgs = await Promise.all(
        imgs.map((u) => trimImageMargin(u, { padRatio: 0.04, assetFn: asset, fitRatio })),
      );
      setFontRuns((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                pct: 100,
                error: undefined,
                results: grads.map((g, i) => ({
                  grad: g,
                  img: tightImgs[i] || tightImgs[0],
                })),
              }
            : r,
        ),
      );
      toast(
        tightImgs.length < grads.length
          ? `已生成 ${tightImgs.length}/${grads.length} 张艺术字，已存入「我的作品」`
          : "字体生成完成，已存入「我的作品」",
      );
      saveAllImageWorks(tightImgs, {
        emoji: "",
        grad: "thumb-grad-6",
        nameBase: `${text} · 艺术字`,
        sub: "品牌设计 · AI字体",
        edit: { sub: "font", text, effect, dir: dirLabel, count: String(n) },
      });
    } catch {
      finishTimers();
      setFontRuns((prev) =>
        prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "网络连接失败，请稍后重试" } : r)),
      );
      toast("网络错误，字体生成失败", "warn");
    } finally {
      setFontBusy(false);
    }
  }

  // 生成历史「删除」：移除字体本次会话生成的某一行
  function deleteFontRun(id: string) {
    setFontRuns((prev) => prev.filter((r) => r.id !== id));
  }

  // IP 设计：按左侧所选模型出图（文生 / 有参考图走图生）
  async function runIpGenerate(payload?: IpGenPayload) {
    if (!payload || ipBusy) return;
    const ipModel = payload.model || (payload.ext ? DEFAULT_IP_EXTEND_MODEL : DEFAULT_IP_CREATE_MODEL);
    notifyRegionEnhance(
      toast,
      {
        useLora: false,
        useKB: payload.useKB ?? false,
      },
      ipModel,
    );
    setIpBusy(true);
    setIpTab("history"); // 生成时切到生成历史看进度
    const id = "ip-" + ipRuns.length + "-" + payload.prompt.length;
    const n = Math.max(1, Math.min(4, payload.count || 1));
    const grads = ["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4"].slice(0, n);
    const size = ipRatioToSize(payload.ratioName, payload.customW, payload.customH);
    // IP 创新设计：强制白底，且禁止把角色名等文字画进画面；扩展设计不强加
    const imagePrompt = payload.ext ? payload.prompt : enforceIpCreatePrompt(payload.prompt);

    const row: IpRunRow = {
      id,
      title: payload.title,
      desc: imagePrompt, // 送模描述（创新设计含强制白底）
      rawDesc: payload.rawDesc, // 用户原始创意描述（供 IP 故事）
      ext: payload.ext, // 扩展设计结构化展示信息（卡片头用）
      create: payload.create, // IP创新设计结构化展示信息（卡片头用）
      colors: payload.colors,
      ratioName: payload.ratioName,
      time: nowStamp(),
      pct: 8,
      grads,
      imgs: [],
      regionEnhance: payload.regionEnhance !== false,
      regionId: payload.regionId || regionId,
    };
    setIpRuns((prev) => [row, ...prev]);

    // 进度推进到 90%，剩余 10% 等真图返回
    let pct = 8;
    ipTimer.current = window.setInterval(() => {
      pct = Math.min(90, pct + 7 + (pct % 5));
      setIpRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct } : r)));
    }, 500);

    // 超时兜底：按张数动态放大（网关拥塞时单张可达 40~50s，写死 120s 会把 4 张串行误判超时）。
    // 每张给 90s 预算 + 20s 缓冲，4 张 ≈ 380s 上限；实际每张成功即进入下一张，通常远快于此。
    const ipBudgetMs = grads.length * 90_000 + 20_000;
    if (ipTimeout.current) window.clearTimeout(ipTimeout.current);
    ipTimeout.current = window.setTimeout(() => {
      if (ipTimer.current) window.clearInterval(ipTimer.current);
      ipTimer.current = null;
      ipTimeout.current = null;
      setIpRuns((prev) =>
        prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "生成超时，请稍后重试" } : r))
      );
      setIpBusy(false);
      toast("IP 形象生成超时，请稍后重试", "warn");
    }, ipBudgetMs);

    function finishTimer() {
      if (ipTimer.current) window.clearInterval(ipTimer.current);
      ipTimer.current = null;
      if (ipTimeout.current) { window.clearTimeout(ipTimeout.current); ipTimeout.current = null; }
    }

    // 单张请求：失败自动重试（anyfast 并发会触发限流，重试可救回；最多 3 次、退避递增）
    async function genOne(attempt = 0): Promise<string> {
      try {
        const r = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // 单张独立超时：拥塞时单张可达 40~50s，给 90s；超时则 abort → 走重试，避免个别卡死拖垮整批
          signal: AbortSignal.timeout(90_000),
          // 有参考图（扩展设计的 IP 图，已转 base64 data URL）则走图生图，保持人物一致性
          body: JSON.stringify(
            imageRequestBody({
              prompt: imagePrompt,
              size,
              model: payload!.model || (payload!.ext ? DEFAULT_IP_EXTEND_MODEL : DEFAULT_IP_CREATE_MODEL),
              useLora: false,
              useKB: payload!.useKB ?? false,
              regionId: payload!.regionId || regionId,
              scene: "ip",
              ...(payload!.refImage ? { image: payload!.refImage } : {}),
            }),
          ),
        });
        const j = await r.json() as { images?: string[]; error?: string };
        const errMsg = j?.error ?? "";
        // 配额耗尽 / 内容安全：不重试，直接向上抛带 code 的错误
        if (r.status === 429 || /quota|limit/i.test(errMsg)) {
          throw Object.assign(new Error(errMsg || "quota"), { code: "quota" });
        }
        if (r.status === 400 && /content|safety|policy/i.test(errMsg)) {
          throw Object.assign(new Error(errMsg || "safety"), { code: "safety" });
        }
        const url = (j?.images?.[0] as string) || "";
        if (url) return url;
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === "quota" || code === "safety") throw e; // 不重试
        /* 其他网络错误，落到重试 */
      }
      if (attempt < 3) {
        await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
        return genOne(attempt + 1);
      }
      return "";
    }

    try {
      if (!takeCharge(imageShotPoints(ipModel) * n, "IP 出图")) {
        finishTimer();
        setIpBusy(false);
        setIpRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "算力不足" } : r)));
        toast("算力不足（不可透支）", "warn");
        return;
      }
      // 串行逐张请求（实测串行 4/4 全成功，避免 anyfast 并发限流导致部分 502/空图）
      const imgs: string[] = new Array(grads.length).fill("");
      for (let i = 0; i < grads.length; i++) {
        const url = await genOne();
        imgs[i] = url;
        // 实时回填该位置的图片
        setIpRuns((prev) => prev.map((r) => (r.id === id ? { ...r, imgs: [...imgs] } : r)));
      }
      finishTimer();

      const ok = imgs.filter(Boolean);
      if (ok.length === 0) {
        setIpRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "未能生成合适的结果，请尝试修改描述或参考图" } : r)));
        toast("文生图未返回结果，请调整描述后重试。", "warn");
        return;
      }
      setIpRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: 100, imgs } : r)));
      toast(
        ok.length < grads.length
          ? `已生成 ${ok.length}/${grads.length} 张（部分超时），已存入「我的作品」`
          : `已生成 ${ok.length} 张 IP 形象，已存入「我的作品」`,
      );
      // 图片已展示给用户；后台静默预加载该次的 IP 描述，点开「IP故事」时直接可用
      preloadIpStoryDesc(id, payload);
      // 整批作为一条作品入库（含提示词、配色等生成信息）
      saveAllImageWorks(imgs, {
        emoji: "",
        grad: "thumb-grad-1",
        nameBase: `${payload.title} · IP 设计`,
        sub: "品牌设计 · IP 设计",
        edit: {
          sub: "ip",
          title: payload.title,
          rawDesc: payload.rawDesc?.trim() || "",
          input: payload.prompt,
          colors: payload.colors?.filter(Boolean).join("、") || "",
          ratio: payload.ratioName,
          count: String(n),
        },
      });
    } catch (e) {
      finishTimer();
      const code = (e as { code?: string })?.code;
      const rawMsg = (e as Error)?.message ?? "";
      if (code === "quota") {
        setIpRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "今日生成次数已达上限" } : r)));
        setQuotaOpen(true);
      } else if (code === "safety") {
        setIpRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "描述内容未通过安全审核，请调整后重试" } : r)));
        toast("内容未通过安全审核，请修改描述后重试", "warn");
      } else {
        const display = mapIpError(rawMsg);
        setIpRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: 100, error: display } : r)));
        toast(display, "warn");
      }
    } finally {
      setIpBusy(false);
    }
  }

  // 后台预加载某次 IP 生成的「初版 IP 故事」：据创意描述 + 颜色 + 尺寸调 LLM，
  // 结果写回该行 storyDesc，使「IP故事」弹窗打开即有现成的初版故事（失败则静默，弹窗会现场兜底）
  async function preloadIpStoryDesc(id: string, payload: IpGenPayload) {
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene: "ip-story",
          ipName: payload.title,
          description: (payload.rawDesc && payload.rawDesc.trim()) || payload.prompt,
          preferredColors: payload.colors,
          canvasSize: payload.ratioName,
          ...kbFields(payload.useKB ?? false, payload.regionId || regionId),
        }),
      });
      const ctype = resp.headers.get("Content-Type") || "";
      if (!resp.ok || !resp.body || ctype.includes("application/json")) return; // 出错静默
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const j = JSON.parse(data);
            if (typeof j.text === "string") full += j.text;
          } catch {
            /* 跳过 */
          }
        }
      }
      if (full.trim()) {
        setIpRuns((prev) => prev.map((r) => (r.id === id ? { ...r, storyDesc: full.trim() } : r)));
      }
    } catch {
      /* 预加载失败：静默，弹窗打开时会现场生成兜底 */
    }
  }

  // IP 生成历史「删除」
  function deleteIpRun(id: string) {
    setIpRuns((prev) => prev.filter((r) => r.id !== id));
  }

  // 活动：点「立即生成」→ 右侧生成历史进度卡 → 调文生图/图生图出 N 张真图（N 取生成数量）
  async function runEventGenerate() {
    if (eventBusy) return;
    const isI2i = eventForm.tab === "i2i";
    const useEventKB = !isI2i && eventForm.useKB;
    const useEventLora = !isI2i && eventForm.useLora;

    // 行头展示的描述：图生图用「修改需求」，文生图用「画面描述」
    const prompt = (isI2i ? eventForm.editInput : eventForm.input).trim();

    // 图生图：参考图转 data URL（模型 image 参数需公网 URL / data URL；本地 blob 必须转）
    let refDataUrl = "";
    if (isI2i) {
      if (!eventForm.refImg) {
        toast("请先上传或从仓库选参考图片！", "warn");
        return;
      }
      if (!eventForm.editInput.trim()) {
        toast("请输入图片描述或选择一个图片处理预设！", "warn");
        return;
      }
    } else if (!eventForm.input.trim()) {
      toast("请输入画面描述！", "warn");
      return;
    }
    // 自定义尺寸校验
    if (eventForm.ratio === "自定义") {
      const w = Number(eventForm.customW);
      const h = Number(eventForm.customH);
      if (!w || !h || w < 64 || h < 64) {
        toast("请填写有效的自定义宽高（最小 64px）！", "warn");
        return;
      }
    }
    // 敏感词拦截（本地前置，服务端仍有完整审核）
    const evtBlocked = ["色情", "裸露", "暴力", "毒品", "赌博", "色图", "porn", "nude", "fuck", "shit"];
    if (evtBlocked.some((w) => prompt.toLowerCase().includes(w))) {
      toast("包含不允许的词语，请修改后重试", "warn");
      return;
    }

    notifyRegionEnhance(
      toast,
      { useLora: useEventLora, useKB: useEventKB },
      isI2i ? eventForm.editModel : eventForm.model,
    );
    setEventBusy(true);
    setEventTab("history"); // 切到生成历史看进度

    if (isI2i) {
      refDataUrl = await imgToDataUrl(eventForm.refImg);
      if (!refDataUrl) {
        setEventBusy(false);
        toast("参考图读取失败，请重新上传或换一张。", "warn");
        return;
      }
    }

    // 出图实际用的提示词：文生图在描述后追加画面风格词；图生图直接用修改需求
    // （文生图扩写：统一系统提示词；成图意图用于启用其中的五类专属小节或通用优化）
    const stylePrompt = isI2i ? "" : (paintStyles.find((s) => s.name === eventForm.style)?.prompt || "");
    let genPrompt = stylePrompt ? `${prompt}，${stylePrompt}` : prompt;
    // 图生图「生成相似图」：把相似度（0-100%）写进提示词，滑到多少就保留原图多少。
    if (isI2i && eventForm.editPreset === "生成相似图") {
      const s = Math.max(0, Math.min(100, Math.round(eventForm.refStrength)));
      const isSimTemplate = /^生成相似图(，相似度\d+%)?$/.test(prompt.trim());
      genPrompt =
        `生成与参考图相似的图片，整体保留参考图约 ${s}% 的特征：` +
        `${s >= 80 ? "高度贴近原图，仅做轻微变化" : s >= 50 ? "保留主体与构图，适度变化细节与配色" : s >= 20 ? "借鉴原图风格与氛围，画面可较大自由发挥" : "仅参考原图整体感觉，画面大幅自由发挥"}` +
        (prompt && !isSimTemplate ? `；附加要求：${prompt}` : "");
    }
    // 图生图「改图片尺寸」：把用户选的目标尺寸（比例/自定义宽高）写进提示词，扩展画面到该比例。
    if (isI2i && eventForm.editPreset === "改图片尺寸") {
      const sizeLabel = eventPxLabel(eventForm.ratio, eventForm.customW, eventForm.customH);
      const isSizeTemplate = /^将图片扩展为.*的尺寸$/.test(prompt.trim());
      genPrompt =
        `在不裁切、不变形主体的前提下，将图片自然扩展为「${sizeLabel}」的尺寸，` +
        `补全新增区域的画面内容，保持原有主体、风格、光影与配色一致` +
        (prompt && !isSizeTemplate ? `；附加要求：${prompt}` : "");
    }
    const n = isI2i ? 1 : Math.max(1, Math.min(4, eventForm.count || 1)); // 图生图一次出 1 张
    const allGrads = ["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4"];
    const grads = allGrads.slice(0, n);
    let size = eventRatioToSize(eventForm.ratio, eventForm.customW, eventForm.customH);
    if (isI2i) {
      // 图生图：优先从「修改需求」解析 px 尺寸（如 宽1080 长6000），否则相似图跟样图比例
      if (eventForm.editPreset !== "改图片尺寸") {
        const parsed = parsePxDimensionsFromPrompt(prompt);
        if (parsed) {
          size = eventRatioToSize("自定义", String(parsed.w), String(parsed.h));
        } else if (eventForm.editPreset === "生成相似图" && refDataUrl) {
          const nat = await imageNaturalSize(refDataUrl);
          if (nat?.w && nat?.h) {
            size = eventRatioToSize("自定义", String(nat.w), String(nat.h));
          }
        }
      }
    }
    const id = "ev-" + eventRuns.length + "-" + prompt.length;
    const eventKind = isI2i ? "图生图" : resolveEventPromptKind(eventForm.sub, prompt);

    const row: EventRunRow = {
      id,
      prompt,
      sub: eventKind,
      ratioName: eventForm.ratio,
      customW: eventForm.ratio === "自定义" ? eventForm.customW : undefined,
      customH: eventForm.ratio === "自定义" ? eventForm.customH : undefined,
      time: nowStamp(),
      pct: 8,
      imgs: [],
      grads,
      regionEnhance: useEventLora || useEventKB,
      regionId,
      regionLora: useEventLora && modelSupportsCountyLora(eventForm.model),
      useLora: useEventLora,
      useKB: useEventKB,
    };
    setEventRuns((prev) => [row, ...prev]);

    // 文生图：文案型 brief → 图文混排详情长图（有产品/场景图 + 文案模块）；非纯字
    // 普通短描述 → 识别五类或通用扩写；fromCase 仍直接出图。
    if (!isI2i) {
      if (isCopyHeavyPrompt(prompt)) {
        genPrompt = buildCopyLayoutImagePrompt(prompt, {
          style: eventForm.style,
          ratioLabel: eventRatioLabel(eventForm.ratio, eventForm.customW, eventForm.customH),
          widthPx:
            eventForm.ratio === "自定义"
              ? Number(eventForm.customW) || 1080
              : (() => {
                  const hit = allImageSizePresets.find((s) => s.name === eventForm.ratio);
                  const parsed = hit?.size ? parseDisplaySize(hit.size) : null;
                  return parsed?.w || 1080;
                })(),
        });
        if (stylePrompt) genPrompt = `${genPrompt}，${stylePrompt}`;
        toast("已识别为文案型 brief，将生成图文混排详情长图");
      } else if (!eventForm.fromCase) {
        const expanded = await collectGenerate({
          scene: "t2i-event",
          input: prompt,
          eventSub: eventKind === "通用" ? "自定义" : eventKind,
          imageRatio: eventRatioLabel(eventForm.ratio, eventForm.customW, eventForm.customH),
          artStyle: eventForm.style || "智能匹配",
          ...kbFields(eventForm.useKB, regionId),
        });
        if (expanded) {
          genPrompt = stylePrompt ? `${expanded}，${stylePrompt}` : expanded;
          toast(
            eventKind === "通用"
              ? "已用统一提示词（通用画面优化）扩写"
              : `已用统一提示词，启用「${eventKind}」专属规则扩写`,
          );
        }
      }
    }

    // 进度推进到 90%，剩余等真图返回
    let pct = 8;
    eventTimer.current = window.setInterval(() => {
      pct = Math.min(90, pct + 7 + (pct % 5));
      setEventRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct } : r)));
    }, 500);

    // 超时兜底：按张数动态放大
    const eventBudgetMs = n * 90_000 + 20_000;
    if (eventTimeout.current) window.clearTimeout(eventTimeout.current);
    eventTimeout.current = window.setTimeout(() => {
      if (eventTimer.current) window.clearInterval(eventTimer.current);
      eventTimer.current = null;
      eventTimeout.current = null;
      setEventRuns((prev) =>
        prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "生成超时，请稍后重试" } : r))
      );
      setEventBusy(false);
      toast("活动图生成超时，请稍后重试", "warn");
    }, eventBudgetMs);

    const finishTimer = () => {
      if (eventTimer.current) window.clearInterval(eventTimer.current);
      eventTimer.current = null;
      if (eventTimeout.current) { window.clearTimeout(eventTimeout.current); eventTimeout.current = null; }
    };

    const ERR_SAFETY = "ERR:SAFETY";
    const ERR_QUOTA = "ERR:QUOTA";

    // 单张请求：失败自动重试（最多 3 次、退避递增）；内容安全/配额错误不重试
    async function genOne(attempt = 0): Promise<string> {
      try {
        const r = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(90_000),
          body: JSON.stringify(imageRequestBody({
            prompt: genPrompt,
            size,
            image: refDataUrl || undefined,
            model: isI2i ? eventForm.editModel : eventForm.model,
            useLora: useEventLora && modelSupportsCountyLora(isI2i ? eventForm.editModel : eventForm.model),
            useKB: useEventKB,
            loraIds: eventForm.loraIds,
            loraStrengths: eventForm.loraStrengths,
            regionId,
            artStyleKey: paintStyles.find((s) => s.name === eventForm.style)?.key || "auto",
            scene: "event",
          })),
        });
        if (r.status === 429) return ERR_QUOTA;
        const j = await r.json().catch(() => ({})) as { images?: string[]; fail_reason?: string; error?: string; message?: string };
        if (r.status === 400) {
          const msg = String(j?.error ?? j?.message ?? "").toLowerCase();
          if (msg.includes("content") || msg.includes("safety") || msg.includes("policy")) return ERR_SAFETY;
        } else {
          const failReason = String(j?.fail_reason ?? "").toLowerCase();
          if (failReason.includes("content") || failReason.includes("safety") || failReason.includes("policy")) return ERR_SAFETY;
          if (failReason.includes("quota") || failReason.includes("limit")) return ERR_QUOTA;
          const url = j?.images?.[0] || "";
          if (url) return url;
        }
      } catch {
        /* 网络错误，落到重试 */
      }
      if (attempt < 3) {
        await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
        return genOne(attempt + 1);
      }
      return "";
    }

    try {
      if (!takeCharge(eventImagePoints(isI2i ? "i2i" : "t2i", n, isI2i ? eventForm.editModel : eventForm.model), "活动出图")) {
        finishTimer();
        setEventBusy(false);
        setEventRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "算力不足" } : r)));
        toast("算力不足（不可透支）", "warn");
        return;
      }
      const imgs: string[] = new Array(n).fill("");
      for (let i = 0; i < n; i++) {
        const result = await genOne();
        if (result === ERR_SAFETY) {
          finishTimer();
          setEventRuns((prev) =>
            prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "描述内容未通过安全审核，请调整后重试" } : r))
          );
          return;
        }
        if (result === ERR_QUOTA) {
          finishTimer();
          setEventRuns((prev) =>
            prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "今日生成次数已达上限" } : r))
          );
          setQuotaOpen(true);
          return;
        }
        imgs[i] = result;
        setEventRuns((prev) => prev.map((r) => (r.id === id ? { ...r, imgs: [...imgs] } : r)));
      }
      finishTimer();
      const ok = imgs.filter(Boolean);
      if (ok.length === 0) {
        setEventRuns((prev) =>
          prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "未能生成合适的结果，请尝试修改描述或参考图" } : r))
        );
        return;
      }
      setEventRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: 100, imgs } : r)));
      toast(
        ok.length < n
          ? `已生成 ${ok.length}/${n} 张（部分超时），已存入「我的作品」`
          : `已生成 ${ok.length} 张活动图，已存入「我的作品」`,
      );
      try {
        saveAllImageWorks(imgs, {
          emoji: "",
          grad: "thumb-grad-1",
          nameBase: `${prompt.slice(0, 12) || "活动图"} · 活动`,
          sub: "品牌设计 · 活动",
          edit: {
            sub: "event",
            input: prompt,
            eventSub: eventKind,
            ratio: eventRatioLabel(eventForm.ratio, eventForm.customW, eventForm.customH),
            style: eventForm.style || "",
            tab: eventForm.tab,
            refImg: eventForm.refImg || "",
            refName: eventForm.refName || "",
            editInput: eventForm.editInput || "",
            refStrength: String(eventForm.refStrength ?? ""),
            model: eventForm.model || "",
            count: String(eventForm.count || 1),
          },
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
          toast("本地存储空间不足，历史记录可能无法保存", "warn");
        }
      }
    } catch {
      finishTimer();
      setEventRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "网络连接失败，请稍后重试" } : r)));
      toast("网络错误，活动图生成失败。", "warn");
    } finally {
      setEventBusy(false);
    }
  }

  // 活动生成历史「删除」
  function deleteEventRun(id: string) {
    setEventRuns((prev) => prev.filter((r) => r.id !== id));
  }

  function deleteProductRun(id: string) {
    setProductRuns((prev) => prev.filter((r) => r.id !== id));
  }

  // 商品出图台：按任务类型调 API 或本地抠图出 N 张商拍图
  async function runProductStudio() {
    if (productBusy) return;
    const { task, productImg, productName, desc: descRaw, scenePreset, bgMode, bgColor, size, customW, customH, count, fromCase, fusionImgs } = productForm;
    const desc = expandProductDescLexicon(descRaw);

    // 校验：商品实拍图全模式必填
    if (!productImg) { toast("请先上传商品图！", "warn"); return; }
    // 自定义尺寸校验
    if (size === "自定义") {
      const w = Number(customW), h = Number(customH);
      if (!w || !h || w < 64 || h < 64) {
        toast("请填写有效的自定义宽高（最小 64px）！", "warn"); return;
      }
    }

    notifyRegionEnhance(toast, { useLora: productForm.useLora, useKB: false }, productForm.useLora ? QWEN_T2I_LOCAL : PRODUCT_IMAGE_MODEL);
    setProductBusy(true);
    setProductTab("history");

    const finalSize = eventRatioToSize(size, customW, customH);
    const sceneEntry = productScenePresets.find((s) => s.name === scenePreset);
    const scenePrompt = sceneEntry?.prompt || scenePreset;

    // 换底抠图 · 本地抠图（白底/透明/色底）：不走 /api/image
    if (isProductBgLocalCut(bgMode)) {
      if (!takeCharge(POINT_COST.imageMatte, "智能抠图")) {
        setProductBusy(false);
        toast("算力不足（不可透支）", "warn");
        return;
      }
      try {
        const localMode = bgMode === "cutwhite" ? "white" : bgMode === "transparent" ? "transparent" : "color";
        const result = await cutoutProduct(productImg, localMode, bgMode === "color" ? bgColor : undefined);
        const id = "pd-" + productRuns.length + "-cutout-" + Date.now();
        const modeLabel = bgMode === "cutwhite" ? "抠图白底" : bgMode === "transparent" ? "透明底" : `抠图色底 ${bgColor}`;
        const row: EventRunRow = {
          id,
          prompt: `换底抠图（${modeLabel}）`,
          sub: "换底抠图",
          ratioName: size,
          time: nowStamp(),
          pct: 100,
          imgs: [result],
          grads: ["thumb-grad-1"],
        };
        setProductRuns((prev) => [row, ...prev]);
        addWork({
          emoji: "",
          grad: "thumb-grad-1",
          kind: "图片",
          name: `${productName || desc.slice(0, 12) || "商品图"} · 抠图 1`,
          sub: "品牌设计 · 商拍",
          module: "image",
          img: result,
          time: nowStamp(),
          edit: { sub: "product", input: desc },
        });
        toast("抠图完成，已存入「我的作品」");
      } catch {
        toast("抠图失败，请检查图片后重试", "warn");
      } finally {
        setProductBusy(false);
      }
      return;
    }

    // 构建 jobs 列表
    type Job = { label: string; prompt: string; useRef: boolean; refImage?: string };
    const jobs: Job[] = [];

    if (bgMode === "scene") {
      const prompt = `${PRODUCT_REF_KEEP}。将参考图中的商品主体精准保留并融合到「${scenePrompt}」场景，商品为主体，光影方向与场景一致，自然合成，${PRODUCT_DEAI_SUFFIX}`;
      jobs.push({ label: "换底抠图·场景底", prompt, useRef: true });
    } else if (isProductBgAi(bgMode)) {
      const n = Math.max(1, Math.min(4, count));
      const hasRef = !!productImg;
      const uploadScene = scenePreset === PRODUCT_AI_SCENE_UPLOAD;
      if (uploadScene && !fusionImgs[0]) {
        setProductBusy(false);
        toast("请先上传场景补充图", "warn");
        return;
      }
      const sceneImgPath = uploadScene ? "" : resolveProductSceneImg(scenePreset);
      const sceneImg = uploadScene
        ? fusionImgs[0]
        : sceneImgPath || "";
      const useSceneImg = !!(hasRef && sceneImg
        && scenePreset !== PRODUCT_AI_SCENE_NONE
        && scenePreset !== PRODUCT_AI_SCENE_COLOR
        && scenePreset !== PRODUCT_AI_SCENE_WHITE);

      let mixedRef = "";
      if (useSceneImg) {
        mixedRef = (await composeFusionReference([productImg, sceneImg])) || "";
        // 合成失败不阻断：退回「仅商品图 + 文字场景」，仍可出图
        if (!mixedRef && hasRef) {
          toast("场景拼图未成功，已改用商品图 + 文字场景继续出图", "warn");
        }
      }

      const fusedOk = !!(useSceneImg && mixedRef);
      const basePrompt = fusedOk
        ? uploadScene
          ? `${PRODUCT_REF_KEEP}。将商品实拍图作为主体，放入补充场景图所示环境` +
            `${desc ? `，并结合以下描述：${desc}` : ""}，` +
            `商品为主体，光影方向与场景一致，接触阴影自然，画面真实不拼贴感，${PRODUCT_DEAI_SUFFIX}`
          : `${PRODUCT_REF_KEEP}。将商品实拍图作为主体，放入场景参考图所示的「${scenePreset}」环境（${scenePrompt}），` +
            `商品为主体，光影方向与场景一致，接触阴影自然，画面真实不拼贴感，${PRODUCT_DEAI_SUFFIX}`
        : buildAiScenePrompt({
            productName,
            desc,
            scenePreset,
            bgColor,
            scenePrompt,
            hasRef,
          });
      const label = aiSceneJobLabel(scenePreset);
      for (let i = 0; i < n; i++) {
        jobs.push({
          label,
          prompt: basePrompt,
          useRef: hasRef || fusedOk,
          ...(mixedRef ? { refImage: mixedRef } : {}),
        });
      }
    }

    if (jobs.length === 0) {
      setProductBusy(false);
      toast("没有待出图的任务，请检查配置", "warn");
      return;
    }
    if (!takeCharge(imageShotPoints(PRODUCT_IMAGE_MODEL) * jobs.length, "商拍出图")) {
      setProductBusy(false);
      toast("算力不足（不可透支）", "warn");
      return;
    }

    const totalJobs = jobs.length;
    const grads = ["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4"].slice(0, Math.min(totalJobs, 4));
    const rowId = "pd-" + productRuns.length + "-" + task + "-" + Date.now();
    const taskName = productTasks.find((t) => t.key === task)?.name || task;

    const row: EventRunRow = {
      id: rowId,
      prompt: jobs[0]?.label || taskName,
      sub: taskName,
      ratioName: size,
      time: nowStamp(),
      pct: 8,
      imgs: [],
      grads,
      regionEnhance: productForm.useLora,
      regionId,
      regionLora: productForm.useLora,
      useLora: productForm.useLora,
      useKB: false,
    };
    setProductRuns((prev) => [row, ...prev]);

    // 进度推进到 90%
    let pct = 8;
    productTimer.current = window.setInterval(() => {
      pct = Math.min(90, pct + 7 + (pct % 5));
      setProductRuns((prev) => prev.map((r) => (r.id === rowId ? { ...r, pct } : r)));
    }, 500);

    const budgetMs = totalJobs * 90_000 + 20_000;
    if (productTimeout.current) window.clearTimeout(productTimeout.current);
    productTimeout.current = window.setTimeout(() => {
      if (productTimer.current) window.clearInterval(productTimer.current);
      productTimer.current = null;
      productTimeout.current = null;
      setProductRuns((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, pct: 100, error: "生成超时，请稍后重试" } : r))
      );
      setProductBusy(false);
      toast("商拍图生成超时，请稍后重试", "warn");
    }, budgetMs);

    const finishTimer = () => {
      if (productTimer.current) window.clearInterval(productTimer.current);
      productTimer.current = null;
      if (productTimeout.current) { window.clearTimeout(productTimeout.current); productTimeout.current = null; }
    };

    const ERR_SAFETY = "ERR:SAFETY";
    const ERR_QUOTA = "ERR:QUOTA";

    async function genOnePdDemo(refDataUrl: string): Promise<string> {
      return demoProductGenerate({
        bgMode,
        scenePreset,
        bgColor,
        productImg: productImg || "",
        fusionImg: fusionImgs[0],
        refImage: refDataUrl || undefined,
      });
    }

    async function genOnePd(jobPrompt: string, refDataUrl: string, attempt = 0): Promise<string> {
      // 仅静态导出 / DEMO：无 /api/image 时走本地抠图合成
      if (shouldUseProductDemo()) return genOnePdDemo(refDataUrl);
      try {
        const r = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(90_000),
          body: JSON.stringify(imageRequestBody({
            prompt: jobPrompt,
            size: finalSize,
            model: PRODUCT_IMAGE_MODEL,
            image: refDataUrl || undefined,
            useLora: productForm.useLora,
            useKB: false,
            regionId,
          })),
        });
        if (r.status === 404 || r.status === 503) return "";
        if (r.status === 429) return ERR_QUOTA;
        const j = await r.json().catch(() => ({})) as { images?: string[]; fail_reason?: string; error?: string; message?: string };
        if (r.status === 400) {
          const msg = String(j?.error ?? j?.message ?? "").toLowerCase();
          if (msg.includes("content") || msg.includes("safety") || msg.includes("policy")) return ERR_SAFETY;
        } else {
          const failReason = String(j?.fail_reason ?? "").toLowerCase();
          if (failReason.includes("content") || failReason.includes("safety") || failReason.includes("policy")) return ERR_SAFETY;
          if (failReason.includes("quota") || failReason.includes("limit")) return ERR_QUOTA;
          const url = j?.images?.[0] || "";
          if (url) return url;
        }
      } catch {
        /* retry below */
      }
      if (attempt < 3) {
        await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
        return genOnePd(jobPrompt, refDataUrl, attempt + 1);
      }
      return "";
    }

    try {
      const imgs: string[] = new Array(totalJobs).fill("");

      for (let i = 0; i < totalJobs; i++) {
        const job = jobs[i];
        let jobPrompt = job.prompt;

        // 扩写提示词：有商品实拍时跳过（避免 LLM 改写商品导致不跟参考图）；
        // fromCase / 本地抠图·场景底 同样跳过；AI 白底/色底无实拍时仍可扩写
        const skipExpand =
          DEMO ||
          fromCase ||
          !!productImg ||
          (!isProductBgAi(bgMode) && !isProductBgBatch(bgMode));
        if (!skipExpand) {
          const expanded = await collectGenerate({
            scene: "t2i-product",
            input: job.prompt,
            eventSub:
              bgMode === "aiscene"
                ? aiSceneExpandSub(scenePreset)
                : taskToExpandSub("white"),
            imageRatio: eventRatioLabel(size, customW, customH),
            ...kbFields(false, regionId),
          });
          if (expanded) jobPrompt = expanded;
        }
        // 有实拍时再钉一次保主体约束（防止提示词被改写后丢失）
        if (job.useRef && productImg && !jobPrompt.includes("严格保留参考图")) {
          jobPrompt = `${PRODUCT_REF_KEEP}。${jobPrompt}`;
        }

        let refDataUrl = job.refImage || "";
        if (!refDataUrl && job.useRef && productImg) {
          refDataUrl = await imgToDataUrl(productImg);
          if (!refDataUrl) {
            finishTimer();
            setProductRuns((prev) =>
              prev.map((r) => (r.id === rowId ? { ...r, pct: 100, error: "实拍图读取失败，请重新上传" } : r))
            );
            toast("实拍图读取失败，请重新上传后重试", "warn");
            return;
          }
        }

        const result = await genOnePd(jobPrompt, refDataUrl);
        if (result === ERR_SAFETY) {
          finishTimer();
          setProductRuns((prev) =>
            prev.map((r) => (r.id === rowId ? { ...r, pct: 100, error: "描述内容未通过安全审核，请调整后重试" } : r))
          );
          return;
        }
        if (result === ERR_QUOTA) {
          finishTimer();
          setProductRuns((prev) =>
            prev.map((r) => (r.id === rowId ? { ...r, pct: 100, error: "今日生成次数已达上限" } : r))
          );
          setQuotaOpen(true);
          return;
        }
        imgs[i] = result;
        setProductRuns((prev) => prev.map((r) => (r.id === rowId ? { ...r, imgs: [...imgs] } : r)));
      }

      finishTimer();
      const ok = imgs.filter(Boolean);
      if (ok.length === 0) {
        setProductRuns((prev) =>
          prev.map((r) => (r.id === rowId ? { ...r, pct: 100, error: "未能生成合适的结果，请尝试修改描述或商品图" } : r))
        );
        return;
      }
      setProductRuns((prev) => prev.map((r) => (r.id === rowId ? { ...r, pct: 100, imgs } : r)));
      toast(
        ok.length < totalJobs
          ? `已生成 ${ok.length}/${totalJobs} 张（部分超时），已存入「我的作品」`
          : DEMO
            ? `已生成 ${ok.length} 张商拍演示图（离线本地合成），已存入「我的作品」`
            : `已生成 ${ok.length} 张商拍图，已存入「我的作品」`,
      );
      try {
        const productImgSaved = await persistableImageRef(productImg);
        const fusionImg1Saved = await persistableImageRef(productForm.fusionImgs[0]);
        const fusionImg2Saved = await persistableImageRef(productForm.fusionImgs[1]);
        const fusionImg3Saved = await persistableImageRef(productForm.fusionImgs[2]);
        saveAllImageWorks(imgs, {
          emoji: "",
          grad: "thumb-grad-1",
          nameBase: `${productName || desc.slice(0, 12) || "商品图"} · ${taskName}`,
          sub: "品牌设计 · 商拍",
          edit: {
            sub: "product",
            input: desc,
            task: taskName,
            taskKey: task,
            productName: productName || "",
            productImg: productImgSaved,
            productLabel: productForm.productLabel || "",
            bgMode: bgMode,
            scenePreset: scenePreset || "",
            bgColor: bgColor || "",
            size: size || "",
            customW: customW || "",
            customH: customH || "",
            count: String(count || 1),
            angles: (productForm.angles || []).join("、"),
            customAnglePrompt: productForm.customAnglePrompt || "",
            refinePreset: productForm.refinePreset || "",
            fusionImg1: fusionImg1Saved,
            fusionImg2: fusionImg2Saved,
            fusionImg3: fusionImg3Saved,
            fusionLabel1: productForm.fusionLabels[0] || "",
            fusionLabel2: productForm.fusionLabels[1] || "",
            fusionLabel3: productForm.fusionLabels[2] || "",
            regionEnhance: String(productForm.useLora),
            useLora: String(productForm.useLora),
            useKB: "false",
          },
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
          toast("本地存储空间不足，历史记录可能无法保存", "warn");
        }
      }
    } catch {
      finishTimer();
      setProductRuns((prev) => prev.map((r) => (r.id === rowId ? { ...r, pct: 100, error: "网络连接失败，请稍后重试" } : r)));
      toast("网络错误，商拍图生成失败。", "warn");
    } finally {
      setProductBusy(false);
    }
  }

  function deleteSignageRun(id: string) {
    setSignageRuns((prev) => prev.filter((r) => r.id !== id));
  }

  /** 店招设计：校验店名 → 进度行 → /api/image（404/503/DEMO 走本地合成） */
  async function runSignageGenerate() {
    if (signageBusy) return;
    const {
      shopName,
      slogan,
      industry,
      style,
      logoImg,
      refImg,
      size,
      customW,
      customH,
      count,
      channel,
      storefrontType,
      fromCase,
      extraDesc,
    } = signageForm;

    if (!shopName.trim()) {
      toast("请填写店铺名称！", "warn");
      return;
    }
    if (size === "自定义") {
      const w = Number(customW),
        h = Number(customH);
      if (!w || !h || w < 64 || h < 64) {
        toast("请填写有效的自定义宽高（最小 64px）！", "warn");
        return;
      }
    }

    notifyRegionEnhance(toast, { useLora: signageForm.useLora, useKB: signageForm.useKB });
    setSignageBusy(true);
    setSignageTab("history");

    const { w: pixelW, h: pixelH } = resolveSignageSize({
      channel,
      size,
      customW,
      customH,
      platform: signageForm.platform,
    });
    const sizeLabel = `${pixelW}×${pixelH}`;
    const finalSize = `${pixelW}x${pixelH}`;
    const hasLogo = !!logoImg;
    const prompt = fromCase && extraDesc.trim()
      ? extraDesc.trim()
      : buildSignagePrompt({
          channel,
          shopName,
          slogan,
          industry,
          style,
          sizeLabel: channel === "storefront" ? `${size}（${sizeLabel}）` : `${size}（${sizeLabel} 通栏比例）`,
          storefrontType,
          hasLogo,
          extra: extraDesc,
        });

    const n = Math.max(1, Math.min(4, count));
    const grads = ["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4"].slice(0, n);
    const rowId = "sg-" + signageRuns.length + "-" + Date.now();
    const row: EventRunRow = {
      id: rowId,
      prompt: `${shopName.trim()} · ${size}`,
      sub: channel === "storefront" ? "实体门头" : "线上店招",
      ratioName: size,
      time: nowStamp(),
      pct: 8,
      imgs: [],
      grads,
      regionEnhance: signageForm.useLora || signageForm.useKB,
      regionId,
      regionLora: signageForm.useLora && modelSupportsCountyLora(SIGNAGE_IMAGE_MODEL),
      useLora: signageForm.useLora,
      useKB: signageForm.useKB,
    };
    setSignageRuns((prev) => [row, ...prev]);

    let pct = 8;
    signageTimer.current = window.setInterval(() => {
      pct = Math.min(90, pct + 7 + (pct % 5));
      setSignageRuns((prev) => prev.map((r) => (r.id === rowId ? { ...r, pct } : r)));
    }, 500);

    const budgetMs = n * 90_000 + 20_000;
    if (signageTimeout.current) window.clearTimeout(signageTimeout.current);
    signageTimeout.current = window.setTimeout(() => {
      if (signageTimer.current) window.clearInterval(signageTimer.current);
      signageTimer.current = null;
      signageTimeout.current = null;
      setSignageRuns((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, pct: 100, error: "生成超时，请稍后重试" } : r)),
      );
      setSignageBusy(false);
      toast("店招生成超时，请稍后重试", "warn");
    }, budgetMs);

    const finishTimer = () => {
      if (signageTimer.current) window.clearInterval(signageTimer.current);
      signageTimer.current = null;
      if (signageTimeout.current) {
        window.clearTimeout(signageTimeout.current);
        signageTimeout.current = null;
      }
    };

    const ERR_SAFETY = "ERR:SAFETY";
    const ERR_QUOTA = "ERR:QUOTA";

    async function genOneSgDemo(): Promise<string> {
      let logoData = "";
      if (logoImg) {
        try {
          logoData = await imgToDataUrl(logoImg);
        } catch {
          logoData = logoImg;
        }
      }
      return demoSignageGenerate({
        shopName: shopName.trim(),
        slogan,
        width: pixelW,
        height: pixelH,
        logoImg: logoData || undefined,
        industry,
      });
    }

    async function genOneSg(jobPrompt: string, refDataUrl: string, attempt = 0): Promise<string> {
      if (shouldUseSignageDemo()) return genOneSgDemo();
      try {
        const r = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(90_000),
          body: JSON.stringify(imageRequestBody({
            prompt: jobPrompt,
            size: finalSize,
            model: SIGNAGE_IMAGE_MODEL,
            image: refDataUrl || undefined,
            useLora: false,
            useKB: signageForm.useKB,
            regionId,
          })),
        });
        if (r.status === 404 || r.status === 503) return "";
        if (r.status === 429) return ERR_QUOTA;
        const j = (await r.json().catch(() => ({}))) as {
          images?: string[];
          fail_reason?: string;
          error?: string;
          message?: string;
        };
        if (r.status === 400) {
          const msg = String(j?.error ?? j?.message ?? "").toLowerCase();
          if (msg.includes("content") || msg.includes("safety") || msg.includes("policy")) return ERR_SAFETY;
        } else {
          const failReason = String(j?.fail_reason ?? "").toLowerCase();
          if (failReason.includes("content") || failReason.includes("safety") || failReason.includes("policy"))
            return ERR_SAFETY;
          if (failReason.includes("quota") || failReason.includes("limit")) return ERR_QUOTA;
          const url = j?.images?.[0] || "";
          if (url) return url;
        }
      } catch {
        /* retry below */
      }
      if (attempt < 3) {
        await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
        return genOneSg(jobPrompt, refDataUrl, attempt + 1);
      }
      return "";
    }

    try {
      const refSrc = logoImg || refImg;
      let refDataUrl = "";
      if (refSrc) {
        refDataUrl = await imgToDataUrl(refSrc);
        if (!refDataUrl) {
          finishTimer();
          setSignageRuns((prev) =>
            prev.map((r) => (r.id === rowId ? { ...r, pct: 100, error: "参考图读取失败，请重新上传" } : r)),
          );
          toast("参考图读取失败，请重新上传后重试", "warn");
          return;
        }
      }

      if (!takeCharge(imageShotPoints(SIGNAGE_IMAGE_MODEL) * n, "店招出图")) {
        finishTimer();
        setSignageBusy(false);
        setSignageRuns((prev) => prev.map((r) => (r.id === rowId ? { ...r, pct: 100, error: "算力不足" } : r)));
        toast("算力不足（不可透支）", "warn");
        return;
      }
      const imgs: string[] = new Array(n).fill("");
      for (let i = 0; i < n; i++) {
        const result = await genOneSg(prompt, refDataUrl);
        if (result === ERR_SAFETY) {
          finishTimer();
          setSignageRuns((prev) =>
            prev.map((r) =>
              r.id === rowId ? { ...r, pct: 100, error: "描述内容未通过安全审核，请调整后重试" } : r,
            ),
          );
          return;
        }
        if (result === ERR_QUOTA) {
          finishTimer();
          setSignageRuns((prev) =>
            prev.map((r) => (r.id === rowId ? { ...r, pct: 100, error: "今日生成次数已达上限" } : r)),
          );
          setQuotaOpen(true);
          return;
        }
        imgs[i] = result;
        setSignageRuns((prev) => prev.map((r) => (r.id === rowId ? { ...r, imgs: [...imgs] } : r)));
      }

      finishTimer();
      const ok = imgs.filter(Boolean);
      if (ok.length === 0) {
        setSignageRuns((prev) =>
          prev.map((r) =>
            r.id === rowId ? { ...r, pct: 100, error: "未能生成合适的结果，请尝试修改店名或风格" } : r,
          ),
        );
        return;
      }
      setSignageRuns((prev) => prev.map((r) => (r.id === rowId ? { ...r, pct: 100, imgs } : r)));
      toast(
        ok.length < n
          ? `已生成 ${ok.length}/${n} 张（部分超时），已存入「我的作品」`
          : DEMO
            ? `已生成 ${ok.length} 张${channel === "storefront" ? "门头" : "店招"}演示图（离线本地合成），已存入「我的作品」`
            : `已生成 ${ok.length} 张${channel === "storefront" ? "门头" : "店招"}图，已存入「我的作品」`,
      );
      try {
        const logoImgSaved = await persistableImageRef(logoImg);
        const refImgSaved = await persistableImageRef(refImg);
        saveAllImageWorks(imgs, {
          emoji: "",
          grad: "thumb-grad-5",
          nameBase: `${shopName.trim()} · ${channel === "storefront" ? "实体门头" : "店招"}`,
          sub: "品牌设计 · 店招",
          edit: {
            sub: "signage",
            shopName: shopName.trim(),
            slogan: slogan?.trim() || "",
            industry: industry || "",
            style: style || "",
            channel: channel === "storefront" ? "实体门头" : "线上店招",
            storefrontType: storefrontType || "",
            platform: signageForm.platform || "",
            size: size || "",
            customW: customW || "",
            customH: customH || "",
            logoImg: logoImgSaved,
            logoLabel: signageForm.logoLabel || "",
            refImg: refImgSaved,
            refLabel: signageForm.refLabel || "",
            count: String(count || 1),
            regionEnhance: String(signageForm.useLora || signageForm.useKB),
            useLora: String(signageForm.useLora),
            useKB: String(signageForm.useKB),
            input: extraDesc?.trim() || shopName.trim(),
          },
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
          toast("本地存储空间不足，历史记录可能无法保存", "warn");
        }
      }
    } catch {
      finishTimer();
      setSignageRuns((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, pct: 100, error: "网络连接失败，请稍后重试" } : r)),
      );
      toast("网络错误，店招生成失败。", "warn");
    } finally {
      setSignageBusy(false);
    }
  }

  // 活动生成历史「复制描述到左侧」
  function copyEventRun(prompt: string) {
    setEventForm({ ...eventForm, tab: "t2i", input: prompt });
    toast("已复制描述到左侧");
  }

  function copyProductRun(prompt: string) {
    setProductForm({ ...productForm, desc: prompt });
    toast("已复制描述到左侧");
  }

  function copySignageRun(prompt: string) {
    // 历史行 prompt 多为「店名 · 尺寸」；若含完整描述则放进 extraDesc
    const shop = prompt.split("·")[0]?.trim();
    if (shop && shop.length <= 24) {
      setSignageForm({ ...signageForm, shopName: shop });
    } else {
      setSignageForm({ ...signageForm, extraDesc: prompt });
    }
    toast("已复制到左侧");
  }

  // 生成历史「复制」：把字体记录回填到左侧表单
  function copyFontRun(text: string, effect: string) {
    const eff = fontEffects.find((f) => f.name === effect);
    setFontForm((prev) => ({
      ...prev,
      text,
      cat: eff?.cat ?? prev.cat,
      effect: eff?.name ?? prev.effect,
    }));
    toast("已复制该记录到左侧，可调整后点击「立即生成」");
  }

  // AI字体 参考灵感：把案例的文字 / 分类 / 风格回填到左侧表单
  function useFontCase(c: FontCase) {
    const matched = fontEffects.find((f) => f.cat === c.cat && f.name.includes(c.tag));
    setFontForm((prev) => ({
      ...prev,
      text: c.text,
      cat: c.cat as FontCat,
      effect: matched?.name ?? fontEffects.find((f) => f.cat === c.cat)?.name ?? prev.effect,
    }));
    toast(`已套用「${c.text}」，可在左侧调整后点击「立即生成」`);
  }

  // AI字体 字体故事「立即使用」：套用该字体效果，文字内容留待用户填写
  function useFontStory(s: FontStory) {
    const matched = fontEffects.find((f) => f.name === s.name) ?? fontEffects.find((f) => f.cat === s.cat);
    setFontForm((prev) => ({
      ...prev,
      cat: (matched?.cat ?? s.cat) as FontCat,
      effect: matched?.name ?? prev.effect,
    }));
    toast(`已套用字体「${s.name}」，在左侧输入文字内容后点击「立即生成」`);
  }

  const panel =
    active === "event" ? (
      <ImageEventPanel type={type} state={eventForm} setState={setEventForm} onGenerate={runGenerate} loading={eventBusy} onOpenImg2Text={() => setI2tOpen(true)} onOpenStyle={() => setStyleOpen(true)} onOpenLibrary={() => setEventLibOpen(true)} />
    ) : active === "product" ? (
      <ImageProductPanel
        state={productForm}
        setState={setProductForm}
        onGenerate={runGenerate}
        loading={productBusy}
        onOpenLibrary={() => setProductLibOpen(true)}
        onOpenFusionLibrary={() => setProductFusionLibOpen(true)}
      />
    ) : active === "signage" ? (
      <ImageSignagePanel
        state={signageForm}
        setState={setSignageForm}
        onGenerate={runGenerate}
        loading={signageBusy}
        onOpenLogoLibrary={() => setSignageLogoLibOpen(true)}
        onOpenRefLibrary={() => setSignageRefLibOpen(true)}
      />
    ) : active === "logo" ? (
      <ImageLogoPanel state={logoForm} setState={setLogoForm} onGenerate={runLogoGenerate} loading={logoBusy} />
    ) : active === "ip" ? (
      <ImageIpPanel
        onGenerate={runIpGenerate}
        loading={ipBusy}
        onPropose={handlePropose}
        proposeFill={proposeFill}
        copyFill={copyFill}
        fillSeq={fillSeq}
        designTab={ipDesignTab}
        onDesignTabChange={setIpDesignTab}
        extendSeed={ipExtendSeed}
        onExtendSeedUsed={() => setIpExtendSeed(null)}
      />
    ) : active === "font" ? (
      <FontPanel state={fontForm} setState={setFontForm} onGenerate={runFontGenerate} loading={fontBusy} />
    ) : (
      <ImageDefaultPanel type={type} state={defForm} setState={setDefForm} onGenerate={runGenerate} loading={sim.state.open} />
    );

  // 右侧结果区
  let resultArea: React.ReactNode;
  if (active === "ip") {
    // IP 设计：右侧始终展示生成历史（进度卡片 + 真实出图）；点「帮我提案」时提案面板浮在其上
    resultArea = (
      <>
        <IpGallery
          tab={ipTab}
          setTab={setIpTab}
          runRows={ipRuns}
          highlightId={highlightRow ?? undefined}
          onDeleteRun={deleteIpRun}
          onCopyRun={(payload) => {
            // 切到对应设计 tab，再把整条记录的结构化信息回填到左侧
            setIpDesignTab(payload.kind);
            setProposeFill(payload.desc);
            setCopyFill(payload);
            setFillSeq((n) => n + 1);
            toast(payload.kind === "extend" ? "已复制到左侧（含 IP 图）" : "已复制到左侧（含颜色/尺寸）");
          }}
          onUseCase={(c) => {
            // 制作同款：回填创意描述 + 偏好颜色 + 画面尺寸到左侧
            setIpDesignTab("create");
            setProposeFill(c.desc);
            setCopyFill({ kind: "create", desc: c.desc, colors: c.colors, ratioName: c.ratioName });
            setFillSeq((n) => n + 1);
            toast(`已套用「${c.name}」，可在左侧调整后点击「立即生成」`);
          }}
          onExtend={handleIpExtend}
          onGenerate={runIpGenerate}
        />
        {proposeOpen && (
          <ProposePanel
            initialText={proposeInit}
            onClose={() => setProposeOpen(false)}
            onGenerate={(text) => {
              if (text.trim()) setProposeFill(text.trim());
              setProposeOpen(false);
              toast("已生成创意提案并填入描述");
            }}
            regionEnhance={proposeUseKB}
            regionId={regionId}
          />
        )}
      </>
    );
  } else if (active === "font") {
    resultArea = (
      <FontGallery
        tab={fontTab}
        setTab={setFontTab}
        runRows={fontRuns}
        highlightId={highlightRow ?? undefined}
        onUseCase={useFontCase}
        onUseStory={useFontStory}
        onCopy={copyFontRun}
        onDeleteRun={deleteFontRun}
      />
    );
  } else if (active === "logo") {
    resultArea = (
      <LogoGallery
        tab={logoTab}
        setTab={setLogoTab}
        runRows={logoRuns}
        highlightId={highlightRow ?? undefined}
        onUseCase={useLogoCase}
        onCopy={copyLogoHistory}
        onDeleteRun={deleteLogoRun}
      />
    );
  } else if (hasResult) {
    const sizeName = active === "event" ? eventForm.ratio : defForm.size;
    const modelName = active === "event" ? eventForm.model : defForm.model;
    const count = active === "event" ? eventForm.count : defForm.count;
    const refS = active === "event" ? "—" : `${defForm.refStrength}%`;
    resultArea = (
      <ImageResult count={count} size={sizeName} model={modelName} refStrength={refS} onRegenerate={runGenerate} />
    );
  } else if (active === "event") {
    resultArea = (
      <>
        <ActiveGallery
          sub={eventForm.sub === "自定义" ? "" : eventForm.sub}
          workTag="活动"
          tab={eventTab}
          setTab={setEventTab}
          runRows={eventRuns}
          highlightId={highlightRow ?? undefined}
          onDeleteRun={deleteEventRun}
          onCopyRun={copyEventRun}
          onUseCase={(it) => {
            // 套用灵感模版：回填画面描述 + 成图类型 + 该样张原图尺寸（自定义宽高还原比例）。
            // 样张提示词本就是完整画面描述 → 标记 fromCase，立即生成时不再走系统提示词二次扩写。
            setEventForm({ ...eventForm, tab: "t2i", sub: it.sub, input: it.prompt ?? eventForm.input, fromCase: !!it.prompt, ...caseSizeFields(it) });
          }}
          onPickCate={(it) => {
            // 点灵感卡片：左侧成图类型 + 该样张原图尺寸跳转（不动画面描述）
            setEventForm({ ...eventForm, tab: "t2i", sub: it.sub, ...caseSizeFields(it) });
          }}
        />
        {i2tOpen && (
          <Img2TextModal
            onClose={() => setI2tOpen(false)}
            onResult={(text) => {
              // 图转文结果填入左侧画面描述；该结果已是完整画面描述 → fromCase，跳过二次扩写
              setEventForm({ ...eventForm, tab: "t2i", input: text, fromCase: true });
            }}
            prompt={EVENT_IMG2TEXT_PROMPT}
            {...kbFields(eventForm.useKB, regionId)}
          />
        )}
        {styleOpen && (
          <PaintStyleModal
            current={eventForm.style}
            onClose={() => setStyleOpen(false)}
            onPick={(styleName) => setEventForm({ ...eventForm, style: styleName })}
          />
        )}
        {eventLibOpen && (
          <LibraryPickerModal
            onClose={() => setEventLibOpen(false)}
            onPick={(img, name) => {
              // 从仓库选图作为图生图参考图（远程 URL，自动切到图生图 tab）
              setEventForm({ ...eventForm, tab: "i2i", refImg: img, refName: name, uploaded: true });
              setEventLibOpen(false);
              toast(`已从仓库选用「${name}」作为参考图`);
            }}
          />
        )}
      </>
    );
  } else if (active === "product") {
    // 商品出图台：右侧生成历史 / 参考灵感画廊
    const subTaskMap: Record<string, ProductTaskKey> = {
      "白底主图": "cutout",
      "换底抠图": "cutout",
      "抠图换底": "cutout",
      "产地场景": "cutout",
      "生活场景": "cutout",
      "细节特写": "cutout",
      "礼盒套图": "cutout",
    };
    const gallerySub =
      productForm.bgMode === "aiscene" || productForm.bgMode === "scene"
        ? ""
        : "白底主图";
    resultArea = (
      <>
        <ActiveGallery
          sub={gallerySub}
          source={productGalleryItems}
          caseStyle="ip"
          resultEdit={false}
          workTag="商拍"
          tab={productTab}
          setTab={setProductTab}
          runRows={productRuns}
          highlightId={highlightRow ?? undefined}
          onDeleteRun={deleteProductRun}
          onCopyRun={copyProductRun}
          onUseCase={(it) => {
            const sizeField = it.w && it.h
              ? { size: "自定义" as const, customW: String(it.w), customH: String(it.h) }
              : { size: "方版1:1", customW: "", customH: "" };
            const bgPatch = productGalleryBgPatch(it);
            setProductForm({
              ...productForm,
              desc: it.prompt ?? productForm.desc,
              task: "cutout",
              ...bgPatch,
              fromCase: !!it.prompt,
              ...sizeField,
            });
          }}
          onPickCate={(it) => {
            const sizeField = it.w && it.h
              ? { size: "自定义" as const, customW: String(it.w), customH: String(it.h) }
              : { size: "方版1:1", customW: "", customH: "" };
            const bgPatch = productGalleryBgPatch(it);
            setProductForm({
              ...productForm,
              task: "cutout",
              ...bgPatch,
              ...sizeField,
            });
          }}
        />
        {i2tOpen && (
          <Img2TextModal
            onClose={() => setI2tOpen(false)}
            onResult={(text) => {
              setProductForm({ ...productForm, desc: text, fromCase: true });
            }}
            {...kbFields(false, regionId)}
          />
        )}
        {productLibOpen && (
          <LibraryPickerModal
            onClose={() => setProductLibOpen(false)}
            onPick={(img, name) => {
              setProductForm({ ...productForm, productImg: img, productLabel: name });
              setProductLibOpen(false);
              toast(`已从仓库选用「${name}」作为商品图`);
            }}
          />
        )}
        {productFusionLibOpen && (
          <LibraryPickerModal
            onClose={() => setProductFusionLibOpen(false)}
            onPick={(img, name) => {
              setProductForm({
                ...productForm,
                fusionImgs: [img, "", ""],
                fusionLabels: [name, "", ""],
                ...(productForm.bgMode === "aiscene"
                  ? { scenePreset: PRODUCT_AI_SCENE_UPLOAD }
                  : {}),
              });
              setProductFusionLibOpen(false);
              toast(`已从仓库选用「${name}」作为补充图`);
            }}
          />
        )}
      </>
    );
  } else if (active === "signage") {
    resultArea = (
      <>
        <ActiveGallery
          sub="线上店招"
          source={signageGalleryItems}
          caseStyle="ip"
          resultEdit={false}
          workTag="店招"
          tab={signageTab}
          setTab={setSignageTab}
          runRows={signageRuns}
          highlightId={highlightRow ?? undefined}
          onDeleteRun={deleteSignageRun}
          onCopyRun={copySignageRun}
          onUseCase={(it) => {
            const nameM = it.prompt?.match(/店铺名「([^」]+)」/);
            const sloganM = it.prompt?.match(/副文案「([^」]+)」/);
            const matchedPlat =
              it.w === 1920 && it.h === 150
                ? platformByKey("tb_banner")
                : it.w === 950 && it.h === 120
                  ? platformByKey("tb_pc")
                  : it.w === 750 && it.h === 200
                    ? platformByKey("tb_wireless")
                    : undefined;
            let industry = signageForm.industry;
            if (it.prompt?.includes("茶叶")) industry = "茶叶";
            else if (it.prompt?.includes("特产") || it.prompt?.includes("生鲜")) industry = "特产生鲜";
            else if (it.prompt?.includes("农家乐") || it.prompt?.includes("餐饮")) industry = "餐饮农家乐";
            else if (it.prompt?.includes("文旅") || it.prompt?.includes("景区")) industry = "文旅景区";
            else if (it.prompt?.includes("手作") || it.prompt?.includes("伴手礼")) industry = "手作伴手礼";
            let style = signageForm.style;
            if (it.prompt?.includes("新中式")) style = "新中式";
            else if (it.prompt?.includes("国潮")) style = "国潮";
            else if (it.prompt?.includes("清新产地")) style = "清新产地";
            else if (it.prompt?.includes("促销")) style = "促销爆款";
            else if (it.prompt?.includes("简约")) style = "简约高级";
            setSignageForm({
              ...signageForm,
              shopName: nameM?.[1] || signageForm.shopName,
              slogan: sloganM?.[1] || signageForm.slogan,
              industry,
              style,
              platform: matchedPlat?.key || (it.w && it.h ? "custom" : signageForm.platform),
              size: matchedPlat?.sizeName || (it.w && it.h ? "自定义" : signageForm.size),
              customW: it.w ? String(it.w) : signageForm.customW,
              customH: it.h ? String(it.h) : signageForm.customH,
              fromCase: !!it.prompt,
              extraDesc: it.prompt || "",
            });
            toast(`已套用「${it.name}」，可在左侧调整后点击「立即生成」`);
          }}
          onPickCate={(it) => {
            const matchedPlat =
              it.w === 1920 && it.h === 150
                ? platformByKey("tb_banner")
                : it.w === 950 && it.h === 120
                  ? platformByKey("tb_pc")
                  : it.w === 750 && it.h === 200
                    ? platformByKey("tb_wireless")
                    : undefined;
            setSignageForm({
              ...signageForm,
              platform: matchedPlat?.key || (it.w && it.h ? "custom" : signageForm.platform),
              size: matchedPlat?.sizeName || (it.w && it.h ? "自定义" : signageForm.size),
              customW: it.w ? String(it.w) : signageForm.customW,
              customH: it.h ? String(it.h) : signageForm.customH,
            });
          }}
        />
        {signageLogoLibOpen && (
          <LibraryPickerModal
            onClose={() => setSignageLogoLibOpen(false)}
            onPick={(img, name) => {
              setSignageForm({ ...signageForm, logoImg: img, logoLabel: name });
              setSignageLogoLibOpen(false);
              toast(`已从仓库选用「${name}」作为 Logo`);
            }}
          />
        )}
        {signageRefLibOpen && (
          <LibraryPickerModal
            onClose={() => setSignageRefLibOpen(false)}
            onPick={(img, name) => {
              setSignageForm({ ...signageForm, refImg: img, refLabel: name });
              setSignageRefLibOpen(false);
              toast(`已从仓库选用「${name}」作为参考图`);
            }}
          />
        )}
      </>
    );
  } else {
    resultArea = (
      <div className="preview-empty">
        <div>
          <div className="pe-ico">
            <Icon name="image" size={46} />
          </div>
          当前类型：{type.name}
          <br />
          填好需求点击生成，一次产出多套不同风格候选
        </div>
      </div>
    );
  }

  const railItems: RailItem[] = imageTypes.map((t) => ({ key: t.key, name: t.name }));

  return (
    <div className="page">
      <div className="editor-layout">
        <EditorRail items={railItems} activeKey={active} iconOf={iconOf} onPick={switchType} />
        <div className="workspace">
          <div className="ws-panel sticky">{panel}</div>
          <div id="iResult">{resultArea}</div>
        </div>
      </div>
      <GenModal state={sim.state} title="正在生成图片" />
      {quotaOpen && (
        <div className="img-zoom-mask" onClick={() => setQuotaOpen(false)}>
          <div className="quota-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quota-modal-ico"></div>
            <div className="quota-modal-title">今日免费生成次数已用完</div>
            <div className="quota-modal-desc">每日生成次数已达上限，明日零点自动刷新</div>
            <div className="quota-modal-btns">
              <button className="btn btn-ghost" onClick={() => setQuotaOpen(false)}>明日再来</button>
              <button className="btn btn-primary" onClick={() => setQuotaOpen(false)}>联系客服解锁次数</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* IP 设计生成失败：将 API 错误信息映射为用户可读中文 */
const IP_ERROR_MAP: [RegExp, string][] = [
  [/timeout/i, "生成超时，请稍后重试"],
  [/content|safety|policy|审核/i, "内容未通过审核，请修改描述"],
  [/quota|limit|次数/i, "今日生成次数已达上限"],
  [/model|unavailable|unavail/i, "模型暂时不可用，请稍后重试"],
  [/network|connect|econnreset/i, "网络连接失败，请稍后重试"],
];
function mapIpError(msg: string): string {
  for (const [re, text] of IP_ERROR_MAP) {
    if (re.test(msg)) return text;
  }
  return "生成失败，请稍后重试";
}

/* IP / 活动共用尺寸换算：预设名或「自定义」+ 像素宽高 → 满足 Seedream 下限的 WxH */
function ipRatioToSize(ratioName: string, customW = "", customH = ""): string {
  // 兼容旧 IP 记录「自定义 w:h」比例串（按宽高比放大）
  if (ratioName.startsWith("自定义") && ratioName !== "自定义") {
    const m = ratioName.match(/(\d+)\s*[:：]\s*(\d+)/);
    if (m && !/[×x]/.test(ratioName)) {
      const w = Number(m[1]) || 1;
      const h = Number(m[2]) || 1;
      // 比例串无界面像素，按比例单位放大到 ≥369 万
      return seedreamOutputSize(w, h);
    }
    const px = ratioName.match(/(\d+)\s*[×x]\s*(\d+)/);
    if (px) return eventRatioToSize("自定义", px[1], px[2]);
  }
  return eventRatioToSize(ratioName, customW, customH);
}

/* 活动「图片尺寸」名 → 文生图送模尺寸（界面显示 px 按 Seedream 规则放大到 ≥369 万，8 对齐）。
   - 「自定义」用 customW×customH 作为界面显示像素
   - 其余取预设 size 字段（如「1080 × 1080 px」）再放大：1:1→1920²、3:5→约1488×2480 等 */
/* 套用/点选灵感卡片时，把该样张原图尺寸映射成活动表单的尺寸字段：
   - 有真实宽高 → 用「自定义」尺寸 + 填入宽高，100% 还原原图比例（各成图类型尺寸下拉常对不上样张 px 值）
   - 无宽高 → 回退为该成图类型尺寸组里第一个实际尺寸 */
function caseSizeFields(it: { sub: string; w?: number; h?: number }): { ratio: string; customW: string; customH: string } {
  if (it.w && it.h) {
    return { ratio: "自定义", customW: String(it.w), customH: String(it.h) };
  }
  const opts = ratioOptsForSub(it.sub);
  const firstReal = opts.find((o) => o.name !== "自定义") ?? opts[0];
  return { ratio: firstReal?.name ?? "自定义", customW: "", customH: "" };
}

/* 把尺寸名解析成给 LLM 的干净比例标签（如 "3:4"）：取宽高数字按最大公约数化简。
   自定义用 customW/H；解析不到则回退 "1:1"。 */
function eventRatioLabel(ratioName: string, customW = "", customH = ""): string {
  let w = 0, h = 0;
  if (ratioName === "自定义") {
    w = Number(customW) || 0;
    h = Number(customH) || 0;
  } else {
    const hit = allImageSizePresets.find((s) => s.name === ratioName);
    const m = hit?.size.match(/(\d+(?:\.\d+)?)\s*[×x:：]\s*(\d+(?:\.\d+)?)/);
    if (m) { w = Number(m[1]) || 0; h = Number(m[2]) || 0; }
  }
  if (!w || !h) return "1:1";
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const g = gcd(Math.round(w), Math.round(h)) || 1;
  return `${Math.round(w / g)}:${Math.round(h / g)}`;
}

// 友好像素标签（与左侧面板一致）：返回用户所选的「宽×高 px」原始尺寸，用于提示词文案
function eventPxLabel(ratioName: string, customW = "", customH = ""): string {
  let w = 0, h = 0;
  if (ratioName === "自定义") {
    w = Math.round(Number(customW) || 0);
    h = Math.round(Number(customH) || 0);
  } else {
    const hit = allImageSizePresets.find((s) => s.name === ratioName);
    const m = hit?.size.match(/(\d+(?:\.\d+)?)\s*[×x:：]\s*(\d+(?:\.\d+)?)/);
    if (m) { w = Math.round(Number(m[1]) || 0); h = Math.round(Number(m[2]) || 0); }
  }
  if (!w || !h) return "目标";
  return `${w}×${h} px`;
}

function eventRatioToSize(ratioName: string, customW = "", customH = ""): string {
  let w = 0,
    h = 0;
  if (ratioName === "自定义") {
    w = Number(customW) || 0;
    h = Number(customH) || 0;
  } else {
    // 在所有尺寸组里找到该项，取其界面显示 size（如「1080 × 1080 px」）再放大送模
    const hit = allImageSizePresets.find((s) => s.name === ratioName);
    const parsed = hit?.size ? parseDisplaySize(hit.size) : null;
    if (parsed) {
      w = parsed.w;
      h = parsed.h;
    }
  }
  if (!w || !h) {
    w = 1080;
    h = 1080;
  }
  return seedreamOutputSize(w, h);
}

/** 将商品图 + 场景图并排合成一张参考图（先转 data URL，避免跨域污染 canvas） */
async function composeFusionReference(urls: string[]): Promise<string> {
  const load = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image_load_failed"));
      img.src = src;
    });
  try {
    const dataUrls = await Promise.all(urls.map((u) => imgToDataUrl(u)));
    if (dataUrls.some((u) => !u)) return "";
    const imgs = await Promise.all(dataUrls.map((u) => load(u)));
    const count = imgs.length;
    const w = 1536;
    const h = 1024;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#f7f7f7";
    ctx.fillRect(0, 0, w, h);
    const gap = 28;
    const pad = 36;
    const cellW = Math.floor((w - pad * 2 - gap * (count - 1)) / count);
    const cellH = h - pad * 2;
    imgs.forEach((img, i) => {
      if (!img.width || !img.height) return;
      const scale = Math.min(cellW / img.width, cellH / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const x = pad + i * (cellW + gap) + (cellW - dw) / 2;
      const y = pad + (cellH - dh) / 2;
      ctx.drawImage(img, x, y, dw, dh);
    });
    return c.toDataURL("image/jpeg", 0.92);
  } catch {
    return "";
  }
}

function initDefault(type: ImageType): DefaultImageState {
  return {
    model: DEFAULT_EVENT_T2I_MODEL,
    input: "萧山杨梅上市主视觉，杨梅林晨光背景，紫红鲜果特写，清新时令，主标题「初夏头茬·酸甜爆汁」",
    refStrength: 60,
    size: type.sizes[0].name,
    count: 1,
    detail: 7,
    negative: "低清、文字变形、水印、多余 logo",
    advOpen: false,
  };
}

function initEvent(type: ImageType, regionId?: string): EventImageState {
  const loraIds = defaultLoraIdsForRegion(regionId);
  return {
    tab: "t2i",
    sub: "自定义",
    input: "杨梅季活动主视觉，杨梅林晨光背景，清新时令，主标题「初夏头茬·酸甜爆汁」",
    ratio: imageRatios[0].name,
    customW: "1080",
    customH: "1920",
    model: DEFAULT_EVENT_T2I_MODEL,
    count: 1,
    style: "智能匹配",
    uploaded: false,
    refImg: "",
    refName: "",
    editInput: "",
    editPreset: "不使用预设",
    presetMore: false,
    refStrength: 0,
    editModel: DEFAULT_EVENT_I2I_MODEL,
    useLora: true,
    useKB: true,
    regionEnhance: true,
    loraIds,
    loraStrengths: defaultStrengthMap(loraIds),
  };
}

async function persistableImageRef(src?: string): Promise<string> {
  const url = src?.trim() || "";
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  const data = await imgToDataUrl(url);
  return data || url;
}
