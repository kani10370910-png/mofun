"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { fontCases, fontStories } from "@/data/image";
import type { FontCase, FontStory, Grad, AssetCard } from "@/lib/types";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { FontEditModal } from "./FontEditModal";

type FontTab = "history" | "inspire" | "story";

export interface FontRunRow {
  id: string;
  text: string; // 文字内容
  effect: string; // 字体名
  dir: string; // 横向 / 竖向
  time: string; // 生成时间（年月日时分）
  pct: number; // <100 加载中；100 完成
  results: { grad: Grad }[];
}

// 案例文字的展示风格：艺术体→立体潮酷，现代体→质感黑，书法体→行楷
function catStyle(cat: string): "art" | "modern" | "cal" {
  if (cat === "艺术体") return "art";
  if (cat === "现代体") return "modern";
  return "cal";
}

/* AI 字体右侧画廊：生成历史 / 参考灵感 / 字体故事 */
export function FontGallery({
  tab,
  setTab,
  runRows,
  onUseCase,
  onUseStory,
  onCopy,
  onDeleteRun,
}: {
  tab: FontTab;
  setTab: (t: FontTab) => void;
  runRows: FontRunRow[];
  onUseCase: (c: FontCase) => void;
  onUseStory: (s: FontStory) => void;
  onCopy: (text: string, effect: string) => void;
  onDeleteRun: (id: string) => void;
}) {
  const toast = useToast();
  const [cat, setCat] = useState("全部");
  const [pendingDel, setPendingDel] = useState<string | null>(null);
  const cats = ["全部", "书法体", "现代体", "艺术体"];

  return (
    <>
      <div className="lg-head">
        <div className="tabs">
          <div className={tab === "history" ? "tab on" : "tab"} onClick={() => setTab("history")}>
            生成历史
          </div>
          <div className={tab === "inspire" ? "tab on" : "tab"} onClick={() => setTab("inspire")}>
            参考灵感
          </div>
          <div className={tab === "story" ? "tab on" : "tab"} onClick={() => setTab("story")}>
            字体故事
          </div>
        </div>
      </div>

      {tab === "history" ? (
        runRows.length > 0 ? (
          <div id="fontHistory">
            <div className="lh-group">
              <div className="lh-group-title">今天</div>
              {runRows.map((row) => (
                <FontRunRowView
                  key={row.id}
                  row={row}
                  toast={toast}
                  onCopy={onCopy}
                  onDelete={() => setPendingDel(row.id)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="preview-empty">
            <div>
              <div className="pe-ico">
                <Icon name="image" size={42} />
              </div>
              还没有生成记录，填好左侧点「立即生成」试试
            </div>
          </div>
        )
      ) : tab === "inspire" ? (
        <div>
          <div className="filter-row" style={{ marginBottom: 16 }}>
            {cats.map((c) => (
              <span key={c} className={cat === c ? "sel-chip on" : "sel-chip"} onClick={() => setCat(c)}>
                {c}
              </span>
            ))}
          </div>
          <div className="grid grid-4">
            {fontCases
              .filter((c) => cat === "全部" || c.cat === cat)
              .map((c, i) => (
                <div className="font-case" key={i} onClick={() => onUseCase(c)}>
                  <div className="font-case-thumb">
                    <span className={`font-case-text fc-${catStyle(c.cat)}`}>{c.text}</span>
                    <div className="case-hover">
                      <button
                        className="btn btn-sm lg-case-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUseCase(c);
                        }}
                      >
                        制作同款
                      </button>
                    </div>
                  </div>
                  <div className="font-case-foot">
                    <span className="font-case-name">{c.text}</span>
                    <span className="font-tag">{c.cat}</span>
                    <span className="font-tag">{c.tag}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-3">
          {fontStories.map((s) => (
            <div className="font-story" key={s.name}>
              <div className={`font-story-thumb fs-scene-${s.scene}`}>
                <span className="font-story-title">{s.title}</span>
              </div>
              <div className="font-story-foot">
                <span className="font-story-name">{s.name}</span>
                <button className="font-story-btn" onClick={() => onUseStory(s)}>
                  立即使用
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingDel && (
        <ConfirmModal
          title="确定删除这个记录吗？"
          onCancel={() => setPendingDel(null)}
          onConfirm={() => {
            onDeleteRun(pendingDel);
            setPendingDel(null);
            toast("已删除该记录");
          }}
        />
      )}
    </>
  );
}

function FontRunRowView({
  row,
  toast,
  onCopy,
  onDelete,
}: {
  row: FontRunRow;
  toast: (s: string) => void;
  onCopy: (text: string, effect: string) => void;
  onDelete: () => void;
}) {
  const loading = row.pct < 100;
  return (
    <div className="lh-row">
      <div className="lh-meta">
        <span className="lh-prompt">{row.text}</span>
        <span className="lg-cat">{row.effect}</span>
        <span className="lg-cat">{row.dir}</span>
        {!loading && (
          <>
            <button className="lh-ico lh-tip" data-tip="复制" aria-label="复制" onClick={() => onCopy(row.text, row.effect)}>
              <Icon name="copy" size={14} />
            </button>
            <button className="lh-ico lh-tip" data-tip="删除" aria-label="删除" onClick={onDelete}>
              <Icon name="trash" size={14} />
            </button>
            <span className="lh-time">{row.time}</span>
          </>
        )}
      </div>
      <div className="lh-imgs">
        {row.results.map((r, i) =>
          loading ? (
            <div className={`lh-img ${r.grad} lh-loading`} key={i}>
              <span className="lh-progress">{row.pct}%完成</span>
              <span className="lh-think">
                <span className="font-spinner" />
                <em>{i === 0 ? "调配色彩…" : "正在构思…"}</em>
              </span>
            </div>
          ) : (
            <FontResultCard key={i} grad={r.grad} text={row.text} effect={row.effect} dir={row.dir} toast={toast} />
          )
        )}
      </div>
    </div>
  );
}

function FontResultCard({
  grad,
  text,
  effect,
  dir,
  toast,
}: {
  grad: Grad;
  text: string;
  effect: string;
  dir: string;
  toast: (s: string) => void;
}) {
  const { addWork, addMaterial } = useLibrary();
  const [editOpen, setEditOpen] = useState(false);
  const asset = (kind: string): AssetCard => ({
    emoji: "🔤",
    grad: grad as AssetCard["grad"],
    kind,
    name: `${text} · 艺术字`,
    sub: "品牌设计 · AI字体",
    time: nowStamp(),
  });

  return (
    <div className={`lh-img ${grad}`}>
      <span className="lh-font-text">{text}</span>
      <div className="lh-hover">
        <button className="btn btn-ghost btn-sm" onClick={() => setEditOpen(true)}>
          编辑
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            addWork(asset("图片"));
            toast("已储存到「仓库 · 我的作品」");
          }}
        >
          储存到我的作品
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            addMaterial(asset("素材"));
            toast("已储存为「仓库 · 我的素材」");
          }}
        >
          储存为我的素材
        </button>
      </div>
      <span className="lh-mark">由 AI 生成</span>
      {editOpen && (
        <FontEditModal text={text} effect={effect} dir={dir} grad={grad} onClose={() => setEditOpen(false)} />
      )}
    </div>
  );
}
