export type UserRole = "超级管理员" | "营销经理" | "生产主管" | "质检员" | "电商运营" | "企业管理员" | "主账号";

export interface AuthUser {
  username: string;
  realName: string;
  nickname: string;
  phone: string;
  email: string;
  workEmail: string;
  address: string;
  /** 账号归属区县 id（anji/deqing/changxing/huzhou/wuxing）；优先于地址推断 */
  regionId?: string;
  roleTitle: string;
  roleBadge: string;
  company: string;
  companyId: string;
  orgName: string;
  planLabel: string;
  userId: string;
  avatarUrl?: string;
  /** 会员算力展示文案 */
  computeBenefit: string;
  /** 赠送算力展示文案 */
  computeGift: string;
  /** 充值算力展示文案 */
  computeRecharge?: string;
  /** 权益生效 */
  benefitStart: string;
  /** 权益到期 */
  expiresAt: string;
  /** 成员数当前/上限 */
  memberCount: string;
  createdAt: string;
  /** 最近一次登录时间 */
  lastLoginAt?: string;
  enterpriseVerified: boolean;
  /** 以成员身份加入他人企业（不是企业主账号） */
  joinedOrg?: boolean;
  /** 个人实名认证（手机号用户升级企业前需完成） */
  personalVerified: boolean;
  /** 登录方式 */
  loginMethod?: "phone" | "enterprise";
  loginPasswordMasked: string;
  /** 明文登录密码（演示：同步给运营端租户列表展示） */
  loginPassword?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  account: string;
  userId: string;
  passwordPlain: string;
  isPrimary?: boolean;
  department: string;
  role: UserRole | string;
  status: "正常" | "停用" | "冻结";
  avatarUrl?: string;
  /** 本月可用积分；由企业主账号/管理员在成员管理中设置 */
  monthlyLimit?: number;
  /** 是否允许自行购买会员或充值算力；禁止时只能由上一级发放额度 */
  canSelfRecharge?: boolean;
  phone?: string;
  employeeNo?: string;
  expiresAt?: string;
  extraInfo?: string;
}

const AUTH_KEY = "mofun.auth.session.v2";
const ACCOUNTS_KEY = "mofun.auth.accounts.v1";

export const DEMO_CODE = "123456";
/** 手机号账号未单独设密时的演示登录密码（与验证码演示值相同，可密码登录） */
export const DEMO_PHONE_PASSWORD = DEMO_CODE;

export const DEMO_USER: AuthUser = {
  username: "jxk1@test",
  realName: "贾鑫康试用",
  nickname: "jxk1@test",
  phone: "13800138000",
  email: "jxk1@test",
  workEmail: "jxk1@test",
  address: "浙江省湖州市安吉县",
  regionId: "anji",
  roleTitle: "企业管理员",
  roleBadge: "企业版",
  company: "贾鑫康试用",
  companyId: "ENT-JXK-001",
  orgName: "贾鑫康试用",
  planLabel: "企业版",
  userId: "qy2026061011303245131420wjnp1",
  computeBenefit: "0",
  computeGift: "50",
  computeRecharge: "0",
  benefitStart: "2026-06-10 11:30:26",
  expiresAt: "2028-06-30 11:30:29",
  memberCount: "1/20",
  createdAt: "2026-06-10 11:30:32",
  lastLoginAt: "2026-06-10 11:30:32",
  enterpriseVerified: true,
  personalVerified: true,
  loginMethod: "enterprise",
  loginPasswordMasked: "********************",
};

/** 是否企业版：自己完成企业认证，或已加入他人企业 */
export function hasEnterpriseInfo(user: AuthUser | null | undefined): boolean {
  return !!user?.enterpriseVerified || !!user?.joinedOrg;
}

/** 自己开通的企业主账号（不含填码加入） */
export function isEnterpriseOwner(user: AuthUser | null | undefined): boolean {
  return !!user?.enterpriseVerified && !user?.joinedOrg;
}

