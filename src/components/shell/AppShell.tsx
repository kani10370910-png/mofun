"use client";

import { useEffect } from "react";
import { TopBar } from "./TopBar";
import { SiteBeian } from "./SiteBeian";
import { ConfirmHost } from "@/components/ui/Confirm";
import { LoginModal } from "@/components/auth/LoginModal";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useAuth } from "@/lib/AuthContext";
import {
  HOME_SEASON_EVENT,
  type HomeSeason,
  applyHomeSeasonTheme,
  readHomeSeason,
} from "@/lib/homeSeason";

function LoginQueryOpener() {
  const sp = useSearchParams();
  const router = useRouter();
  const { user, ready, openLogin } = useAuth();
  useEffect(() => {
    if (!ready || user) return;
    const invite = (sp.get("code") || "").trim();
    if (invite) {
      try {
        window.sessionStorage.setItem("mofun.invite.code", invite);
      } catch {
        /* ignore */
      }
    }
    if (sp.get("login") === "1" || invite) {
      openLogin();
      const next = sp.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
    }
  }, [ready, user, sp, openLogin, router]);
  return null;
}

/* 应用外壳：渲染顶栏 + 主区域。
   账户管理台使用独立布局，隐藏全局 TopBar。*/
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const hideTop =
    pathname.startsWith("/login") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/enterprise");
  const lockHome = pathname === "/" || pathname === "/agent" || pathname.startsWith("/agent/");
  const hideShellBeian = lockHome || pathname.startsWith("/account");

  useEffect(() => {
    applyHomeSeasonTheme(readHomeSeason());
    const onSeason = (e: Event) => {
      const next = (e as CustomEvent<HomeSeason>).detail;
      if (next) applyHomeSeasonTheme(next);
    };
    window.addEventListener(HOME_SEASON_EVENT, onSeason);
    return () => window.removeEventListener(HOME_SEASON_EVENT, onSeason);
  }, []);

  return (
    <>
      {!hideTop && (
        <Suspense fallback={<header className="topbar" aria-hidden="true" />}>
          <TopBar />
        </Suspense>
      )}
      <main
        className={
          hideTop ? "main main-flush" : lockHome ? "main main-home-lock" : "main"
        }
        id="main"
      >
        {children}
      </main>
      {!hideShellBeian && <SiteBeian />}
      <ConfirmHost />
      <LoginModal />
      <Suspense fallback={null}>
        <LoginQueryOpener />
      </Suspense>
    </>
  );
}
