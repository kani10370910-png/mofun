"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { AccountShell, useAccountTab } from "@/components/account/AccountShell";
import { AvatarUpload } from "@/components/account/AvatarUpload";
import { EnterpriseCertFlow } from "@/components/account/EnterpriseCertFlow";
import { PersonalCertFlow } from "@/components/account/PersonalCertFlow";
import { MembershipPanel } from "@/components/account/MembershipPanel";
import { appConfirm } from "@/components/ui/Confirm";
import { formatPoints, getUsedPointsForUser } from "@/lib/points";
import {
  canDeleteMember,
  canEditMemberCredentials,
  canManageSubAccount,
  createMemberInOu,
  DEFAULT_MEMBER_PASSWORD,
  isOrgAdminActor,
  loadOrgStore,
  ORG_QUOTAS,
  removeMembership,
  resolveDefaultMemberOuId,
  resolveMemberAccountRole,
  roleLabel,
  setMembershipStatus,
  syncOrgAdminIdentity,
  syncOrgDisplayName,
  updateMemberAccount,
  updateMemberAccountRole,
  updateMemberDisplayName,
  updateMemberPassword,
  type AssignableAccountRole,
  type OrgStore,
} from "@/lib/org";
import { useAuth } from "@/lib/AuthContext";
import {
  resolvePlanLabel,
  resolveLoginAccount,
  isPhoneLoginUser,
  hasEnterpriseInfo,
  revokeEnterprisePatch,
  DEMO_CODE,
  isPlaceholderNickname,
  resolveDisplayName,
} from "@/lib/auth";
import { formatAccountRegionGeoLabel } from "@/lib/regionEnhance";
import { resolveRegionIdFromText } from "@/data/regionAssets";
import { formatPhoneRegionLabel, resolvePhoneRegionAsync, resolveUserPhoneNumber, resolveUserPhoneRegionAsync } from "@/lib/phoneRegion";
import { BrandPane } from "@/components/storage/BrandPane";
import { brands as seedBrands, BRAND_SEQ_START } from "@/data/storage";

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

