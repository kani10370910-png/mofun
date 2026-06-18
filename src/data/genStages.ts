import type { GenStages } from "@/lib/types";

/* ---------- AI 生成阶段（模拟进度弹层用） ---------- */
export const genStages: GenStages = {
  content: ["理解意图与关键词", "套用品牌语气与场景模板", "生成并润色文案", "排版与合规校验"],
  image: ["解析描述 / 识别主体", "套用品牌色与版式", "AI 绘制候选方案", "超分与细节优化"],
  video: ["拆解脚本与分镜", "匹配画面与转场", "AI 渲染合成", "配乐与字幕对齐"],
};

/* 提纲模式专用阶段 */
export const outlineStages: string[] = ["理解意图与关键词", "拆解结构与提纲"];
