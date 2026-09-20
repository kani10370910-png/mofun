import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { LibraryProvider } from "@/lib/store";
import { AuthProvider } from "@/lib/AuthContext";

export const metadata: Metadata = {
  title: "MOFUN 魔方智绘平台",
  description: "AI 赋活地域文化基因 · 数智赋能农文旅未来",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="mofun_home_season_v1";var s=localStorage.getItem(k)||"summer";var m={spring:["#1B9D39","#15802E","#E6F7EA","#F3FBF5","27, 157, 57"],summer:["#218673","#196A5B","#E4F5F1","#F3FBF9","33, 134, 115"],autumn:["#FEA933","#D4890F","#FFF5E6","#FFFAF2","254, 169, 51"],winter:["#1BACAF","#15898B","#E0F6F7","#F0FAFA","27, 172, 175"]};var t=m[s]||m.summer;var r=document.documentElement;r.setAttribute("data-season",s);r.style.setProperty("--c-primary",t[0]);r.style.setProperty("--c-primary-dark",t[1]);r.style.setProperty("--c-primary-soft",t[2]);r.style.setProperty("--c-primary-bg",t[3]);r.style.setProperty("--c-primary-rgb",t[4]);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ToastProvider>
          <AuthProvider>
            <LibraryProvider>
              <AppShell>{children}</AppShell>
            </LibraryProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
