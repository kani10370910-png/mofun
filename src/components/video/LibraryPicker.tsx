"use client";

import { useMemo } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { useLibrary, assetKey } from "@/lib/store";
import { myWorks, myMaterials } from "@/data/storage";
import type { AssetCard } from "@/lib/types";

/* 仓库选择器：从「我的作品 + 我的素材」（含种子数据）里挑一张图片或一段视频，
   供制作大片的「首尾帧从仓库选图」「分镜视频从仓库调取视频」复用。
   - filter="image"：列出带真实图片（img）的非视频卡片，用作首帧/尾帧。
   - filter="video"：列出带真实视频地址（videoUrl）的视频卡片，用作某镜的成片。 */
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

  const items = useMemo(() => {
    const allWorks = [...works, ...myWorks].filter((w) => !hiddenWorks.includes(assetKey(w)));
    const allMats = [...materials, ...myMaterials].filter((m) => !hiddenMaterials.includes(assetKey(m)));
    const seen = new Set<string>();
    const uniq = [...allWorks, ...allMats].filter((it) => {
      const k = assetKey(it);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return filter === "video"
      ? uniq.filter((it) => it.kind === "视频" && it.videoUrl)
      : uniq.filter((it) => it.img && it.kind !== "视频");
  }, [works, materials, hiddenWorks, hiddenMaterials, filter]);

  return createPortal(
    <div className="lp-mask" onClick={onClose}>
      <div className="lp-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="lp-head">
          <span className="lp-title">从仓库选择{filter === "video" ? "视频" : "图片"}</span>
          <button className="lp-close" type="button" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={16} />
          </button>
        </div>
        {items.length ? (
          <div className="lp-grid">
            {items.map((it, i) => (
              <button className="lp-item" type="button" key={assetKey(it) + i} onClick={() => onPick(it)} title={it.name}>
                <div className="lp-thumb">
                  {it.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.img} alt={it.name} />
                  ) : (
                    <span className={`lp-emoji ${it.grad}`}>{it.emoji}</span>
                  )}
                  {filter === "video" && <span className="lp-vbadge">▶</span>}
                </div>
                <span className="lp-name">{it.name}</span>
                <span className="lp-sub">{it.sub}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="lp-empty">
            {filter === "video"
              ? "仓库里还没有可调取的视频。分镜视频全部生成后会自动存入「我的素材」，再回来即可调取。"
              : "仓库里还没有可用的图片素材，可先到「我的素材」上传或生成。"}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
