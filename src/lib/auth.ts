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
  /** 权益算力展示文案，如 ∞ */
  computeBenefit: string;
  /** 赠送算力展示文案 */
  computeGift: string;
  /** 权益生效 */
  benefitStart: string;
  /** 权益到期 */
  expiresAt: string;
  /** 成员数当前/上限 */
  memberCount: string;
  createdAt: string;
  enterpriseVerified: boolean;
  /** 个人实名认证（手机号用户升级企业前需完成） */
  personalVerified: boolean;
  /** 登录方式 */
  loginMethod?: "phone" | "enterprise";
  loginPasswordMasked: string;
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
  status: "正常" | "停用";
  avatarUrl?: string;
}

const AUTH_KEY = "mofun.auth.session.v2";

export const DEMO_CODE = "123456";

export const DEMO_USER: AuthUser = {
  username: "jxk1@test",
  realName: "贾鑫康试用",
  nickname: "jxk1@test",
  phone: "13800138000",
  email: "jxk1@test",
  workEmail: "jxk1@test",
  address: "浙江省湖州市安吉县",
  regionId: "anji",
  roleTitle: "个人用户",
  roleBadge: "个人版",
  company: "",
  companyId: "ENT-JXK-001",
  orgName: "贾鑫康试用",
  planLabel: "个人版",
  userId: "qy2026061011303245131420wjnp1",
  computeBenefit: "∞",
  computeGift: "∞",
  benefitStart: "2026-06-10 11:30:26",
  expiresAt: "2028-06-30 11:30:29",
  memberCount: "1/1",
  createdAt: "2026-06-10 11:30:32",
  /** 未填写企业认证信息前为个人版 */
  enterpriseVerified: false,
  personalVerified: false,
  loginMethod: "enterprise",
  loginPasswordMasked: "********************",
};

/** 是否已填写并完成企业信息（企业版） */
export function hasEnterpriseInfo(user: AuthUser | null | undefined): boolean {
  return !!user?.enterpriseVerified;
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

  return {
    ...user,
    planLabel: enterprise ? "企业版" : "个人版",
    roleBadge: enterprise ? "企业版" : "个人版",
    /** 个人版只有自己，不展示团队成员额度 */
    memberCount: enterprise ? user.memberCount || "1/20" : "1/1",
    ...(usePhoneLogin
      ? {
          phone: loginPhone,
          username: loginPhone,
          loginMethod: "phone" as const,
          loginPasswordMasked: "手机验证码登录",
          email: `${loginPhone}@phone.demo`,
        }
      : {}),
    roleTitle: enterprise
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
    company: "",
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
  },
];

/** 企业账户演示账号 */
export const DEMO_LOGIN = {
  account: "jxk1@test",
  password: "admin123",
};

const LEGACY_ACCOUNTS = new Set(["admin_ent_001", "admin@xs-green-agri.com", "jxk1@test"]);

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
      const merged = withPlanFromEnterprise({ ...DEMO_USER, ...u });
      saveSession(merged);
      return merged;
    }
    const u = JSON.parse(raw) as AuthUser;
    if (!u?.username) return null;
    return withPlanFromEnterprise({ ...DEMO_USER, ...u });
  } catch {
    return null;
  }
}

export function saveSession(user: AuthUser) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_KEY, JSON.stringify(withPlanFromEnterprise(user)));
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
    enterpriseVerified: false,
    personalVerified: false,
    company: "",
    planLabel: "个人版",
    roleBadge: "个人版",
    roleTitle: "个人用户",
    loginMethod: "enterprise",
  });
  saveSession(user);
  return user;
}

/** @deprecated 使用 loginWithEnterprise */
export function loginWithDemo(account: string, password: string): AuthUser | null {
  return loginWithEnterprise(account, password);
}

export function loginWithPhone(phone: string, code: string): AuthUser | null {
  const p = phone.trim().replace(/\s/g, "");
  if (!/^1\d{10}$/.test(p)) return null;
  if (code.trim() !== DEMO_CODE) return null;
  const user = withPlanFromEnterprise({
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
    personalVerified: false,
    planLabel: "个人版",
    roleBadge: "个人版",
    roleTitle: "个人用户",
    memberCount: "1/1",
    loginMethod: "phone",
    loginPasswordMasked: "手机验证码登录",
  });
  saveSession(user);
  return user;
}
