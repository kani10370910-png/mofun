"use client";

import { TopBar } from "./TopBar";

/* 应用外壳：渲染顶栏 + 主区域。
   「制作大片」全屏模式（隐藏顶栏 + body.studio-mode）由 Studio 组件自行用
   useStudioFullscreen 切换，避免在此处使用 useSearchParams 触发整站 SSR bailout。*/
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar />
      <main className="main" id="main">
        {children}
      </main>
    </>
  );
}
