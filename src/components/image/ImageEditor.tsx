"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { EditorRail, type RailItem } from "@/components/ui/EditorRail";
import { GenModal } from "@/components/ui/GenModal";
import { useToast } from "@/components/ui/Toast";
import { useSimGenerate } from "@/lib/useSimGenerate";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import { logoSvgDataUrl } from "@/lib/logoSvg";
import type { AssetCard } from "@/lib/types";
import { imageTypes, imageModels, imageRatios, posterRatios, rollupRatios, flyerRatios, logoStyles, fontEffects, productGalleryItems, signageGalleryItems } from "@/data/image";
import { genStages } from "@/data/genStages";
import { IMG_ICON } from "@/data/icons";
import type { IconName } from "@/data/icons";
import type { ImageType, ImageTypeKey, LogoCase, FontCase, FontCat, FontStory } from "@/lib/types";
import {
  ImageDefaultPanel,
  ImageEventPanel,
  ImageLogoPanel,
  type DefaultImageState,
  type EventImageState,
  type LogoImageState,
} from "./ImagePanels";
import { ImageResult } from "./ImageResult";
import { ImageIpPanel, ProposePanel, type IpGenPayload, type IpCopyPayload } from "./ImageIpPanel";
import { IpGallery, type IpRunRow, type IpExtendSeed } from "./IpGallery";
import { ActiveGallery, type EventRunRow } from "./ActiveGallery";
import { LogoGallery, type LogoRunRow } from "./LogoGallery";
import { FontPanel, type FontImageState } from "./FontPanel";
import { FontGallery, type FontRunRow } from "./FontGallery";

const iconOf = (k: string): IconName => IMG_ICON[k] ?? "image";

