"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { fontCats, fontEffects } from "@/data/image";
import type { FontCat, FontEffect } from "@/lib/types";
import { asset } from "@/lib/asset";

// 字体置顶状态的 localStorage 键（刷新后保留置顶）
const PIN_KEY = "mofun.fontPinned";

export interface FontImageState {
  text: string;
  dir: "h" | "v"; // 横向 / 竖向
  cat: FontCat; // 文字效果分类
  effect: string; // 选中的字体名
}

/* AI 字体专属左侧表单：文字内容 / 文字方向 / 文字效果（分类 + 字体网格） */
export function FontPanel({
  state,
  setState,
  onGenerate,
  loading,
}: {
  state: FontImageState;
  setState: (s: FontImageState) => void;
  onGenerate: () => void;
  loading: boolean;
}) {
  const set = <K extends keyof FontImageState>(k: K, v: FontImageState[K]) => setState({ ...state, [k]: v });

  // 置顶字体：记录被置顶的字体 key。置顶项排到当前分类网格最前。
  // 持久化到 localStorage —— 刷新页面后仍保留。SSR 阶段取空集，挂载后再读，避免 hydration 不一致。
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PIN_KEY);
      if (raw) setPinned(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }, []);
  const togglePin = (key: string) =>
    setPinned((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      try {
        localStorage.setItem(PIN_KEY, JSON.stringify([...next]));
      } catch {
        /* 忽略写入失败 */
      }
      return next;
    });

  // 当前分类的字体：置顶的排在前（各自保持原相对顺序），其余在后。
  const effects = fontEffects
    .filter((f) => f.cat === state.cat)
    .sort((a, b) => Number(pinned.has(b.key)) - Number(pinned.has(a.key)));

  // 悬停预览：鼠标移入某字体卡片时，在该卡片右侧浮出预览图小框（仅对有图的字体）。
  // 用 Portal 渲染到 body，确保浮层在最上层、不被右侧画廊卡片盖住。
  // pos 记录浮框左上角坐标（紧贴悬停卡片右侧、垂直对齐卡片中部）。
  const [hover, setHover] = useState<{ f: FontEffect; top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const PREVIEW_W = 250; // 浮框宽度（与红框尺寸一致）
  const showHover = (f: FontEffect, el: HTMLElement) => {
    if (!f.img) return;
    const r = el.getBoundingClientRect();
    // 出现在卡片右侧 12px 处；垂直方向以卡片中心对齐浮框中心（浮框约 290 高）
    const left = Math.min(r.right + 12, window.innerWidth - PREVIEW_W - 12);
    const top = Math.max(12, Math.min(r.top + r.height / 2 - 145, window.innerHeight - 300));
    setHover({ f, top, left });
  };

  // 选中字体卡片：从「字体故事 / 参考灵感」点「立即使用」切到对应字体后，
  // 自动把该卡片滚动到可见，避免选中项落在长列表下方、用户看不到切换发生。
  const selectedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state.cat, state.effect]);

  return (
    <>
      <div className="ws-scroll">
      <div className="field">
        <div className="ws-label">文字内容</div>
        <input
          type="text"
          value={state.text}
          onChange={(e) => set("text", e.target.value)}
          placeholder="输入文字内容"
        />
      </div>

      <div className="field">
        <div className="ws-label">文字方向</div>
        <div className="font-dir">
          <button
            className={state.dir === "h" ? "font-dir-item on" : "font-dir-item"}
            onClick={() => set("dir", "h")}
          >
            <span className="fd-check">{state.dir === "h" && <Icon name="check" size={12} />}</span>
            横向
            <span className="fd-ico fd-ico-h" aria-hidden>
              <i /><i />
            </span>
          </button>
          <button
            className={state.dir === "v" ? "font-dir-item on" : "font-dir-item"}
            onClick={() => set("dir", "v")}
          >
            <span className="fd-check">{state.dir === "v" && <Icon name="check" size={12} />}</span>
            竖向
            <span className="fd-ico fd-ico-v" aria-hidden>
              <i /><i />
            </span>
          </button>
        </div>
      </div>

      <div className="field">
        <div className="ws-label">文字效果</div>
        <div className="font-eff-tabs">
          {fontCats.map((c) => (
            <span
              key={c}
              className={state.cat === c ? "font-eff-tab on" : "font-eff-tab"}
              onClick={() => {
                const first = fontEffects.find((f) => f.cat === c);
                setState({ ...state, cat: c, effect: first?.name ?? "" });
              }}
            >
              {c}
            </span>
          ))}
        </div>
        <div className="font-eff-grid">
          {effects.map((f) => (
            <div
              key={f.key}
              ref={state.effect === f.name ? selectedRef : undefined}
              className={state.effect === f.name ? "font-eff on" : "font-eff"}
              onClick={() => set("effect", f.name)}
              onMouseEnter={(e) => showHover(f, e.currentTarget)}
              onMouseLeave={() => setHover((h) => (h?.f.key === f.key ? null : h))}
            >
              <div className={f.img ? "fe-thumb has-img" : `fe-thumb fe-style-${f.key}`}>
                {f.img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="fe-thumb-img" src={asset(f.img!)} alt={f.name} loading="lazy" />
                ) : (
                  f.name
                )}
                {/* 右上角置顶按钮：点击把该字体置顶到当前分类网格最前；再点取消。已置顶时常驻显示。 */}
                <button
                  className={pinned.has(f.key) ? "fe-zoom fe-pin on lh-tip" : "fe-zoom fe-pin lh-tip"}
                  data-tip={pinned.has(f.key) ? "取消置顶" : "置顶"}
                  aria-label={pinned.has(f.key) ? "取消置顶" : "置顶"}
                  aria-pressed={pinned.has(f.key)}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePin(f.key);
                  }}
                >
                  <Icon name="pinTop" size={13} />
                </button>
              </div>
              <div className="fe-name">{f.name}</div>
            </div>
          ))}
        </div>
      </div>

      </div>
      <div className="ws-foot">
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={onGenerate}>
          立即生成 <span className="btn-credit">2算力</span>
        </button>
      </div>

      {/* 悬停预览浮层：移入左侧字体卡片时，在卡片右侧浮出预览图小框。
          Portal 到 body，z-index 高于右侧画廊，确保始终在最上层。 */}
      {mounted && hover &&
        createPortal(
          <div
            className="fe-hover-preview"
            style={{ top: hover.top, left: hover.left, width: PREVIEW_W }}
            aria-hidden
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="fe-hover-img" src={asset(hover.f.img!)} alt={hover.f.name} />
          </div>,
          document.body
        )}
    </>
  );
}
