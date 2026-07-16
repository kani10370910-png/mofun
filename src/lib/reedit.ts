"use client";

import type { AssetCard } from "./types";

/* ============================================================
   作品「二次编辑」→ 回到对应模块并重建为一条最新历史记录
   --------------------------------------------------------
   历史记录都是各模块内存态（useState + 种子数据），跳转即重置，
   且作品(AssetCard)与历史行之间无共享 id。所以做法是：
   点「二次编辑」时把整张 AssetCard 暂存到 sessionStorage，并在
   目标 URL 带一个 nonce；目标模块据此把作品重建成一条历史记录、
   插到最前并高亮滚动定位。

   为什么用 sessionStorage 而非 URL 传数据：作品封面/视频可能是很大的
   data URL，塞不进 URL；nonce 仅作信号与去重键（同一 nonce 幂等，
   刷新仍生效，换一次「二次编辑」生成新 nonce 覆盖旧的）。
   ============================================================ */

const KEY = "mofun.reedit";

interface ReeditPayload {
  nonce: string;
  card: AssetCard;
}

// 暂存作品并返回 nonce（拼进目标 URL 的 ?reedit=）
export function stashReedit(card: AssetCard): string {
  const nonce = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ nonce, card } satisfies ReeditPayload));
  } catch {
    /* 隐私模式/超额：忽略，退回普通跳转 */
  }
  return nonce;
}

// 目标模块按 URL 的 nonce 读取作品（nonce 不匹配返回 null，供各模块按 kind 自行过滤）
export function readReedit(nonce: string | undefined | null): AssetCard | null {
  if (!nonce) return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as ReeditPayload;
    return p.nonce === nonce ? p.card : null;
  } catch {
    return null;
  }
}
