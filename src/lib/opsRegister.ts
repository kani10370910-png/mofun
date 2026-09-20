import { isEnterpriseOwner, isPlaceholderNickname, loadPhonePassword, loadSession, rememberPhonePassword, type AuthUser } from "@/lib/auth";
import { identityScopeKey } from "@/lib/identity";
import { ensureOrgJoinCode, loadOrgStore, memberPhoneOf, type OrgStore } from "@/lib/org";
import type { PhoneRegionInfo } from "@/lib/phoneRegion";
import type { PointsWallet } from "@/lib/points";

function opsBase() {
  return (process.env.NEXT_PUBLIC_OPS_API_BASE || "http://localhost:4100").replace(/\/$/, "");
}

function readInviteCode() {
  if (typeof window === "undefined") return "";
  try {
    const fromStore = window.sessionStorage.getItem("mofun.invite.code")?.trim() || "";
    if (fromStore) return fromStore;
    const q = new URLSearchParams(window.location.search).get("code")?.trim() || "";
    return q;
  } catch {
    return "";
  }
}

const reported = new Set<string>();

async function postPublic(path: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const urls = [`/api/public/${path}`, `${opsBase()}/public/${path}`];
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (r.ok) return { ok: true, data };
      if (r.status && r.status < 500) {
        return { ok: false, data };
      }
    } catch {
      /* try next */
    }
  }
  return { ok: false, data: {} };
}

async function getPublic(path: string): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const urls = [`/api/public/${path}`, `${opsBase()}/public/${path}`];
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (r.ok) return { ok: true, data };
      if (r.status && r.status < 500) return { ok: false, data };
    } catch {
      /* try next */
    }
  }
  return { ok: false, data: {} };
}

type WalletBuckets = { gift: number; benefit: number; recharge: number; subsidy: number };

const LAST_WALLET_KEY = "mofun.ops.wallet.last.v1";
const walletPushTimers = new Map<string, number>();

function asBucketNum(n: unknown) {
  return Math.max(0, Math.floor(Number(n) || 0));
}

function bucketsFromWallet(wallet: PointsWallet): WalletBuckets {
  return {
    gift: asBucketNum(wallet.giftPoints),
    benefit: asBucketNum(wallet.benefitPoints),
    recharge: asBucketNum(wallet.rechargePoints),
    subsidy: asBucketNum(wallet.subsidyPoints),
  };
}

function readLastBuckets(phone: string, tenantCode?: string): WalletBuckets | null {
  if (typeof window === "undefined") return null;
  try {
    const all = JSON.parse(window.localStorage.getItem(LAST_WALLET_KEY) || "{}") as Record<string, WalletBuckets>;
    const hit = all[walletBucketKey(phone, tenantCode)];
    if (!hit) return null;
    return {
      gift: asBucketNum(hit.gift),
      benefit: asBucketNum(hit.benefit),
      recharge: asBucketNum(hit.recharge),
      subsidy: asBucketNum(hit.subsidy),
    };
  } catch {
    return null;
  }
}

