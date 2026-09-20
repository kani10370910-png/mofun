"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  clearSession,
  DEMO_USER,
  hasEnterpriseInfo,
  loadSession,
  loadPhonePassword,
  loginWithEnterprise,
  loginWithPhone,
  loginWithPhonePassword,
  nowDateTime,
  saveSession,
  withPlanFromEnterprise,
  type AuthUser,
} from "@/lib/auth";
import { syncCendTenant } from "@/lib/opsRegister";
import { loadPointsWallet, pointsToAuthPatch } from "@/lib/points";
import { alignEnterprisePrimaryQuota, enterpriseAuthPatch } from "@/lib/quota";
import {
  applyCurrentIdentity,
  bootstrapIdentities,
  currentIdentity,
  identityScopeKey,
  identityUserPatch,
  loadIdentities,
  switchIdentity as switchWorkIdentity,
  type WorkIdentity,
} from "@/lib/identity";
import { loadEconomyCatalog, subscribeEconomy } from "@/lib/economyCatalog";
import { resolveRegionIdFromText } from "@/data/regionAssets";
import { loadPhoneDat, resolvePhoneRegionAsync } from "@/lib/phoneRegion";

function withPointsSynced(user: AuthUser): AuthUser {
  try {
    bootstrapIdentities(user);
    const ident = currentIdentity(user);
    const scoped = ident ? { ...user, ...identityUserPatch(user, ident) } : user;
    const enterprise = ident ? ident.kind !== "personal" : !!user.enterpriseVerified && !user.joinedOrg;
    if (hasEnterpriseInfo(scoped)) alignEnterprisePrimaryQuota(scoped);
    const w = loadPointsWallet(identityScopeKey(scoped), {
      enterprise,
      fallbackUserId: ident?.kind === "personal" ? user.userId : undefined,
    });
    const patch = enterprise ? enterpriseAuthPatch(scoped, w) : pointsToAuthPatch(w);
    return withPlanFromEnterprise({ ...scoped, ...patch });
  } catch {
    return withPlanFromEnterprise(user);
  }
}

