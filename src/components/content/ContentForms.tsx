"use client";

import { Icon } from "@/components/ui/Icon";
import type { ContentScene } from "@/lib/types";
import { ClearableTextarea } from "@/components/ui/ClearableTextarea";

/* ---------------- 通用文案表单（品牌推广） ---------------- */
export interface DefaultFormState {
  input: string;
  tone: string;
  length: string;
  customLen: string;
  brandAsset: string;
}

const TONES = ["亲切口语", "专业权威", "活泼种草", "政务正式"];
const LENS = ["精简", "标准", "详尽", "自定义"];
const BRAND_OPTS = ["萧山杨梅 · 产业品牌（已定稿）", "合作社自有品牌", "不套用"];

export function ContentDefaultPanel({
  scene,
  state,
  setState,
  onGenerate,
  loading,
}: {
  scene: ContentScene;
  state: DefaultFormState;
  setState: (s: DefaultFormState) => void;
  onGenerate: () => void;
  loading: boolean;
}) {
  const set = <K extends keyof DefaultFormState>(k: K, v: DefaultFormState[K]) =>
    setState({ ...state, [k]: v });

  return (
    <>
      <div className="ws-scroll">
      <div className="field">
        <div className="ws-label">
          写什么？<span className="req">*</span>
        </div>
        <ClearableTextarea
          value={state.input}
          onChange={(e) => set("input", e.target.value)}
          onClear={() => set("input", "")}
          placeholder="例如：萧山杨梅上市，紫红饱满、核小肉厚、当日采摘、产地直发…"
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
        <div className="field-hint">约 80-150 字，适配「{scene.title}」</div>
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
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={onGenerate}>
          {loading ? "生成中…" : `生成${scene.title.replace("发", "")}文案`}
        </button>
        <p className="empty-note" style={{ textAlign: "center" }}>
          生成结果可二次编辑、润色 / 续写 / 改写、存入个人仓库
        </p>
      </div>
    </>
  );
}

/* ---------------- 公众号帮写（按截图一次生成） ---------------- */
export const OFFICIAL_LENGTHS = ["600-800字", "800-1200字", "1200-2000字", "2000字以上"] as const;
export const OFFICIAL_STYLES = ["政企风", "娱乐风", "短剧风", "情感文", "干货科普", "自定义"] as const;

export interface OfficialFormState {
  title: string;
  keywords: string;
  outline: string;
  length: (typeof OFFICIAL_LENGTHS)[number];
  style: (typeof OFFICIAL_STYLES)[number];
  customStyle: string;
}

export function initOfficialForm(seedTitle = ""): OfficialFormState {
  return {
    title: seedTitle,
    keywords: "",
    outline: "",
    length: "600-800字",
    style: "干货科普",
    customStyle: "",
  };
}

