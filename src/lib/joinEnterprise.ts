import {
  applyJoinedOrgPatch,
  leaveJoinedOrgPatch,
  resolveAccountUserName,
  type AuthUser,
} from "@/lib/auth";
import {
  addJoinedIdentity,
  currentIdentity,
  identityUserPatch,
  removeIdentity,
} from "@/lib/identity";
import {
  joinEnterpriseByCode,
  leaveEnterpriseMembership,
  loadOrgStore,
  normalizeJoinCode,
} from "@/lib/org";
import { reportCendJoin, reportCendLeaveOrg } from "@/lib/opsRegister";

export async function joinEnterpriseForUser(
  user: AuthUser,
  rawCode: string,
): Promise<
  | { ok: true; userPatch: Partial<AuthUser>; company: string; companyId: string; identityId: string }
  | { ok: false; message: string }
> {
  const code = normalizeJoinCode(rawCode);
  if (code.length < 4) return { ok: false, message: "请填写有效企业码" };

  const local = joinEnterpriseByCode(user, code);
  const remote = await reportCendJoin({
    phone: user.phone || user.username,
    joinCode: code,
    name: resolveAccountUserName(user),
  });

  const localOk = !local.error || local.already || local.error === "该账号已在组织中";
  if (!localOk && !remote.ok) {
    return { ok: false, message: remote.error || local.error || "加入失败" };
  }

  const company = (remote.company || local.orgName || (localOk ? local.store.organization.name : "")).trim();
  if (!company) return { ok: false, message: local.error || remote.error || "加入失败" };
  const companyId = local.store.organization.companyId || `JOIN-${user.userId.slice(-8)}`;
  const ident = addJoinedIdentity(user, { name: company, companyId });

  return {
    ok: true,
    company,
    companyId,
    identityId: ident.id,
    userPatch: {
      ...applyJoinedOrgPatch(company, companyId),
      ...identityUserPatch(user, ident),
    },
  };
}

export async function leaveJoinedEnterprise(user: AuthUser): Promise<{
  ok: true;
  userPatch: Partial<AuthUser>;
  identityId: string;
} | { ok: false; message: string }> {
  const ident = currentIdentity(user);
  if (!ident || ident.kind !== "joined") {
    return { ok: false, message: "请先切换到要退出的企业身份" };
  }
  const store = loadOrgStore(user);
  const local = leaveEnterpriseMembership(store, user);
  if (local.error) return { ok: false, message: local.error };
  await reportCendLeaveOrg({
    phone: user.phone || user.username,
    joinCode: store.organization.joinCode,
  });
  const next = removeIdentity(user, ident.id);
  return {
    ok: true,
    identityId: next?.id || "",
    userPatch: next ? identityUserPatch(user, next) : leaveJoinedOrgPatch(user),
  };
}
