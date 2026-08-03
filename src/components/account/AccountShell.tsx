"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { AvatarUpload } from "@/components/account/AvatarUpload";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/Toast";
import type { IconName } from "@/data/icons";

export type AccountTab = "org" | "personal" | "members" | "creations";

const TABS: { key: AccountTab; label: string; ico: IconName }[] = [
  { key: "org", label: "组织信息", ico: "building" },
  { key: "personal", label: "个人信息", ico: "user" },
  { key: "members", label: "成员管理", ico: "user" },
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
  const toast = useToast();
  const { user, ready, openLogin, updateUser } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      openLogin("enterprise");
      router.replace("/");
    }
  }, [ready, user, router, openLogin]);

  const orgName = user?.orgName || user?.company || "企业账户";
  const avatarText = (user?.nickname || orgName).slice(0, 1);

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
              <button type="button" className="am-exit" onClick={() => router.push("/")}>
                <Icon name="chevron" size={14} className="am-exit-ico" /> 退出管理
              </button>
            </div>
            <span className="am-plan-badge">
              <Icon name="sparkle" size={11} /> {user?.planLabel || "企业版"}
            </span>
          </div>
        </div>

        <nav className="am-nav">
          {TABS.map((t) => (
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
          <Icon name="headset" size={16} /> 点击联系企业客服
        </button>
      </aside>

      <main className="am-main">{user ? children : null}</main>
    </div>
  );
}

export function useAccountTab(): [AccountTab, (t: AccountTab) => void] {
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("tab") || "org";
  const initial: AccountTab =
    raw === "personal" || raw === "members" || raw === "creations" || raw === "org"
      ? raw
      : raw === "team"
        ? "members"
        : "org";
  const [tab, setTab] = useState<AccountTab>(initial);

  useEffect(() => {
    const next =
      raw === "personal" || raw === "members" || raw === "creations" || raw === "org"
        ? raw
        : raw === "team"
          ? "members"
          : "org";
    setTab(next);
  }, [raw]);

  const change = (t: AccountTab) => {
    setTab(t);
    const q = t === "org" ? "/account" : `/account?tab=${t}`;
    router.replace(q);
  };

  return [tab, change];
}
