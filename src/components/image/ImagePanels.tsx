"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { ColorPicker } from "./ColorPicker";
import { useToast } from "@/components/ui/Toast";
import { imageRatios, ipExtendTabs, ipExtendPresets, ipExtendPlaceholder, ipPresetPrompts, imageModels, editModels, logoStyles, type IpExtendTab } from "@/data/image";
import type { ImageType } from "@/lib/types";

/* ---------- 类型定义 ---------- */
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

export interface EventImageState {
  tab: "t2i" | "i2i";
  sub: string;
  input: string;
  ratio: string;
  model: string;
  count: number;
  uploaded: boolean;
  editInput: string;
  editModel: string;
}

export interface LogoImageState {
  style: string;
  brand: string;
  input: string;
}

/* ---------- 默认图片面板 ---------- */
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
  const modelOpts: DropdownOption[] = imageModels.map((m) => ({ name: m.name, desc: m.desc }));
  const sizeOpts: DropdownOption[] = type.sizes.map((s) => ({ name: s.name, sub: s.size, ico: s.ico as DropdownOption["ico"] }));

  return (
    <>
      <div className="ws-scroll">
        <div className="field">
          <div className="ws-label">生图模型</div>
          <Dropdown title="生图模型" options={modelOpts} value={state.model} onChange={(o) => setState({ ...state, model: o.name })} />
        </div>

        <div className="field">
          <div className="ws-label">画面描述</div>
          <textarea
            className="ip-desc"
            value={state.input}
            onChange={(e) => setState({ ...state, input: e.target.value })}
            placeholder="请输入画面描述"
          />
        </div>

        <div className="field">
          <div className="ws-label">参考强度</div>
          <div className="slider-row">
            <input
              type="range"
              min={0}
              max={100}
              value={state.refStrength}
              onChange={(e) => setState({ ...state, refStrength: Number(e.target.value) })}
            />
            <span className="slider-val">{state.refStrength}%</span>
          </div>
        </div>

        <div className="field">
          <div className="ws-label">画面尺寸</div>
          <Dropdown title="画面尺寸" options={sizeOpts} value={state.size} onChange={(o) => setState({ ...state, size: o.name })} />
        </div>

        <div className="field">
          <div className="ws-label">生成数量</div>
          <div className="slider-row">
            <input
              type="range"
              min={1}
              max={8}
              value={state.count}
              onChange={(e) => setState({ ...state, count: Number(e.target.value) })}
            />
            <span className="slider-val">{state.count}</span>
          </div>
        </div>

        <div className="field">
          <div className="ws-label">细节程度</div>
          <div className="slider-row">
            <input
              type="range"
              min={1}
              max={10}
              value={state.detail}
              onChange={(e) => setState({ ...state, detail: Number(e.target.value) })}
            />
            <span className="slider-val">{state.detail}</span>
          </div>
        </div>

        {state.advOpen && (
          <div className="field">
            <div className="ws-label">负面提示</div>
            <textarea
              value={state.negative}
              onChange={(e) => setState({ ...state, negative: e.target.value })}
              placeholder="不想出现的内容"
            />
          </div>
        )}
      </div>
      <div className="ws-foot">
        <button className="btn btn-block adv-toggle" onClick={() => setState({ ...state, advOpen: !state.advOpen })}>
          {state.advOpen ? "收起高级选项" : "高级选项"}
        </button>
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={onGenerate}>
          立即生成 <span className="btn-credit">80算力</span>
        </button>
      </div>
    </>
  );
}

