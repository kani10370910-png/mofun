"use client";

import type { SimState } from "@/lib/useSimGenerate";

/* 模拟生成进度弹层（image/video 共用），1:1 还原原 demo 的 #genMask/#genPanel */
export function GenModal({ state, title }: { state: SimState; title: string }) {
  if (!state.open) return null;

  if (state.done) {
    return (
      <div className="modal-mask">
        <div className="gen-panel">
          <div className="gen-done-ico">✓</div>
          <div className="gen-title">生成完成！</div>
          <div className="gen-sub">正在为你展示结果…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-mask">
      <div className="gen-panel">
        <div className="gen-spinner" />
        <div className="gen-title">{title}…</div>
        <div className="gen-sub">引擎正在按品牌资产与场景模板生成，请稍候</div>
        <div className="gen-progress-track">
          <div className="gen-progress-bar" style={{ width: `${state.pct}%` }} />
        </div>
        <div className="gen-stage-list">
          {state.stages.map((s, i) => (
            <div
              key={i}
              className={`gen-stage ${i === state.stage ? "active" : ""} ${i < state.stage ? "done" : ""}`}
            >
              <span className="gs-dot">{i + 1}</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
