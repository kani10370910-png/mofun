"use client";

import { useCallback, useEffect, useState } from "react";
import { MemberCheckoutModal, PackCheckoutModal } from "@/components/account/MemberCheckoutModal";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/AuthContext";
import { hasEnterpriseInfo, isEnterpriseOwner, isJoinedOrgMember } from "@/lib/auth";
import { identityScopeKey } from "@/lib/identity";
import { loadEconomyCatalog, subscribeEconomy } from "@/lib/economyCatalog";
import { isOrgAdminActor, loadOrgStore, setOrganizationEnterprisePlan, actorCanSelfRecharge } from "@/lib/org";
import { addActorMonthlyLimit, enterpriseAuthPatch } from "@/lib/quota";
import {
  allMemberPlans,
  allPointPacks,
  isCurrentPlan,
  isFreePlan,
  loadPointsWallet,
  orgShopPlans,
  personalShopPlans,
  purchasePlan,
  purchasePointPack,
  pointPoolExpiresAt,
  pointsToAuthPatch,
  resolveCurrentPlanId,
  savePointsWallet,
  shopPacksForKind,
  tierLabel,
  totalPoints,
  type MemberPlan,
  type MembershipShopMode,
  type PointsSubTab,
  type PointsWallet,
} from "@/lib/points";

type LedgerPart = "earn" | "spend";

function isEarnEntry(row: PointsWallet["ledger"][number]) {
  return row.amount >= 0;
}

function poolTypeLabel(row: PointsWallet["ledger"][number]) {
  if (row.kind === "recharge" || /充值|算力包/.test(row.title)) return "充值算力";
  if (row.kind === "expire") {
    if (/赠送/.test(row.title)) return "赠送算力";
    if (/充值/.test(row.title)) return "充值算力";
    if (/会员/.test(row.title)) return "会员算力";
  }
  if (row.kind === "transfer" || row.kind === "return") return "充值算力";
  if (row.kind === "spend") return "算力消耗";
  if (/开通|会员算力/.test(row.title) && !/赠送/.test(row.title)) return "会员算力";
  return "赠送算力";
}

function endOfDayLabel(at: string) {
  const day = at.slice(0, 10);
  return day ? `${day} 23:59:59` : "—";
}

