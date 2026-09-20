"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { useLibrary, assetKey, assetDedupeKey } from "@/lib/store";
import { myWorks, myMaterials } from "@/data/storage";
import type { AssetCard } from "@/lib/types";
import { resolveAssetPlayback } from "@/lib/videoCache";

// 取 sub 最后一段作为来源标签，如 "品牌设计 · IP 设计" → "IP 设计"
function subLabel(sub: string): string {
  const parts = (sub || "").split(/\s*·\s*/);
  return parts[parts.length - 1] ?? sub;
}
// 固定来源标签顺序（与「仓库」页一致）
const SOURCE_ORDER = ["活动", "商拍", "logo", "IP设计", "AI字体", "店招设计"];

/* 仓库选择器：与「仓库」页统一的样式——「我的作品 / 我的素材」标签页 + 分类筛选 + 网格。
   供制作大片的「首尾帧从仓库选图」「分镜视频从仓库调取视频」复用。
   - filter="image"：列出带真实图片（img）的非视频卡片，用作首帧/尾帧/参考图，并按品牌设计分类筛选。
   - filter="video"：列出带真实视频地址（videoUrl）的视频卡片，用作某镜的成片（视频无品牌分类，隐藏筛选行）。 */
export function LibraryPicker({
  filter,
  onPick,
  onClose,
}: {
  filter: "image" | "video";
  onPick: (item: AssetCard) => void;
  onClose: () => void;
}) {
  const { works, materials, hiddenWorks, hiddenMaterials } = useLibrary();
  const [tab, setTab] = useState<"works" | "materials">("works");
  const [source, setSource] = useState<string>("全部");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  // 切 tab 时重置来源筛选
  useEffect(() => { setSource("全部"); }, [tab]);

  // 当前 tab 的卡片：合并种子数据 → 隐藏过滤 → 按 filter 取图片/视频 → 去重
  const allItems = useMemo(() => {
    const hiddenOf = (hidden: string[], it: AssetCard) =>
      hidden.includes(assetKey(it)) || hidden.includes(assetDedupeKey(it));
    const src = tab === "works"
      ? [...works, ...myWorks].filter((w) => !hiddenOf(hiddenWorks, w))
      : [...materials, ...myMaterials].filter((m) => !hiddenOf(hiddenMaterials, m));
    const kept = filter === "video"
      ? src.filter((it) => it.kind === "视频" && !!(it.videoUrl || it.mediaRef))
      : src.filter((it) => it.img && it.kind !== "视频");
    const seen = new Set<string>();
    return kept.filter((it) => {
      const k = assetKey(it);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [tab, works, materials, hiddenWorks, hiddenMaterials, filter]);

  // 分类筛选仅对图片有意义（视频没有品牌设计分类）
  const showFilters = filter === "image";
  const list = useMemo(() => {
    if (!showFilters || source === "全部") return allItems;
    return allItems.filter((a) => subLabel(a.sub) === source);
  }, [allItems, source, showFilters]);

  if (!mounted) return null;

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

        {showFilters && (
          <div className="libpick-filters">
            <button className={source === "全部" ? "libpick-filter on" : "libpick-filter"} onClick={() => setSource("全部")}>
              全部
            </button>
            {SOURCE_ORDER.map((s) => (
              <button key={s} className={source === s ? "libpick-filter on" : "libpick-filter"} onClick={() => setSource(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        {list.length === 0 ? (
          <div className="libpick-empty">
            <Icon name={filter === "video" ? "film" : "image"} size={40} />
            <span>
              {filter === "video"
                ? "这里还没有可调取的视频。分镜视频全部生成后会自动存入「我的素材」，再回来即可调取。"
                : source !== "全部"
                  ? `「${source}」下暂无图片`
                  : tab === "works"
                    ? "「我的作品」里还没有图片"
                    : "「我的素材」里还没有图片"}
            </span>
          </div>
        ) : (
          <div className="libpick-grid">
            {list.map((it) => (
              <button
                key={assetKey(it)}
                className="libpick-item"
                title={`选择：${it.name}`}
                onClick={() => {
                  void (async () => {
                    if (filter === "video" && !it.videoUrl && it.mediaRef) {
                      const play = await resolveAssetPlayback(it);
                      if (!play) return;
                      onPick({ ...it, videoUrl: play.url });
                      onClose();
                      return;
                    }
                    onPick(it);
                    onClose();
                  })();
                }}
              >
                {it.img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.img} alt={it.name} loading="lazy" />
                ) : (
                  <span className={`libpick-emoji ${it.grad}`}>{it.emoji}</span>
                )}
                {filter === "video" && <span className="libpick-vbadge"></span>}
                <span className="libpick-name">{it.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
