/* 算力 / 会员（演示）：本地持久化，对齐 XFUN 会员中心 · 会员卡 + 算力 */

export type MemberTierId = "free" | "personal" | "enterprise";
export type PointsSubTab = "membershipCard" | "pointsLedger";
export type MembershipShopMode = "buyMember" | "buyPoints";

export type LedgerKind = "earn" | "spend" | "gift" | "recharge" | "expire" | "transfer" | "return";

export interface PointsLedgerEntry {
  id: string;
  at: string;
  kind: LedgerKind;
  /** 正数入账，负数出账 */
  amount: number;
  title: string;
  detail?: string;
}

export interface PointsWallet {
  userId: string;
  /** 会员算力（会员发放，月底清） */
  benefitPoints: number;
  /** 赠送算力 */
  giftPoints: number;
  /** 充值算力（2 年有效） */
  rechargePoints: number;
  /** 政府补贴（单独记账，不自动扣） */
  subsidyPoints: number;
  /** 会员算力所属月份 YYYY-MM */
  benefitPeriod?: string;
  /** 赠送算力到期（新用户礼包 30 天） */
  giftExpiresAt?: string;
  rechargeExpiresAt?: string;
  tierId: MemberTierId;
  /** 当前开通的套餐 id，用于会员卡「当前版本」 */
  planId?: string;
  /** 会员到期时间文案 */
  membershipExpiresAt: string;
  lastCheckInDate?: string;
  ledger: PointsLedgerEntry[];
}

export interface MemberPlanPerk {
  text: string;
  included: boolean;
}

export interface MemberPlan {
  id: string;
  tierId: MemberTierId;
  name: string;
  description?: string;
  priceLabel: string;
  /** 运营端价格（元），开通页实付金额用这个 */
  priceYuan?: number;
  periodLabel: string;
  originalPriceLabel?: string;
  priceNote?: string;
  pointsBadge?: string;
  pointsBadgeNote?: string;
  /** 开通后到账会员算力 */
  grantPoints: number;
  /** 开通后赠送算力 */
  grantGift: number;
  /** 有效天数；0 表示企业演示长期 */
  days: number;
  highlight?: boolean;
  /** 购买会员 Tab 展示；不设则不出现在自助购买 */
  shopGroup?: "primary";
  /** 运营端套餐类型 */
  kind?: "personal" | "enterprise" | "group";
  perks: MemberPlanPerk[];
}

export interface PointPack {
  id: string;
  name: string;
  tag?: string;
  kind?: "personal" | "enterprise" | "group" | "subsidy";
  priceLabel: string;
  priceYuan?: number;
  points: number;
  validNote: string;
  validDays?: number;
}

const STORE_KEY = "mofun.points.v2";
const LEDGER_CAP = 80;
const STORE_SOFT_LIMIT = 1_200_000;

let shopPlans: MemberPlan[] = [];
let shopPacks: PointPack[] = [];
let registerGift = { points: 0, validDays: 30, name: "新用户体验礼包" };

export function registerGiftConfig() {
  return registerGift;
}

export function allMemberPlans() {
  return shopPlans;
}

export const PERSONAL_PLAN_NAMES = ["免费用户", "标准会员", "旗舰会员"] as const;

function rankPersonalPlan(p: MemberPlan) {
  if (p.tierId === "free" || p.name.includes("免费")) return 0;
  if (p.name.includes("标准")) return 1;
  if (p.name.includes("旗舰")) return 2;
  return 10 + (p.priceYuan || 0);
}

/** 购买会员只展示运营端「个人月卡」三档，不含企业套餐、不含算力包。 */
export function personalShopPlans(plans: MemberPlan[] = allMemberPlans()) {
  const personal = plans.filter((p) => (p.kind || "personal") === "personal");
  const byName = new Map(personal.map((p) => [p.name, p]));
  const ordered = PERSONAL_PLAN_NAMES.map((name) => byName.get(name)).filter((p): p is MemberPlan => Boolean(p));
  if (ordered.length) return ordered;
  return [...personal].sort((a, b) => rankPersonalPlan(a) - rankPersonalPlan(b)).slice(0, 3);
}

export function orgShopPlans(plans: MemberPlan[] = allMemberPlans(), kinds: Array<"enterprise" | "group"> = ["enterprise"]) {
  return plans.filter((p) => kinds.includes((p.kind || "personal") as "enterprise" | "group"));
}

export function shopPacksForKind(packs: PointPack[] = allPointPacks(), kind: "personal" | "enterprise" | "group") {
  if (kind === "personal") return packs.filter((p) => !p.kind || p.kind === "personal");
  if (kind === "group") return packs.filter((p) => p.kind === "group");
  return packs.filter((p) => p.kind === "enterprise" || p.kind === "subsidy");
}

export function allPointPacks() {
  return shopPacks;
}

function yuanLabel(n: number) {
  const x = Number(n) || 0;
  return `¥${x}`;
}

function dailyPointsFromNote(note: string) {
  const m = String(note || "").match(/每日\s*(\d+)\s*算力/);
  return m ? Number(m[1]) : 0;
}

function periodLabelFromOps(p: { kind: string; days: number }) {
  if (p.kind === "enterprise" || p.kind === "group" || p.days === 365) return "/年";
  if (p.days === 30) return "/月";
  return "";
}

