"use client";

import { Icon } from "@/components/ui/Icon";
import type { ContentScene } from "@/lib/types";

/* ---------------- 通用文案表单（公众号帮写 / 品牌推广） ---------------- */
export interface DefaultFormState {
  input: string;
  tone: string;
  length: string;
  customLen: string;
  brandAsset: string;
}

const TONES = ["亲切口语", "专业权威", "活泼种草", "政务正式"];
const LENS = ["精简", "标准", "详尽", "自定义"];
const BRAND_OPTS = ["安吉白茶 · 产业品牌（已定稿）", "合作社自有品牌", "不套用"];

export function ContentDefaultPanel({
  scene,
  state,
  setState,
  onOutline,
  onGenerate,
  loading,
}: {
  scene: ContentScene;
  state: DefaultFormState;
  setState: (s: DefaultFormState) => void;
  onOutline?: () => void;
  onGenerate: () => void;
  loading: boolean;
}) {
  const set = <K extends keyof DefaultFormState>(k: K, v: DefaultFormState[K]) =>
    setState({ ...state, [k]: v });

  const lenHint =
    scene.key === "official"
      ? "公众号长文：约 1500-2000 字，先出提纲确认再写全文"
      : `约 80-150 字，适配「${scene.title}」`;

  return (
    <>
      <div className="ws-scroll">
      <div className="field">
        <div className="ws-label">
          写什么？<span className="req">*</span>
        </div>
        <textarea
          value={state.input}
          onChange={(e) => set("input", e.target.value)}
          placeholder="例如：安吉明前白茶上市，高山云雾、氨基酸高、限量预订、产地直发…"
        />
      </div>
      <div className="field">
        <div className="ws-label">语气风格</div>
        <div className="chip-row">
          {TONES.map((t) => (
            <span key={t} className={state.tone === t ? "sel-chip on" : "sel-chip"} onClick={() => set("tone", t)}>
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="field">
        <div className="ws-label">篇幅</div>
        <div className="chip-row">
          {LENS.map((l) => (
            <span
              key={l}
              className={state.length === l ? "sel-chip on" : "sel-chip"}
              onClick={() => set("length", l)}
            >
              {l === "自定义" ? "自定义字数" : l}
            </span>
          ))}
        </div>
        {state.length === "自定义" && (
          <div className="custom-len">
            <input
              type="number"
              min={20}
              max={5000}
              step={10}
              value={state.customLen}
              onChange={(e) => set("customLen", e.target.value)}
            />
            <span className="cl-unit">字左右</span>
          </div>
        )}
        <div className="field-hint">{lenHint}</div>
      </div>
      <div className="field">
        <div className="ws-label">套用品牌资产</div>
        <select value={state.brandAsset} onChange={(e) => set("brandAsset", e.target.value)}>
          {BRAND_OPTS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
      </div>
      <div className="ws-foot">
        {scene.key === "official" && (
          <button
            className="btn btn-soft btn-block"
            style={{ marginBottom: 10 }}
            disabled={loading}
            onClick={onOutline}
          >
            <Icon name="outline" size={16} /> 先生成提纲
          </button>
        )}
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={onGenerate}>
          <Icon name="sparkle" size={16} /> {loading ? "生成中…" : `生成${scene.title.replace("发", "")}文案`}
        </button>
        <p className="empty-note" style={{ textAlign: "center" }}>
          生成结果可二次编辑、润色 / 续写 / 改写、存入个人仓库
        </p>
      </div>
    </>
  );
}

/* ---------------- 社媒推文表单 ---------------- */
export interface SocialFormState {
  product: string;
  brand: string;
  audience: string;
  advantage: string;
  platforms: string[];
  outlines: Record<string, { title: string; subtitle: string; keywords: string }>;
}

const AUDIENCES = ["婴幼儿", "青少年", "孕妇", "宝妈", "银发族", "白领职场", "健身运动", "学生群体", "户外爱好者", "自定义"];
const PLATFORMS = [
  { name: "微信朋友圈", cls: "plat-wechat", ico: "💬" },
  { name: "小红书", cls: "plat-xhs", ico: "📕" },
];

export function ContentSocialPanel({
  state,
  setState,
  onGenerate,
  loading,
}: {
  state: SocialFormState;
  setState: (s: SocialFormState) => void;
  onGenerate: () => void;
  loading: boolean;
}) {
  const set = <K extends keyof SocialFormState>(k: K, v: SocialFormState[K]) =>
    setState({ ...state, [k]: v });

  const togglePlat = (name: string) => {
    set("platforms", state.platforms.includes(name) ? state.platforms.filter((p) => p !== name) : [...state.platforms, name]);
  };

  return (
    <>
      <div className="ws-scroll">
      <div className="field">
        <div className="ws-label">
          产品名 <span className="req">*</span>
          <span className="opt">（必填）</span>
        </div>
        <input
          type="text"
          value={state.product}
          onChange={(e) => set("product", e.target.value)}
          placeholder="例如：萧山杜家杨梅 / 萝卜干"
        />
      </div>
      <div className="field">
        <div className="ws-label">
          品牌名 <span className="opt">（选填）</span>
        </div>
        <input
          type="text"
          value={state.brand}
          onChange={(e) => set("brand", e.target.value)}
          placeholder="例如：极鲜生 / 杨梅叶气"
        />
      </div>
      <div className="field">
        <div className="ws-label">
          目标人群 <span className="req">*</span>
          <span className="opt">（必选）</span>
        </div>
        <select value={state.audience} onChange={(e) => set("audience", e.target.value)}>
          {AUDIENCES.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <div className="ws-label">
          产品优势 <span className="opt">（选填）</span>
        </div>
        <input
          type="text"
          value={state.advantage}
          onChange={(e) => set("advantage", e.target.value)}
          placeholder="例如：产品直采，全程冷链，0 添加…"
        />
      </div>
      <div className="field">
        <div className="ws-label">推广平台选择</div>
        <div className="plat-row">
          {PLATFORMS.map((p) => (
            <button
              key={p.name}
              type="button"
              className={`plat-chip ${p.cls} ${state.platforms.includes(p.name) ? "on" : ""}`}
              onClick={() => togglePlat(p.name)}
            >
              <span className="plat-ico">{p.ico}</span> {p.name}
            </button>
          ))}
        </div>
      </div>
      </div>
      <div className="ws-foot">
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={onGenerate}>
          <Icon name="sparkle" size={16} /> {loading ? "生成中…" : "立即生成"}
        </button>
        <p className="empty-note" style={{ textAlign: "center" }}>
          生成结果可二次编辑、润色 / 续写 / 改写、存入个人仓库
        </p>
      </div>
    </>
  );
}