/** 填企业码/邀请后加入的成员 */
export function isJoinedOrgMember(user: AuthUser | null | undefined): boolean {
  return !!user?.joinedOrg;
}

/** 展示用版本标签：未输入企业信息 → 个人版 */
export function resolvePlanLabel(user: AuthUser | null | undefined): string {
  if (!user) return "个人版";
  return hasEnterpriseInfo(user) ? "企业版" : "个人版";
}

/** 是否以手机号作为登录账户 */
export function isPhoneLoginUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  // 企业版且走企业账号密码登录时，保留邮箱账号
  if (hasEnterpriseInfo(user) && user.loginMethod === "enterprise") return false;
  if (user.loginMethod === "phone") return true;
  if (/^1\d{10}$/.test(user.username)) return true;
  // 个人版已绑手机 → 登录账户即手机号
  if (!hasEnterpriseInfo(user) && /^1\d{10}$/.test(user.phone || "")) return true;
  return false;
}

/** 展示用登录账户：手机号登录显示手机号 */
export function resolveLoginAccount(user: AuthUser): string {
  if (isPhoneLoginUser(user)) return user.phone || user.username;
  return user.username;
}

function isPlaceholderLoginPassword(value?: string | null) {
  const v = (value || "").trim();
  return !v || v === "手机验证码登录" || v === "验证码登录";
}

const PHONE_PWD_KEY = "mofun.auth.phone-passwords.v1";

function readPhonePasswordBook(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PHONE_PWD_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return map && typeof map === "object" ? map : {};
  } catch {
    return {};
  }
}

