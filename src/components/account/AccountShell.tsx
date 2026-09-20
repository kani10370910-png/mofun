"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/lib/AuthContext";
import { resolvePlanLabel, hasEnterpriseInfo } from "@/lib/auth";
import { accountReturnPath, accountTabHref } from "@/lib/accountNav";
import { asset } from "@/lib/asset";
import type { IconName } from "@/data/icons";

export type AccountTab = "personal" | "members" | "creations" | "member" | "space" | "invite";

const TABS: { key: AccountTab; label: string; ico: IconName; enterpriseOnly?: boolean }[] = [
  { key: "personal", label: "个人信息", ico: "user" },
  { key: "members", label: "成员管理", ico: "user", enterpriseOnly: true },
  { key: "creations", label: "品牌资产", ico: "image", enterpriseOnly: true },
  { key: "member", label: "会员中心", ico: "coin" },
  { key: "space", label: "存储空间", ico: "storage" },
  { key: "invite", label: "邀请有礼", ico: "gift" },
];

export function AccountShell({
  children,
  active,
  onTabChange,
  onContact,
}: {
  children: React.ReactNode;
  active: AccountTab;
  onTabChange: (tab: AccountTab) => void;
  onContact: () => void;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const { user, ready, openLogin } = useAuth();
  const returnTo = accountReturnPath(sp.get("from"));
  const leaveHref = asset(returnTo || "/");

  function leaveManagement(e?: { preventDefault?: () => void; stopPropagation?: () => void }) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    window.location.href = leaveHref;
  }

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      openLogin();
      router.replace(returnTo);
    }
  }, [ready, user, router, openLogin, returnTo]);

  const planLabel = resolvePlanLabel(user);
  const isEnterprise = hasEnterpriseInfo(user);
  const visibleTabs = TABS.filter((t) => isEnterprise || !t.enterpriseOnly);

  useEffect(() => {
    if (!isEnterprise && (active === "members" || active === "creations")) onTabChange("personal");
  }, [isEnterprise, active, onTabChange]);

  return (
    <div className="am-page">
      <aside className="am-side">
        <div className="am-side-top">
          <span className="am-side-title">个人中心</span>
          <a
            className="am-exit"
            href={leaveHref}
            onPointerDown={leaveManagement}
            onClick={leaveManagement}
          >
            <Icon name="chevron" size={14} className="am-exit-ico" /> 退出管理
          </a>
        </div>

        <nav className="am-nav">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={active === t.key ? "am-nav-item on" : "am-nav-item"}
              onClick={() => onTabChange(t.key)}
            >
              <Icon name={t.ico} size={16} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <button type="button" className="am-cs-btn" onClick={onContact}>
          <Icon name="headset" size={16} />{" "}
          {planLabel === "企业版" ? "点击联系企业客服" : "点击联系客服"}
        </button>
      </aside>

      <main className="am-main">{user ? children : null}</main>
    </div>
  );
}

export function useAccountTab(): [AccountTab, (t: AccountTab) => void] {
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("tab") || "personal";
  const initial: AccountTab =
    raw === "personal" ||
    raw === "members" ||
    raw === "creations" ||
    raw === "brand" ||
    raw === "member" ||
    raw === "space" ||
    raw === "invite" ||
    raw === "membershipCard"
      ? raw === "membershipCard"
        ? "member"
        : raw === "brand"
          ? "creations"
          : raw
      : raw === "team"
        ? "members"
        : "personal";
  const [tab, setTab] = useState<AccountTab>(initial);

  useEffect(() => {
    if (raw === "org") {
      router.replace(accountTabHref("personal", sp.get("from")));
      setTab("personal");
      return;
    }
    const next =
      raw === "personal" ||
      raw === "members" ||
      raw === "creations" ||
      raw === "brand" ||
      raw === "member" ||
      raw === "space" ||
      raw === "invite" ||
      raw === "membershipCard"
        ? raw === "membershipCard"
          ? "member"
          : raw === "brand"
            ? "creations"
            : raw
        : raw === "team"
          ? "members"
          : "personal";
    setTab(next);
  }, [raw, router, sp]);

  const change = (t: AccountTab) => {
    setTab(t);
    router.replace(accountTabHref(t, sp.get("from")));
  };

  return [tab, change];
}
