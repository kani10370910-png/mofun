/* 登录态（演示）：本地持久化，无真实后端鉴权 */

export type UserRole = "超级管理员" | "营销经理" | "生产主管" | "质检员" | "电商运营" | "企业管理员";

export interface AuthUser {
  username: string;
  realName: string;
  phone: string;
  email: string;
  workEmail: string;
  address: string;
  roleTitle: string; // 展示名：企业管理员
  roleBadge: string; // 超级管理员
  company: string;
  companyId: string;
  planLabel: string; // Admin
}

export interface TeamMember {
  id: string;
  name: string;
  department: string;
  role: UserRole | string;
  status: "正常" | "停用";
}

const AUTH_KEY = "mofun.auth.session.v1";

export const DEMO_USER: AuthUser = {
  username: "admin_ent_001",
  realName: "张建国",
  phone: "13800138000",
  email: "admin@xs-green-agri.com",
  workEmail: "zhangjg@xs-green-agri.com",
  address: "浙江省杭州市萧山区现代农业产业园A区-8号楼",
  roleTitle: "企业管理员",
  roleBadge: "超级管理员",
  company: "杭州萧山绿色农产品有限公司",
  companyId: "ENT-2025-XS001",
  planLabel: "Admin",
};

export const DEMO_TEAM: TeamMember[] = [
  { id: "m1", name: "张建国", department: "总经办", role: "超级管理员", status: "正常" },
  { id: "m2", name: "李晓华", department: "市场部", role: "营销经理", status: "正常" },
  { id: "m3", name: "王伟", department: "生产部", role: "生产主管", status: "正常" },
  { id: "m4", name: "赵敏", department: "品质部", role: "质检员", status: "正常" },
  { id: "m5", name: "陈思思", department: "销售部", role: "电商运营", status: "正常" },
];

/** 演示账号（登录页预填） */
export const DEMO_LOGIN = {
  account: "admin_ent_001",
  password: "admin123",
};

export function loadSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
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
}

export function loginWithDemo(account: string, password: string): AuthUser | null {
  const ok =
    (account.trim() === DEMO_LOGIN.account || account.trim() === DEMO_USER.email) &&
    password === DEMO_LOGIN.password;
  if (!ok) return null;
  saveSession(DEMO_USER);
  return DEMO_USER;
}
