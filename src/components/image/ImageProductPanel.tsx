"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { ClearableTextarea } from "@/components/ui/ClearableTextarea";
import { RegionEnhanceStrip } from "@/components/image/RegionEnhanceStrip";
import { accountRegionId } from "@/lib/regionEnhance";
import { useAuth } from "@/lib/AuthContext";
import { asset } from "@/lib/asset";
import {
  loadProductSceneImgCache,
} from "@/lib/productSceneThumbs";
import {
  productScenePresets,
  productBgModes,
  productStudioSizes,
  productDescLexicon,
  PRODUCT_IMAGE_MODEL,
  PRODUCT_AI_SCENE_COLOR,
  PRODUCT_AI_SCENE_NONE,
  PRODUCT_AI_SCENE_UPLOAD,
  isProductBgAi,
  isProductBgLocalCut,
  isProductBgNeedUpload,
  isProductBgBatch,
  type ProductTaskKey,
  type ProductBgMode,
  type ProductDescLexCat,
} from "@/data/productStudio";

const sizeOpts: DropdownOption[] = productStudioSizes.map((s) => ({
  name: s.name,
  sub: s.size,
  ico: (s.ico as DropdownOption["ico"]) ?? "szSquare",
  custom: s.name === "自定义",
}));

export interface ProductStudioState {
  task: ProductTaskKey;
  productImg: string;
  productName: string;
  productLabel: string;
  desc: string;
  scenePreset: string;
  angles: string[];
  bgMode: ProductBgMode;
  bgColor: string;
  refinePreset: string;
  size: string;
  customW: string;
  customH: string;
  count: number;
  /** 固定 Seedream 最新，仅用于请求，不展示选择器 */
  model: string;
  fromCase?: boolean;
  customAnglePrompt: string;
  fusionImgs: [string, string, string];
  fusionLabels: [string, string, string];
  sceneMore: boolean;
  regionEnhance: boolean;
}

export function initProductStudio(): ProductStudioState {
  return {
    task: "cutout",
    productImg: "",
    productName: "",
    productLabel: "",
    desc: "",
    scenePreset: PRODUCT_AI_SCENE_NONE,
    angles: ["origin"],
    bgMode: "aiscene",
    bgColor: "#FFFFFF",
    refinePreset: "变清晰",
    size: "电商主图1:1",
    customW: "1080",
    customH: "1080",
    count: 1,
    model: PRODUCT_IMAGE_MODEL,
    customAnglePrompt: "",
    fusionImgs: ["", "", ""],
    fusionLabels: ["", "", ""],
    sceneMore: false,
    regionEnhance: true,
  };
}

