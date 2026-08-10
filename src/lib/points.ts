/* 算力 / 会员（演示）：本地持久化，对齐 XFUN 会员中心 · 会员卡 + 算力 */

export type MemberTierId = "free" | "personal" | "enterprise";
export type PointsSubTab = "membershipCard" | "pointsLedger" | "earnPoints";
export type MembershipShopMode = "buyMember" | "buyPoints";

export type LedgerKind = "earn" | "spend" | "gift" | "recharge" | "expire";

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
  /** 权益算力（会员发放） */
  benefitPoints: number;
  /** 赠送算力 */
  giftPoints: number;
  tierId: MemberTierId;
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
  periodLabel: string;
  originalPriceLabel?: string;
  priceNote?: string;
  pointsBadge?: string;
  pointsBadgeNote?: string;
  /** 开通后到账权益算力 */
  grantPoints: number;
  /** 开通后赠送算力 */
  grantGift: number;
  /** 有效天数；0 表示企业演示长期 */
  days: number;
  highlight?: boolean;
  /** 购买会员 Tab 展示 */
  shopGroup?: "primary";
  perks: MemberPlanPerk[];
}

export interface PointPack {
  id: string;
  name: string;
  tag?: string;
  priceLabel: string;
  points: number;
  validNote: string;
}

const STORE_KEY = "mofun.points.v1";

export const MEMBER_PLANS: MemberPlan[] = [
  {
    id: "free",
    tierId: "free",
    name: "免费用户",
    description: "免费体验基础权益，每日登录可享额外算力福利。",
    priceLabel: "¥0",
    periodLabel: "",
    pointsBadge: "10算力",
    pointsBadgeNote: "每日登录领取，当天有效",
    grantPoints: 0,
    grantGift: 0,
    days: 0,
    shopGroup: "primary",
    perks: [
      { text: "每日登录领取 10 算力（当天有效）", included: true },
      { text: "新用户赠送 50 算力（30 天有效）", included: true },
      { text: "基础模型可用", included: true },
      { text: "会员专享模型不可用", included: false },
      { text: "最高支持 1K 分辨率", included: true },
      { text: "最多保存 1 个包装图稿", included: true },
      { text: "参加活动最高获取 300 算力/月", included: true },
    ],
  },
  {
    id: "personal-month",
    tierId: "personal",
    name: "标准会员",
    description: "适合持续创作的新用户，首次月度购买 5 折优惠。",
    priceLabel: "¥39.9",
    originalPriceLabel: "¥79.9/月",
    periodLabel: "/月起",
    priceNote: "首次购买半价，仅限首次开通",
    pointsBadge: "1600算力/月",
    pointsBadgeNote: "按月发放，到期清零",
    grantPoints: 1600,
    grantGift: 200,
    days: 30,
    highlight: true,
    shopGroup: "primary",
    perks: [
      { text: "每日登录 20 算力（当天有效）", included: true },
      { text: "每月固定发放 1600 算力", included: true },
      { text: "基础模型可用", included: true },
      { text: "会员专享模型可用", included: true },
      { text: "最高支持 4K 分辨率", included: true },
      { text: "最多保存 2000 个设计图稿", included: true },
      { text: "参加活动最高获取 400 算力/月", included: true },
    ],
  },
];

export const POINT_PACKS: PointPack[] = [
  {
    id: "pack-basic",
    name: "基础算力包",
    tag: "入门之选",
    priceLabel: "¥39.9",
    points: 600,
    validNote: "付费算力 2 年有效",
  },
  {
    id: "pack-plus",
    name: "进阶算力包",
    tag: "性价比之选",
    priceLabel: "¥99.9",
    points: 2000,
    validNote: "付费算力 2 年有效",
  },
  {
    id: "pack-pro",
    name: "高级算力包",
    tag: "超值之选",
    priceLabel: "¥299",
    points: 7000,
    validNote: "付费算力 2 年有效",
  },
];

