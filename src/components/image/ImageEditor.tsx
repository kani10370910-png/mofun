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
import { imageTypes, imageModels, imageRatios, logoStyles, fontEffects } from "@/data/image";
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
import { ImageIpPanel } from "./ImageIpPanel";
import { ActiveGallery } from "./ActiveGallery";
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
  const [logoTab, setLogoTab] = useState<"history" | "inspire">("history");
  const [logoRuns, setLogoRuns] = useState<LogoRunRow[]>([]);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoTimer = useRef<number | null>(null);
  // AI字体：内联生成历史
  const [fontTab, setFontTab] = useState<"history" | "inspire" | "story">("inspire");
  const [fontRuns, setFontRuns] = useState<FontRunRow[]>([]);
  const [fontBusy, setFontBusy] = useState(false);
  const fontTimer = useRef<number | null>(null);

  function switchType(key: string) {
    const k = key as ImageTypeKey;
    setActive(k);
    setHasResult(false);
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
      <ImageIpPanel onGenerate={runGenerate} loading={sim.state.open} />
    ) : active === "font" ? (
      <FontPanel state={fontForm} setState={setFontForm} onGenerate={runFontGenerate} loading={fontBusy} />
    ) : (
      <ImageDefaultPanel type={type} state={defForm} setState={setDefForm} onGenerate={runGenerate} loading={sim.state.open} />
    );

  // 右侧结果区
  let resultArea: React.ReactNode;
  if (active === "font") {
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
    resultArea = <ActiveGallery sub={eventForm.sub === "自定义" ? "" : eventForm.sub} />;
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
    model: imageModels[0].name,
    count: 4,
    uploaded: false,
    editInput: "",
    editModel: "基础编辑模型",
  };
}
