import type {
  VideoEntry,
  VideoType,
  StudioStep,
  VideoSceneTpl,
  MotionWordGroup,
  VideoStyle,
  VideoPipelineStage,
  AudioTrack,
} from "@/lib/types";

/* ---------- 视频生成模型库（网格选择器） ---------- */
export interface VideoModel {
  name: string;
  desc: string;
  tags: string[]; // 能力标签：图生视频 / 音画同步 / 首尾帧 / 1080P / 10s 等
  badge?: "NEW" | "会员专享"; // 角标
}
export const videoModels: VideoModel[] = [
  { name: "Seedance 2.0 VIP", desc: "最强视频模型，会员专属通道，15s音画同步", tags: ["全能参考", "音画同步"], badge: "NEW" },
  { name: "Seedance 2.0 Fast VIP", desc: "最强视频模型快速版，会员专属通道，15s音画同步", tags: ["全能参考", "音画同步"], badge: "NEW" },
  { name: "Happy Horse 1.0", desc: "阿里最新视频模型，支持多参生成", tags: ["图生视频", "15s"], badge: "NEW" },
  { name: "海螺 2.3", desc: "更好的指令遵循，动作、表情、物理表现新升级", tags: ["1080P", "10s", "首帧", "视频特效"] },
  { name: "可灵 3.0", desc: "可灵最新多模态视频模型，最强一致性", tags: ["图生视频", "音画同步", "15s"], badge: "会员专享" },
  { name: "可灵 3.0 Omni", desc: "可灵O1全面升级，兼具参考一致性，音画同出能力", tags: ["10s", "视频参考", "首尾帧"], badge: "会员专享" },
  { name: "Seedance 1.5 Pro", desc: "音画同步，支持多机位镜头，最长可生12秒视频", tags: ["首尾帧", "音画同步"] },
  { name: "PixVerse V5.5", desc: "音画同步，多机位镜头，表情更丰富，运动幅度更大", tags: ["图生视频", "音画同步"] },
  { name: "可灵 2.6", desc: "可灵最新模型，直出音画同步", tags: ["图生视频", "音画同步", "10s"] },
  { name: "通义万相 2.6", desc: "音画同步，支持多机位镜头，最长可生15秒视频", tags: ["视频参考", "音画同步", "图生视频"] },
  { name: "可灵 O1", desc: "支持自然语言编辑、视频图片多模态参考", tags: ["10s", "视频参考", "首尾帧"] },
  { name: "Vidu Q2 Pro", desc: "强大的视频编辑模型，实现视频素材反复创作", tags: ["视频参考", "视频编辑"] },
  { name: "海螺 2.0", desc: "画质超稳定，打造运动特效场景", tags: ["1080P", "10s", "首尾帧", "视频特效"] },
  { name: "Vidu Q2", desc: "多图主体参考，精准控制效果佳", tags: ["1080P", "8s", "首尾帧", "多图参考", "视频特效"] },
  { name: "可灵 2.5", desc: "速度快，效果稳定，性价比高", tags: ["10s", "首帧", "视频特效"] },
  { name: "通义万相 2.5", desc: "直出音画同步，效果稳定", tags: ["1080P", "10s", "首帧", "视频特效"] },
  { name: "通义万相 2.2", desc: "独家特效+开放生态，玩法千变万化", tags: ["720P", "8s", "首尾帧", "视频特效"] },
  { name: "可灵 2.1", desc: "支持首尾帧，图生视频效果更出色", tags: ["10s", "首尾帧"] },
  { name: "PixVerse V5", desc: "特效丰富多样", tags: ["1080P", "8s", "首尾帧", "视频特效"] },
  { name: "Youtu-Video 2.0", desc: "图生视频，提示词精准控制", tags: ["5s", "首帧", "视频特效"] },
  { name: "悠船 Video", desc: "图生视频效果稳定，画面表现力强", tags: ["720P", "5s", "首尾帧"] },
  { name: "可灵 1.6", desc: "画质稳定动作自然，性价比优秀", tags: ["10s", "首尾帧", "多图参考", "视频特效"] },
  { name: "Vidu Q1", desc: "参考生视频，精准保持角色一致性", tags: ["5s", "首尾帧", "视频特效"] },
  { name: "Seedance 1.0 Pro", desc: "高精度提示词理解，40秒生成1080P视频", tags: ["1080P", "10s", "首尾帧"] },
  { name: "可灵 2.1 大师版", desc: "大师级画面与流畅度，专业视频创作", tags: ["10s", "首帧"] },
];