/* ---------- 活动图片面板 ---------- */
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
  const ratioOptsEvent: DropdownOption[] = imageRatios.map((r) => ({ name: r.name, sub: r.size, ico: r.ico as DropdownOption["ico"] }));
  const modelOpts: DropdownOption[] = imageModels.map((m) => ({ name: m.name, desc: m.desc }));
  const editModelOpts: DropdownOption[] = editModels.map((m) => ({ name: m.name, desc: m.desc }));

  return (
    <>
      <div className="ws-scroll">
        <div className="ev-tabs">
          {type.sizes.map((s) => (
            <span
              key={s.name}
              className={state.sub === s.name ? "ev-tab on" : "ev-tab"}
              onClick={() => setState({ ...state, sub: s.name })}
            >
              {s.name}
            </span>
          ))}
        </div>

        {state.sub === "自定义" ? (
          <>
            <div className="ev-sub-tabs">
              <span className={state.tab === "t2i" ? "ev-sub-tab on" : "ev-sub-tab"} onClick={() => setState({ ...state, tab: "t2i" })}>
                文生图
              </span>
              <span className={state.tab === "i2i" ? "ev-sub-tab on" : "ev-sub-tab"} onClick={() => setState({ ...state, tab: "i2i" })}>
                图生图
              </span>
            </div>

            {state.tab === "t2i" ? (
              <>
                <div className="field">
                  <div className="ws-label">画面描述</div>
                  <textarea
                    className="ip-desc"
                    value={state.input}
                    onChange={(e) => setState({ ...state, input: e.target.value })}
                    placeholder="请输入画面描述"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <div className="ws-label-row">
                    <div className="ws-label">上传参考图</div>
                    <a className="ws-link" onClick={() => toast("从历史图库选择（演示）")}>
                      历史图库
                    </a>
                  </div>
                  <div
                    className={`upload-box ${state.uploaded ? "filled thumb-grad-4" : ""}`}
                    style={state.uploaded ? { minHeight: 140, display: "grid", placeItems: "center", fontSize: 44, color: "#fff" } : { minHeight: 140 }}
                    onClick={() => setState({ ...state, uploaded: !state.uploaded })}
                  >
                    {state.uploaded ? "🖼️" : (
                      <>
                        <span className="ub-ico"><Icon name="plus" size={28} /></span>
                        <div className="ub-main">上传参考图</div>
                      </>
                    )}
                  </div>
                </div>
                <div className="field">
                  <div className="ws-label">编辑描述</div>
                  <textarea
                    value={state.editInput}
                    onChange={(e) => setState({ ...state, editInput: e.target.value })}
                    placeholder="描述你想要的修改"
                  />
                </div>
              </>
            )}

            <div className="field">
              <div className="ws-label">画面比例</div>
              <Dropdown title="画面比例" options={ratioOptsEvent} value={state.ratio} onChange={(o) => setState({ ...state, ratio: o.name })} />
            </div>

            <div className="field">
              <div className="ws-label">生图模型</div>
              <Dropdown title="生图模型" options={modelOpts} value={state.model} onChange={(o) => setState({ ...state, model: o.name })} />
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <div className="ws-label">画面描述</div>
              <textarea
                className="ip-desc"
                value={state.input}
                onChange={(e) => setState({ ...state, input: e.target.value })}
                placeholder="请输入画面描述"
              />
            </div>
            <div className="field">
              <div className="ws-label">生图模型</div>
              <Dropdown title="生图模型" options={modelOpts} value={state.model} onChange={(o) => setState({ ...state, model: o.name })} />
            </div>
          </>
        )}

        <div className="field">
          <div className="ws-label">生成数量</div>
          <div className="slider-row">
            <input
              type="range"
              min={1}
              max={8}
              value={state.count}
              onChange={(e) => setState({ ...state, count: Number(e.target.value) })}
            />
            <span className="slider-val">{state.count}</span>
          </div>
        </div>

        {state.sub === "自定义" && state.tab === "i2i" && (
          <div className="field">
            <div className="ws-label">编辑模型</div>
            <Dropdown title="编辑模型" options={editModelOpts} value={state.editModel} onChange={(o) => setState({ ...state, editModel: o.name })} />
          </div>
        )}
      </div>
      <div className="ws-foot">
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={onGenerate}>
          立即生成 <span className="btn-credit">80算力</span>
        </button>
      </div>
    </>
  );
}

/* ---------- Logo 图片面板 ---------- */
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
  const styleOpts: DropdownOption[] = logoStyles.map((s) => ({ name: s.name, desc: "" }));

  return (
    <>
      <div className="ws-scroll">
        <div className="field">
          <div className="ws-label">LOGO风格</div>
          <Dropdown title="LOGO风格" options={styleOpts} value={state.style} onChange={(o) => setState({ ...state, style: o.name })} />
        </div>

        <div className="field">
          <div className="ws-label">品牌名称</div>
          <input
            className="ip-desc"
            style={{ height: 44, lineHeight: "44px", resize: "none" }}
            value={state.brand}
            onChange={(e) => setState({ ...state, brand: e.target.value })}
            placeholder="请输入品牌名称"
          />
        </div>

        <div className="field">
          <div className="ws-label">创意描述</div>
          <textarea
            className="ip-desc"
            value={state.input}
            onChange={(e) => setState({ ...state, input: e.target.value })}
            placeholder="描述你想要的 LOGO 风格或创意"
          />
        </div>
      </div>
      <div className="ws-foot">
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={onGenerate}>
          立即生成 <span className="btn-credit">80算力</span>
        </button>
      </div>
    </>
  );
}

// IP 设计的画面尺寸只显示比例名称，不显示「1080 × 1080 px」
const ratioOpts: DropdownOption[] = imageRatios.map((r) => ({ name: r.name, ico: "szSquare" }));

