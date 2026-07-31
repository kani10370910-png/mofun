"use client";

import { useEffect } from "react";
import { TopBar } from "./TopBar";
import { SiteBeian } from "./SiteBeian";
import { ConfirmHost } from "@/components/ui/Confirm";
import { usePathname } from "next/navigation";
import {
  HOME_SEASON_EVENT,
  type HomeSeason,
  applyHomeSeasonTheme,
  readHomeSeason,
} from "@/lib/homeSeason";

/* 应用外壳：渲染顶栏 + 主区域。
   登录 / 个人中心 / 企业管理 使用独立顶栏，隐藏全局 TopBar。*/
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const hideTop =
    pathname.startsWith("/login") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/enterprise");

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
      {!hideTop && <TopBar />}
      <main className={hideTop ? "main main-flush" : "main"} id="main">
        {children}
      </main>
      {pathname !== "/" && <SiteBeian />}
      <ConfirmHost />
    </>
  );
}