export function ImageEditor({ initialSub, initial }: { initialSub?: string; initial?: Record<string, string | undefined> }) {
  const router = useRouter();
  const toast = useToast();
  const sim = useSimGenerate();
  const { addWork } = useLibrary();

  const [active, setActive] = useState<ImageTypeKey>(
    (imageTypes.find((t) => t.key === initialSub)?.key as ImageTypeKey) ?? imageTypes[0].key
  );
  const type = imageTypes.find((t) => t.key === active) ?? imageTypes[0];

  // 二次编辑回填：从 URL 参数取初始值（仅当 sub 匹配对应模块时生效）
  const back = initial ?? {};

  // 各类型表单状态
  const [defForm, setDefForm] = useState<DefaultImageState>(() => {
    const d = initDefault(type);
    if (back.input && initialSub !== "logo" && initialSub !== "font") d.input = back.input;
    return d;
  });
  const [eventForm, setEventForm] = useState<EventImageState>(() => {
    const e = initEvent(type);
    if (back.input && initialSub === "event") e.input = back.input;
    return e;
  });
  const [logoForm, setLogoForm] = useState<LogoImageState>(() => ({
    style: (initialSub === "logo" && back.style) || "智能匹配",
    brand: (initialSub === "logo" && back.brand) || "",
    input: (initialSub === "logo" && back.input) || "",
  }));
  const [fontForm, setFontForm] = useState<FontImageState>(() => {
    const cat = (initialSub === "font" && (back.effect ? fontEffects.find((f) => f.name === back.effect)?.cat : undefined)) || "书法体";
    return {
      text: (initialSub === "font" && back.text) || "",
      dir: initialSub === "font" && back.dir === "竖向" ? "v" : "h",
      cat: cat as FontImageState["cat"],
      effect: (initialSub === "font" && back.effect) || fontEffects.find((f) => f.cat === cat)?.name || "",
    };
  });

  // 结果状态
  const [hasResult, setHasResult] = useState(false);
  // IP 设计「帮我提案」：在右侧结果区内嵌展示面板；proposeFill 用于把结果回填到左侧创意描述
  const [proposeOpen, setProposeOpen] = useState(false);
  const [proposeFill, setProposeFill] = useState("");
  // IP 设计左侧的设计 tab（create=创新设计 / extend=扩展设计），受控以便复制时自动切换
  const [ipDesignTab, setIpDesignTab] = useState<"create" | "extend">("create");
  // 回填序号：每次复制 +1，让 ImageIpPanel 即使内容相同也能重新触发回填
  const [fillSeq, setFillSeq] = useState(0);
  // 「复制到左侧」的完整结构化载荷（颜色/尺寸/参考图等），供左侧逐项还原
  const [copyFill, setCopyFill] = useState<IpCopyPayload | null>(null);
  // 打开提案面板时，把左侧创意描述的已有内容复制进面板作为初始文本
  const [proposeInit, setProposeInit] = useState("");

  // 打开/关闭提案面板：打开时记录当前创意描述作为初始文本
  function handlePropose(open: boolean, initialDesc?: string) {
    if (open) setProposeInit(initialDesc ?? "");
    setProposeOpen(open);
  }
  // 无生成历史时默认看「参考灵感」；点生成时 runLogoGenerate 会切到「生成历史」
  const [logoTab, setLogoTab] = useState<"history" | "inspire">("inspire");
  const [logoRuns, setLogoRuns] = useState<LogoRunRow[]>([]);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoTimer = useRef<number | null>(null);
  // AI字体：内联生成历史
  const [fontTab, setFontTab] = useState<"history" | "inspire" | "story">("inspire");
  const [fontRuns, setFontRuns] = useState<FontRunRow[]>([]);
  const [fontBusy, setFontBusy] = useState(false);
  const fontTimer = useRef<number | null>(null);
  // IP 设计：内联生成历史（含进度 + 真实出图）
  const [ipRuns, setIpRuns] = useState<IpRunRow[]>([]);
  const [ipBusy, setIpBusy] = useState(false);
  const ipTimer = useRef<number | null>(null);
  // IP 右侧 tab：默认无历史看「参考灵感」，生成时切到「生成历史」
  const [ipTab, setIpTab] = useState<"history" | "inspire">("inspire");
  // 「延展设计」：把某张生成图作为待延展的 IP 图，带去 IP扩展设计子表单
  const [ipExtendSeed, setIpExtendSeed] = useState<IpExtendSeed | null>(null);
  // 活动：内联生成历史（进度卡 + 真实出图，文生图/图生图共用）
  const [eventRuns, setEventRuns] = useState<EventRunRow[]>([]);
  const [eventBusy, setEventBusy] = useState(false);
  const eventTimer = useRef<number | null>(null);
  // 活动右侧 tab：默认看「生成历史」（空态会引导）；生成时也停在生成历史看进度
  const [eventTab, setEventTab] = useState<"history" | "cases">("history");

  // 点生成历史图片上的「延展设计」：切到 IP扩展设计并把该图作为 IP 图
  function handleIpExtend(seed: IpExtendSeed) {
    setProposeOpen(false);
    setIpExtendSeed(seed);
    toast(`已将「${seed.name}」带入 IP 扩展设计，可选择延展项后生成`);
  }

  function switchType(key: string) {
    const k = key as ImageTypeKey;
    setActive(k);
    setHasResult(false);
    setProposeOpen(false);
    if (ipTimer.current) {
      window.clearInterval(ipTimer.current);
      ipTimer.current = null;
    }
    if (eventTimer.current) {
      window.clearInterval(eventTimer.current);
      eventTimer.current = null;
    }
    sim.close();
    const t = imageTypes.find((x) => x.key === k) ?? imageTypes[0];
    setDefForm(initDefault(t));
    setEventForm(initEvent(t));
  }

  // 普通/活动：模拟生成（先校验必填）
  function runGenerate() {
    if (active === "event") {
      if (eventForm.tab === "i2i" && !eventForm.uploaded) {
        toast("请先上传参考图片！", "warn");
        return;
      }
      if (eventForm.tab === "t2i" && !eventForm.input.trim()) {
        toast("请输入画面描述！", "warn");
        return;
      }
      // 活动：真实文生图（右侧生成历史进度卡 + 真图）
      runEventGenerate();
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
      time: nowStamp(),
      edit: { sub: active, input: desc },
    };
    addWork(work);
  }

  // logo：内联进度生成（0% → 100%）
  function runLogoGenerate() {
    if (logoBusy) return;
    if (!logoForm.brand.trim()) {
      toast("请输入品牌名称！", "warn");
      return;
    }
    setLogoBusy(true);
    setLogoTab("history");
    const id = "run-" + logoRuns.length + "-" + logoForm.brand.length;
    const grads = ["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4"] as const;
    const brand = logoForm.brand.trim() || "未命名品牌";
    const style = logoForm.style || "智能匹配";

    // 按品牌名 + 风格动态生成 4 张带品牌名的 logo（4 套配色），让结果与品牌相关
    const picked = grads.map((_, i) => logoSvgDataUrl(brand, style, i));

    const row: LogoRunRow = {
      id,
      prompt: brand,
      style,
      desc: logoForm.input.trim(),
      time: nowStamp(),
      pct: 0,
      results: grads.map((g, i) => ({ grad: g, emoji: "🎨", img: picked[i], fav: false })),
    };
    setLogoRuns((prev) => [row, ...prev]);

    let pct = 0;
    logoTimer.current = window.setInterval(() => {
      pct += 12 + (pct % 7);
      if (pct >= 100) pct = 100;
      const v = pct;
      setLogoRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: v } : r)));
      if (v >= 100) {
        if (logoTimer.current) window.clearInterval(logoTimer.current);
        logoTimer.current = null;
        setLogoBusy(false);
        toast("logo 生成完成，已存入「我的作品」");
        addWork({
          emoji: "✴️",
          grad: "thumb-grad-3",
          kind: "图片",
          name: `${brand} · LOGO`,
          sub: "品牌设计 · logo",
          img: picked[0],
          time: nowStamp(),
          edit: { sub: "logo", brand, style, input: logoForm.input },
        });
      }
    }, 320);
  }

  // 参考灵感「制作同款」：把案例的风格 / 品牌名称 / 创意描述一一回填到左侧表单
  function useLogoCase(c: LogoCase) {
    const matchedStyle = logoStyles.find((s) => s.name === c.cat)?.name ?? "智能匹配";
    setLogoForm({
      style: matchedStyle,
      brand: c.name,
      input: c.desc ?? `参考「${c.name}」制作 LOGO，${c.cat}风格，简洁现代、辨识度高`,
    });
    toast(`已套用「${c.name}」：风格、品牌名、创意描述已填入，可调整后点击「立即生成」`);
  }

  // 生成历史「复制」：把该记录的 logo 风格 / 品牌名称 / 创意描述回填到左侧表单
  function copyLogoHistory(style: string, prompt: string) {
    const matchedStyle = logoStyles.find((s) => s.name === style)?.name ?? style ?? "智能匹配";
    setLogoForm({
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

  // AI字体：内联进度生成（0% → 100%），在「生成历史」置顶
  function runFontGenerate() {
    if (fontBusy) return;
    if (!fontForm.text.trim()) {
      toast("请输入文字内容！", "warn");
      return;
    }
    setFontBusy(true);
    setFontTab("history");
    const id = "font-" + fontRuns.length + "-" + fontForm.text.length;
    const grads = ["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4"] as const;
    const dirLabel = fontForm.dir === "h" ? "横向" : "竖向";
    const row: FontRunRow = {
      id,
      text: fontForm.text.trim(),
      effect: fontForm.effect,
      dir: dirLabel,
      desc: `为「${fontForm.text.trim()}」生成「${fontForm.effect}」${fontForm.cat}艺术字，${dirLabel}排版。`,
      time: nowStamp(),
      pct: 0,
      results: grads.map((g) => ({ grad: g })),
    };
    setFontRuns((prev) => [row, ...prev]);

    let pct = 0;
    fontTimer.current = window.setInterval(() => {
      pct += 12 + (pct % 7);
      if (pct >= 100) pct = 100;
      const v = pct;
      setFontRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: v } : r)));
      if (v >= 100) {
        if (fontTimer.current) window.clearInterval(fontTimer.current);
        fontTimer.current = null;
        setFontBusy(false);
        toast("字体生成完成，已存入「我的作品」");
        addWork({
          emoji: "🔤",
          grad: "thumb-grad-6",
          kind: "图片",
          name: `${row.text} · 艺术字`,
          sub: "品牌设计 · AI字体",
          time: nowStamp(),
          edit: { sub: "font", text: row.text, effect: row.effect, dir: row.dir },
        });
      }
    }, 320);
  }

  // 生成历史「删除」：移除字体本次会话生成的某一行
  function deleteFontRun(id: string) {
    setFontRuns((prev) => prev.filter((r) => r.id !== id));
  }

  // IP 设计：点「立即生成」（描述已由左侧面板用 LLM 优化），调文生图出 4 张真图
  async function runIpGenerate(payload?: IpGenPayload) {
    if (!payload || ipBusy) return;
    setIpBusy(true);
    setIpTab("history"); // 生成时切到生成历史看进度
    const id = "ip-" + ipRuns.length + "-" + payload.prompt.length;
    const grads = ["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4"];
    const size = ipRatioToSize(payload.ratioName);

    const row: IpRunRow = {
      id,
      title: payload.title,
      desc: payload.prompt, // 完整优化描述：复制回填用（扩展设计行头改用 ext 结构化展示）
      rawDesc: payload.rawDesc, // 用户原始创意描述（供 IP 故事）
      ext: payload.ext, // 扩展设计结构化展示信息（卡片头用）
      create: payload.create, // IP创新设计结构化展示信息（卡片头用）
      colors: payload.colors,
      ratioName: payload.ratioName,
      time: nowStamp(),
      pct: 8,
      grads,
      imgs: [],
    };
    setIpRuns((prev) => [row, ...prev]);

    // 进度推进到 90%，剩余 10% 等真图返回
    let pct = 8;
    ipTimer.current = window.setInterval(() => {
      pct = Math.min(90, pct + 7 + (pct % 5));
      setIpRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct } : r)));
    }, 500);

    function finishTimer() {
      if (ipTimer.current) window.clearInterval(ipTimer.current);
      ipTimer.current = null;
    }

    // 单张请求：失败自动重试（anyfast 并发会触发限流，重试可救回；最多 3 次、退避递增）
    async function genOne(attempt = 0): Promise<string> {
      try {
        const r = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // 有参考图（扩展设计的 IP 图，已转 base64 data URL）则走图生图，保持人物一致性
          body: JSON.stringify({
            prompt: payload!.prompt,
            size,
            ...(payload!.refImage ? { image: payload!.refImage } : {}),
          }),
        });
        const j = await r.json();
        const url = (j?.images?.[0] as string) || "";
        if (url) return url;
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
        setIpRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "生成失败" } : r)));
        toast("文生图失败，请稍后重试或检查图像 API 配置。", "warn");
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
      // 存入「我的作品」（取第一张成功的）
      addWork({
        emoji: "🧸",
        grad: "thumb-grad-1",
        kind: "图片",
        name: `${payload.title} · IP 设计`,
        sub: "品牌设计 · IP 设计",
        img: ok[0],
        time: nowStamp(),
        edit: { sub: "ip", input: payload.prompt },
      });
    } catch {
      finishTimer();
      setIpRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "生成失败" } : r)));
      toast("网络错误，文生图失败。", "warn");
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

  // 活动：点「立即生成」→ 右侧生成历史进度卡 → 调文生图出 N 张真图（N 取生成数量）
  async function runEventGenerate() {
    if (eventBusy) return;
    setEventBusy(true);
    setEventTab("history"); // 切到生成历史看进度
    const prompt = eventForm.input.trim();
    const n = Math.max(1, Math.min(4, eventForm.count || 4));
    const allGrads = ["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4"];
    const grads = allGrads.slice(0, n);
    const size = eventRatioToSize(eventForm.ratio, eventForm.customW, eventForm.customH);
    const id = "ev-" + eventRuns.length + "-" + prompt.length;

    const row: EventRunRow = {
      id,
      prompt,
      sub: eventForm.sub || "自定义",
      ratioName: eventForm.ratio,
      time: nowStamp(),
      pct: 8,
      imgs: [],
      grads,
    };
    setEventRuns((prev) => [row, ...prev]);

    // 进度推进到 90%，剩余等真图返回
    let pct = 8;
    eventTimer.current = window.setInterval(() => {
      pct = Math.min(90, pct + 7 + (pct % 5));
      setEventRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct } : r)));
    }, 500);
    const finishTimer = () => {
      if (eventTimer.current) window.clearInterval(eventTimer.current);
      eventTimer.current = null;
    };

    // 单张请求：失败自动重试（最多 3 次、退避递增）
    async function genOne(attempt = 0): Promise<string> {
      try {
        const r = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, size }),
        });
        const j = await r.json();
        const url = (j?.images?.[0] as string) || "";
        if (url) return url;
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
      const imgs: string[] = new Array(n).fill("");
      for (let i = 0; i < n; i++) {
        imgs[i] = await genOne();
        setEventRuns((prev) => prev.map((r) => (r.id === id ? { ...r, imgs: [...imgs] } : r)));
      }
      finishTimer();
      const ok = imgs.filter(Boolean);
      if (ok.length === 0) {
        setEventRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "生成失败" } : r)));
        toast("文生图失败，请稍后重试或检查图像 API 配置。", "warn");
        return;
      }
      setEventRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: 100, imgs } : r)));
      toast(
        ok.length < n
          ? `已生成 ${ok.length}/${n} 张（部分超时），已存入「我的作品」`
          : `已生成 ${ok.length} 张活动图，已存入「我的作品」`,
      );
      addWork({
        emoji: "🎨",
        grad: "thumb-grad-1",
        kind: "图片",
        name: `${prompt.slice(0, 12) || "活动图"} · 活动`,
        sub: "品牌设计 · 活动",
        img: ok[0],
        time: nowStamp(),
        edit: { sub: "event", input: prompt },
      });
    } catch {
      finishTimer();
      setEventRuns((prev) => prev.map((r) => (r.id === id ? { ...r, pct: 100, error: "生成失败" } : r)));
      toast("网络错误，文生图失败。", "warn");
    } finally {
      setEventBusy(false);
    }
  }

  // 活动生成历史「删除」
  function deleteEventRun(id: string) {
    setEventRuns((prev) => prev.filter((r) => r.id !== id));
  }

  // 活动生成历史「复制描述到左侧」
  function copyEventRun(prompt: string) {
    setEventForm({ ...eventForm, tab: "t2i", input: prompt });
    toast("已复制描述到左侧");
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
      <ImageEventPanel type={type} state={eventForm} setState={setEventForm} onGenerate={runGenerate} loading={sim.state.open} />
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
              toast("已生成创意提案并填入描述（演示）");
            }}
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
      <ActiveGallery
        sub={eventForm.sub === "自定义" ? "" : eventForm.sub}
        tab={eventTab}
        setTab={setEventTab}
        runRows={eventRuns}
        onDeleteRun={deleteEventRun}
        onCopyRun={copyEventRun}
      />
    );
  } else if (active === "product") {
    // 商拍：右侧用通用画廊（生成历史 / 参考灵感），按图片尺寸子类筛选
    resultArea = <ActiveGallery sub={defForm.size} source={productGalleryItems} />;
  } else if (active === "signage") {
    // 店招设计：右侧用通用画廊（生成历史 / 参考灵感），按图片尺寸子类筛选
    resultArea = <ActiveGallery sub={defForm.size} source={signageGalleryItems} />;
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
    </div>
  );
}