function shopPointsCopy(s: string) {
  return String(s || "")
    .replaceAll("会员积分", "会员算力")
    .replaceAll("年积分", "年算力")
    .replaceAll("周期积分", "周期算力")
    .replaceAll("充值积分", "充值算力")
    .replaceAll("赠送积分", "赠送算力");
}

function perksFromOps(p: {
  kind: string;
  price_yuan: number;
  seats: number;
  period_points: number;
  gift_points: number;
  days: number;
  note: string;
}): MemberPlanPerk[] {
  if (p.kind === "enterprise") {
    return [
      { text: `席位 ${p.seats}`, included: true },
      { text: p.period_points ? `年算力 ${p.period_points}` : "算力按充值", included: true },
      { text: "仅对公开通，成员不可购买企业包", included: true },
      { text: "企业共享池，超成员额度拦截", included: true },
    ];
  }
  const free = !(p.price_yuan > 0) && !(p.period_points > 0);
  const perks: MemberPlanPerk[] = [];
  const seen = new Set<string>();
  const push = (text: string, included = true) => {
    const t = shopPointsCopy(text).trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    perks.push({ text: t, included });
  };
  for (const part of String(p.note || "").split(/[；;]/)) push(part);

  const login = String(p.note || "").match(/每日登录\s*(\d+)/);
  if (login) push(`每日登录奖励 ${login[1]} 算力（当天有效）`);
  if (p.gift_points) {
    push(free ? `新用户赠送 ${p.gift_points} 算力（30 天有效）` : `开通赠送 ${p.gift_points} 算力`);
  }
  if (p.period_points) {
    push(p.days === 30 ? `每月固定发放 ${p.period_points} 算力` : `周期算力 ${p.period_points}`);
  }
  if (p.days === 30) push("会员算力月底清零");
  push("基础模型可用");
  if (![...seen].some((t) => t.includes("会员专享"))) {
    perks.push({ text: "会员专享模型可用", included: !free });
  }
  return perks;
}

function looksLikePointPackPlan(p: MemberPlan) {
  if (/算力包/.test(p.name)) return true;
  return p.grantPoints >= 500 && p.priceYuan >= 30 && (p.days === 30 || /月/.test(p.periodLabel || ""));
}

export function hydrateEconomyShop(cat: {
  plans?: {
    id: string;
    kind: string;
    name: string;
    price_yuan: number;
    seats: number;
    period_points: number;
    gift_points: number;
    days: number;
    note: string;
  }[];
  packs?: { id: string; kind: string; name: string; price_yuan: number; points: number; valid_days: number; note: string }[];
  campaigns?: {
    trigger: string;
    name?: string;
    points: number;
    valid_days: number;
    owner?: string;
    tenant_kinds?: string[];
  }[];
}) {
  const giftHit = (cat.campaigns || []).find(
    (c) => c.trigger === "register" && (c.owner || "self") === "self" && (c.tenant_kinds || ["personal"]).includes("personal") && c.points > 0,
  );
  registerGift = giftHit
    ? { points: giftHit.points, validDays: giftHit.valid_days > 0 ? giftHit.valid_days : 30, name: giftHit.name || "新用户体验礼包" }
    : { points: 0, validDays: 30, name: "新用户体验礼包" };
  if (cat.plans?.length) {
    const mapped = cat.plans.map((p) => {
      const salesOnly = p.kind === "enterprise" || p.kind === "group";
      const daily = dailyPointsFromNote(p.note);
      const pointsBadge = p.period_points
        ? `${p.period_points}算力`
        : p.gift_points
          ? `${p.gift_points}算力`
          : daily
            ? `${daily}算力`
            : undefined;
      return {
        id: p.id,
        kind: (p.kind as MemberPlan["kind"]) || "personal",
        tierId: salesOnly ? "enterprise" : p.price_yuan <= 0 && p.period_points <= 0 ? "free" : "personal",
        name: p.name,
        description: salesOnly ? shopPointsCopy(p.note) : undefined,
        priceLabel: yuanLabel(p.price_yuan),
        priceYuan: Number(p.price_yuan) || 0,
        periodLabel: periodLabelFromOps(p),
        pointsBadge,
        pointsBadgeNote: salesOnly
          ? `${p.seats} 席位 · 对公开通`
          : p.period_points && p.days === 30
            ? "会员算力月底清零"
            : daily
              ? "每日登录领取，当天有效"
              : "",
        grantPoints: p.period_points,
        grantGift: p.gift_points,
        days: p.days,
        highlight: p.kind === "personal" && p.name.includes("标准"),
        shopGroup: salesOnly ? undefined : "primary",
        perks: perksFromOps(p),
      } satisfies MemberPlan;
    });
    const personalFromOps = mapped.filter((p) => (p.kind || "personal") === "personal");
    const others = mapped.filter((p) => p.kind === "enterprise" || p.kind === "group");
    const personal = PERSONAL_PLAN_NAMES.map((name) => {
      const fromOps = personalFromOps.find((p) => p.name === name);
      const fallback = MEMBER_PLANS.find((p) => p.name === name);
      if (!fromOps) return fallback;
      if (looksLikePointPackPlan(fromOps)) return fallback ? { ...fallback, id: fromOps.id } : fromOps;
      return fromOps;
    }).filter((p): p is MemberPlan => Boolean(p));
    shopPlans = personal.length ? [...personal, ...others] : mapped;
  }
  if (cat.packs?.length) {
    shopPacks = cat.packs.map((p) => ({
      id: p.id,
      name: p.name,
      kind: (p.kind as PointPack["kind"]) || "personal",
      tag: p.kind === "subsidy" ? "政府补贴" : p.kind === "enterprise" ? "企业" : p.kind === "group" ? "集团" : undefined,
      priceLabel: yuanLabel(p.price_yuan),
      priceYuan: Number(p.price_yuan) || 0,
      points: p.points,
      validNote: shopPointsCopy(p.note) || "充值算力 2 年有效",
      validDays: p.valid_days > 0 ? p.valid_days : 730,
    }));
  }
}

