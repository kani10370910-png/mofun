"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { Brand } from "@/lib/types";
import { AssetCardView, editTargetOf } from "./StorageView";

const GRADS = ["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4", "thumb-grad-5", "thumb-grad-6"] as const;

export function BrandPane({ seed, seqStart }: { seed: Brand[]; seqStart: number }) {
  const toast = useToast();
  // 品牌列表本地可变（新增/另存副本）
  const [brands, setBrands] = useState<Brand[]>(() => JSON.parse(JSON.stringify(seed)));
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [seq, setSeq] = useState(seqStart);
  const [showForm, setShowForm] = useState(false);

  function toggle(id: string) {
    setActiveIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function addBrand(name: string, industry: string, logo: string) {
    const id = "br" + seq;
    const brand: Brand = {
      id,
      name,
      industry: industry || "未填写行业",
      logo: logo || "🏷️",
      grad: GRADS[brands.length % GRADS.length],
      owned: true,
      assets: [],
      works: [],
      materials: [],
    };
    setBrands((prev) => [...prev, brand]);
    setSeq((s) => s + 1);
    setActiveIds((prev) => [...prev, id]);
    toast("已新增品牌，请继续添加该品牌的资产");
  }

  function saveAsMine(src: Brand) {
    const copy: Brand = JSON.parse(JSON.stringify(src));
    let s = seq;
    copy.id = "br" + s++;
    copy.name = src.name + "（我的副本）";
    copy.owned = true;
    copy.assets.forEach((a) => (a.id = "b" + s++));
    setBrands((prev) => [...prev, copy]);
    setSeq(s);
    setActiveIds((prev) => [...prev, copy.id]);
    toast("已另存为我的品牌，现在可自由编辑");
  }

  const expanded = activeIds
    .map((id) => brands.find((b) => b.id === id))
    .filter((b): b is Brand => !!b);

  return (
    <>
      <div className="toolbar">
        <p className="empty-note" style={{ margin: 0 }}>
          按「家」管理品牌资产：可同时勾选多家，下方依次展开各家的作品与素材文件，未选中的看不到。
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
          <Icon name="plus" size={15} /> 新增品牌资产
        </button>
      </div>

      <div className="brand-card-grid">
        {brands.map((b) => {
          const on = activeIds.includes(b.id);
          return (
            <div key={b.id} className={on ? "brand-card on" : "brand-card"}>
              <div className={`bc-logo ${b.grad}`}>{b.logo}</div>
              <div className="bc-name">{b.name}</div>
              <div className="bc-industry">{b.industry}</div>
              <div className="bc-stat">
                {b.assets.length} 项资产 · {b.works.length} 作品 · {b.materials.length} 素材
              </div>
              <button
                className={`btn ${on ? "btn-primary" : "btn-soft"} btn-sm bc-enter`}
                onClick={() => toggle(b.id)}
              >
                {on ? "✓ 已选" : "使用"}
              </button>
            </div>
          );
        })}
      </div>

      <div id="brandExpandHost">
        {expanded.map((b) => (
          <BrandExpand key={b.id} brand={b} onSaveAsMine={saveAsMine} toast={toast} />
        ))}
      </div>

      {showForm && <NewBrandForm onClose={() => setShowForm(false)} onSave={addBrand} toast={toast} />}
    </>
  );
}

function BrandExpand({
  brand,
  onSaveAsMine,
  toast,
}: {
  brand: Brand;
  onSaveAsMine: (b: Brand) => void;
  toast: (s: string) => void;
}) {
  const editable = !!brand.owned;
  const router = useRouter();
  return (
    <div className="brand-expand">
      <div className="be-head">
        <div className="bd-title">
          <span className={`bd-logo ${brand.grad}`}>{brand.logo}</span>
          <div>
            <b>{brand.name}</b>{" "}
            {editable ? (
              <span className="bd-badge bd-badge-mine">我的品牌</span>
            ) : (
              <span className="bd-badge bd-badge-readonly">
                <Icon name="shield" size={13} /> 他人资产 · 只读
              </span>
            )}
            <div className="empty-note" style={{ margin: 0 }}>
              {brand.industry}
            </div>
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          {!editable && (
            <button className="btn btn-primary btn-sm" onClick={() => onSaveAsMine(brand)}>
              <Icon name="copy" size={15} /> 另存为我的品牌
            </button>
          )}
        </div>
      </div>

      {/* 品牌资产行 */}
      {brand.assets.length > 0 && (
        <div className="bd-section">
          <div className="bd-section-head">
            <h4>
              品牌资产 <span className="bd-count">{brand.assets.length}</span>
            </h4>
          </div>
          <div>
            {brand.assets.map((a) => (
              <div className="brand-asset-row" key={a.id}>
                {a.type === "color" ? (
                  <div className="brand-swatches">
                    {(a.colors ?? []).map((c, i) => (
                      <div key={i} className="swatch" style={{ background: c }} />
                    ))}
                  </div>
                ) : (
                  <div className="oc-ico" style={{ margin: 0 }}>
                    <Icon name={a.type === "font" ? "content" : a.type === "slogan" ? "wechat" : "sparkle"} size={22} />
                  </div>
                )}
                <div className="brand-asset-meta">
                  <h4>{a.name}</h4>
                  <p>{a.sub}</p>
                </div>
                {editable && (
                  <div className="brand-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => toast(`编辑「${a.name}」（演示）`)}>
                      <Icon name="edit" size={14} /> 编辑
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => toast(`删除「${a.name}」（演示）`)}>
                      <Icon name="trash" size={14} /> 删除
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bd-section">
        <div className="bd-section-head">
          <h4>
            这家的作品 <span className="bd-count">{brand.works.length}</span>
          </h4>
        </div>
        <div className="grid grid-4">
          {brand.works.length > 0 ? (
            brand.works.map((w) => (
              <AssetCardView
                key={w.name}
                item={w}
                actions={
                  editable ? (
                    <>
                      <button
                        className="btn btn-soft btn-sm"
                        onClick={() => {
                          const t = editTargetOf(w);
                          toast(`正在打开「${t.label}」编辑器…`);
                          router.push(t.href);
                        }}
                      >
                        二次编辑
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toast("重出规格（演示）")}>
                        重出规格
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn-soft btn-sm"
                        onClick={() => {
                          const t = editTargetOf(w);
                          toast(`正在打开「${t.label}」编辑器…`);
                          router.push(t.href);
                        }}
                      >
                        使用
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toast(`已将「${w.name}」另存为我的素材（演示）`)}>
                        另存为我的素材
                      </button>
                    </>
                  )
                }
              />
            ))
          ) : (
            <div className="empty-state">这家暂无作品。</div>
          )}
        </div>
      </div>

      <div className="bd-section">
        <div className="bd-section-head">
          <h4>
            这家的素材文件 <span className="bd-count">{brand.materials.length}</span>
          </h4>
          {editable && (
            <button className="btn btn-ghost btn-sm" onClick={() => toast("上传素材（演示）")}>
              <Icon name="upload" size={14} /> 上传素材
            </button>
          )}
        </div>
        <div className="grid grid-4">
          {brand.materials.length > 0 ? (
            brand.materials.map((m) => (
              <AssetCardView
                key={m.name}
                item={m}
                actions={
                  editable ? (
                    <>
                      <button className="btn btn-soft btn-sm">用于做图</button>
                      <button className="btn btn-ghost btn-sm">下载</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-soft btn-sm">使用</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toast(`已将「${m.name}」另存为我的素材（演示）`)}>
                        另存为我的素材
                      </button>
                    </>
                  )
                }
              />
            ))
          ) : (
            <div className="empty-state">这家暂无素材文件。</div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewBrandForm({
  onClose,
  onSave,
  toast,
}: {
  onClose: () => void;
  onSave: (name: string, industry: string, logo: string) => void;
  toast: (s: string) => void;
}) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [logo, setLogo] = useState("");

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="gen-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bf-head">
          <div className="gen-title" style={{ textAlign: "left" }}>
            新增品牌资产（一家）
          </div>
          <button className="bf-close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="field">
          <div className="ws-label">
            品牌名称 <span className="req">*</span>
          </div>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：安吉白茶·产业品牌" />
        </div>
        <div className="field">
          <div className="ws-label">所属行业</div>
          <input type="text" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="例如：农产品区域公用品牌" />
        </div>
        <div className="field">
          <div className="ws-label">品牌标识 Emoji</div>
          <input type="text" value={logo} maxLength={2} onChange={(e) => setLogo(e.target.value)} placeholder="例如：🍃" />
        </div>
        <div className="gen-actions">
          <button className="btn btn-ghost btn-block" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              if (!name.trim()) {
                toast("请填写品牌名称");
                return;
              }
              onSave(name.trim(), industry.trim(), logo.trim());
              onClose();
            }}
          >
            确认新增
          </button>
        </div>
      </div>
    </div>
  );
}
