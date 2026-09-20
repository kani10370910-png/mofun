"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import {
  DEFAULT_LORA_IDS,
  getRegionPack,
} from "@/data/regionAssets";
import { useAuth } from "@/lib/AuthContext";
import { accountRegionId } from "@/lib/regionEnhance";
import { asset } from "@/lib/asset";

type DetailKind = "lora" | "kb";

function RegionDetailModal({
  kind,
  onClose,
}: {
  kind: DetailKind;
  onClose: () => void;
}) {
  const isLora = kind === "lora";
  const title = isLora ? "Lora" : "知识库";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const node = (
    <div className="re-overlay" role="dialog" aria-modal="true" aria-labelledby="re-detail-title">
      <button type="button" className="re-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="re-card re-card-wide">
        <div className="re-card-head">
          <h3 id="re-detail-title">{title}</h3>
          <button type="button" className="re-close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="re-card-body">
          {isLora ? (
            <section className="re-diff-block">
              <div className="re-diff-head">
                <span className="re-diff-tag re-diff-tag-lora">Lora</span>
                <h4>本地物产形态更准</h4>
              </div>
              <p className="re-diff-lead">
                同一描述「生成甲鱼」：未开 Lora 可能被画成硬壳「乌龟」；挂载本地 Lora 后，能够按甲鱼软壳形态正确出图。
              </p>
              <div className="re-diff-visual">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="re-diff-img"
                  src={asset("/region-enhance/compare-lora.png")}
                  alt="Lora 对比：未开生成像乌龟，开启后正确生成甲鱼"
                  loading="lazy"
                />
                <div className="re-diff-caps" aria-hidden>
                  <span>未开 Lora · 可能识别为乌龟</span>
                  <span>开启 Lora · 正确生成甲鱼</span>
                </div>
              </div>
              <ul className="re-diff-points">
                <li>强化本地物产、物种在画面上的正确形态</li>
                <li>减少「名不符实」（如甲鱼被画成乌龟）</li>
                <li>仅部分出图模型支持（如区域文化大模型）</li>
              </ul>
              <div className="re-diff-tip">
                <strong>说明：</strong>
                Lora 确保物产形态准确，要图片，文案等是否是本地特色，请开启知识库。
              </div>
            </section>
          ) : (
            <section className="re-diff-block">
              <div className="re-diff-head">
                <span className="re-diff-tag re-diff-tag-kb">知识库</span>
                <h4>画面元素全面本地化</h4>
              </div>
              <p className="re-diff-lead">
                未开启知识库时，茶叶品类、建筑风貌、场景氛围等通常是按照随机地区生成；开启后，描述内容会注入本地知识，生成图片的物产、建筑、背景等都会按照本地元素生成。
              </p>
              <div className="re-diff-visual">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="re-diff-img"
                  src={asset("/region-enhance/compare-kb.png")}
                  alt="知识库对比：未开为非本地元素，开启后全部为本地元素"
                  loading="lazy"
                />
                <div className="re-diff-caps" aria-hidden>
                  <span>未开 · 元素与本地无关</span>
                  <span>开启 · 元素均为本地相关</span>
                </div>
              </div>
              <ul className="re-diff-points">
                <li>茶叶等物产：从泛化的各地品类 → 本地特产形态与描述</li>
                <li>建筑与场景：从非本地风貌 → 本地街景、竹海、茶园等本地符号</li>
                <li>文案/脚本/出图提示均可引用知识库</li>
              </ul>
              <div className="re-diff-tip">
                <strong>说明：</strong>
                知识库确保生成为本地内容，物产形态准确（如甲鱼别画成乌龟），请开启 Lora。
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

function SwitchRow({
  label,
  hint,
  enabled,
  onChange,
  onDetail,
  disabled,
  disabledHint,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  onChange: (next: boolean) => void;
  onDetail: () => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <div className={`re-row${disabled ? " is-disabled" : ""}${enabled && !disabled ? "" : " is-off"}`}>
      <div className="re-row-main">
        <span className="re-row-label">{label}</span>
        <p className="re-row-hint">{disabled ? disabledHint || hint : hint}</p>
      </div>
      <div className="re-row-side">
        <label
          className="re-switch"
          title={disabled ? disabledHint || "当前不可用" : enabled ? `关闭${label}` : `开启${label}`}
        >
          <input
            type="checkbox"
            checked={enabled && !disabled}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            aria-label={`${label}开关`}
          />
          <span className="re-switch-track" />
        </label>
        <button
          type="button"
          className="re-detail-btn"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDetail();
          }}
        >
          详情
        </button>
      </div>
    </div>
  );
}

/** 左栏：仅知识库开关行（无「本地增强」标题 / 区县 pill / 企业说明） */
export function RegionEnhanceStrip({
  useLora: _useLora,
  onLoraChange: _onLoraChange,
  useKB,
  onKBChange,
  /** @deprecated 兼容旧单开关：现仅控制知识库 */
  enabled,
  onChange,
  loraIds: _loraIds = DEFAULT_LORA_IDS,
  onLoraIdsChange: _onLoraIdsChange,
  strengths: _strengths = {},
  onStrengthChange: _onStrengthChange,
  regionId: _regionId,
  /** @deprecated Lora 已移至模型下拉下方，此 prop 忽略 */
  showLora: _showLora = false,
  kbOnHint,
  kbOffHint,
}: {
  useLora?: boolean;
  onLoraChange?: (next: boolean) => void;
  useKB?: boolean;
  onKBChange?: (next: boolean) => void;
  enabled?: boolean;
  onChange?: (next: boolean) => void;
  loraIds?: string[];
  onLoraIdsChange?: (ids: string[]) => void;
  strengths?: Record<string, number>;
  onStrengthChange?: (id: string, v: number) => void;
  regionId?: string;
  showLora?: boolean;
  /** 开启时提示文案（默认：将引用本地知识库） */
  kbOnHint?: string;
  /** 关闭时提示文案 */
  kbOffHint?: string;
}) {
  const [detailKind, setDetailKind] = useState<DetailKind | null>(null);
  const legacy = onChange != null && onKBChange == null;
  const kbOn = useKB ?? enabled ?? true;

  function setKB(next: boolean) {
    if (onKBChange) onKBChange(next);
    else if (legacy) onChange?.(next);
  }

  return (
    <>
      <div className={`re-strip re-strip-kb-only${kbOn ? "" : " is-off"}`}>
        <div className="re-rows">
          <SwitchRow
            label="知识库"
            hint={kbOn ? (kbOnHint ?? "将引用本地知识库") : (kbOffHint ?? "本次不引用本地知识库")}
            enabled={kbOn}
            onChange={setKB}
            onDetail={() => setDetailKind("kb")}
          />
        </div>
      </div>
      {detailKind && (
        <RegionDetailModal
          kind={detailKind}
          onClose={() => setDetailKind(null)}
        />
      )}
    </>
  );
}

/** 生图模型下方：仅当前模型支持本地 Lora 时显示开关 */
export function ModelLoraSwitch({
  enabled,
  onChange,
  visible,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
  /** 选中 MoFun区域文化大模型等支持 Lora 的模型时为 true */
  visible: boolean;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  if (!visible) return null;
  return (
    <>
      <div className={`re-model-lora${enabled ? "" : " is-off"}`}>
        <div className="re-model-lora-main">
          <span className="re-model-lora-label">挂载本地 Lora</span>
          <p className="re-model-lora-hint">
            {enabled ? "将应用本地风格模型Lora" : "本次不引用本地Lora"}
          </p>
        </div>
        <div className="re-model-lora-side">
          <label className="re-switch" title={enabled ? "关闭 Lora" : "开启 Lora"}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onChange(e.target.checked)}
              aria-label="Lora开关"
            />
            <span className="re-switch-track" />
          </label>
          <button type="button" className="re-detail-btn" onClick={() => setDetailOpen(true)}>
            详情
          </button>
        </div>
      </div>
      {detailOpen && (
        <RegionDetailModal kind="lora" onClose={() => setDetailOpen(false)} />
      )}
    </>
  );
}

/** 历史结果角标，点击打开对应详情（两项都开时优先 Lora） */
export function RegionEnhanceBadge({
  regionId,
  loraIds,
  useLora,
  useKB,
}: {
  regionId?: string;
  loraIds?: string[];
  useLora?: boolean;
  useKB?: boolean;
}) {
  const { user } = useAuth();
  const pack = getRegionPack(regionId || accountRegionId(user));
  const [detailKind, setDetailKind] = useState<DetailKind | null>(null);

  const parts: string[] = [];
  if (useLora) parts.push("Lora");
  if (useKB) parts.push("知识库");
  if (!parts.length) return null;
  const tag = parts.join("+");

  function openDetail() {
    if (useLora) setDetailKind("lora");
    else if (useKB) setDetailKind("kb");
    else setDetailKind("kb");
  }

  return (
    <>
      <button
        type="button"
        className="re-badge"
        title="查看本地增强详情"
        onClick={openDetail}
      >
        {tag} · {pack.regionName}
      </button>
      {detailKind && (
        <RegionDetailModal
          kind={detailKind}
          onClose={() => setDetailKind(null)}
        />
      )}
    </>
  );
}
