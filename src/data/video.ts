import type { VideoEntry, VideoType, StudioStep, VideoSceneTpl, MotionWordGroup, VideoStyle } from "@/lib/types";

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

/* ---------- 一句话视频（F10-01）：县域垂直场景模板库 ----------
   引导词含【县名】等变量，由账号县域知识库自动填充（演示阶段保留占位）。 */
export const videoSceneTpls: VideoSceneTpl[] = [
  // 农业宣传
  { cat: "农业宣传", scene: "农产品展示", emoji: "🌾", prompt: "【县名】特产【产品名】，产地直发，新鲜直达，横版宣传短视频" },
  { cat: "农业宣传", scene: "农事活动", emoji: "🚜", prompt: "春耕备播时节，【县名】农田全景，农机作业，生机盎然" },
  { cat: "农业宣传", scene: "丰收季节", emoji: "🌽", prompt: "金秋丰收，【县名】【作物】喜获丰收，农民笑脸特写" },
  // 文化旅游
  { cat: "文化旅游", scene: "景区宣传", emoji: "⛰️", prompt: "【景区名】四季美景，山水风光，适合亲子游的旅游目的地" },
  { cat: "文化旅游", scene: "非遗展演", emoji: "🎭", prompt: "【非遗项目名】传承人现场展示，传统技艺，文化传承" },
  { cat: "文化旅游", scene: "民俗活动", emoji: "🎉", prompt: "【节庆名】热闹现场，民俗表演，喜庆氛围，地方特色" },
  // 农旅融合
  { cat: "农旅融合", scene: "采摘体验", emoji: "🍓", prompt: "来【县名】摘果子，亲子采摘乐园，生态农庄体验" },
  { cat: "农旅融合", scene: "田园打卡", emoji: "🏞️", prompt: "【县名】田园风光，网红打卡地，远离城市的诗意生活" },
];

/* 一级分类顺序（决定筛选 chip 排序） */
export const videoSceneCats: string[] = ["农业宣传", "文化旅游", "农旅融合"];

/* ---------- 一句话视频（F10-03）：运动描述参考词库 ---------- */
export const motionWords: MotionWordGroup[] = [
  { cat: "镜头运动", words: ["镜头缓缓推近", "镜头缓缓拉远", "环绕拍摄", "上移俯拍"] },
  { cat: "自然场景", words: ["树叶随风摇曳", "水面波纹荡漾", "云朵缓慢流动", "花朵轻轻摆动"] },
  { cat: "农业场景", words: ["稻穗随风起伏", "茶叶采摘动作", "农机缓缓前行", "果实在枝头晃动"] },
  { cat: "人物动态", words: ["人物缓步走入画面", "回头微笑", "挥手致意", "专注劳作"] },
  { cat: "产品展示", words: ["产品缓缓旋转 360°", "包装特写推进", "产品光影变化"] },
];

/* ---------- 一句话视频（F10-06）：视频风格 ---------- */
export const videoStyles: VideoStyle[] = [
  { key: "real", name: "写实", emoji: "📷", grad: "thumb-grad-1" },
  { key: "ink", name: "国风水墨", emoji: "🖌️", grad: "thumb-grad-2" },
  { key: "anime", name: "动画", emoji: "🎨", grad: "thumb-grad-4" },
  { key: "cinema", name: "电影感", emoji: "🎞️", grad: "thumb-grad-3" },
];

/* 视频比例 / 时长 / 画质（F10-05） */
export const videoRatios = ["16:9", "9:16", "1:1"] as const;
export const videoDurations = ["5秒", "10秒"] as const;
export const videoQualities = ["标准 720P", "高清 1080P"] as const;
