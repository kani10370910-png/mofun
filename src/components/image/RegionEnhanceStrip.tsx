"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  DEFAULT_LORA_IDS,
  getLorasByIds,
  getRegionPack,
  type RegionAssetPack,
} from "@/data/regionAssets";
import { useAuth } from "@/lib/AuthContext";
import { accountRegionId } from "@/lib/regionEnhance";

function RegionDetailModal({
  pack,
  regionLabel,
  onClose,
}: {
  pack: RegionAssetPack;
  regionLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="re-overlay" role="dialog" aria-modal="true" aria-labelledby="re-detail-title">
      <button type="button" className="re-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="re-card">
        <div className="re-card-head">
          <h3 id="re-detail-title">县域增强 · {regionLabel}</h3>
          <button type="button" className="re-close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="re-card-body">
          <p className="re-compare-intro">
            开启后，系统会在生成时注入该县域的视觉特征与表达偏好；关闭则只通用模型生成。
          </p>
          <div className="re-compare-grid">
            <section className="re-compare-card re-compare-card-on">
              <h4>使用县域增强</h4>
              <ul>
                <li>更突出「{regionLabel}」在地风貌与色彩</li>
                <li>优先贴近本地产业与文化符号</li>
                <li>适合本地活动海报、特产宣传、文旅主视觉</li>
              </ul>
            </section>
            <section className="re-compare-card">
              <h4>未使用县域增强</h4>
              <ul>
                <li>画面偏通用，县域辨识度较弱</li>
                <li>文案与元素偏“泛行业”表达</li>
                <li>只适合常规素材需求</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 左栏能力条：县域增强开关 + 状态 */
export function RegionEnhanceStrip({
  enabled,
  onChange,
  loraIds: _loraIds = DEFAULT_LORA_IDS,
  onLoraIdsChange: _onLoraIdsChange,
  strengths: _strengths = {},
  onStrengthChange: _onStrengthChange,
  regionId,
  showLora = false,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
  loraIds?: string[];
  onLoraIdsChange?: (ids: string[]) => void;
  strengths?: Record<string, number>;
  onStrengthChange?: (id: string, v: number) => void;
  regionId?: string;
  /** 当前调用模型支持县域 Lora 时展示 Lora 提示 */
  showLora?: boolean;
}) {
  const { user } = useAuth();
  const pack = getRegionPack(regionId || accountRegionId(user));
  const regionLabel = pack.regionName;
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className={`re-strip${enabled ? "" : " is-off"}`}>
        <div className="re-strip-top">
          <div className="re-strip-title">
            <span>县域增强</span>
            <span className="re-region-pill">{regionLabel}</span>
          </div>
          <div className="re-strip-acts">
            <label className="re-switch" title={enabled ? "关闭县域增强" : "开启县域增强"}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => onChange(e.target.checked)}
                aria-label="县域增强开关"
              />
              <span className="re-switch-track" />
            </label>
            <button type="button" className="re-detail-btn" onClick={() => setOpen(true)}>
              详情
            </button>
          </div>
        </div>
        {!enabled && <p className="re-off-hint">本次生成将不使用县域 Lora 与知识库</p>}
        {enabled && showLora && <p className="re-off-hint">将应用县域 Lora 与知识库</p>}
        {enabled && !showLora && <p className="re-off-hint">当前模型已引用县域知识库</p>}
      </div>
      {open && (
        <RegionDetailModal
          pack={pack}
          regionLabel={regionLabel}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** 历史结果角标，点击打开同一详情 */
export function RegionEnhanceBadge({
  regionId,
  loraIds,
}: {
  regionId?: string;
  loraIds?: string[];
}) {
  const { user } = useAuth();
  const pack = getRegionPack(regionId || accountRegionId(user));
  const selected = getLorasByIds(loraIds?.length ? loraIds : DEFAULT_LORA_IDS);
  const regionLabel = selected[0]?.regionName || pack.regionName;
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="re-badge"
        title="查看县域增强详情"
        onClick={() => setOpen(true)}
      >
        县域增强 · {pack.regionName}
      </button>
      {open && (
        <RegionDetailModal
          pack={pack}
          regionLabel={regionLabel}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
