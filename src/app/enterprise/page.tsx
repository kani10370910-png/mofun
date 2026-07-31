"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { AccountShell } from "@/components/account/AccountShell";
import { DEMO_TEAM } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";

function EnterpriseInner() {
  const toast = useToast();
  const sp = useSearchParams();
  const tab = (sp.get("tab") || "team") as "team" | "ai";
  const active = tab === "ai" ? "ai" : "team";
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [members] = useState(DEMO_TEAM);

  const filtered = useMemo(() => {
    const s = q.trim();
    if (!s) return members;
    return members.filter(
      (m) => m.name.includes(s) || m.department.includes(s) || String(m.role).includes(s),
    );
  }, [members, q]);

  const companyLine = user ? `${user.company}（${user.companyId}）` : undefined;

  return (
    <AccountShell title="企业管理控制台" companyLine={companyLine} active={active}>
      {active === "team" ? (
        <div className="acc-card ent-card">
          <div className="ent-toolbar">
            <h2>
              <Icon name="user" size={17} /> 团队成员列表
            </h2>
            <div className="ent-tools">
              <label className="ent-search">
                <Icon name="search" size={14} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索成员..." />
              </label>
              <button type="button" className="ent-icon-btn" onClick={() => toast("成员设置即将开放")} aria-label="设置">
                <Icon name="gear" size={16} />
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => toast("添加成员即将开放")}>
                <Icon name="plus" size={14} /> 添加成员
              </button>
            </div>
          </div>

          <div className="ent-table-wrap">
            <table className="ent-table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>部门</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="ent-name">
                        <span className="ent-avatar">{m.name.slice(0, 1)}</span>
                        {m.name}
                      </div>
                    </td>
                    <td>{m.department}</td>
                    <td>
                      <span className={`ent-role ${m.role === "超级管理员" ? "super" : ""}`}>{m.role}</span>
                    </td>
                    <td>
                      <span className="ent-status">
                        <i /> {m.status}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="ent-more" onClick={() => toast(`「${m.name}」操作菜单即将开放`)}>
                        <Icon name="dots" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="acc-card" style={{ padding: 28, minHeight: 320 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>AI 权益</h2>
          <p style={{ margin: 0, color: "var(--c-muted)", fontSize: 14 }}>功能建设中，后续开放配额管理能力。</p>
        </div>
      )}
    </AccountShell>
  );
}

export default function EnterprisePage() {
  return (
    <Suspense fallback={null}>
      <EnterpriseInner />
    </Suspense>
  );
}