export const EARN_TASKS: {
  id: string;
  title: string;
  desc: string;
  points: number;
  action: "checkin" | "profile" | "invite" | "demo_spend";
}[] = [
  {
    id: "checkin",
    title: "每日签到",
    desc: "每天可领取一次，连续签到更有惊喜（演示固定 +20）",
    points: 20,
    action: "checkin",
  },
  {
    id: "profile",
    title: "完善个人信息",
    desc: "设置自定义昵称并完成个人实名（演示直接发放）",
    points: 50,
    action: "profile",
  },
  {
    id: "invite",
    title: "邀请好友体验",
    desc: "分享魔方智绘，好友注册后双方获赠算力（演示）",
    points: 100,
    action: "invite",
  },
  {
    id: "demo_spend",
    title: "演示消耗 · 生成一次",
    desc: "模拟使用文案 / 图片生成，消耗单张出图算力（Seedream Lite 0.22 元 ≈ 22 算力）",
    points: -22,
    action: "demo_spend",
  },
];

function nowLabel() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function todayKey() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDaysLabel(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 23:59:59`;
}

export function formatPoints(n: number): string {
  if (n >= 999_999) return "∞";
  return String(Math.max(0, Math.floor(n)));
}

export function totalPoints(w: PointsWallet): number {
  return Math.max(0, w.benefitPoints) + Math.max(0, w.giftPoints);
}

/** 流水中的累计消耗算力（出账绝对值之和） */
export function usedPointsFromWallet(w: PointsWallet): number {
  return w.ledger.reduce((sum, e) => {
    if (e.amount < 0) return sum + Math.abs(e.amount);
    if (e.kind === "spend") return sum + Math.abs(e.amount);
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

export function tierLabel(tier: MemberTierId): string {
  if (tier === "enterprise") return "企业版会员";
  if (tier === "personal") return "个人版会员";
  return "免费体验版";
}

type StoreMap = Record<string, PointsWallet>;

function readStore(): StoreMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoreMap;
  } catch {
    return {};
  }
}

function writeStore(map: StoreMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORE_KEY, JSON.stringify(map));
}

function seedWallet(userId: string, preferEnterprise?: boolean): PointsWallet {
  const tier: MemberTierId = preferEnterprise ? "enterprise" : "free";
  const gift = preferEnterprise ? 5000 : 120;
  const benefit = preferEnterprise ? 999_999 : 0;
  const entry: PointsLedgerEntry = {
    id: `seed-${Date.now()}`,
    at: nowLabel(),
    kind: "gift",
    amount: gift,
    title: preferEnterprise ? "企业版初始算力" : "新用户体验礼包",
    detail: preferEnterprise ? "企业演示账户赠送" : "注册即赠，可用于体验生成",
  };
  return {
    userId,
    benefitPoints: benefit,
    giftPoints: gift,
    tierId: tier,
    membershipExpiresAt: preferEnterprise ? addDaysLabel(365) : addDaysLabel(3650),
    ledger: [entry],
  };
}

export function loadPointsWallet(
  userId: string,
  opts?: { enterprise?: boolean }
): PointsWallet {
  if (!userId) return seedWallet("guest", opts?.enterprise);
  const map = readStore();
  if (map[userId]) return map[userId];
  const w = seedWallet(userId, opts?.enterprise);
  map[userId] = w;
  writeStore(map);
  return w;
}

export function savePointsWallet(wallet: PointsWallet): PointsWallet {
  const map = readStore();
  map[wallet.userId] = wallet;
  writeStore(map);
  return wallet;
}

function pushLedger(wallet: PointsWallet, entry: Omit<PointsLedgerEntry, "id" | "at">): PointsWallet {
  const next: PointsWallet = {
    ...wallet,
    ledger: [
      { id: `le-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: nowLabel(), ...entry },
      ...wallet.ledger,
    ].slice(0, 200),
  };
  return savePointsWallet(next);
}

/** 将算力同步到账户弹层展示的算力字段 */
export function pointsToAuthPatch(wallet: PointsWallet): {
  computeBenefit: string;
  computeGift: string;
  expiresAt: string;
} {
  return {
    computeBenefit: formatPoints(wallet.benefitPoints),
    computeGift: formatPoints(wallet.giftPoints),
    expiresAt: wallet.membershipExpiresAt,
  };
}

