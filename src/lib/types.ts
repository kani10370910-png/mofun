/* ============================================================
   MOFUN 魔方智绘平台 · 数据类型定义
   ============================================================ */

export type Grad =
  | "thumb-grad-1"
  | "thumb-grad-2"
  | "thumb-grad-3"
  | "thumb-grad-4"
  | "thumb-grad-5"
  | "thumb-grad-6";

export type ViewKey =
  | "home"
  | "template"
  | "content"
  | "image"
  | "video"
  | "studio"
  | "research"
  | "storage";

/* ---------- 首页 ---------- */
export interface CaseItem {
  emoji: string;
  type: string;
  cat: "image" | "content" | "video";
  name: string;
  region: string;
  author: string;
  grad: Grad;
}

export interface Intent {
  text: string;
  view: ViewKey;
  sub: string;
}

export interface IntentRule {
  kw: string[];
  view: ViewKey;
  sub: string;
  label: string;
}

/* ---------- 模版库 ---------- */
export interface TemplateType {
  key: "all" | "content" | "image" | "video";
  name: string;
}

export interface Template {
  emoji: string;
  name: string;
  scene: string;
  type: "content" | "image" | "video";
  sub: string;
  hot: boolean;
  uses: string;
  grad: Grad;
}

/* ---------- 文案策划 ---------- */
export type ContentSceneKey = "social" | "official" | "brand";

export interface ContentScene {
  key: ContentSceneKey;
  ico: string;
  title: string;
  desc: string;
  tag: string;
}

export interface SocialPlan {
  product: string;
  brand: string;
  titles: string[];
  highlights: { tag: string; text: string }[];
  posts: {
    xhs: { author: string; time: string; title: string; body: string; tags: string[] };
    wechat: { author: string; time: string; body: string };
  };
}

export interface PlanHistoryItem {
  name: string;
  platforms: string[];
  titles: string[];
  highlights: { tag: string; text: string }[];
  by: string;
  date: string;
}

export interface PosterConfig {
  titles: string[];
  highlights: string[];
}

/* ---------- 品牌设计（图片） ---------- */
export type ImageTypeKey = "event" | "product" | "logo" | "ip" | "font" | "signage";

export interface SizePreset {
  name: string;
  size: string;
  ico: string;
}

export interface ImageType {
  key: ImageTypeKey;
  ico: string;
  name: string;
  grad: Grad;
  sizes: SizePreset[];
}

export interface ModelOption {
  name: string;
  desc: string;
}

export interface ImageEntry {
  key: string;
  ico: string;
  title: string;
  desc: string;
  tag: string;
}

export interface LogoStyle {
  key: string;
  name: string;
  emoji: string;
  grad: Grad;
  img?: string; // 风格代表图（在 public/logos 下），有则优先于 emoji
}

export interface LogoCase {
  emoji: string;
  name: string;
  cat: string;
  grad: Grad;
  img?: string; // 真实 logo 图片路径（在 public/logos 下），有则优先于 emoji
  desc?: string; // 创意描述（制作同款时回填到「创意描述」）
}

export interface LogoResult {
  emoji: string;
  grad: Grad;
  fav: boolean;
  img?: string; // 真实 logo 图片路径，有则优先于 emoji
}

export interface LogoHistoryRow {
  prompt: string;
  style: string;
  desc?: string; // 当时用户填的创意描述
  results: LogoResult[];
}

export interface LogoHistoryGroup {
  group: string;
  items: LogoHistoryRow[];
}

/* ---------- AI 字体 ---------- */
export type FontCat = "书法体" | "现代体" | "艺术体";

export interface FontEffect {
  key: string;
  name: string; // 字体名（如「斗金魏楷」）
  cat: FontCat; // 所属分类
  preview: string; // 缩略示例字（如「斗」）
  img?: string; // 真实字体预览图路径（在 public 下），有则优先于 CSS 模拟
}

