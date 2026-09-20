import { isEnterpriseOwner, type AuthUser } from "@/lib/auth";
import { identityScopeKey } from "@/lib/identity";
import { useAuth } from "@/lib/AuthContext";
import { enterpriseAuthPatch, memberQuotaView } from "@/lib/quota";
import {
  loadPointsWallet,
  pointsToAuthPatch,
  refundIfNotDispatched,
  spendPoints,
  type PointsWallet,
} from "@/lib/points";

export type GenerateCharge = {
  amount: number;
  wallet: PointsWallet;
  dispatched: boolean;
};

/** 预扣。未发请求可全退；一旦 markDispatched，失败也不退。 */
export function beginGenerateCharge(
  user: AuthUser | null | undefined,
  amount: number,
  title: string,
): { ok: true; charge: GenerateCharge } | { ok: false; message: string } {
  if (!user?.userId) return { ok: false, message: "请先登录" };
  const walletId = identityScopeKey(user);
  const cost = Math.max(0, Math.floor(amount));
  if (cost <= 0) {
    return {
      ok: true,
      charge: { amount: 0, wallet: loadPointsWallet(walletId, { enterprise: isEnterpriseOwner(user) }), dispatched: false },
    };
  }
  const enterprise = isEnterpriseOwner(user);
  if (enterprise) {
    const left = memberQuotaView(user, walletId).remain;
    if (cost > left) {
      return { ok: false, message: left > 0 ? `已超本月额度（剩余 ${left}）` : "本月额度已用尽" };
    }
  }
  const res = spendPoints(
    loadPointsWallet(walletId, { enterprise }),
    cost,
    title,
    "预扣：赠送→会员→充值",
  );
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true, charge: { amount: cost, wallet: res.wallet, dispatched: false } };
}

export function markGenerateDispatched(charge: GenerateCharge): GenerateCharge {
  charge.dispatched = true;
  return charge;
}

export function settleGenerateCharge(charge: GenerateCharge): PointsWallet {
  if (charge.amount <= 0 || charge.dispatched) return charge.wallet;
  charge.wallet = refundIfNotDispatched(charge.wallet, charge.amount);
  return charge.wallet;
}

export function chargeAuthPatch(wallet: PointsWallet, user?: AuthUser | null) {
  if (user && isEnterpriseOwner(user)) return enterpriseAuthPatch(user, wallet);
  return pointsToAuthPatch(wallet);
}

export function useTakeCharge() {
  const { user, updateUser } = useAuth();
  return (amount: number, title: string): { ok: true } | { ok: false; message: string } => {
    const r = beginGenerateCharge(user, amount, title);
    if (!r.ok) return { ok: false, message: r.message };
    markGenerateDispatched(r.charge);
    updateUser(chargeAuthPatch(r.charge.wallet, user));
    return { ok: true };
  };
}
