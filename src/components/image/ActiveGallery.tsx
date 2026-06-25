"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { activeGalleryItems } from "@/data/image";
import { asset } from "@/lib/asset";
import { AutoBgImg } from "./AutoBgImg";

/* 活动右侧案例画廊（未生成时展示，按成图子类筛选） */
export function ActiveGallery({ sub }: { sub: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<"history" | "cases">("history");

  const items = sub ? activeGalleryItems.filter((it) => it.sub === sub) : activeGalleryItems;

  return (
    <>
      <div className="tabs">
        <div className={tab === "history" ? "tab on" : "tab"} onClick={() => setTab("history")}>
          生成历史
        </div>
        <div className={tab === "cases" ? "tab on" : "tab"} onClick={() => setTab("cases")}>
          参考灵感
        </div>
      </div>
      {items.length > 0 ? (
        <div className="ag-grid">
          {items.map((it) => (
            <div className="ag-card" key={it.name}>
              <div className={`ag-thumb ${it.grad}`}>
                <span className="ag-sub">{it.sub}</span>
                {it.img ? (
                  <AutoBgImg className="ag-img" src={asset(it.img)} alt={it.name} />
                ) : (
                  <span className="ag-emoji">{it.emoji}</span>
                )}
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
