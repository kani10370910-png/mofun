"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import {
  templateScenes,
  templateTypes,
  templateSubs,
  templates,
} from "@/data/templates";
import type { Template } from "@/lib/types";

const TYPE_NAME: Record<string, string> = { content: "文案策划", image: "品牌设计", video: "视频宣传" };
const TYPE_ENTRY: Record<string, { view: string; sub: string }> = {
  image: { view: "image", sub: "event" },
  content: { view: "content", sub: "social" },
  video: { view: "video", sub: "oneline" },
};

type TypeKey = "all" | "content" | "image" | "video";

export function TemplateView() {
  const router = useRouter();
  const toast = useToast();

  const [scene, setScene] = useState("全部");
  const [type, setType] = useState<TypeKey>("all");
  const [sub, setSub] = useState("全部");

  function pickType(t: TypeKey) {
    setType(t);
    setSub("全部"); // 切换类型时子类重置回「全部」
  }

  const match = (t: Template) =>
    (scene === "全部" || t.scene === scene) &&
    (type === "all" || t.type === type) &&
    (sub === "全部" || t.sub === sub);

  const hot = useMemo(() => templates.filter((t) => t.hot && match(t)), [scene, type, sub]);
  const all = useMemo(() => templates.filter(match), [scene, type, sub]);

  function applyTpl(t: Template) {
    const entry = TYPE_ENTRY[t.type] ?? TYPE_ENTRY.image;
    toast(`已套用模版「${t.name}」，进入编辑`);
    window.setTimeout(() => router.push(`/${entry.view}?sub=${entry.sub}`), 700);
  }

  const card = (t: Template) => (
    <div key={t.name} className="tpl-card" onClick={() => applyTpl(t)}>
      <div className={`tpl-thumb ${t.grad}`}>
        {t.hot && <span className="tpl-hot">🔥 热门</span>}
        <span className="tpl-emoji">{t.emoji}</span>
        <div className="tpl-hover">
          <button className="btn btn-primary btn-sm">套用模版</button>
        </div>
      </div>
      <div className="tpl-info">
        <div className="tpl-name">{t.name}</div>
        <div className="tpl-meta">
          <span className="tag green">{TYPE_NAME[t.type] ?? t.type}</span> · {t.sub} · 用过 {t.uses}
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
          <div className="grid grid-4">{hot.map(card)}</div>
        </>
      )}

      <h2 className="section-title">全部模版</h2>
      <div className="grid grid-4">
        {all.length > 0 ? (
          all.map(card)
        ) : (
          <p className="tpl-empty empty-note" style={{ gridColumn: "1/-1", textAlign: "center", padding: "30px 0" }}>
            该筛选条件下暂无模版，换个场景或子类试试～
          </p>
        )}
      </div>
    </div>
  );
}