/** 记住手机号登录密码，供运营端展示；验证码不是密码 */
export function rememberPhonePassword(phone: string, password: string) {
  if (typeof window === "undefined") return;
  const p = phone.trim().replace(/\s/g, "");
  const pwd = password.trim();
  if (!/^1\d{9,10}$/.test(p) || isPlaceholderLoginPassword(pwd) || pwd.length < 6) return;
  try {
    const map = readPhonePasswordBook();
    map[p] = pwd;
    window.localStorage.setItem(PHONE_PWD_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function loadPhonePassword(phone: string): string {
  const p = phone.trim().replace(/\s/g, "");
  if (!/^1\d{9,10}$/.test(p)) return "";
  const pwd = String(readPhonePasswordBook()[p] || "").trim();
  return isPlaceholderLoginPassword(pwd) ? "" : pwd;
}

/** 个人信息展示用密码：验证码不是密码，未设置过则提示未设置 */
export function resolveLoginPasswordDisplay(user: AuthUser | null | undefined): string {
  const phone = (user?.phone || user?.username || "").trim();
  const plain = (user?.loginPassword || loadPhonePassword(phone) || "").trim();
  if (plain && !isPlaceholderLoginPassword(plain)) return plain;
  if (user && isPhoneLoginUser(user)) return DEMO_PHONE_PASSWORD;
  return "未设置";
}

/** 是否为未自定义的占位昵称（如登录时自动生成的「用户后四位」） */
export function isPlaceholderNickname(user: AuthUser | null | undefined): boolean {
  if (!user) return true;
  const nick = (user.nickname || "").trim();
  if (!nick) return true;
  const phone = (user.phone || user.username || "").trim();
  if (/^1\d{10}$/.test(phone) && nick === `用户${phone.slice(-4)}`) return true;
  return false;
}

/** 头像旁展示名：无自定义昵称时展示完整手机号 */
export function resolveDisplayName(user: AuthUser): string {
  if (!isPlaceholderNickname(user)) return user.nickname.trim();
  const phone = (user.phone || "").trim();
  if (/^1\d{10}$/.test(phone)) return phone;
  if (/^1\d{10}$/.test(user.username)) return user.username;
  return user.username || user.realName || "用户";
}

/** 本账号用户名：自定义昵称 → 成员表名称 → 手机号/账号 */
export function resolveAccountUserName(
  user: AuthUser | null | undefined,
  memberName?: string | null,
): string {
  if (!user) return "";
  if (!isPlaceholderNickname(user)) return user.nickname.trim();
  const org = (user.orgName || user.company || "").trim();
  const fromMember = (memberName || "").trim();
  if (fromMember && fromMember !== org) return fromMember;
  return resolveDisplayName(user);
}

/** 同步 planLabel / roleBadge 与企业认证状态 */
export function withPlanFromEnterprise(user: AuthUser): AuthUser {
  const enterprise = hasEnterpriseInfo(user);
  const phone = (user.phone || "").trim();
  const phoneLogin =
    user.loginMethod === "phone" ||
    /^1\d{10}$/.test(user.username) ||
    (!enterprise && /^1\d{10}$/.test(phone));
  const loginPhone = /^1\d{10}$/.test(phone)
    ? phone
    : /^1\d{10}$/.test(user.username)
      ? user.username
      : "";
  const usePhoneLogin = phoneLogin && !!loginPhone && !(enterprise && user.loginMethod === "enterprise");
  const loginPassword = isPlaceholderLoginPassword(user.loginPassword)
    ? usePhoneLogin
      ? DEMO_PHONE_PASSWORD
      : ""
    : (user.loginPassword || "").trim();
  const prevMasked = isPlaceholderLoginPassword(user.loginPasswordMasked) ? "" : (user.loginPasswordMasked || "").trim();
  const loginPasswordMasked = loginPassword
    ? "*".repeat(Math.min(20, Math.max(8, loginPassword.length)))
    : prevMasked;

  return {
    ...user,
    planLabel: enterprise ? "企业版" : "个人版",
    roleBadge: enterprise ? "企业版" : "个人版",
    /** 个人版只有自己，不展示团队成员额度 */
    memberCount: enterprise ? user.memberCount || "1/20" : "1/1",
    loginPassword: loginPassword || undefined,
    loginPasswordMasked,
    ...(usePhoneLogin
      ? {
          phone: loginPhone,
          username: loginPhone,
          loginMethod: "phone" as const,
          email: `${loginPhone}@phone.demo`,
        }
      : {}),
    roleTitle: user.joinedOrg
      ? user.roleTitle === "企业管理员" || user.roleTitle === "主账号" || user.roleTitle === "个人用户"
        ? "成员账号"
        : user.roleTitle
      : enterprise
        ? user.roleTitle === "个人用户"
          ? "企业管理员"
          : user.roleTitle
        : user.roleTitle === "企业管理员" || user.roleTitle === "主账号"
          ? "个人用户"
          : user.roleTitle,
  };
}

/** 退出企业认证，恢复个人版（演示）；保留个人实名状态 */
export function revokeEnterprisePatch(): Partial<AuthUser> {
  return {
    enterpriseVerified: false,
    joinedOrg: false,
    company: "",
    planLabel: "个人版",
    roleBadge: "个人版",
    roleTitle: "个人用户",
    memberCount: "1/1",
  };
}

/** 个人填企业码后加入企业（成员，不是主账号） */
export function applyJoinedOrgPatch(company: string, companyId?: string): Partial<AuthUser> {
  const name = company.trim();
  return {
    joinedOrg: true,
    enterpriseVerified: false,
    company: name,
    orgName: name,
    companyId: companyId || undefined,
    planLabel: "企业版",
    roleBadge: "企业版",
    roleTitle: "成员账号",
  };
}

/** 退出已加入的企业，恢复个人版；保留个人实名 */
export function leaveJoinedOrgPatch(user?: AuthUser | null): Partial<AuthUser> {
  const fallback = (user?.nickname || user?.phone || user?.username || "").trim();
  return {
    joinedOrg: false,
    enterpriseVerified: false,
    company: "",
    companyId: user?.phone && /^1\d{10}$/.test(user.phone) ? `PER-${user.phone.slice(-6)}` : user?.companyId || "",
    orgName: fallback,
    planLabel: "个人版",
    roleBadge: "个人版",
    roleTitle: "个人用户",
    memberCount: "1/1",
  };
}

/** 完成个人实名认证 */
export function applyPersonalCertPatch(input: {
  realName: string;
  idNumber: string;
}): Partial<AuthUser> {
  return {
    personalVerified: true,
    realName: input.realName.trim(),
  };
}

export const DEMO_TEAM: TeamMember[] = [
  {
    id: "m1",
    name: "jxk1@test",
    account: "jxk1@test",
    userId: "qy2026061011303245131420wjnp1",
    passwordPlain: "uhpdtm0wn4",
    isPrimary: true,
    department: "总经办",
    role: "主账号",
    status: "正常",
    monthlyLimit: 20000,
  },
];

/** 企业账户演示账号 */
export const DEMO_LOGIN = {
  account: "jxk1@test",
  password: "admin123",
};

const LEGACY_ACCOUNTS = new Set(["admin_ent_001", "admin@xs-green-agri.com", "jxk1@test"]);

function isDemoEnterpriseAccount(user: Pick<AuthUser, "username" | "email" | "loginMethod">) {
  const account = user.username || user.email || "";
  return user.loginMethod === "enterprise" && (LEGACY_ACCOUNTS.has(account) || account === DEMO_LOGIN.account);
}

/** 演示企业账号被登录逻辑误降成个人版时，恢复企业身份与成员管理 */
function restoreDemoEnterpriseAccount(user: AuthUser): AuthUser {
  if (!isDemoEnterpriseAccount(user) || user.enterpriseVerified) return user;
  return {
    ...user,
    enterpriseVerified: true,
    personalVerified: true,
    company: user.company || user.orgName || DEMO_USER.company,
    orgName: user.orgName || DEMO_USER.orgName,
    roleTitle: user.roleTitle === "个人用户" ? "企业管理员" : user.roleTitle,
    memberCount: !user.memberCount || user.memberCount === "1/1" ? "1/20" : user.memberCount,
  };
}

export function loadSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    if (!raw) {
      // 兼容旧 key
      const old = window.localStorage.getItem("mofun.auth.session.v1");
      if (!old) return null;
      const u = JSON.parse(old) as Partial<AuthUser>;
      if (!u?.username) return null;
      const merged = withPlanFromEnterprise(restoreDemoEnterpriseAccount({ ...DEMO_USER, ...u }));
      saveSession(merged);
      return merged;
    }
    const u = JSON.parse(raw) as AuthUser;
    if (!u?.username) return null;
    const merged = withPlanFromEnterprise(restoreDemoEnterpriseAccount({ ...DEMO_USER, ...u }));
    const phone = merged.phone || merged.username || "";
    const pwd = (merged.loginPassword || loadPhonePassword(phone) || "").trim();
    const withPwd = pwd
      ? withPlanFromEnterprise({ ...merged, loginPassword: pwd })
      : merged;
    if (pwd) rememberPhonePassword(phone, pwd);
    if (!!withPwd.enterpriseVerified !== !!u.enterpriseVerified || pwd !== (u.loginPassword || "")) {
      saveSession(withPwd);
    } else {
      rememberAccount(withPwd);
    }
    return withPwd;
  } catch {
    return null;
  }
}

export function nowDateTime() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function phoneAccountKey(user: Pick<AuthUser, "phone" | "username">): string {
  const phone = (user.phone || "").trim().replace(/\s/g, "");
  if (/^1\d{9,10}$/.test(phone)) return phone;
  const username = (user.username || "").trim().replace(/\s/g, "");
  if (/^1\d{9,10}$/.test(username)) return username;
  return "";
}

function readAccountBook(): Record<string, AuthUser> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return {};
    const map = JSON.parse(raw) as Record<string, AuthUser>;
    return map && typeof map === "object" ? map : {};
  } catch {
    return {};
  }
}

