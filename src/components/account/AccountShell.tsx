"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { AvatarUpload } from "@/components/account/AvatarUpload";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { resolvePlanLabel, hasEnterpriseInfo } from "@/lib/auth";
import { accountReturnPath, accountTabHref } from "@/lib/accountNav";
import type { IconName } from "@/data/icons";

export type AccountTab = "org" | "personal" | "members" | "creations" | "member";

const TABS: { key: AccountTab; label: string; ico: IconName; enterpriseOnly?: boolean }[] = [
  { key: "personal", label: "个人信息", ico: "user" },
  { key: "member", label: "会员中心", ico: "sparkle" },
  { key: "org", label: "组织信息", ico: "building" },
  { key: "members", label: "成员管理", ico: "user", enterpriseOnly: true },
  { key: "creations", label: "创作管理", ico: "image" },
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
  const toast = useToast();
  const { user, ready, openLogin, updateUser } = useAuth();
  const returnTo = accountReturnPath(sp.get("from"));

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      openLogin("phone");
      router.replace(returnTo);
    }
  }, [ready, user, router, openLogin, returnTo]);

  const orgName = user?.orgName || user?.nickname || user?.company || "个人账户";
  const avatarText = (user?.nickname || orgName).slice(0, 1);
  const planLabel = resolvePlanLabel(user);
  const isEnterprise = hasEnterpriseInfo(user);
  const visibleTabs = TABS.filter((t) => isEnterprise || !t.enterpriseOnly);

  useEffect(() => {
    if (!user || isEnterprise) return;
    if (active === "members") {
      onTabChange("personal");
    }
  }, [user, isEnterprise, active, onTabChange]);

  return (
    <div className="am-page">
      <aside className="am-side">
        <div className="am-side-head">
          <AvatarUpload
            className="am-side-avatar"
            src={user?.avatarUrl}
            fallback={avatarText}
            onUploaded={(url) => {
              updateUser({ avatarUrl: url });
              toast("头像已更新");
            }}
            onError={(m) => toast(m, "warn")}
          />
          <div className="am-side-meta">
            <div className="am-side-name-row">
              <span className="am-side-name">{orgName}</span>
              <button type="button" className="am-exit" onClick={() => router.push(returnTo)}>
                <Icon name="chevron" size={14} className="am-exit-ico" /> 退出管理
              </button>
            </div>
            <span className="am-plan-badge">
              <Icon name="sparkle" size={11} /> {planLabel}
            </span>
          </div>
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
    raw === "org" ||
    raw === "member" ||
    raw === "membershipCard"
      ? raw === "membershipCard"
        ? "member"
        : raw
      : raw === "team"
        ? "members"
        : "personal";
  const [tab, setTab] = useState<AccountTab>(initial);

  useEffect(() => {
    const next =
      raw === "personal" ||
      raw === "members" ||
      raw === "creations" ||
      raw === "org" ||
      raw === "member" ||
      raw === "membershipCard"
        ? raw === "membershipCard"
          ? "member"
          : raw
        : raw === "team"
          ? "members"
          : "personal";
    setTab(next);
  }, [raw]);

  const change = (t: AccountTab) => {
    setTab(t);
    router.replace(accountTabHref(t, sp.get("from")));
  };

  return [tab, change];
}
