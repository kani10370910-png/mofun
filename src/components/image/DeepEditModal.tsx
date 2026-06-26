"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { displaySrc } from "@/lib/image";

/* 「深度编辑」：把一张海报变成分层可编辑的平面画布。
   两个阶段：
   - flow：三步进度动画（解析海报 → 海报图文分层 → 分层可编辑海报生成 / 刀版图生成中）
   - canvas：平面画布骨架页（顶栏 + 左图层 + 中画布 + 右属性面板）
   目前为流程 + 骨架（静态/演示），后续再接真实分层与各编辑工具。 */

const FLOW_STEPS = [
  { key: "parse", label: "解析海报" },
  { key: "layer", label: "海报图文分层：分层中…" },
  { key: "gen", label: "分层可编辑海报生成" },
];

// 右侧属性面板里的图片编辑工具（与活动编辑器 + 稿定参考一致）
const CANVAS_TOOLS = [
  "生成相似图", "细节修复", "AI变清晰", "AI抠图", "AI消除", "AI扩图",
  "图片裁剪", "透视矫正", "转矢量", "素材分层", "AI改图", "扇面变形",
];

// 图层类型 → 类型图标
type LayerKind = "image" | "text" | "rect";
interface Layer {
  id: string;
  kind: LayerKind;
  name: string;
  visible: boolean;
  locked: boolean;
}
const LAYER_ICO: Record<LayerKind, "image" | "content" | "outline"> = {
  image: "image",
  text: "content",
  rect: "outline",
};

// 分层后的演示图层（自上而下 = 画布最上层在列表最前）
const INIT_LAYERS: Layer[] = [
  { id: "l1", kind: "image", name: "图片", visible: true, locked: false },
  { id: "l2", kind: "image", name: "图片", visible: true, locked: false },
  { id: "l3", kind: "image", name: "图片", visible: true, locked: false },
  { id: "l4", kind: "image", name: "图片", visible: true, locked: false },
  { id: "l5", kind: "text", name: "愿你平安喜乐", visible: true, locked: false },
  { id: "l6", kind: "rect", name: "矩形", visible: true, locked: false },
  { id: "l7", kind: "rect", name: "矩形", visible: true, locked: false },
  { id: "l8", kind: "text", name: "MERRY CHRISTMAS", visible: true, locked: false },
  { id: "l9", kind: "text", name: "圣诞快乐", visible: true, locked: false },
  { id: "l10", kind: "rect", name: "矩形", visible: true, locked: false },
  { id: "l11", kind: "rect", name: "矩形", visible: true, locked: false },
  { id: "l12", kind: "image", name: "图片", visible: true, locked: false },
];

