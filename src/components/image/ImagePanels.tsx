"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { imageModels, imageRatios, posterRatios, rollupRatios, flyerRatios, editModels, editPresets, logoStyles, paintStyles } from "@/data/image";
import type { SizePreset } from "@/lib/types";
import type { ImageType } from "@/lib/types";
import { asset } from "@/lib/asset";
import { AutoBgImg } from "./AutoBgImg";
import { ClearableTextarea } from "@/components/ui/ClearableTextarea";
import { useGenerateStream } from "@/lib/useGenerateStream";

const modelOpts: DropdownOption[] = imageModels.map((m) => ({ name: m.name, desc: m.desc }));
const editOpts: DropdownOption[] = editModels.map((m) => ({ name: m.name, desc: m.desc }));

// SizePreset[] → DropdownOption[]（保留各自形状图标；name=="自定义" 标记 custom）
const toRatioOpts = (list: SizePreset[]): DropdownOption[] =>
  list.map((r) => ({ name: r.name, sub: r.size, ico: (r.ico as DropdownOption["ico"]) ?? "szSquare", custom: r.name === "自定义" }));

// 活动通用比例组：最前面加「自定义」（数据层 imageRatios 不动，避免影响 IP 等其它用处）
const ratioOpts: DropdownOption[] = [
  { name: "自定义", sub: "自定义宽高", ico: "szSquare", custom: true },
  ...toRatioOpts(imageRatios),
];
const posterOpts: DropdownOption[] = toRatioOpts(posterRatios);
const rollupOpts: DropdownOption[] = toRatioOpts(rollupRatios);
const flyerOpts: DropdownOption[] = toRatioOpts(flyerRatios);

// 按「成图类型」选用对应的尺寸下拉组（海报/易拉宝/宣传单各有专用尺寸，其余用通用比例）
export function ratioOptsForSub(sub: string): DropdownOption[] {
  if (sub === "海报") return posterOpts;
  if (sub === "易拉宝") return rollupOpts;
  if (sub === "宣传单") return flyerOpts;
  return ratioOpts;
}

/* ---------------- 通用图片表单（商拍/IP/AI字体/店招） ---------------- */
export interface DefaultImageState {
  model: string;
  input: string;
  refStrength: number;
  size: string;
  count: number;
  detail: number;
  negative: string;
  advOpen: boolean;
}

export function ImageDefaultPanel({
  type,
  state,
  setState,
  onGenerate,
  loading,
}: {
  type: ImageType;
  state: DefaultImageState;
  setState: (s: DefaultImageState) => void;
  onGenerate: () => void;
  loading: boolean;
}) {
  const set = <K extends keyof DefaultImageState>(k: K, v: DefaultImageState[K]) => setState({ ...state, [k]: v });
  const sizeOpts: DropdownOption[] = type.sizes.map((s) => ({ name: s.name, sub: s.size, ico: s.ico as DropdownOption["ico"] }));

  return (
    <>
      <div className="ws-scroll">
      <div className="field">
        <div className="ws-label">生图模型</div>
        <Dropdown title="模型选择" triggerIcon="storage" options={modelOpts} value={state.model} onChange={(o) => set("model", o.name)} />
      </div>
      <div className="field">
        <div className="ws-label">
          画面描述 <span className="req">*</span>
        </div>
        <ClearableTextarea
          value={state.input}
          onChange={(e) => set("input", e.target.value)}
          onClear={() => set("input", "")}
          placeholder="描述你想要的画面：主体、风格、氛围、文案…"
        />
      </div>
      <div className="field">
        <div className="ws-label">参考图（可选，用于照片做图 / 风格参考）</div>
        <div className="ref-grid">
          <div className="ref-slot">
            <span className="rs-ico">
              <Icon name="plus" size={18} />
            </span>
            上传参考图
          </div>
        </div>
        <div className="label-val" style={{ marginTop: 14 }}>
          <span className="lv-name">参考强度</span>
          <span className="lv-val">{state.refStrength}%</span>
        </div>
        <input
          type="range"
          className="slider"
          min={0}
          max={100}
          value={state.refStrength}
          onChange={(e) => set("refStrength", Number(e.target.value))}
        />
        <div className="field-hint">越高越贴近参考图，越低越自由发挥</div>
      </div>
      <div className="field">
        <div className="ws-label">
          图片尺寸 <span className="ratio-tip">（已按「{type.name}」推荐）</span>
        </div>
        <Dropdown title="尺寸选择" options={sizeOpts} value={state.size} onChange={(o) => set("size", o.name)} showSub />
      </div>
      <div className="field">
        <div className="ws-label">生成数量</div>
        <div className="seg">
          {[1, 2, 4].map((n) => (
            <div key={n} className={state.count === n ? "seg-item on" : "seg-item"} onClick={() => set("count", n)}>
              {n}
            </div>
          ))}
        </div>
      </div>
      <div className={`adv ${state.advOpen ? "open" : ""}`}>
        <div className="adv-head" onClick={() => set("advOpen", !state.advOpen)}>
          <span className="adv-title">
            <Icon name="gear" size={16} /> 高级设置
          </span>
          <span className="adv-arrow">›</span>
        </div>
        <div className="adv-body">
          <div className="field">
            <div className="label-val">
              <span className="lv-name">精细度</span>
              <span className="lv-val">{state.detail}</span>
            </div>
            <input
              type="range"
              className="slider"
              min={1}
              max={10}
              value={state.detail}
              onChange={(e) => set("detail", Number(e.target.value))}
            />
            <div className="field-hint">7-8 在质量与速度间较平衡</div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <div className="ws-label">负向提示词（不希望出现的元素）</div>
            <ClearableTextarea
              style={{ minHeight: 54 }}
              value={state.negative}
              onChange={(e) => set("negative", e.target.value)}
              onClear={() => set("negative", "")}
              placeholder="例如：低清、变形文字、多余文字、水印…"
            />
          </div>
        </div>
      </div>
      </div>
      <div className="ws-foot">
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={onGenerate}>
          <Icon name="sparkle" size={16} /> 立即生成
        </button>
      </div>
    </>
  );
}

