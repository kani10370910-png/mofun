import type { VideoEntry, VideoType, StudioStep } from "@/lib/types";

/* ---------- 视频「制作大片」6 步流程（参考 360 漫剧） ---------- */
export const studioSteps: StudioStep[] = [
  { key: "script", no: 1, name: "剧本编辑", desc: "填写或 AI 生成视频剧本 / 文案" },
  { key: "setting", no: 2, name: "视频设定", desc: "画幅、风格、时长、配音、字幕等" },
  { key: "assets", no: 3, name: "场景角色道具", desc: "设定出镜场景、角色与关键道具" },
  { key: "storyboard", no: 4, name: "分镜脚本", desc: "拆分镜头：画面 + 旁白 + 时长" },
  { key: "clips", no: 5, name: "分镜视频", desc: "逐镜生成视频片段" },
  { key: "preview", no: 6, name: "视频预览", desc: "合成预览、配乐字幕、导出成片" },
];

/* ---------- 视频生成：两种入口 + 四类成片流程 ---------- */
export const videoEntries: VideoEntry[] = [
  { key: "desc", ico: "✨", title: "描述做视频", desc: "输入文字脚本与要点，AI 自动成片", tag: "文生视频" },
  { key: "material", ico: "🎞️", title: "素材做视频", desc: "用已有图片/片段，智能剪辑成片", tag: "素材成片" },
];

export const videoTypes: VideoType[] = [
  { key: "oneline", ico: "⚡", name: "一句话成片", flow: ["输入一句话", "AI 拆分镜", "一键成片"] },
  { key: "avatar", ico: "🧑‍💼", name: "数字人模特", flow: ["选数字人形象", "输入口播文案", "驱动合成"] },
  { key: "studio", ico: "🎬", name: "制作大片", flow: ["剧本分镜", "逐镜生成", "合成成片"] },
];
