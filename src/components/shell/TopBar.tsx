"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { asset } from "@/lib/asset";
import { useAuth } from "@/lib/AuthContext";
import {
  HOME_CHAT_EVENT,
  HOME_CHAT_EXIT_EVENT,
  HOME_SEASON_EVENT,
  HOME_SEASONS,
  type HomeSeason,
  readHomeSeason,
  writeHomeSeason,
} from "@/lib/homeSeason";
import { accountRegionDisplay } from "@/lib/regionEnhance";

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
  const { user, logout, ready, openLogin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [season, setSeason] = useState<HomeSeason>("summer");
  const [homeChat, setHomeChat] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const seasonRef = useRef<HTMLDivElement>(null);
  const isHomePath = pathname === "/";
  const isHome = isHomePath && !homeChat;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" && !homeChat;
    return pathname.startsWith(href);
  };

  useEffect(() => {
    setSeason(readHomeSeason());
    const onSeason = (e: Event) => {
      const next = (e as CustomEvent<HomeSeason>).detail;
      if (next) setSeason(next);
    };
    const onChat = (e: Event) => {
      setHomeChat(Boolean((e as CustomEvent<boolean>).detail));
    };
    window.addEventListener(HOME_SEASON_EVENT, onSeason);
    window.addEventListener(HOME_CHAT_EVENT, onChat);
    return () => {
      window.removeEventListener(HOME_SEASON_EVENT, onSeason);
      window.removeEventListener(HOME_CHAT_EVENT, onChat);
    };
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

  const avatarText = (user?.nickname || user?.realName || "企").slice(0, 1);
  const seasonLabel = HOME_SEASONS.find((t) => t.id === season)?.label ?? "葱茏之夏";

  const topbarClass = isHome
    ? "topbar topbar-home"
    : isHomePath && homeChat
      ? "topbar topbar-chat"
      : "topbar";

  return (
    <header className={topbarClass}>
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
              onClick={(e) => {
                if (n.href !== "/" || !homeChat) return;
                e.preventDefault();
                window.dispatchEvent(new CustomEvent(HOME_CHAT_EXIT_EVENT));
              }}
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
            {!ready ? null : user ? (
              <>
                <button
                  type="button"
                  className={`acct-chip ${menuOpen ? "open" : ""}`}
                  onClick={() => {
                    setSeasonOpen(false);
                    setMenuOpen((v) => !v);
                  }}
                  aria-expanded={menuOpen}
                  aria-label="账户菜单"
                >
                  <span className="acct-chip-power" title="算力余额">
                    <Icon name="sparkle" size={14} />
                    <span>{user.computeBenefit || "∞"}</span>
                  </span>
                  <span className="acct-chip-sep" />
                  <span className="avatar">
                    {user.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatarUrl} alt="" />
                    ) : (
                      avatarText
                    )}
                  </span>
                </button>

                {menuOpen && (
                  <div className="acct-popover">
                    <div className="acct-pop-head">
                      <div className="avatar lg">
                        {user.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={user.avatarUrl} alt="" />
                        ) : (
                          avatarText
                        )}
                      </div>
                      <div className="acct-pop-meta">
                        <div className="acct-pop-name-row">
                          <span className="acct-pop-name">{user.nickname || user.username}</span>
                          <span className="acct-plan-badge">
                            <Icon name="sparkle" size={12} /> {user.planLabel || "企业版"}
                          </span>
                        </div>
                        <div className="acct-pop-sub">{user.planLabel || "企业版"}权益</div>
                      </div>
                    </div>

                    <div className="acct-benefit">
                      <div className="acct-benefit-top">
                        <span className="acct-benefit-ico">
                          <Icon name="sparkle" size={16} />
                        </span>
                        <div>
                          <div className="acct-benefit-title">{user.planLabel || "企业版"}权益</div>
                          <div className="acct-benefit-exp">{user.expiresAt} 到期</div>
                        </div>
                      </div>
                      <div className="acct-balance">
                        <div className="acct-bal-label">算力余额</div>
                        <div className="acct-bal-cols">
                          <div>
                            <span>权益算力</span>
                            <b>{user.computeBenefit}</b>
                          </div>
                          <div>
                            <span>赠送算力</span>
                            <b>{user.computeGift}</b>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="acct-pop-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          router.push("/account");
                        }}
                      >
                        <Icon name="building" size={18} />
                        <span>管理账户</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          router.push("/account?tab=creations");
                        }}
                      >
                        <Icon name="image" size={18} />
                        <span>企业资产</span>
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          setMenuOpen(false);
                          logout();
                        }}
                      >
                        <Icon name="logout" size={18} />
                        <span>退出登录</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary topbar-login-btn"
                onClick={() => openLogin("enterprise")}
              >
                登录
              </button>
            )}

            {isHome && !homeChat && (
              <div className="loc-weather">
                <span className="lw-loc">
                  <Icon name="pin" size={13} /> {accountRegionDisplay(user)}
                </span>
                <span className="lw-weather">
                  <Icon name="thermo" size={13} /> <span className="lw-temp">28℃</span> 多云
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