export const MEMBER_PLANS: MemberPlan[] = [
  {
    id: "free",
    kind: "personal",
    tierId: "free",
    name: "免费用户",
    priceLabel: "¥0",
    priceYuan: 0,
    periodLabel: "",
    pointsBadge: "10算力",
    pointsBadgeNote: "每日登录领取，当天有效",
    grantPoints: 0,
    grantGift: 0,
    days: 0,
    shopGroup: "primary",
    perks: [
      { text: "每日 10 算力，当日有效", included: true },
      { text: "100MB 空间", included: true },
      { text: "可用算力换空间", included: true },
      { text: "基础模型可用", included: true },
      { text: "会员专享模型可用", included: false },
    ],
  },
  {
    id: "personal-month",
    kind: "personal",
    tierId: "personal",
    name: "标准会员",
    priceLabel: "¥19.9",
    priceYuan: 19.9,
    periodLabel: "",
    pointsBadge: "20算力",
    pointsBadgeNote: "每日登录领取，当天有效",
    grantPoints: 0,
    grantGift: 0,
    days: 0,
    highlight: true,
    shopGroup: "primary",
    perks: [
      { text: "每日 20 算力，当日有效", included: true },
      { text: "1G 空间", included: true },
      { text: "可批量生成资产图", included: true },
      { text: "可批量生成视频分镜", included: true },
      { text: "基础模型可用", included: true },
      { text: "会员专享模型可用", included: true },
    ],
  },
  {
    id: "personal-flagship",
    kind: "personal",
    tierId: "personal",
    name: "旗舰会员",
    priceLabel: "¥69",
    priceYuan: 69,
    periodLabel: "",
    pointsBadge: "20算力",
    pointsBadgeNote: "每日登录领取，当天有效",
    grantPoints: 0,
    grantGift: 0,
    days: 0,
    shopGroup: "primary",
    perks: [
      { text: "每日 20 算力，当日有效", included: true },
      { text: "5G 空间", included: true },
      { text: "可批量生成资产图", included: true },
      { text: "可批量生成视频分镜", included: true },
      { text: "基础模型可用", included: true },
      { text: "会员专享模型可用", included: true },
    ],
  },
];

export const POINT_PACKS: PointPack[] = [
  {
    id: "pack-basic",
    name: "基础算力包",
    tag: "入门之选",
    kind: "personal",
    priceLabel: "¥39.9",
    priceYuan: 39.9,
    points: 1600,
    validNote: "充值算力 2 年有效",
    validDays: 730,
  },
  {
    id: "pack-plus",
    name: "进阶算力包",
    tag: "性价比之选",
    kind: "personal",
    priceLabel: "¥99.9",
    priceYuan: 99.9,
    points: 4000,
    validNote: "充值算力 2 年有效",
    validDays: 730,
  },
  {
    id: "pack-pro",
    name: "高级算力包",
    tag: "超值之选",
    kind: "personal",
    priceLabel: "¥299",
    priceYuan: 299,
    points: 12000,
    validNote: "充值算力 2 年有效",
    validDays: 730,
  },
];

shopPlans = MEMBER_PLANS;
shopPacks = POINT_PACKS;

function nowLabel() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function addDaysLabel(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 23:59:59`;
}

function endOfMonthLabel() {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${last.getFullYear()}-${p(last.getMonth() + 1)}-${p(last.getDate())} 23:59:59`;
}

function laterLabel(a?: string, b?: string) {
  const x = (a || "").trim();
  const y = (b || "").trim();
  if (!x) return y;
  if (!y) return x;
  return x >= y ? x : y;
}

/** 三种算力各自的到期时间 */
export function pointPoolExpiresAt(wallet: PointsWallet) {
  return {
    gift: wallet.giftExpiresAt || addDaysLabel(30),
    benefit: endOfMonthLabel(),
    recharge: wallet.rechargeExpiresAt || addDaysLabel(730),
  };
}

