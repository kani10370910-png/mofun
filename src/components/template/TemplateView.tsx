"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Icon } from "@/components/ui/Icon";
import {
  templateScenes,
  templateTypes,
  templateSubs,
  templates,
} from "@/data/templates";
import type { Template } from "@/lib/types";
import { buildTemplateApplyHref } from "@/lib/templateApply";
import { asset } from "@/lib/asset";
import { TemplateDetail } from "@/components/template/TemplateDetail";

const TYPE_NAME: Record<string, string> = { content: "文案策划", image: "品牌设计", video: "视频宣传" };

type TypeKey = "all" | "content" | "image" | "video";

function getTplScroller(): HTMLElement | null {
  return (
    (document.querySelector(".main") as HTMLElement | null) ||
    (document.scrollingElement as HTMLElement | null)
  );
}

export function TemplateView() {
  const router = useRouter();
  const toast = useToast();

  const [scene, setScene] = useState("全部");
  const [type, setType] = useState<TypeKey>("all");
  const [sub, setSub] = useState("全部");
  const [showTop, setShowTop] = useState(false);
  const [detail, setDetail] = useState<Template | null>(null);

  useEffect(() => {
    const scroller = getTplScroller();
    if (!scroller) return;
    const onScroll = () => setShowTop(scroller.scrollTop > 480);
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToTop() {
    getTplScroller()?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function pickType(t: TypeKey) {
    setType(t);
    setSub("全部");
  }

  const match = (t: Template) =>
    (scene === "全部" || t.scene === scene) &&
    (type === "all" || t.type === type) &&
    (sub === "全部" || t.sub === sub);

  const hot = useMemo(() => templates.filter((t) => t.hot && match(t)), [scene, type, sub]);
  const all = useMemo(() => templates.filter(match), [scene, type, sub]);

  function applyTpl(t: Template) {
    toast(`已套用模版「${t.name}」，灵感已填入表单`);
    window.setTimeout(() => router.push(buildTemplateApplyHref(t)), 700);
  }

  const pin = (t: Template) => (
    <div
      key={`${t.type}-${t.sub}-${t.name}`}
      className="tpl-pin"
      onClick={() => setDetail(t)}
    >
      <div className={`tpl-pin-media ${t.img ? "" : t.grad}`}>
        {t.hot && <span className="tpl-hot">🔥 热门</span>}
        {t.img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="tpl-pin-img" src={asset(t.img)} alt={t.name} loading="lazy" />
        ) : (
          <span className="tpl-emoji">{t.emoji}</span>
        )}
      </div>
      <div className="tpl-pin-cap">
        <div className="tpl-name">{t.name}</div>
        <div className="tpl-meta-row">
          <div className="tpl-meta">
            <span className="tag green">{TYPE_NAME[t.type] ?? t.type}</span> · {t.sub}
          </div>
          <div className="tpl-actions">
            <span className="tpl-views" title="多少人看过">
              <Icon name="eye" size={14} />
              {t.uses}
            </span>
            <button
              type="button"
              className="tpl-apply-btn"
              aria-label="套用模版"
              onClick={(e) => {
                e.stopPropagation();
                applyTpl(t);
              }}
            >
              套用模版
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="tpl-filter">
        <div className="tpl-filter-row">
          <span className="tpl-filter-label">场景</span>
          <div className="chip-row">
            {templateScenes.map((s) => (
              <span key={s} className={scene === s ? "sel-chip on" : "sel-chip"} onClick={() => setScene(s)}>
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="tpl-filter-row">
          <span className="tpl-filter-label">类型</span>
          <div className="chip-row">
            {templateTypes.map((t) => (
              <span
                key={t.key}
                className={type === t.key ? "sel-chip on" : "sel-chip"}
                onClick={() => pickType(t.key)}
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>
        {type !== "all" && (
          <div className="tpl-filter-row tpl-sub-row">
            <span className="tpl-filter-label">分类</span>
            <div className="tpl-sub-wrap">
              <div className="chip-row tpl-sub-group">
                {templateSubs[type].map((s) => (
                  <span key={s} className={sub === s ? "sel-chip on" : "sel-chip"} onClick={() => setSub(s)}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {hot.length > 0 && (
        <>
          <h2 className="section-title">🔥 热门推荐</h2>
          <div className="tpl-waterfall">{hot.map(pin)}</div>
        </>
      )}

      <h2 className="section-title">全部模版</h2>
      {all.length > 0 ? (
        <div className="tpl-waterfall">{all.map(pin)}</div>
      ) : (
        <p className="tpl-empty empty-note" style={{ textAlign: "center", padding: "30px 0" }}>
          该筛选条件下暂无模版，换个场景或子类试试～
        </p>
      )}

      <button
        type="button"
        className={`tpl-back-top${showTop ? " show" : ""}`}
        onClick={scrollToTop}
        aria-label="回到顶部"
        title="回到顶部"
      >
        <Icon name="arrowUp" size={20} />
      </button>

      {detail && (
        <TemplateDetail
          key={`${detail.type}-${detail.sub}-${detail.name}`}
          template={detail}
          onClose={() => setDetail(null)}
          onApply={(t) => {
            setDetail(null);
            applyTpl(t);
          }}
        />
      )}
    </div>
  );
}