function OrgPanel({ onGoMembers }: { onGoMembers: () => void }) {
  const toast = useToast();
  const { user, updateUser } = useAuth();
  const [certOpen, setCertOpen] = useState(false);
  const [personalCertOpen, setPersonalCertOpen] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrDraft, setAddrDraft] = useState("");
  const isEnterprise = !!user && hasEnterpriseInfo(user);
  const memberCountLabel = useMemo(() => {
    if (!user) return "—";
    if (!hasEnterpriseInfo(user)) return "1（仅自己，无成员席位）";
    const store = loadOrgStore(user);
    return `${store.members.length}/${ORG_QUOTAS.maxAccounts}`;
  }, [user, user?.memberCount]);

  useEffect(() => {
    if (!user || !hasEnterpriseInfo(user)) return;
    const store = loadOrgStore(user);
    const next = `${store.members.length}/${ORG_QUOTAS.maxAccounts}`;
    if (user.memberCount !== next) {
      updateUser({ memberCount: next });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 进入组织信息时校正成员数
  }, [user?.userId, isEnterprise]);

  if (!user) return null;
  const personalOk = !!user.personalVerified;
  const regionLabel = isEnterprise ? formatAccountRegionGeoLabel(user) : "";
  const displayName = resolveDisplayName(user);

  return (
    <div className="am-panel">
      <h1 className="am-title">组织信息</h1>
      <div className="am-org-hero">
        <AvatarUpload
          className="am-org-logo"
          rounded="md"
          src={user.avatarUrl}
          fallback={displayName}
          title="点击上传组织头像"
          onUploaded={(url) => {
            updateUser({ avatarUrl: url });
            toast("头像已更新");
          }}
          onError={(m) => toast(m, "warn")}
        />
        <div>
          <div className="am-org-name">{displayName}</div>
          <span className="am-plan-badge">
            <Icon name="sparkle" size={11} /> {resolvePlanLabel(user)}
          </span>
        </div>
      </div>
      <div className="am-rows">
        <div className="am-row">
          <span className="am-row-label">{isEnterprise ? "主账号" : "账号"}</span>
          <span className="am-row-val">{user.username}</span>
        </div>
        <div className="am-row">
          <span className="am-row-label">创建时间</span>
          <span className="am-row-val">{user.createdAt}</span>
        </div>
        <div className="am-row">
          <span className="am-row-label">{isEnterprise ? "成员数" : "席位"}</span>
          <span className="am-row-val">
            {memberCountLabel}
          </span>
          {isEnterprise ? (
            <button type="button" className="am-row-btn" onClick={onGoMembers}>
              管理成员
            </button>
          ) : null}
        </div>
        {isEnterprise && (
          <>
            <div className="am-row">
              <span className="am-row-label">企业地址</span>
              <span className="am-row-val">{user.address || "未填写"}</span>
              <button
                type="button"
                className="am-row-btn"
                onClick={() => {
                  setAddrDraft(user.address || "");
                  setAddrOpen(true);
                }}
              >
                编辑
              </button>
            </div>
            <div className="am-row">
              <span className="am-row-label">所属区县</span>
              <span className="am-row-val">{regionLabel}</span>
              <span className="am-op-muted" title="由企业注册地址自动匹配">
                企业位置
              </span>
            </div>
          </>
        )}
        <div className="am-row">
          <span className="am-row-label">权益生效日期</span>
          <span className="am-row-val">
            开始：{user.benefitStart} · 到期：{user.expiresAt}
          </span>
        </div>
        <div className="am-row">
          <span className="am-row-label">个人认证</span>
          <span className="am-row-val">{personalOk ? "已认证" : "未认证"}</span>
          <button type="button" className="am-row-btn" onClick={() => setPersonalCertOpen(true)}>
            {personalOk ? "修改" : "认证"}
          </button>
        </div>
        <div className="am-row">
          <span className="am-row-label">企业认证</span>
          <span className="am-row-val">{user.enterpriseVerified ? "已认证" : "未认证"}</span>
          {user.enterpriseVerified ? (
            <button
              type="button"
              className="am-row-btn"
              onClick={() => {
                const ok = window.confirm(
                  "确认退出企业认证？将恢复为个人版，成员协作入口会隐藏（演示）。"
                );
                if (!ok) return;
                updateUser(revokeEnterprisePatch());
                toast("已退出企业认证，当前为个人版");
              }}
            >
              退出认证
            </button>
          ) : (
            <button
              type="button"
              className="am-row-btn"
              onClick={() => {
                if (!personalOk) {
                  toast("请先完成个人实名认证", "warn");
                  setPersonalCertOpen(true);
                  return;
                }
                setCertOpen(true);
              }}
            >
              认证
            </button>
          )}
        </div>
      </div>
      <PersonalCertFlow open={personalCertOpen} onClose={() => setPersonalCertOpen(false)} />
      <EnterpriseCertFlow
        open={certOpen}
        onClose={() => setCertOpen(false)}
        defaultName={user.orgName}
      />
      <PersonEditShell
        title="编辑企业地址"
        open={addrOpen}
        onClose={() => setAddrOpen(false)}
        onSave={() => {
          const address = addrDraft.trim();
          if (!address) {
            toast("请填写企业注册地址", "warn");
            return;
          }
          updateUser({
            address,
            regionId: resolveRegionIdFromText([address, user.company, user.orgName].filter(Boolean).join(" ")),
          });
          toast("企业地址已更新，所属区县已同步");
          setAddrOpen(false);
        }}
        saveLabel="保存"
        showCancel
      >
        <div className="am-pedit-acct">
          <p className="am-pedit-hint">填写营业执照上的注册地址，系统将自动匹配所属省 / 市 / 区县。</p>
          <input
            value={addrDraft}
            onChange={(e) => setAddrDraft(e.target.value)}
            placeholder="如：浙江省湖州市安吉县"
            autoFocus
          />
        </div>
      </PersonEditShell>
    </div>
  );
}