/* IP 画面比例名 → 文生图尺寸（豆包 Seedream 要求 ≥ 约 369 万像素，即 1920×1920）。
   返回的宽高均放大到该下限之上，并保持目标宽高比。 */
function ipRatioToSize(ratioName: string): string {
  const MIN_PIXELS = 3686400; // 1920²
  let w = 1,
    h = 1;
  const custom = ratioName.match(/(\d+)\s*[:：]\s*(\d+)/); // 自定义 w:h
  if (custom) {
    w = Number(custom[1]) || 1;
    h = Number(custom[2]) || 1;
  } else if (ratioName.includes("3:5")) [w, h] = [3, 5];
  else if (ratioName.includes("5:3")) [w, h] = [5, 3];
  else if (ratioName.includes("16:9")) [w, h] = [16, 9];
  else [w, h] = [1, 1]; // 正方形 1:1

  // 按比例求满足像素下限的最小整数边，并取整到 8 的倍数（多数模型要求）
  const scale = Math.sqrt(MIN_PIXELS / (w * h));
  const round8 = (n: number) => Math.ceil((n * scale) / 8) * 8;
  return `${round8(w)}x${round8(h)}`;
}

/* 活动「图片尺寸」名 → 文生图尺寸（保持宽高比，放大到 ≥369 万像素，取整到 8 的倍数）。
   - 「自定义」用 customW:customH 的比例
   - 其余按各尺寸组里该项的 size 字段（如「1080 × 1920 px」「13 × 18 cm」）解析出宽:高比 */
