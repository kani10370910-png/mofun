import type { AuthUser } from "@/lib/auth";
import { resolveLoginAccount } from "@/lib/auth";

export type PhoneRegionInfo = {
  province: string;
  city: string;
  operator?: string;
  zipCode?: string;
  areaCode?: string;
  /** 与本项目县域 id 对齐（湖州及下辖区县） */
  regionId?: string;
};

const OP_LABELS = [
  "异常",
  "移动",
  "联通",
  "电信",
  "电信虚拟运营商",
  "联通虚拟运营商",
  "移动虚拟运营商",
];

let buf: Uint8Array | null = null;
let dataView: DataView | null = null;
let indexOffset = 0;
let indexSize = 0;
let loadPromise: Promise<void> | null = null;

function initBuffer(arrayBuffer: ArrayBuffer) {
  buf = new Uint8Array(arrayBuffer);
  dataView = new DataView(arrayBuffer);
  indexOffset = dataView.getInt32(4, true);
  indexSize = Math.floor((buf.length - indexOffset) / 9);
}

/** 加载全国号段库（public/phone.dat，约 50 万条 7 位号段） */
export function loadPhoneDat(): Promise<void> {
  if (buf) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = fetch("/phone.dat")
    .then((res) => {
      if (!res.ok) throw new Error("号段库加载失败");
      return res.arrayBuffer();
    })
    .then((arrayBuffer) => {
      initBuffer(arrayBuffer);
    })
    .catch((err) => {
      loadPromise = null;
      throw err;
    });

  return loadPromise;
}

function cleanField(field: string): string {
  const nullIndex = field.indexOf("\0");
  return nullIndex >= 0 ? field.substring(0, nullIndex) : field;
}

function findInDat(phoneOrigin: string): PhoneRegionInfo | null {
  if (!buf || !dataView) return null;
  const digits = (phoneOrigin + "").replace(/\D/g, "");
  if (!/^1\d{10}$/.test(digits)) return null;

  const phone = parseInt(digits.substring(0, 7), 10);
  if (!phone) return null;

  let left = 0;
  let right = indexSize - 1;

  while (left <= right) {
    const pos = Math.floor((right + left) / 2);
    const index = dataView.getInt32(indexOffset + pos * 9, true);

    if (index < phone) {
      if (left === pos) return null;
      left = pos;
    } else if (index > phone) {
      if (right === pos) return null;
      right = pos;
    } else {
      const infoOffset = dataView.getInt32(indexOffset + pos * 9 + 4, true);
      const phoneType = dataView.getInt8(indexOffset + pos * 9 + 8);
      let endIdx = infoOffset;
      while (endIdx < buf.length && buf[endIdx] !== 0x0a) endIdx += 1;
      const content = new TextDecoder().decode(buf.subarray(infoOffset, endIdx));
      const arr = (content || "||||").split("|");
      const province = cleanField(arr[0] || "");
      const city = cleanField(arr[1] || "");
      if (!province) return null;

      return {
        province: normalizeProvince(province),
        city: normalizeCity(city || province),
        operator: OP_LABELS[phoneType] || "异常",
        zipCode: cleanField(arr[2] || ""),
        areaCode: cleanField(arr[3] || ""),
        regionId: cityToRegionId(city || province),
      };
    }
  }

  return null;
}

function normalizeProvince(name: string): string {
  const n = name.trim();
  if (!n) return n;
  if (
    n.endsWith("省") ||
    n.endsWith("市") ||
    n.includes("自治区") ||
    n.includes("特别行政区")
  ) {
    return n;
  }
  if (/^(北京|上海|天津|重庆)$/.test(n)) return `${n}市`;
  if (/^(香港|澳门)$/.test(n)) return `${n}特别行政区`;
  return `${n}省`;
}

function normalizeCity(name: string): string {
  const n = name.trim();
  if (!n) return n;
  if (/[省市县区盟州]$/.test(n)) return n;
  if (/^(北京|上海|天津|重庆)$/.test(n)) return `${n}市`;
  return `${n}市`;
}

function cityToRegionId(city: string): string | undefined {
  if (city.includes("安吉")) return "anji";
  if (city.includes("德清")) return "deqing";
  if (city.includes("长兴")) return "changxing";
  if (city.includes("吴兴")) return "wuxing";
  if (city.includes("湖州")) return "huzhou";
  return undefined;
}

/** 从 11 位手机号解析归属省 / 市（需先 loadPhoneDat） */
export function resolvePhoneRegion(phone: string): PhoneRegionInfo | null {
  return findInDat(phone);
}

export function formatPhoneRegionLabel(info: PhoneRegionInfo | null): string {
  if (!info) return "未能识别归属地";
  return `${info.province} · ${info.city}`;
}

/** 取用户用于归属地识别的手机号 */
export function resolveUserPhoneNumber(user: AuthUser): string {
  const phone = (user.phone || "").trim();
  if (/^1\d{10}$/.test(phone)) return phone;
  const login = resolveLoginAccount(user).trim();
  if (/^1\d{10}$/.test(login)) return login;
  const username = (user.username || "").trim();
  if (/^1\d{10}$/.test(username)) return username;
  return "";
}

export function resolveUserPhoneRegion(user: AuthUser): PhoneRegionInfo | null {
  const phone = resolveUserPhoneNumber(user);
  if (!phone) return null;
  return resolvePhoneRegion(phone);
}

export async function resolvePhoneRegionAsync(phone: string): Promise<PhoneRegionInfo | null> {
  await loadPhoneDat();
  return resolvePhoneRegion(phone);
}

export async function resolveUserPhoneRegionAsync(user: AuthUser): Promise<PhoneRegionInfo | null> {
  const phone = resolveUserPhoneNumber(user);
  if (!phone) return null;
  return resolvePhoneRegionAsync(phone);
}
