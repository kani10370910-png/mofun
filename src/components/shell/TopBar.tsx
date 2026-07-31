"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { asset } from "@/lib/asset";
import { useAuth } from "@/lib/AuthContext";
import {
  HOME_SEASON_EVENT,
  HOME_SEASONS,
  type HomeSeason,
  readHomeSeason,
  writeHomeSeason,
} from "@/lib/homeSeason";

const LOGO = "/brand-logo.png";

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
  const router = useRouter();
  const { user, logout, ready } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [season, setSeason] = useState<HomeSeason>("summer");
  const menuRef = useRef<HTMLDivElement>(null);
  const seasonRef = useRef<HTMLDivElement>(null);
  const isHome = pathname === "/";

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  useEffect(() => {
    setSeason(readHomeSeason());
    const onSeason = (e: Event) => {
      const next = (e as CustomEvent<HomeSeason>).detail;
      if (next) setSeason(next);
    };
    window.addEventListener(HOME_SEASON_EVENT, onSeason);
    return () => window.removeEventListener(HOME_SEASON_EVENT, onSeason);
  }, []);

  useEffect(() => {
    if (!menuOpen && !seasonOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuOpen && !menuRef.current?.contains(t)) setMenuOpen(false);
      if (seasonOpen && !seasonRef.current?.contains(t)) setSeasonOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      setSeasonOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, seasonOpen]);

  const displayName = user?.realName || "访客";
  const avatarText = user?.realName?.slice(0, 1) || "访";
  const seasonLabel = HOME_SEASONS.find((t) => t.id === season)?.label ?? "葱茏之夏";

  return (
    <header className={isHome ? "topbar topbar-home" : "topbar"}>
      <div className="topbar-inner">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset(LOGO)} alt="魔方智绘" className="brand-logo" />
          <span className="brand-title">魔方智绘</span>
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
          <div className={`season-dd ${seasonOpen ? "open" : ""}`} ref={seasonRef}>
            <button
              type="button"
              className="season-dd-trigger"
              aria-label="风格切换"
              aria-expanded={seasonOpen}
              onClick={() => {
                setSeasonOpen((v) => !v);
                setMenuOpen(false);
              }}
            >
              <span>{seasonLabel}</span>
              <Icon name="chevron" size={14} className={`season-dd-caret ${seasonOpen ? "up" : ""}`} />
            </button>
            {seasonOpen && (
              <div className="season-dd-menu" role="listbox" aria-label="选择季节风格">
                {HOME_SEASONS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={season === t.id}
                    className={season === t.id ? "season-dd-item on" : "season-dd-item"}
                    onClick={() => {
                      setSeason(t.id);
                      writeHomeSeason(t.id);
                      setSeasonOpen(false);
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="user-card" ref={menuRef}>
            <button
              type="button"
              className={`user-trigger ${menuOpen ? "open" : ""}`}
              onClick={() => {
                if (!ready) return;
                if (!user) {
                  router.push("/login");
                  return;
                }
                setSeasonOpen(false);
                setMenuOpen((v) => !v);
              }}
            >
              <div className="avatar">{avatarText}</div>
              <div className="user-meta">
                <span className="user-name">{displayName}</span>
              </div>
              <Icon name="chevron" size={14} className={`user-caret ${menuOpen ? "up" : ""}`} />
            </button>

            {isHome && (
              <div className="loc-weather">
                <span className="lw-loc">
                  <Icon name="pin" size={13} /> 安吉县
                </span>
                <span className="lw-weather">
                  <Icon name="thermo" size={13} /> <span className="lw-temp">28℃</span> 多云
                </span>
              </div>
            )}

            {menuOpen && user && (
              <div className="user-menu">
                <div className="user-menu-head">
                  <div className="user-menu-name">{user.roleTitle}</div>
                  <div className="user-menu-email">{user.email}</div>
                </div>
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/account");
                  }}
                >
                  <Icon name="user" size={16} /> 个人中心
                </button>
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/enterprise?tab=team");
                  }}
                >
                  <Icon name="building" size={16} /> 企业管理
                </button>
                <div className="user-menu-sep" />
                <button
                  type="button"
                  className="user-menu-item danger"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                    router.push("/login");
                  }}
                >
                  <Icon name="logout" size={16} /> 退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
