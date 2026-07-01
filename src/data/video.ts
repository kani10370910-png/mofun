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
  name: string;    // UI 显示名
  modelId: string; // 发给 API 的实际模型 ID（各平台不同）
  desc: string;
  tags: string[]; // 能力标签：图生视频 / 音画同步 / 首尾帧 / 1080P / 10s 等
  badge?: "NEW" | "会员专享"; // 角标
}
export const videoModels: VideoModel[] = [
  { name: "Seedance 2.0",      modelId: "seedance-2.0",      desc: "旗舰版，文生 / 图生，15s 音画同步", tags: ["音画同步", "15s"], badge: "NEW" },
  { name: "Seedance 2.0 Fast", modelId: "seedance-2.0-fast", desc: "快速版，出图更快，15s 音画同步",    tags: ["音画同步", "15s"]              },
  { name: "Seedance 2.0 Mini", modelId: "seedance-2.0-mini", desc: "轻量版，适合快速预览",              tags: ["15s"]                          },
];

/* ---------- 一句话视频：生成管线（简化版，反映模型真实能力） ---------- */
export const videoPipeline: VideoPipelineStage[] = [
  { key: "input",   ico: "📝", name: "解析提示词", desc: "理解描述，优化画面指令",     to: 15  },
  { key: "silent",  ico: "🎬", name: "视频生成中", desc: "模型渲染画面与运镜",         to: 80  },
  { key: "audio",   ico: "🔊", name: "音频合成",   desc: "模型同步生成环境音与音效",   to: 95  },
  { key: "mix",     ico: "✅", name: "封装完成",   desc: "输出 MP4，可下载或分享",      to: 100 },
];

// audioTracks 保留供类型引用，但不再在 UI 中显示虚假的多轨道进度
export const audioTracks: AudioTrack[] = [];

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
  { cat: "文化旅游", scene: "非遗展示",   emoji: "🎭", prompt: "【县名】非遗【项目名】，传承人现场展示技艺，匠心细节特写，传统文化韵味" },
  { cat: "农业宣传", scene: "农产品推广", emoji: "🌾", prompt: "【县名】特产【产品名】，产地直发新鲜直达，卖点展示，横版宣传短视频" },
  { cat: "农业宣传", scene: "生长环境展示", emoji: "🌱", prompt: "【县名】【作物】原生态种植环境，山水土壤气候，优质产地溯源展示" },
  { cat: "农业宣传", scene: "农事活动",   emoji: "🚜", prompt: "【县名】农忙时节农田全景，农机作业，农人劳作，生机盎然田园实景" },
  { cat: "农业宣传", scene: "丰收季节",   emoji: "🌽", prompt: "金秋丰收，【县名】【作物】喜获丰收，硕果累累，农民笑脸特写，喜悦氛围" },
  { cat: "文化旅游", scene: "景区宣传",   emoji: "⛰️", prompt: "【景区名】四季美景，山水风光航拍，适合亲子游的旅游目的地推介" },
  { cat: "农旅融合", scene: "民宿农家乐", emoji: "🏡", prompt: "【县名】特色民宿农家乐，庭院田园环境，慢生活体验，温馨惬意氛围" },
  { cat: "农旅融合", scene: "研学活动",   emoji: "🎒", prompt: "【县名】研学基地，学生亲近自然动手体验，寓教于乐，成长记录" },
  { cat: "农旅融合", scene: "采摘体验",   emoji: "🍓", prompt: "来【县名】摘果子，亲子采摘乐园，生态农庄现摘现尝体验" },
  { cat: "农业宣传", scene: "活动促销",   emoji: "🎁", prompt: "【县名】【产品名】限时促销，优惠力度展示，展销/直播带货现场，热闹氛围" },
  { cat: "文化旅游", scene: "民俗活动",   emoji: "🎉", prompt: "【节庆名】热闹现场，民俗表演巡游，喜庆氛围，浓郁地方特色" },
];

/* 一级分类顺序（仍用于生成侧「场景分类」变量与情绪基调匹配；UI 不再展示分类 chip） */
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
  { key: "auto",   name: "智能匹配", emoji: "🎨", grad: "thumb-grad-4", stylePrompt: "" },
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