function writeAccountBook(map: Record<string, AuthUser>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** 按手机号记住账号档案：退出登录后仍能恢复企业认证等状态 */
export function rememberAccount(user: AuthUser) {
  if (typeof window === "undefined") return;
  if (isDemoEnterpriseAccount(user)) return;
  const key = phoneAccountKey(user);
  if (!key) return;
  const book = readAccountBook();
  book[key] = withPlanFromEnterprise(user);
  writeAccountBook(book);
}

export function loadAccountByPhone(phone: string): AuthUser | null {
  const key = phone.trim().replace(/\s/g, "");
  if (!/^1\d{9,10}$/.test(key)) return null;
  const saved = readAccountBook()[key];
  return saved?.username || saved?.userId ? saved : null;
}

export function saveSession(user: AuthUser) {
  if (typeof window === "undefined") return;
  const next = withPlanFromEnterprise(user);
  const phone = phoneAccountKey(next);
  if (next.loginPassword) rememberPhonePassword(phone || next.phone || next.username, next.loginPassword);
  window.localStorage.setItem(AUTH_KEY, JSON.stringify(next));
  rememberAccount(next);
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_KEY);
  window.localStorage.removeItem("mofun.auth.session.v1");
}

export function loginWithEnterprise(account: string, password: string): AuthUser | null {
  const a = account.trim();
  const ok =
    (LEGACY_ACCOUNTS.has(a) || a === DEMO_LOGIN.account) &&
    (password === DEMO_LOGIN.password || password === "uhpdtm0wn4");
  if (!ok) return null;
  const user = withPlanFromEnterprise({
    ...DEMO_USER,
    username: a.includes("@") ? a : DEMO_USER.username,
    email: a.includes("@") ? a : DEMO_USER.email,
    nickname: a.includes("@") ? a : DEMO_USER.nickname,
    loginMethod: "enterprise",
  });
  saveSession(user);
  return user;
}