function endOfMonthLabelFrom(at: string) {
  const d = new Date(at.replace(" ", "T"));
  if (!Number.isFinite(d.getTime())) return endOfDayLabel(at);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${last.getFullYear()}-${p(last.getMonth() + 1)}-${p(last.getDate())} 23:59:59`;
}

function validityRange(row: PointsWallet["ledger"][number], wallet: PointsWallet) {
  const start = row.at;
  if (/登录/.test(row.title)) return `${start}–${endOfDayLabel(row.at)}`;
  if (row.kind === "gift" || /礼包|注册|赠送/.test(row.title)) {
    return `${start}–${wallet.giftExpiresAt || endOfDayLabel(row.at)}`;
  }
  if (row.kind === "recharge" || /充值|算力包/.test(row.title)) {
    return `${start}–${wallet.rechargeExpiresAt || "—"}`;
  }
  if (/开通|会员/.test(row.title)) return `${start}–${endOfMonthLabelFrom(row.at)}`;
  return `${start}–${endOfDayLabel(row.at)}`;
}

function MemberPlanCard({
  plan,
  wallet,
  plans,
  selected,
  onSelect,
  onPurchase,
}: {
  plan: MemberPlan;
  wallet: PointsWallet;
  plans: MemberPlan[];
  selected: boolean;
  onSelect: (planId: string) => void;
  onPurchase: (planId: string) => void;
}) {
  const current = isCurrentPlan(wallet, plan, plans);
  const free = isFreePlan(plan);
  const btnText = current ? "当前版本" : free ? "已有权益" : "立即开通";

  return (
    <article
      className={`am-mcenter-plan${selected ? " on" : ""}${current ? " current" : ""}`}
      onClick={() => onSelect(plan.id)}
    >
      {plan.highlight && !current ? <span className="am-mcenter-plan-tag">推荐</span> : null}
      {current ? <span className="am-mcenter-plan-tag">当前</span> : null}
      <div className="am-mcenter-plan-head">
        <h3>{plan.name}</h3>
        {plan.description ? <p className="am-mcenter-plan-desc">{plan.description}</p> : null}
      </div>
      <div className="am-mcenter-plan-price">
        {plan.originalPriceLabel ? (
          <span className="am-mcenter-plan-origin">{plan.originalPriceLabel}</span>
        ) : null}
        <strong>{plan.priceLabel}</strong>
        {plan.periodLabel ? <span>{plan.periodLabel}</span> : null}
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
        className={`am-mcenter-plan-btn${current || free ? " is-muted" : ""}${!current && !free && selected ? " is-primary" : ""}`}
        disabled={current || free}
        onClick={(e) => {
          e.stopPropagation();
          if (current || free) return;
          onSelect(plan.id);
          onPurchase(plan.id);
        }}
      >
        {btnText}
      </button>
    </article>
  );
}

const ENTERPRISE_CONSULT_PERKS: { text: string; badge?: string }[] = [
  { text: "协作成员数不限" },
  { text: "算力折扣", badge: "专属定制" },
  { text: "大额算力消耗专属折扣" },
  { text: "超量算力支持" },
  { text: "更高并发与稳定保障" },
  { text: "团队协作与权限管理" },
  { text: "一致性资产库共用" },
  { text: "服务团队 1v1 快速响应支持" },
  { text: "剧本/发行/商单对接（按合作方案）" },
  { text: "对公开票与合同结算" },
];

function SalesContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="am-cs-overlay" role="dialog" aria-modal="true" aria-label="联系顾问">
      <button type="button" className="am-cs-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="am-cs-card">
        <button type="button" className="am-cs-close" onClick={onClose} aria-label="关闭">
          <Icon name="close" size={16} />
        </button>
        <h3>联系商务顾问</h3>
        <p>扫码添加企业客服微信，或工作日 9:00–18:00 拨打热线获取企业版报价。</p>
        <div className="am-cs-qr" aria-hidden>
          <span>QR</span>
        </div>
        <div className="am-cs-phone">客服热线：400-000-0000（演示）</div>
      </div>
    </div>
  );
}

function EnterpriseConsultCard({ onContact }: { onContact: () => void }) {
  return (
    <article className="am-mcenter-plan is-enterprise">
      <span className="am-mcenter-plan-tag">定制方案</span>
      <div className="am-mcenter-plan-head">
        <h3>企业版</h3>
        <p className="am-mcenter-plan-desc">联系商务获取报价，对公开通企业权益。</p>
      </div>
      <div className="am-mcenter-plan-price">
        <strong>定制咨询</strong>
      </div>
      <ul>
        {ENTERPRISE_CONSULT_PERKS.map((perk) => (
          <li key={perk.text}>
            <Icon name="check" size={14} />
            <span>
              {perk.text}
              {perk.badge ? <em className="am-ent-perk-badge">{perk.badge}</em> : null}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="am-mcenter-plan-btn" onClick={onContact}>
        联系顾问
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
  const [sub, setSub] = useState<PointsSubTab>(initialSub === "pointsLedger" ? "pointsLedger" : "membershipCard");
  const [shopMode, setShopMode] = useState<MembershipShopMode>("buyMember");
  const [pickedPlanId, setPickedPlanId] = useState<string>("");
  const [pickedPackId, setPickedPackId] = useState<string>("");
  const [wallet, setWallet] = useState<PointsWallet | null>(null);
  const [plans, setPlans] = useState<MemberPlan[]>(allMemberPlans());
  const [packs, setPacks] = useState(allPointPacks());
  const [checkoutPlanId, setCheckoutPlanId] = useState("");
  const [checkoutPackId, setCheckoutPackId] = useState("");
  const [paying, setPaying] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [ledgerPart, setLedgerPart] = useState<LedgerPart>("earn");

  const syncAuth = useCallback(
    (w: PointsWallet) => {
      if (!user) return;
      updateUser(isEnterpriseOwner(user) ? enterpriseAuthPatch(user, w) : pointsToAuthPatch(w));
    },
    [updateUser, user]
  );

  useEffect(() => {
    if (!user?.userId) return;
    const w = loadPointsWallet(identityScopeKey(user), {
      enterprise: isEnterpriseOwner(user),
    });
    setWallet(w);
    const phone = (user.phone || user.username || "").trim();
    if (/^1\d{9,10}$/.test(phone)) {
      void import("@/lib/opsRegister").then((m) =>
        m.syncWalletWithOps(w, phone).then((next) => {
          setWallet(next);
          const patch = isEnterpriseOwner(user) ? enterpriseAuthPatch(user, next) : pointsToAuthPatch(next);
          if (
            user.computeBenefit !== patch.computeBenefit ||
            user.computeGift !== patch.computeGift ||
            user.computeRecharge !== patch.computeRecharge ||
            user.expiresAt !== patch.expiresAt
          ) {
            updateUser(patch);
          }
        }),
      );
    }
    const patch = isEnterpriseOwner(user) ? enterpriseAuthPatch(user, w) : pointsToAuthPatch(w);
    if (
      user.computeBenefit !== patch.computeBenefit ||
      user.computeGift !== patch.computeGift ||
      user.computeRecharge !== patch.computeRecharge ||
      user.expiresAt !== patch.expiresAt
    ) {
      updateUser(patch);
    }
    void loadEconomyCatalog().then(() => {
      const nextPlans = allMemberPlans();
      setPlans(nextPlans);
      setPacks(allPointPacks());
      setWallet((prev) => {
        const base = prev || w;
        const inferred = resolveCurrentPlanId(base, nextPlans);
        if (inferred && inferred !== base.planId) {
          return savePointsWallet({ ...base, planId: inferred });
        }
        return base;
      });
    });
    const unsub = subscribeEconomy(() => {
      setPlans(allMemberPlans());
      setPacks(allPointPacks());
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId, user?.companyId, user?.joinedOrg, user?.enterpriseVerified]);

  if (!user || !wallet) return null;

  const total = totalPoints(wallet);
  const isEnterprise = hasEnterpriseInfo(user);
  const isOwner = isEnterpriseOwner(user);
  const isMember = isJoinedOrgMember(user);
  const isAdmin = isEnterprise && isOrgAdminActor(loadOrgStore(user), user.userId, user);
  const canSelfRecharge = !isMember && actorCanSelfRecharge(user);
  const currentPlanId = resolveCurrentPlanId(wallet, plans);
  const currentPlan = plans.find((p) => p.id === currentPlanId);
  const visiblePlans = isOwner ? orgShopPlans(plans, ["enterprise", "group"]) : isMember ? [] : personalShopPlans(plans);
  const visiblePacks = isOwner
    ? packs.filter((p) => p.kind === "enterprise" || p.kind === "group" || p.kind === "subsidy")
    : isMember
      ? []
      : shopPacksForKind(packs, "personal");
  const showConsult = !isMember;
  const poolExp = pointPoolExpiresAt(wallet);

  function openCheckout(planId: string) {
    setPickedPlanId(planId);
    setCheckoutPlanId(planId);
  }

  function handlePurchasePlan(planId: string) {
    setPaying(true);
    const res = purchasePlan(wallet!, planId, {
      enterprise: isEnterprise,
      enterpriseAdmin: isAdmin,
      allowSelfRecharge: canSelfRecharge,
    });
    setPaying(false);
    if (!res.ok) {
      toast(res.message, "warn");
      return;
    }
    setWallet(res.wallet);
    setPickedPlanId(planId);
    setCheckoutPlanId("");
    if (isEnterprise) addActorMonthlyLimit(user, totalPoints(res.wallet) - totalPoints(wallet!));
    const bought = plans.find((p) => p.id === planId);
    if (bought?.tierId === "enterprise") {
      setOrganizationEnterprisePlan(loadOrgStore(user), planId);
    }
    syncAuth(res.wallet);
    toast(res.message);
  }

  function openPackCheckout(packId: string) {
    setPickedPackId(packId);
    setCheckoutPackId(packId);
  }

  function handlePurchasePack(packId: string) {
    setPaying(true);
    const res = purchasePointPack(wallet!, packId, {
      enterprise: isEnterprise,
      enterpriseAdmin: isAdmin,
      allowSelfRecharge: canSelfRecharge,
    });
    setPaying(false);
    if (!res.ok) {
      toast(res.message, "warn");
      return;
    }
    setWallet(res.wallet);
    setPickedPackId(packId);
    setCheckoutPackId("");
    const pack = packs.find((p) => p.id === packId);
    if (isEnterprise && pack?.kind !== "subsidy") {
      addActorMonthlyLimit(user, totalPoints(res.wallet) - totalPoints(wallet!));
    }
    syncAuth(res.wallet);
    toast(res.message);
  }

  return (
    <div className="am-panel am-panel-wide am-mcenter">
      <div className="am-mcenter-head">
        <h1 className="am-title">会员中心</h1>
      </div>

      <section className="am-mcenter-hero">
        <div className="am-mcenter-hero-main">
          <div className="am-mcenter-tier">
            <span>{isMember ? "成员" : currentPlan?.name || tierLabel(wallet.tierId)}</span>
          </div>
          <div className="am-mcenter-balance">
            <span className="am-mcenter-balance-label">可用算力</span>
            <strong className="am-mcenter-balance-num">{total}</strong>
          </div>
          <div className="am-mcenter-split">
            <div>
              <span>赠送算力</span>
              <b>{wallet.giftPoints}</b>
              <em>到期时间 {poolExp.gift}</em>
            </div>
            <div>
              <span>会员算力</span>
              <b>{wallet.benefitPoints}</b>
              <em>到期时间 {poolExp.benefit}</em>
            </div>
            <div>
              <span>充值算力</span>
              <b>{wallet.rechargePoints || 0}</b>
              <em>到期时间 {poolExp.recharge}</em>
            </div>
          </div>
        </div>
      </section>

      <div className="am-mcenter-tabs" role="tablist">
        {(
          [
            ["membershipCard", "会员卡"],
            ["pointsLedger", "算力明细"],
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
          {canSelfRecharge ? (
            <>
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
            <div className="am-mcenter-plans am-mcenter-plans--primary">
              {visiblePlans.map((plan) => (
                <MemberPlanCard
                  key={plan.id}
                  plan={plan}
                  wallet={wallet}
                  plans={plans}
                  selected={pickedPlanId ? pickedPlanId === plan.id : currentPlanId === plan.id}
                  onSelect={setPickedPlanId}
                  onPurchase={openCheckout}
                />
              ))}
              {showConsult ? <EnterpriseConsultCard onContact={() => setSalesOpen(true)} /> : null}
            </div>
          ) : (
            <>
              <div className="am-mcenter-packs">
                {visiblePacks.map((pack) => (
                  <article
                    key={pack.id}
                    className={`am-mcenter-pack${pickedPackId === pack.id ? " on" : ""}`}
                    onClick={() => setPickedPackId(pack.id)}
                  >
                    {pack.tag ? <span className="am-mcenter-pack-tag">{pack.tag}</span> : null}
                    <h3>{pack.name}</h3>
                    <div className="am-mcenter-pack-price">{pack.priceLabel}</div>
                    <div className="am-mcenter-points-badge is-compact">
                      <strong>{pack.points.toLocaleString()}算力</strong>
                    </div>
                    <button
                      type="button"
                      className={`am-mcenter-pack-btn${pickedPackId === pack.id ? " is-primary" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openPackCheckout(pack.id);
                      }}
                    >
                      立即购买
                    </button>
                    <p className="am-mcenter-pack-note">{pack.validNote}</p>
                  </article>
                ))}
              </div>
            </>
          )}
            </>
          ) : (
            <p className="am-mcenter-locked">
              当前账号共享企业算力，不展示会员类型，也不能自行购买会员或算力包。
            </p>
          )}
        </div>
      )}

      {sub === "pointsLedger" && (
        <div className="am-mcenter-ledger-wrap">
          <h2 className="am-mcenter-ledger-h">算力明细</h2>
          <div className="am-ledger-switch" role="tablist" aria-label="算力明细分类">
            <button
              type="button"
              role="tab"
              aria-selected={ledgerPart === "earn"}
              className={ledgerPart === "earn" ? "on" : ""}
              onClick={() => setLedgerPart("earn")}
            >
              获取记录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={ledgerPart === "spend"}
              className={ledgerPart === "spend" ? "on" : ""}
              onClick={() => setLedgerPart("spend")}
            >
              消耗记录
            </button>
          </div>
          {(() => {
            const rows = wallet.ledger.filter((row) =>
              ledgerPart === "earn" ? isEarnEntry(row) : !isEarnEntry(row),
            );
            if (rows.length === 0) {
              return (
                <div className="am-mcenter-ledger">
                  <p className="am-mcenter-empty">
                    {ledgerPart === "earn" ? "暂无获取记录" : "暂无消耗记录"}
                  </p>
                </div>
              );
            }
            return (
              <div className="am-mcenter-ledger">
                <table>
                  <thead>
                    {ledgerPart === "earn" ? (
                      <tr>
                        <th>获取途径</th>
                        <th>算力类型</th>
                        <th>获得数量</th>
                        <th>算力有效期</th>
                        <th>发放时间</th>
                      </tr>
                    ) : (
                      <tr>
                        <th>消耗途径</th>
                        <th>算力类型</th>
                        <th>消耗数量</th>
                        <th>消耗时间</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {rows.map((row) =>
                      ledgerPart === "earn" ? (
                        <tr key={row.id}>
                          <td>{row.title}</td>
                          <td>{poolTypeLabel(row)}</td>
                          <td className="plus">{row.amount >= 0 ? `+${row.amount}` : row.amount}</td>
                          <td className="mono am-mcenter-ledger-range">{validityRange(row, wallet)}</td>
                          <td className="mono">{row.at}</td>
                        </tr>
                      ) : (
                        <tr key={row.id}>
                          <td>
                            <div className="am-mcenter-ledger-title">{row.title}</div>
                            {row.detail ? <div className="am-mcenter-ledger-detail">{row.detail}</div> : null}
                          </td>
                          <td>{poolTypeLabel(row)}</td>
                          <td className="minus">{row.amount}</td>
                          <td className="mono">{row.at}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {checkoutPlanId ? (
        <MemberCheckoutModal
          key={checkoutPlanId}
          openPlanId={checkoutPlanId}
          plans={visiblePlans}
          wallet={wallet}
          paying={paying}
          onClose={() => setCheckoutPlanId("")}
          onPay={handlePurchasePlan}
        />
      ) : null}
      {checkoutPackId ? (
        <PackCheckoutModal
          key={checkoutPackId}
          openPackId={checkoutPackId}
          packs={visiblePacks}
          paying={paying}
          onClose={() => setCheckoutPackId("")}
          onPay={handlePurchasePack}
        />
      ) : null}
      <SalesContactModal open={salesOpen} onClose={() => setSalesOpen(false)} />
    </div>
  );
}
