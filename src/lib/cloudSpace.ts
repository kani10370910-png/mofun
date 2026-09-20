/* 云端存储空间（演示）：会员赠送 + 加购容量，本地持久化 */

const STORE_KEY = "mofun.cloud-space.v1";
const GIFT_GB = 10;
const DEMO_USED_MB = 49.75;

export const SPACE_POINTS_PER_GB = 20;
export const SPACE_PACK_GBS = [5, 20, 50, 200, 500] as const;
export const SPACE_VALID_NOTE = "有效期 1年";

export interface CloudSpace {
  userId: string;
  giftGb: number;
  purchasedGb: number;
  usedMb: number;
}

type StoreMap = Record<string, CloudSpace>;

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
    /* ignore quota */
  }
}

function seedSpace(userId: string): CloudSpace {
  return { userId, giftGb: GIFT_GB, purchasedGb: 0, usedMb: DEMO_USED_MB };
}

export function loadCloudSpace(userId: string): CloudSpace {
  if (!userId) return seedSpace("");
  const map = readStore();
  const row = map[userId];
  if (!row) {
    const seeded = seedSpace(userId);
    map[userId] = seeded;
    writeStore(map);
    return seeded;
  }
  return {
    userId,
    giftGb: Number(row.giftGb) > 0 ? Number(row.giftGb) : GIFT_GB,
    purchasedGb: Math.max(0, Number(row.purchasedGb) || 0),
    usedMb: Number.isFinite(Number(row.usedMb)) ? Number(row.usedMb) : DEMO_USED_MB,
  };
}

export function saveCloudSpace(space: CloudSpace): CloudSpace {
  const map = readStore();
  map[space.userId] = space;
  writeStore(map);
  return space;
}

export function totalGb(space: CloudSpace): number {
  return Math.max(0, space.giftGb) + Math.max(0, space.purchasedGb);
}

export function usedGb(space: CloudSpace): number {
  return Math.max(0, space.usedMb) / 1024;
}

export function remainGb(space: CloudSpace): number {
  return Math.max(0, totalGb(space) - usedGb(space));
}

export function formatGb(n: number): string {
  return `${n.toFixed(2)} GB`;
}

export function formatUsed(space: CloudSpace): string {
  if (space.usedMb >= 1024) return formatGb(usedGb(space));
  const mb = Math.round(space.usedMb * 100) / 100;
  return `${mb.toFixed(2)} MB`;
}

export function pointsForGb(gb: number): number {
  return Math.max(0, Math.floor(gb)) * SPACE_POINTS_PER_GB;
}

export function purchaseCloudSpace(space: CloudSpace, gb: number): { ok: boolean; message: string; space: CloudSpace } {
  const add = Math.floor(Number(gb) || 0);
  if (add < 1) return { ok: false, message: "最少购买 1 GB", space };
  if (add > 9999) return { ok: false, message: "单次最多 9999 GB", space };
  const next = saveCloudSpace({
    ...space,
    purchasedGb: space.purchasedGb + add,
  });
  return { ok: true, message: `已增加 ${add} GB 存储空间（演示）`, space: next };
}
