import { applyLivePrices } from "@/lib/pointCosts";
import { hydrateEconomyShop } from "@/lib/points";

export type EconomyPrice = {
  sku: string;
  module: string;
  name: string;
  model: string;
  unit: string;
  official_yuan: number;
  settle_yuan: number;
  live_points: number;
  remark: string;
};

export type EconomyPlanRow = {
  id: string;
  kind: string;
  name: string;
  price_yuan: number;
  seats: number;
  period_points: number;
  gift_points: number;
  days: number;
  note: string;
};

export type EconomyPackRow = {
  id: string;
  kind: string;
  name: string;
  price_yuan: number;
  points: number;
  valid_days: number;
  note: string;
};

export type EconomyCampaignRow = {
  id: string;
  name: string;
  trigger: string;
  member_types: string[];
  tenant_kinds: string[];
  points: number;
  valid_days: number;
  owner: string;
  per_user_limit: number;
  per_user_period: string;
  note: string;
};

export type EconomyCatalog = {
  deductOrder: string[];
  rechargeValidDays: number;
  benefitReset: string;
  noOverdraft: boolean;
  refund: string;
  prices: EconomyPrice[];
  plans: EconomyPlanRow[];
  packs: EconomyPackRow[];
  campaigns?: EconomyCampaignRow[];
};

let cache: EconomyCatalog | null = null;
const listeners = new Set<() => void>();

export function getEconomyCatalog() {
  return cache;
}

export function subscribeEconomy(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function emitEconomy() {
  listeners.forEach((cb) => cb());
}

export async function loadEconomyCatalog(): Promise<EconomyCatalog | null> {
  try {
    const r = await fetch("/api/public/economy", { cache: "no-store" });
    if (!r.ok) return cache;
    const data = (await r.json()) as EconomyCatalog;
    cache = data;
    applyLivePrices(data.prices || []);
    hydrateEconomyShop(data);
    emitEconomy();
    return data;
  } catch {
    return cache;
  }
}