export interface FontCase {
  text: string; // 示例文字（如「喜报」）
  cat: FontCat; // 主分类（书法体/现代体/艺术体）
  tag: string; // 细分风格标签（如「粗毫」）
  grad: Grad; // 卡片背景渐变
  img?: string; // 真实灵感图路径（在 public 下），有则优先于 CSS 模拟
}

export interface FontStory {
  name: string; // 字体名（如「墨韵写意体」）
  cat: FontCat; // 套用时回填的分类
  scene: string; // 展示风格 key（决定卡片大图视觉，无真实图时用）
  title: string; // 大图主标题文字
  cover?: string; // 真实封面大图路径（在 public 下），有则优先于 scene
  introduce?: string; // 真实介绍图路径，点「了解/查看」时展示
}

export interface FontResult {
  grad: Grad;
  fav: boolean;
}

export interface FontHistoryRow {
  text: string; // 文字内容
  effect: string; // 字体名
  dir: string; // 横向 / 竖向
  desc?: string; // 当时用户填的文字效果描述
  results: FontResult[];
}

export interface FontHistoryGroup {
  group: string;
  items: FontHistoryRow[];
}

export interface ImageTool {
  key: string;
  name: string;
}

export interface ImageResult {
  emoji: string;
  tag: string;
  grad: Grad;
}

/* 活动文生图·画面风格（九宫格选择） */
export interface PaintStyle {
  key: string;
  name: string; // 风格名（如「国潮」）
  emoji: string; // 无图时占位 emoji
  grad: Grad; // 卡片背景渐变
  prompt: string; // 出图时拼接的风格描述词（智能匹配为空，不拼）
  img?: string; // 真实风格预览图（在 public 下），有则优先于 emoji
}

export interface ActiveGalleryItem {
  emoji?: string;
  sub: string;
  name: string;
  grad: Grad;
  img?: string; // 真实案例图（在 public 下），有则优先于 emoji
  prompt?: string; // 套用模版时回填到「画面描述」的提示词
  w?: number; // 样张原图宽（px），套用时设为自定义尺寸还原比例
  h?: number; // 样张原图高（px）
}

/* ---------- 视频宣传 ---------- */
export type VideoTypeKey = "oneline" | "avatar" | "studio";

export interface VideoEntry {
  key: string;
  ico: string;
  title: string;
  desc: string;
  tag: string;
}

export interface VideoType {
  key: VideoTypeKey;
  ico: string;
  name: string;
  flow: string[];
}

export interface StudioStep {
  key: string;
  no: number;
  name: string;
  desc: string;
}

/* ---------- 视频·一句话生成（F10） ---------- */
// 场景模板：一级分类 → 二级场景 → 引导词（含【县名】等变量占位）
export interface VideoSceneTpl {
  cat: string; // 一级分类：农业宣传 / 文化旅游 / 农旅融合
  scene: string; // 二级场景：农产品展示 / 景区宣传 …
  emoji: string;
  prompt: string; // 引导词模板
}

// 运动描述参考词库（图生视频用）
export interface MotionWordGroup {
  cat: string; // 镜头运动 / 自然场景 / 农业场景 / 人物动态 / 产品展示
  words: string[];
}

// 视频风格
export interface VideoStyle {
  key: string;
  name: string;
  emoji: string;
  grad: Grad;
  stylePrompt: string; // 追加到生成提示词末尾的画面风格描述
}

// 一句话视频生成历史行（演示）
export interface VideoRunRow {
  id: string;
  mode: "t2v" | "i2v"; // 文生视频 / 图生视频
  prompt: string; // 提示词 / 运动描述
  scene?: string; // 所选场景
  ratio: string;
  dur: string;
  style: string;
  time: string;
  status: "pending" | "running" | "done" | "failed"; // 进度状态
  pct: number;
  poster?: string; // 演示用占位封面（首帧图 / 渐变）
  tailPoster?: string; // 图生视频·首尾帧模式的尾帧图（i2v firstTailGenerate 用）
  frames?: string[]; // AI 生成的多帧关键图数组（T2V 并行生成 2 帧，用于多段 Ken Burns + 交叉淡入）
  videoUrl?: string; // 真实视频 URL（Seedance 2.0 等模型生成，含音画同步音轨，优先于 Ken Burns 播放）
  grad: Grad;
  voice?: string; // 旁白/对白音色（音画管线）
  bgm?: string; // 背景音乐（音画管线）
  withAudio?: boolean; // 是否同时生成声音（false = 静音视频，不生成任何音轨）
  failReason?: string; // 生成失败时的具体原因（来自 API 错误信息）
}