/* ---------- 一句话视频：音画一体生成管线（无声视频 → 镜头分析 → 声音设计 → 多轨音频 → 对齐 → 混音 → MP4有声视频） ----------
   说明：后端无真实视频/音频模型，前端按真实管线节奏分阶段演示，让用户看到「成片即有声」的完整链路。 */
export const videoPipeline: VideoPipelineStage[] = [
  { key: "input", ico: "📝", name: "解析输入", desc: "提示词 / 图片 / 脚本理解", to: 10 },
  { key: "silent", ico: "🎬", name: "生成无声视频", desc: "视频模型生成画面", to: 40 },
  { key: "analyze", ico: "🔍", name: "镜头分析", desc: "视频理解与镜头分镜", to: 52 },
  { key: "design", ico: "🎚️", name: "声音设计", desc: "生成声音设计方案", to: 62 },
  { key: "audio", ico: "🎧", name: "多轨音频", desc: "旁白·音效·环境声·BGM 并行生成", to: 85 },
  { key: "align", ico: "⏱️", name: "时间轴对齐", desc: "音画逐帧对齐", to: 93 },
  { key: "mix", ico: "🎛️", name: "混音封装", desc: "混音并封装 MP4 有声视频", to: 100 },
];

// 声音设计四路并行音轨（E/F/G/H）
export const audioTracks: AudioTrack[] = [
  { key: "tts", ico: "🎙️", name: "旁白/对白", model: "TTS 语音合成" },
  { key: "sfx", ico: "💥", name: "动作音效", model: "音效模型" },
  { key: "bgm", ico: "🎵", name: "背景音乐", model: "音乐模型" },
];

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
  { key: "real",   name: "写实",     emoji: "📷", grad: "thumb-grad-1", stylePrompt: "真实自然纪实风格，色彩还原真实，无明显后期滤镜，画面质朴贴近生活原貌" },
  { key: "doc",    name: "纪录片",   emoji: "🎬", grad: "thumb-grad-2", stylePrompt: "纪录片叙事风格，稳定机位，中性色调，强调真实感与现场感，镜头语言克制有力" },
  { key: "aerial", name: "航拍大片", emoji: "🚁", grad: "thumb-grad-3", stylePrompt: "无人机航拍视角，高空俯瞰与低空掠过交替，大景别震撼全景，色彩鲜明饱满，气势磅礴" },
  { key: "warm",   name: "温暖治愈", emoji: "🌅", grad: "thumb-grad-4", stylePrompt: "暖色系柔光，黄金时段逆光，浅景深虚化背景，慢节奏舒缓运镜，画面温馨治愈" },
  { key: "cinema", name: "电影感",   emoji: "🎞️", grad: "thumb-grad-5", stylePrompt: "电影级色彩分级，宽画幅构图，精致布光，浅景深，慢动作升格，画面质感厚重有层次" },
  { key: "ink",    name: "国风水墨", emoji: "🖌️", grad: "thumb-grad-6", stylePrompt: "中国风水墨美学，低饱和青灰色系，留白构图，意境悠远，古典韵味浓郁" },
];

/* 视频比例 / 时长 / 画质（F10-05） */
export const videoRatios = ["智能", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] as const;
export const videoDurations = ["5秒", "10秒", "15秒"] as const; // 保留供历史记录使用
export const videoQualities = ["480P", "720P", "1080P"] as const;
export const videoDurationRange = { min: 2, max: 15 } as const;

/* 音频：配音音色 + 背景音乐（F10 音频部分） */
export const videoVoices = ["不配音", "温柔女声", "沉稳男声", "活力男声"] as const;
export const videoBgms = ["无", "舒缓", "轻快", "大气", "国风"] as const;