function expireMs(label: string) {
  const t = Date.parse((label || "").replace(/-/g, "/"));
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/** 当前还有余额的算力池里，最早到期的时间 */
export function earliestPoolExpiresAt(wallet: PointsWallet): string {
  const pools = pointPoolExpiresAt(wallet);
  const rows: string[] = [];
  if (wallet.giftPoints > 0) rows.push(pools.gift);
  if (wallet.benefitPoints > 0) rows.push(pools.benefit);
  if ((wallet.rechargePoints || 0) > 0) rows.push(pools.recharge);
  if (!rows.length) return "";
  return [...rows].sort((a, b) => expireMs(a) - expireMs(b))[0] || "";
}

export function formatPoints(n: number): string {
  return String(Math.max(0, Math.floor(n)));
}

export function totalPoints(w: PointsWallet): number {
  return Math.max(0, w.giftPoints) + Math.max(0, w.benefitPoints) + Math.max(0, w.rechargePoints || 0);
}

/** 流水中的累计消耗算力（出账绝对值之和） */
export function usedPointsFromWallet(w: PointsWallet): number {
  return w.ledger.reduce((sum, e) => {
    if (e.kind === "transfer" || e.kind === "return") return sum;
    if (e.kind === "spend" || e.amount < 0) return sum + Math.abs(e.amount);
    return sum;
  }, 0);
}

/** 演示成员账号的预设已用算力（便于成员管理页展示） */
const DEMO_MEMBER_USED_POINTS: Record<string, number> = {
  qy_demo_anji_ops: 1860,
  qy_demo_town_chen: 420,
  qy_demo_store_zhou: 95,
  qy_demo_guide_mei: 1280,
};

function seedDemoMemberUsage(wallet: PointsWallet): PointsWallet {
  const target = DEMO_MEMBER_USED_POINTS[wallet.userId];
  if (!target || usedPointsFromWallet(wallet) > 0) return wallet;

  let benefit = wallet.benefitPoints;
  let gift = wallet.giftPoints;
  let remain = target;
  const fromGift = Math.min(gift, remain);
  gift -= fromGift;
  remain -= fromGift;
  benefit = Math.max(0, benefit - remain);

  const next: PointsWallet = {
    ...wallet,
    benefitPoints: benefit,
    giftPoints: gift,
    ledger: [
      {
        id: `demo-spend-${wallet.userId}`,
        at: nowLabel(),
        kind: "spend",
        amount: -target,
        title: "历史生成消耗（演示）",
        detail: "成员账号演示数据",
      },
      ...wallet.ledger,
    ],
  };
  return savePointsWallet(next);
}

/** 读取指定用户的累计已用算力 */
export function getUsedPointsForUser(userId: string, opts?: { enterprise?: boolean }): number {
  if (!userId) return 0;
  let wallet = loadPointsWallet(userId, opts);
  wallet = seedDemoMemberUsage(wallet);
  return usedPointsFromWallet(wallet);
}

export function currentPointsPeriod(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthlySpendFromWallet(wallet: PointsWallet): number {
  const period = currentPointsPeriod();
  return (wallet.ledger || []).reduce((sum, e) => {
    if (e.kind !== "spend") return sum;
    if (!String(e.at || "").startsWith(period)) return sum;
    return sum + Math.abs(e.amount);
  }, 0);
}

const ENTERPRISE_POOL_SEED_TITLE = "企业基础年算力";

function emptyPointsWallet(userId: string): PointsWallet {
  return {
    userId,
    benefitPoints: 0,
    giftPoints: 0,
    rechargePoints: 0,
    subsidyPoints: 0,
    benefitPeriod: yearMonth(),
    rechargeExpiresAt: addDaysLabel(730),
    tierId: "free",
    planId: "free",
    membershipExpiresAt: addDaysLabel(3650),
    ledger: [],
  };
}

/** 下级误种的企业年算力 5 万：额度只应来自上一级划拨 */
function stripEnterprisePoolSeed(wallet: PointsWallet): PointsWallet {
  const ledger = Array.isArray(wallet.ledger) ? wallet.ledger : [];
  const seed = ledger.find((e) => e.title === ENTERPRISE_POOL_SEED_TITLE);
  if (!seed) return wallet;
  const seedAmt = Math.max(0, Math.floor(Number(seed.amount) || 0));
  const next: PointsWallet = {
    ...wallet,
    benefitPoints: Math.max(0, Math.floor(Number(wallet.benefitPoints || 0)) - seedAmt),
    ledger: ledger.filter((e) => e.title !== ENTERPRISE_POOL_SEED_TITLE),
  };
  return savePointsWallet(next);
}

/** 已有钱包才读，不凭空种 50 / 企业 5 万 */
export function peekPointsWallet(userId: string): PointsWallet | null {
  if (!userId) return null;
  const raw = readStore()[userId];
  if (!raw) return null;
  return migrateWallet(raw);
}

/** 组织下级钱包：没有就建空账，绝不种企业 5 万 */
export function loadOrgMemberWallet(userId: string): PointsWallet {
  if (!userId) return emptyPointsWallet("");
  const map = readStore();
  if (map[userId]) {
    let w = migrateWallet(map[userId]);
    w = applyBenefitMonthReset(w);
    w = applyGiftExpiry(w);
    w = applyRechargeExpiry(w);
    return stripEnterprisePoolSeed(w);
  }
  const w = emptyPointsWallet(userId);
  map[userId] = w;
  writeStore(map);
  return w;
}

export function quotaFromWallet(wallet: PointsWallet | null | undefined): {
  limit: number;
  used: number;
  remain: number;
} {
  if (!wallet) return { limit: 0, used: 0, remain: 0 };
  const used = monthlySpendFromWallet(wallet);
  const remain = totalPoints(wallet);
  return { limit: used + remain, used, remain };
}

/** 算力展示：自己可种钱包；其他成员只读已有数据（演示成员除外） */
export function walletQuotaView(
  userId: string,
  opts?: { seedIfMissing?: boolean; enterprise?: boolean },
): { limit: number; used: number; remain: number } {
  if (!userId) return { limit: 0, used: 0, remain: 0 };
  if (opts?.seedIfMissing) {
    return quotaFromWallet(loadPointsWallet(userId, { enterprise: opts.enterprise }));
  }
  const peeked = peekPointsWallet(userId);
  if (peeked) return quotaFromWallet(peeked);
  if (DEMO_MEMBER_USED_POINTS[userId]) {
    return quotaFromWallet(loadPointsWallet(userId, { enterprise: true }));
  }
  return { limit: 0, used: 0, remain: 0 };
}

/** 本月已用（仅统计生成消耗，下发划转不计入） */
export function getMonthlyUsedPointsForUser(userId: string, opts?: { enterprise?: boolean }): number {
  return walletQuotaView(userId, { seedIfMissing: true, enterprise: opts?.enterprise }).used;
}

export function tierLabel(tier: MemberTierId): string {
  if (tier === "enterprise") return "企业版会员";
  if (tier === "personal") return "个人版会员";
  return "免费体验版";
}

/** 弹层 / 账户页展示的会员类型：套餐名优先，否则按档位 */
export function memberTypeLabel(wallet: PointsWallet | null | undefined): string {
  if (!wallet) return "非会员";
  const plans = allMemberPlans();
  const plan = plans.find((p) => p.id === resolveCurrentPlanId(wallet, plans));
  const name = (plan?.name || "").trim();
  if (name) return name;
  return tierLabel(wallet.tierId);
}

/** 已开通且未过期的付费会员（不含免费体验） */
export function isPaidMember(wallet: PointsWallet | null | undefined): boolean {
  if (!wallet || wallet.tierId === "free") return false;
  const exp = (wallet.membershipExpiresAt || "").trim();
  if (!exp) return true;
  const t = Date.parse(exp.replace(/-/g, "/"));
  return !Number.isFinite(t) || t > Date.now();
}

export function isFreePlan(plan: MemberPlan) {
  return plan.tierId === "free";
}

export function walletHasEnterpriseMembership(wallet: PointsWallet | null | undefined): boolean {
  if (!wallet) return false;
  const plans = allMemberPlans();
  const plan = plans.find((p) => p.id === resolveCurrentPlanId(wallet, plans));
  return !!plan && plan.tierId === "enterprise" && !isFreePlan(plan);
}

export function resolveCurrentPlanId(wallet: PointsWallet, plans: MemberPlan[] = allMemberPlans()): string {
  if (wallet.planId && plans.some((p) => p.id === wallet.planId)) return wallet.planId;
  for (const row of wallet.ledger || []) {
    if (!row.title.startsWith("开通")) continue;
    const hit = plans.find((p) => p.name === row.title.slice(2));
    if (hit) return hit.id;
  }
  if (wallet.tierId === "free") return plans.find((p) => p.tierId === "free")?.id || wallet.planId || "";
  return wallet.planId || "";
}

export function isCurrentPlan(wallet: PointsWallet, plan: MemberPlan, plans: MemberPlan[] = allMemberPlans()) {
  const currentId = resolveCurrentPlanId(wallet, plans);
  return currentId ? currentId === plan.id : false;
}

type StoreMap = Record<string, PointsWallet>;

function compactWallet(wallet: PointsWallet): PointsWallet {
  const ledger = Array.isArray(wallet.ledger) ? wallet.ledger.slice(0, LEDGER_CAP) : [];
  return { ...wallet, ledger };
}

function compactStore(map: StoreMap, ledgerCap = LEDGER_CAP, maxUsers = 24): StoreMap {
  const next: StoreMap = {};
  const entries = Object.entries(map).filter(([, w]) => w && typeof w === "object");
  entries.sort((a, b) => String(b[1].userId || "").localeCompare(String(a[1].userId || "")));
  for (const [key, wallet] of entries.slice(0, maxUsers)) {
    next[key] = { ...compactWallet(wallet), ledger: (wallet.ledger || []).slice(0, ledgerCap) };
  }
  return next;
}

function evictHeavyCaches() {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || key === STORE_KEY) continue;
    if (
      key.startsWith("mofun-case-imgs") ||
      key.startsWith("mofun.video") ||
      key.startsWith("mofun.studio") ||
      key.includes("case-img")
    ) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

function readStore(): StoreMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const map = JSON.parse(raw) as StoreMap;
    if (raw.length > STORE_SOFT_LIMIT) return compactStore(map, 40, 8);
    return compactStore(map);
  } catch {
    return {};
  }
}

