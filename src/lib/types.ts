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

export interface ActiveGalleryItem {
  emoji: string;
  sub: string;
  name: string;
  grad: Grad;
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
  scene: ContentSceneKey;
  mode?: "outline" | "full";
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
}