export function ImageProductPanel({
  state,
  setState,
  onGenerate,
  loading,
  onOpenLibrary,
  onOpenFusionLibrary,
}: {
  state: ProductStudioState;
  setState: (s: ProductStudioState) => void;
  onGenerate: () => void;
  loading: boolean;
  onOpenLibrary?: () => void;
  onOpenFusionLibrary?: () => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const regionId = accountRegionId(user);
  const fileRef = useRef<HTMLInputElement>(null);
  const sceneUploadRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ProductStudioState>(k: K, v: ProductStudioState[K]) =>
    setState({ ...state, [k]: v });

  const [sceneImgs, setSceneImgs] = useState<Record<string, string>>(() => {
    const cached = loadProductSceneImgCache();
    const seeded: Record<string, string> = { ...cached };
    for (const s of productScenePresets) {
      if (!seeded[s.name] && s.img) seeded[s.name] = asset(s.img);
    }
    return seeded;
  });
  const [sceneLoading, setSceneLoading] = useState<Set<string>>(() => new Set());
  const [descLexCat, setDescLexCat] = useState<ProductDescLexCat>("主体");
  const sceneAttempted = useRef<Set<string>>(new Set());
  const sceneImgsRef = useRef(sceneImgs);
  sceneImgsRef.current = sceneImgs;

  // 仅在有 API 且缺静态图时，才尝试即梦补生成（静态 DEMO 直接用 productcase）
  useEffect(() => {
    if (state.bgMode !== "aiscene" && state.bgMode !== "scene") return;
    let cancelled = false;
    (async () => {
      const { shouldSkipSceneThumbGenerate, generateProductSceneThumb, saveProductSceneImgCache } = await import(
        "@/lib/productSceneThumbs"
      );
      for (const s of productScenePresets) {
        if (cancelled) break;
        if (shouldSkipSceneThumbGenerate(s.name)) continue;
        if (sceneImgsRef.current[s.name] || sceneAttempted.current.has(s.name)) continue;
        sceneAttempted.current.add(s.name);
        setSceneLoading((prev) => new Set(prev).add(s.name));
        try {
          const url = await generateProductSceneThumb(s.name, s.prompt);
          if (cancelled || !url) {
            sceneAttempted.current.delete(s.name);
            continue;
          }
          setSceneImgs((prev) => {
            const next = { ...prev, [s.name]: url };
            saveProductSceneImgCache(next);
            return next;
          });
        } catch {
          sceneAttempted.current.delete(s.name);
        }
        setSceneLoading((prev) => {
          const next = new Set(prev);
          next.delete(s.name);
          return next;
        });
      }
    })();
    return () => { cancelled = true; };
  }, [state.bgMode]);

  function onFile(f: File | undefined) {
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
    const url = URL.createObjectURL(f);
    if (state.productImg.startsWith("blob:")) URL.revokeObjectURL(state.productImg);
    setState({ ...state, productImg: url, productLabel: f.name, fromCase: false });
  }

  function descParts(): string[] {
    return state.desc
      .split(/[，,、\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function toggleDescTag(tag: string) {
    const parts = descParts();
    const idx = parts.indexOf(tag);
    if (idx >= 0) parts.splice(idx, 1);
    else parts.push(tag);
    setState({ ...state, desc: parts.join("，"), fromCase: false });
  }

  /** 场景预设：再点已选项 → 取消选中 */
  function pickScenePreset(name: string) {
    set("scenePreset", state.scenePreset === name ? PRODUCT_AI_SCENE_NONE : name);
  }

  function pickSceneUpload() {
    if (state.scenePreset === PRODUCT_AI_SCENE_UPLOAD) {
      set("scenePreset", PRODUCT_AI_SCENE_NONE);
      return;
    }
    setState({ ...state, scenePreset: PRODUCT_AI_SCENE_UPLOAD, fromCase: false });
    if (!state.fusionImgs[0]) sceneUploadRef.current?.click();
  }

  function onSceneUploadFile(files: FileList | null) {
    const f = files?.[0];
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
    state.fusionImgs.forEach((u) => {
      if (u?.startsWith("blob:")) URL.revokeObjectURL(u);
    });
    setState({
      ...state,
      scenePreset: PRODUCT_AI_SCENE_UPLOAD,
      fusionImgs: [URL.createObjectURL(f), "", ""],
      fusionLabels: [f.name, "", ""],
      fromCase: false,
    });
  }

  const cutoutAi = isProductBgAi(state.bgMode);
  const cutoutMulti = state.bgMode === "aimulti";
  const cutoutLocalPaint = isProductBgLocalCut(state.bgMode);
  const cutoutScene = state.bgMode === "scene";
  const needProductStrict = isProductBgNeedUpload(state.bgMode);

  const showProductUpload = needProductStrict || cutoutAi || isProductBgBatch(state.bgMode);
  const showDesc = cutoutAi || isProductBgBatch(state.bgMode);
  const showCount = !isProductBgBatch(state.bgMode) && !cutoutLocalPaint && !cutoutScene;

  const genCountHint = cutoutMulti
    ? `将出 ${state.angles.length} 张（按角度）`
    : cutoutLocalPaint
        ? "本地抠图 · 1 张"
        : cutoutScene
          ? "生成 1 张"
          : `生成 ${state.count} 张`;

  const modeMeta = productBgModes.find((m) => m.key === state.bgMode);
  const aiSceneLabel =
    state.bgMode === "aiscene"
      ? state.scenePreset === PRODUCT_AI_SCENE_NONE
        ? "商品换背景"
        : state.scenePreset === PRODUCT_AI_SCENE_COLOR
          ? "商品换背景·纯色"
          : `商品换背景·${state.scenePreset}`
      : modeMeta?.name;

  return (
    <>
      <div className="ws-scroll">
        <RegionEnhanceStrip
          enabled={state.regionEnhance}
          onChange={(next) => set("regionEnhance", next)}
          regionId={regionId}
          showLora={false}
        />
        {showProductUpload && (
          <div className="field">
            <div className="ws-label-row">
              <div className="ws-label">
                商品实拍 <span className="req">*</span>
              </div>
              <button type="button" className="ws-chip" onClick={() => onOpenLibrary?.()}>
                仓库
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div
              className={`pd-upload ${state.productImg ? "filled" : ""}`}
              onClick={() => fileRef.current?.click()}
            >
              {state.productImg ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={state.productImg} alt={state.productLabel || "商品图"} />
                  <button
                    type="button"
                    className="upload-clear"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (state.productImg.startsWith("blob:")) URL.revokeObjectURL(state.productImg);
                      setState({ ...state, productImg: "", productLabel: "" });
                    }}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </>
              ) : (
                <>
                  <span className="pd-upload-ico"><Icon name="image" size={22} /></span>
                  <div className="pd-upload-main">上传商品图 / 包装图</div>
                  <div className="pd-upload-sub">手机实拍即可 · 支持仓库选用</div>
                </>
              )}
            </div>

          </div>
        )}

        <div className="field">
          {state.bgMode === "color" && (
            <div className="pd-color-row">
              <input type="color" value={state.bgColor} onChange={(e) => set("bgColor", e.target.value)} />
              <input type="text" value={state.bgColor} onChange={(e) => set("bgColor", e.target.value)} />
            </div>
          )}
          {state.bgMode === "aiscene" && (() => {
            type SceneOpt = { name: string; img?: string };
            const allScenes: SceneOpt[] = [
              { name: PRODUCT_AI_SCENE_UPLOAD },
              { name: PRODUCT_AI_SCENE_COLOR },
              ...productScenePresets,
            ];
            const visibleScenes = state.sceneMore ? allScenes : allScenes.slice(0, 6);
            const hasMore = allScenes.length > 6;
            return (
              <>
                <div className="ws-label-row" style={{ marginTop: 10 }}>
                  <div className="ws-label" style={{ marginBottom: 0 }}>场景预设</div>
                  <button type="button" className="ws-chip" onClick={() => onOpenFusionLibrary?.()}>
                    仓库
                  </button>
                </div>
                <input
                  ref={sceneUploadRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={(e) => {
                    onSceneUploadFile(e.target.files);
                    e.target.value = "";
                  }}
                />
                <div className="pd-scene-grid" id="iProductOpts" style={{ marginTop: 8 }}>
                  {visibleScenes.map((s) => {
                    const isUpload = s.name === PRODUCT_AI_SCENE_UPLOAD;
                    const on = state.scenePreset === s.name;
                    const isColor = s.name === PRODUCT_AI_SCENE_COLOR;
                    const thumb = isUpload
                      ? state.fusionImgs[0]
                      : sceneImgs[s.name] || (s.img ? asset(s.img) : "");
                    const loading = !isUpload && sceneLoading.has(s.name);
                    return (
                      <button
                        key={s.name}
                        type="button"
                        className={on ? "pd-scene-tile on" : "pd-scene-tile"}
                        onClick={() => (isUpload ? pickSceneUpload() : pickScenePreset(s.name))}
                      >
                        <span className="pd-scene-thumb">
                          {isUpload ? (
                            thumb ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={thumb} alt="补充图" />
                                <span
                                  className="pd-scene-clear"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    state.fusionImgs.forEach((u) => {
                                      if (u?.startsWith("blob:")) URL.revokeObjectURL(u);
                                    });
                                    setState({
                                      ...state,
                                      fusionImgs: ["", "", ""],
                                      fusionLabels: ["", "", ""],
                                      scenePreset:
                                        state.scenePreset === PRODUCT_AI_SCENE_UPLOAD
                                          ? PRODUCT_AI_SCENE_NONE
                                          : state.scenePreset,
                                    });
                                  }}
                                  role="button"
                                  aria-label="清除补充图"
                                >
                                  <Icon name="close" size={12} />
                                </span>
                              </>
                            ) : (
                              <span className="pd-scene-ph pd-scene-upload-ph">
                                <Icon name="upload" size={18} />
                              </span>
                            )
                          ) : isColor ? (
                            <span className="pd-scene-solid" style={{ background: state.bgColor || "#FFFFFF" }} />
                          ) : thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt={s.name} />
                          ) : (
                            <span className="pd-scene-ph">{loading ? "生成中" : s.name.slice(0, 2)}</span>
                          )}
                        </span>
                        <span className="pd-scene-name">{s.name}</span>
                      </button>
                    );
                  })}
                </div>
                {hasMore && (
                  <button
                    type="button"
                    className={`preset-toggle ${state.sceneMore ? "open" : ""}`}
                    onClick={() => set("sceneMore", !state.sceneMore)}
                  >
                    <span className="pt-arrow"><Icon name="chevron" size={14} /></span>
                    <span className="pt-text">{state.sceneMore ? "收起" : "更多预设选项"}</span>
                  </button>
                )}
                {state.scenePreset === PRODUCT_AI_SCENE_COLOR && (
                  <div className="pd-color-row">
                    <input type="color" value={state.bgColor} onChange={(e) => set("bgColor", e.target.value)} />
                    <input type="text" value={state.bgColor} onChange={(e) => set("bgColor", e.target.value)} />
                  </div>
                )}
              </>
            );
          })()}
          {state.bgMode === "scene" && (
            <div className="pd-scene-grid" id="iProductOpts" style={{ marginTop: 10 }}>
              {productScenePresets.map((s) => {
                const thumb = sceneImgs[s.name] || (s.img ? asset(s.img) : "");
                const loading = sceneLoading.has(s.name);
                return (
                  <button
                    key={s.name}
                    type="button"
                    className={state.scenePreset === s.name ? "pd-scene-tile on" : "pd-scene-tile"}
                    onClick={() => pickScenePreset(s.name)}
                  >
                    <span className="pd-scene-thumb">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt={s.name} />
                      ) : (
                        <span className="pd-scene-ph">{loading ? "生成中" : s.name.slice(0, 2)}</span>
                      )}
                    </span>
                    <span className="pd-scene-name">{s.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {showDesc && (
          <div className="field">
            <div className="pd-desc-card">
              <div className="pd-desc-head">
                <Icon name="sparkle" size={16} className="pd-desc-ico" />
                <span>自定义场景描述</span>
                <span className="opt">（选填）</span>
              </div>
              <ClearableTextarea
                value={state.desc}
                onChange={(e) => setState({ ...state, desc: e.target.value, fromCase: false })}
                onClear={() => setState({ ...state, desc: "", fromCase: false })}
                placeholder="请从下方词库选择或直接输入…"
              />
              <div className="pd-desc-tabs">
                {productDescLexicon.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={descLexCat === c.key ? "pd-desc-tab on" : "pd-desc-tab"}
                    onClick={() => setDescLexCat(c.key)}
                  >
                    {c.key}
                  </button>
                ))}
              </div>
              <div className="pd-desc-tags">
                {(productDescLexicon.find((c) => c.key === descLexCat)?.items || []).map((it) => {
                  const on = descParts().includes(it.tag);
                  return (
                    <button
                      key={it.tag}
                      type="button"
                      className={on ? "pd-desc-tag on" : "pd-desc-tag"}
                      onClick={() => toggleDescTag(it.tag)}
                    >
                      {it.tag}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="field">
          <div className="ws-label">出图尺寸</div>
          <Dropdown
            title="出图尺寸"
            options={sizeOpts}
            value={state.size}
            onChange={(o) => set("size", o.name)}
            showSub
          />
          {state.size === "自定义" && (
            <div className="custom-size">
              <input type="number" className="cs-input" min={64} placeholder="宽" value={state.customW} onChange={(e) => set("customW", e.target.value)} />
              <span className="cs-unit">px</span>
              <span className="cs-colon">:</span>
              <input type="number" className="cs-input" min={64} placeholder="高" value={state.customH} onChange={(e) => set("customH", e.target.value)} />
              <span className="cs-unit">px</span>
            </div>
          )}
        </div>

        {showCount && (
          <div className="field">
            <div className="ws-label">生成数量</div>
            <div className="seg">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className={state.count === n ? "seg-item on" : "seg-item"} onClick={() => set("count", n)}>
                  {n}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="ws-foot">
        <div className="pd-gen-hint">{aiSceneLabel || "商拍"} · {genCountHint}</div>
        <button className="btn btn-primary btn-block" disabled={loading} onClick={onGenerate}>
          {loading ? (
            <><Icon name="refresh" size={16} className="ico-spin" /> 生成中…</>
          ) : (
            <><Icon name="sparkle" size={16} /> 立即出图</>
          )}
        </button>
      </div>
    </>
  );
}