function PersonEditShell({
  title,
  open,
  onClose,
  children,
  onSave,
  saveLabel = "保存并生效",
  showCancel = false,
  wide = false,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  onSave: () => void;
  saveLabel?: string;
  showCancel?: boolean;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="am-cs-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="am-cs-backdrop" aria-label="关闭" onClick={onClose} />
      <div className={`am-pedit-card${wide ? " am-pedit-card--wide" : ""}`}>
        <div className="am-pedit-head">
          <h3>{title}</h3>
          <button type="button" className="am-cs-close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="am-pedit-body">{children}</div>
        <div className="am-pedit-foot">
          {showCancel && (
            <button type="button" className="am-pedit-cancel" onClick={onClose}>
              取消
            </button>
          )}
          <button type="button" className="am-pedit-save" onClick={onSave}>
            {saveLabel}
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
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [personalCertOpen, setPersonalCertOpen] = useState(false);
  const [nick, setNick] = useState("");
  const [acctLocal, setAcctLocal] = useState("");
  const [acctConfirm, setAcctConfirm] = useState("");
  const [acctSuffix, setAcctSuffix] = useState("@test");
  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneCountdown, setPhoneCountdown] = useState(0);

  const [phoneRegionLabel, setPhoneRegionLabel] = useState("加载中…");

  useEffect(() => {
    if (phoneCountdown <= 0) return;
    const t = window.setTimeout(() => setPhoneCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [phoneCountdown]);

  useEffect(() => {
    if (!user) return;
    if (hasEnterpriseInfo(user)) {
      setPhoneRegionLabel(formatAccountRegionGeoLabel(user));
      return;
    }
    const phone = resolveUserPhoneNumber(user);
    if (!phone) {
      setPhoneRegionLabel("请先绑定手机号");
      return;
    }
    let cancelled = false;
    setPhoneRegionLabel("识别中…");
    void resolveUserPhoneRegionAsync(user)
      .then((info) => {
        if (!cancelled) setPhoneRegionLabel(formatPhoneRegionLabel(info));
      })
      .catch(() => {
        if (!cancelled) setPhoneRegionLabel("号段库加载失败，请刷新重试");
      });
    return () => {
      cancelled = true;
    };
  }, [user, user?.phone, user?.username, user?.enterpriseVerified, user?.address, user?.company, user?.regionId]);

  if (!user) return null;
  const isEnterprise = hasEnterpriseInfo(user);
  const phoneLogin = isPhoneLoginUser(user);
  const loginAccount = resolveLoginAccount(user);

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
  function openPhone() {
    setPhoneDraft(user!.phone || "");
    setPhoneCode("");
    setPhoneCountdown(0);
    setPhoneOpen(true);
  }

  function sendPhoneCode() {
    if (phoneCountdown > 0) return;
    if (!/^1\d{10}$/.test(phoneDraft.trim())) {
      toast("请输入正确的 11 位手机号", "warn");
      return;
    }
    setPhoneCode(DEMO_CODE);
    setPhoneCountdown(60);
    toast(`验证码已发送（演示码：${DEMO_CODE}）`);
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
          <span className="am-row-val">
            {user.nickname?.trim() && !isPlaceholderNickname(user)
              ? user.nickname
              : "未设置"}
          </span>
          <button type="button" className="am-row-btn" onClick={openNick}>
            编辑
          </button>
        </div>
        <div className="am-row">
          <span className="am-row-label">登录账户</span>
          <span className="am-row-val">{loginAccount || "未绑定手机号"}</span>
          <button
            type="button"
            className="am-row-btn"
            onClick={phoneLogin ? openPhone : openAcct}
          >
            {phoneLogin ? (user.phone ? "修改手机号" : "绑定手机号") : "修改"}
          </button>
        </div>
        <div className="am-row">
          <span className="am-row-label">县域信息</span>
          <span className="am-row-val">{phoneRegionLabel}</span>
          <span
            className="am-op-muted"
            title={isEnterprise ? "根据企业注册地址确定区县" : "根据手机号号段自动识别省、市"}
          >
            {isEnterprise ? "企业位置" : "自动"}
          </span>
        </div>
        {!phoneLogin && (
          <div className="am-row">
            <span className="am-row-label">绑定手机</span>
            <span className="am-row-val">{user.phone || "未绑定"}</span>
            <button type="button" className="am-row-btn" onClick={openPhone}>
              {user.phone ? "修改" : "绑定"}
            </button>
          </div>
        )}
        <div className="am-row">
          <span className="am-row-label">实名认证</span>
          <span className="am-row-val">
            {user.personalVerified ? `已认证 · ${user.realName}` : "未认证"}
          </span>
          <button
            type="button"
            className="am-row-btn"
            onClick={() => setPersonalCertOpen(true)}
          >
            {user.personalVerified ? "修改" : "认证"}
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
        {!phoneLogin && (
          <div className="am-row">
            <span className="am-row-label">登录密码</span>
            <span className="am-row-val">{user.loginPasswordMasked}</span>
            <button type="button" className="am-row-btn" onClick={openPwd}>
              修改
            </button>
          </div>
        )}
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
          updateUser({ nickname: next, orgName: next });
          syncOrgDisplayName(user, next);
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
        title={user.phone ? "修改绑定手机" : "绑定手机号"}
        open={phoneOpen}
        onClose={() => setPhoneOpen(false)}
        onSave={() => {
          const next = phoneDraft.trim();
          if (!/^1\d{10}$/.test(next)) {
            toast("请输入正确的 11 位手机号", "warn");
            return;
          }
          if (phoneCode.trim() !== DEMO_CODE) {
            toast(`验证码错误（演示码：${DEMO_CODE}）`, "warn");
            return;
          }
          if (next === user.phone) {
            toast("手机号未变更", "warn");
            return;
          }
          const patch: Parameters<typeof updateUser>[0] = {
            phone: next,
            username: next,
            email: `${next}@phone.demo`,
            loginMethod: "phone",
            loginPasswordMasked: "手机验证码登录",
          };
          void resolvePhoneRegionAsync(next)
            .then((region) => {
              if (hasEnterpriseInfo(user)) {
                updateUser(patch);
                return;
              }
              if (region?.regionId) updateUser({ ...patch, regionId: region.regionId });
              else updateUser(patch);
            })
            .catch(() => updateUser(patch));
          toast("登录手机号已更新，请使用新手机号验证码登录");
          setPhoneOpen(false);
        }}
      >
        <div className="am-pedit-acct">
          {user.phone ? (
            <p className="am-pedit-hint">登录账户即手机号，当前：{user.phone}</p>
          ) : (
            <p className="am-pedit-hint">绑定手机号后将作为登录账户，使用验证码登录</p>
          )}
          <input
            value={phoneDraft}
            onChange={(e) => setPhoneDraft(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="请输入新手机号"
            inputMode="numeric"
            maxLength={11}
            autoFocus
            autoComplete="tel"
          />
          <div className="am-pedit-code-row">
            <input
              value={phoneCode}
              onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="请输入验证码"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
            />
            <button
              type="button"
              className="am-row-btn"
              disabled={phoneCountdown > 0}
              onClick={sendPhoneCode}
            >
              {phoneCountdown > 0 ? `${phoneCountdown}s` : "获取验证码"}
            </button>
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

      <PersonalCertFlow
        open={personalCertOpen}
        onClose={() => setPersonalCertOpen(false)}
      />
    </div>
  );
}

function MembersPanel({ onContact }: { onContact: () => void }) {
  const toast = useToast();
  const { user, updateUser } = useAuth();
  const [members, setMembers] = useState(() => loadOrgStore(user).members.map((m) => ({ ...m })));
  const [editId, setEditId] = useState<string | null>(null);
  const [acctOpen, setAcctOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [acctLocal, setAcctLocal] = useState("");
  const [acctConfirm, setAcctConfirm] = useState("");
  const [acctSuffix, setAcctSuffix] = useState("@test");
  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addAccount, setAddAccount] = useState("");
  const [addName, setAddName] = useState("");
  const [addPassword, setAddPassword] = useState(DEFAULT_MEMBER_PASSWORD);
  const [addRole, setAddRole] = useState<AssignableAccountRole>("member");
  const [rowEditOpen, setRowEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAccount, setEditAccount] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editStatus, setEditStatus] = useState<"正常" | "停用">("正常");
  const [editRole, setEditRole] = useState<AssignableAccountRole>("member");
  const isEnterprise = hasEnterpriseInfo(user);
  const actorUserId = user?.userId;

  const usedPointsMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of members) {
      const uid = m.userId || user?.userId || "";
      if (!uid) continue;
      map[m.id] = getUsedPointsForUser(uid, { enterprise: isEnterprise });
    }
    return map;
  }, [members, user?.userId, isEnterprise]);

  function syncMemberCount(next: OrgStore) {
    if (!hasEnterpriseInfo(user)) {
      updateUser({ orgName: next.organization.name, memberCount: "1/1" });
      return;
    }
    updateUser({
      memberCount: `${next.members.length}/${ORG_QUOTAS.maxAccounts}`,
      orgName: next.organization.name,
    });
  }

  function reloadMembers(next?: OrgStore) {
    let store = next ?? loadOrgStore(user);
    store = syncOrgAdminIdentity(store, user);
    const list = store.members.map((m) => ({ ...m }));
    if (!isEnterprise) {
      const self =
        list.find((m) => m.isPrimary || m.account === user?.username || m.userId === user?.userId) ||
        list[0];
      setMembers(self ? [self] : []);
      syncMemberCount(store);
      return;
    }
    setMembers(list);
    syncMemberCount(store);
  }

  useEffect(() => {
    reloadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随企业身份 / 用户切换重载
  }, [user, isEnterprise]);

  const editing = members.find((m) => m.id === editId) || null;
  const permStore = useMemo(
    () => syncOrgAdminIdentity(loadOrgStore(user), user),
    [user, members],
  );

  function openAcct(m: (typeof members)[0]) {
    const store = syncOrgAdminIdentity(loadOrgStore(user), user);
    if (!canEditMemberCredentials(store, actorUserId, m, user)) {
      toast("无权修改该成员账号", "warn");
      return;
    }
    const { local, suffix } = splitAccount(m.account);
    setEditId(m.id);
    setAcctLocal(local);
    setAcctConfirm("");
    setAcctSuffix(suffix);
    setAcctOpen(true);
  }

  function openPwd(m: (typeof members)[0]) {
    const store = syncOrgAdminIdentity(loadOrgStore(user), user);
    if (!canEditMemberCredentials(store, actorUserId, m, user)) {
      toast("无权修改该成员密码", "warn");
      return;
    }
    setEditId(m.id);
    setPwd1("");
    setPwd2("");
    setPwdOpen(true);
  }

  function patchMember(id: string, patch: Partial<(typeof members)[0]>) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function openAdd() {
    setAddAccount("");
    setAddName("");
    setAddPassword(DEFAULT_MEMBER_PASSWORD);
    setAddRole("member");
    setAddOpen(true);
  }

  function submitAdd() {
    const store = loadOrgStore(user);
    const ouId = resolveDefaultMemberOuId(store, user);
    const account = addAccount.trim();
    const name = addName.trim() || account;
    if (!account) {
      toast("请填写成员账号", "warn");
      return;
    }
    if (!ouId) {
      toast("组织数据未就绪，请刷新页面或联系企业客服", "warn");
      return;
    }
    const role: AssignableAccountRole =
      addRole === "ou_admin" && isOrgAdminActor(store, actorUserId, user) ? "ou_admin" : "member";
    if (addRole === "ou_admin" && role !== "ou_admin") {
      toast("仅主账号可新建管理员账号", "warn");
      return;
    }
    const pwd = addPassword.trim();
    if (pwd.length < 6) {
      toast("初始密码至少 6 位", "warn");
      return;
    }
    const r = createMemberInOu(store, ouId, {
      name,
      account,
      role,
      passwordPlain: pwd,
      createdByUserId: user?.userId,
    });
    if (r.error) {
      toast(r.error, "warn");
      return;
    }
    syncMemberCount(r.store);
    reloadMembers(r.store);
    setAddOpen(false);
    toast(role === "ou_admin" ? "已创建管理员账号" : "已创建成员账号");
  }

  function openRowEdit(m: (typeof members)[0]) {
    const store = syncOrgAdminIdentity(loadOrgStore(user), user);
    const canEdit = canEditMemberCredentials(store, actorUserId, m, user);
    const isAdmin = isOrgAdminActor(store, actorUserId, user);
    const canManage = canManageSubAccount(store, actorUserId, m, user);
    if (!canEdit && !canManage && !(m.isPrimary && isAdmin)) {
      toast("无权编辑该成员", "warn");
      return;
    }
    const accountRole = resolveMemberAccountRole(store, m);
    setEditId(m.id);
    setEditName(m.name);
    setEditAccount(m.account);
    setEditPassword(m.passwordPlain || "");
    setEditStatus(m.status === "停用" ? "停用" : "正常");
    setEditRole(accountRole === "ou_admin" ? "ou_admin" : "member");
    setRowEditOpen(true);
  }

  function submitRowEdit() {
    if (!editing) return;
    let store = syncOrgAdminIdentity(loadOrgStore(user), user);
    const canEdit = canEditMemberCredentials(store, actorUserId, editing, user);
    const isAdmin = isOrgAdminActor(store, actorUserId, user);
    const canManage = canManageSubAccount(store, actorUserId, editing, user);
    if (!canEdit && !canManage && !(editing.isPrimary && isAdmin)) {
      toast("无权编辑该成员", "warn");
      return;
    }
    const name = editName.trim();
    const account = editAccount.trim();
    const pwd = editPassword.trim();
    if (!name) {
      toast("请填写显示名称", "warn");
      return;
    }
    if (!account) {
      toast("请填写成员账号", "warn");
      return;
    }
    if (pwd && pwd.length < 6) {
      toast("密码至少 6 位", "warn");
      return;
    }

    let r = updateMemberDisplayName(store, editing.id, name);
    if (r.error) {
      toast(r.error, "warn");
      return;
    }
    store = r.store;

    r = updateMemberAccount(store, editing.id, account, name);
    if (r.error) {
      toast(r.error, "warn");
      return;
    }
    store = r.store;

    if (pwd) {
      r = updateMemberPassword(store, editing.id, pwd);
      if (r.error) {
        toast(r.error, "warn");
        return;
      }
      store = r.store;
    }

    if (!editing.isPrimary) {
      if (isAdmin && canManageSubAccount(store, actorUserId, editing, user)) {
        const rr = updateMemberAccountRole(store, editing.id, editRole);
        if (rr.error) {
          toast(rr.error, "warn");
          return;
        }
        store = rr.store;
      }

      const ms = store.memberships.find((x) => x.memberId === editing.id);
      if (ms) {
        const nextStatus = editStatus === "停用" ? "disabled" : "active";
        if (ms.status !== nextStatus) {
          const sr = setMembershipStatus(store, ms.id, nextStatus);
          if (sr.error) {
            toast(sr.error, "warn");
            return;
          }
          store = sr.store;
        }
      }
    }

    if (editing.isPrimary && user) {
      updateUser({
        nickname: name,
        username: account.includes("@") || /^1\d{10}$/.test(account) ? account : user.username,
        email: account.includes("@") ? account : user.email,
        ...(pwd
          ? { loginPasswordMasked: "*".repeat(Math.min(20, Math.max(8, pwd.length))) }
          : {}),
      });
    }

    syncMemberCount(store);
    reloadMembers(store);
    setRowEditOpen(false);
    setEditId(null);
    toast("成员信息已保存");
  }

  async function removeSubAccount(m: (typeof members)[0]) {
    const store = syncOrgAdminIdentity(loadOrgStore(user), user);
    if (!canDeleteMember(store, actorUserId, m, user)) {
      toast(m.isPrimary ? "不可删除主账号" : "无权删除该成员", "warn");
      return;
    }
    const ok = await appConfirm({
      title: "删除子账号",
      message: `确定删除成员「${m.name}」（${m.account}）？删除后不可恢复。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const ms = store.memberships.find((x) => x.memberId === m.id);
    if (!ms) {
      toast("成员关系不存在，请刷新后重试", "warn");
      return;
    }
    if (ms.role === "admin") {
      toast("不可移除主账号", "warn");
      return;
    }
    const r = removeMembership(store, ms.id);
    if (r.error) {
      toast(r.error, "warn");
      return;
    }
    syncMemberCount(r.store);
    reloadMembers(r.store);
    toast("已删除成员");
  }

  return (
    <div className="am-panel">
      <div className="am-title-row">
        <h1 className="am-title">成员管理</h1>
        {isEnterprise && (
          <button type="button" className="btn btn-primary btn-sm am-title-add" onClick={openAdd}>
            新增成员
          </button>
        )}
      </div>
      <div className="am-table-wrap">
        <table className="am-table">
          <thead>
            <tr>
              <th>成员昵称</th>
              <th>用户ID</th>
              <th>账号</th>
              <th>登录密码</th>
              <th>状态</th>
              <th>已用算力</th>
              {isEnterprise && <th>编辑</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const canEdit = canEditMemberCredentials(permStore, actorUserId, m, user);
              const isAdmin = isOrgAdminActor(permStore, actorUserId, user);
              const canManage = canManageSubAccount(permStore, actorUserId, m, user);
              const canOpenEdit = canEdit || canManage || (m.isPrimary && isAdmin);
              const accountRole = resolveMemberAccountRole(permStore, m);
              return (
              <tr key={m.id}>
                <td>
                  <div className="am-member">
                    <AvatarUpload
                      className="am-member-av"
                      src={m.isPrimary ? user?.avatarUrl || m.avatarUrl : m.avatarUrl}
                      fallback={m.name}
                      title={canEdit ? "点击上传头像" : m.name}
                      onUploaded={(url) => {
                        if (!canEdit) return;
                        patchMember(m.id, { avatarUrl: url });
                        if (m.isPrimary) {
                          updateUser({ avatarUrl: url });
                        }
                        toast("头像已更新");
                      }}
                      onError={(msg) => toast(msg, "warn")}
                    />
                    <span>{m.name}</span>
                    <span
                      className={`am-account-badge am-account-badge--${accountRole}`}
                      title={roleLabel(accountRole)}
                    >
                      {roleLabel(accountRole)}
                    </span>
                  </div>
                </td>
                <td className="mono">{m.userId || user?.userId}</td>
                <td>{m.account}</td>
                <td className="mono">{canOpenEdit ? m.passwordPlain : "••••••••"}</td>
                <td>{m.status}</td>
                <td className="mono am-points-used" title="累计消耗算力">
                  {formatPoints(usedPointsMap[m.id] ?? 0)}
                </td>
                {isEnterprise && (
                  <td>
                    {canOpenEdit ? (
                      <button
                        type="button"
                        className="am-row-btn"
                        onClick={() => openRowEdit(m)}
                      >
                        编辑
                      </button>
                    ) : (
                      <span className="am-op-muted">—</span>
                    )}
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isEnterprise ? (
        <p className="am-add-hint-line">
          账号分主账号、管理员账号、成员账号：主账号可管理修改管理员账号与成员账号；管理员账号可管理修改成员账号。需要扩容席位时
          <button type="button" className="am-add-hint" onClick={onContact}>
            联系企业客服
          </button>
        </p>
      ) : (
        <button type="button" className="am-add-hint" onClick={onContact}>
          企业认证后可在此添加成员
        </button>
      )}

      <PersonEditShell
        title="新增成员"
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={submitAdd}
        saveLabel="提交"
        showCancel
        wide
      >
        <div className="am-add-form">
          <label className="am-add-field">
            <span className="am-add-label">
              账号类型 <em>*</em>
            </span>
            <select
              value={addRole}
              onChange={(e) =>
                setAddRole(e.target.value === "ou_admin" ? "ou_admin" : "member")
              }
            >
              <option value="member">成员账号</option>
              {isOrgAdminActor(permStore, actorUserId, user) && (
                <option value="ou_admin">管理员账号</option>
              )}
            </select>
            <span className="am-pedit-hint">
              主账号唯一且不可新建；管理员可管理成员，成员仅能管理自己新增的下级。
            </span>
          </label>
          <label className="am-add-field">
            <span className="am-add-label">
              成员账号 <em>*</em>
            </span>
            <input
              value={addAccount}
              onChange={(e) => setAddAccount(e.target.value)}
              placeholder="推荐手机号，也可邮箱等，如 13800138000"
              autoFocus
            />
            <span className="am-pedit-hint">推荐使用手机号，也可使用邮箱等作为登录账号。</span>
          </label>
          <label className="am-add-field">
            <span className="am-add-label">
              显示名称 <em>*</em>
            </span>
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="成员昵称，默认与账号相同"
            />
          </label>
          <label className="am-add-field">
            <span className="am-add-label">
              初始密码 <em>*</em>
            </span>
            <input
              type="text"
              value={addPassword}
              onChange={(e) => setAddPassword(e.target.value)}
              placeholder="至少 6 位"
              autoComplete="new-password"
            />
          </label>
        </div>
      </PersonEditShell>

      <PersonEditShell
        title={
          editing
            ? `编辑${roleLabel(resolveMemberAccountRole(permStore, editing))}`
            : "编辑成员"
        }
        open={rowEditOpen}
        onClose={() => {
          setRowEditOpen(false);
          setEditId(null);
        }}
        onSave={submitRowEdit}
        saveLabel="保存"
        showCancel
        wide
      >
        <div className="am-add-form">
          <label className="am-add-field">
            <span className="am-add-label">
              显示名称 <em>*</em>
            </span>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="成员昵称"
              autoFocus
            />
          </label>
          <label className="am-add-field">
            <span className="am-add-label">
              账号类型 <em>*</em>
            </span>
            {editing?.isPrimary ? (
              <>
                <input value="主账号" disabled />
                <span className="am-pedit-hint">主账号唯一，类型不可更改。</span>
              </>
            ) : isOrgAdminActor(permStore, actorUserId, user) ? (
              <select
                value={editRole}
                onChange={(e) =>
                  setEditRole(e.target.value === "ou_admin" ? "ou_admin" : "member")
                }
              >
                <option value="member">成员账号</option>
                <option value="ou_admin">管理员账号</option>
              </select>
            ) : (
              <input value={roleLabel(editRole)} disabled />
            )}
          </label>
          <label className="am-add-field">
            <span className="am-add-label">
              成员账号 <em>*</em>
            </span>
            <input
              value={editAccount}
              onChange={(e) => setEditAccount(e.target.value)}
              placeholder="推荐手机号，也可邮箱等，如 13800138000"
            />
          </label>
          <label className="am-add-field">
            <span className="am-add-label">
              登录密码 <em>*</em>
            </span>
            <input
              type="text"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              placeholder="至少 6 位"
              autoComplete="new-password"
            />
          </label>
          {!editing?.isPrimary && (
            <label className="am-add-field">
              <span className="am-add-label">状态</span>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value === "停用" ? "停用" : "正常")}
              >
                <option value="正常">正常</option>
                <option value="停用">停用</option>
              </select>
            </label>
          )}
          {editing && !editing.isPrimary && canDeleteMember(permStore, actorUserId, editing, user) && (
            <div className="am-edit-danger">
              <button
                type="button"
                className="am-row-btn am-row-btn--danger"
                onClick={() => {
                  setRowEditOpen(false);
                  void removeSubAccount(editing);
                }}
              >
                删除该成员
              </button>
            </div>
          )}
        </div>
      </PersonEditShell>

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
          const store = loadOrgStore(user);
          if (!canEditMemberCredentials(store, actorUserId, editing, user)) {
            toast("无权修改该成员账号", "warn");
            return;
          }
          const r = updateMemberAccount(store, editing.id, full, editing.isPrimary ? full : editing.name);
          if (r.error) {
            toast(r.error, "warn");
            return;
          }
          syncMemberCount(r.store);
          reloadMembers(r.store);
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
          const store = loadOrgStore(user);
          if (!canEditMemberCredentials(store, actorUserId, editing, user)) {
            toast("无权修改该成员密码", "warn");
            return;
          }
          const r = updateMemberPassword(store, editing.id, pwd1);
          if (r.error) {
            toast(r.error, "warn");
            return;
          }
          reloadMembers(r.store);
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

function BrandAssetsPanel() {
  return (
    <div className="am-panel am-panel-wide am-brand-panel">
      <h1 className="am-title">品牌资产</h1>
      <BrandPane seed={seedBrands} seqStart={BRAND_SEQ_START} mode="mine" />
    </div>
  );
}

function AccountInner() {
  const [tab, setTab] = useAccountTab();
  const [csOpen, setCsOpen] = useState(false);
  const { user } = useAuth();
  const isEnterprise = hasEnterpriseInfo(user);
  const safeTab = !isEnterprise && tab === "members" ? "personal" : tab;

  const body = (() => {
    switch (safeTab) {
      case "personal":
        return <PersonalPanel />;
      case "member":
        return <MembershipPanel />;
      case "members":
        return <MembersPanel onContact={() => setCsOpen(true)} />;
      case "creations":
        return <BrandAssetsPanel />;
      default:
        return <OrgPanel onGoMembers={() => setTab("members")} />;
    }
  })();

  return (
    <>
      <AccountShell active={safeTab} onTabChange={setTab} onContact={() => setCsOpen(true)}>
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
