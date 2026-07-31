"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/lib/AuthContext";
import type { IconName } from "@/data/icons";

type NavKey = "account" | "enterprise" | "ai" | "team";

export function AccountShell({
  title,
  companyLine,
  active,
  children,
}: {
  title: string;
  companyLine?: string;
  active: NavKey;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready } = useAuth();

  useEffect(() => {
    if (ready && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
    }
  }, [ready, user, router, pathname]);

  const company = companyLine || (user ? `${user.company}（${user.companyId}）` : "");
  const entOpen = ["enterprise", "team", "ai"].includes(active);

  const item = (key: NavKey, href: string, label: string, ico: IconName, nested = false) => (
    <Link href={href} className={`acc-nav-item ${nested ? "nested" : ""} ${active === key ? "on" : ""}`}>
      <Icon name={ico} size={16} />
      <span>{label}</span>
    </Link>
  );

  return (
    <div className="acc-page">
      <header className="acc-top">
        <button type="button" className="acc-back" onClick={() => router.push("/")}>
          <Icon name="chevron" size={16} className="acc-back-ico" /> 返回首页
        </button>
        <h1 className="acc-title">{title}</h1>
        {company ? (
          <div className="acc-company">
            <Icon name="building" size={15} />
            <span>{company}</span>
            <span className="acc-company-avatar">企</span>
          </div>
        ) : (
          <div />
        )}
      </header>

      <div className="acc-body">
        <aside className="acc-side">
          <div className="acc-side-label">菜单</div>
          {item("account", "/account", "个人中心", "user")}
          <div className={`acc-nav-group ${entOpen ? "open" : ""}`}>
            {item("enterprise", "/enterprise?tab=team", "企业管理", "building")}
            <div className="acc-nav-sub">
              {item("ai", "/enterprise?tab=ai", "AI 权益", "sparkle", true)}
              {item("team", "/enterprise?tab=team", "团队成员管理", "user", true)}
            </div>
          </div>
        </aside>
        <section className="acc-main">{user ? children : null}</section>
      </div>
    </div>
  );
}
