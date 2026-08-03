"use client";

import { Suspense, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { AccountShell, useAccountTab } from "@/components/account/AccountShell";
import { AvatarUpload } from "@/components/account/AvatarUpload";
import { DEMO_TEAM } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { useLibrary } from "@/lib/store";
import { contentScenes } from "@/data/content";
import { imageTypes } from "@/data/image";
import { researchTypes } from "@/data/research";
import { videoTypes } from "@/data/video";

/** 全站二级功能标题（文案 / 品牌设计 / 视频 / 调研） */
const CREATION_CATS: { name: string; match: RegExp }[] = [
  ...contentScenes.map((s) => ({
    name: s.title,
    match:
      s.key === "social"
        ? /社媒|朋友圈|小红书|抖音|推文|配图|推广海报/
        : s.key === "official"
          ? /公众号|帮写/
          : /品牌推广|策划方案|内容创作\s*·\s*品牌/,
  })),
  ...imageTypes.map((t) => ({
    name: t.name,
    match:
      t.key === "event"
        ? /活动|海报|长图|菜单|易拉宝|宣传单|event/
        : t.key === "product"
          ? /商拍|商品|白底|主图|product/
          : t.key === "logo"
            ? /logo|标志/
            : t.key === "ip"
              ? /ip|吉祥物/
              : t.key === "font"
                ? /字体|font|艺术字/
                : /店招|门头|通栏|signage/,
  })),
  ...videoTypes.map((t) => ({
    name: t.name,
    match:
      t.key === "oneline"
        ? /一句话成片|视频生成\s*·\s*一句话/
        : t.key === "studio"
          ? /制作大片|大片|studio/
          : /数字人|口播|avatar/,
  })),
  ...researchTypes.map((t) => ({
    name: t.name,
    match:
      t.key === "brand"
        ? /品牌市场调研|品牌调研/
        : t.key === "industry"
          ? /产业调研/
          : /爆款分析|爆款/,
  })),
];

function ContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="am-cs-overlay" role="dialog" aria-modal="true" aria-label="企业客服">
      <button type="button" className="am-cs-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="am-cs-card">
        <button type="button" className="am-cs-close" onClick={onClose} aria-label="关闭">
          <Icon name="close" size={16} />
        </button>
        <h3>联系企业客服</h3>
        <p>扫码添加企业客服微信，或工作日 9:00–18:00 拨打热线。</p>
        <div className="am-cs-qr" aria-hidden>
          <span>QR</span>
        </div>
        <div className="am-cs-phone">客服热线：400-000-0000（演示）</div>
      </div>
    </div>
  );
}

function EnterpriseCertModal({
  open,
  onClose,
  defaultName,
}: {
  open: boolean;
  onClose: () => void;
  defaultName?: string;
}) {
  const toast = useToast();
  const { updateUser } = useAuth();
  const [companyName, setCompanyName] = useState(defaultName || "");
  const [creditCode, setCreditCode] = useState("");
  const [legalName, setLegalName] = useState("");
  const [legalId, setLegalId] = useState("");
  const [licenseName, setLicenseName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  function onSubmit() {
    if (!companyName.trim()) {
      toast("请填写企业名称", "warn");
      return;
    }
    if (!creditCode.trim()) {
      toast("请填写统一社会信用代码", "warn");
      return;
    }
    if (!legalName.trim()) {
      toast("请填写法人姓名", "warn");
      return;
    }
    if (!legalId.trim()) {
      toast("请填写法人身份证号", "warn");
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      updateUser({
        enterpriseVerified: true,
        orgName: companyName.trim(),
        company: companyName.trim(),
      });
      setBusy(false);
      toast("认证信息已提交（演示）");
      onClose();
    }, 400);
  }

  return (
    <div className="am-cs-overlay" role="dialog" aria-modal="true" aria-labelledby="am-cert-title">
      <button type="button" className="am-cs-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="am-cert-card">
        <button type="button" className="am-cs-close" onClick={onClose} aria-label="关闭">
          <Icon name="close" size={16} />
        </button>
        <h3 id="am-cert-title">企业认证</h3>
        <div className="am-cert-notice">
          <span className="am-cert-notice-ico" aria-hidden>
            ☀
          </span>
          <p>
            感谢您使用魔方智绘平台，为营造安全的环境，根据国家相关法律法规要求，平台需进行企业认证，未完成认证将无法正常使用企业级功能。
          </p>
        </div>
        <div className="am-cert-form">
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="企业名称"
            autoFocus
          />
          <input
            value={creditCode}
            onChange={(e) => setCreditCode(e.target.value)}
            placeholder="统一社会信用代码"
          />
          <input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="法人姓名"
          />
          <input
            value={legalId}
            onChange={(e) => setLegalId(e.target.value)}
            placeholder="法人身份证号"
          />
          <label className="am-cert-upload">
            <input
              type="file"
              accept="image/*,.pdf"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                setLicenseName(f ? f.name : "");
              }}
            />
            <Icon name="upload" size={22} />
            <span>{licenseName || "点击上传营业执照扫描件"}</span>
          </label>
        </div>
        <button type="button" className="am-cert-submit" disabled={busy} onClick={onSubmit}>
          {busy ? "提交中…" : "提交信息"}
        </button>
        <p className="am-cert-foot">用户须知：平台进行用户实名认证仅用于安全风控</p>
      </div>
    </div>
  );
}

