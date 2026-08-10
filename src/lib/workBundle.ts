import type { AssetCard, WorkBundleItem } from "@/lib/types";
import { assetDedupeKey, assetKey } from "@/lib/store";
import { buildWorkSummaryText } from "@/lib/workMeta";

/** 从单图作品还原 bundle（无 bundle 字段时的兜底） */
export function primaryBundle(item: AssetCard): WorkBundleItem[] {
  if (item.bundle?.length) return item.bundle;
  if (item.img) return [{ label: "主图", img: item.img }];
  if (item.videoUrl || item.mediaRef) {
    return [{ label: "视频", videoUrl: item.videoUrl, mediaRef: item.mediaRef }];
  }
  return [];
}

/** 合并 bundle 条目（同 label 更新，否则追加） */
export function mergeBundleItem(bundle: WorkBundleItem[], item: WorkBundleItem): WorkBundleItem[] {
  const idx = bundle.findIndex((b) => b.label === item.label);
  if (idx >= 0) {
    const next = [...bundle];
    next[idx] = { ...next[idx], ...item };
    return next;
  }
  return [...bundle, item];
}

/** 旧数据：从名称推断同一次生成的分组键 */
export function workSessionKey(item: AssetCard): string {
  if (item.bundle?.length) return assetKey(item);
  const name = item.name.trim();

  const ip = name.match(/^(.+?) · IP 设计(?: \d+| · .+)?$/);
  if (ip) return `${ip[1].trim()} · IP 设计`;

  const patterns = [
    /^(.+?) · (活动|商拍|店招|logo|艺术字|LOGO) \d+$/i,
    /^(.+?) · (活动|商拍|店招|logo|艺术字|LOGO)$/i,
    /^(.+?) (\d+)$/,
  ];
  for (const p of patterns) {
    const m = name.match(p);
    if (m?.[1]) {
      const base = m[1].trim();
      return m[2] ? `${base} · ${m[2]}` : base;
    }
  }
  return assetKey(item);
}

function itemLabelFromName(name: string, groupKey: string): string {
  if (name === groupKey) return "主图";
  if (name.startsWith(`${groupKey} `)) return name.slice(groupKey.length + 1);
  if (name.startsWith(`${groupKey} · `)) return name.slice(groupKey.length + 3);
  const ipDer = name.match(/^(.+?) · IP 设计 · (.+)$/);
  if (ipDer && `${ipDer[1].trim()} · IP 设计` === groupKey) return ipDer[2];
  const ipIdx = name.match(/^(.+?) · IP 设计 (\d+)$/);
  if (ipIdx && `${ipIdx[1].trim()} · IP 设计` === groupKey) return `IP 设计 ${ipIdx[2]}`;
  return name;
}

function itemTimeStamp(it: AssetCard): number {
  const t = it.updatedAt || it.createdAt;
  if (t) return Date.parse(t) || 0;
  if (it.time) return Date.parse(it.time.replace(" ", "T")) || 0;
  return 0;
}

function mergeMemberMeta(members: AssetCard[]): Pick<AssetCard, "edit" | "text"> {
  const mergedEdit: Record<string, string> = {};
  let bestText = "";
  for (const m of members) {
    if (m.edit) Object.assign(mergedEdit, m.edit);
    if (m.text && m.text.length > bestText.length) bestText = m.text;
  }
  const edit = Object.keys(mergedEdit).length ? mergedEdit : members.find((m) => m.edit)?.edit;
  const text = bestText || buildWorkSummaryText(edit);
  return { edit, text };
}

/** 将旧版「一图一条」合并为带 bundle 的展示卡片（新数据已有 bundle 则原样） */
export function groupWorksForDisplay(items: AssetCard[]): AssetCard[] {
  const withBundle: AssetCard[] = [];
  const buckets = new Map<string, AssetCard[]>();

  for (const item of items) {
    if (item.bundle?.length) {
      withBundle.push(item);
      continue;
    }
    const key = workSessionKey(item);
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }

  const grouped: AssetCard[] = [];
  for (const [key, members] of buckets) {
    if (members.length === 1 && workSessionKey(members[0]) === assetKey(members[0])) {
      grouped.push(members[0]);
      continue;
    }
    const sorted = [...members].sort((a, b) => itemTimeStamp(b) - itemTimeStamp(a));
    const cover = sorted.find((m) => m.img) ?? sorted[0];
    const bundle: WorkBundleItem[] = sorted
      .map((m) => ({
        label: itemLabelFromName(m.name, key),
        img: m.img,
        videoUrl: m.videoUrl,
        mediaRef: m.mediaRef,
      }))
      .filter((b) => b.img || b.videoUrl || b.mediaRef);
    const meta = mergeMemberMeta(sorted);
    grouped.push({
      ...cover,
      id: cover.id ?? `group-${key}`,
      name: key,
      bundle: bundle.length ? bundle : primaryBundle(cover),
      img: cover.img ?? bundle.find((b) => b.img)?.img,
      edit: meta.edit ?? cover.edit,
      text: meta.text ?? cover.text,
    });
  }

  return [...withBundle, ...grouped];
}

/** 删除展示卡片时，展开为实际存储条目（含旧版拆分多条） */
export function expandWorkForRemoval(item: AssetCard, all: AssetCard[]): AssetCard[] {
  if (item.id && !item.id.startsWith("group-") && item.bundle?.length) {
    const hit = all.find((w) => w.id === item.id);
    return hit ? [hit] : [item];
  }
  const key = workSessionKey(item);
  const members = all.filter((w) => !w.bundle?.length && workSessionKey(w) === key);
  if (members.length > 1) return members;
  if (members.length === 1) return members;
  const byId = item.id ? all.find((w) => w.id === item.id) : undefined;
  return byId ? [byId] : [item];
}

export function findWorkForSession(works: AssetCard[], sessionName: string): AssetCard | undefined {
  const candidates = [
    sessionName,
    `${sessionName} · IP 设计`,
  ];
  for (const name of candidates) {
    const hit = works.find((w) => w.name === name);
    if (hit) return hit;
  }
  return works.find(
    (w) =>
      w.name.startsWith(`${sessionName} · IP 设计`) ||
      workSessionKey(w) === sessionName ||
      workSessionKey(w) === `${sessionName} · IP 设计`,
  );
}

/** 删除作品时若含 bundle，按 dedupe 键清理可能存在的旧版拆分条目 */
export function relatedWorkKeys(item: AssetCard): string[] {
  const keys = new Set<string>([assetKey(item), assetDedupeKey(item)]);
  if (!item.bundle?.length) return [...keys];
  const base = item.name.replace(/ · IP 设计$/, "");
  for (const b of item.bundle) {
    keys.add(`${item.kind}|${item.name} · ${b.label}`);
    keys.add(`${item.kind}|${base} · IP 设计 · ${b.label}`);
    keys.add(`${item.kind}|${base} · IP 设计 1`);
  }
  return [...keys];
}
