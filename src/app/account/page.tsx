"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { AccountShell, useAccountTab } from "@/components/account/AccountShell";
import { EnterpriseCertFlow } from "@/components/account/EnterpriseCertFlow";
import { JoinEnterpriseFlow } from "@/components/account/JoinEnterpriseFlow";
import { IdentitySwitcher } from "@/components/account/IdentitySwitcher";
import { AvatarUpload } from "@/components/account/AvatarUpload";
import { MembershipPanel } from "@/components/account/MembershipPanel";
import { StorageSpacePanel } from "@/components/account/StorageSpacePanel";
import { InviteGiftPanel } from "@/components/account/InviteGiftPanel";
import { appConfirm } from "@/components/ui/Confirm";
import { formatPoints, getMonthlyUsedPointsForUser } from "@/lib/points";
import { alignEnterprisePrimaryQuota, deleteEnterpriseMember, enterpriseAuthPatch, grantEnterpriseQuota, memberQuotaView } from "@/lib/quota";
import {
  canDeleteMember,
  canEditMemberCredentials,
  canGrantQuotaTo,
  canManageOrgStructure,
  canManageSubAccount,
  canCreateChildOu,
  createMemberInOu,
  createOrgUnit,
  deleteOrgUnit,
  ensureOrgJoinCode,
  getChildren,
  getUnit,
  isLocalOrgMember,
  isOrgAdminActor,
  isOrgManagerActor,
  loadOrgStore,
  alignMemberAccountPhones,
  memberDepartmentOf,
  memberPhoneOf,
  ORG_QUOTAS,
  orgUnitDeleteBlockReason,
  actorAccountUserName,
  orgSelfAccountLabel,
  resolveDefaultMemberOuId,
  resolveMemberAccountRole,
  roleLabel,
  setMembershipStatus,
  findActorTeamMember,
  subtreeOuIds,
  syncOrgAdminIdentity,
  syncOrgDisplayName,
  updateMemberAccount,
  updateMemberAccountRole,
  updateMemberDisplayName,
  updateMemberPassword,
  updateMemberSelfRecharge,
  memberCanSelfRecharge,
  updateOrgUnit,
  type AssignableAccountRole,
  type OrgStore,
} from "@/lib/org";
import { useAuth } from "@/lib/AuthContext";
import {
  isPhoneLoginUser,
  hasEnterpriseInfo,
  isEnterpriseOwner,
  isJoinedOrgMember,
  revokeEnterprisePatch,
  isPlaceholderNickname,
  resolveLoginPasswordDisplay,
} from "@/lib/auth";
import { leaveJoinedEnterprise } from "@/lib/joinEnterprise";
import {
  canCreateOwnedEnterprise,
  loadIdentities,
  removeIdentity,
  identityUserPatch,
} from "@/lib/identity";
import { reportCendOrgMember, syncOrgMembersToOps, syncOrgWalletsToOps } from "@/lib/opsRegister";
import { resolvePhoneRegionAsync } from "@/lib/phoneRegion";
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

