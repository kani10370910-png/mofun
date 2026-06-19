import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { LibraryProvider } from "@/lib/store";

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
    <html lang="zh-CN">
      <body>
        <ToastProvider>
          <LibraryProvider>
            <AppShell>{children}</AppShell>
          </LibraryProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