/* IP 设计专属表单：IP创新设计 / IP扩展设计 双 Tab */
export function ImageIpPanel({ onGenerate, loading }: { onGenerate: () => void; loading: boolean }) {
  const toast = useToast();
  const [tab, setTab] = useState<"create" | "extend">("create");

  return (
    <>
      <div className="ev-tabs">
        <span className={tab === "create" ? "ev-tab on" : "ev-tab"} onClick={() => setTab("create")}>
          IP创新设计
        </span>
        <span className={tab === "extend" ? "ev-tab on" : "ev-tab"} onClick={() => setTab("extend")}>
          IP扩展设计
        </span>
      </div>
      {tab === "create" ? <IpCreate onGenerate={onGenerate} loading={loading} /> : <IpExtend onGenerate={onGenerate} loading={loading} toast={toast} />}
    </>
  );
}

/* ---------------- IP 创新设计 ---------------- */
function IpCreate({ onGenerate, loading }: { onGenerate: () => void; loading: boolean }) {
  const toast = useToast();
  const [desc, setDesc] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [ratio, setRatio] = useState(imageRatios[0].name);
  const [uploaded, setUploaded] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [current, setCurrent] = useState("#000000");
  const colorBoxRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef(current);
  currentRef.current = current;

  // 收起取色器：把当前色加入色块列表
  function closePicker() {
    setColors((prev) => [...prev, currentRef.current]);
    setPicking(false);
  }

  function togglePicker() {
    if (picking) closePicker();
    else setPicking(true);
  }

  // 取色器展开时，点击其外部 = 选中当前色并收起
  useEffect(() => {
    if (!picking) return;
    const onDown = (e: MouseEvent) => {
      if (colorBoxRef.current && !colorBoxRef.current.contains(e.target as Node)) {
        closePicker();
      }
    };
    // 延后挂载，避免点「+」打开的同一次事件立即触发关闭
    const t = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picking]);

  return (
    <>
      <div className="ws-scroll">
      <div className="field">
        <div className="ws-label">创意描述</div>
        <div className="ip-desc-wrap">
          <textarea
            className="ip-desc"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="请输入画面描述"
          />
          <button className="ip-propose-btn" onClick={() => setProposeOpen(true)}>
            <Icon name="sparkle" size={14} /> 帮我提案
          </button>
        </div>
      </div>

      <div className="field ip-color-field" ref={colorBoxRef}>
        <div className="ws-label">偏好颜色</div>
        <div className="ip-colors">
          <button className="ip-color-add" onClick={togglePicker} title={picking ? "完成" : "添加颜色"}>
            <Icon name="plus" size={16} />
          </button>
          {/* 已添加的色块 */}
          {colors.map((c, i) => (
            <span
              key={i}
              className="ip-color-chip"
              style={{ background: c }}
              title={c}
              onClick={() => setColors((prev) => prev.filter((_, j) => j !== i))}
            >
              <span className="ip-color-x">×</span>
            </span>
          ))}
          {/* 取色中的当前色预览 */}
          {picking && <span className="ip-color-chip ip-color-current" style={{ background: current }} />}
        </div>
        {picking && <ColorPicker value={current} onChange={setCurrent} />}
      </div>

      <div className="field">
        <div className="ws-label">画面尺寸</div>
        <Dropdown title="画面尺寸" options={ratioOpts} value={ratio} onChange={(o) => setRatio(o.name)} />
      </div>

      <div className="field">
        <div className="ws-label">参考</div>
        <div
          className={`upload-box ${uploaded ? "filled thumb-grad-4" : ""}`}
          style={uploaded ? { minHeight: 120, display: "grid", placeItems: "center", fontSize: 40, color: "#fff" } : undefined}
          onClick={() => setUploaded((v) => !v)}
        >
          {uploaded ? (
            "🖼️"
          ) : (
            <>
              <span className="ub-ico">
                <Icon name="plus" size={26} />
              </span>
              <div className="ub-main">上传参考，支持图片</div>
            </>
          )}
        </div>
      </div>

      </div>
      <div className="ws-foot">
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={onGenerate}>
          立即生成 <span className="btn-credit">80算力</span>
        </button>
      </div>

      {proposeOpen && (
        <ProposeModal
          onClose={() => setProposeOpen(false)}
          onGenerate={(text) => {
            if (text.trim()) setDesc(text.trim());
            setProposeOpen(false);
            toast("已生成创意提案并填入描述（演示）");
          }}
        />
      )}
    </>
  );
}

