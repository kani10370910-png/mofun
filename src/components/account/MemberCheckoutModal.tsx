"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { isCurrentPlan, isFreePlan, type MemberPlan, type PointPack, type PointsWallet } from "@/lib/points";

function planYuan(plan: MemberPlan) {
  if (typeof plan.priceYuan === "number") return plan.priceYuan;
  const n = Number(String(plan.priceLabel || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function yuanText(n: number) {
  return Number.isInteger(n) ? String(n) : String(n);
}

function formatRange(days: number) {
  const start = new Date();
  const end = new Date();
  const span = days > 0 ? days : 365;
  end.setDate(end.getDate() + span);
  const f = (d: Date) =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  return `${f(start)} ～ ${f(end)}`;
}

function periodHint(plan: MemberPlan) {
  if (plan.priceNote) return plan.priceNote;
  if (plan.days >= 360 && planYuan(plan) > 0) return `约${yuanText(Math.round((planYuan(plan) / 12) * 10) / 10)}元/月`;
  if (plan.days >= 80 && planYuan(plan) > 0) return `约${yuanText(Math.round((planYuan(plan) / 3) * 10) / 10)}元/月`;
  return plan.description || "";
}

function pointsLine(plan: MemberPlan) {
  if (!plan.grantPoints) return "";
  if (plan.days === 30) return `每月${plan.grantPoints}算力`;
  if (plan.days >= 360) return `年算力 ${plan.grantPoints}`;
  return `周期算力 ${plan.grantPoints}`;
}

function PayQr({ seed }: { seed: string }) {
  const cells = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) >>> 0;
    const n = 21;
    const grid: boolean[] = [];
    for (let i = 0; i < n * n; i++) {
      h = (h * 1664525 + 1013904223) >>> 0;
      const x = i % n;
      const y = Math.floor(i / n);
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      grid.push(finder ? x === 0 || x === 6 || y === 0 || y === 6 || (x > 1 && x < 5 && y > 1 && y < 5) : h % 3 === 0);
    }
    return { n, grid };
  }, [seed]);

  return (
    <svg className="am-pay-qr" viewBox={`0 0 ${cells.n} ${cells.n}`} aria-hidden>
      {cells.grid.map((on, i) =>
        on ? <rect key={i} x={i % cells.n} y={Math.floor(i / cells.n)} width="1" height="1" fill="#1a1f1d" /> : null,
      )}
    </svg>
  );
}

