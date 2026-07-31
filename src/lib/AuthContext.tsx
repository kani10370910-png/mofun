"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  clearSession,
  DEMO_USER,
  loadSession,
  loginWithDemo,
  saveSession,
  type AuthUser,
} from "@/lib/auth";

type AuthCtx = {
  user: AuthUser | null;
  ready: boolean;
  login: (account: string, password: string) => { ok: boolean; message?: string };
  logout: () => void;
  updateUser: (patch: Partial<AuthUser>) => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(loadSession());
    setReady(true);
  }, []);

  const login = useCallback((account: string, password: string) => {
    const u = loginWithDemo(account, password);
    if (!u) return { ok: false, message: "账号或密码错误（演示账号：admin_ent_001 / admin123）" };
    setUser(u);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((prev) => {
      const next = { ...(prev || DEMO_USER), ...patch };
      saveSession(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, logout, updateUser }),
    [user, ready, login, logout, updateUser],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