export function purchasePlan(wallet: PointsWallet, planId: string): { ok: boolean; message: string; wallet: PointsWallet } {
  const plan = MEMBER_PLANS.find((p) => p.id === planId);
  if (!plan) return { ok: false, message: "套餐不存在", wallet };
  if (plan.id === "free") return { ok: false, message: "当前已是免费体验版", wallet };

  let next: PointsWallet = {
    ...wallet,
    tierId: plan.tierId,
    membershipExpiresAt: plan.days > 0 ? addDaysLabel(plan.days) : wallet.membershipExpiresAt,
    benefitPoints: wallet.benefitPoints + plan.grantPoints,
    giftPoints: wallet.giftPoints + plan.grantGift,
  };
  next = pushLedger(next, {
    kind: "recharge",
    amount: plan.grantPoints + plan.grantGift,
    title: `开通${plan.name}`,
    detail: `权益 +${plan.grantPoints} · 赠送 +${plan.grantGift}`,
  });
  return { ok: true, message: `已开通 ${plan.name}（演示支付成功）`, wallet: next };
}

export function purchasePointPack(
  wallet: PointsWallet,
  packId: string
): { ok: boolean; message: string; wallet: PointsWallet } {
  const pack = POINT_PACKS.find((p) => p.id === packId);
  if (!pack) return { ok: false, message: "算力包不存在", wallet };

  let next: PointsWallet = { ...wallet, giftPoints: wallet.giftPoints + pack.points };
  next = pushLedger(next, {
    kind: "recharge",
    amount: pack.points,
    title: `购买${pack.name}`,
    detail: pack.validNote,
  });
  return { ok: true, message: `已购买 ${pack.name}，+${pack.points} 算力（演示支付成功）`, wallet: next };
}

export function dailyCheckIn(wallet: PointsWallet): { ok: boolean; message: string; wallet: PointsWallet } {
  const today = todayKey();
  if (wallet.lastCheckInDate === today) {
    return { ok: false, message: "今日已签到，明天再来", wallet };
  }
  const pts = 20;
  let next: PointsWallet = {
    ...wallet,
    giftPoints: wallet.giftPoints + pts,
    lastCheckInDate: today,
  };
  next = pushLedger(next, {
    kind: "earn",
    amount: pts,
    title: "每日签到",
    detail: "赠送算力",
  });
  return { ok: true, message: `签到成功，+${pts} 算力`, wallet: next };
}

export function claimEarnTask(
  wallet: PointsWallet,
  taskId: string
): { ok: boolean; message: string; wallet: PointsWallet } {
  const task = EARN_TASKS.find((t) => t.id === taskId);
  if (!task) return { ok: false, message: "任务不存在", wallet };

  if (task.action === "checkin") return dailyCheckIn(wallet);

  if (task.action === "demo_spend") {
    const cost = Math.abs(task.points);
    const total = totalPoints(wallet);
    if (total < cost) return { ok: false, message: `算力不足（需要 ${cost}）`, wallet };
    let remain = cost;
    let benefit = wallet.benefitPoints;
    let gift = wallet.giftPoints;
    const fromGift = Math.min(gift, remain);
    gift -= fromGift;
    remain -= fromGift;
    benefit -= remain;
    let next: PointsWallet = { ...wallet, benefitPoints: benefit, giftPoints: gift };
    next = pushLedger(next, {
      kind: "spend",
      amount: -cost,
      title: "生成消耗（演示）",
      detail: "模拟一次 AI 生成",
    });
    return { ok: true, message: `已消耗 ${cost} 算力`, wallet: next };
  }

  // profile / invite：演示可重复但提示成功
  const pts = task.points;
  let next: PointsWallet = { ...wallet, giftPoints: wallet.giftPoints + pts };
  next = pushLedger(next, {
    kind: "earn",
    amount: pts,
    title: task.title,
    detail: task.desc,
  });
  return { ok: true, message: `已领取 +${pts} 算力（演示）`, wallet: next };
}