function writeStore(map: StoreMap) {
  if (typeof window === "undefined") return;
  const attempts: StoreMap[] = [compactStore(map), compactStore(map, 20, 6), compactStore(map, 8, 2), {}];
  for (let i = 0; i < attempts.length; i++) {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(attempts[i]));
      return;
    } catch {
      if (i === 0) evictHeavyCaches();
    }
  }
}

function yearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function seedWallet(userId: string, preferEnterprise?: boolean): PointsWallet {
  const tier: MemberTierId = preferEnterprise ? "enterprise" : "free";
  const giftCfg = preferEnterprise ? { points: 0, validDays: 30, name: "" } : registerGiftConfig();
  const gift = giftCfg.points;
  const benefit = preferEnterprise ? 50000 : 0;
  const entry: PointsLedgerEntry = {
    id: `seed-${Date.now()}`,
    at: nowLabel(),
    kind: preferEnterprise ? "recharge" : "gift",
    amount: preferEnterprise ? benefit : gift,
    title: preferEnterprise ? "企业基础年算力" : giftCfg.name || "新用户体验礼包",
    detail: preferEnterprise ? "企业共享池，不透支" : gift ? `注册即赠 ${gift} 算力` : "注册礼未启用",
  };
  return {
    userId,
    benefitPoints: benefit,
    giftPoints: gift,
    rechargePoints: 0,
    subsidyPoints: 0,
    benefitPeriod: yearMonth(),
    giftExpiresAt: gift ? addDaysLabel(giftCfg.validDays) : undefined,
    rechargeExpiresAt: addDaysLabel(730),
    tierId: tier,
    planId: preferEnterprise ? undefined : "free",
    membershipExpiresAt: preferEnterprise ? addDaysLabel(365) : addDaysLabel(3650),
    ledger: preferEnterprise || gift ? [entry] : [],
  };
}