function eventRatioToSize(ratioName: string, customW = "", customH = ""): string {
  const MIN_PIXELS = 3686400;
  let w = 0,
    h = 0;
  if (ratioName === "自定义") {
    w = Number(customW) || 0;
    h = Number(customH) || 0;
  } else {
    // 在所有尺寸组里找到该项，取其 size 字段的两个数字作为宽:高比
    const all = [...imageRatios, ...posterRatios, ...rollupRatios, ...flyerRatios];
    const hit = all.find((s) => s.name === ratioName);
    const m = hit?.size.match(/(\d+(?:\.\d+)?)\s*[×x:：]\s*(\d+(?:\.\d+)?)/);
    if (m) {
      w = Number(m[1]) || 0;
      h = Number(m[2]) || 0;
    }
  }
  if (!w || !h) {
    w = 1;
    h = 1;
  }
  const scale = Math.sqrt(MIN_PIXELS / (w * h));
  const round8 = (n: number) => Math.ceil((n * scale) / 8) * 8;
  return `${round8(w)}x${round8(h)}`;
}

function initDefault(type: ImageType): DefaultImageState {
  return {
    model: imageModels[0].name,
    input: "安吉明前白茶上市主视觉，高山云雾茶园背景，嫩芽特写，国风清新，主标题「明前头采·鲜爽回甘」",
    refStrength: 60,
    size: type.sizes[0].name,
    count: 4,
    detail: 7,
    negative: "低清、文字变形、水印、多余 logo",
    advOpen: false,
  };
}

function initEvent(type: ImageType): EventImageState {
  return {
    tab: "t2i",
    sub: "自定义",
    input: "茶文化节活动主视觉，高山云雾茶园背景，国风清新，主标题「明前头采·鲜爽回甘」",
    ratio: imageRatios[0].name,
    customW: "1080",
    customH: "1920",
    model: imageModels[0].name,
    count: 4,
    uploaded: false,
    editInput: "",
    editModel: "基础编辑模型",
  };
}
