"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { SiteBeian } from "@/components/shell/SiteBeian";
import { cases, intents } from "@/data/home";
import { matchIntent } from "@/lib/intent";
import { asset } from "@/lib/asset";
import {
  HOME_SEASON_EVENT,
  type HomeSeason,
  readHomeSeason,
} from "@/lib/homeSeason";

type Cat = "all" | "content" | "image" | "video";
const CATS: { cat: Cat; name: string }[] = [
  { cat: "all", name: "全部" },
  { cat: "content", name: "文案策划" },
  { cat: "image", name: "品牌设计" },
  { cat: "video", name: "视频宣传" },
];

const BUBBLE_FULL = "我是「小慕」，想好今天设计什么了吗！";

const HERO_VIDEOS: Partial<Record<HomeSeason, string>> = {
  spring: "/home/hero-spring.mp4",
  summer: "/home/hero-summer.mp4",
  autumn: "/home/hero-autumn.mp4",
  winter: "/home/hero-winter.mp4",
};

export function HomeView() {
  const router = useRouter();
  const toast = useToast();

  const [input, setInput] = useState("");
  const [tipLabel, setTipLabel] = useState<string | null>(null);
  const [attached, setAttached] = useState<string[]>([]);
  const [cat, setCat] = useState<Cat>("all");
  const [kw, setKw] = useState("");
  const [bubbleText, setBubbleText] = useState("");
  const [season, setSeason] = useState<HomeSeason>("summer");

  useEffect(() => {
    setSeason(readHomeSeason());
    const onSeason = (e: Event) => {
      const next = (e as CustomEvent<HomeSeason>).detail;
      if (next) setSeason(next);
    };
    window.addEventListener(HOME_SEASON_EVENT, onSeason);
    return () => window.removeEventListener(HOME_SEASON_EVENT, onSeason);
  }, []);

  useEffect(() => {
    const chars = Array.from(BUBBLE_FULL);
    let i = 0;
    let pause = 0;
    setBubbleText("");
    const timer = window.setInterval(() => {
      // 打完后稍停，再从头循环
      if (i >= chars.length) {
        pause += 1;
        if (pause < 18) return; // ~1.6s
        i = 0;
        pause = 0;
        setBubbleText("");
        return;
      }
      i += 1;
      setBubbleText(chars.slice(0, i).join(""));
    }, 90);
    return () => window.clearInterval(timer);
  }, []);

  function recognizeAndGo(text: string) {
    const t = (text || "").trim();
    if (!t) return;
    const rule = matchIntent(t) ?? { view: "content", sub: "social", label: "文案策划 · 社媒推文", kw: [] };
    setTipLabel(rule.label);
    window.setTimeout(() => {
      const q = rule.sub ? `?sub=${encodeURIComponent(rule.sub)}` : "";
      router.push(`/${rule.view}${q}`);
    }, 950);
  }

  function addAttach() {
    const pool = ["🍃", "🍵", "🏞️", "🎋", "🛍️", "📷"];
    setAttached((prev) => [...prev, pool[prev.length % pool.length]]);
  }

  function scrollToShowcase() {
    document.getElementById("home-showcase")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const shown = useMemo(() => {
    const q = kw.trim().toLowerCase();
    return cases.filter(
      (c) => (cat === "all" || c.cat === cat) && (!q || c.name.toLowerCase().includes(q))
    );
  }, [cat, kw]);

  return (
    <div className="page page-home">
      <section className={`hero hero-scenic hero-season-${season}`}>
        {HERO_VIDEOS[season] ? (
          <video
            key={season}
            className="hero-scenic-bg hero-scenic-video"
            src={asset(HERO_VIDEOS[season]!)}
            autoPlay
            muted
            loop
            playsInline
            aria-hidden
          />
        ) : (
          <div
            className="hero-scenic-bg"
            style={{ backgroundImage: `url(${asset("/home/hero-bg.png")})` }}
            aria-hidden
          />
        )}
        <div className="hero-scenic-mask" aria-hidden />
        <div className="hero-core">
          <h1 className="hero-title hero-title-cn">
            AI赋活地域文化基因
            <br />
            数智赋能农文旅未来
          </h1>

          <div className="hero-dialog">
            <div className="hero-mascot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="hero-mascot-img" src={asset("/home/xiaomo.png")} alt="小慕" />
              <div className="hero-bubble" aria-live="polite">
                {bubbleText}
                {bubbleText.length < BUBBLE_FULL.length && <span className="hero-bubble-caret" aria-hidden />}
              </div>
            </div>

            <div className="chat-box hero-chat">
              <div className="hero-chat-row">
                <div className="hero-attach-col">
                  {attached.map((emo, i) => (
                    <div key={i} className="attach-thumb thumb-grad-3" style={{ color: "#fff" }}>
                      {emo}
                      <span
                        className="attach-del"
                        onClick={() => setAttached((prev) => prev.filter((_, j) => j !== i))}
                      >
                        ×
                      </span>
                    </div>
                  ))}
                  <button type="button" className="attach-card" onClick={addAttach}>
                    <span className="attach-plus">
                      <Icon name="plus" size={22} />
                    </span>
                    <span className="attach-txt">上传附件</span>
                  </button>
                </div>

                <div className="hero-chat-main">
                  <textarea
                    className="chat-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) recognizeAndGo(input);
                    }}
                    placeholder="描述乡村品牌设计需求，例如：'设计国潮风萧山萝卜干伴手礼包装'，或上传草图方案让我完善"
                  />
                  <div className="chat-bar">
                    <div className="chat-tools" />
                    <button type="button" className="btn btn-primary hero-gen-btn" onClick={() => recognizeAndGo(input)}>
                      <Icon name="sparkle" size={16} /> 立即生成
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="intent-hint">
            {intents.map((it, i) => (
              <button
                key={i}
                type="button"
                className="intent-chip"
                onClick={() => {
                  setInput(it.text);
                  setTipLabel(
                    it.view === "image" && it.sub === "logo"
                      ? "品牌设计 · logo"
                      : it.view === "image" && it.sub === "ip"
                        ? "品牌设计 · IP设计"
                        : it.view === "image" && it.sub === "product"
                          ? "品牌设计 · 商拍"
                          : "品牌设计 · 活动",
                  );
                  window.setTimeout(() => {
                    const q = it.sub ? `?sub=${encodeURIComponent(it.sub)}` : "";
                    router.push(`/${it.view}${q}`);
                  }, 950);
                }}
              >
                {it.text}
              </button>
            ))}
          </div>

          {tipLabel && (
            <div className="engine-tip">
              <span className="et-ico">🤖</span>
              <div>
                已识别意图 → <b>{tipLabel}</b>，正在带着已填好的参数直达生成流程…
              </div>
            </div>
          )}
        </div>

        <button type="button" className="hero-scroll" onClick={scrollToShowcase}>
          <span>下滑解锁更多内容</span>
          <Icon name="chevron" size={16} />
        </button>

        <div className="hero-float">
          <div className="hero-cs-wrap">
            <div className="hero-cs-pop" role="tooltip">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="hero-cs-qr" src={asset("/home/cs-qr.png")} alt="微信客服二维码" />
              <div className="hero-cs-meta">
                <div className="hero-cs-title">微信客服</div>
                <div className="hero-cs-sub">工作日 9:00–18:00</div>
                <span className="hero-cs-tag">扫码联系</span>
              </div>
            </div>
            <button type="button" className="hero-float-cs" aria-label="联系客服">
              <Icon name="headset" size={18} />
              <span>联系客服</span>
            </button>
          </div>
        </div>

        <SiteBeian className="hero-beian" />
      </section>

      <section className="showcase" id="home-showcase">
        <div className="showcase-head">
          <h2 className="showcase-title">
            优秀<span>设计案例</span>
          </h2>
          <div className="showcase-sub">EXCELLENT DESIGN</div>
        </div>

        <div className="showcase-search">
          <Icon name="search" size={18} />
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="输入关键词搜索灵感…"
          />
        </div>

        <div className="showcase-bar">
          <div className="filter-row">
            {CATS.map((c) => (
              <span
                key={c.cat}
                className={cat === c.cat ? "sel-chip on" : "sel-chip"}
                onClick={() => setCat(c.cat)}
              >
                {c.name}
              </span>
            ))}
          </div>
          <a className="showcase-more" onClick={() => router.push("/template")}>
            查看更多 <Icon name="chevron" size={14} />
          </a>
        </div>

        <div className="case-wall">
          {shown.length === 0 ? (
            <p className="case-empty empty-note" style={{ gridColumn: "1/-1", textAlign: "center", padding: "30px 0" }}>
              没有匹配的案例，换个关键词或分类试试～
            </p>
          ) : (
            shown.map((c) => (
              <div
                key={c.name}
                className="case-card"
                onClick={() => {
                  toast(`已载入「${c.name}」为模板，去「品牌设计」二次编辑`);
                  window.setTimeout(() => router.push("/image?sub=event"), 700);
                }}
              >
                <div className={`case-thumb ${c.grad}`}>
                  <span className="ct-type">{c.type}</span>
                  <span className="ct-emoji">{c.emoji}</span>
                  <div className="case-hover">
                    <button className="btn btn-primary btn-sm">套用模版</button>
                  </div>
                </div>
                <div className="case-info">
                  <div className="case-name">{c.name}</div>
                  <div className="case-meta">
                    <span className="region">📍{c.region}</span> · {c.author}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
