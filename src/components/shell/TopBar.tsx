"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { asset } from "@/lib/asset";

const LOGO = "/brand-logo.png";

const THEMES = ["浅色风格", "深色风格", "护眼风格"];

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
          {/* 风格切换下拉（暂为 UI 占位，后续接真实主题切换） */}
          <select className="style-select" defaultValue={THEMES[0]} aria-label="风格切换">
            {THEMES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <div className="user-card">
            <div className="avatar">安</div>
            <div className="user-meta">
              <span className="user-name">安吉文旅运营</span>
              <span className="user-plan">机构版</span>
            </div>
            {/* 定位 + 天气：贴在用户卡片下方，仅首页显示（暂写死，后续按登录位置识别） */}
            {pathname === "/" && (
              <div className="loc-weather">
                <span className="lw-loc">
                  <Icon name="pin" size={13} /> 安吉县
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
