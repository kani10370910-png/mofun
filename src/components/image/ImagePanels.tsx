"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { imageModels, imageRatios, editModels, logoStyles } from "@/data/image";
import type { ImageType } from "@/lib/types";
import { asset } from "@/lib/asset";

const modelOpts: DropdownOption[] = imageModels.map((m) => ({ name: m.name, desc: m.desc }));
const editOpts: DropdownOption[] = editModels.map((m) => ({ name: m.name, desc: m.desc }));
const ratioOpts: DropdownOption[] = imageRatios.map((r) => ({ name: r.name, sub: r.size, ico: "szSquare" }));

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
        <textarea
          value={state.input}
          onChange={(e) => set("input", e.target.value)}
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
            <textarea
              style={{ minHeight: 54 }}
              value={state.negative}
              onChange={(e) => set("negative", e.target.value)}
              placeholder="例如：低清、变形文字、多余文字、水印…"
            />
          </div>
        </div>
      </div>
      </div>
      <div className="ws-foot">
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={onGenerate}>
          <Icon name="sparkle" size={16} /> 生成图片
        </button>
        <p className="empty-note" style={{ textAlign: "center" }}>
          自动套用品牌资产中的 LOGO / 标准色 / 字体
        </p>
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
  model: string;
  count: number;
  uploaded: boolean;
  editInput: string;
  editModel: string;
}

export function ImageEventPanel({
  type,
  state,
  setState,
  onGenerate,
  loading,
}: {
  type: ImageType;
  state: EventImageState;
  setState: (s: EventImageState) => void;
  onGenerate: () => void;
  loading: boolean;
}) {
  const toast = useToast();
  const set = <K extends keyof EventImageState>(k: K, v: EventImageState[K]) => setState({ ...state, [k]: v });

  return (
    <>
      <div className="ws-scroll">
      <div className="ev-tabs">
        <span className={state.tab === "t2i" ? "ev-tab on" : "ev-tab"} onClick={() => set("tab", "t2i")}>
          文生图
        </span>
        <span className={state.tab === "i2i" ? "ev-tab on" : "ev-tab"} onClick={() => set("tab", "i2i")}>
          图生图
        </span>
      </div>

      {state.tab === "t2i" ? (
        <>
          <div className="field">
            <div className="ws-label">成图类型</div>
            <div className="preset-grid" id="iEventSub">
              <button
                className={state.sub === "自定义" ? "preset-chip on" : "preset-chip"}
                onClick={() => set("sub", "自定义")}
              >
                自定义
              </button>
              {type.sizes.map((s) => (
                <button
                  key={s.name}
                  className={state.sub === s.name ? "preset-chip on" : "preset-chip"}
                  onClick={() => set("sub", s.name)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <div className="ws-label">
              画面描述 <span className="req">*</span>
            </div>
            <textarea value={state.input} onChange={(e) => set("input", e.target.value)} placeholder="请输入画面描述：主体、风格、氛围、文案…" />
          </div>
          <div className="field">
            <div className="ws-label">图片比例</div>
            <Dropdown title="图片比例" options={ratioOpts} value={state.ratio} onChange={(o) => set("ratio", o.name)} showSub />
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
        </>
      ) : (
        <>
          <div className="field">
            <div className="ws-label-row">
              <div className="ws-label">
                参考图片 <span className="req">*</span>
              </div>
              <a className="ws-link" onClick={() => toast("从「我的素材」选图（演示）")}>
                我的素材
              </a>
            </div>
            <div
              className={`upload-box ${state.uploaded ? "filled thumb-grad-3" : ""}`}
              style={state.uploaded ? { minHeight: 120, display: "grid", placeItems: "center", fontSize: 40, color: "#fff" } : undefined}
              onClick={() => set("uploaded", !state.uploaded)}
            >
              {state.uploaded ? (
                "🖼️"
              ) : (
                <>
                  <span className="ub-ico">
                    <Icon name="image" size={26} />
                  </span>
                  <div className="ub-main">点击 / 拖拽上传图片</div>
                  <div className="ub-sub">支持 jpg / jpeg / png</div>
                </>
              )}
            </div>
          </div>
          <div className="field">
            <div className="ws-label">修改需求</div>
            <div className="ta-wrap">
              <textarea
                value={state.editInput}
                onChange={(e) => set("editInput", e.target.value)}
                placeholder="描述你想怎么改：替换背景、修改文字、调整色调…"
              />
              <button className="ta-clear" onClick={() => set("editInput", "")}>
                清空
              </button>
            </div>
          </div>
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
        <p className="empty-note" style={{ textAlign: "center" }}>
          自动套用品牌资产中的 LOGO / 标准色 / 字体
        </p>
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="ls-thumb-img" src={asset(s.img!)} alt={s.name} loading="lazy" />
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
        <div className="ta-wrap">
          <textarea
            value={state.input}
            onChange={(e) => set("input", e.target.value)}
            placeholder="示例：为「安吉白茶」设计图文插画风 LOGO，以高山云雾茶园与嫩芽为主体，国风清新、色彩明快，搭配品牌名中文字体（选填）"
          />
          {state.input.trim() && (
            <button className="ta-clear" onClick={() => set("input", "")}>
              清空
            </button>
          )}
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
