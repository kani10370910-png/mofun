"use client";

import { Icon } from "@/components/ui/Icon";
import { fontCats, fontEffects } from "@/data/image";
import type { FontCat } from "@/lib/types";

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
  const effects = fontEffects.filter((f) => f.cat === state.cat);

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
              className={state.effect === f.name ? "font-eff on" : "font-eff"}
              onClick={() => set("effect", f.name)}
            >
              <div className={`fe-thumb fe-style-${f.key}`}>{f.name}</div>
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
    </>
  );
}
