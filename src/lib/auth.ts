/* 登录态（演示）：本地持久化，无真实后端鉴权 */

export type UserRole = "超级管理员" | "营销经理" | "生产主管" | "质检员" | "电商运营" | "企业管理员" | "主账号";

export interface AuthUser {
  username: string;
  realName: string;
  nickname: string;
  phone: string;
  email: string;
  workEmail: string;
  address: string;
  /** 账号归属县域 id（anji/deqing/changxing/huzhou/wuxing）；优先于地址推断 */
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
  roleTitle: "企业管理员",
  roleBadge: "企业版",
  company: "贾鑫康试用",
  companyId: "ENT-JXK-001",
  orgName: "贾鑫康试用",
  planLabel: "企业版",
  userId: "qy2026061011303245131420wjnp1",
  computeBenefit: "∞",
  computeGift: "∞",
  benefitStart: "2026-06-10 11:30:26",
  expiresAt: "2028-06-30 11:30:29",
  memberCount: "1/1",
  createdAt: "2026-06-10 11:30:32",
  enterpriseVerified: false,
  loginPasswordMasked: "********************",
};

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
      const merged = { ...DEMO_USER, ...u };
      saveSession(merged);
      return merged;
    }
    const u = JSON.parse(raw) as AuthUser;
    if (!u?.username) return null;
    return { ...DEMO_USER, ...u };
  } catch {
    return null;
  }
}

export function saveSession(user: AuthUser) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_KEY, JSON.stringify(user));
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
  const user: AuthUser = {
    ...DEMO_USER,
    username: a.includes("@") ? a : DEMO_USER.username,
    email: a.includes("@") ? a : DEMO_USER.email,
    nickname: a.includes("@") ? a : DEMO_USER.nickname,
  };
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
  const user: AuthUser = {
    ...DEMO_USER,
    phone: p,
    username: p,
    nickname: `用户${p.slice(-4)}`,
    email: `${p}@phone.demo`,
  };
  saveSession(user);
  return user;
}
