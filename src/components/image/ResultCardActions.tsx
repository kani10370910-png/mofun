"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useLibrary } from "@/lib/store";
import type { AssetCard } from "@/lib/types";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

/* 生成历史结果卡通用「收藏 + 另存为我的素材」操作（全局统一样式/交互）。
   - 收藏：右上角心形按钮，hover 显示，点亮后写入「我的作品」并标记收藏
   - 另存：右下角图标按钮（带 tooltip），先弹确认框，确认后存入「我的素材」
   - extraActions：额外图标按钮（如 IP 的 IP故事/延展/下载），排在另存左边同一行
   asset(kind) 由各模块按自身信息生成 AssetCard（kind 为「图片」/「素材」）。 */
export function ResultCardActions({
  asset,
  extraActions,
  fav: favProp,
  onToggleFav,
}: {
  asset: (kind: string) => AssetCard;
  extraActions?: ReactNode;
  // 受控收藏（可选）：父级传 fav 状态 + onToggleFav 用于联动「只看收藏」筛选；
  // 不传则组件内部自管收藏态。
  fav?: boolean;
  onToggleFav?: () => void;
}) {
  const toast = useToast();
  const { addMaterial, addWork, toggleFavorite } = useLibrary();
  const [favInner, setFavInner] = useState(false);
  const controlled = favProp !== undefined;
  const fav = controlled ? favProp : favInner;
  const [confirmSave, setConfirmSave] = useState(false);

  function handleFav() {
    if (controlled) onToggleFav?.();
    else setFavInner((v) => !v);
    const a = asset("图片");
    addWork(a); // 确保该图在「我的作品」里（已存在则去重忽略）
    toggleFavorite(a);
    toast(fav ? "已取消收藏" : "已收藏，可在「仓库 · 我的作品」用「只看收藏」筛选");
  }

  return (
    <>
      {/* 右上角收藏按钮（hover 显示，点亮后可用「只看收藏」筛选） */}
      <button
        className={fav ? "lh-fav on" : "lh-fav"}
        title={fav ? "取消收藏" : "收藏"}
        onClick={(e) => {
          e.stopPropagation();
          handleFav();
        }}
      >
        <Icon name="heart" size={15} />
      </button>
      {/* 右下角功能图标行（hover 显示）：额外按钮 + 另存为 */}
      <div className="lh-corner-acts">
        {extraActions}
        <button
          className="lh-saveas lh-tip"
          data-tip="另存为我的素材"
          aria-label="另存为我的素材"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmSave(true);
          }}
        >
          <Icon name="share" size={16} />
        </button>
      </div>
      {confirmSave && (
        <ConfirmModal
          title="是否另存为我的素材？"
          cancelText="取消"
          confirmText="储存"
          onCancel={() => setConfirmSave(false)}
          onConfirm={() => {
            addMaterial(asset("素材"));
            addWork(asset("图片"));
            setConfirmSave(false);
            toast("已另存为「仓库 · 我的素材」");
          }}
        />
      )}
    </>
  );
}
