"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { useLibrary } from "@/lib/store";
import type { AssetCard } from "@/lib/types";

// 取 sub 最后一段作为来源标签，如 "品牌设计 · IP 设计" → "IP 设计"
function subLabel(sub: string): string {
  const parts = sub.split(/\s*·\s*/);
  return parts[parts.length - 1] ?? sub;
}

// 固定来源标签顺序（与左侧导航栏一致）
const SOURCE_ORDER = ["活动", "商拍", "logo", "IP设计", "AI字体", "店招设计"];

export type LibraryPickItem = { img: string; name: string };

/* 从「仓库」选图：展示我的作品 + 我的素材里带图的卡片
   multiple=false：点选一张即回填；multiple=true：可多选后确认上传 */
export function LibraryPickerModal({
  onPick,
  onPickMany,
  onClose,
  multiple = false,
}: {
  onPick?: (img: string, name: string) => void;
  onPickMany?: (items: LibraryPickItem[]) => void;
  onClose: () => void;
  multiple?: boolean;
}) {
  const { works, materials } = useLibrary();
  const [tab, setTab] = useState<"works" | "materials">("works");
  const [source, setSource] = useState<string>("全部");
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<Record<string, LibraryPickItem>>({});

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 切 tab 时重置来源筛选；多选时保留已选
  useEffect(() => {
    setSource("全部");
  }, [tab]);

  // 当前 tab 下所有有图片的卡片（按 url 去重）
  const allItems = useMemo(() => {
    const src = tab === "works" ? works : materials;
    const seen = new Set<string>();
    return src.filter((a): a is AssetCard & { img: string } => {
      if (!a.img || seen.has(a.img)) return false;
      seen.add(a.img);
      return true;
    });
  }, [tab, works, materials]);

  // 固定顺序显示所有来源标签，无论当前 tab 是否有对应图片
  const sources = SOURCE_ORDER;

  // 按来源标签筛选后的列表
  const list = useMemo(() => {
    if (source === "全部") return allItems;
    return allItems.filter((a) => subLabel(a.sub) === source);
  }, [allItems, source]);

  const selectedList = useMemo(() => Object.values(selected), [selected]);

  function toggleItem(a: AssetCard & { img: string }) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[a.img]) delete next[a.img];
      else next[a.img] = { img: a.img, name: a.name };
      return next;
    });
  }

  function confirmMany() {
    if (!selectedList.length) return;
    onPickMany?.(selectedList);
    onClose();
  }

  if (!mounted) return null;

  // 用 Portal 渲染到 body，脱离右侧画廊所在的 stacking context，确保稳压全屏之上
  return createPortal(
    <div className="libpick-mask" onClick={onClose}>
      <div className={`libpick-panel${multiple ? " libpick-panel--multi" : ""}`} onClick={(e) => e.stopPropagation()}>
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

        {sources.length > 0 && (
          <div className="libpick-filters">
            <button
              className={source === "全部" ? "libpick-filter on" : "libpick-filter"}
              onClick={() => setSource("全部")}
            >
              全部
            </button>
            {sources.map((s) => (
              <button
                key={s}
                className={source === s ? "libpick-filter on" : "libpick-filter"}
                onClick={() => setSource(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {list.length === 0 ? (
          <div className="libpick-empty">
            <Icon name="image" size={40} />
            <span>
              {source !== "全部"
                ? `「${source}」下暂无图片`
                : tab === "works"
                  ? "「我的作品」里还没有图片"
                  : "「我的素材」里还没有图片"}
            </span>
          </div>
        ) : (
          <div className="libpick-grid">
            {list.map((a, i) => {
              const on = !!selected[a.img];
              return (
                <button
                  key={`${a.img}-${i}`}
                  type="button"
                  className={on ? "libpick-item selected" : "libpick-item"}
                  title={multiple ? (on ? `取消选择：${a.name}` : `选择：${a.name}`) : `选择：${a.name}`}
                  aria-pressed={multiple ? on : undefined}
                  onClick={() => {
                    if (multiple) {
                      toggleItem(a);
                      return;
                    }
                    onPick?.(a.img, a.name);
                    onClose();
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.img} alt={a.name} loading="lazy" />
                  <span className="libpick-name">{a.name}</span>
                  {multiple && on ? <span className="libpick-check" aria-hidden>✓</span> : null}
                </button>
              );
            })}
          </div>
        )}

        {multiple && (
          <div className="libpick-footer">
            <span className="libpick-count">已选 {selectedList.length} 张</span>
            <div className="libpick-footer-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!selectedList.length}
                onClick={confirmMany}
              >
                确认上传{selectedList.length ? `（${selectedList.length}）` : ""}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
