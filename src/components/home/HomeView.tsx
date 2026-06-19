"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { cases, intents } from "@/data/home";
import { matchIntent } from "@/lib/intent";

type Cat = "all" | "content" | "image" | "video";
const CATS: { cat: Cat; name: string }[] = [
  { cat: "all", name: "全部" },
  { cat: "content", name: "文案策划" },
  { cat: "image", name: "品牌设计" },
  { cat: "video", name: "视频宣传" },
];

export function HomeView() {
  const router = useRouter();
  const toast = useToast();

  const [input, setInput] = useState("");
  const [tipLabel, setTipLabel] = useState<string | null>(null);
  const [attached, setAttached] = useState<string[]>([]);
  const [cat, setCat] = useState<Cat>("all");
  const [kw, setKw] = useState("");

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

  const shown = useMemo(() => {
    const q = kw.trim().toLowerCase();
    return cases.filter(
      (c) => (cat === "all" || c.cat === cat) && (!q || c.name.toLowerCase().includes(q))
    );
  }, [cat, kw]);

  return (
    <div className="page">
      <section className="hero">
        <h1 className="hero-title hero-title-cn">
          AI 赋活地域<span>文化基因</span>
          <br />
          数智赋能<span>农文旅</span>未来
        </h1>

        <div className="chat-box">
          <div className="chat-lead">
            <Icon name="search" size={20} />
          </div>
          <textarea
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) recognizeAndGo(input);
            }}
            placeholder="描述你想要的内容、图片或视频，例如：帮安吉白茶写一条朋友圈，口语化带点表情…"
          />
          <div className="attach-row">
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
            <div className="attach-card" onClick={addAttach}>
              <span className="attach-plus">
                <Icon name="plus" size={20} />
              </span>
              <span className="attach-txt">上传附件</span>
            </div>
          </div>
          <div className="chat-bar">
            <div className="chat-tools" />
            <button className="btn btn-primary" onClick={() => recognizeAndGo(input)}>
              <Icon name="sparkle" size={16} /> 识别意图 · 直达生成
            </button>
          </div>
        </div>

        <div className="intent-hint">
          {intents.map((it, i) => (
            <div
              key={i}
              className="intent-chip"
              onClick={() => {
                const plain = it.text.replace(/<[^>]+>/g, "");
                setInput(plain);
                recognizeAndGo(plain);
              }}
              dangerouslySetInnerHTML={{ __html: it.text }}
            />
          ))}
        </div>

        {tipLabel && (
          <div>
            <div className="engine-tip">
              <span className="et-ico">🤖</span>
              <div>
                已识别意图 → <b>{tipLabel}</b>，正在带着已填好的参数直达生成流程…
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="showcase">
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