function OrgPanel({ onGoMembers }: { onGoMembers: () => void }) {
  const toast = useToast();
  const { user, updateUser } = useAuth();
  const [certOpen, setCertOpen] = useState(false);
  if (!user) return null;
  return (
    <div className="am-panel">
      <h1 className="am-title">组织信息</h1>
      <div className="am-org-hero">
        <AvatarUpload
          className="am-org-logo"
          rounded="md"
          src={user.avatarUrl}
          fallback={user.orgName}
          title="点击上传组织头像"
          onUploaded={(url) => {
            updateUser({ avatarUrl: url });
            toast("头像已更新");
          }}
          onError={(m) => toast(m, "warn")}
        />
        <div>
          <div className="am-org-name">{user.orgName}</div>
          <span className="am-plan-badge">
            <Icon name="sparkle" size={11} /> {user.planLabel}
          </span>
        </div>
      </div>
      <div className="am-rows">
        <div className="am-row">
          <span className="am-row-label">管理员账号</span>
          <span className="am-row-val">{user.username}</span>
        </div>
        <div className="am-row">
          <span className="am-row-label">创建时间</span>
          <span className="am-row-val">{user.createdAt}</span>
        </div>
        <div className="am-row">
          <span className="am-row-label">成员数</span>
          <span className="am-row-val">{user.memberCount}</span>
          <button type="button" className="am-row-btn" onClick={onGoMembers}>
            管理成员
          </button>
        </div>
        <div className="am-row">
          <span className="am-row-label">权益生效日期</span>
          <span className="am-row-val stacked">
            <span>开始：{user.benefitStart}</span>
            <span>到期：{user.expiresAt}</span>
          </span>
        </div>
        <div className="am-row">
          <span className="am-row-label">企业认证</span>
          <span className="am-row-val">{user.enterpriseVerified ? "已认证" : "未认证"}</span>
          <button
            type="button"
            className="am-row-btn"
            onClick={() => setCertOpen(true)}
            disabled={user.enterpriseVerified}
          >
            {user.enterpriseVerified ? "已认证" : "认证"}
          </button>
        </div>
      </div>
      <EnterpriseCertModal
        open={certOpen}
        onClose={() => setCertOpen(false)}
        defaultName={user.orgName}
      />
    </div>
  );
}

function PersonEditShell({
  title,
  open,
  onClose,
  children,
  onSave,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  onSave: () => void;
}) {
  if (!open) return null;
  return (
    <div className="am-cs-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="am-cs-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="am-pedit-card">
        <div className="am-pedit-head">
          <h3>{title}</h3>
          <button type="button" className="am-cs-close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="am-pedit-body">{children}</div>
        <div className="am-pedit-foot">
          <button type="button" className="am-pedit-save" onClick={onSave}>
            保存并生效
          </button>
        </div>
      </div>
    </div>
  );
}

function splitAccount(username: string): { local: string; suffix: string } {
  const i = username.lastIndexOf("@");
  if (i <= 0) return { local: username, suffix: "@test" };
  return { local: username.slice(0, i), suffix: username.slice(i) || "@test" };
}