/* 「帮我提案」浮层 */
function ProposeModal({ onClose, onGenerate }: { onClose: () => void; onGenerate: (text: string) => void }) {
  const [text, setText] = useState("");
  const [uploaded, setUploaded] = useState(false);
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="propose-panel" onClick={(e) => e.stopPropagation()}>
        <div className="propose-head">
          <span className="propose-title">
            <Icon name="sparkle" size={16} /> 帮我提案
          </span>
          <button className="bf-close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>
        <textarea className="ip-desc" value={text} onChange={(e) => setText(e.target.value)} placeholder="请输入画面描述" />
        <div
          className={`upload-box ${uploaded ? "filled" : ""}`}
          style={{ marginTop: 12 }}
          onClick={() => setUploaded((v) => !v)}
        >
          <span className="ub-ico">
            <Icon name="plus" size={22} />
          </span>
          <div className="ub-main">{uploaded ? "已上传项目资料" : "上传项目资料，支持 PDF / TXT"}</div>
        </div>
        <button className="btn btn-block propose-go" onClick={() => onGenerate(text)}>
          开始生成
        </button>
      </div>
    </div>
  );
}

/* ---------------- IP 扩展设计 ---------------- */
function IpExtend({ onGenerate, loading, toast }: { onGenerate: () => void; loading: boolean; toast: (s: string) => void }) {
  const [uploaded, setUploaded] = useState(false);
  const [refUploaded, setRefUploaded] = useState(false);
  const [extTab, setExtTab] = useState<IpExtendTab>("视角");
  // 每个延展项各记一个选中预设
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [extDesc, setExtDesc] = useState("");

  const presets = ipExtendPresets[extTab];
  const curPick = picks[extTab] ?? presets[0];

  // 切换延展项：重置该项的选中与描述词
  function changeTab(t: IpExtendTab) {
    setExtTab(t);
    setExtDesc("");
  }

  // 点击预设：记录选中，并把对应提示词回填到描述词（无配置或「不使用预设」则清空）
  function pickPreset(p: string) {
    setPicks((prev) => ({ ...prev, [extTab]: p }));
    const prompt = ipPresetPrompts[extTab]?.[p] ?? "";
    setExtDesc(prompt);
  }

  return (
    <>
      <div className="ws-scroll">
      <div className="field">
        <div className="ws-label-row">
          <div className="ws-label">上传 IP 图</div>
          <a className="ws-link" onClick={() => toast("打开历史图库（演示）")}>
            历史图库
          </a>
        </div>
        <div
          className={`upload-box ${uploaded ? "filled thumb-grad-4" : ""}`}
          style={uploaded ? { minHeight: 140, display: "grid", placeItems: "center", fontSize: 44, color: "#fff" } : { minHeight: 140 }}
          onClick={() => setUploaded((v) => !v)}
        >
          {uploaded ? (
            "🧸"
          ) : (
            <>
              <span className="ub-ico">
                <Icon name="plus" size={28} />
              </span>
              <div className="ub-main">上传 IP 图片</div>
            </>
          )}
        </div>
      </div>

      <div className="field">
        <div className="ws-label">延展项</div>
        {/* 子 Tab：视角/场景/动作/表情/服装/周边 */}
        <div className="ip-ext-tabs">
          {ipExtendTabs.map((t) => (
            <span key={t} className={extTab === t ? "ip-ext-tab on" : "ip-ext-tab"} onClick={() => changeTab(t)}>
              {t}
            </span>
          ))}
        </div>
        {/* 预设网格：一行 2 个 */}
        <div className="ip-preset-grid">
          {presets.map((p) => (
            <button
              key={p}
              className={curPick === p ? "ip-preset on" : "ip-preset"}
              onClick={() => pickPreset(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* 视角项无需「描述词」与「上传参考图」 */}
      {extTab !== "视角" && (
        <>
          <div className="field">
            <div className="ws-label">{extTab}描述词</div>
            <textarea value={extDesc} onChange={(e) => setExtDesc(e.target.value)} placeholder={ipExtendPlaceholder[extTab]} />
          </div>

          <div className="field">
            <div className="ws-label">上传参考图</div>
            <div
              className={`upload-box ${refUploaded ? "filled thumb-grad-3" : ""}`}
              style={refUploaded ? { minHeight: 120, display: "grid", placeItems: "center", fontSize: 40, color: "#fff" } : undefined}
              onClick={() => setRefUploaded((v) => !v)}
            >
              {refUploaded ? (
                "🖼️"
              ) : (
                <>
                  <span className="ub-ico">
                    <Icon name="plus" size={26} />
                  </span>
                  <div className="ub-main">上传参考图</div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      </div>
      <div className="ws-foot">
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={onGenerate}>
          立即生成 <span className="btn-credit">80算力</span>
        </button>
      </div>
    </>
  );
}