type AuthCtx = {
  user: AuthUser | null;
  ready: boolean;
  loginOpen: boolean;
  loginTab: "account" | "enterprise";
  identities: WorkIdentity[];
  currentIdentity: WorkIdentity | null;
  switchIdentity: (id: string) => void;
  openLogin: (tab?: "account" | "enterprise" | "phone") => void;
  closeLogin: () => void;
  login: (account: string, password: string) => { ok: boolean; message?: string };
  loginEnterprise: (account: string, password: string) => { ok: boolean; message?: string };
  loginPhone: (phone: string, code: string) => { ok: boolean; message?: string };
  loginPhonePassword: (phone: string, password: string) => { ok: boolean; message?: string };
  logout: () => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  /** 运营端价目刷新后递增，驱动按钮上线价重算 */
  economyRev: number;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginTab, setLoginTab] = useState<"account" | "enterprise">("account");
  const [economyRev, setEconomyRev] = useState(0);

  useEffect(() => {
    const session = loadSession();
    if (session) {
      bootstrapIdentities(session);
      const next = withPointsSynced(
        applyCurrentIdentity({
          ...session,
          lastLoginAt: session.lastLoginAt || session.createdAt || nowDateTime(),
        }),
      );
      if (!session.lastLoginAt) saveSession(next);
      setUser(next);
      const phone = next.phone || next.username || "";
      const pwd = next.loginPassword || loadPhonePassword(phone);
      const toSync = pwd ? { ...next, loginPassword: pwd } : next;
      if (pwd && pwd !== next.loginPassword) {
        saveSession(toSync);
        setUser(toSync);
      }
      syncCendTenant(toSync, null, pwd ? { password: pwd } : undefined);
      void resolvePhoneRegionAsync(phone).then((region) => {
        syncCendTenant(toSync, region, pwd ? { password: pwd } : undefined);
        if (region?.regionId) {
          setUser((prev) => {
            if (!prev) return prev;
            const patched = withPointsSynced(withPlanFromEnterprise({ ...prev, regionId: region.regionId }));
            saveSession(patched);
            return patched;
          });
        }
      });
    } else {
      setUser(null);
    }
    setReady(true);
    void loadPhoneDat().catch(() => undefined);
    void loadEconomyCatalog().catch(() => undefined);
    const unsub = subscribeEconomy(() => setEconomyRev((n) => n + 1));
    const onFocus = () => {
      void loadEconomyCatalog().catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(onFocus, 30_000);
    return () => {
      unsub();
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, []);

  const openLogin = useCallback((_tab?: "account" | "enterprise" | "phone") => {
    setLoginTab("account");
    setLoginOpen(true);
  }, []);

  const closeLogin = useCallback(() => setLoginOpen(false), []);

  const loginEnterprise = useCallback((account: string, password: string) => {
    const u = loginWithEnterprise(account, password);
    if (!u) return { ok: false, message: "账号或密码错误（演示：jxk1@test / admin123）" };
    bootstrapIdentities(u);
    const synced = withPointsSynced(applyCurrentIdentity({ ...u, lastLoginAt: nowDateTime() }));
    saveSession(synced);
    setUser(synced);
    setLoginOpen(false);
    return { ok: true };
  }, []);

  const loginPhone = useCallback((phone: string, code: string) => {
    const u = loginWithPhone(phone, code);
    if (!u) {
      return {
        ok: false,
        message: !/^1\d{10}$/.test(phone.trim())
          ? "请输入正确的11位手机号"
          : "验证码错误（演示验证码：123456）",
      };
    }
    bootstrapIdentities(u);
    const synced = withPointsSynced(applyCurrentIdentity({ ...u, lastLoginAt: nowDateTime() }));
    saveSession(synced);
    setUser(synced);
    setLoginOpen(false);
    const pwd = synced.loginPassword || loadPhonePassword(phone.trim());
    syncCendTenant(synced, null, pwd ? { password: pwd } : undefined);
    void resolvePhoneRegionAsync(phone.trim()).then((region) => {
      syncCendTenant(synced, region, pwd ? { password: pwd } : undefined);
      if (region?.regionId) {
        setUser((prev) => {
          if (!prev) return prev;
          const next = withPointsSynced(withPlanFromEnterprise({ ...prev, regionId: region.regionId }));
          saveSession(next);
          return next;
        });
      }
    });
    return { ok: true };
  }, []);

  const loginPhonePassword = useCallback((phone: string, password: string) => {
    const u = loginWithPhonePassword(phone, password);
    if (!u) {
      return {
        ok: false,
        message: !/^1\d{10}$/.test(phone.trim())
          ? "请输入正确的11位手机号"
          : "请输入至少 6 位密码（演示）",
      };
    }
    const pwd = password.trim();
    bootstrapIdentities(u);
    const synced = withPointsSynced(applyCurrentIdentity({ ...u, lastLoginAt: nowDateTime(), loginPassword: pwd }));
    saveSession(synced);
    setUser(synced);
    setLoginOpen(false);
    syncCendTenant(synced, null, { password: pwd });
    void resolvePhoneRegionAsync(phone.trim()).then((region) => {
      syncCendTenant(synced, region, { password: pwd });
      if (region?.regionId) {
        setUser((prev) => {
          if (!prev) return prev;
          const next = withPointsSynced(withPlanFromEnterprise({ ...prev, regionId: region.regionId }));
          saveSession(next);
          return next;
        });
      }
    });
    return { ok: true };
  }, []);
  const login = useCallback(
    (account: string, password: string) => loginEnterprise(account, password),
    [loginEnterprise]
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const switchIdentity = useCallback((id: string) => {
    setUser((prev) => {
      if (!prev) return prev;
      const ident = switchWorkIdentity(prev, id);
      if (!ident) return prev;
      const next = withPointsSynced({ ...prev, ...identityUserPatch(prev, ident) });
      saveSession(next);
      syncCendTenant(next, undefined, next.loginPassword ? { password: next.loginPassword } : undefined);
      return next;
    });
  }, []);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((prev) => {
      let next = { ...(prev || DEMO_USER), ...patch };
      // 企业版：地址 / 企业名变更时同步县域 regionId
      if (
        hasEnterpriseInfo(next) &&
        patch.regionId === undefined &&
        (patch.address !== undefined ||
          patch.company !== undefined ||
          patch.orgName !== undefined ||
          patch.enterpriseVerified !== undefined)
      ) {
        next.regionId = resolveRegionIdFromText(
          [next.address, next.company, next.orgName].filter(Boolean).join(" ")
        );
      }
      // 改地址且未显式传 regionId 时，按地址/企业名重新推断归属区县
      if (patch.address !== undefined && patch.regionId === undefined && !hasEnterpriseInfo(next)) {
        next.regionId = resolveRegionIdFromText(
          [next.address, next.orgName, next.company].filter(Boolean).join(" ")
        );
      }
      next = withPlanFromEnterprise(next);
      if (prev && JSON.stringify(prev) === JSON.stringify(next)) return prev;
      saveSession(next);
      syncCendTenant(next, undefined, next.loginPassword ? { password: next.loginPassword } : undefined);
      return next;
    });
  }, []);

  const identities = user ? loadIdentities(user) : [];
  const ident = user ? currentIdentity(user) : null;

  const value = useMemo(
    () => ({
      user,
      ready,
      loginOpen,
      loginTab,
      identities,
      currentIdentity: ident,
      switchIdentity,
      openLogin,
      closeLogin,
      login,
      loginEnterprise,
      loginPhone,
      loginPhonePassword,
      logout,
      updateUser,
      economyRev,
    }),
    [
      user,
      ready,
      loginOpen,
      loginTab,
      identities,
      ident,
      switchIdentity,
      openLogin,
      closeLogin,
      login,
      loginEnterprise,
      loginPhone,
      loginPhonePassword,
      logout,
      updateUser,
      economyRev,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