function PersonalPanel() {
  const toast = useToast();
  const { user, updateUser } = useAuth();
  const [nickOpen, setNickOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [nick, setNick] = useState("");
  const [acctLocal, setAcctLocal] = useState("");
  const [acctConfirm, setAcctConfirm] = useState("");
  const [acctSuffix, setAcctSuffix] = useState("@test");
  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");

  if (!user) return null;

  function openNick() {
    setNick(user!.nickname || "");
    setNickOpen(true);
  }
  function openAcct() {
    const { local, suffix } = splitAccount(user!.username);
    setAcctLocal(local);
    setAcctConfirm("");
    setAcctSuffix(suffix);
    setAcctOpen(true);
  }
  function openPwd() {
    setPwd1("");
    setPwd2("");
    setPwdOpen(true);
  }

  return (
    <div className="am-panel">
      <h1 className="am-title">个人信息</h1>
      <AvatarUpload
        className="am-person-avatar"
        rounded="md"
        src={user.avatarUrl}
        fallback={user.nickname || user.realName}
        title="点击上传头像"
        onUploaded={(url) => {
          updateUser({ avatarUrl: url });
          toast("头像已更新");
        }}
        onError={(m) => toast(m, "warn")}
      />
      <div className="am-rows">
        <div className="am-row">
          <span className="am-row-label">用户昵称</span>
          <span className="am-row-val">{user.nickname}</span>
          <button type="button" className="am-row-btn" onClick={openNick}>
            编辑
          </button>
        </div>
        <div className="am-row">
          <span className="am-row-label">用户ID</span>
          <span className="am-row-val mono">{user.userId}</span>
          <button
            type="button"
            className="am-row-btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(user.userId);
                toast("已复制用户ID");
              } catch {
                toast("复制失败，请手动选择");
              }
            }}
          >
            复制
          </button>
        </div>
        <div className="am-row">
          <span className="am-row-label">登录账户</span>
          <span className="am-row-val">{user.username}</span>
          <button type="button" className="am-row-btn" onClick={openAcct}>
            修改
          </button>
        </div>
        <div className="am-row">
          <span className="am-row-label">登录密码</span>
          <span className="am-row-val">{user.loginPasswordMasked}</span>
          <button type="button" className="am-row-btn" onClick={openPwd}>
            修改
          </button>
        </div>
      </div>

      <PersonEditShell
        title="编辑用户昵称"
        open={nickOpen}
        onClose={() => setNickOpen(false)}
        onSave={() => {
          const next = nick.trim();
          if (!next) {
            toast("请输入昵称", "warn");
            return;
          }
          updateUser({ nickname: next, realName: next });
          toast("昵称已保存并生效");
          setNickOpen(false);
        }}
      >
        <div className="am-pedit-input-wrap">
          <input
            value={nick}
            maxLength={20}
            onChange={(e) => setNick(e.target.value.slice(0, 20))}
            placeholder="请输入昵称"
            autoFocus
          />
          <span className="am-pedit-count">
            {nick.length} / 20
          </span>
        </div>
      </PersonEditShell>

      <PersonEditShell
        title="修改账号"
        open={acctOpen}
        onClose={() => setAcctOpen(false)}
        onSave={() => {
          const a = acctLocal.trim();
          const b = acctConfirm.trim();
          if (!a) {
            toast("请输入账号", "warn");
            return;
          }
          if (a !== b) {
            toast("两次输入的账号不一致", "warn");
            return;
          }
          const full = `${a}${acctSuffix}`;
          updateUser({
            username: full,
            email: full,
            nickname: user.nickname === user.username ? full : user.nickname,
          });
          toast("账号已保存并生效");
          setAcctOpen(false);
        }}
      >
        <div className="am-pedit-acct">
          <div className="am-pedit-acct-row">
            <input
              value={acctLocal}
              onChange={(e) => setAcctLocal(e.target.value.replace(/@/g, ""))}
              placeholder="请输入账号"
              autoFocus
            />
            <span className="am-pedit-suffix">{acctSuffix}</span>
          </div>
          <div className="am-pedit-acct-row">
            <input
              value={acctConfirm}
              onChange={(e) => setAcctConfirm(e.target.value.replace(/@/g, ""))}
              placeholder="再次输入账号"
            />
            <span className="am-pedit-suffix">{acctSuffix}</span>
          </div>
        </div>
      </PersonEditShell>

      <PersonEditShell
        title="修改登录密码"
        open={pwdOpen}
        onClose={() => setPwdOpen(false)}
        onSave={() => {
          if (!pwd1) {
            toast("请输入新密码", "warn");
            return;
          }
          if (pwd1.length < 6) {
            toast("密码至少 6 位", "warn");
            return;
          }
          if (pwd1 !== pwd2) {
            toast("两次输入的密码不一致", "warn");
            return;
          }
          updateUser({ loginPasswordMasked: "*".repeat(Math.min(20, Math.max(8, pwd1.length))) });
          toast("密码已保存并生效");
          setPwdOpen(false);
        }}
      >
        <div className="am-pedit-acct">
          <input
            type="password"
            value={pwd1}
            onChange={(e) => setPwd1(e.target.value)}
            placeholder="请输入新密码"
            autoFocus
            autoComplete="new-password"
          />
          <input
            type="password"
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
            placeholder="再次输入新密码"
            autoComplete="new-password"
          />
        </div>
      </PersonEditShell>
    </div>
  );
}

