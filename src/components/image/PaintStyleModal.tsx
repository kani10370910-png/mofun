"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { paintStyles } from "@/data/image";
import { asset } from "@/lib/asset";
import { AutoBgImg } from "./AutoBgImg";

/* 「选择画面风格」面板：内嵌渲染在右侧结果区（与「帮我提案」/「图转文」同款交互）。
   九宫格风格卡，点选某风格后通过 onPick 回填并关闭。当前选中项高亮。 */
export function PaintStyleModal({
  current,
  onClose,
  onPick,
}: {
  current: string;
  onClose: () => void;
  onPick: (styleName: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // 点面板以外区域关闭（延后挂载，避免打开它的同一次点击立即关闭）
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const t = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="propose-pane">
      <div className="propose-panel ps-panel" ref={panelRef}>
        <div className="propose-head">
          <span className="propose-title">选择画面风格</span>
          <button className="bf-close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="ps-grid">
          {paintStyles.map((s) => (
            <button
              key={s.key}
              className={`ps-card ${s.name === current ? "on" : ""}`}
              onClick={() => {
                onPick(s.name);
                onClose();
              }}
            >
              <div className={`ps-thumb ${s.grad}`}>
                {s.img ? (
                  <AutoBgImg className="ps-img" src={asset(s.img)} alt={s.name} />
                ) : (
                  <span className="ps-emoji">{s.emoji}</span>
                )}
              </div>
              <div className="ps-name">{s.name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
