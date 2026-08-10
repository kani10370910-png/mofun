"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/AuthContext";
import { hasEnterpriseInfo } from "@/lib/auth";
import {
  claimEarnTask,
  EARN_TASKS,
  loadPointsWallet,
  MEMBER_PLANS,
  POINT_PACKS,
  purchasePlan,
  purchasePointPack,
  pointsToAuthPatch,
  tierLabel,
  totalPoints,
  type MemberPlan,
  type MembershipShopMode,
  type PointsSubTab,
  type PointsWallet,
} from "@/lib/points";

function kindLabel(kind: PointsWallet["ledger"][number]["kind"]) {
  switch (kind) {
    case "earn":
      return "获取";
    case "spend":
      return "消耗";
    case "gift":
      return "赠送";
    case "recharge":
      return "充值";
    case "expire":
      return "过期";
    default:
      return kind;
  }
}

function todayLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function MemberPlanCard({
  plan,
  wallet,
  onPurchase,
}: {
  plan: MemberPlan;
  wallet: PointsWallet;
  onPurchase: (planId: string) => void;
}) {
  const isFreeCurrent = plan.id === "free" && wallet.tierId === "free";
  const isCurrentPaid = plan.id !== "free" && wallet.tierId === plan.tierId;

  return (
    <article
      className={`am-mcenter-plan${plan.highlight ? " hot" : ""}${isFreeCurrent || isCurrentPaid ? " current" : ""}`}
    >
      {plan.highlight && <span className="am-mcenter-plan-tag">推荐</span>}
      <div className="am-mcenter-plan-head">
        <h3>{plan.name}</h3>
        {plan.description ? <p className="am-mcenter-plan-desc">{plan.description}</p> : null}
      </div>
      <div className="am-mcenter-plan-price">
        <strong>{plan.priceLabel}</strong>
        {plan.periodLabel ? <span>{plan.periodLabel}</span> : null}
        {plan.originalPriceLabel ? (
          <span className="am-mcenter-plan-origin">{plan.originalPriceLabel}</span>
        ) : null}
      </div>
      {plan.priceNote ? <p className="am-mcenter-plan-note">{plan.priceNote}</p> : null}
      {plan.pointsBadge ? (
        <div className="am-mcenter-points-badge">
          <div>
            <strong>{plan.pointsBadge}</strong>
            {plan.pointsBadgeNote ? <span>{plan.pointsBadgeNote}</span> : null}
          </div>
        </div>
      ) : null}
      <ul>
        {plan.perks.map((perk) => (
          <li key={perk.text} className={perk.included ? "" : "off"}>
            <Icon name={perk.included ? "check" : "close"} size={14} />
            {perk.text}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={`am-mcenter-plan-btn${plan.id === "free" ? " is-muted" : ""}${plan.highlight ? " is-primary" : ""}`}
        disabled={plan.id === "free"}
        onClick={() => onPurchase(plan.id)}
      >
        {plan.id === "free"
          ? isFreeCurrent
            ? "当前方案"
            : "免费体验"
          : isCurrentPaid
            ? "续费 / 再次开通"
            : "立即开通"}
      </button>
    </article>
  );
}

export function MembershipPanel({
  initialSub = "membershipCard",
}: {
  initialSub?: PointsSubTab;
}) {
  const toast = useToast();
  const { user, updateUser } = useAuth();
  const [sub, setSub] = useState<PointsSubTab>(initialSub);
  const [shopMode, setShopMode] = useState<MembershipShopMode>("buyMember");
  const [wallet, setWallet] = useState<PointsWallet | null>(null);

  const syncAuth = useCallback(
    (w: PointsWallet) => {
      updateUser(pointsToAuthPatch(w));
    },
    [updateUser]
  );

  useEffect(() => {
    if (!user?.userId) return;
    const w = loadPointsWallet(user.userId, {
      enterprise: hasEnterpriseInfo(user),
    });
    setWallet(w);
    const patch = pointsToAuthPatch(w);
    if (
      user.computeBenefit !== patch.computeBenefit ||
      user.computeGift !== patch.computeGift ||
      user.expiresAt !== patch.expiresAt
    ) {
      updateUser(patch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId]);

  if (!user || !wallet) return null;

  const total = totalPoints(wallet);
  const checkedIn = wallet.lastCheckInDate === todayLocal();
  const primaryPlans = MEMBER_PLANS.filter((p) => p.shopGroup === "primary");

  function handlePurchasePlan(planId: string) {
    const res = purchasePlan(wallet!, planId);
    if (!res.ok) {
      toast(res.message, "warn");
      return;
    }
    setWallet(res.wallet);
    syncAuth(res.wallet);
    toast(res.message);
  }

  function handlePurchasePack(packId: string) {
    const res = purchasePointPack(wallet!, packId);
    if (!res.ok) {
      toast(res.message, "warn");
      return;
    }
    setWallet(res.wallet);
    syncAuth(res.wallet);
    toast(res.message);
  }

  return (
    <div className="am-panel am-panel-wide am-mcenter">
      <div className="am-mcenter-head">
        <h1 className="am-title">会员中心</h1>
        <p className="am-mcenter-lead">
          会员套餐发放权益算力，日常任务领取赠送算力；生成功能按次消耗算力。
        </p>
      </div>

      <section className="am-mcenter-hero">
        <div className="am-mcenter-hero-main">
          <div className="am-mcenter-tier">
            <Icon name="sparkle" size={16} />
            <span>{tierLabel(wallet.tierId)}</span>
          </div>
          <div className="am-mcenter-balance">
            <span className="am-mcenter-balance-label">可用算力</span>
            <strong className="am-mcenter-balance-num">{total >= 999_999 ? "∞" : total}</strong>
          </div>
          <div className="am-mcenter-split">
            <div>
              <span>权益算力</span>
              <b>{wallet.benefitPoints >= 999_999 ? "∞" : wallet.benefitPoints}</b>
            </div>
            <div>
              <span>赠送算力</span>
              <b>{wallet.giftPoints}</b>
            </div>
            <div>
              <span>到期时间</span>
              <b className="am-mcenter-exp">{wallet.membershipExpiresAt}</b>
            </div>
          </div>
        </div>
        <div className="am-mcenter-hero-side">
          <p className="am-mcenter-hero-note">
            算力优先消耗赠送额度，再扣权益算力（演示规则）。开通会员后权益同步到右上角账户弹层。
          </p>
          <button type="button" className="am-mcenter-cta" onClick={() => setSub("earnPoints")}>
            去获取算力
          </button>
        </div>
      </section>

      <div className="am-mcenter-tabs" role="tablist">
        {(
          [
            ["membershipCard", "会员卡"],
            ["pointsLedger", "算力明细"],
            ["earnPoints", "获取算力"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={sub === key}
            className={sub === key ? "am-mcenter-tab on" : "am-mcenter-tab"}
            onClick={() => setSub(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {sub === "membershipCard" && (
        <div className="am-mcenter-shop">
          <div className="am-mcenter-shop-switch" role="tablist" aria-label="会员卡购买方式">
            <button
              type="button"
              role="tab"
              aria-selected={shopMode === "buyMember"}
              className={shopMode === "buyMember" ? "on" : ""}
              onClick={() => setShopMode("buyMember")}
            >
              购买会员
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={shopMode === "buyPoints"}
              className={shopMode === "buyPoints" ? "on" : ""}
              onClick={() => setShopMode("buyPoints")}
            >
              购买算力
            </button>
          </div>

          {shopMode === "buyMember" ? (
            <>
              <div className="am-mcenter-plans am-mcenter-plans--primary">
                {primaryPlans.map((plan) => (
                  <MemberPlanCard
                    key={plan.id}
                    plan={plan}
                    wallet={wallet}
                    onPurchase={handlePurchasePlan}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="am-mcenter-packs">
                {POINT_PACKS.map((pack) => (
                  <article key={pack.id} className="am-mcenter-pack">
                    {pack.tag ? <span className="am-mcenter-pack-tag">{pack.tag}</span> : null}
                    <h3>{pack.name}</h3>
                    <div className="am-mcenter-pack-price">{pack.priceLabel}</div>
                    <div className="am-mcenter-points-badge is-compact">
                      <strong>{pack.points.toLocaleString()}算力</strong>
                    </div>
                    <button
                      type="button"
                      className="am-mcenter-pack-btn"
                      onClick={() => handlePurchasePack(pack.id)}
                    >
                      立即购买
                    </button>
                    <p className="am-mcenter-pack-note">{pack.validNote}</p>
                  </article>
                ))}
              </div>
              <button
                type="button"
                className="am-mcenter-redeem"
                onClick={() => toast("算力兑换码功能演示中", "warn")}
              >
                算力兑换码
              </button>
            </>
          )}
        </div>
      )}

      {sub === "pointsLedger" && (
        <div className="am-mcenter-ledger">
          {wallet.ledger.length === 0 ? (
            <p className="am-mcenter-empty">暂无算力流水</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>类型</th>
                  <th>说明</th>
                  <th>变动</th>
                </tr>
              </thead>
              <tbody>
                {wallet.ledger.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{row.at}</td>
                    <td>
                      <span className={`am-mcenter-kind ${row.kind}`}>{kindLabel(row.kind)}</span>
                    </td>
                    <td>
                      <div className="am-mcenter-ledger-title">{row.title}</div>
                      {row.detail ? <div className="am-mcenter-ledger-detail">{row.detail}</div> : null}
                    </td>
                    <td className={row.amount >= 0 ? "plus" : "minus"}>
                      {row.amount >= 0 ? `+${row.amount}` : row.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {sub === "earnPoints" && (
        <div className="am-mcenter-earn">
          {EARN_TASKS.map((task) => (
            <div key={task.id} className="am-mcenter-earn-row">
              <div className="am-mcenter-earn-ico">
                <Icon name={task.points >= 0 ? "sparkle" : "history"} size={18} />
              </div>
              <div className="am-mcenter-earn-meta">
                <div className="am-mcenter-earn-title">{task.title}</div>
                <div className="am-mcenter-earn-desc">{task.desc}</div>
              </div>
              <div className="am-mcenter-earn-pts">
                {task.points >= 0 ? `+${task.points}` : task.points}
              </div>
              <button
                type="button"
                className="am-mcenter-earn-btn"
                disabled={task.action === "checkin" && checkedIn}
                onClick={() => {
                  const res = claimEarnTask(wallet, task.id);
                  if (!res.ok) {
                    toast(res.message, "warn");
                    return;
                  }
                  setWallet(res.wallet);
                  syncAuth(res.wallet);
                  toast(res.message);
                }}
              >
                {task.action === "checkin"
                  ? checkedIn
                    ? "已签到"
                    : `签到 +${task.points}`
                  : task.points >= 0
                    ? `领取 +${task.points}`
                    : `演示消耗 ${Math.abs(task.points)}算力`}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