function migrateWallet(raw: PointsWallet): PointsWallet {
  const recharge = Number(raw.rechargePoints || 0);
  let benefit = Number(raw.benefitPoints || 0);
  if (benefit >= 999_999) benefit = 50000;
  return {
    ...raw,
    benefitPoints: benefit,
    giftPoints: Number(raw.giftPoints || 0),
    rechargePoints: recharge,
    subsidyPoints: Number(raw.subsidyPoints || 0),
    benefitPeriod: raw.benefitPeriod || yearMonth(),
    giftExpiresAt: raw.giftExpiresAt || (Number(raw.giftPoints || 0) > 0 ? addDaysLabel(30) : undefined),
    rechargeExpiresAt: raw.rechargeExpiresAt || addDaysLabel(730),
  };
}

function applyBenefitMonthReset(wallet: PointsWallet): PointsWallet {
  const ym = yearMonth();
  if (wallet.benefitPeriod === ym) return wallet;
  const expired = Math.max(0, wallet.benefitPoints);
  const next: PointsWallet = { ...wallet, benefitPoints: 0, benefitPeriod: ym };
  if (expired <= 0) return savePointsWallet(next);
  return pushLedger(next, {
    kind: "expire",
    amount: -expired,
    title: "会员算力清零",
    detail: "会员算力月底清零",
  });
}

function applyGiftExpiry(wallet: PointsWallet): PointsWallet {
  if (!wallet.giftExpiresAt || !wallet.giftPoints) return wallet;
  const exp = new Date(wallet.giftExpiresAt.replace(" ", "T")).getTime();
  if (!Number.isFinite(exp) || exp > Date.now()) return wallet;
  const expired = wallet.giftPoints;
  const next: PointsWallet = { ...wallet, giftPoints: 0 };
  return pushLedger(next, {
    kind: "expire",
    amount: -expired,
    title: "赠送算力过期",
    detail: "赠送算力 30 天有效",
  });
}

function applyRechargeExpiry(wallet: PointsWallet): PointsWallet {
  if (!wallet.rechargeExpiresAt || !wallet.rechargePoints) return wallet;
  const exp = new Date(wallet.rechargeExpiresAt.replace(" ", "T")).getTime();
  if (!Number.isFinite(exp) || exp > Date.now()) return wallet;
  const expired = wallet.rechargePoints;
  const next: PointsWallet = { ...wallet, rechargePoints: 0 };
  return pushLedger(next, {
    kind: "expire",
    amount: -expired,
    title: "充值算力过期",
    detail: "充值算力 2 年有效",
  });
}

export function loadPointsWallet(
  userId: string,
  opts?: { enterprise?: boolean; fallbackUserId?: string }
): PointsWallet {
  if (!userId) return seedWallet("guest", opts?.enterprise);
  const map = readStore();
  if (map[userId]) {
    let w = migrateWallet(map[userId]);
    w = applyBenefitMonthReset(w);
    w = applyGiftExpiry(w);
    w = applyRechargeExpiry(w);
    return w;
  }
  if (opts?.fallbackUserId && opts.fallbackUserId !== userId && map[opts.fallbackUserId]) {
    const copied = { ...migrateWallet(map[opts.fallbackUserId]), userId };
    map[userId] = copied;
    writeStore(map);
    return copied;
  }
  const w = seedWallet(userId, opts?.enterprise);
  map[userId] = w;
  writeStore(map);
  return w;
}

export function savePointsWallet(wallet: PointsWallet): PointsWallet {
  const map = readStore();
  map[wallet.userId] = wallet;
  writeStore(map);
  if (typeof window !== "undefined") {
    void import("./opsRegister")
      .then((m) => m.scheduleSyncCendWallet(wallet))
      .catch(() => undefined);
  }
  return wallet;
}

