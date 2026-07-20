"use client";

import { nowStamp } from "@/lib/datetime";

/* 「制作大片」项目文件存储：把一次创作（多分镜合集）作为一个项目持久化到 localStorage，
   在制作大片首页「我制作的大片」列表展示，可重新打开继续编辑。
   注意：视频用外链 URL（体积小）；首尾帧 base64 会被剔除以免撑爆本地存储。 */

export interface StudioProjectMeta {
  id: string; // 稳定标识（= 创建时的项目名）
  name: string; // 显示名（可被改名）
  updated: string; // 显示时间「YYYY-MM-DD HH:mm」
  ts: number; // 排序用时间戳
  count: number; // 分镜数（集数）
  cover?: string; // 封面：首个已生成视频
  fav?: boolean; // 是否收藏（首页「只看收藏」筛选用）
}

export interface StudioProject extends StudioProjectMeta {
  state: Record<string, unknown>; // 完整会话状态，用于重新打开
}

const KEY = "mofun.studio.projects";

// 读取失败时置位：此时绝不允许整表覆写（否则一次读失败 + 一次保存 = 全部项目被抹掉）
let loadFailed = false;

function loadAll(): StudioProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    loadFailed = false;
    return raw ? (JSON.parse(raw) as StudioProject[]) : [];
  } catch {
    // 解析/读取异常 ≠ 没有数据。返回空列表前先把原始内容备份一份，且标记「读失败」，
    // 后续 saveAll 拒绝在此状态下覆写主键——修复「读失败返回 []，下次保存整表覆写导致所有项目丢失」的缺陷。
    loadFailed = true;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) window.localStorage.setItem(`${KEY}.corrupt-backup`, raw);
    } catch { /* 备份失败也不能抛出 */ }
    return [];
  }
}

function saveAll(list: StudioProject[]) {
  // 上一次读取失败（列表可能是残缺的空数组）→ 拒绝整表覆写，保住存储里的原有项目
  if (loadFailed) {
    console.warn("[studioProjects] 上次读取失败，跳过本次保存以避免覆写丢失全部项目");
    return;
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch (e) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
      window.dispatchEvent(new CustomEvent("mofun:storage-quota"));
    }
  }
}

// 剔除 base64 大字段（首尾帧 + 超大参考图），保留外链 videoUrl / poster，避免 localStorage 配额溢出。
// 配额约 5MB，一旦存满整表保存会失败；多个大项目叠加时甚至诱发读写异常连锁丢数据，故必须在入库前瘦身。
function trimState(state: Record<string, unknown>): Record<string, unknown> {
  const shots = (state.shots as Array<Record<string, unknown>> | undefined) ?? [];
  const slim = shots.map((s) => {
    const c: Record<string, unknown> = { ...s };
    for (const k of ["firstFrame", "lastFrame"]) {
      if (typeof c[k] === "string" && (c[k] as string).startsWith("data:")) delete c[k];
    }
    return c;
  });
  // 元素参考图：外链 URL 原样保留；内嵌 base64 超过 ~300KB 的剔除（重开项目后可重新生成/上传）
  const assets = (state.assets as Array<Record<string, unknown>> | undefined) ?? [];
  const slimAssets = assets.map((a) => {
    const img = a.refImg;
    if (typeof img === "string" && img.startsWith("data:") && img.length > 300_000) {
      return { ...a, refImg: undefined };
    }
    return a;
  });
  return { ...state, shots: slim, assets: slimAssets };
}

/** 项目列表（不含 state，按最近更新倒序）——供首页展示。 */
export function listProjects(): StudioProjectMeta[] {
  return loadAll()
    .map((p) => ({ id: p.id, name: p.name, updated: p.updated, ts: p.ts, count: p.count, cover: p.cover, fav: p.fav }))
    .sort((a, b) => b.ts - a.ts);
}

/** 取单个项目（含 state）用于重新打开。 */
export function getProject(id: string): StudioProject | undefined {
  return loadAll().find((p) => p.id === id);
}

/** 新建时立即「占位保留」项目名：同步写入一条最小记录（无实际分镜），
    使紧接着的下一次新建能查到该名并自动加序号，避免快速连续新建产生同名项目。
    打开该项目时，Studio 因其 state 无 shots 而用全新初始状态构建，并随即覆盖此占位。 */
export function reserveProject(id: string, name: string) {
  const all = loadAll();
  if (all.some((x) => x.id === id)) return;
  all.push({ id, name, updated: nowStamp(), ts: Date.now(), count: 0, state: { projectName: name } });
  saveAll(all);
}

/** 新增或更新项目（按 id 去重）。 */
export function upsertProject(p: StudioProject) {
  const all = loadAll();
  const slim: StudioProject = { ...p, state: trimState(p.state) };
  const i = all.findIndex((x) => x.id === p.id);
  if (i >= 0) all[i] = slim;
  else all.push(slim);
  saveAll(all);
}

/** 把某个已存在项目（含完整 state）克隆为一个新项目：新 id、新名字，state 深拷贝并改名。
    用于「视频模板 / 案例」——点「使用」即得到与源项目一模一样的视频设定 + 五步全部内容。 */
export function cloneProject(sourceId: string, newId: string, newName: string): boolean {
  const src = getProject(sourceId);
  if (!src?.state) return false;
  const state = JSON.parse(JSON.stringify(src.state)) as Record<string, unknown>;
  state.projectName = newName;
  upsertProject({
    id: newId,
    name: newName,
    updated: nowStamp(),
    ts: Date.now(),
    count: src.count,
    cover: src.cover,
    state,
  });
  return true;
}

export function deleteProject(id: string) {
  saveAll(loadAll().filter((p) => p.id !== id));
}

/** 切换某项目的收藏状态，返回切换后的值（项目不存在返回 false）。 */
export function toggleProjectFav(id: string): boolean {
  const all = loadAll();
  const p = all.find((x) => x.id === id);
  if (!p) return false;
  p.fav = !p.fav;
  saveAll(all);
  return !!p.fav;
}

export function renameProject(id: string, name: string) {
  const all = loadAll();
  const p = all.find((x) => x.id === id);
  if (!p) return;
  p.name = name;
  if (p.state && typeof p.state === "object") (p.state as Record<string, unknown>).projectName = name;
  saveAll(all);
}

/** 基于已有项目名生成不重复的显示名：重名则依次追加 1、2…（如「未命名」→「未命名1」）。 */
export function uniqueProjectName(base: string): string {
  const names = new Set(loadAll().map((p) => p.name));
  if (!names.has(base)) return base;
  let n = 1;
  while (names.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}