function writeLastBuckets(phone: string, buckets: WalletBuckets, tenantCode?: string) {
  if (typeof window === "undefined") return;
  try {
    const all = JSON.parse(window.localStorage.getItem(LAST_WALLET_KEY) || "{}") as Record<string, WalletBuckets>;
    all[walletBucketKey(phone, tenantCode)] = buckets;
    window.localStorage.setItem(LAST_WALLET_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function walletBucketKey(phone: string, tenantCode?: string) {
  return tenantCode && tenantCode !== phone ? `${phone}|${tenantCode}` : phone;
}

function tenantCodeFromWallet(wallet: PointsWallet, phone: string) {
  const uid = wallet.userId || "";
  if (uid.startsWith("owned:")) return `E${phone}`;
  if (uid.startsWith("joined:")) {
    const tail = uid.slice("joined:".length).replace(/\W/g, "").slice(-8) || "join";
    return `J${phone}-${tail}`;
  }
  return phone;
}

function phoneForUserId(userId: string): string {
  if (!userId) return "";
  const session = loadSession();
  const p = (session?.phone || session?.username || "").trim();
  if (/^1\d{9,10}$/.test(p)) {
    if (
      !userId ||
      session?.userId === userId ||
      userId.startsWith("owned:") ||
      userId.startsWith("joined:") ||
      userId.startsWith("personal:")
    ) {
      return p;
    }
  }
  if (!session) return "";
  const store = loadOrgStore(session);
  const m = store.members.find((x) => x.userId === userId);
  if (!m) return "";
  const mp = memberPhoneOf(store, m.id);
  return /^1\d{9,10}$/.test(mp) ? mp : "";
}

function defaultGiftExpiry(days = 30) {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(1, days));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 23:59:59`;
}

function applyOpsDelta(wallet: PointsWallet, ops: WalletBuckets, last: WalletBuckets | null): PointsWallet {
  if (!last) {
    const opsTotal = ops.gift + ops.benefit + ops.recharge + ops.subsidy;
    if (opsTotal <= 0) return wallet;
    return {
      ...wallet,
      giftPoints: ops.gift,
      benefitPoints: ops.benefit,
      rechargePoints: ops.recharge,
      subsidyPoints: ops.subsidy,
      giftExpiresAt: ops.gift > 0 ? wallet.giftExpiresAt || defaultGiftExpiry() : wallet.giftExpiresAt,
    };
  }
  const dGift = ops.gift - last.gift;
  const dBenefit = ops.benefit - last.benefit;
  const dRecharge = ops.recharge - last.recharge;
  const dSubsidy = ops.subsidy - last.subsidy;
  if (!dGift && !dBenefit && !dRecharge && !dSubsidy) return wallet;
  const next: PointsWallet = {
    ...wallet,
    giftPoints: Math.max(0, asBucketNum(wallet.giftPoints) + dGift),
    benefitPoints: Math.max(0, asBucketNum(wallet.benefitPoints) + dBenefit),
    rechargePoints: Math.max(0, asBucketNum(wallet.rechargePoints) + dRecharge),
    subsidyPoints: Math.max(0, asBucketNum(wallet.subsidyPoints) + dSubsidy),
  };
  const net = dGift + dBenefit + dRecharge;
  next.ledger = [
    {
      id: `ops-sync-${Date.now()}`,
      at: new Date().toISOString().slice(0, 19).replace("T", " "),
      kind: (net >= 0 ? "gift" : "transfer") as PointsWallet["ledger"][number]["kind"],
      amount: net || dSubsidy,
      title: "运营端同步",
      detail: `赠送 ${dGift >= 0 ? "+" : ""}${dGift}，会员 ${dBenefit >= 0 ? "+" : ""}${dBenefit}，充值 ${dRecharge >= 0 ? "+" : ""}${dRecharge}`,
    },
    ...(next.ledger || []),
  ].slice(0, 80);
  return next;
}

export async function pushCendWallet(phone: string, wallet: PointsWallet): Promise<boolean> {
  const code = phone.trim().replace(/\s/g, "");
  if (!/^1\d{9,10}$/.test(code)) return false;
  const tenantCode = tenantCodeFromWallet(wallet, code);
  const buckets = bucketsFromWallet(wallet);
  const r = await postPublic("wallet", { phone: code, tenant_code: tenantCode, ...buckets });
  if (r.ok) writeLastBuckets(code, buckets, tenantCode);
  return r.ok;
}

export function scheduleSyncCendWallet(wallet: PointsWallet) {
  if (typeof window === "undefined" || !wallet?.userId) return;
  const phone = phoneForUserId(wallet.userId);
  if (!phone) return;
  const prev = walletPushTimers.get(phone);
  if (prev) window.clearTimeout(prev);
  const timer = window.setTimeout(() => {
    walletPushTimers.delete(phone);
    void pushCendWallet(phone, wallet);
  }, 280);
  walletPushTimers.set(phone, timer);
}

export async function syncWalletWithOps(wallet: PointsWallet, phone: string): Promise<PointsWallet> {
  const code = phone.trim().replace(/\s/g, "");
  if (!/^1\d{9,10}$/.test(code) || !wallet) return wallet;
  const tenantCode = tenantCodeFromWallet(wallet, code);
  const got = await getPublic(`wallet?phone=${encodeURIComponent(code)}&tenant_code=${encodeURIComponent(tenantCode)}`);
  let next = wallet;
  if (got.ok && got.data.wallet && typeof got.data.wallet === "object") {
    const raw = got.data.wallet as Record<string, unknown>;
    const ops: WalletBuckets = {
      gift: asBucketNum(raw.gift),
      benefit: asBucketNum(raw.benefit),
      recharge: asBucketNum(raw.recharge),
      subsidy: asBucketNum(raw.subsidy),
    };
    next = applyOpsDelta(wallet, ops, readLastBuckets(code, tenantCode));
  }
  if (
    next.giftPoints !== wallet.giftPoints ||
    next.benefitPoints !== wallet.benefitPoints ||
    next.rechargePoints !== wallet.rechargePoints ||
    next.subsidyPoints !== wallet.subsidyPoints
  ) {
    const { savePointsWallet } = await import("@/lib/points");
    next = savePointsWallet(next);
  }
  await pushCendWallet(code, next);
  return next;
}

/** 把本机已有钱包推到运营端（成员未开通钱包的不种数） */
export function syncOrgWalletsToOps(store: OrgStore, user: AuthUser | null | undefined) {
  if (!user) return;
  const selfPhone = (user.phone || user.username || "").trim();
  void import("@/lib/points").then(({ loadPointsWallet, peekPointsWallet }) => {
    if (/^1\d{9,10}$/.test(selfPhone)) {
      void syncWalletWithOps(
        loadPointsWallet(identityScopeKey(user), { enterprise: isEnterpriseOwner(user) }),
        selfPhone,
      );
    }
    for (const m of store.members) {
      if (m.userId && m.userId === user.userId) continue;
      const phone = memberPhoneOf(store, m.id);
      if (!/^1\d{9,10}$/.test(phone)) continue;
      const w = m.userId ? peekPointsWallet(m.userId) : null;
      if (!w) continue;
      void pushCendWallet(phone, w);
    }
  });
}

export async function reportCendAccount(input: {
  phone: string;
  name?: string;
  province?: string;
  city?: string;
  district?: string;
  inviteCode?: string;
  enterprise?: boolean;
  company?: string;
  address?: string;
  joinCode?: string;
  password?: string;
}): Promise<boolean> {
  const phone = input.phone.trim().replace(/\s/g, "");
  if (!/^1\d{9,10}$/.test(phone)) return false;
  const r = await postPublic("register", {
    phone,
    name: (input.name || "").trim(),
    province: (input.province || "").trim(),
    city: (input.city || "").trim(),
    district: (input.district || "").trim(),
    invite_code: (input.inviteCode || "").trim(),
    enterprise: !!input.enterprise,
    company: (input.company || "").trim(),
    address: (input.address || "").trim(),
    join_code: (input.joinCode || "").trim(),
    password: (() => {
      const pwd = (input.password || "").trim();
      if (!pwd || pwd === "验证码登录" || pwd === "手机验证码登录") return "";
      return pwd;
    })(),
  });
  return r.ok;
}

export async function reportCendJoin(input: {
  phone: string;
  joinCode: string;
  name?: string;
}): Promise<{ ok: boolean; company?: string; error?: string }> {
  const phone = input.phone.trim().replace(/\s/g, "");
  if (!/^1\d{9,10}$/.test(phone)) return { ok: false, error: "请先绑定手机号" };
  const r = await postPublic("join", {
    phone,
    join_code: input.joinCode,
    name: (input.name || "").trim(),
  });
  if (!r.ok) {
    return { ok: false, error: String(r.data.error || "企业码无效") };
  }
  const company = String(r.data.company || "").trim();
  return { ok: true, company };
}

export async function reportCendOrgMember(input: {
  actorPhone: string;
  phone: string;
  name?: string;
  password?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const actorPhone = input.actorPhone.trim().replace(/\s/g, "");
  const phone = input.phone.trim().replace(/\s/g, "");
  if (!/^1\d{9,10}$/.test(actorPhone) || !/^1\d{9,10}$/.test(phone)) {
    return { ok: false, error: "请输入正确的手机号" };
  }
  const pwd = (input.password || "").trim();
  const key = `org-member|${actorPhone}|${phone}|${(input.name || "").trim()}|${pwd}`;
  if (reported.has(key)) return { ok: true };
  const r = await postPublic("org-member", {
    actor_phone: actorPhone,
    phone,
    name: (input.name || "").trim(),
    password: pwd && pwd !== "验证码登录" && pwd !== "手机验证码登录" ? pwd : "",
  });
  if (!r.ok) {
    return { ok: false, error: String(r.data.error || "运营端同步失败") };
  }
  reported.add(key);
  return { ok: true };
}

/** 把本机组织成员补登记到运营端租户列表 */
export function syncOrgMembersToOps(store: OrgStore, user: AuthUser | null | undefined) {
  const actorPhone = (user?.phone || user?.username || "").trim();
  if (!/^1\d{9,10}$/.test(actorPhone)) return;
  for (const m of store.members) {
    if (m.isPrimary) continue;
    const phone = memberPhoneOf(store, m.id);
    if (!/^1\d{9,10}$/.test(phone) || phone === actorPhone || phone === "—") continue;
    void reportCendOrgMember({
      actorPhone,
      phone,
      name: m.name,
      password: m.passwordPlain,
    });
  }
}

export async function reportCendLeaveOrg(input: { phone: string; joinCode?: string }): Promise<boolean> {
  const phone = input.phone.trim().replace(/\s/g, "");
  if (!/^1\d{9,10}$/.test(phone)) return false;
  const r = await postPublic("leave-org", { phone, join_code: (input.joinCode || "").trim() });
  return r.ok;
}

/** C 端账号写入运营端租户列表（幂等；企业认证后切为「企业」；加入企业不改类型） */
export function syncCendTenant(
  user: AuthUser | null | undefined,
  region?: PhoneRegionInfo | null,
  extra?: { password?: string },
) {
  if (!user) return;
  const phone = (user.phone || user.username || "").trim();
  if (!/^1\d{9,10}$/.test(phone)) return;
  const owner = isEnterpriseOwner(user);
  const company = (user.company || user.orgName || "").trim();
  const joinCode = owner ? ensureOrgJoinCode(loadOrgStore(user)).organization.joinCode || "" : "";
  const nick = (user.nickname || "").trim();
  const name =
    nick && !isPlaceholderNickname(user) && !/^1\d{9,10}$/.test(nick)
      ? nick
      : `用户${phone.slice(-4)}`;
  const fromAddr = (() => {
    const a = (user.address || "").trim();
    const province = a.match(/^(?:[\u4e00-\u9fa5]{2,}(?:省|自治区)|北京市|上海市|天津市|重庆市)/)?.[0] || "";
    const rest = a.slice(province.length);
    const city = rest.match(/^[\u4e00-\u9fa5]{1,12}(?:市|州|地区|盟)/)?.[0] || "";
    const rest2 = rest.slice(city.length);
    const district = rest2.match(/^[\u4e00-\u9fa5]{1,12}(?:区|县|市|旗)/)?.[0] || "";
    return { province, city, district };
  })();
  const province = (region?.province || fromAddr.province || "浙江省").trim();
  const city = (region?.city || fromAddr.city || (region?.province ? "" : "杭州市")).trim();
  const district = (fromAddr.district || (region?.province || fromAddr.province ? "" : "萧山区")).trim();
  const password = [extra?.password, user.loginPassword, loadPhonePassword(phone)]
    .map((s) => (s || "").trim())
    .find((s) => s && s !== "验证码登录" && s !== "手机验证码登录" && s.length >= 6) || "";
  if (password) rememberPhonePassword(phone, password);
  const key = `${phone}|${owner ? "ent" : "per"}|${name}|${company}|${joinCode}|${province}|${city}|${district}|${password}`;
  if (reported.has(key)) return;
  void reportCendAccount({
    phone,
    name,
    province,
    city,
    district,
    inviteCode: readInviteCode(),
    enterprise: owner,
    company,
    address: user.address,
    joinCode,
    password,
  }).then((ok) => {
    if (ok) {
      reported.add(key);
      void import("@/lib/points").then(({ loadPointsWallet }) => {
        void syncWalletWithOps(
          loadPointsWallet(identityScopeKey(user), { enterprise: owner }),
          phone,
        );
      });
    }
  });
}
