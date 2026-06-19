"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { myWorks, myMaterials, brands as seedBrands, BRAND_SEQ_START } from "@/data/storage";
import type { AssetCard } from "@/lib/types";
import { useLibrary, assetKey } from "@/lib/store";
import { asset } from "@/lib/asset";
import { BrandPane } from "./BrandPane";
import { AssetFilterBar, useAssetFilter } from "./AssetFilter";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

// 作品「二次编辑」：按作品类型 / 来源路由到对应功能模块，并带上记录内容回填
export function editTargetOf(item: AssetCard): { href: string; label: string } {
  const text = `${item.kind} ${item.sub} ${item.name}`;
  // 基础路由
  let base = "/image?sub=event";
  let label = "宣传图片";
  if (item.kind === "文案" || text.includes("内容创作")) {
    base = "/content";
    label = "内容创作";
  } else if (item.kind === "视频" || text.includes("视频生成")) {
    base = "/video";
    label = "视频生成";
  } else if (text.includes("logo") || text.includes("LOGO")) {
    base = "/image?sub=logo";
    label = "品牌设计 · logo";
  } else if (text.includes("AI字体") || text.includes("字体")) {
    base = "/image?sub=font";
    label = "品牌设计 · AI字体";
  } else if (text.includes("IP")) {
    base = "/image?sub=ip";
    label = "品牌设计 · IP设计";
  } else if (text.includes("店招")) {
    base = "/image?sub=signage";
    label = "店招设计";
  } else if (text.includes("商拍") || text.includes("商品")) {
    base = "/image?sub=product";
    label = "商拍";
  }

  // 把记录内容（edit）编码进 URL，编辑器读取后回填
  if (item.edit && Object.keys(item.edit).length) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(item.edit)) {
      if (k === "sub") continue; // sub 已体现在 base
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    if (qs) base += (base.includes("?") ? "&" : "?") + qs;
  }
  return { href: base, label };
}

type Tab = "works" | "materials" | "brand";
const TABS: { key: Tab; name: string }[] = [
  { key: "works", name: "我的作品" },
  { key: "materials", name: "我的素材" },
  { key: "brand", name: "品牌资产" },
];

export function StorageView({ initialTab = "works" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const toast = useToast();

  return (
    <div className="page">
      <div className="tabs">
        {TABS.map((t) => (
          <div key={t.key} className={tab === t.key ? "tab on" : "tab"} onClick={() => setTab(t.key)}>
            {t.name}
          </div>
        ))}
      </div>
      <div id="storageBody">
        {tab === "works" && <WorksPane toast={toast} />}
        {tab === "materials" && <MaterialsPane toast={toast} />}
        {tab === "brand" && <BrandPane seed={seedBrands} seqStart={BRAND_SEQ_START} />}
      </div>
    </div>
  );
}

function WorksPane({ toast }: { toast: (s: string) => void }) {
  const { works, hiddenWorks, removeWork, toggleFavorite, isFavorite } = useLibrary();
  const router = useRouter();
  const [pendingDel, setPendingDel] = useState<AssetCard | null>(null);
  const all = [...works, ...myWorks].filter((w) => !hiddenWorks.includes(assetKey(w)));
  const f = useAssetFilter(all, isFavorite);
  return (
    <>
      <p className="empty-note" style={{ marginBottom: 16 }}>
        三个模块（内容/图片/视频）产物统一归档：可命名、可二次编辑、可删除。
      </p>
      <AssetFilterBar {...f} total={all.length} shown={f.filtered.length} />
      {f.filtered.length === 0 ? (
        <div className="preview-empty" style={{ minHeight: 220 }}>
          <div>没有符合条件的作品，换个关键词或日期试试</div>
        </div>
      ) : (
        <div className="grid grid-4">
          {f.filtered.map((w, i) => {
            const target = editTargetOf(w);
            return (
              <AssetCardView
                key={`${w.name}-${i}`}
                item={w}
                fav={isFavorite(w)}
                onToggleFav={() => toggleFavorite(w)}
                actions={
                  <>
                    <button
                      className="btn btn-soft btn-sm"
                      onClick={() => {
                        toast(`正在打开「${target.label}」编辑器…`);
                        router.push(target.href);
                      }}
                    >
                      二次编辑
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setPendingDel(w)}>
                      删除
                    </button>
                  </>
                }
              />
            );
          })}
        </div>
      )}

      {pendingDel && (
        <ConfirmModal
          title="确定删除这个作品吗？"
          onCancel={() => setPendingDel(null)}
          onConfirm={() => {
            removeWork(pendingDel);
            setPendingDel(null);
            toast("已删除该作品");
          }}
        />
      )}
    </>
  );
}