function PersonEditShell({
  title,
  open,
  onClose,
  children,
  onSave,
  saveLabel = "保存并生效",
  showCancel = false,
  wide = false,
  xl = false,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  onSave: () => void;
  saveLabel?: string;
  showCancel?: boolean;
  wide?: boolean;
  xl?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="am-cs-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="am-cs-backdrop" aria-label="关闭" onClick={onClose} />
      <div className={`am-pedit-card${xl ? " am-pedit-card--xl" : wide ? " am-pedit-card--wide" : ""}`}>
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

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function PersonalPanel() {
  const toast = useToast();
  const { user, updateUser, switchIdentity, identities } = useAuth();
  const [pwdOpen, setPwdOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [pwdVisible, setPwdVisible] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");

  useEffect(() => {
    if (!user) return;
    const store = loadOrgStore(user);
    const member = findActorTeamMember(store, user);
    const name = actorAccountUserName(store, user);
    if (!nameOpen) setNameDraft(name);
    setPhoneDraft(user.phone || "");
    if (!name) return;
    const nick = (user.nickname || "").trim();
    if (!nick || isPlaceholderNickname(user)) {
      if (nick !== name) updateUser({ nickname: name });
    }
    if ((member?.name || "").trim() !== name) {
      syncOrgDisplayName(user, name);
    }
  }, [user, user?.nickname, user?.orgName, user?.phone, user?.company, updateUser, nameOpen]);

  useEffect(() => {
    if (!user || !hasEnterpriseInfo(user)) return;
    alignEnterprisePrimaryQuota(user);
    const patch = enterpriseAuthPatch(user);
    if (
      user.computeBenefit !== patch.computeBenefit ||
      user.computeGift !== patch.computeGift ||
      user.computeRecharge !== patch.computeRecharge
    ) {
      updateUser(patch);
    }
  }, [user, updateUser]);

  if (!user) return null;
  const joined = isJoinedOrgMember(user);
  const phoneLogin = isPhoneLoginUser(user);
  const displayName = actorAccountUserName(loadOrgStore(user), user);
  const avatarFallback = /^1\d{10}$/.test(displayName)
    ? displayName.slice(-1)
    : (displayName || "个").slice(0, 1);
  const book = identities.length ? identities : loadIdentities(user);
  const ownedIdent = book.find((x) => x.kind === "owned");
  const joinedIdents = book.filter((x) => x.kind === "joined");
  const canCreate = canCreateOwnedEnterprise(user);

  function openPwd() {
    setPwd1("");
    setPwd2("");
    setPwdOpen(true);
  }

  function accountUserName() {
    return actorAccountUserName(loadOrgStore(user), user);
  }

  function openName() {
    setNameDraft(accountUserName());
    setNameOpen(true);
  }

  function openPhone() {
    setPhoneDraft(user?.phone || "");
    setPhoneOpen(true);
  }

  function saveName() {
    if (!user) return;
    const name = nameDraft.trim();
    if (!name) {
      toast("请填写用户名", "warn");
      return;
    }
    updateUser({ nickname: name });
    syncOrgDisplayName(user, name);
    setNameOpen(false);
    toast("用户名已保存");
  }

  function savePhone() {
    if (!user) return;
    const phone = phoneDraft.trim();
    if (!/^1\d{10}$/.test(phone)) {
      toast("请输入正确的 11 位手机号", "warn");
      return;
    }
    const patch: Parameters<typeof updateUser>[0] = { phone };
    if (phoneLogin || /^1\d{10}$/.test(user.username)) {
      patch.username = phone;
      patch.email = `${phone}@phone.demo`;
    }
    updateUser(patch);
    if (hasEnterpriseInfo(user) || isJoinedOrgMember(user)) {
      const store = loadOrgStore(user);
      const self =
        store.members.find((m) => m.userId === user.userId) ||
        store.members.find((m) => m.isPrimary);
      if (self) {
        const r = updateMemberAccount(store, self.id, phone);
        if (r.error) {
          toast(r.error, "warn");
          return;
        }
      }
    }
    if (phone !== user.phone) {
      void resolvePhoneRegionAsync(phone)
        .then((region) => {
          if (region?.regionId && !hasEnterpriseInfo(user)) {
            updateUser({ regionId: region.regionId });
          }
        })
        .catch(() => undefined);
    }
    setPhoneOpen(false);
    toast("手机号/账号已保存");
  }

  return (
    <div className="am-panel am-person-page">
      <header className="am-person-head">
        <h1 className="am-title">个人信息</h1>
        <p className="am-person-sub">管理账户资料和安全设置</p>
      </header>

      <section className="am-person-card">
        <h2 className="am-person-card-title">基本信息</h2>
        <AvatarUpload
          className="am-person-avatar"
          rounded="md"
          src={user.avatarUrl}
          fallback={avatarFallback}
          onUploaded={(url) => {
            updateUser({ avatarUrl: url });
            toast("头像已更新");
          }}
          onError={(m) => toast(m, "warn")}
        />
        <div className="am-person-field">
          <span>用户名</span>
          <div className="am-person-field-pwd">
            <input
              value={accountUserName()}
              disabled
              readOnly
            />
            <button type="button" className="am-row-btn" onClick={openName}>
              修改
            </button>
          </div>
        </div>
        <div className="am-person-field">
          <span>手机号/账号</span>
          <div className="am-person-field-pwd">
            <input value={user.phone || ""} disabled readOnly />
            <button type="button" className="am-row-btn" onClick={openPhone}>
              修改
            </button>
          </div>
        </div>
        <div className="am-person-field">
          <span>密码</span>
          <div className="am-person-field-pwd">
            <div className="am-pwd-field">
              <input
                type={pwdVisible ? "text" : "password"}
                value={resolveLoginPasswordDisplay(user)}
                disabled
                readOnly
                autoComplete="off"
              />
              <button
                type="button"
                className="am-pwd-toggle"
                aria-label={pwdVisible ? "隐藏密码" : "显示密码"}
                onClick={() => setPwdVisible((v) => !v)}
              >
                <Icon name={pwdVisible ? "eyeOff" : "eye"} size={16} />
              </button>
            </div>
            <button type="button" className="am-row-btn" onClick={openPwd}>
              修改
            </button>
          </div>
        </div>
      </section>

      <section className="am-person-card am-person-card--security">
        <h2 className="am-person-card-title">安全设置</h2>
        <div className="am-rows">
          <div className="am-row">
            <span className="am-row-label">企业认证</span>
            <span className="am-row-val">
              {ownedIdent
                ? `已创建 · ${ownedIdent.name}`
                : "未创建"}
            </span>
            {ownedIdent ? (
              <button
                type="button"
                className="am-row-btn"
                onClick={() => {
                  const ok = window.confirm(
                    "确认解散自建企业？个人空间不受影响，解散后可再创建一家。",
                  );
                  if (!ok) return;
                  const next = removeIdentity(user, ownedIdent.id);
                  updateUser(next ? identityUserPatch(user, next) : revokeEnterprisePatch());
                  if (next) switchIdentity(next.id);
                  toast("已解散自建企业，已回到个人空间");
                }}
              >
                解散企业
              </button>
            ) : (
              <button
                type="button"
                className="am-row-btn"
                disabled={!canCreate}
                onClick={() => setCertOpen(true)}
              >
                认证
              </button>
            )}
          </div>
          <div className="am-row">
            <span className="am-row-label">加入企业</span>
            <span className="am-row-val">
              {joinedIdents.length
                ? joined
                  ? `已加入 · ${user.company || user.orgName}`
                  : "已加入"
                : "未加入"}
            </span>
            <div className="am-row-actions">
              {joined ? (
                <button
                  type="button"
                  className="am-row-btn"
                  onClick={async () => {
                    const ok = window.confirm("确认退出当前企业？个人空间和其他身份不受影响。");
                    if (!ok) return;
                    const r = await leaveJoinedEnterprise(user);
                    if (!r.ok) {
                      toast(r.message, "warn");
                      return;
                    }
                    updateUser(r.userPatch);
                    if (r.identityId) switchIdentity(r.identityId);
                    toast("已退出该企业");
                  }}
                >
                  退出当前
                </button>
              ) : null}
              <button type="button" className="am-row-btn" onClick={() => setJoinOpen(true)}>
                加入
              </button>
            </div>
          </div>
          {!phoneLogin && (
            <div className="am-row">
              <span className="am-row-label">登录密码</span>
              <span className="am-row-val">{resolveLoginPasswordDisplay(user)}</span>
              <button type="button" className="am-row-btn" onClick={openPwd}>
                修改
              </button>
            </div>
          )}
        </div>
      </section>

      <IdentitySwitcher />

      <PersonEditShell
        title="修改用户名"
        open={nameOpen}
        onClose={() => {
          setNameDraft(accountUserName());
          setNameOpen(false);
        }}
        onSave={saveName}
        showCancel
      >
        <div className="am-pedit-acct">
          <input
            value={nameDraft}
            maxLength={20}
            onChange={(e) => setNameDraft(e.target.value.slice(0, 20))}
            placeholder="请输入用户名"
            autoFocus
          />
        </div>
      </PersonEditShell>

      <PersonEditShell
        title="修改手机号/账号"
        open={phoneOpen}
        onClose={() => {
          setPhoneDraft(user.phone || "");
          setPhoneOpen(false);
        }}
        onSave={savePhone}
        showCancel
      >
        <div className="am-pedit-acct">
          <input
            value={phoneDraft}
            onChange={(e) => setPhoneDraft(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="请输入11位手机号"
            inputMode="numeric"
            maxLength={11}
            autoComplete="tel"
            autoFocus
          />
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
          updateUser({
            loginPassword: pwd1,
            loginPasswordMasked: "*".repeat(Math.min(20, Math.max(8, pwd1.length))),
          });
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

      <EnterpriseCertFlow
        open={certOpen}
        onClose={() => setCertOpen(false)}
        defaultName={user.orgName}
      />
      <JoinEnterpriseFlow open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}

function ouVisibleInSearch(store: OrgStore, ouId: string, q: string, rootLabel: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const unit = getUnit(store, ouId);
  const label =
    unit?.id === store.organization.rootOuId ? rootLabel || unit?.name || "" : unit?.name || "";
  if (label.toLowerCase().includes(needle)) return true;
  return getChildren(store, ouId).some((c) => ouVisibleInSearch(store, c.id, q, rootLabel));
}

function OrgTreeNodeName({
  label,
  canManage,
  onRename,
}: {
  label: string;
  canManage: boolean;
  onRename: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  if (editing) {
    return (
      <input
        className="am-org-rename"
        value={draft}
        autoFocus
        aria-label="组织名称"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const name = draft.trim();
          setEditing(false);
          if (name && name !== label) onRename(name);
          else setDraft(label);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(label);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <span
      className="am-org-node-name"
      title={canManage ? "双击修改名称" : undefined}
      onDoubleClick={(e) => {
        if (!canManage) return;
        e.preventDefault();
        e.stopPropagation();
        setDraft(label);
        setEditing(true);
      }}
    >
      {label}
    </span>
  );
}

function OrgTreeItems({
  store,
  parentId,
  selectedId,
  collapsed,
  query,
  rootLabel,
  onSelect,
  onToggle,
  forceExpand,
  canManage,
  onAdd,
  onRename,
  onDelete,
}: {
  store: OrgStore;
  parentId: string | null;
  selectedId: string;
  collapsed: Set<string>;
  query: string;
  rootLabel: string;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  forceExpand: boolean;
  canManage?: boolean;
  onAdd?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
}) {
  const nodes = getChildren(store, parentId).filter((u) => ouVisibleInSearch(store, u.id, query, rootLabel));
  if (!nodes.length) return null;
  const rootId = store.organization.rootOuId;
  return (
    <ul className={parentId ? "am-org-tree-sub" : "am-org-tree"} role={parentId ? "group" : "tree"}>
      {nodes.map((unit) => {
        const kids = getChildren(store, unit.id);
        const hasKids = kids.length > 0;
        const expanded = forceExpand || !collapsed.has(unit.id);
        const selected = selectedId === unit.id;
        const label = unit.id === rootId ? rootLabel || unit.name : unit.name;
        return (
          <li key={unit.id} role="treeitem" aria-selected={selected} aria-expanded={hasKids ? expanded : undefined}>
            <div className={`am-org-node-row${selected ? " on" : ""}`}>
              <div
                className="am-org-node"
                role="button"
                tabIndex={0}
                onClick={() => onSelect(unit.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(unit.id);
                  }
                }}
              >
                {hasKids ? (
                  <span
                    className={`am-org-caret${expanded ? " open" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(unit.id);
                    }}
                  >
                    <Icon name="chevron" size={14} />
                  </span>
                ) : (
                  <span className="am-org-caret am-org-caret--leaf" />
                )}
                <OrgTreeNodeName
                  label={label}
                  canManage={!!canManage}
                  onRename={(name) => onRename?.(unit.id, name)}
                />
              </div>
              {canManage ? (
                <span className="am-org-node-actions">
                  {canCreateChildOu(store, unit.id) ? (
                    <button
                      type="button"
                      className="am-org-icon-btn"
                      title="新增下级"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAdd?.(unit.id);
                      }}
                    >
                      <Icon name="plus" size={13} />
                    </button>
                  ) : null}
                  {unit.id !== rootId ? (
                    <button
                      type="button"
                      className="am-org-icon-btn danger"
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete?.(unit.id);
                      }}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  ) : null}
                </span>
              ) : null}
            </div>
            {hasKids && expanded ? (
              <OrgTreeItems
                store={store}
                parentId={unit.id}
                selectedId={selectedId}
                collapsed={collapsed}
                query={query}
                rootLabel={rootLabel}
                onSelect={onSelect}
                onToggle={onToggle}
                forceExpand={forceExpand}
                canManage={canManage}
                onAdd={onAdd}
                onRename={onRename}
                onDelete={onDelete}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function MembersPanel({ onContact }: { onContact: () => void }) {
  const toast = useToast();
  const { user, updateUser } = useAuth();
  const [members, setMembers] = useState(() => loadOrgStore(user).members.map((m) => ({ ...m })));
  const [editId, setEditId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addPhone, setAddPhone] = useState("");
  const [addName, setAddName] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addPasswordVisible, setAddPasswordVisible] = useState(false);
  const [addEmployeeNo, setAddEmployeeNo] = useState("");
  const [addExpires, setAddExpires] = useState("");
  const [addOuId, setAddOuId] = useState("");
  const [addRole, setAddRole] = useState<AssignableAccountRole | "">("");
  const [addExtra, setAddExtra] = useState("");
  const [rowEditOpen, setRowEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAccount, setEditAccount] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editPwdDirty, setEditPwdDirty] = useState(false);
  const [editPasswordVisible, setEditPasswordVisible] = useState(false);
  const [editRole, setEditRole] = useState<AssignableAccountRole>("member");
  const [editCanSelfRecharge, setEditCanSelfRecharge] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantLimit, setGrantLimit] = useState(0);
  const [selectedOuId, setSelectedOuId] = useState("");
  const [orgQuery, setOrgQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [treeFolded, setTreeFolded] = useState(false);
  const [ouAddOpen, setOuAddOpen] = useState(false);
  const [ouAddName, setOuAddName] = useState("");
  const [qName, setQName] = useState("");
  const [qLogin, setQLogin] = useState("");
  const [appliedQ, setAppliedQ] = useState({ name: "", login: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const isEnterprise = hasEnterpriseInfo(user);
  const actorUserId = user?.userId;

  const quotaMap = useMemo(() => {
    const map: Record<string, { limit: number; used: number; remain: number }> = {};
    for (const m of members) {
      const uid = m.userId || (m.isPrimary ? user?.userId : "") || "";
      map[m.id] = memberQuotaView(user, uid);
    }
    return map;
  }, [members, user]);

  const usedPointsMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of members) map[m.id] = quotaMap[m.id]?.used ?? 0;
    return map;
  }, [members, quotaMap]);

  const actorRemain = useMemo(() => {
    const actor =
      members.find((m) => m.userId && m.userId === user?.userId) ||
      members.find((m) => m.account && (m.account === user?.username || m.account === user?.phone)) ||
      members.find((m) => m.isPrimary);
    if (!actor) return 0;
    return quotaMap[actor.id]?.remain ?? 0;
  }, [members, quotaMap, user?.userId, user?.username, user?.phone]);

  function syncMemberCount(next: OrgStore) {
    if (!user) return;
    const memberCount = hasEnterpriseInfo(user)
      ? `${next.members.length}/${ORG_QUOTAS.maxAccounts}`
      : "1/1";
    const orgName = next.organization.name;
    if (user.memberCount === memberCount && user.orgName === orgName) return;
    updateUser({ memberCount, orgName });
  }

  function reloadMembers(next?: OrgStore) {
    let store = next ?? loadOrgStore(user);
    store = alignMemberAccountPhones(ensureOrgJoinCode(syncOrgAdminIdentity(store, user)));
    if (isEnterprise) {
      const aligned = alignEnterprisePrimaryQuota(user);
      if (aligned) store = syncOrgAdminIdentity(aligned, user);
    }
    const list = store.members.map((m) => ({ ...m }));
    if (!isEnterprise) {
      const self =
        list.find((m) => m.isPrimary || m.account === user?.username || m.userId === user?.userId) ||
        list[0];
      setMembers(self ? [self] : []);
      syncMemberCount(store);
      if (user) syncOrgWalletsToOps(store, user);
      return;
    }
    setMembers(list);
    syncMemberCount(store);
    if (user) syncOrgWalletsToOps(store, user);
  }

  useEffect(() => {
    reloadMembers();
    if (isEnterprise && user) {
      syncOrgMembersToOps(loadOrgStore(user), user);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随账号切换重载，避免 updateUser 形成死循环
  }, [user?.userId, isEnterprise]);

  const editing = members.find((m) => m.id === editId) || null;
  const permStore = useMemo(
    () => syncOrgAdminIdentity(loadOrgStore(user), user),
    [user, members],
  );

  const rootOuId = permStore.organization.rootOuId;
  const activeOuId = selectedOuId && getUnit(permStore, selectedOuId) ? selectedOuId : rootOuId;

  useEffect(() => {
    if (!selectedOuId && rootOuId) setSelectedOuId(rootOuId);
  }, [selectedOuId, rootOuId]);

  const filteredMembers = useMemo(() => {
    const ids = new Set(subtreeOuIds(permStore, activeOuId));
    const n = appliedQ.name.trim().toLowerCase();
    const loginQ = appliedQ.login.trim().toLowerCase();
    return members.filter((m) => {
      const ms = permStore.memberships.find((x) => x.memberId === m.id);
      if (ms ? !ids.has(ms.ouId) : activeOuId !== rootOuId) return false;
      if (n && !m.name.toLowerCase().includes(n)) return false;
      const loginId = memberPhoneOf(permStore, m.id).toLowerCase();
      if (loginQ && !loginId.includes(loginQ) && !m.account.toLowerCase().includes(loginQ)) return false;
      return true;
    });
  }, [members, permStore, activeOuId, rootOuId, appliedQ]);

  const pageCount = Math.max(1, Math.ceil(filteredMembers.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageItems = filteredMembers.slice((safePage - 1) * pageSize, safePage * pageSize);

  function applyUserQuery() {
    setAppliedQ({ name: qName, login: qLogin });
    setPage(1);
  }

  function resetUserQuery() {
    setQName("");
    setQLogin("");
    setAppliedQ({ name: "", login: "" });
    setPage(1);
  }

  function toggleOu(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setTreeFolded(false);
  }

  function foldTree(fold: boolean) {
    if (fold) {
      const ids = permStore.units.filter((u) => getChildren(permStore, u.id).length > 0).map((u) => u.id);
      setCollapsed(new Set(ids));
    } else {
      setCollapsed(new Set());
    }
    setTreeFolded(fold);
  }

  function openAddOu(parentId: string) {
    if (!canManageOrgStructure(permStore, actorUserId, user)) {
      toast("仅主账号可维护组织架构", "warn");
      return;
    }
    if (!canCreateChildOu(permStore, parentId)) {
      toast("该节点下不可再新增下级", "warn");
      return;
    }
    setSelectedOuId(parentId);
    setOuAddName("");
    setOuAddOpen(true);
  }

  function renameOu(ouId: string, name: string) {
    if (!canManageOrgStructure(permStore, actorUserId, user)) {
      toast("仅主账号可维护组织架构", "warn");
      return;
    }
    const store = syncOrgAdminIdentity(loadOrgStore(user), user);
    const r = updateOrgUnit(store, ouId, { name });
    if (r.error) {
      toast(r.error, "warn");
      return;
    }
    reloadMembers(r.store);
  }

  function closeOuForm() {
    setOuAddOpen(false);
  }

  function submitOuForm() {
    const store = syncOrgAdminIdentity(loadOrgStore(user), user);
    if (!canManageOrgStructure(store, actorUserId, user)) {
      toast("仅主账号可维护组织架构", "warn");
      return;
    }
    const r = createOrgUnit(store, activeOuId, {
      name: ouAddName,
    });
    if (r.error) {
      toast(r.error, "warn");
      return;
    }
    reloadMembers(r.store);
    closeOuForm();
    toast("已新增组织单元");
  }

  async function removeOu(ouId: string) {
    if (!canManageOrgStructure(permStore, actorUserId, user)) {
      toast("仅主账号可维护组织架构", "warn");
      return;
    }
    const unit = getUnit(permStore, ouId);
    if (!unit) {
      toast("组织单元不存在", "warn");
      return;
    }
    const block = orgUnitDeleteBlockReason(permStore, ouId);
    if (block) {
      toast(block, "warn");
      return;
    }
    const ok = await appConfirm({
      title: "删除组织单元",
      message: `确定删除「${unit.name}」？删除后不可恢复。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const store = syncOrgAdminIdentity(loadOrgStore(user), user);
    const r = deleteOrgUnit(store, ouId);
    if (r.error) {
      toast(r.error, "warn");
      return;
    }
    if (activeOuId === ouId) {
      setSelectedOuId(unit.parentId || r.store.organization.rootOuId);
    }
    reloadMembers(r.store);
    toast("已删除组织单元");
  }

  function canGrantQuota(m: (typeof members)[0]) {
    return canGrantQuotaTo(permStore, actorUserId, m, user);
  }

  const canActorGrant =
    isOrgAdminActor(permStore, actorUserId, user) || isOrgManagerActor(permStore, actorUserId, user);

  function canShowGrant(m: (typeof members)[0]) {
    if (canGrantQuota(m)) return true;
    const isSelf =
      (!!m.userId && m.userId === user?.userId) ||
      (!!m.account && (m.account === user?.username || m.account === user?.phone));
    const role = resolveMemberAccountRole(permStore, m);
    return isSelf && canActorGrant && (m.isPrimary || role === "admin" || role === "ou_admin");
  }

  function toggleMemberEnabled(m: (typeof members)[0], on: boolean) {
    if (m.isPrimary) {
      toast("主账号不可停用", "warn");
      return;
    }
    const store = syncOrgAdminIdentity(loadOrgStore(user), user);
    if (!canManageSubAccount(store, actorUserId, m, user)) {
      toast("无权变更该成员状态", "warn");
      return;
    }
    const ms = store.memberships.find((x) => x.memberId === m.id);
    if (!ms) {
      toast("成员不存在", "warn");
      return;
    }
    const sr = setMembershipStatus(store, ms.id, on ? "active" : "disabled");
    if (sr.error) {
      toast(sr.error, "warn");
      return;
    }
    reloadMembers(sr.store);
  }

  function openGrant(m: (typeof members)[0]) {
    if (!canShowGrant(m)) {
      toast("无权发放额度", "warn");
      return;
    }
    setEditId(m.id);
    setGrantLimit(0);
    setGrantOpen(true);
  }

  function submitGrant() {
    if (!editing || !user?.userId) return;
    const target = editing;
    if (!canGrantQuota(target)) {
      toast("不能向该成员发放额度", "warn");
      return;
    }
    const amount = Math.max(0, Math.floor(Number(grantLimit) || 0));
    if (amount <= 0) {
      toast("发放数量须大于 0", "warn");
      return;
    }
    const store = syncOrgAdminIdentity(loadOrgStore(user), user);
    alignEnterprisePrimaryQuota(user);
    const latest = syncOrgAdminIdentity(loadOrgStore(user), user);
    const actor =
      findActorTeamMember(latest, user) ||
      latest.members.find((m) => m.userId === user.userId);
    if (!actor?.userId) {
      toast("找不到发放人", "warn");
      return;
    }
    const fromUsed = getMonthlyUsedPointsForUser(actor.userId, { enterprise: true });
    const r = grantEnterpriseQuota(latest, actor.userId, target.id, amount, fromUsed);
    if (r.error) {
      toast(r.error, "warn");
      return;
    }
    syncMemberCount(r.store);
    reloadMembers(r.store);
    updateUser(enterpriseAuthPatch(user));
    setGrantOpen(false);
    setEditId(null);
    toast(`已从你的额度划出 ${formatPoints(amount)} 给「${target.name}」`);
  }

  function openAdd() {
    setAddPhone("");
    setAddPassword("");
    setAddPasswordVisible(false);
    setAddName("");
    setAddEmployeeNo("");
    setAddExpires("");
    setAddOuId(selectedOuId && selectedOuId !== rootOuId ? selectedOuId : "");
    setAddRole("member");
    setAddExtra("");
    setAddOpen(true);
  }

  async function submitAdd() {
    const store = loadOrgStore(user);
    const name = addName.trim();
    if (!name) {
      toast("请填写用户名", "warn");
      return;
    }
    const phone = addPhone.trim();
    if (!/^1\d{10}$/.test(phone)) {
      toast("请输入正确的 11 位手机号", "warn");
      return;
    }
    const pwd = addPassword.trim();
    if (!pwd) {
      toast("请填写登录密码", "warn");
      return;
    }
    const account = phone;
    const canAssignAdmin = isOrgAdminActor(store, actorUserId, user);
    const role = canAssignAdmin && addRole === "ou_admin" ? "ou_admin" : "member";
    const preferred =
      addOuId ||
      (selectedOuId && getUnit(store, selectedOuId) ? selectedOuId : "") ||
      resolveDefaultMemberOuId(store, user) ||
      store.organization.rootOuId;
    const ouId = preferred;
    if (!ouId) {
      toast("组织数据未就绪，请刷新页面或联系企业客服", "warn");
      return;
    }
    const actor =
      store.members.find((m) => m.userId === user?.userId) || store.members.find((m) => m.isPrimary);
    const fromUsed = actor ? getMonthlyUsedPointsForUser(actor.userId, { enterprise: true }) : 0;
    const r = createMemberInOu(store, ouId, {
      name,
      account,
      role,
      passwordPlain: pwd,
      createdByUserId: user?.userId,
      monthlyLimit: 0,
      fromUsed,
      phone,
      status: "正常",
    });
    if (r.error) {
      toast(r.error, "warn");
      return;
    }
    syncMemberCount(r.store);
    reloadMembers(r.store);
    setAddOpen(false);
    const actorPhone = (user?.phone || user?.username || "").trim();
    const remote = await reportCendOrgMember({
      actorPhone,
      phone,
      name,
      password: pwd,
    });
    if (remote.ok) toast("已创建成员账号");
    else toast(remote.error || "成员已创建，运营端同步失败", "warn");
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
    const loginId = memberPhoneOf(store, m.id);
    setEditAccount(loginId === "—" ? m.account : loginId);
    const existingPwd = (m.passwordPlain || "").trim();
    setEditPassword(existingPwd || "********");
    setEditPwdDirty(false);
    setEditPasswordVisible(false);
    setEditRole(accountRole === "ou_admin" ? "ou_admin" : "member");
    setEditCanSelfRecharge(memberCanSelfRecharge(store, m));
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
    const pwd = editPwdDirty ? editPassword.trim() : "";
    if (!name) {
      toast("请填写用户名", "warn");
      return;
    }
    if (!/^1\d{10}$/.test(account)) {
      toast("请输入正确的 11 位手机号", "warn");
      return;
    }
    if (pwd && pwd !== "********" && pwd.length < 6) {
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

    if (pwd && pwd !== "********") {
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
      if (isAdmin) {
        const sr = updateMemberSelfRecharge(store, editing.id, editCanSelfRecharge);
        if (sr.error) {
          toast(sr.error, "warn");
          return;
        }
        store = sr.store;
      }
    }

    const isSelf =
      !!user &&
      ((!!editing.userId && editing.userId === user.userId) ||
        (!!editing.account && (editing.account === user.username || editing.account === user.phone)));
    if ((editing.isPrimary || isSelf) && user) {
      updateUser({
        nickname: name,
        phone: account,
        username: account,
        ...(pwd
          ? {
              loginPassword: pwd,
              loginPasswordMasked: "*".repeat(Math.min(20, Math.max(8, pwd.length))),
            }
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
    const r = deleteEnterpriseMember(store, ms.id, actorUserId);
    if (r.error) {
      toast(r.error, "warn");
      return;
    }
    syncMemberCount(r.store);
    reloadMembers(r.store);
    if (user) updateUser(enterpriseAuthPatch(user));
    toast(
      r.reclaimed > 0
        ? `已删除成员，剩余 ${formatPoints(r.reclaimed)} 已回流到「${r.toName}」`
        : "已删除成员",
    );
  }

  return (
    <div className="am-panel am-members-page">
      {isJoinedOrgMember(user) && !isLocalOrgMember(permStore, user) ? (
        <div className="am-join-remote">
          <h1 className="am-title">已加入企业</h1>
          <p>
            你已加入「{user?.company || user?.orgName || "企业"}」，当前身份为成员账号。组织名单由企业管理员在本机成员管理中维护。
          </p>
        </div>
      ) : isEnterprise ? (
        <div className="am-members-layout">
          <aside className="am-org-pane">
            <div className="am-org-pane-head">
              <h2 className="am-org-pane-title">组织架构</h2>
              <div className="am-org-pane-tools">
                <button
                  type="button"
                  className="am-org-fold"
                  onClick={() => foldTree(!treeFolded)}
                >
                  {treeFolded ? "展开全部" : "收起全部"}
                </button>
              </div>
            </div>
            {isEnterpriseOwner(user) && permStore.organization.joinCode ? (
              <div className="am-org-join">
                <span>企业码</span>
                <code>{permStore.organization.joinCode}</code>
                <button
                  type="button"
                  className="am-org-join-btn"
                  onClick={async () => {
                    const ok = await copyText(permStore.organization.joinCode || "");
                    toast(ok ? "企业码已复制" : "复制失败", ok ? "success" : "warn");
                  }}
                >
                  复制
                </button>
              </div>
            ) : null}
            <label className="am-org-search">
              <Icon name="search" size={14} />
              <input
                value={orgQuery}
                onChange={(e) => setOrgQuery(e.target.value)}
                placeholder="搜索"
              />
            </label>
            <div className="am-org-tree-wrap">
              {ouVisibleInSearch(permStore, rootOuId, orgQuery, orgSelfAccountLabel(permStore, user)) ? (
                <OrgTreeItems
                  store={permStore}
                  parentId={null}
                  selectedId={activeOuId}
                  collapsed={collapsed}
                  query={orgQuery}
                  rootLabel={orgSelfAccountLabel(permStore, user)}
                  onSelect={(id) => {
                    setSelectedOuId(id);
                    setPage(1);
                  }}
                  onToggle={toggleOu}
                  forceExpand={Boolean(orgQuery.trim())}
                  canManage={canManageOrgStructure(permStore, actorUserId, user)}
                  onAdd={openAddOu}
                  onRename={renameOu}
                  onDelete={(id) => void removeOu(id)}
                />
              ) : (
                <div className="am-org-empty">暂无数据</div>
              )}
            </div>
          </aside>

          <section className="am-user-pane">
            <div className="am-user-head">
              <h2 className="am-user-title">
                <Icon name="user" size={16} />
                {`成员列表 (${filteredMembers.length}条)`}
              </h2>
              <div className="am-user-head-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
                  + 新增
                </button>
              </div>
            </div>
            <div className="am-user-filters">
              <label className="am-user-filter">
                <span>用户名</span>
                <input value={qName} onChange={(e) => setQName(e.target.value)} placeholder="请输入" />
              </label>
              <label className="am-user-filter">
                <span>手机号/账号</span>
                <input value={qLogin} onChange={(e) => setQLogin(e.target.value)} placeholder="请输入" />
              </label>
              <button type="button" className="btn btn-primary btn-sm" onClick={applyUserQuery}>
                <Icon name="search" size={14} />
                查询
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetUserQuery}>
                重置
              </button>
            </div>
            <div className="am-table-wrap am-user-table-wrap" tabIndex={0} aria-label="成员列表，可左右滑动查看">
              <table className="am-table am-user-table">
                <thead>
                  <tr>
                    <th>序号</th>
                    <th>用户名</th>
                    <th>手机号/账号</th>
                    <th>所属部门</th>
                    <th>角色</th>
                    <th>本月额度</th>
                    <th>本月已用</th>
                    <th>剩余</th>
                    <th className="am-th-enable">启用</th>
                    <th className="am-th-grant">发放额度</th>
                    <th className="am-th-ops">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="am-user-empty">暂无数据</td>
                    </tr>
                  ) : (
                    pageItems.map((m, i) => {
                      const canEdit = canEditMemberCredentials(permStore, actorUserId, m, user);
                      const isAdmin = isOrgAdminActor(permStore, actorUserId, user);
                      const canManage = canManageSubAccount(permStore, actorUserId, m, user);
                      const canOpenEdit = canEdit || canManage || (m.isPrimary && isAdmin);
                      const accountRole = resolveMemberAccountRole(permStore, m);
                      const q = quotaMap[m.id] || { limit: 0, used: 0, remain: 0 };
                      const remain = q.remain;
                      const canDel = canDeleteMember(permStore, actorUserId, m, user);
                      const loginId = memberPhoneOf(permStore, m.id);
                      return (
                        <tr key={m.id}>
                          <td>{(safePage - 1) * pageSize + i + 1}</td>
                          <td>{m.name}</td>
                          <td>{loginId}</td>
                          <td>{memberDepartmentOf(permStore, m.id)}</td>
                          <td>{roleLabel(accountRole)}</td>
                          <td className="mono am-points-used">{formatPoints(q.limit)}</td>
                          <td className="mono am-points-used">{formatPoints(q.used)}</td>
                          <td
                            className={`mono am-points-used${remain <= 0 ? " am-points-left--empty" : ""}`}
                            title="本月剩余额度"
                          >
                            {formatPoints(remain)}
                          </td>
                          <td className="am-td-enable">
                            {!m.isPrimary ? (
                              <button
                                type="button"
                                role="switch"
                                aria-checked={m.status === "正常"}
                                aria-label={m.status === "正常" ? "停用该成员" : "启用该成员"}
                                className={`am-status-switch${m.status === "正常" ? " on" : ""}`}
                                disabled={!canManage}
                                onClick={() => toggleMemberEnabled(m, m.status !== "正常")}
                              >
                                {m.status === "正常" ? "启用" : "停用"}
                              </button>
                            ) : (
                              <span className="am-op-muted">—</span>
                            )}
                          </td>
                          <td className="am-td-grant">
                            {!m.isPrimary && canShowGrant(m) ? (
                              <button type="button" className="am-link-act" onClick={() => openGrant(m)}>
                                发放额度
                              </button>
                            ) : (
                              <span className="am-op-muted">—</span>
                            )}
                          </td>
                          <td className="am-th-ops">
                            <div className="am-row-links">
                              {canOpenEdit ? (
                                <button type="button" className="am-link-act" onClick={() => openRowEdit(m)}>
                                  编辑
                                </button>
                              ) : null}
                              {canDel ? (
                                <button
                                  type="button"
                                  className="am-link-act am-link-act--danger"
                                  onClick={() => void removeSubAccount(m)}
                                >
                                  删除
                                </button>
                              ) : !canOpenEdit ? (
                                <span className="am-op-muted">—</span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="am-user-foot">
              <span>共 {filteredMembers.length} 条</span>
              <div className="am-user-pager">
                {pageCount > 1 && (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      上一页
                    </button>
                    <span>
                      {safePage}/{pageCount}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={safePage >= pageCount}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    >
                      下一页
                    </button>
                  </>
                )}
                <select
                  className="am-page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value) || 20);
                    setPage(1);
                  }}
                  aria-label="每页条数"
                >
                  <option value={10}>10条/页</option>
                  <option value={20}>20条/页</option>
                  <option value={50}>50条/页</option>
                </select>
              </div>
            </div>
            <p className="am-add-hint-line">
              上级「发放额度」从自己的剩余额度划出，加到下级本月额度，下级即可用来生成。超额无法生成。需要扩容席位时
              <button type="button" className="am-add-hint" onClick={onContact}>
                联系企业客服
              </button>
            </p>
          </section>
        </div>
      ) : (
        <>
          <h1 className="am-title">成员管理</h1>
          <button type="button" className="am-add-hint" onClick={onContact}>
            企业认证后可在此添加成员
          </button>
        </>
      )}

      <PersonEditShell
        title="新增组织架构"
        open={ouAddOpen}
        onClose={closeOuForm}
        onSave={submitOuForm}
        saveLabel="确认"
        showCancel
      >
        <div className="am-ou-form">
          <label className="am-ou-form-row">
            <span className="am-ou-form-label">
              <em>*</em>名称
            </span>
            <input
              value={ouAddName}
              onChange={(e) => setOuAddName(e.target.value)}
              placeholder="请输入名称"
              autoFocus
            />
          </label>
        </div>
      </PersonEditShell>

      <PersonEditShell
        title="发放额度"
        open={grantOpen}
        onClose={() => {
          setGrantOpen(false);
          setEditId(null);
        }}
        onSave={submitGrant}
        saveLabel="确认发放"
        showCancel
        wide
      >
        <div className="am-add-form">
          <label className="am-add-field">
            <span className="am-add-label">
              发放对象 <em>*</em>
            </span>
            <input
              value={
                editing
                  ? `${editing.name}（${memberPhoneOf(permStore, editing.id)}）`
                  : ""
              }
              disabled
              readOnly
            />
          </label>
          <p className="am-pedit-hint">
            从自己的剩余额度划给该成员。你还可发放 {formatPoints(actorRemain)}。
            {editing
              ? ` 对方当前额度 ${formatPoints(quotaMap[editing.id]?.limit ?? 0)}，本月已用 ${formatPoints(quotaMap[editing.id]?.used ?? 0)}。`
              : ""}
          </p>
          <label className="am-add-field">
            <span className="am-add-label">
              本次发放 <em>*</em>
            </span>
            <input
              type="number"
              min={1}
              max={actorRemain}
              step={1}
              value={grantLimit || ""}
              onChange={(e) => setGrantLimit(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              placeholder={`最多 ${actorRemain}`}
              autoFocus
            />
          </label>
        </div>
      </PersonEditShell>

      <PersonEditShell
        title="新增用户"
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={submitAdd}
        saveLabel="确定"
        showCancel
      >
        <div className="am-user-form">
          <div className="am-user-form-row am-user-form-row--full">
            <label className="am-user-form-item">
              <span>
                <em>*</em>用户名
              </span>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="请输入用户名"
                autoFocus
              />
            </label>
          </div>
          <div className="am-user-form-row am-user-form-row--full">
            <div className="am-user-form-item">
              <span>
                <em>*</em>权限类型
              </span>
              {isOrgAdminActor(permStore, actorUserId, user) ? (
                <div className="am-user-radios" role="radiogroup" aria-label="权限类型">
                  <label className={`am-user-radio${addRole !== "ou_admin" ? " on" : ""}`}>
                    <input
                      type="radio"
                      name="add-user-perm"
                      checked={addRole !== "ou_admin"}
                      onChange={() => setAddRole("member")}
                    />
                    成员
                  </label>
                  <label className={`am-user-radio${addRole === "ou_admin" ? " on" : ""}`}>
                    <input
                      type="radio"
                      name="add-user-perm"
                      checked={addRole === "ou_admin"}
                      onChange={() => setAddRole("ou_admin")}
                    />
                    管理员
                  </label>
                </div>
              ) : (
                <input value="成员" disabled />
              )}
            </div>
          </div>
          <div className="am-user-form-row am-user-form-row--full">
            <label className="am-user-form-item">
              <span>
                <em>*</em>手机号/账号
              </span>
              <input
                value={addPhone}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, "").slice(0, 11);
                  setAddPhone(next);
                }}
                placeholder="请输入11位手机号"
                inputMode="numeric"
                maxLength={11}
              />
            </label>
          </div>
          <div className="am-user-form-row am-user-form-row--full">
            <label className="am-user-form-item">
              <span>
                <em>*</em>登录密码
              </span>
              <div className="am-pwd-field">
                <input
                  type={addPasswordVisible ? "text" : "password"}
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  placeholder="请输入登录密码"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="am-pwd-toggle"
                  aria-label={addPasswordVisible ? "隐藏密码" : "显示密码"}
                  onClick={() => setAddPasswordVisible((v) => !v)}
                >
                  <Icon name={addPasswordVisible ? "eyeOff" : "eye"} size={16} />
                </button>
              </div>
            </label>
          </div>
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
              用户名 <em>*</em>
            </span>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="请输入用户名"
              autoFocus
            />
          </label>
          {editing && !editing.isPrimary ? (
          <label className="am-add-field">
            <span className="am-add-label">
              账号类型 <em>*</em>
            </span>
            {isOrgAdminActor(permStore, actorUserId, user) ? (
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
          ) : null}
          {editing && !editing.isPrimary ? (
          <label className="am-add-field">
            <span className="am-add-label">
              自行购买/充值 <em>*</em>
            </span>
            {isOrgAdminActor(permStore, actorUserId, user) ? (
              <select
                value={editCanSelfRecharge ? "allow" : "forbid"}
                onChange={(e) => setEditCanSelfRecharge(e.target.value === "allow")}
              >
                <option value="forbid">禁止（仅上一级发放额度）</option>
                <option value="allow">允许</option>
              </select>
            ) : (
              <input value={editCanSelfRecharge ? "允许" : "禁止（仅上一级发放额度）"} disabled />
            )}
          </label>
          ) : null}
          <label className="am-add-field">
            <span className="am-add-label">
              手机号/账号 <em>*</em>
            </span>
            <input
              value={editAccount}
              onChange={(e) => setEditAccount(e.target.value.replace(/\D/g, "").slice(0, 11))}
              placeholder="请输入11位手机号"
              inputMode="numeric"
              maxLength={11}
            />
          </label>
          <label className="am-add-field">
            <span className="am-add-label">登录密码</span>
            <div className="am-pwd-field">
              <input
                type={editPasswordVisible ? "text" : "password"}
                value={editPassword}
                onChange={(e) => {
                  setEditPwdDirty(true);
                  setEditPassword(e.target.value);
                }}
                onFocus={(e) => {
                  if (!editPwdDirty) e.currentTarget.select();
                }}
                placeholder=""
                autoComplete="new-password"
              />
              <button
                type="button"
                className="am-pwd-toggle"
                aria-label={editPasswordVisible ? "隐藏密码" : "显示密码"}
                onClick={() => setEditPasswordVisible((v) => !v)}
              >
                <Icon name={editPasswordVisible ? "eyeOff" : "eye"} size={16} />
              </button>
            </div>
          </label>
        </div>
      </PersonEditShell>
    </div>
  );
}

function BrandAssetsPanel() {
  const { user } = useAuth();
  if (!hasEnterpriseInfo(user)) return null;
  return (
    <div className="am-panel am-panel-wide am-brand-panel">
      <h1 className="am-title">品牌资产</h1>
      <BrandPane seed={seedBrands} seqStart={BRAND_SEQ_START} mode="mine" />
    </div>
  );
}

function AccountInner() {
  const { user } = useAuth();
  const isEnterprise = hasEnterpriseInfo(user);
  const [tab, setTab] = useAccountTab();
  const [csOpen, setCsOpen] = useState(false);
  const memberSubRaw = useSearchParams().get("sub");
  const memberSub =
    memberSubRaw === "pointsLedger" || memberSubRaw === "membershipCard" ? memberSubRaw : "membershipCard";

  const body = (() => {
    switch (tab) {
      case "personal":
        return <PersonalPanel />;
      case "member":
        return <MembershipPanel key={memberSub} initialSub={memberSub} />;
      case "space":
        return <StorageSpacePanel />;
      case "invite":
        return <InviteGiftPanel />;
      case "members":
        return isEnterprise ? <MembersPanel onContact={() => setCsOpen(true)} /> : <PersonalPanel />;
      case "creations":
        return isEnterprise ? <BrandAssetsPanel /> : <PersonalPanel />;
      default:
        return <PersonalPanel />;
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
