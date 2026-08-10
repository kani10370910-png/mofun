"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import {
  DEFAULT_LORA_IDS,
  getRegionPack,
} from "@/data/regionAssets";
import { useAuth } from "@/lib/AuthContext";
import { hasEnterpriseInfo } from "@/lib/auth";
import { accountCityRegionLabel, accountRegionId } from "@/lib/regionEnhance";
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
                同一提示词「生成甲鱼」：未开 Lora 常被画成硬壳「乌龟」；挂载本地 Lora 后，才按甲鱼软壳形态正确出图。
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
                  <span>未开 Lora · 易识别成乌龟</span>
                  <span>开启 Lora · 正确生成甲鱼</span>
                </div>
              </div>
              <ul className="re-diff-points">
                <li>强化本地物产、物种在画面上的正确形态</li>
                <li>减少「名实不符」（如甲鱼被画成乌龟）</li>
                <li>仅部分出图模型支持（如区域文化大模型）</li>
              </ul>
              <div className="re-diff-tip">
                <strong>说明：</strong>
                Lora 管「画得对不对、像不像本地物产」。要文案/地标等在地说法，请用知识库。
              </div>
            </section>
          ) : (
            <section className="re-diff-block">
              <div className="re-diff-head">
                <span className="re-diff-tag re-diff-tag-kb">知识库</span>
                <h4>画面元素全面本地化</h4>
              </div>
              <p className="re-diff-lead">
                未开知识库时，茶叶品类、建筑风貌、场景氛围常是「通用/非本地」样子；开启后，提示会注入本地知识，生成图里的物产、建筑、背景等元素都会往本地靠。
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
                  <span>未开 · 非本地茶叶与建筑</span>
                  <span>开启 · 元素均为本地相关</span>
                </div>
              </div>
              <ul className="re-diff-points">
                <li>茶叶等物产：从泛化/外地品类 → 本地特产形态与说法</li>
                <li>建筑与场景：从非本地风貌 → 本地街景、竹海、茶园等在地符号</li>
                <li>文案/脚本/出图提示均可引用知识库，不依赖是否挂载 Lora</li>
              </ul>
              <div className="re-diff-tip">
                <strong>说明：</strong>
                知识库管「画什么本地内容」。要物产形态更准（如甲鱼别画成乌龟），请用 Lora。
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
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
        <button type="button" className="re-detail-btn" onClick={onDetail}>
          详情
        </button>
      </div>
    </div>
  );
}

/** 左栏能力条：本地增强 = Lora + 知识库（可分别开关） */
export function RegionEnhanceStrip({
  useLora,
  onLoraChange,
  useKB,
  onKBChange,
  /** @deprecated 兼容旧单开关：同步控制 Lora+知识库 */
  enabled,
  onChange,
  loraIds: _loraIds = DEFAULT_LORA_IDS,
  onLoraIdsChange: _onLoraIdsChange,
  strengths: _strengths = {},
  onStrengthChange: _onStrengthChange,
  regionId,
  showLora = false,
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
  /** 当前调用模型支持本地 Lora 时允许操作 Lora 开关 */
  showLora?: boolean;
}) {
  const { user } = useAuth();
  const effectiveRegion = regionId || accountRegionId(user);
  const pack = getRegionPack(effectiveRegion);
  const regionLabel = pack.regionName;
  const isEnterprise = hasEnterpriseInfo(user);
  const cityLabel = isEnterprise ? accountCityRegionLabel(user) : regionLabel;
  const [detailKind, setDetailKind] = useState<DetailKind | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const legacy = onChange != null && onLoraChange == null && onKBChange == null;
  const loraOn = useLora ?? enabled ?? true;
  const kbOn = useKB ?? enabled ?? true;
  const anyOn = (showLora && loraOn) || kbOn;

  const summaryParts: string[] = [];
  if (showLora && loraOn) summaryParts.push("Lora");
  if (kbOn) summaryParts.push("知识库");
  const summary = summaryParts.length ? summaryParts.join(" · ") : "未开启";

  // 展开后点击面板外任意处（成图类型、模型、立即生成等）自动收起；详情弹层内点击不收起
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (rootRef.current?.contains(t)) return;
      if (t instanceof Element && t.closest(".re-overlay")) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function setLora(next: boolean) {
    if (onLoraChange) onLoraChange(next);
    else if (legacy) onChange?.(next || kbOn);
  }

  function setKB(next: boolean) {
    if (onKBChange) onKBChange(next);
    else if (legacy) onChange?.(loraOn || next);
  }

  return (
    <>
      <div
        ref={rootRef}
        className={`re-strip${anyOn ? "" : " is-off"}${open ? " is-open" : ""}`}
      >
        <div className="re-strip-top">
          <div className="re-strip-title">
            <span>本地增强</span>
            <span className="re-region-pill" title={isEnterprise ? `企业所属市：${cityLabel}` : undefined}>
              {isEnterprise ? `${cityLabel}市` : regionLabel}
            </span>
            {!open && <span className="re-strip-summary">{summary}</span>}
          </div>
          <button
            type="button"
            className="re-drop-btn"
            aria-expanded={open}
            aria-label={open ? "收起本地增强选项" : "展开本地增强选项"}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name="chevron" size={14} />
          </button>
        </div>
        {open && (
          <div className="re-rows">
            {isEnterprise && (
              <p className="re-city-scope-hint">
                企业账号仅可调用「{cityLabel}市」及下辖区县的知识库与 Lora；当前成员单元匹配「{regionLabel}」。
              </p>
            )}
            {showLora && (
              <SwitchRow
                label="Lora"
                hint={loraOn ? "将应用本地风格模型" : "本次不挂载本地 Lora"}
                enabled={loraOn}
                onChange={setLora}
                onDetail={() => setDetailKind("lora")}
              />
            )}
            <SwitchRow
              label="知识库"
              hint={kbOn ? "将引用本地知识库" : "本次不引用本地知识库"}
              enabled={kbOn}
              onChange={setKB}
              onDetail={() => setDetailKind("kb")}
            />
          </div>
        )}
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
  const tag = parts.length ? parts.join("+") : "本地增强";

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
