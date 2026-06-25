"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { AssetCard } from "@/lib/types";
import { useLibrary } from "@/lib/store";
import { nowStamp } from "@/lib/datetime";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ipCases, type IpCase } from "@/data/image";
import { AutoBgImg } from "./AutoBgImg";
import { asset as assetUrl } from "@/lib/asset";
import { IpStoryModal } from "./IpStoryModal";
import { IpDownloadModal } from "./IpDownloadModal";
import type { IpGenPayload, IpCopyPayload } from "./ImageIpPanel";

/* 延展设计：把当前图片信息带到 IP扩展设计功能 */
export interface IpExtendSeed {
  img: string;
  name: string;
}

/* 画面比例名 → CSS aspect-ratio（让卡片按真实比例显示，不再一律方形裁切）。
   兼容「横向 5:3」「纵向 3:5」「16:9」「自定义 4:3」等；无法识别时按 1/1。 */
function ratioToAspect(ratioName?: string): string {
  if (!ratioName) return "1 / 1";
  const m = ratioName.match(/(\d+)\s*[:：]\s*(\d+)/);
  if (m) {
    const w = Number(m[1]) || 1;
    const h = Number(m[2]) || 1;
    return `${w} / ${h}`;
  }
  return "1 / 1";
}

/* IP 设计的一次生成记录：进度态用 pct<100，完成后 imgs 为真实图片 URL 列表 */
export interface IpRunRow {
  id: string;
  title: string; // 标题（主体/品牌名）
  desc?: string; // 当时优化后的完整画面描述（展示 + 复制回填）
  rawDesc?: string; // 用户原始创意描述（供「IP故事」据此生成，不识别图片）
  colors?: string[]; // 偏好颜色
  ratioName?: string; // 画面尺寸/比例名
  storyDesc?: string; // 出图后后台预加载好的 IP 形象描述（弹窗直接用，无需现场等待）
  // 扩展设计的结构化展示信息：卡片头用 IP 原图缩略 + 延展项 + 描述词 + 参考图替代裸 prompt
  ext?: {
    ipImg: string; // 用户上传的 IP 原图
    tab: string; // 本次涉及的延展项（可多项，如「动作、场景」）
    desc?: string; // 图片描述词
    refImg?: string; // 实际传给模型的参考图（data URL）
  };
  // IP创新设计的结构化展示信息：卡片头按 参考图→创意描述→偏好颜色→画面尺寸 排列，没填的跳过
  create?: {
    refImg?: string; // 用户上传的参考图
    desc: string; // 创意描述原文
    colors?: string[]; // 偏好颜色
    ratioName?: string; // 画面尺寸名
  };
  time: string;
  pct: number; // <100 加载中；100 完成
  grads: string[]; // 每张卡片的渐变占位（加载态背景）
  imgs: string[]; // 完成后的图片 URL；与 grads 等长
  error?: string; // 出错信息（加载失败时展示）
}

// 按生成时间分组：今天 / 昨天 / 更早
function groupLabel(time: string): string {
  const m = time.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return "今天";
  const [, y, mo, d, h, mi] = m;
  const that = new Date(Number(y), Number(mo) - 1, Number(d));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - that.getTime()) / 864e5);
  if (diffDays <= 0) return "今天";
  if (diffDays === 1) return "昨天";
  return `${mo}-${d} ${h}:${mi}`;
}

function groupRuns(rows: IpRunRow[]): [string, IpRunRow[]][] {
  const order: string[] = [];
  const map = new Map<string, IpRunRow[]>();
  for (const r of rows) {
    const label = groupLabel(r.time);
    if (!map.has(label)) {
      map.set(label, []);
      order.push(label);
    }
    map.get(label)!.push(r);
  }
  return order.map((l) => [l, map.get(l)!]);
}

/* IP 设计右侧画廊：生成历史（含内联进度 + 真实出图 + 收藏）/ 参考灵感
   tab 由父级受控：默认无历史看「参考灵感」，点生成时父级切到「生成历史」 */
