"use client";

import { useCallback, useSyncExternalStore } from "react";

/* 「制作大片」会话单例：把项目状态（分镜/设定/元素/生成进度等）放到模块级，
   使其在切换到其他功能、Studio 组件卸载后依然存活。分镜生成的 fetch 本就不随卸载中止，
   其回调通过本单例的 setter（模块级、稳定引用）写回结果，因此生成会在后台继续、
   切回来仍能看到进度与成片。仅内存持久（不落 localStorage，避免 base64 帧撑爆配额）。 */

type State = Record<string, unknown>;

let state: State = {};
let snapshot: State = state; // useSyncExternalStore 需要「未变则同引用」的快照
let projectId: string | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function emit() {
  snapshot = { ...state };
  listeners.forEach((l) => l());
}

/** 初始化/切换项目：新项目（projId 变化）或首次 → 用 initial 重置；同项目 → 保留（恢复后台进度）。
    initial 用工厂函数，仅在真正需要重置时构建（避免每次渲染白建对象/递增 id）。
    在组件渲染期调用（幂等），必须在任何 useSessionField 读取之前。 */
export function initStudioSession(projId: string, makeInitial: () => State) {
  if (initialized && projectId === projId) return;
  state = { ...makeInitial() };
  snapshot = { ...state };
  projectId = projId;
  initialized = true;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return snapshot;
}

/** 读取当前会话完整状态（模块级，组件卸载后仍可用）——供后台生成完成时持久化项目。 */
export function getStudioSnapshot(): State {
  return snapshot;
}

/** 与 useState 完全同签名的字段读写：值 + setter（支持函数式更新）。setter 为稳定引用，
    组件卸载后由异步回调调用仍有效（写入模块级 state）。 */
export function useSessionField<T>(key: string): [T, (updater: T | ((prev: T) => T)) => void] {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const value = snap[key] as T;
  const set = useCallback(
    (updater: T | ((prev: T) => T)) => {
      const prev = state[key] as T;
      const next = typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
      if (Object.is(prev, next)) return;
      state[key] = next;
      emit();
    },
    [key],
  );
  return [value, set];
}