export function OfficialAccountPanel({
  state,
  setState,
  onGenerate,
  loading,
}: {
  state: OfficialFormState;
  setState: (s: OfficialFormState) => void;
  onGenerate: () => void;
  loading: boolean;
}) {
  const set = <K extends keyof OfficialFormState>(k: K, v: OfficialFormState[K]) =>
    setState({ ...state, [k]: v });

  return (
    <>
      <div className="ws-scroll">
        <div className="field">
          <div className="ws-section-title">文章基础信息</div>
        </div>

        <div className="field">
          <div className="ws-label">
            文章标题 <span className="req">*</span>
          </div>
          <input
            type="text"
            value={state.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="例如：2025年农业数字化转型白皮书发布"
            maxLength={80}
          />
        </div>

        <div className="field">
          <div className="ws-label">
            核心关键词 <span className="req">*</span>
          </div>
          <input
            type="text"
            value={state.keywords}
            onChange={(e) => set("keywords", e.target.value)}
            placeholder="例如：数字化改革，乡村振兴，智慧农业"
            maxLength={120}
          />
        </div>

        <div className="field">
          <div className="ws-label">
            内容大纲 <span className="opt">（选填）</span>
          </div>
          <ClearableTextarea
            value={state.outline}
            onChange={(e) => set("outline", e.target.value)}
            onClear={() => set("outline", "")}
            placeholder="请输入文章结构大纲，如：1. 背景介绍 2. 核心举措 3. 未来展望…"
          />
        </div>

        <div className="field">
          <div className="ws-section-title">风格与篇幅</div>
        </div>

        <div className="field">
          <div className="ws-label">字数范围</div>
          <div className="chip-row">
            {OFFICIAL_LENGTHS.map((l) => (
              <span
                key={l}
                className={state.length === l ? "sel-chip on" : "sel-chip"}
                onClick={() => set("length", l)}
              >
                {l}
              </span>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="ws-label">文案风格</div>
          <div className="chip-row">
            {OFFICIAL_STYLES.map((s) => (
              <span
                key={s}
                className={state.style === s ? "sel-chip on" : "sel-chip"}
                onClick={() => set("style", s)}
              >
                {s}
              </span>
            ))}
          </div>
          {state.style === "自定义" && (
            <input
              type="text"
              style={{ marginTop: 8 }}
              value={state.customStyle}
              onChange={(e) => set("customStyle", e.target.value)}
              placeholder="描述期望的文案风格，如：纪实叙事、温和科普…"
              maxLength={80}
            />
          )}
        </div>
      </div>

      <div className="ws-foot">
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={onGenerate}>
          {loading ? "生成中…" : "生成公众号文章"}
        </button>
      </div>
    </>
  );
}

/* ---------------- 社媒推文表单 ---------------- */
export interface SocialOutline {
  title: string;
  subtitle: string;
  keywords: string;
}

export interface SocialFormState {
  product: string;
  brand: string;
  audience: string;
  /** 目标人群选「自定义」时的描述 */
  customAudience: string;
  advantage: string;
  platforms: string[];
  /** 今天推什么 */
  intent: string;
  /** 钩子类型 */
  hook: string;
  /** 行动号召 */
  cta: string;
  /** 语气 */
  tone: string;
  /** 爆款/竞品原文（改写用） */
  rewriteSource: string;
  /** 改写模式 */
  rewriteMode: string;
  /** 各平台内容大纲（可选，对齐品牌推广） */
  outlines: Record<string, SocialOutline>;
  outlineOpen?: string;
}

const SOCIAL_AUDIENCES = [
  "文旅游客",
  "周边城市周末游客",
  "亲子家庭",
  "自驾游人群",
  "银发康养人群",
  "茶文化爱好者",
  "农产品采购人群",
  "本地居民",
  "自定义",
];
const SOCIAL_PLATFORMS = [
  { name: "微信朋友圈", cls: "plat-wechat" },
  { name: "小红书", cls: "plat-xhs" },
];

export const SOCIAL_INTENTS = ["上新", "促销", "种草", "复购", "活动预热"] as const;
export const SOCIAL_HOOKS = ["价格钩", "产地钩", "场景钩", "反差钩", "限时钩"] as const;
export const SOCIAL_CTAS = ["私信", "留资", "下单", "到店", "转发"] as const;
export const SOCIAL_TONES = ["口语种草", "采购专业", "本地亲切", "高端克制"] as const;
export const SOCIAL_REWRITE_MODES = [
  { key: "换产品改写", tip: "保留爆款结构，换成我的产品" },
  { key: "同卖点多钩子", tip: "同一卖点输出多个不同钩子" },
  { key: "跨平台改编", tip: "一稿改成朋友圈+小红书双版本" },
] as const;

const emptySocialOutline = (): SocialOutline => ({ title: "", subtitle: "", keywords: "" });

export function initSocialForm(product = ""): SocialFormState {
  return {
    product,
    brand: "",
    audience: "文旅游客",
    customAudience: "",
    advantage: "",
    platforms: ["微信朋友圈"],
    intent: "种草",
    hook: "场景钩",
    cta: "私信",
    tone: "口语种草",
    rewriteSource: "",
    rewriteMode: "换产品改写",
    outlines: {},
    outlineOpen: undefined,
  };
}

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
    const on = state.platforms.includes(name);
    const platforms = on ? state.platforms.filter((p) => p !== name) : [...state.platforms, name];
    const next: SocialFormState = { ...state, platforms };
    if (on && state.outlineOpen === name) next.outlineOpen = undefined;
    setState(next);
  };

  const patchOutline = (plat: string, patch: Partial<SocialOutline>) => {
    const cur = state.outlines[plat] || emptySocialOutline();
    setState({
      ...state,
      outlines: { ...state.outlines, [plat]: { ...cur, ...patch } },
    });
  };

  const selectedPlats = SOCIAL_PLATFORMS.filter((p) => state.platforms.includes(p.name));

  return (
    <>
      <div className="ws-scroll">
        <div className="field">
          <div className="ws-section-title">投放意图</div>
        </div>
        <div className="field">
          <div className="ws-label">
            今天推什么 <span className="req">*</span>
          </div>
          <div className="chip-row social-intent-row">
            {SOCIAL_INTENTS.map((v) => (
              <button
                key={v}
                type="button"
                className={`plat-chip ${state.intent === v ? "on" : ""}`}
                onClick={() => set("intent", v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <div className="ws-label">
            钩子类型 <span className="req">*</span>
          </div>
          <div className="chip-row social-intent-row">
            {SOCIAL_HOOKS.map((v) => (
              <button
                key={v}
                type="button"
                className={`plat-chip ${state.hook === v ? "on" : ""}`}
                onClick={() => set("hook", v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <div className="ws-label">
            行动号召 <span className="req">*</span>
          </div>
          <div className="chip-row social-intent-row">
            {SOCIAL_CTAS.map((v) => (
              <button
                key={v}
                type="button"
                className={`plat-chip ${state.cta === v ? "on" : ""}`}
                onClick={() => set("cta", v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <div className="ws-label">
            语气 <span className="req">*</span>
          </div>
          <div className="chip-row social-intent-row">
            {SOCIAL_TONES.map((v) => (
              <button
                key={v}
                type="button"
                className={`plat-chip ${state.tone === v ? "on" : ""}`}
                onClick={() => set("tone", v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="ws-section-title">
            爆款改写 <span className="opt">（可选，有原文时优先按改写模式生成）</span>
          </div>
        </div>
        <div className="field">
          <div className="ws-label">粘贴爆款 / 竞品文案</div>
          <textarea
            style={{ minHeight: 88, resize: "vertical" }}
            value={state.rewriteSource}
            onChange={(e) => set("rewriteSource", e.target.value)}
            placeholder="粘贴上周爆款或竞品文案，一键改成自己的产品和平台版本…"
            maxLength={1200}
          />
        </div>
        {state.rewriteSource.trim() && (
          <div className="field">
            <div className="ws-label">改写模式</div>
            <div className="chip-row social-intent-row">
              {SOCIAL_REWRITE_MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={`plat-chip ${state.rewriteMode === m.key ? "on" : ""}`}
                  title={m.tip}
                  onClick={() => set("rewriteMode", m.key)}
                >
                  {m.key}
                </button>
              ))}
            </div>
            <p className="empty-note" style={{ marginTop: 6 }}>
              {SOCIAL_REWRITE_MODES.find((m) => m.key === state.rewriteMode)?.tip}
            </p>
          </div>
        )}

        <div className="field">
          <div className="ws-section-title">产品信息</div>
        </div>
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
            {SOCIAL_AUDIENCES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          {state.audience === "自定义" && (
            <textarea
              style={{ marginTop: 8, minHeight: 72, resize: "vertical" }}
              value={state.customAudience}
              onChange={(e) => set("customAudience", e.target.value)}
              placeholder="描述目标人群，例如：江浙沪周边2日游人群，偏好自然风景、茶园体验和轻消费…"
              maxLength={200}
            />
          )}
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
            {SOCIAL_PLATFORMS.map((p) => (
              <button
                key={p.name}
                type="button"
                className={`plat-chip ${p.cls} ${state.platforms.includes(p.name) ? "on" : ""}`}
                onClick={() => togglePlat(p.name)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {selectedPlats.length > 0 && (
          <>
            <div className="field">
              <div className="ws-section-title">
                内容大纲 <span className="opt">（可选）</span>
              </div>
            </div>
            <div className="field">
              {selectedPlats.map((p) => {
                const open = state.outlineOpen === p.name;
                const o = state.outlines[p.name] || emptySocialOutline();
                return (
                  <div key={p.name} className={`outline-adv adv ${open ? "open" : ""}`}>
                    <button
                      type="button"
                      className="adv-head"
                      onClick={() => set("outlineOpen", open ? undefined : p.name)}
                    >
                      <span>{p.name} 大纲设置</span>
                      <span className="adv-arrow">›</span>
                    </button>
                    {open && (
                      <div className="adv-body">
                        <div className="field" style={{ marginBottom: 8 }}>
                          <input
                            type="text"
                            value={o.title}
                            onChange={(e) => patchOutline(p.name, { title: e.target.value })}
                            placeholder="主标题/主题"
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 8 }}>
                          <input
                            type="text"
                            value={o.subtitle}
                            onChange={(e) => patchOutline(p.name, { subtitle: e.target.value })}
                            placeholder="副标题/切入点"
                          />
                        </div>
                        <div className="field">
                          <input
                            type="text"
                            value={o.keywords}
                            onChange={(e) => patchOutline(p.name, { keywords: e.target.value })}
                            placeholder="关键词 (逗号分隔)"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <div className="ws-foot">
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={onGenerate}>
          {loading ? "生成中…" : "立即生成"}
        </button>
        <p className="empty-note" style={{ textAlign: "center" }}>
          先定意图与钩子，再生成；支持爆款改写与文案配图套装导出
        </p>
      </div>
    </>
  );
}

/* ---------------- 品牌推广（多平台策划案） ---------------- */
export interface BrandOutline {
  title: string;
  subtitle: string;
  keywords: string;
}

export interface BrandPromotionFormState {
  /** 品牌名称及产品类型 */
  product: string;
  brand: string;
  /** 目标市场/人群（自由填写） */
  audience: string;
  /** 产品核心优势 */
  advantage: string;
  /** 营销目标（选填） */
  goal: string;
  platforms: string[];
  outlines: Record<string, BrandOutline>;
  /** 当前展开的大纲平台 */
  outlineOpen?: string;
}

export const BRAND_MARKETING_PLATFORMS = [
  { name: "微信朋友圈", key: "wechat", cls: "plat-wechat", hint: "" },
  { name: "小红书", key: "xhs", cls: "plat-xhs", hint: "" },
  { name: "抖音", key: "douyin", cls: "plat-douyin", hint: "" },
  { name: "微信公众号", key: "official", cls: "plat-official", hint: "" },
] as const;

const emptyBrandOutline = (): BrandOutline => ({ title: "", subtitle: "", keywords: "" });

export function initBrandPromotionForm(product = ""): BrandPromotionFormState {
  return {
    product,
    brand: "",
    audience: "",
    advantage: "",
    goal: "",
    platforms: ["微信朋友圈", "小红书", "抖音", "微信公众号"],
    outlines: {},
    outlineOpen: undefined,
  };
}

export function BrandPromotionPanel({
  state,
  setState,
  onGenerate,
  loading,
}: {
  state: BrandPromotionFormState;
  setState: (s: BrandPromotionFormState) => void;
  onGenerate: () => void;
  loading: boolean;
}) {
  const set = <K extends keyof BrandPromotionFormState>(k: K, v: BrandPromotionFormState[K]) =>
    setState({ ...state, [k]: v });

  const togglePlat = (name: string) => {
    const on = state.platforms.includes(name);
    const platforms = on ? state.platforms.filter((p) => p !== name) : [...state.platforms, name];
    const next: BrandPromotionFormState = { ...state, platforms };
    if (on && state.outlineOpen === name) next.outlineOpen = undefined;
    setState(next);
  };

  const patchOutline = (plat: string, patch: Partial<BrandOutline>) => {
    const cur = state.outlines[plat] || emptyBrandOutline();
    setState({
      ...state,
      outlines: { ...state.outlines, [plat]: { ...cur, ...patch } },
    });
  };

  const selectedPlats = BRAND_MARKETING_PLATFORMS.filter((p) => state.platforms.includes(p.name));

  return (
    <>
      <div className="ws-scroll">
        <div className="field">
          <div className="ws-section-title">品牌基础信息</div>
        </div>

        <div className="field">
          <div className="ws-label">
            品牌名称及产品类型 <span className="req">*</span>
          </div>
          <input
            type="text"
            value={state.product}
            onChange={(e) => set("product", e.target.value)}
            placeholder="例如：极鲜生 南美白对虾"
          />
        </div>

        <div className="field">
          <div className="ws-label">
            目标市场/人群 <span className="req">*</span>
          </div>
          <input
            type="text"
            value={state.audience}
            onChange={(e) => set("audience", e.target.value)}
            placeholder="例如：一二线城市白领，追求健康饮食"
          />
        </div>

        <div className="field">
          <div className="ws-label">
            产品核心优势 <span className="req">*</span>
          </div>
          <ClearableTextarea
            value={state.advantage}
            onChange={(e) => set("advantage", e.target.value)}
            onClear={() => set("advantage", "")}
            placeholder="例如：产地直采，全程冷链，0添加…"
          />
        </div>

        <div className="field">
          <div className="ws-label">
            营销目标 <span className="opt">（选填）</span>
          </div>
          <input
            type="text"
            value={state.goal}
            onChange={(e) => set("goal", e.target.value)}
            placeholder="例如：提升品牌知名度，促进新品销量"
          />
        </div>

        <div className="field">
          <div className="ws-section-title">推广平台选择</div>
        </div>

        <div className="field">
          <div className="plat-grid">
            {BRAND_MARKETING_PLATFORMS.map((p) => {
              const on = state.platforms.includes(p.name);
              return (
                <button
                  key={p.name}
                  type="button"
                  className={`plat-chip ${p.cls} ${on ? "on" : ""}`}
                  onClick={() => togglePlat(p.name)}
                >
                  <span className="plat-chip-main">{p.name}</span>
                  {p.hint ? <span className="plat-hint">{p.hint}</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        {selectedPlats.length > 0 && (
          <>
            <div className="field">
              <div className="ws-section-title">
                内容大纲 <span className="opt">（可选）</span>
              </div>
            </div>
            <div className="field">
              {selectedPlats.map((p) => {
                const open = state.outlineOpen === p.name;
                const o = state.outlines[p.name] || emptyBrandOutline();
                return (
                  <div key={p.name} className={`outline-adv adv ${open ? "open" : ""}`}>
                    <button
                      type="button"
                      className="adv-head"
                      onClick={() => set("outlineOpen", open ? undefined : p.name)}
                    >
                      <span>{p.name} 大纲设置</span>
                      <span className="adv-arrow">›</span>
                    </button>
                    <div className="adv-body">
                      <div className="field" style={{ marginBottom: 8 }}>
                        <input
                          type="text"
                          value={o.title}
                          onChange={(e) => patchOutline(p.name, { title: e.target.value })}
                          placeholder="主标题/主题"
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 8 }}>
                        <input
                          type="text"
                          value={o.subtitle}
                          onChange={(e) => patchOutline(p.name, { subtitle: e.target.value })}
                          placeholder="副标题/切入点"
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <input
                          type="text"
                          value={o.keywords}
                          onChange={(e) => patchOutline(p.name, { keywords: e.target.value })}
                          placeholder="关键词 (逗号分隔)"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="ws-foot">
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={onGenerate}>
          {loading ? "生成中…" : "生成品牌策划方案"}
        </button>
      </div>
    </>
  );
}