export function DeepEditModal({
  img,
  name,
  onClose,
}: {
  img?: string;
  name: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [panel, setPanel] = useState<null | "text" | "image" | "asset" | "gen">(null); // 顶栏下拉面板
  const togglePanel = (p: "text" | "image" | "asset" | "gen") => setPanel((cur) => (cur === p ? null : p));

  // —— 左侧图层面板 ——
  const [layersOpen, setLayersOpen] = useState(true); // 折叠（仅竖向 tab）/ 展开（图层列表）
  const [layers, setLayers] = useState<Layer[]>(INIT_LAYERS);
  const [activeLayer, setActiveLayer] = useState<string | null>(null); // 当前选中的图层
  const [menuLayer, setMenuLayer] = useState<string | null>(null); // 三个点菜单挂在哪条图层
  const [renaming, setRenaming] = useState<string | null>(null); // 正在重命名的图层

  const toggleVisible = (id: string) =>
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  const dupLayer = (id: string) =>
    setLayers((ls) => {
      const idx = ls.findIndex((l) => l.id === id);
      if (idx < 0) return ls;
      const src = ls[idx];
      const copy: Layer = { ...src, id: `${src.id}-c${ls.length}`, name: `${src.name} 副本` };
      const next = [...ls];
      next.splice(idx, 0, copy);
      return next;
    });
  const delLayer = (id: string) => setLayers((ls) => ls.filter((l) => l.id !== id));
  const moveTop = (id: string) =>
    setLayers((ls) => {
      const t = ls.find((l) => l.id === id);
      return t ? [t, ...ls.filter((l) => l.id !== id)] : ls;
    });
  const moveBottom = (id: string) =>
    setLayers((ls) => {
      const t = ls.find((l) => l.id === id);
      return t ? [...ls.filter((l) => l.id !== id), t] : ls;
    });
  const toggleLock = (id: string) =>
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)));
  const renameLayer = (id: string, name: string) =>
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, name: name || l.name } : l)));

  const [phase, setPhase] = useState<"flow" | "canvas">("flow");
  const [step, setStep] = useState(0); // 当前进行到第几步（0/1/2），完成后进 canvas
  const [knifeGen, setKnifeGen] = useState(false); // 第三步「刀版图生成中」满屏 loading
  const timers = useRef<number[]>([]);

  // 流程推进（演示节奏）：step0 → step1 → 第三步「刀版图生成中」 → 进入画布
  useEffect(() => {
    timers.current.push(window.setTimeout(() => setStep(1), 1400));
    timers.current.push(window.setTimeout(() => setStep(2), 3000));
    timers.current.push(window.setTimeout(() => setKnifeGen(true), 3200));
    timers.current.push(window.setTimeout(() => setPhase("canvas"), 5200));
    return () => timers.current.forEach((t) => window.clearTimeout(t));
  }, []);

  if (phase === "flow") {
    return (
      <div className="deepedit-mask" onClick={(e) => e.stopPropagation()}>
        <div className="deepedit-flow">
          <div className="deepedit-flow-head">
            <div className="deepedit-flow-title">生成分层可编辑海报</div>
            <div className="deepedit-flow-head-right">
              <button className="deepedit-abort" onClick={onClose}>终止任务</button>
              <button className="deepedit-x" onClick={onClose} aria-label="关闭"><Icon name="close" size={18} /></button>
            </div>
          </div>

          {knifeGen ? (
            <div className="deepedit-knife">
              <div className="deepedit-dots"><span /><span /><span /></div>
              <div className="deepedit-knife-text">刀版图生成中</div>
            </div>
          ) : (
            <div className="deepedit-flow-body">
              <div className="deepedit-flow-preview">
                {img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={displaySrc(img)} alt={name} />
                )}
                <div className="deepedit-scan" />
              </div>
              <ol className="deepedit-steps">
                {FLOW_STEPS.map((s, i) => (
                  <li key={s.key} className={`deepedit-step ${i < step ? "done" : i === step ? "doing" : ""}`}>
                    <span className="deepedit-step-ico">
                      {i < step ? <Icon name="check" size={14} /> : i === step ? <Icon name="refresh" size={14} className="ico-spin" /> : null}
                    </span>
                    <span className="deepedit-step-label">{s.label}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    );
  }

  // —— 平面画布骨架页 ——
  return (
    <div className="deepedit-mask deepedit-canvas-mask" onClick={(e) => e.stopPropagation()}>
      <div className="dcanvas">
        {/* 顶栏 */}
        <div className="dcanvas-head">
          <div className="dcanvas-head-title">平面画布</div>
          <div className="dcanvas-head-center">
            <button className={`dcanvas-head-btn ${panel === "text" ? "on" : ""}`} onClick={() => togglePanel("text")}><Icon name="content" size={16} /> 文字</button>
            <button className={`dcanvas-head-btn ${panel === "image" ? "on" : ""}`} onClick={() => togglePanel("image")}><Icon name="image" size={16} /> 图片</button>
            <button className={`dcanvas-head-btn ${panel === "asset" ? "on" : ""}`} onClick={() => togglePanel("asset")}><Icon name="storage" size={16} /> 素材</button>
            <button className={`dcanvas-head-btn ${panel === "gen" ? "on" : ""}`} onClick={() => togglePanel("gen")}><Icon name="sparkle" size={16} /> 生成</button>
          </div>
          <div className="dcanvas-head-right">
            <button className="btn btn-primary btn-sm" onClick={() => toast("已下载设计文件（演示）")}>下载设计文件</button>
            <button className="dcanvas-save" onClick={() => toast("已保存（演示）")}>保存</button>
            <button className="dcanvas-x" onClick={onClose} aria-label="关闭"><Icon name="close" size={20} /></button>
          </div>
        </div>

        {/* 顶栏下拉面板（文字 / 图片 / 素材 / 生成）：骨架样式，点选暂演示 */}
        {panel && (
          <div className="dcanvas-panel" onClick={(e) => e.stopPropagation()}>
            {panel === "text" && (
              <div className="dpanel-wrap">
                <div className="dpanel-tabs">
                  <button className="dpanel-tab on">字体</button>
                  <button className="dpanel-tab">文字模版</button>
                  <button className="dpanel-tab">AI字体</button>
                  <button className="dpanel-x" onClick={() => setPanel(null)}><Icon name="close" size={16} /></button>
                </div>
                <div className="dpanel-body">
                  <aside className="dpanel-cats">
                    {["黑体", "楷体", "书法体", "创意", "圆体", "宋体", "英文"].map((c, i) => (
                      <button key={c} className={i === 0 ? "dpanel-cat on" : "dpanel-cat"}>{c}</button>
                    ))}
                  </aside>
                  <div className="dpanel-fontlist">
                    {["思源黑体", "思源宋体 Bold", "站酷快乐体", "手写体", "圆润体", "标题黑", "潮酷创意体"].map((f) => (
                      <button key={f} className="dpanel-fontitem" onClick={() => toast(`已添加字体「${f}」（演示）`)}>{f}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {panel === "image" && (
              <div className="dpanel-wrap">
                <div className="dpanel-tabs">
                  <button className="dpanel-tab on">平台图片</button>
                  <button className="dpanel-tab">本地图片</button>
                  <label className="dpanel-favsw"><input type="checkbox" /><span className="lg-switch" />只显示收藏</label>
                  <button className="dpanel-x" onClick={() => setPanel(null)}><Icon name="close" size={16} /></button>
                </div>
                <div className="dpanel-subtabs">
                  {["智能体", "品牌设计", "AI工具", "AI改图"].map((s, i) => (
                    <button key={s} className={i === 0 ? "dpanel-subtab on" : "dpanel-subtab"}>{s}</button>
                  ))}
                </div>
                <div className="dpanel-grid">
                  {img && (
                    <button className="dpanel-cell" onClick={() => toast("已插入图片（演示）")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={displaySrc(img)} alt={name} />
                    </button>
                  )}
                </div>
              </div>
            )}
            {panel === "asset" && (
              <div className="dpanel-wrap">
                <div className="dpanel-tabs">
                  <button className="dpanel-tab on">图文模板</button>
                  <button className="dpanel-tab">元素</button>
                  <button className="dpanel-tab">唛头</button>
                  <button className="dpanel-x" onClick={() => setPanel(null)}><Icon name="close" size={16} /></button>
                </div>
                <div className="dpanel-body">
                  <aside className="dpanel-cats">
                    {["休闲零食", "美妆护肤", "宠物生活"].map((c, i) => (
                      <button key={c} className={i === 0 ? "dpanel-cat on" : "dpanel-cat"}>{c}</button>
                    ))}
                  </aside>
                  <div className="dpanel-iconsgrid">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <button key={i} className="dpanel-iconcell" onClick={() => toast("已插入素材（演示）")}>
                        <span>🏷️</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {panel === "gen" && (
              <div className="dpanel-wrap dpanel-gen">
                <div className="dpanel-gen-box">
                  <span className="dpanel-gen-load"><Icon name="refresh" size={15} className="ico-spin" /> 提示词提取中…</span>
                </div>
                <div className="dpanel-gen-foot">
                  {img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="dpanel-gen-ref" src={displaySrc(img)} alt={name} />
                  )}
                  <button className="dpanel-gen-change" onClick={() => toast("换一换（演示）")}>换一换</button>
                  <button className="dpanel-gen-go" onClick={() => toast("开始生成（演示）")}><Icon name="sparkle" size={15} /> 开始生成</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="dcanvas-body">
          {/* 左侧：图层（折叠=竖向 tab，可回拉展开；展开=图层列表，每条 hover 出三点菜单 + 眼睛） */}
          {layersOpen ? (
            <aside className="dcanvas-layers open" onClick={() => menuLayer && setMenuLayer(null)}>
              <div className="dcanvas-layers-head">
                <span className="dcanvas-layers-htitle"><Icon name="storage" size={16} /> 图层</span>
                <button className="dcanvas-layers-fold" aria-label="收起图层" onClick={() => setLayersOpen(false)}>
                  <Icon name="chevron" size={16} />
                </button>
              </div>
              <div className="dcanvas-layers-list">
                {layers.map((l) => (
                  <div
                    key={l.id}
                    className={`dlayer ${activeLayer === l.id ? "on" : ""} ${l.visible ? "" : "hidden"} ${l.locked ? "locked" : ""}`}
                    onClick={() => setActiveLayer(l.id)}
                  >
                    <span className="dlayer-ico"><Icon name={LAYER_ICO[l.kind]} size={15} /></span>
                    {renaming === l.id ? (
                      <input
                        className="dlayer-rename"
                        autoFocus
                        defaultValue={l.name}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => { renameLayer(l.id, e.target.value.trim()); setRenaming(null); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { renameLayer(l.id, (e.target as HTMLInputElement).value.trim()); setRenaming(null); }
                          if (e.key === "Escape") setRenaming(null);
                        }}
                      />
                    ) : (
                      <span className="dlayer-name">{l.name}</span>
                    )}
                    <span className="dlayer-acts">
                      <button
                        className="dlayer-act"
                        aria-label="更多"
                        onClick={(e) => { e.stopPropagation(); setMenuLayer((cur) => (cur === l.id ? null : l.id)); }}
                      >
                        <Icon name="dots" size={16} />
                      </button>
                      <button
                        className="dlayer-act"
                        aria-label={l.visible ? "隐藏图层" : "显示图层"}
                        onClick={(e) => { e.stopPropagation(); toggleVisible(l.id); }}
                      >
                        <Icon name={l.visible ? "eye" : "eyeOff"} size={16} />
                      </button>
                    </span>
                    {l.locked && <span className="dlayer-lockmark" aria-hidden><Icon name="lock" size={13} /></span>}

                    {/* 三点菜单 */}
                    {menuLayer === l.id && (
                      <div className="dlayer-menu" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { dupLayer(l.id); setMenuLayer(null); }}><Icon name="copy" size={15} /> 复制</button>
                        <button onClick={() => { delLayer(l.id); setMenuLayer(null); }}><Icon name="trash" size={15} /> 删除</button>
                        <button onClick={() => { moveTop(l.id); setMenuLayer(null); }}><Icon name="pinTop" size={15} /> 移到最前</button>
                        <button onClick={() => { moveBottom(l.id); setMenuLayer(null); }}><Icon name="pinBottom" size={15} /> 移到最后</button>
                        <button onClick={() => { setRenaming(l.id); setMenuLayer(null); }}><Icon name="content" size={15} /> 重命名图层</button>
                        <button onClick={() => { toggleVisible(l.id); setMenuLayer(null); }}>
                          <Icon name={l.visible ? "eyeOff" : "eye"} size={15} /> {l.visible ? "隐藏" : "显示"}
                        </button>
                        <button onClick={() => { toggleLock(l.id); setMenuLayer(null); }}>
                          <Icon name="lock" size={15} /> {l.locked ? "解锁" : "锁定"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </aside>
          ) : (
            <aside className="dcanvas-layers collapsed">
              <button className="dcanvas-layers-tab" onClick={() => setLayersOpen(true)} aria-label="展开图层">
                <Icon name="storage" size={18} /><span>图层</span>
              </button>
            </aside>
          )}

          {/* 中间：画布 */}
          <div className="dcanvas-stage">
            <div className="dcanvas-art">
              {img && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={displaySrc(img)} alt={name} />
              )}
              <div className="dcanvas-art-mask">素材分层中…</div>
            </div>
            <div className="dcanvas-zoombar">
              <button aria-label="后退"><Icon name="refresh" size={16} /></button>
              <span>100%</span>
            </div>
          </div>

          {/* 右侧：属性 + 图片编辑工具 */}
          <aside className="dcanvas-props">
            <div className="dcanvas-props-tabs">
              <button className="dcanvas-props-tab">画布</button>
              <button className="dcanvas-props-tab on">图片</button>
            </div>
            <div className="dcanvas-prop-group">
              <div className="dcanvas-prop-label">尺寸</div>
              <div className="dcanvas-size-row">
                <div className="dcanvas-size"><span>W</span><input defaultValue="226.4" /><em>px</em></div>
                <div className="dcanvas-size"><span>H</span><input defaultValue="400.9" /><em>px</em></div>
              </div>
            </div>
            <div className="dcanvas-prop-group">
              <div className="dcanvas-prop-label">填充</div>
              <div className="dcanvas-fill">
                <span className="dcanvas-fill-ico"><Icon name="image" size={16} /> 图片</span>
                <button className="dcanvas-fill-reset" aria-label="重置"><Icon name="refresh" size={14} /></button>
                <span className="dcanvas-fill-val">100</span>
              </div>
            </div>
            <div className="dcanvas-prop-group">
              <div className="dcanvas-prop-label">蒙版</div>
              <button className="dcanvas-mask-btn"><Icon name="plus" size={14} /> 添加蒙版</button>
            </div>
            <div className="dcanvas-prop-group">
              <div className="dcanvas-prop-label">旋转</div>
              <div className="dcanvas-rotate">
                <input type="range" className="slider" min={0} max={360} defaultValue={0} />
                <span className="dcanvas-rotate-val">0°</span>
              </div>
            </div>
            <div className="dcanvas-prop-group">
              <div className="dcanvas-prop-label">图片编辑</div>
              <div className="dcanvas-tools">
                {CANVAS_TOOLS.map((t) => (
                  <button key={t} className="dcanvas-tool" onClick={() => toast(`${t}（演示）`)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