function MembersPanel({ onContact }: { onContact: () => void }) {
  const toast = useToast();
  const { user, updateUser } = useAuth();
  const [members, setMembers] = useState(() => DEMO_TEAM.map((m) => ({ ...m })));
  const [editId, setEditId] = useState<string | null>(null);
  const [acctOpen, setAcctOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [acctLocal, setAcctLocal] = useState("");
  const [acctConfirm, setAcctConfirm] = useState("");
  const [acctSuffix, setAcctSuffix] = useState("@test");
  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");

  const editing = members.find((m) => m.id === editId) || null;

  function openAcct(m: (typeof members)[0]) {
    const { local, suffix } = splitAccount(m.account);
    setEditId(m.id);
    setAcctLocal(local);
    setAcctConfirm("");
    setAcctSuffix(suffix);
    setAcctOpen(true);
  }

  function openPwd(m: (typeof members)[0]) {
    setEditId(m.id);
    setPwd1("");
    setPwd2("");
    setPwdOpen(true);
  }

  function patchMember(id: string, patch: Partial<(typeof members)[0]>) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  return (
    <div className="am-panel">
      <h1 className="am-title">成员管理</h1>
      <div className="am-table-wrap">
        <table className="am-table">
          <thead>
            <tr>
              <th>成员昵称</th>
              <th>用户ID</th>
              <th>账号</th>
              <th>登录密码</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="am-member">
                    <AvatarUpload
                      className="am-member-av"
                      src={m.isPrimary ? user?.avatarUrl || m.avatarUrl : m.avatarUrl}
                      fallback={m.name}
                      title="点击上传头像"
                      onUploaded={(url) => {
                        patchMember(m.id, { avatarUrl: url });
                        if (m.isPrimary) {
                          updateUser({ avatarUrl: url });
                        }
                        toast("头像已更新");
                      }}
                      onError={(msg) => toast(msg, "warn")}
                    />
                    <span>{m.name}</span>
                    {m.isPrimary && <span className="am-primary-badge">主账号</span>}
                  </div>
                </td>
                <td className="mono">{m.userId || user?.userId}</td>
                <td>
                  <button type="button" className="am-cell-edit" onClick={() => openAcct(m)} title="修改账号">
                    {m.account}
                  </button>
                </td>
                <td>
                  <button type="button" className="am-cell-edit mono" onClick={() => openPwd(m)} title="修改登录密码">
                    {m.passwordPlain}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="am-add-hint" onClick={onContact}>
        请联系企业客服添加成员
      </button>

      <PersonEditShell
        title="修改账号"
        open={acctOpen}
        onClose={() => {
          setAcctOpen(false);
          setEditId(null);
        }}
        onSave={() => {
          if (!editing) return;
          const a = acctLocal.trim();
          const b = acctConfirm.trim();
          if (!a) {
            toast("请输入账号", "warn");
            return;
          }
          if (a !== b) {
            toast("两次输入的账号不一致", "warn");
            return;
          }
          const full = `${a}${acctSuffix}`;
          patchMember(editing.id, {
            account: full,
            name: editing.isPrimary ? full : editing.name,
          });
          if (editing.isPrimary && user) {
            updateUser({
              username: full,
              email: full,
              nickname: user.nickname === user.username ? full : user.nickname,
            });
          }
          toast("账号已保存并生效");
          setAcctOpen(false);
          setEditId(null);
        }}
      >
        <div className="am-pedit-acct">
          <div className="am-pedit-acct-row">
            <input
              value={acctLocal}
              onChange={(e) => setAcctLocal(e.target.value.replace(/@/g, ""))}
              placeholder="请输入账号"
              autoFocus
            />
            <span className="am-pedit-suffix">{acctSuffix}</span>
          </div>
          <div className="am-pedit-acct-row">
            <input
              value={acctConfirm}
              onChange={(e) => setAcctConfirm(e.target.value.replace(/@/g, ""))}
              placeholder="再次输入账号"
            />
            <span className="am-pedit-suffix">{acctSuffix}</span>
          </div>
        </div>
      </PersonEditShell>

      <PersonEditShell
        title="修改登录密码"
        open={pwdOpen}
        onClose={() => {
          setPwdOpen(false);
          setEditId(null);
        }}
        onSave={() => {
          if (!editing) return;
          if (!pwd1) {
            toast("请输入新密码", "warn");
            return;
          }
          if (pwd1.length < 6) {
            toast("密码至少 6 位", "warn");
            return;
          }
          if (pwd1 !== pwd2) {
            toast("两次输入的密码不一致", "warn");
            return;
          }
          patchMember(editing.id, { passwordPlain: pwd1 });
          if (editing.isPrimary) {
            updateUser({
              loginPasswordMasked: "*".repeat(Math.min(20, Math.max(8, pwd1.length))),
            });
          }
          toast("密码已保存并生效");
          setPwdOpen(false);
          setEditId(null);
        }}
      >
        <div className="am-pedit-acct">
          <input
            type="password"
            value={pwd1}
            onChange={(e) => setPwd1(e.target.value)}
            placeholder="请输入新密码"
            autoFocus
            autoComplete="new-password"
          />
          <input
            type="password"
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
            placeholder="再次输入新密码"
            autoComplete="new-password"
          />
        </div>
      </PersonEditShell>
    </div>
  );
}

function CreationsPanel() {
  const { works, isFavorite } = useLibrary();
  const [cat, setCat] = useState(CREATION_CATS[0]?.name || "全部");
  const [favOnly, setFavOnly] = useState(false);

  const list = useMemo(() => {
    let items = works;
    if (favOnly) items = items.filter((w) => isFavorite(w));
    const rule = CREATION_CATS.find((c) => c.name === cat);
    if (rule) {
      items = items.filter((w) => {
        const hay = `${w.sub || ""} ${w.name || ""} ${w.kind || ""}`;
        return rule.match.test(hay);
      });
    }
    return items.slice(0, 48);
  }, [works, favOnly, isFavorite, cat]);

  return (
    <div className="am-panel">
      <h1 className="am-title">创作管理</h1>
      <div className="am-create-toolbar">
        <div className="am-create-tabs">
          {CREATION_CATS.map((c) => (
            <button
              key={c.name}
              type="button"
              className={cat === c.name ? "am-create-tab on" : "am-create-tab"}
              onClick={() => setCat(c.name)}
            >
              {c.name}
            </button>
          ))}
        </div>
        <label className="am-fav-toggle">
          <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} />
          只显示收藏
        </label>
      </div>
      {list.length === 0 ? (
        <div className="am-empty">该分类暂无创作资产，可在对应功能中生成并保存后在此查看</div>
      ) : (
        <div className="am-create-grid">
          {list.map((w, i) => (
            <div key={`${w.kind}-${w.name}-${i}`} className="am-create-card">
              {w.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.img} alt={w.name} />
              ) : (
                <div className={`am-create-emoji ${w.grad || ""}`}>
                  {w.emoji || "🖼"}
                </div>
              )}
              <div className="am-create-name">{w.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountInner() {
  const [tab, setTab] = useAccountTab();
  const [csOpen, setCsOpen] = useState(false);

  const body = (() => {
    switch (tab) {
      case "personal":
        return <PersonalPanel />;
      case "members":
        return <MembersPanel onContact={() => setCsOpen(true)} />;
      case "creations":
        return <CreationsPanel />;
      default:
        return <OrgPanel onGoMembers={() => setTab("members")} />;
    }
  })();

  return (
    <>
      <AccountShell active={tab} onTabChange={setTab} onContact={() => setCsOpen(true)}>
        {body}
      </AccountShell>
      <ContactModal open={csOpen} onClose={() => setCsOpen(false)} />
    </>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountInner />
    </Suspense>
  );
}
