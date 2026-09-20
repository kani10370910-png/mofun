/* 邀请有礼（演示）：每人固定邀请码，记录本地持久化 */

const STORE_KEY = "mofun.invite-gift.v1";

export interface InviteRecord {
  id: string;
  userLabel: string;
  registeredAt: string;
  points: number;
}

export interface InviteGiftState {
  userId: string;
  code: string;
  records: InviteRecord[];
}

type StoreMap = Record<string, InviteGiftState>;

function readStore(): StoreMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const map = JSON.parse(raw) as StoreMap;
    return map && typeof map === "object" ? map : {};
  } catch {
    return {};
  }
}

function writeStore(map: StoreMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** 由账号生成稳定 5 位邀请码 */
export function makeInviteCode(userId: string): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let h = 2166136261;
  const seed = userId || "mofun";
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let out = "";
  for (let i = 0; i < 5; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    out += alphabet[(h >>> 0) % alphabet.length];
  }
  return out;
}

export function inviteLink(code: string, origin?: string): string {
  const base =
    origin ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/?code=${encodeURIComponent(code)}`;
}

export function inviteShareText(code: string, origin?: string): string {
  const link = inviteLink(code, origin);
  return [
    "/// 魔方智绘 - 县域品牌创意首选",
    "🎬 魔方智绘 - 玩转 AI 绘图与视频，人人都能出片！",
    "🎁 专属福利：新用户赠66算力，邀请得 5%出单奖励，还可随机抽算力！",
    link,
    `（邀请码：${code}）`,
  ].join("\n");
}

export function loadInviteGift(userId: string): InviteGiftState {
  const map = readStore();
  const row = map[userId];
  if (row?.code) {
    return {
      userId,
      code: String(row.code),
      records: Array.isArray(row.records) ? row.records : [],
    };
  }
  const seeded: InviteGiftState = {
    userId,
    code: makeInviteCode(userId),
    records: [],
  };
  map[userId] = seeded;
  writeStore(map);
  return seeded;
}

export function inviteStats(state: InviteGiftState): { friends: number; points: number } {
  const friends = state.records.length;
  const points = state.records.reduce((sum, row) => sum + Math.max(0, Number(row.points) || 0), 0);
  return { friends, points };
}

export function applyInviteCode(code: string, inviteeLabel: string): boolean {
  const needle = code.trim().toLowerCase();
  if (!needle) return false;
  const map = readStore();
  const found = Object.values(map).find((row) => String(row.code || "").toLowerCase() === needle);
  if (!found) return false;
  const next: InviteGiftState = {
    ...found,
    records: [
      {
        id: `inv-${Date.now()}`,
        userLabel: inviteeLabel,
        registeredAt: new Date().toISOString().slice(0, 19).replace("T", " "),
        points: 0,
      },
      ...found.records,
    ],
  };
  map[found.userId] = next;
  writeStore(map);
  return true;
}
