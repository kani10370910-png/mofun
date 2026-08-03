/**
 * C · 工具：品牌记忆读写
 * brand 轨可跨会话；session 进度禁止经此写入。
 */
import {
  injectMemorySlots,
  persistSlotsToMemory,
  readBrandMemory,
  writeBrandMemory,
  type BrandMemory,
} from "../memory";

export function toolMemoryRead(): BrandMemory | null {
  return readBrandMemory();
}

export function toolMemoryWrite(patch: Partial<BrandMemory>): BrandMemory {
  return writeBrandMemory(patch);
}

export function toolMemoryInjectSlots(slots: Record<string, string>): Record<string, string> {
  return injectMemorySlots(slots);
}

export function toolMemoryPersistSlots(slots: Record<string, string>, slogan?: string) {
  persistSlotsToMemory(slots, slogan);
}