function MaterialsPane({ toast }: { toast: (s: string) => void }) {
  const { materials, hiddenMaterials, removeMaterial, toggleFavorite, isFavorite } = useLibrary();
  const [pendingDel, setPendingDel] = useState<AssetCard | null>(null);
  const all = [...materials, ...myMaterials].filter((m) => !hiddenMaterials.includes(assetKey(m)));
  const f = useAssetFilter(all, isFavorite);
  return (
    <>
      <div className="toolbar">
        <p className="empty-note">
          产品照 / 门头照 / 历史物料上传管理，供「图生图」「图生视频」随时调用。
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => toast("上传素材（演示）")}>
          <Icon name="upload" size={15} />
          上传素材
        </button>
      </div>
      <div className="upload" style={{ marginBottom: 18 }} onClick={() => toast("上传素材（演示）")}>
        <span className="up-ico">
          <Icon name="upload" size={24} />
        </span>
        拖拽或点击上传产品照 / 门头照 / 历史物料
      </div>
      <AssetFilterBar {...f} total={all.length} shown={f.filtered.length} />
      {f.filtered.length === 0 ? (
        <div className="preview-empty" style={{ minHeight: 200 }}>
          <div>没有符合条件的素材，换个关键词或日期试试</div>
        </div>
      ) : (
        <div className="grid grid-4">
          {f.filtered.map((m, i) => (
            <AssetCardView
              key={`${m.name}-${i}`}
              item={m}
              fav={isFavorite(m)}
              onToggleFav={() => toggleFavorite(m)}
              actions={
                <button className="btn btn-ghost btn-sm" onClick={() => setPendingDel(m)}>
                  删除
                </button>
              }
            />
          ))}
        </div>
      )}

      {pendingDel && (
        <ConfirmModal
          title="确定删除这个素材吗？"
          onCancel={() => setPendingDel(null)}
          onConfirm={() => {
            removeMaterial(pendingDel);
            setPendingDel(null);
            toast("已删除该素材");
          }}
        />
      )}
    </>
  );
}

export function AssetCardView({
  item,
  actions,
  fav,
  onToggleFav,
}: {
  item: AssetCard;
  actions: React.ReactNode;
  fav?: boolean;
  onToggleFav?: () => void;
}) {
  return (
    <div className="asset-card">
      <div className={`asset-thumb ${item.img ? "" : item.grad}`}>
        <span className="at-kind">{item.kind}</span>
        {onToggleFav && (
          <button
            className={fav ? "at-fav on" : "at-fav"}
            title={fav ? "取消收藏" : "收藏"}
            onClick={onToggleFav}
          >
            <Icon name="heart" size={15} />
          </button>
        )}
        {item.img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="at-img" src={asset(item.img!)} alt={item.name} loading="lazy" />
        ) : (
          <span className="at-emoji">{item.emoji}</span>
        )}
      </div>
      <div className="asset-info">
        <div className="asset-name">{item.name}</div>
        <div className="asset-sub">{item.sub}</div>
        {item.time && <div className="asset-time">生成于 {item.time}</div>}
      </div>
      <div className="asset-actions">{actions}</div>
    </div>
  );
}
