"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LOGO =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHJ4PSIxMCIgZmlsbD0iIzE4ODc3MiIvPgogIDwhLS0g6a2U5pa5IC8g56uL5pa55L2T6YCg5Z6LIC0tPgogIDxwYXRoIGQ9Ik0yMCA3TDMxIDEzVjI3TDIwIDMzTDkgMjdWMTNMMjAgN1oiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xNCIvPgogIDxwYXRoIGQ9Ik0yMCA3TDMxIDEzTDIwIDE5TDkgMTNMMjAgN1oiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC45Ii8+CiAgPHBhdGggZD0iTTkgMTNMMjAgMTlWMzNMOSAyN1YxM1oiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC41NSIvPgogIDxwYXRoIGQ9Ik0zMSAxM0wyMCAxOVYzM0wzMSAyN1YxM1oiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4zMiIvPgo8L3N2Zz4K";

const NAV: { view: string; href: string; label: string }[] = [
  { view: "home", href: "/", label: "首页" },
  { view: "template", href: "/template", label: "模版" },
  { view: "content", href: "/content", label: "文案策划" },
  { view: "image", href: "/image", label: "品牌设计" },
  { view: "video", href: "/video", label: "视频宣传" },
  { view: "research", href: "/research", label: "市场调研" },
  { view: "storage", href: "/storage", label: "仓库" },
];

export function TopBar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="MOFUN" className="brand-logo" />
          <div className="brand-text">
            <span className="brand-name">MOFUN 魔方</span>
            <span className="brand-sub">智绘平台</span>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((n) => (
            <Link
              key={n.view}
              href={n.href}
              className={isActive(n.href) ? "nav-item active" : "nav-item"}
            >
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>

        <div className="topbar-right">
          <div className="region-chip">
            <span className="dot" /> 浙江 · 安吉县
          </div>
          <div className="user-card">
            <div className="avatar">安</div>
            <div className="user-meta">
              <span className="user-name">安吉文旅运营</span>
              <span className="user-plan">机构版</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
