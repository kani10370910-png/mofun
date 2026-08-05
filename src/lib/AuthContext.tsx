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
  loadSession,
  loginWithEnterprise,
  loginWithPhone,
  saveSession,
  type AuthUser,
} from "@/lib/auth";
import { resolveRegionIdFromText } from "@/data/regionAssets";

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
  const [loginTab, setLoginTab] = useState<"phone" | "enterprise">("enterprise");

  useEffect(() => {
    setUser(loadSession());
    setReady(true);
  }, []);

  const openLogin = useCallback((tab: "phone" | "enterprise" = "enterprise") => {
    setLoginTab(tab);
    setLoginOpen(true);
  }, []);

  const closeLogin = useCallback(() => setLoginOpen(false), []);

  const loginEnterprise = useCallback((account: string, password: string) => {
    const u = loginWithEnterprise(account, password);
    if (!u) return { ok: false, message: "账号或密码错误（演示：jxk1@test / admin123）" };
    setUser(u);
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
    setUser(u);
    setLoginOpen(false);
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
      const next = { ...(prev || DEMO_USER), ...patch };
      // 改地址且未显式传 regionId 时，按地址/企业名重新推断归属县域
      if (patch.address !== undefined && patch.regionId === undefined) {
        next.regionId = resolveRegionIdFromText(
          [next.address, next.orgName, next.company].filter(Boolean).join(" ")
        );
      }
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
