"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { useLibrary } from "@/lib/store";
import type { AssetCard } from "@/lib/types";

/* 从「仓库」选一张图：展示我的作品 + 我的素材里带图的卡片，选中回填
   tab：作品 / 素材，只显示有 img 的项；点击某张 → onPick(img, name) */
export function LibraryPickerModal({
  onPick,
  onClose,
}: {
  onPick: (img: string, name: string) => void;
  onClose: () => void;
}) {
  const { works, materials } = useLibrary();
  const [tab, setTab] = useState<"works" | "materials">("works");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 仅取带真实图片 URL 的卡片，按 url 去重
  const list = useMemo(() => {
    const src = tab === "works" ? works : materials;
    const seen = new Set<string>();
    return src.filter((a): a is AssetCard & { img: string } => {
      if (!a.img || seen.has(a.img)) return false;
      seen.add(a.img);
      return true;
    });
  }, [tab, works, materials]);

  if (!mounted) return null;

  // 用 Portal 渲染到 body，脱离右侧画廊所在的 stacking context，确保稳压全屏之上
  return createPortal(
    <div className="libpick-mask" onClick={onClose}>
      <div className="libpick-panel" onClick={(e) => e.stopPropagation()}>
        <div className="libpick-head">
          <div className="libpick-tabs">
            <button className={tab === "works" ? "libpick-tab on" : "libpick-tab"} onClick={() => setTab("works")}>
              我的作品
            </button>
            <button className={tab === "materials" ? "libpick-tab on" : "libpick-tab"} onClick={() => setTab("materials")}>
              我的素材
            </button>
          </div>
          <button className="libpick-close" aria-label="关闭" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {list.length === 0 ? (
          <div className="libpick-empty">
            <Icon name="image" size={40} />
            <span>{tab === "works" ? "「我的作品」里还没有图片" : "「我的素材」里还没有图片"}</span>
          </div>
        ) : (
          <div className="libpick-grid">
            {list.map((a, i) => (
              <button
                key={`${a.img}-${i}`}
                className="libpick-item"
                title={`选择：${a.name}`}
                onClick={() => {
                  onPick(a.img, a.name);
                  onClose();
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.img} alt={a.name} loading="lazy" />
                <span className="libpick-name">{a.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
