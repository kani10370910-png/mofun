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
  loginWithEnterprise,
  loginWithPhone,
  saveSession,
  withPlanFromEnterprise,
  type AuthUser,
} from "@/lib/auth";
import { loadPointsWallet, pointsToAuthPatch } from "@/lib/points";
import { resolveRegionIdFromText } from "@/data/regionAssets";
import { loadPhoneDat, resolvePhoneRegionAsync } from "@/lib/phoneRegion";

function withPointsSynced(user: AuthUser): AuthUser {
  const w = loadPointsWallet(user.userId, {
    enterprise: !!user.enterpriseVerified,
  });
  return withPlanFromEnterprise({ ...user, ...pointsToAuthPatch(w) });
}

type AuthCtx = {
  user: AuthUser | null;
  ready: boolean;
  loginOpen: boolean;
  loginTab: "phone" | "enterprise";
  openLogin: (tab?: "phone" | "enterprise") => void;
  closeLogin: () => void;
  login: (account: string, password: string) => { ok: boolean; message?: string };
  loginEnterprise: (account: string, password: string) => { ok: boolean; message?: string };
  loginPhone: (phone: string, code: string) => { ok: boolean; message?: string };
  logout: () => void;
  updateUser: (patch: Partial<AuthUser>) => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginTab, setLoginTab] = useState<"phone" | "enterprise">("phone");

  useEffect(() => {
    const session = loadSession();
    setUser(session ? withPointsSynced(session) : null);
    setReady(true);
    void loadPhoneDat().catch(() => undefined);
  }, []);

  const openLogin = useCallback((tab: "phone" | "enterprise" = "phone") => {
    setLoginTab(tab);
    setLoginOpen(true);
  }, []);

  const closeLogin = useCallback(() => setLoginOpen(false), []);

  const loginEnterprise = useCallback((account: string, password: string) => {
    const u = loginWithEnterprise(account, password);
    if (!u) return { ok: false, message: "账号或密码错误（演示：jxk1@test / admin123）" };
    const synced = withPointsSynced(u);
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
    const synced = withPointsSynced(u);
    saveSession(synced);
    setUser(synced);
    setLoginOpen(false);
    void resolvePhoneRegionAsync(phone.trim()).then((region) => {
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

  /** 兼容旧调用：企业账号密码 */
  const login = useCallback(
    (account: string, password: string) => loginEnterprise(account, password),
    [loginEnterprise]
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
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
      saveSession(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      loginOpen,
      loginTab,
      openLogin,
      closeLogin,
      login,
      loginEnterprise,
      loginPhone,
      logout,
      updateUser,
    }),
    [
      user,
      ready,
      loginOpen,
      loginTab,
      openLogin,
      closeLogin,
      login,
      loginEnterprise,
      loginPhone,
      logout,
      updateUser,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
