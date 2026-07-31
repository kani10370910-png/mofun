// DEMO 模式：静态导出（无 /api 后端）部署到线上时，数字人模特模块的 API 调用全部用本地假数据兜底。
// 由 scripts/build-static.mjs 在导出构建时注入 NEXT_PUBLIC_DEMO=1；本地 dev 默认关闭（走真实后端）。
import { asset } from "./asset";

export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

// 模拟一段耗时（配合进度动画，让假流程看起来像真在生成）
export const demoWait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// 兜底素材（均为 public 下已随站发布的本地资源）
export const DEMO_AVATAR_IMAGES = Array.from({ length: 8 }, (_, i) => asset(`/avatars/av${i + 1}.jpg`));
export const DEMO_BG_IMAGES = Array.from({ length: 12 }, (_, i) => asset(`/avatar-bg/bg${i + 1}.jpg`));
export const DEMO_VIDEO = asset("/avatars-video/av1.mp4"); // 通用兜底口播视频

// 依索引稳定挑一个素材（避免 Math.random，SSR/hydration 一致）
export function demoPick<T>(list: T[], seed: number): T {
  return list[((seed % list.length) + list.length) % list.length];
}

// AI 优化角色描述的预置返回（离线时直接润色文案）
export function demoOptimizeDesc(input: string, gender: string, age: string): string {
  const g = gender === "男" ? "男性" : "女性";
  const core = input.trim() || `一位${age}${g}数字人形象`;
  return `${core}，${age}${g}，五官清晰、面容亲和；正面免冠、光线均匀，背景简洁；着装得体大方，神态自然自信，适合口播出镜。`;
}