/* ---------------- 活动表单（文生图 / 图生图 双 Tab） ---------------- */
export interface EventImageState {
  tab: "t2i" | "i2i";
  sub: string; // 成图子类型（海报/长图/…）
  input: string;
  ratio: string;
  customW: string; // 「自定义」尺寸宽（px）
  customH: string; // 「自定义」尺寸高（px）
  model: string;
  count: number;
  style: string; // 画面风格名（「智能匹配」= 不拼风格词）
  uploaded: boolean;
  refImg: string; // 图生图参考图（上传或从仓库选的图 URL / data URL）
  refName: string; // 参考图名称（来自仓库时显示）
  editInput: string;
  editPreset: string; // 当前选中的图片处理预设名（单选）
  presetMore: boolean; // 「更多预设选项」是否展开
  refStrength: number; // 「生成相似图」参考强度（0=弱 / 50=中 / 100=强）
  editModel: string;
  fromCase?: boolean; // 描述来自「套用参考灵感」：立即生成时跳过 t2i 系统提示词二次扩写，直接出图
}

export function ImageEventPanel({
  type,
  state,
  setState,
  onGenerate,
  loading,
  onOpenImg2Text,
  onOpenStyle,
  onOpenLibrary,
}: {
  type: ImageType;
  state: EventImageState;
  setState: (s: EventImageState) => void;
  onGenerate: () => void;
  loading: boolean;
  onOpenImg2Text?: () => void; // 点「图转文」：通知父级在右侧结果区展示图转文面板
  onOpenStyle?: () => void; // 点「画面风格」：通知父级在右侧结果区展示风格选择面板
  onOpenLibrary?: () => void; // 点「仓库」：通知父级打开仓库选图弹窗
}) {
  const toast = useToast();
  const set = <K extends keyof EventImageState>(k: K, v: EventImageState[K]) => setState({ ...state, [k]: v });

  // 文生图·描述词辅助：联想（LLM 扩写，流式回填）+ 图转文（右侧面板，调视觉模型反推）
  const { generate, state: assocState } = useGenerateStream();
  const assocBusy = assocState.loading;
  const refFileRef = useRef<HTMLInputElement>(null); // 图生图参考图本地上传

  // 点图片处理预设：单选切换。选中则把对应提示词填入「修改需求」；
  // 「不使用预设」或再次点已选项 → 取消选中并清空修改需求。
  function pickEditPreset(name: string) {
    const isCancel = name === "不使用预设" || state.editPreset === name;
    if (isCancel) {
      setState({ ...state, editPreset: name === "不使用预设" ? "不使用预设" : "", editInput: "" });
      return;
    }
    const preset = editPresets.find((p) => p.name === name);
    setState({ ...state, editPreset: name, editInput: preset?.prompt ?? "" });
  }

  // 把联想结果收敛到约 300 字：模型常超量（500+字）。在 target 附近找一个标点收尾、不切半句：
  // 先在较宽窗口里挑离 300 最近的句末标点；没有就挑最近的逗号/顿号；都没有才硬切到 target。
  function clampAssoc(text: string, target = 300, hardMax = 400): string {
    const t = text.trim();
    if (t.length <= hardMax) return t;
    // 收集 [lo, hi] 内所有匹配位置（标点之后的下标），返回离 target 最近的一个，找不到返回 -1
    const nearest = (re: RegExp, lo: number, hi: number): number => {
      let best = -1, bestD = Infinity, m: RegExpExecArray | null;
      const g = new RegExp(re.source, "g");
      while ((m = g.exec(t))) {
        const idx = m.index + 1;
        if (idx > hi) break;
        if (idx < lo) continue;
        const d = Math.abs(idx - target);
        if (d < bestD) { bestD = d; best = idx; }
      }
      return best;
    };
    const enderCut = nearest(/[。！？…；!?;]/, target - 80, target + 80); // [220,380] 找句末
    const commaCut = enderCut > 0 ? enderCut : nearest(/[，、,]/, target - 60, target + 60); // 退而求逗号
    const cut = commaCut > 0 ? commaCut : target;
    return t.slice(0, cut).replace(/[，、,]$/, "").trim();
  }

  async function onAssociate() {
    if (assocBusy) return;
    // 把当前画面描述扩写得更丰富，流式实时回填到输入框
    const result = await generate({ scene: "t2i-associate", input: state.input.trim() }, (full) => {
      setState({ ...state, input: full });
    });
    if (result.trim()) {
      // 模型常超出 300 字，落定时收敛到约 300 字（句末收尾，不切半句）；
      // 联想结果已是扩写成品 → 标记 fromCase，立即生成时不再二次扩写
      setState({ ...state, input: clampAssoc(result), fromCase: true });
      toast("已联想扩写画面描述");
    }
  }

  return (
    <>
      <div className="ws-scroll">
      {/* 固定在顶部：文生图/图生图 tab + 成图类型（仅文生图），其余内容向下滚动 */}
      <div className="ev-sticky-top">
        <div className="ev-tabs">
          <span className={state.tab === "t2i" ? "ev-tab on" : "ev-tab"} onClick={() => set("tab", "t2i")}>
            文生图
          </span>
          <span className={state.tab === "i2i" ? "ev-tab on" : "ev-tab"} onClick={() => set("tab", "i2i")}>
            图生图
          </span>
        </div>
        {state.tab === "t2i" && (
          <div className="field">
            <div className="ws-label">成图类型</div>
            <div className="preset-grid" id="iEventSub">
              <button
                className={state.sub === "自定义" ? "preset-chip on" : "preset-chip"}
                onClick={() => setState({ ...state, sub: "自定义", fromCase: false })}
              >
                自定义
              </button>
              {type.sizes.map((s) => (
                <button
                  key={s.name}
                  className={state.sub === s.name ? "preset-chip on" : "preset-chip"}
                  onClick={() => {
                    // 切成图类型时，同步把「图片尺寸」重置为该类型尺寸组里第一个实际尺寸；
                    // 用户主动切类型 → 不再视作「套用灵感原样张」，清除 fromCase（恢复扩写）
                    const opts = ratioOptsForSub(s.name);
                    const firstReal = opts.find((o) => o.name !== "自定义") ?? opts[0];
                    setState({ ...state, sub: s.name, ratio: firstReal?.name ?? state.ratio, fromCase: false });
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {state.tab === "t2i" ? (
        <>
          <div className="field">
            <div className="ws-label">
              画面描述 <span className="req">*</span>
            </div>
            <ClearableTextarea
              value={state.input}
              // 用户手动编辑/清空描述 → 不再是「套用灵感原样张」，清除 fromCase（立即生成时恢复扩写）
              onChange={(e) => setState({ ...state, input: e.target.value, fromCase: false })}
              onClear={() => setState({ ...state, input: "", fromCase: false })}
              placeholder="请输入画面描述：主体、风格、氛围、文案…"
              toolbar={
                <>
                  <button type="button" className="ta-tool" disabled={assocBusy} onClick={onAssociate}>
                    {assocBusy ? (
                      <><Icon name="refresh" size={14} className="ico-spin" /> 联想中…</>
                    ) : (
                      <><Icon name="sparkle" size={14} /> 联想</>
                    )}
                  </button>
                  <button type="button" className="ta-tool" onClick={() => onOpenImg2Text?.()}>
                    <Icon name="image" size={14} /> 图转文
                  </button>
                </>
              }
            />
          </div>
          <div className="field">
            <div className="ws-label">图片尺寸</div>
            <Dropdown
              title="图片尺寸"
              options={ratioOptsForSub(state.sub)}
              value={state.ratio}
              onChange={(o) => set("ratio", o.name)}
              showSub
            />
            {state.ratio === "自定义" && (
              <div className="custom-size">
                <input
                  type="number"
                  className="cs-input"
                  min={64}
                  placeholder="宽"
                  value={state.customW}
                  onChange={(e) => set("customW", e.target.value)}
                />
                <span className="cs-unit">px</span>
                <span className="cs-colon">:</span>
                <input
                  type="number"
                  className="cs-input"
                  min={64}
                  placeholder="高"
                  value={state.customH}
                  onChange={(e) => set("customH", e.target.value)}
                />
                <span className="cs-unit">px</span>
              </div>
            )}
          </div>
          <div className="field">
            <div className="ws-label">生图模型</div>
            <Dropdown title="模型选择" triggerIcon="storage" options={modelOpts} value={state.model} onChange={(o) => set("model", o.name)} />
          </div>
          <div className="field">
            <div className="ws-label">生成数量</div>
            <div className="seg">
              {[1, 2, 4].map((n) => (
                <div key={n} className={state.count === n ? "seg-item on" : "seg-item"} onClick={() => set("count", n)}>
                  {n}
                </div>
              ))}
            </div>
          </div>
          <div className="field">
            <div className="ws-label">画面风格</div>
            {(() => {
              const cur = paintStyles.find((s) => s.name === state.style) ?? paintStyles[0];
              return (
                <button type="button" className="style-card" onClick={() => onOpenStyle?.()}>
                  <span className={`sc-ico ${cur.grad}`}>{cur.emoji}</span>
                  <span className="sc-text">
                    <span className="sc-name">{cur.name}</span>
                    <span className="sc-sub">点击更换风格</span>
                  </span>
                  <span className="sc-arrow">
                    <Icon name="chevron" size={16} />
                  </span>
                </button>
              );
            })()}
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <div className="ws-label-row">
              <div className="ws-label">
                参考图片 <span className="req">*</span>
              </div>
              <a className="ws-link" onClick={() => onOpenLibrary?.()}>
                仓库
              </a>
            </div>
            <input
              ref={refFileRef}
              type="file"
              accept="image/jpeg,image/png"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  const url = URL.createObjectURL(f);
                  setState({ ...state, refImg: url, refName: f.name, uploaded: true });
                }
                e.target.value = "";
              }}
            />
            <div
              className={`upload-box ${state.refImg ? "filled" : ""}`}
              style={state.refImg ? { minHeight: 120, padding: 0, overflow: "hidden", position: "relative" } : undefined}
              onClick={() => refFileRef.current?.click()}
            >
              {state.refImg ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={state.refImg}
                    alt={state.refName || "参考图"}
                    style={{ width: "100%", height: 160, objectFit: "contain", display: "block", background: "#f3f4f6" }}
                  />
                  <button
                    type="button"
                    className="upload-clear"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (state.refImg.startsWith("blob:")) URL.revokeObjectURL(state.refImg);
                      setState({ ...state, refImg: "", refName: "", uploaded: false });
                    }}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </>
              ) : (
                <>
                  <span className="ub-ico">
                    <Icon name="image" size={26} />
                  </span>
                  <div className="ub-main">点击 / 拖拽上传图片</div>
                  <div className="ub-sub">支持 jpg / jpeg / png，或从「仓库」选图</div>
                </>
              )}
            </div>
          </div>
          <div className="field">
            <div className="ws-label">修改需求</div>
            <ClearableTextarea
              value={state.editInput}
              onChange={(e) => set("editInput", e.target.value)}
              onClear={() => set("editInput", "")}
              placeholder="描述你想怎么改：替换背景、修改文字、调整色调…"
            />
          </div>
          <div className="field">
            <div className="ws-label">图片处理预设</div>
            <div className="preset-grid">
              {editPresets.slice(0, 6).map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={state.editPreset === p.name ? "preset-chip on" : "preset-chip"}
                  onClick={() => pickEditPreset(p.name)}
                >
                  {p.name}
                </button>
              ))}
              {state.presetMore && (
                <div className="preset-more">
                  {editPresets.slice(6).map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      className={state.editPreset === p.name ? "preset-chip on" : "preset-chip"}
                      onClick={() => pickEditPreset(p.name)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className={`preset-toggle ${state.presetMore ? "open" : ""}`}
              onClick={() => set("presetMore", !state.presetMore)}
            >
              <span className="pt-arrow"><Icon name="chevron" size={14} /></span>
              <span className="pt-text">{state.presetMore ? "收起" : "更多预设选项"}</span>
            </button>
          </div>
          {state.editPreset === "生成相似图" && (
            <div className="field">
              <div className="ws-label">参考强度</div>
              <input
                type="range"
                className="slider"
                min={0}
                max={100}
                step={50}
                value={state.refStrength}
                onChange={(e) => set("refStrength", Number(e.target.value))}
              />
              <div className="range-marks">
                <span>弱</span>
                <span>中</span>
                <span>强</span>
              </div>
            </div>
          )}
          <div className="field">
            <div className="ws-label">编辑模型</div>
            <Dropdown title="编辑模型" triggerIcon="storage" options={editOpts} value={state.editModel} onChange={(o) => set("editModel", o.name)} />
          </div>
        </>
      )}

      </div>
      <div className="ws-foot">
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={onGenerate}>
          <Icon name="sparkle" size={16} /> 立即生成
        </button>
      </div>
    </>
  );
}

/* ---------------- logo 表单（风格卡片网格） ---------------- */
export interface LogoImageState {
  style: string;
  brand: string;
  input: string;
}

export function ImageLogoPanel({
  state,
  setState,
  onGenerate,
  loading,
}: {
  state: LogoImageState;
  setState: (s: LogoImageState) => void;
  onGenerate: () => void;
  loading: boolean;
}) {
  const set = <K extends keyof LogoImageState>(k: K, v: LogoImageState[K]) => setState({ ...state, [k]: v });

  return (
    <>
      <div className="ws-scroll">
      <div className="field">
        <div className="ws-label">logo 风格</div>
        <div className="logo-style-grid">
          {logoStyles.map((s) => (
            <div key={s.key} className={state.style === s.name ? "logo-style on" : "logo-style"} onClick={() => set("style", s.name)}>
              <div className="ls-thumb">
                {s.img ? (
                  <AutoBgImg className="ls-thumb-img" src={asset(s.img!)} alt={s.name} ratio={1.45} />
                ) : (
                  s.emoji
                )}
              </div>
              <div className="ls-name">{s.name}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="field">
        <div className="ws-label">
          品牌名称 <span className="req">*</span>
        </div>
        <input type="text" value={state.brand} onChange={(e) => set("brand", e.target.value)} placeholder="必填项，例如：安吉白茶" />
      </div>
      <div className="field">
        <div className="ws-label">
          创意描述 <span className="opt">（选填）</span>
        </div>
        <ClearableTextarea
          value={state.input}
          onChange={(e) => set("input", e.target.value)}
          onClear={() => set("input", "")}
          placeholder="示例：为「安吉白茶」设计图文插画风 LOGO，以高山云雾茶园与嫩芽为主体，国风清新、色彩明快，搭配品牌名中文字体（选填）"
        />
      </div>
      </div>
      <div className="ws-foot">
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={onGenerate}>
          <Icon name="sparkle" size={16} /> 立即生成
        </button>
      </div>
    </>
  );
}
