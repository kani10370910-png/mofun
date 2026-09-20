import { hasEnterpriseInfo, isEnterpriseOwner, type AuthUser } from "@/lib/auth";
import { identityScopeKey } from "@/lib/identity";
import {
  findActorTeamMember,
  loadOrgStore,
  removeMembership,
  saveOrgStore,
  transferMemberMonthlyQuota,
  updateMemberMonthlyLimit,
  type Membership,
  type OrgStore,
} from "@/lib/org";
import {
  formatPoints,
  loadOrgMemberWallet,
  loadPointsWallet,
  peekPointsWallet,
  pointsToAuthPatch,
  quotaFromWallet,
  returnWalletPoints,
  totalPoints,
  transferWalletPoints,
  walletQuotaView,
  type PointsWallet,
} from "@/lib/points";

export type MemberQuotaView = {
  limit: number;
  used: number;
  remain: number;
};

export function memberQuotaView(user: AuthUser | null | undefined, userId?: string): MemberQuotaView {
  const scope = identityScopeKey(user);
  const uid = userId || scope || user?.userId || "";
  if (!uid) return { limit: 0, used: 0, remain: 0 };
  if (uid === user?.userId || uid === scope) {
    return walletQuotaView(scope || uid, {
      seedIfMissing: true,
      enterprise: isEnterpriseOwner(user),
    });
  }
  const peeked = peekPointsWallet(uid);
  if (!peeked) return { limit: 0, used: 0, remain: 0 };
  return quotaFromWallet(loadOrgMemberWallet(uid));
}

/** 成员额度与钱包对齐：额度 = 本月已用 + 剩余，和会员中心同一套数 */
export function alignEnterprisePrimaryQuota(user: AuthUser | null | undefined): OrgStore | null {
  if (!user || !hasEnterpriseInfo(user)) return null;
  let store = loadOrgStore(user);
  let changed = false;
  for (const m of store.members) {
    const uid = m.userId || (m.isPrimary ? user.userId : "");
    if (!uid) continue;
    const self = uid === user.userId || Boolean(m.isPrimary);
    const q = self
      ? walletQuotaView(uid, {
          seedIfMissing: true,
          enterprise: isEnterpriseOwner(user),
        })
      : peekPointsWallet(uid)
        ? quotaFromWallet(loadOrgMemberWallet(uid))
        : { limit: 0, used: 0, remain: 0 };
    const cur = Math.max(0, Math.floor(m.monthlyLimit ?? 0));
    if (cur !== q.limit) {
      store = updateMemberMonthlyLimit(store, m.id, q.limit).store;
      changed = true;
    }
  }
  if (!changed) return store;
  saveOrgStore(store);
  return store;
}

export function enterpriseAuthPatch(
  user: AuthUser,
  wallet?: PointsWallet,
): ReturnType<typeof pointsToAuthPatch> {
  const w = wallet || loadPointsWallet(user.userId, { enterprise: true });
  const q = memberQuotaView(user, user.userId);
  return {
    ...pointsToAuthPatch(w),
    computeBenefit: formatPoints(q.remain),
    computeGift: "0",
    computeRecharge: "0",
  };
}

export function addActorMonthlyLimit(user: AuthUser | null | undefined, delta: number): OrgStore | null {
  if (!user || !isEnterpriseOwner(user)) return null;
  const amt = Math.floor(Number(delta) || 0);
  if (amt === 0) return loadOrgStore(user);
  const store = loadOrgStore(user);
  const actor = findActorTeamMember(store, user) || store.members.find((m) => m.userId === user.userId);
  if (!actor) return store;
  const next = Math.max(0, Math.floor(actor.monthlyLimit ?? 0) + amt);
  return updateMemberMonthlyLimit(store, actor.id, next).store;
}

export function grantEnterpriseQuota(
  store: OrgStore,
  fromUserId: string,
  toMemberId: string,
  amount: number,
  fromUsed: number,
): { store: OrgStore; error?: string } {
  const amt = Math.floor(Number(amount) || 0);
  const fromWallet = totalPoints(loadPointsWallet(fromUserId, { enterprise: true }));
  if (amt > fromWallet) return { store, error: `算力不足（还可发放 ${fromWallet}）` };
  const r = transferMemberMonthlyQuota(store, fromUserId, toMemberId, amt, fromUsed);
  if (r.error) return r;
  const to = r.store.members.find((m) => m.id === toMemberId);
  if (!to?.userId) return { store: r.store, error: "找不到被发放人" };
  const from = r.store.members.find((m) => m.userId === fromUserId);
  const w = transferWalletPoints(fromUserId, to.userId, amt, {
    fromName: from?.name || "上级",
    toName: to.name,
  });
  if (!w.ok) return { store: r.store, error: w.message };
  return r;
}

function resolveGrantorUserId(store: OrgStore, ms: Membership, fallbackUserId?: string) {
  const candidates = [ms.createdByUserId, fallbackUserId, store.members.find((m) => m.isPrimary)?.userId];
  return candidates.find((id) => id && id !== ms.userId) || "";
}

/** 删除下级：剩余积分回流发放账户，并记回流明细 */
export function deleteEnterpriseMember(
  store: OrgStore,
  membershipId: string,
  actorUserId?: string,
): { store: OrgStore; error?: string; reclaimed: number; fromName: string; toName: string } {
  const ms = store.memberships.find((m) => m.id === membershipId);
  if (!ms) return { store, error: "成员不存在", reclaimed: 0, fromName: "", toName: "" };
  if (ms.role === "admin") return { store, error: "不可移除主账号", reclaimed: 0, fromName: "", toName: "" };
  const member = store.members.find((m) => m.id === ms.memberId);
  const fromName = member?.name || ms.name || "下级账号";
  const grantorId = resolveGrantorUserId(store, ms, actorUserId);
  const grantor = store.members.find((m) => m.userId === grantorId);
  const toName = grantor?.name || "发放账户";
  let reclaimed = 0;
  if (grantorId && ms.userId) {
    const ret = returnWalletPoints(ms.userId, grantorId, { fromName, toName });
    if (!ret.ok) return { store, error: ret.message, reclaimed: 0, fromName, toName };
    reclaimed = ret.amount;
    if (reclaimed > 0 && grantor) {
      const nextLimit = Math.max(0, Math.floor(grantor.monthlyLimit ?? 0) + reclaimed);
      store = updateMemberMonthlyLimit(store, grantor.id, nextLimit).store;
    }
  }
  const r = removeMembership(store, membershipId);
  if (r.error) return { store: r.store, error: r.error, reclaimed: 0, fromName, toName };
  return { store: r.store, reclaimed, fromName, toName };
}