/** @deprecated 使用 loginWithEnterprise */
export function loginWithDemo(account: string, password: string): AuthUser | null {
  return loginWithEnterprise(account, password);
}

function buildPhoneUser(phone: string, patch?: Partial<AuthUser>): AuthUser {
  const p = phone.trim().replace(/\s/g, "");
  const saved = loadAccountByPhone(p);
  if (saved) {
    return withPlanFromEnterprise({
      ...saved,
      phone: p,
      username: p,
      loginMethod: "phone",
      ...patch,
    });
  }
  return withPlanFromEnterprise({
    ...DEMO_USER,
    phone: p,
    username: p,
    nickname: "",
    realName: "",
    email: `${p}@phone.demo`,
    workEmail: "",
    orgName: p,
    company: "",
    companyId: `PER-${p.slice(-6)}`,
    userId: `ph${p}${Date.now().toString(36).slice(-4)}`,
    enterpriseVerified: false,
    joinedOrg: false,
    personalVerified: false,
    planLabel: "个人版",
    roleBadge: "个人版",
    roleTitle: "个人用户",
    memberCount: "1/1",
    loginMethod: "phone",
    loginPassword: undefined,
    loginPasswordMasked: "",
    ...patch,
  });
}

export function loginWithPhone(phone: string, code: string): AuthUser | null {
  const p = phone.trim().replace(/\s/g, "");
  if (!/^1\d{10}$/.test(p)) return null;
  if (code.trim() !== DEMO_CODE) return null;
  const savedPwd = loadPhonePassword(p);
  const user = buildPhoneUser(p, savedPwd ? { loginPassword: savedPwd } : undefined);
  saveSession(user);
  return user;
}

export function loginWithPhonePassword(phone: string, password: string): AuthUser | null {
  const p = phone.trim().replace(/\s/g, "");
  if (!/^1\d{10}$/.test(p)) return null;
  if (password.trim().length < 6) return null;
  const pwd = password.trim();
  const masked = "*".repeat(Math.min(20, Math.max(8, pwd.length)));
  const user = withPlanFromEnterprise({
    ...buildPhoneUser(p, { loginPassword: pwd, loginPasswordMasked: masked }),
    loginPassword: pwd,
    loginPasswordMasked: masked,
  });
  saveSession(user);
  return user;
}
