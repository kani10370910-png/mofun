/* 数字人模特 · 形象库 & 场景背景数据
   预制形象：无真实人脸，用渐变占位色 + 表情 emoji，上线时替换为实拍形象图。
   背景场景：本地静态图路径（public/avatar-bg/），未置入时留空字符串。 */

export interface AvatarPreset {
  id: string;
  name: string;
  role: string;       // 角色定位标签
  tags: string[];     // 适用场景标签
  gender: "男" | "女";
  age: "青年" | "中年";
  emoji: string;      // 占位 emoji
  grad: string;       // 占位渐变（CSS linear-gradient）
  cover: string;      // 正式形象图路径（空字符串时用 grad+emoji 占位）
  cut?: string;       // 抠像图（透明背景 PNG）：用于动态背景合成时放绿底喂 s2v
  demo?: string;      // 悬停预览的口播 demo 视频（有则鼠标移入播放，移出显示 cover 图）
  defaultVoice: string; // 对应火山 voice_type
  voiceName: string;    // 音色昵称（展示用）
}

export interface AvatarBg {
  id: string;
  name: string;
  category: string;
  thumb: string;  // 缩略图路径（空时用纯色兜底）
  color: string;  // 兜底背景色
  dyn?: string;   // 预置动态背景视频（提前存储，用户直接用；官方场景专用，不由用户生成）
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: "av1",
    name: "文旅小帅",
    role: "景区导游",
    tags: ["文旅宣传", "景区介绍", "旅游推荐"],
    gender: "男",
    age: "青年",
    emoji: "🧑‍🦱",
    grad: "linear-gradient(135deg,#43a47b 0%,#2d8b65 100%)",
    cover: "/avatars/av1.jpg",
    cut: "/avatars/av1-cut.png",
    demo: "/avatars-video/av1.mp4",
    defaultVoice: "zh_male_jingqiangkanye_emo_mars_bigtts",
    voiceName: "京腔侃爷",
  },
  {
    id: "av2",
    name: "田园阿芳",
    role: "农技推广",
    tags: ["农产品", "种植技术", "农情播报"],
    gender: "女",
    age: "中年",
    emoji: "👩‍🌾",
    grad: "linear-gradient(135deg,#f5a623 0%,#e8861c 100%)",
    cover: "/avatars/av2.jpg", // 模型生成的农技推广全身像（稻田实景）
    demo: "/avatars-video/av2.mp4", // 悬停预览口播 demo（wan2.2 s2v 生成，头肩口播）
    defaultVoice: "zh_female_linjuayi_emo_v2_mars_bigtts",
    voiceName: "邻居阿姨",
  },
];

export const AVATAR_BG_PRESETS: AvatarBg[] = [
  // 演播室 / 直播间
  {
    id: "bg1",
    name: "专业演播室",
    category: "演播室",
    thumb: "/avatar-bg/bg1.jpg",
    color: "#1a2540",
  },
  {
    id: "bg2",
    name: "简约直播间",
    category: "演播室",
    thumb: "/avatar-bg/bg2.jpg",
    color: "#1e1e2e",
  },
  {
    id: "bg3",
    name: "政务蓝色背景",
    category: "演播室",
    thumb: "/avatar-bg/bg3.jpg",
    color: "#0d2d6b",
  },
  // 农业场景
  {
    id: "bg4",
    name: "金色稻田",
    category: "农业",
    thumb: "/avatar-bg/bg4.jpg",
    color: "#c9902c",
  },
  {
    id: "bg5",
    name: "茶园梯田",
    category: "农业",
    thumb: "/avatar-bg/bg5.jpg",
    color: "#2d6b2d",
  },
  {
    id: "bg6",
    name: "果园丰收",
    category: "农业",
    thumb: "/avatar-bg/bg6.jpg",
    color: "#a03010",
  },
  // 农业 · 各比例背景（模型生成，覆盖 9:16 / 16:9 / 3:4 / 4:3 / 1:1 / 3:2 / 2:3 / 21:9）
  { id: "bg-agri-9-16", name: "金色稻田 · 9:16", category: "农业", thumb: "/avatar-bg/agri-9-16.jpg", color: "#c9902c" },
  { id: "bg-agri-16-9", name: "茶园梯田 · 16:9", category: "农业", thumb: "/avatar-bg/agri-16-9.jpg", color: "#2d6b2d" },
  { id: "bg-agri-3-4", name: "果园丰收 · 3:4", category: "农业", thumb: "/avatar-bg/agri-3-4.jpg", color: "#a03010" },
  { id: "bg-agri-4-3", name: "蔬菜大棚 · 4:3", category: "农业", thumb: "/avatar-bg/agri-4-3.jpg", color: "#2f7d3a" },
  { id: "bg-agri-1-1", name: "金黄麦田 · 1:1", category: "农业", thumb: "/avatar-bg/agri-1-1.jpg", color: "#d0a52e" },
  { id: "bg-agri-3-2", name: "乡村田野 · 3:2", category: "农业", thumb: "/avatar-bg/agri-3-2.jpg", color: "#b98a2c" },
  { id: "bg-agri-2-3", name: "向日葵田 · 2:3", category: "农业", thumb: "/avatar-bg/agri-2-3.jpg", color: "#e0a81c" },
  { id: "bg-agri-21-9", name: "稻田全景 · 21:9", category: "农业", thumb: "/avatar-bg/agri-21-9.jpg", color: "#bfa034" },
  // 文旅场景
  {
    id: "bg7",
    name: "古镇街道",
    category: "文旅",
    thumb: "/avatar-bg/bg7.jpg",
    color: "#5c3a1e",
  },
  {
    id: "bg8",
    name: "山水风景",
    category: "文旅",
    thumb: "/avatar-bg/bg8.jpg",
    color: "#2d6b8a",
  },
  {
    id: "bg9",
    name: "花海草原",
    category: "文旅",
    thumb: "/avatar-bg/bg9.jpg",
    color: "#5c9c2d",
  },
];

export const AVATAR_ROLES = ["全部", "景区导游", "农技推广", "品牌代言", "官方播报", "乡村主播", "文化传播", "带货主播", "科普讲解"] as const;
export const AVATAR_BG_CATEGORIES = ["演播室", "农业", "文旅"] as const;

// 口播时长预设（字数 ≈ 字/分钟 × 分钟；按正常语速约 3 字/秒）
export const SCRIPT_DURATION_PRESETS = [
  { label: "15秒", chars: 45, hint: "适合短视频封面/开场" },
  { label: "30秒", chars: 90, hint: "产品核心亮点介绍" },
  { label: "1分钟", chars: 180, hint: "完整产品/景点介绍" },
  { label: "2分钟", chars: 360, hint: "深度讲解/活动直播" },
] as const;

// 口播语气预设
export const SCRIPT_TONES = [
  { key: "亲切口语", label: "亲切口语", desc: "像朋友聊天，接地气" },
  { key: "专业权威", label: "专业权威", desc: "可信赖，适合农技/政务" },
  { key: "活泼种草", label: "活泼种草", desc: "有感染力，适合电商带货" },
  { key: "政务正式", label: "政务正式", desc: "严谨规范，适合通知公告" },
] as const;
