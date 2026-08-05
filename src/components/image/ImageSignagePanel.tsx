"use client";

import { useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { ClearableTextarea } from "@/components/ui/ClearableTextarea";
import { RegionEnhanceStrip } from "@/components/image/RegionEnhanceStrip";
import { accountRegionId } from "@/lib/regionEnhance";
import { useAuth } from "@/lib/AuthContext";
import {
  signagePlatforms,
  signageStudioSizes,
  signageStorefrontSizes,
  signageIndustries,
  signageStyles,
  signageStorefrontTypes,
  SIGNAGE_IMAGE_MODEL,
  platformByKey,
  storefrontSizeByName,
  type SignageChannel,
  type SignagePlatformKey,
  type SignageIndustry,
  type SignageStyle,
  type SignageStorefrontType,
} from "@/data/signageStudio";

export interface SignageStudioState {
  channel: SignageChannel;
  platform: SignagePlatformKey;
  storefrontType: SignageStorefrontType;
  shopName: string;
  slogan: string;
  industry: SignageIndustry;
  style: SignageStyle;
  logoImg: string;
  logoLabel: string;
  refImg: string;
  refLabel: string;
  size: string;
  customW: string;
  customH: string;
  count: number;
  model: string;
  fromCase?: boolean;
  extraDesc: string;
  regionEnhance: boolean;
}

export function initSignageStudio(): SignageStudioState {
  const p = platformByKey("tb_banner");
  return {
    channel: "online",
    platform: "tb_banner",
    storefrontType: "沿街门头",
    shopName: "",
    slogan: "",
    industry: "茶叶",
    style: "新中式",
    logoImg: "",
    logoLabel: "",
    refImg: "",
    refLabel: "",
    size: p.sizeName,
    customW: String(p.w),
    customH: String(p.h),
    count: 1,
    model: SIGNAGE_IMAGE_MODEL,
    extraDesc: "",
    regionEnhance: true,
  };
}

export function ImageSignagePanel({
  state,
  setState,
  onGenerate,
  loading,
  onOpenLogoLibrary,
  onOpenRefLibrary,
}: {
  state: SignageStudioState;
  setState: (s: SignageStudioState) => void;
  onGenerate: () => void;
  loading: boolean;
  onOpenLogoLibrary?: () => void;
  onOpenRefLibrary?: () => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const regionId = accountRegionId(user);
  const logoRef = useRef<HTMLInputElement>(null);
  const refFileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof SignageStudioState>(k: K, v: SignageStudioState[K]) =>
    setState({ ...state, [k]: v });
  const sizeOpts: DropdownOption[] = (state.channel === "storefront" ? signageStorefrontSizes : signageStudioSizes).map((s) => ({
    name: s.name,
    sub: s.size,
    ico: (s.ico as DropdownOption["ico"]) ?? "szLandscape",
    custom: s.name === "自定义",
  }));

  function pickPlatform(key: SignagePlatformKey) {
    const p = platformByKey(key);
    setState({
      ...state,
      platform: key,
      size: p.key === "custom" ? "自定义" : p.sizeName,
      customW: String(p.w),
      customH: String(p.h),
      fromCase: false,
    });
  }

  function pickChannel(ch: SignageChannel) {
    if (ch === state.channel) return;
    if (ch === "online") {
      const p = platformByKey("tb_banner");
      setState({
        ...state,
        channel: "online",
        platform: "tb_banner",
        size: p.sizeName,
        customW: String(p.w),
        customH: String(p.h),
      });
      return;
    }
    const sf = storefrontSizeByName("沿街门头2400×800");
    setState({
      ...state,
      channel: "storefront",
      size: sf?.name || "自定义",
      customW: String(sf?.w || 2400),
      customH: String(sf?.h || 800),
    });
  }

  function onLogoFile(f: File | undefined) {
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["jpg", "jpeg", "png", "webp"].includes(ext)) {
      toast("仅支持 JPG、PNG、WEBP", "warn");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast("图片不能超过 10 MB", "warn");
      return;
    }
    if (state.logoImg.startsWith("blob:")) URL.revokeObjectURL(state.logoImg);
    setState({
      ...state,
      logoImg: URL.createObjectURL(f),
      logoLabel: f.name,
      fromCase: false,
    });
  }

  function onRefFile(f: File | undefined) {
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["jpg", "jpeg", "png", "webp"].includes(ext)) {
      toast("仅支持 JPG、PNG、WEBP", "warn");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast("图片不能超过 10 MB", "warn");
      return;
    }
    if (state.refImg.startsWith("blob:")) URL.revokeObjectURL(state.refImg);
    setState({
      ...state,
      refImg: URL.createObjectURL(f),
      refLabel: f.name,
      fromCase: false,
    });
  }

  return (
    <>
      <div className="ws-scroll">
        <div className="field">
          <div className="ev-tabs" style={{ marginBottom: 0 }}>
            <span className={state.channel === "online" ? "ev-tab on" : "ev-tab"} onClick={() => pickChannel("online")}>
              线上店招
            </span>
            <span className={state.channel === "storefront" ? "ev-tab on" : "ev-tab"} onClick={() => pickChannel("storefront")}>
              实体门头
            </span>
          </div>
        </div>

        <RegionEnhanceStrip
          enabled={state.regionEnhance}
          onChange={(next) => set("regionEnhance", next)}
          regionId={regionId}
          showLora={false}
        />

        {state.channel === "online" ? (
          <div className="field">
            <div className="ws-label">上架平台</div>
            <div className="pd-chip-wrap" style={{ marginTop: 8 }}>
              {signagePlatforms.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={state.platform === p.key ? "preset-chip on" : "preset-chip"}
                  onClick={() => pickPlatform(p.key)}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {platformByKey(state.platform).hint && (
              <div className="field-hint" style={{ marginTop: 6 }}>
                {platformByKey(state.platform).hint}
              </div>
            )}
          </div>
        ) : (
          <div className="field">
            <div className="ws-label">门头类型</div>
            <div className="pd-chip-wrap" style={{ marginTop: 8 }}>
              {signageStorefrontTypes.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={state.storefrontType === n ? "preset-chip on" : "preset-chip"}
                  onClick={() => set("storefrontType", n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <div className="ws-label">
            店铺名称 <span className="req">*</span>
          </div>
          <input
            type="text"
            value={state.shopName}
            onChange={(e) => setState({ ...state, shopName: e.target.value, fromCase: false })}
            placeholder="如：安吉白茶旗舰店"
            maxLength={32}
          />
        </div>

        <div className="field">
          <div className="ws-label">
            Slogan / 活动文案 <span className="opt">（选填）</span>
          </div>
          <ClearableTextarea
            value={state.slogan}
            onChange={(e) => setState({ ...state, slogan: e.target.value, fromCase: false })}
            onClear={() => setState({ ...state, slogan: "", fromCase: false })}
            placeholder="如：明前芽茶 · 产地直发"
          />
        </div>

        <div className="field">
          <div className="ws-label">行业</div>
          <div className="pd-chip-wrap" style={{ marginTop: 8 }}>
            {signageIndustries.map((n) => (
              <button
                key={n}
                type="button"
                className={state.industry === n ? "preset-chip on" : "preset-chip"}
                onClick={() => set("industry", n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="ws-label">风格</div>
          <div className="pd-chip-wrap" style={{ marginTop: 8 }}>
            {signageStyles.map((n) => (
              <button
                key={n}
                type="button"
                className={state.style === n ? "preset-chip on" : "preset-chip"}
                onClick={() => set("style", n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="ws-label-row">
            <div className="ws-label">
              品牌 Logo <span className="opt">（选填）</span>
            </div>
            <button type="button" className="ws-chip" onClick={() => onOpenLogoLibrary?.()}>
              仓库
            </button>
          </div>
          <input
            ref={logoRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              onLogoFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div
            className={`pd-upload ${state.logoImg ? "filled" : ""}`}
            onClick={() => logoRef.current?.click()}
          >
            {state.logoImg ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={state.logoImg} alt={state.logoLabel || "Logo"} />
                <button
                  type="button"
                  className="upload-clear"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (state.logoImg.startsWith("blob:")) URL.revokeObjectURL(state.logoImg);
                    setState({ ...state, logoImg: "", logoLabel: "" });
                  }}
                >
                  <Icon name="close" size={14} />
                </button>
              </>
            ) : (
              <>
                <span className="pd-upload-ico"><Icon name="image" size={22} /></span>
                <div className="pd-upload-main">上传 Logo</div>
                <div className="pd-upload-sub">有 Logo 时走图生保标 · 支持仓库</div>
              </>
            )}
          </div>
        </div>

        <div className="field">
          <div className="ws-label-row">
            <div className="ws-label">
              参考图 <span className="opt">（选填）</span>
            </div>
            <button type="button" className="ws-chip" onClick={() => onOpenRefLibrary?.()}>
              仓库
            </button>
          </div>
          <input
            ref={refFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              onRefFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div
            className={`pd-upload ${state.refImg ? "filled" : ""}`}
            onClick={() => refFileRef.current?.click()}
          >
            {state.refImg ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={state.refImg} alt={state.refLabel || "参考图"} />
                <button
                  type="button"
                  className="upload-clear"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (state.refImg.startsWith("blob:")) URL.revokeObjectURL(state.refImg);
                    setState({ ...state, refImg: "", refLabel: "" });
                  }}
                >
                  <Icon name="close" size={14} />
                </button>
              </>
            ) : (
              <>
                <span className="pd-upload-ico"><Icon name="image" size={22} /></span>
                <div className="pd-upload-main">上传参考店招 / 包装</div>
                <div className="pd-upload-sub">可选 · 用于风格参考</div>
              </>
            )}
          </div>
        </div>

        <div className="field">
          <div className="ws-label">出图尺寸</div>
          <Dropdown
            title="出图尺寸"
            options={sizeOpts}
            value={state.size}
            showSub
            onChange={(o) => {
              const name = o.name;
              if (name === "自定义") {
                setState({ ...state, size: "自定义", platform: "custom", fromCase: false });
                return;
              }
              if (state.channel === "storefront") {
                const sf = storefrontSizeByName(name);
                if (sf) {
                  setState({
                    ...state,
                    size: sf.name,
                    customW: String(sf.w),
                    customH: String(sf.h),
                    fromCase: false,
                  });
                  return;
                }
              }
              const hit = signagePlatforms.find((p) => p.sizeName === name);
              if (hit) {
                setState({
                  ...state,
                  size: hit.sizeName,
                  platform: hit.key,
                  customW: String(hit.w),
                  customH: String(hit.h),
                  fromCase: false,
                });
              } else {
                set("size", name);
              }
            }}
          />
          {state.size === "自定义" && (
            <div className="pd-color-row" style={{ marginTop: 8 }}>
              <input
                type="number"
                min={64}
                value={state.customW}
                onChange={(e) => set("customW", e.target.value)}
                placeholder="宽"
              />
              <span>×</span>
              <input
                type="number"
                min={64}
                value={state.customH}
                onChange={(e) => set("customH", e.target.value)}
                placeholder="高"
              />
              <span style={{ color: "var(--c-muted)", fontSize: 12 }}>px</span>
            </div>
          )}
        </div>

        <div className="field">
          <div className="ws-label">生成数量</div>
          <div className="seg">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className={state.count === n ? "seg-item on" : "seg-item"}
                onClick={() => set("count", n)}
              >
                {n}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ws-footer">
        <div className="pd-gen-hint">
          {state.channel === "storefront" ? `实体门头 · ${state.storefrontType}` : platformByKey(state.platform).name}
          {state.shopName ? ` · ${state.shopName}` : ""}
          {` · 生成 ${state.count} 张`}
        </div>
        <button type="button" className="btn btn-primary btn-block" disabled={loading} onClick={onGenerate}>
          <Icon name="sparkle" size={16} />
          {loading ? "生成中…" : "立即生成店招"}
        </button>
      </div>
    </>
  );
}
