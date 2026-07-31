"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { AccountShell } from "@/components/account/AccountShell";
import { useAuth } from "@/lib/AuthContext";
import type { AuthUser } from "@/lib/auth";

export default function AccountPage() {
  const toast = useToast();
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (user) setForm(user);
  }, [user]);

  if (!form) {
    return (
      <AccountShell title="个人中心" active="account">
        <div className="preview-empty" style={{ minHeight: 280 }}>
          加载中…
        </div>
      </AccountShell>
    );
  }

  const set = <K extends keyof AuthUser>(k: K, v: AuthUser[K]) => setForm({ ...form, [k]: v });

  return (
    <AccountShell title="个人中心" active="account">
      <div className="acc-grid">
        <div className="acc-col">
          <div className="acc-card acc-profile">
            <div className="acc-avatar">{form.realName.slice(0, 1) || "企"}</div>
            <div className="acc-profile-name">{form.roleTitle}</div>
            <div className="acc-profile-company">{form.company}</div>
            <span className="acc-badge">{form.roleBadge}</span>
          </div>
          <div className="acc-card acc-links">
            <button type="button" className="acc-link-row" onClick={() => toast("账号安全设置即将开放")}>
              <Icon name="shield" size={16} /> 账号安全
            </button>
            <button type="button" className="acc-link-row" onClick={() => toast("消息通知设置即将开放")}>
              <Icon name="bell" size={16} /> 消息通知
            </button>
          </div>
        </div>

        <div className="acc-card acc-form-card">
          <div className="acc-form-head">
            <h2>基本资料</h2>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                updateUser(form);
                toast("资料已保存");
              }}
            >
              <Icon name="save" size={14} /> 保存修改
            </button>
          </div>

          <div className="acc-fields">
            <label>
              <span>用户名</span>
              <input value={form.username} onChange={(e) => set("username", e.target.value)} />
            </label>
            <label>
              <span>真实姓名</span>
              <input value={form.realName} onChange={(e) => set("realName", e.target.value)} />
            </label>
            <label>
              <span>联系电话</span>
              <div className="acc-input-ico">
                <Icon name="phone" size={15} />
                <input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
            </label>
            <label>
              <span>工作邮箱</span>
              <div className="acc-input-ico">
                <Icon name="mail" size={15} />
                <input value={form.workEmail} onChange={(e) => set("workEmail", e.target.value)} />
              </div>
            </label>
            <label className="full">
              <span>企业地址</span>
              <div className="acc-input-ico">
                <Icon name="pin" size={15} />
                <input value={form.address} onChange={(e) => set("address", e.target.value)} />
              </div>
            </label>
          </div>
        </div>
      </div>
    </AccountShell>
  );
}