export function IpGallery({
  tab,
  setTab,
  runRows,
  onDeleteRun,
  onCopyRun,
  onUseCase,
  onExtend,
  onGenerate,
}: {
  tab: "history" | "inspire";
  setTab: (t: "history" | "inspire") => void;
  runRows: IpRunRow[];
  onDeleteRun: (id: string) => void;
  onCopyRun: (payload: IpCopyPayload) => void;
  onUseCase: (c: IpCase) => void;
  onExtend: (seed: IpExtendSeed) => void;
  onGenerate: (payload: IpGenPayload) => void;
}) {
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [onlyFav, setOnlyFav] = useState(false);
  // 收藏：按图片唯一 key 记录，可切换并供「只看收藏」筛选
  const [favs, setFavs] = useState<Set<string>>(() => new Set());
  const isFav = (key: string) => favs.has(key);
  function toggleFav(key: string) {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function confirmDelete() {
    if (!pending) return;
    onDeleteRun(pending);
    setPending(null);
    toast("已删除该记录");
  }

  return (
    <>
      <div className="lg-head">
        <div className="tabs">
          <div className={tab === "history" ? "tab on" : "tab"} onClick={() => setTab("history")}>
            生成历史
          </div>
          <div className={tab === "inspire" ? "tab on" : "tab"} onClick={() => setTab("inspire")}>
            参考灵感
          </div>
        </div>
        {tab === "history" && (
          <label className="lg-fav-switch">
            <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} />
            <span className="lg-switch" />
            只看收藏
          </label>
        )}
      </div>

      {tab === "history" ? (
        runRows.length === 0 ? (
          <div className="preview-empty">
            <div>
              <div className="pe-ico">
                <Icon name="image" size={42} />
              </div>
              还没有生成记录，填好左侧点「立即生成」试试
            </div>
          </div>
        ) : (
          <div id="ipHistory">
            {groupRuns(runRows).map(([label, rows]) => (
              <div className="lh-group" key={label}>
                <div className="lh-group-title">{label}</div>
                {rows.map((row) => (
                  <IpRunRowView
                    key={row.id}
                    row={row}
                    toast={toast}
                    onDelete={() => setPending(row.id)}
                    onCopy={() => {
                      // 把记录的结构化信息整条带回左侧逐项还原
                      if (row.ext) {
                        onCopyRun({ kind: "extend", desc: row.ext.desc || "", ipImg: row.ext.ipImg });
                      } else if (row.create) {
                        onCopyRun({
                          kind: "create",
                          desc: row.create.desc || "",
                          colors: row.create.colors,
                          ratioName: row.create.ratioName,
                          refImg: row.create.refImg,
                        });
                      } else if (row.desc) {
                        onCopyRun({ kind: "create", desc: row.desc });
                      }
                    }}
                    onlyFav={onlyFav}
                    isFav={isFav}
                    onToggleFav={toggleFav}
                    onExtend={onExtend}
                    onGenerate={onGenerate}
                  />
                ))}
              </div>
            ))}
          </div>
        )
      ) : (
        // 参考灵感：IP 案例网格，点「制作同款」把描述回填到左侧创意描述
        <div className="inspo-grid">
          {ipCases.map((c) => (
            <div className="lg-case" key={c.name} onClick={() => onUseCase(c)}>
              <div className="lg-case-thumb">
                {c.img ? (
                  <AutoBgImg className="lg-case-img" src={assetUrl(c.img)} alt={c.name} />
                ) : (
                  <span className="lg-case-emoji">{c.emoji}</span>
                )}
                <div className="case-hover">
                  <button
                    className="btn btn-sm lg-case-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUseCase(c);
                    }}
                  >
                    制作同款
                  </button>
                </div>
              </div>
              <div className="lg-case-foot">
                <span className="lg-case-name">{c.name}</span>
                <span className="lg-cat">{c.cat}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {pending && (
        <ConfirmModal title="确定删除这个记录吗？" onCancel={() => setPending(null)} onConfirm={confirmDelete} />
      )}
    </>
  );
}

function IpRunRowView({
  row,
  toast,
  onDelete,
  onCopy,
  onlyFav,
  isFav,
  onToggleFav,
  onExtend,
  onGenerate,
}: {
  row: IpRunRow;
  toast: (s: string, kind?: "warn" | "success") => void;
  onDelete: () => void;
  onCopy: () => void;
  onlyFav: boolean;
  isFav: (key: string) => boolean;
  onToggleFav: (key: string) => void;
  onExtend: (seed: IpExtendSeed) => void;
  onGenerate: (payload: IpGenPayload) => void;
}) {
  const loading = row.pct < 100;
  const cells = row.grads.map((grad, i) => ({ grad, i, key: `ip-${row.id}-${i}` }));
  const shown = !loading && !row.error && onlyFav ? cells.filter(({ key }) => isFav(key)) : cells;
  // 「只看收藏」下，已完成且无收藏结果的行整行隐藏
  if (!loading && !row.error && onlyFav && shown.length === 0) return null;
  return (
    <div className="lh-row">
      <div className={`lh-meta${row.ext ? " lh-meta-ext" : ""}`}>
        {row.ext ? (
          // 扩展设计：结构化展示——标题 + 上传 IP 图 + 参考图 + 延展项/预设 + 图片描述词
          <span className="lh-title lh-ext-title">
            <b className="lh-prompt">{row.title}</b>
            {row.ext.ipImg && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="lh-ext-thumb" src={row.ext.ipImg} alt="IP 原图" title="上传的 IP 图" />
            )}
            {row.ext.refImg && (
              <span className="lh-ext-ref" title="图生图参考图">
                参考图
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="lh-ext-thumb lh-ext-thumb-sm" src={row.ext.refImg} alt="参考图" />
              </span>
            )}
            {row.ext.desc && <span className="lh-ext-desc">{row.ext.desc}</span>}
          </span>
        ) : row.create ? (
          // IP创新设计：按 参考图 → 创意描述 → 偏好颜色 → 画面尺寸 排列，没填的跳过
          <span className="lh-title lh-ext-title">
            <b className="lh-prompt">{row.title}</b>
            {row.create.refImg && (
              <span className="lh-ext-ref" title="参考图">
                参考图
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="lh-ext-thumb lh-ext-thumb-sm" src={row.create.refImg} alt="参考图" />
              </span>
            )}
            <span className="lh-ext-desc">{row.create.desc}</span>
            {row.create.colors && row.create.colors.length > 0 && (
              <span className="lh-ext-ref" title="偏好颜色">
                偏好色
                <span className="lh-ext-colors">
                  {row.create.colors.map((c, i) => (
                    <i key={i} className="lh-ext-color" style={{ background: c }} />
                  ))}
                </span>
              </span>
            )}
            {row.create.ratioName && <span className="lh-ext-meta">{row.create.ratioName}</span>}
          </span>
        ) : (
          <span className="lh-title">
            <b className="lh-prompt">{row.title}</b>
            {row.desc && <span className="lh-desc">{row.desc}</span>}
          </span>
        )}
        {!loading && (
          <>
            {/* 复制：创新设计复制创意描述；扩展设计仅当填了图片描述词时显示 */}
            {(row.ext ? !!row.ext.desc : row.create ? !!row.create.desc : !!row.desc) && (
              <button className="lh-ico lh-tip" data-tip="复制描述到左侧" aria-label="复制" onClick={onCopy}>
                <Icon name="copy" size={14} />
              </button>
            )}
            <button className="lh-ico lh-tip" data-tip="删除" aria-label="删除" onClick={onDelete}>
              <Icon name="trash" size={14} />
            </button>
            <span className="lh-time-spacer" aria-hidden />
            <span className="lh-time">{row.time}</span>
          </>
        )}
      </div>
      <div className="lh-imgs">
        {shown.map(({ grad, i, key }) =>
          loading ? (
            <div className={`lh-img ${grad} lh-loading`} key={i} style={{ aspectRatio: ratioToAspect(row.ratioName) }}>
              <span className="lh-progress">{row.pct}%完成</span>
              <span className="lh-think">
                <Icon name="sparkle" size={22} />
                <em>正在构思…</em>
              </span>
            </div>
          ) : row.error ? (
            <div className={`lh-img ${grad}`} key={i} style={{ aspectRatio: ratioToAspect(row.ratioName), display: "grid", placeItems: "center", padding: 12 }}>
              <span className="lh-fail">生成失败</span>
            </div>
          ) : (
            <IpResultCard
              key={key}
              img={row.imgs[i]}
              grad={grad}
              name={row.title}
              baseDesc={row.desc}
              rawDesc={row.rawDesc}
              colors={row.colors}
              ratioName={row.ratioName}
              preDesc={row.storyDesc}
              toast={toast}
              fav={isFav(key)}
              onToggleFav={() => onToggleFav(key)}
              onExtend={onExtend}
              onGenerate={onGenerate}
            />
          )
        )}
      </div>
    </div>
  );
}

function IpResultCard({
  img,
  grad,
  name,
  baseDesc,
  rawDesc,
  colors,
  ratioName,
  preDesc,
  toast,
  fav = false,
  onToggleFav,
  onExtend,
  onGenerate,
}: {
  img?: string;
  grad: string;
  name: string;
  baseDesc?: string;
  rawDesc?: string;
  colors?: string[];
  ratioName?: string;
  preDesc?: string;
  toast: (s: string, kind?: "warn" | "success") => void;
  fav?: boolean;
  onToggleFav?: () => void;
  onExtend: (seed: IpExtendSeed) => void;
  onGenerate: (payload: IpGenPayload) => void;
}) {
  const [confirmSave, setConfirmSave] = useState(false);
  const [zoom, setZoom] = useState(false); // 点击图片放大预览
  const [imgError, setImgError] = useState(false); // 图片加载失败（URL 失效/超时）
  const [story, setStory] = useState(false); // IP 故事弹窗
  const [dlOpen, setDlOpen] = useState(false); // 编辑/下载（生成信息）弹窗
  const { addMaterial, addWork, toggleFavorite } = useLibrary();

  const asset = (kind: string): AssetCard => ({
    emoji: "🧸",
    grad: grad as AssetCard["grad"],
    kind,
    name: `${name} · IP 设计`,
    sub: "品牌设计 · IP 设计",
    img,
    time: nowStamp(),
  });

  // 收藏：本地切换（控制「只看收藏」筛选）+ 同步写入仓库（存为作品并标记收藏）
  function handleToggleFav() {
    onToggleFav?.();
    const a = asset("图片");
    addWork(a); // 确保该图在「我的作品」里（已存在则去重忽略）
    toggleFavorite(a);
    toast(fav ? "已取消收藏" : "已收藏，可在「仓库 · 我的作品」用「只看收藏」筛选");
  }

  // 下载当前图片到本地：走 /api/download 同源代理（跨域图床无 CORS，直连会被拦/跳转）
  function download() {
    if (!img) return;
    const filename = `${name || "ip"}-${Date.now()}`.replace(/[\\/:*?"<>|]/g, "_");
    const href = `/api/download?url=${encodeURIComponent(img)}&name=${encodeURIComponent(filename)}`;
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("已开始下载到本地");
  }


  return (
    <div
      className={`lh-img ${grad}`}
      style={{ aspectRatio: ratioToAspect(ratioName), ...(img ? { cursor: "zoom-in" } : {}) }}
      onClick={() => img && setZoom(true)}
    >
      {img && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="lh-result-img"
          src={img}
          alt={name}
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="lh-emoji">{imgError ? "🖼️" : "🧸"}</span>
      )}
      {/* 右上角收藏按钮：hover 显示，点亮后可用「只看收藏」筛选 */}
      <button
        className={fav ? "lh-fav on" : "lh-fav"}
        title={fav ? "取消收藏" : "收藏"}
        onClick={(e) => {
          e.stopPropagation();
          handleToggleFav();
        }}
      >
        <Icon name="heart" size={15} />
      </button>
      {/* hover 遮罩：居中「编辑/下载」胶囊按钮（结构 1:1 对齐 logo / AI 字体卡片） */}
      <div className="lh-hover lh-hover-bottom">
        <button
          className="btn btn-ghost btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            if (!img) return;
            setDlOpen(true);
          }}
        >
          编辑/下载
        </button>
      </div>
      {/* 右下角功能图标行（hover 显示）：IP故事 / 延展设计 / 下载 / 另存为，样式同 logo 的 .lh-saveas */}
      <div className="lh-corner-acts">
        <button
          className="lh-saveas lh-tip"
          data-tip="IP故事"
          aria-label="IP故事"
          onClick={(e) => {
            e.stopPropagation();
            if (!img) return;
            setStory(true);
          }}
        >
          <Icon name="content" size={16} />
        </button>
        <button
          className="lh-saveas lh-tip"
          data-tip="延展设计"
          aria-label="延展设计"
          onClick={(e) => {
            e.stopPropagation();
            if (!img) return;
            onExtend({ img, name });
          }}
        >
          <Icon name="toolExpand" size={16} />
        </button>
        <button
          className="lh-saveas lh-tip"
          data-tip="下载"
          aria-label="下载"
          onClick={(e) => {
            e.stopPropagation();
            download();
          }}
        >
          <Icon name="download" size={16} />
        </button>
        <button
          className="lh-saveas lh-tip"
          data-tip="另存为我的素材"
          aria-label="另存为"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmSave(true);
          }}
        >
          <Icon name="share" size={16} />
        </button>
      </div>
      <span className="lh-mark">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lh-mark-logo" src={assetUrl("/brand-logo.png")} alt="魔方智绘" />
        由 AI 生成
      </span>
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
      {/* 点击图片放大预览：点遮罩或关闭按钮收起 */}
      {zoom && img && (
        <div className="img-zoom-mask" onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
          <button className="img-zoom-close" aria-label="关闭" onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
            <Icon name="close" size={22} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="img-zoom-img" src={img} alt={name} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
      {/* IP 故事弹窗：左图 + 右侧自动 IP 描述（据用户原始提示词/颜色/尺寸，不识别图片）+ 补充信息 + 生成故事 */}
      {story && (
        <IpStoryModal
          img={img}
          name={name}
          baseDesc={baseDesc}
          rawDesc={rawDesc}
          colors={colors}
          ratioName={ratioName}
          preDesc={preDesc}
          onClose={() => setStory(false)}
        />
      )}
      {/* 编辑/下载：IP 设计生成信息弹窗（生成信息 + 图片处理工具 + 去画布编辑 + 2K 高清下载） */}
      {dlOpen && (
        <IpDownloadModal
          img={img}
          name={name}
          desc={rawDesc || baseDesc}
          onClose={() => setDlOpen(false)}
        />
      )}
    </div>
  );
}