// 音画一体生成管线阶段（一句话视频：无声视频→镜头分析→声音设计→多轨音频→对齐→混音）
export interface VideoPipelineStage {
  key: string;
  ico: string;
  name: string;
  desc: string;
  to: number; // 该阶段完成时的累计进度百分比（用于由 pct 反推当前阶段）
}

// 声音设计四路并行音轨（TTS旁白 / 动作音效 / 环境声 / 音乐BGM）
export interface AudioTrack {
  key: string;
  ico: string;
  name: string;
  model: string;
}

/* ---------- 市场调研 ---------- */
export interface ResearchType {
  key: string;
  ico: string;
  name: string;
  desc: string;
}

/* ---------- 仓库 ---------- */
export interface AssetCard {
  emoji: string;
  kind: string;
  name: string;
  sub: string;
  grad: Grad;
  time?: string; // 生成时间「YYYY-MM-DD HH:mm」（自动保存的作品带）
  img?: string; // 真实图片路径，有则优先于 emoji
  videoUrl?: string; // 真实视频地址（视频类作品/素材），供制作大片「从仓库调取视频」复用
  edit?: Record<string, string>; // 二次编辑回填数据（如 { brand, style } / { text, effect } / { input }）
}

export interface BrandAsset {
  id: string;
  type: "logo" | "color" | "font" | "slogan";
  name: string;
  sub: string;
  emoji?: string;
  colors?: string[];
}

export interface Brand {
  id: string;
  name: string;
  logo: string;
  grad: Grad;
  industry: string;
  owned: boolean;
  assets: BrandAsset[];
  works: AssetCard[];
  materials: AssetCard[];
}

export interface BrandType {
  type: BrandAsset["type"];
  name: string;
  emoji: string;
}

/* ---------- 生成阶段（模拟弹层用） ---------- */
export type GenStages = Record<"content" | "image" | "video", string[]>;

/* ---------- 文案生成 API ---------- */
export interface GenerateRequest {
  scene: ContentSceneKey | "ip" | "ip-propose" | "ip-story-desc" | "ip-story" | "t2i-associate" | "t2i-event" | "studio-script" | "studio-assets" | "studio-asset-desc" | "studio-idea" | "studio-summary" | "studio-shots" | "studio-safe-rewrite";
  mode?: "outline" | "full";
  styleHint?: string; // 制作大片：项目「视频风格」描述词，注入文本扩写使全片文字基调与画面风格一致（智能匹配为空）
  /* t2i-event（活动·文生图扩写）专用 */
  eventSub?: string; // 成图类型：海报/长图/菜单/易拉宝/宣传单/…
  imageRatio?: string; // 图片比例（如 3:4）
  artStyle?: string; // 画面风格（如 国潮）
  county?: string; // 县域/地区（暂为空）
  tone?: string;
  length?: string;
  brandAsset?: string;
  /* social 专用 */
  product?: string;
  brand?: string;
  audience?: string;
  advantage?: string;
  platforms?: string[];
  outline?: string;
  /* official / brand 专用 */
  input?: string;
  /* ip（IP 设计·创意描述优化）专用 */
  description?: string;
  preferredColors?: string[];
  canvasSize?: string;
  hasReference?: boolean;
  /* ip-story-desc / ip-story（IP 故事）专用 */
  ipName?: string; // 该 IP 形象的名称/标题
  supplement?: string; // 用户补充的项目/公司/行业等关键词
}