function pushLedger(wallet: PointsWallet, entry: Omit<PointsLedgerEntry, "id" | "at">): PointsWallet {
  const next: PointsWallet = {
    ...wallet,
    ledger: [
      { id: `le-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: nowLabel(), ...entry },
      ...wallet.ledger,
    ].slice(0, LEDGER_CAP),
  };
  return savePointsWallet(next);
}

/** 将算力同步到账户弹层展示的算力字段 */
export function pointsToAuthPatch(wallet: PointsWallet): {
  computeBenefit: string;
  computeGift: string;
  computeRecharge: string;
  expiresAt: string;
} {
  return {
    computeBenefit: formatPoints(wallet.benefitPoints),
    computeGift: formatPoints(wallet.giftPoints),
    computeRecharge: formatPoints(wallet.rechargePoints || 0),
    expiresAt: wallet.membershipExpiresAt,
  };
}

export function purchasePlan(
  wallet: PointsWallet,
  planId: string,
  opts?: { enterprise?: boolean; enterpriseAdmin?: boolean; allowSelfRecharge?: boolean },
): { ok: boolean; message: string; wallet: PointsWallet } {
  if (opts?.allowSelfRecharge === false) {
    return { ok: false, message: "当前账号禁止自行购买或充值，请联系上一级发放额度", wallet };
  }
  const plan = allMemberPlans().find((p) => p.id === planId) || MEMBER_PLANS.find((p) => p.id === planId);
  if (!plan) return { ok: false, message: "套餐不存在", wallet };
  if (isFreePlan(plan)) {
    return { ok: false, message: "当前已是免费体验版", wallet };
  }
  if (resolveCurrentPlanId(wallet) === plan.id) {
    return { ok: false, message: "当前已是该版本", wallet };
  }
  if (plan.tierId === "enterprise" || plan.kind === "group" || plan.kind === "enterprise") {
    return { ok: false, message: "集团 / 企业会员请联系客服开通", wallet };
  }

  const absorbed = wallet.tierId !== "enterprise" && plan.tierId === "enterprise";
  let next: PointsWallet = {
    ...wallet,
    tierId: plan.tierId,
    planId: plan.id,
    membershipExpiresAt: plan.days > 0 ? addDaysLabel(plan.days) : wallet.membershipExpiresAt,
    benefitPoints: wallet.benefitPoints + plan.grantPoints,
    giftPoints: wallet.giftPoints + plan.grantGift,
    giftExpiresAt: plan.grantGift
      ? laterLabel(wallet.giftExpiresAt, addDaysLabel(30))
      : wallet.giftExpiresAt,
    benefitPeriod: yearMonth(),
  };
  next = pushLedger(next, {
    kind: "recharge",
    amount: plan.grantPoints + plan.grantGift,
    title: `开通${plan.name}`,
    detail: absorbed
      ? `个人余额已转入企业池 · 会员算力 +${plan.grantPoints} · 赠送 +${plan.grantGift}`
      : `会员算力 +${plan.grantPoints} · 赠送 +${plan.grantGift}`,
  });
  return { ok: true, message: `已开通 ${plan.name}（演示）`, wallet: next };
}

export function purchasePointPack(
  wallet: PointsWallet,
  packId: string,
  opts?: { enterprise?: boolean; enterpriseAdmin?: boolean; allowSelfRecharge?: boolean },
): { ok: boolean; message: string; wallet: PointsWallet } {
  if (opts?.allowSelfRecharge === false) {
    return { ok: false, message: "当前账号禁止自行购买或充值，请联系上一级发放额度", wallet };
  }
  const pack = allPointPacks().find((p) => p.id === packId) || POINT_PACKS.find((p) => p.id === packId);
  if (!pack) return { ok: false, message: "算力包不存在", wallet };
  if (pack.kind === "enterprise") {
    if (!opts?.enterprise) return { ok: false, message: "企业算力包仅对公开通", wallet };
    if (opts.enterpriseAdmin === false) return { ok: false, message: "成员不能购买企业包", wallet };
  }
  if (pack.kind === "subsidy") {
    let subsidy: PointsWallet = { ...wallet, subsidyPoints: (wallet.subsidyPoints || 0) + pack.points };
    subsidy = pushLedger(subsidy, {
      kind: "gift",
      amount: pack.points,
      title: `入账${pack.name}`,
      detail: "政府补贴单独记账，不自动抵扣",
    });
    return { ok: true, message: `补贴已入账 +${pack.points}`, wallet: subsidy };
  }

  let next: PointsWallet = {
    ...wallet,
    rechargePoints: (wallet.rechargePoints || 0) + pack.points,
    rechargeExpiresAt: addDaysLabel(pack.validDays && pack.validDays > 0 ? pack.validDays : 730),
  };
  next = pushLedger(next, {
    kind: "recharge",
    amount: pack.points,
    title: `购买${pack.name}`,
    detail: pack.validNote || "充值算力 2 年有效",
  });
  return { ok: true, message: `已购买 ${pack.name}，充值 +${pack.points}（2 年有效）`, wallet: next };
}

export function absorbPersonalIntoEnterprise(wallet: PointsWallet): PointsWallet {
  if (wallet.tierId === "enterprise") return wallet;
  const total = totalPoints(wallet);
  return pushLedger(
    { ...wallet, tierId: "enterprise" },
    {
      kind: "recharge",
      amount: 0,
      title: "个人升级企业",
      detail: `个人余额 ${total} 已转入企业共享池（赠送/会员/充值不变）`,
    },
  );
}

/** 预扣：赠送 → 会员 → 充值。不透支。补贴不自动扣。 */
export function spendPoints(
  wallet: PointsWallet,
  amount: number,
  title: string,
  detail?: string,
): { ok: boolean; message: string; wallet: PointsWallet; dispatched?: boolean } {
  const cost = Math.max(0, Math.floor(amount));
  if (cost <= 0) return { ok: true, message: "本次不计费", wallet };
  if (totalPoints(wallet) < cost) return { ok: false, message: `算力不足（需要 ${cost}，不可透支）`, wallet };
  let remain = cost;
  let gift = wallet.giftPoints;
  let benefit = wallet.benefitPoints;
  let recharge = wallet.rechargePoints || 0;
  const fromGift = Math.min(gift, remain);
  gift -= fromGift;
  remain -= fromGift;
  const fromBenefit = Math.min(benefit, remain);
  benefit -= fromBenefit;
  remain -= fromBenefit;
  recharge -= remain;
  const next = pushLedger(
    { ...wallet, giftPoints: gift, benefitPoints: benefit, rechargePoints: recharge },
    { kind: "spend", amount: -cost, title, detail: detail || "扣赠送→会员→充值" },
  );
  return { ok: true, message: `已预扣 ${cost} 算力`, wallet: next };
}

function formatBucketDelta(gift: number, benefit: number, recharge: number) {
  return `赠送 ${gift >= 0 ? "+" : ""}${gift}，会员 ${benefit >= 0 ? "+" : ""}${benefit}，充值 ${recharge >= 0 ? "+" : ""}${recharge}`;
}

function takeFromBuckets(wallet: PointsWallet, amount: number) {
  let remain = Math.max(0, Math.floor(amount));
  let gift = wallet.giftPoints;
  let benefit = wallet.benefitPoints;
  let recharge = wallet.rechargePoints || 0;
  const fromGift = Math.min(gift, remain);
  gift -= fromGift;
  remain -= fromGift;
  const fromBenefit = Math.min(benefit, remain);
  benefit -= fromBenefit;
  remain -= fromBenefit;
  const fromRecharge = remain;
  recharge -= fromRecharge;
  return {
    giftPoints: gift,
    benefitPoints: benefit,
    rechargePoints: recharge,
    fromGift,
    fromBenefit,
    fromRecharge,
  };
}

/** 上级下发积分：从发放人钱包划到下级，不计入本月已用 */
export function transferWalletPoints(
  fromUserId: string,
  toUserId: string,
  amount: number,
  opts?: { fromName?: string; toName?: string },
): { ok: boolean; message: string } {
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  if (amt <= 0) return { ok: false, message: "发放数量须大于 0" };
  if (!fromUserId || !toUserId || fromUserId === toUserId) return { ok: false, message: "不能发给自己" };
  const from = loadPointsWallet(fromUserId, { enterprise: true });
  if (totalPoints(from) < amt) {
    return { ok: false, message: `算力不足（还可发放 ${totalPoints(from)}）` };
  }
  const taken = takeFromBuckets(from, amt);
  const toName = opts?.toName || "下级";
  const fromName = opts?.fromName || "上级";
  pushLedger(
    { ...from, giftPoints: taken.giftPoints, benefitPoints: taken.benefitPoints, rechargePoints: taken.rechargePoints },
    {
      kind: "transfer",
      amount: -amt,
      title: `下发额度给「${toName}」`,
      detail: `扣款 ${formatBucketDelta(-taken.fromGift, -taken.fromBenefit, -taken.fromRecharge)}`,
    },
  );
  const to = loadOrgMemberWallet(toUserId);
  pushLedger(
    { ...to, rechargePoints: (to.rechargePoints || 0) + amt },
    {
      kind: "transfer",
      amount: amt,
      title: `收到「${fromName}」下发额度`,
      detail: `充值 +${amt}，可用于生成`,
    },
  );
  return { ok: true, message: `已下发 ${amt}` };
}

/** 下级剩余积分整桶回流到发放账户，不计入本月已用 */
export function returnWalletPoints(
  fromUserId: string,
  toUserId: string,
  opts?: { fromName?: string; toName?: string },
): { ok: boolean; message: string; amount: number } {
  if (!fromUserId || !toUserId || fromUserId === toUserId) {
    return { ok: false, message: "回流账户无效", amount: 0 };
  }
  const from = loadOrgMemberWallet(fromUserId);
  const gift = Math.max(0, from.giftPoints);
  const benefit = Math.max(0, from.benefitPoints);
  const recharge = Math.max(0, from.rechargePoints || 0);
  const amt = gift + benefit + recharge;
  if (amt <= 0) return { ok: true, message: "无剩余算力可回流", amount: 0 };
  const fromName = opts?.fromName || "下级账号";
  const toName = opts?.toName || "发放账户";
  pushLedger(
    { ...from, giftPoints: 0, benefitPoints: 0, rechargePoints: 0 },
    {
      kind: "return",
      amount: -amt,
      title: "账号删除，算力回流",
      detail: `回流至「${toName}」；${formatBucketDelta(-gift, -benefit, -recharge)}`,
    },
  );
  const to = loadPointsWallet(toUserId, { enterprise: true });
  pushLedger(
    {
      ...to,
      giftPoints: to.giftPoints + gift,
      benefitPoints: to.benefitPoints + benefit,
      rechargePoints: (to.rechargePoints || 0) + recharge,
    },
    {
      kind: "return",
      amount: amt,
      title: `「${fromName}」删除，算力回流`,
      detail: formatBucketDelta(gift, benefit, recharge),
    },
  );
  return { ok: true, message: `已回流 ${amt}`, amount: amt };
}

/** 未真正发出生成请求：全额退回三桶（按原顺序无法精确还原，退回充值桶） */
export function refundIfNotDispatched(wallet: PointsWallet, amount: number, title = "未生成，全额退回"): PointsWallet {
  const n = Math.max(0, Math.floor(amount));
  if (n <= 0) return wallet;
  return pushLedger(
    { ...wallet, rechargePoints: (wallet.rechargePoints || 0) + n },
    { kind: "gift", amount: n, title, detail: "请求尚未发往生成服务，全额退回" },
  );
}