export function MemberCheckoutModal({
  openPlanId,
  plans,
  wallet,
  paying,
  onClose,
  onPay,
}: {
  openPlanId: string;
  plans: MemberPlan[];
  wallet: PointsWallet;
  paying?: boolean;
  onClose: () => void;
  onPay: (planId: string) => void;
}) {
  const opened = plans.find((p) => p.id === openPlanId);
  const options = plans.filter((p) => opened && p.tierId === opened.tierId && !isFreePlan(p));
  const [pickedId, setPickedId] = useState(openPlanId);
  const [payWay, setPayWay] = useState<"wechat" | "alipay">("wechat");

  const picked = options.find((p) => p.id === pickedId) || opened;
  if (!opened || !picked) return null;

  const current = isCurrentPlan(wallet, picked, plans);
  const amount = planYuan(picked);

  return (
    <div className="am-pay-overlay" role="dialog" aria-modal="true" aria-label="开通会员">
      <button type="button" className="am-cs-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="am-pay-card">
        <div className="am-pay-head">
          <h2>开通会员</h2>
          <button type="button" className="am-pay-close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="am-pay-plans">
          {options.map((plan) => {
            const on = plan.id === picked.id;
            const mine = isCurrentPlan(wallet, plan, plans);
            return (
              <article
                key={plan.id}
                className={`am-pay-plan${on ? " on" : ""}`}
                onClick={() => setPickedId(plan.id)}
              >
                {plan.highlight && !mine ? <span className="am-pay-plan-tag">推荐</span> : null}
                <h3>{plan.name}</h3>
                <div className="am-pay-plan-price">
                  <em>{yuanText(planYuan(plan))}</em>
                  {plan.periodLabel ? <span>{plan.periodLabel}</span> : null}
                </div>
                {periodHint(plan) ? <p className="am-pay-plan-sub">{periodHint(plan)}</p> : null}
                {pointsLine(plan) ? <p className="am-pay-plan-pts">{pointsLine(plan)}</p> : null}
                <span className={`am-pay-plan-btn${on ? " is-on" : ""}`}>
                  {mine ? "当前版本" : on ? "已选择" : "选择此方案"}
                </span>
              </article>
            );
          })}
        </div>

        <div className="am-pay-body">
          <div className="am-pay-order">
            <h4>订单详情</h4>
            <div className="am-pay-row">
              <span>当前选择</span>
              <b>{picked.name}</b>
            </div>
            <div className="am-pay-row">
              <span>服务有效期</span>
              <b>{formatRange(picked.days)}</b>
            </div>
            <div className="am-pay-amount">
              <span>实付金额</span>
              <strong>¥ {yuanText(amount)}</strong>
            </div>
          </div>

          <div className="am-pay-box">
            <div className="am-pay-ways">
              <button
                type="button"
                className={payWay === "wechat" ? "on wechat" : "wechat"}
                onClick={() => setPayWay("wechat")}
              >
                微信
              </button>
              <button
                type="button"
                className={payWay === "alipay" ? "on alipay" : "alipay"}
                onClick={() => setPayWay("alipay")}
              >
                支付宝
              </button>
            </div>
            <button
              type="button"
              className="am-pay-qr-wrap"
              disabled={current || paying}
              onClick={() => {
                if (current || paying) return;
                onPay(picked.id);
              }}
              aria-label="扫码支付"
            >
              <PayQr seed={`${picked.id}-${payWay}-${amount}`} />
            </button>
            <p className="am-pay-scan">{current ? "当前已是该版本" : paying ? "开通中…" : "扫码支付，立即生效"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function packYuan(pack: PointPack) {
  if (typeof pack.priceYuan === "number") return pack.priceYuan;
  const n = Number(String(pack.priceLabel || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function PackCheckoutModal({
  openPackId,
  packs,
  paying,
  onClose,
  onPay,
}: {
  openPackId: string;
  packs: PointPack[];
  paying?: boolean;
  onClose: () => void;
  onPay: (packId: string) => void;
}) {
  const opened = packs.find((p) => p.id === openPackId);
  const options = packs.filter((p) => opened && (p.kind || "personal") === (opened.kind || "personal"));
  const [pickedId, setPickedId] = useState(openPackId);
  const [payWay, setPayWay] = useState<"wechat" | "alipay">("wechat");

  const picked = options.find((p) => p.id === pickedId) || opened;
  if (!opened || !picked) return null;

  const amount = packYuan(picked);
  const days = picked.validDays && picked.validDays > 0 ? picked.validDays : 730;
  const freePack = amount <= 0;

  return (
    <div className="am-pay-overlay" role="dialog" aria-modal="true" aria-label="购买算力">
      <button type="button" className="am-cs-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="am-pay-card">
        <div className="am-pay-head">
          <h2>购买算力</h2>
          <button type="button" className="am-pay-close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="am-pay-plans">
          {options.map((pack) => {
            const on = pack.id === picked.id;
            return (
              <article
                key={pack.id}
                className={`am-pay-plan${on ? " on" : ""}`}
                onClick={() => setPickedId(pack.id)}
              >
                {pack.tag ? <span className="am-pay-plan-tag">{pack.tag}</span> : null}
                <h3>{pack.name}</h3>
                <div className="am-pay-plan-price">
                  <em>{yuanText(packYuan(pack))}</em>
                </div>
                <p className="am-pay-plan-pts">{pack.points.toLocaleString()}算力</p>
                {pack.validNote ? <p className="am-pay-plan-sub">{pack.validNote}</p> : null}
                <span className={`am-pay-plan-btn${on ? " is-on" : ""}`}>{on ? "已选择" : "选择此方案"}</span>
              </article>
            );
          })}
        </div>

        <div className="am-pay-body">
          <div className="am-pay-order">
            <h4>订单详情</h4>
            <div className="am-pay-row">
              <span>当前选择</span>
              <b>{picked.name}</b>
            </div>
            <div className="am-pay-row">
              <span>到账算力</span>
              <b>{picked.points.toLocaleString()} 算力</b>
            </div>
            <div className="am-pay-row">
              <span>充值有效期</span>
              <b>{formatRange(days)}</b>
            </div>
            <div className="am-pay-amount">
              <span>实付金额</span>
              <strong>¥ {yuanText(amount)}</strong>
            </div>
          </div>

          <div className="am-pay-box">
            <div className="am-pay-ways">
              <button
                type="button"
                className={payWay === "wechat" ? "on wechat" : "wechat"}
                onClick={() => setPayWay("wechat")}
              >
                微信
              </button>
              <button
                type="button"
                className={payWay === "alipay" ? "on alipay" : "alipay"}
                onClick={() => setPayWay("alipay")}
              >
                支付宝
              </button>
            </div>
            <button
              type="button"
              className="am-pay-qr-wrap"
              disabled={paying}
              onClick={() => {
                if (paying) return;
                onPay(picked.id);
              }}
              aria-label="扫码支付"
            >
              <PayQr seed={`${picked.id}-${payWay}-${amount}`} />
            </button>
            <p className="am-pay-scan">
              {paying ? "支付中…" : freePack ? "确认后立即入账" : "扫码支付，立即到账"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
