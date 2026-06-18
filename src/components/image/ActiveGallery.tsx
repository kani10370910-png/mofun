"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { activeGalleryItems } from "@/data/image";

/* 活动右侧案例画廊（未生成时展示，按成图子类筛选） */
export function ActiveGallery({ sub }: { sub: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<"history" | "cases">("history");

  const items = sub ? activeGalleryItems.filter((it) => it.sub === sub) : activeGalleryItems;

  return (
    <>
      <div className="ag-tabs">
        <span className={tab === "history" ? "ag-tab on" : "ag-tab"} onClick={() => setTab("history")}>
          生成历史
        </span>
        <span className={tab === "cases" ? "ag-tab on" : "ag-tab"} onClick={() => setTab("cases")}>
          优秀案例
        </span>
      </div>
      {items.length > 0 ? (
        <div className="ag-grid">
          {items.map((it) => (
            <div className="ag-card" key={it.name}>
              <div className={`ag-thumb ${it.grad}`}>
                <span className="ag-sub">{it.sub}</span>
                <span className="ag-emoji">{it.emoji}</span>
                <div className="case-hover">
                  <button className="btn btn-primary btn-sm" onClick={() => toast(`套用「${it.name}」（演示）`)}>
                    套用模版
                  </button>
                </div>
              </div>
              <div className="ag-name">{it.name}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="preview-empty">
          <div>该分类暂无案例</div>
        </div>
      )}
    </>
  );
}
