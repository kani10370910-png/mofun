import type { AssetCard, Brand, BrandType } from "@/lib/types";

/* ---------- 个人仓库 ---------- */
export const myWorks: AssetCard[] = [
  { emoji: "🍃", kind: "图片", name: "明前白茶上市海报-终", sub: "宣传图片 · 06/08", grad: "thumb-grad-1" },
  { emoji: "📰", kind: "文案", name: "竹博园公众号推文", sub: "内容创作 · 06/07", grad: "thumb-grad-6" },
  { emoji: "🎬", kind: "视频", name: "余村文旅推介片 30s", sub: "视频生成 · 06/05", grad: "thumb-grad-3" },
  { emoji: "🏷️", kind: "图片", name: "鲜笋秒杀价签", sub: "宣传图片 · 06/04", grad: "thumb-grad-5" },
  { emoji: "📕", kind: "文案", name: "白茶小红书笔记", sub: "内容创作 · 06/03", grad: "thumb-grad-2" },
  { emoji: "📊", kind: "图片", name: "和美乡村成果展板", sub: "宣传图片 · 06/01", grad: "thumb-grad-6" },
];

export const myMaterials: AssetCard[] = [
  { emoji: "🍵", kind: "产品照", name: "白茶罐装实拍.jpg", sub: "2480×3508", grad: "thumb-grad-1" },
  { emoji: "🏪", kind: "门头照", name: "合作社门店.jpg", sub: "4032×3024", grad: "thumb-grad-3" },
  { emoji: "🎋", kind: "历史物料", name: "去年茶文化节主视觉.png", sub: "1920×1080", grad: "thumb-grad-5" },
  { emoji: "🌄", kind: "产品照", name: "高山茶园航拍.jpg", sub: "6000×4000", grad: "thumb-grad-3" },
  { emoji: "🥢", kind: "产品照", name: "笋干礼盒.png", sub: "2000×2000", grad: "thumb-grad-2" },
  { emoji: "👩‍🌾", kind: "历史物料", name: "采茶工特写.jpg", sub: "3000×2000", grad: "thumb-grad-6" },
];

// 品牌资产：按「家」（品牌主体）组织。每家自带 资产/作品/素材。
export const brands: Brand[] = [
  {
    id: "br1",
    name: "安吉白茶·产业品牌",
    logo: "🍃",
    grad: "thumb-grad-1",
    industry: "农产品区域公用品牌",
    owned: false,
    assets: [
      { id: "b1", type: "logo", name: "安吉白茶·产业品牌 LOGO", sub: "已定稿 · SVG / PNG 双格式", emoji: "🍃" },
      { id: "b2", type: "color", name: "标准色规范", sub: "主色 茶青绿 #188772 · 辅色 笋黄 #E6C07B", colors: ["#188772", "#2bb89c", "#e6c07b", "#2d2d2d"] },
      { id: "b3", type: "font", name: "标准字体", sub: "标题 阿里巴巴普惠体 · 正文 思源黑体", emoji: "🔤" },
      { id: "b4", type: "slogan", name: "品牌 Slogan", sub: "「一片叶子，富了一方百姓」", emoji: "💬" },
    ],
    works: [
      { emoji: "🍃", kind: "图片", name: "明前白茶上市海报-终", sub: "宣传图片 · 06/08", grad: "thumb-grad-1" },
      { emoji: "📕", kind: "文案", name: "白茶小红书笔记", sub: "内容创作 · 06/03", grad: "thumb-grad-2" },
      { emoji: "🎬", kind: "视频", name: "白茶产业推介片 30s", sub: "视频生成 · 06/05", grad: "thumb-grad-3" },
    ],
    materials: [
      { emoji: "🍵", kind: "产品照", name: "白茶罐装实拍.jpg", sub: "2480×3508", grad: "thumb-grad-1" },
      { emoji: "🌄", kind: "产品照", name: "高山茶园航拍.jpg", sub: "6000×4000", grad: "thumb-grad-3" },
      { emoji: "👩‍🌾", kind: "历史物料", name: "采茶工特写.jpg", sub: "3000×2000", grad: "thumb-grad-6" },
    ],
  },
  {
    id: "br2",
    name: "余村·乡村旅游",
    logo: "⛰️",
    grad: "thumb-grad-3",
    industry: "文旅景区",
    owned: false,
    assets: [
      { id: "b5", type: "logo", name: "余村文旅 LOGO", sub: "已定稿 · 绿水青山主题", emoji: "⛰️" },
      { id: "b6", type: "color", name: "标准色规范", sub: "主色 青山绿 #2E7D5B · 辅色 溪水蓝 #6FB3C9", colors: ["#2E7D5B", "#6FB3C9", "#d8e9c8", "#2d2d2d"] },
      { id: "b7", type: "slogan", name: "品牌 Slogan", sub: "「绿水青山就是金山银山」", emoji: "💬" },
    ],
    works: [
      { emoji: "🎬", kind: "视频", name: "余村文旅推介片 30s", sub: "视频生成 · 06/05", grad: "thumb-grad-3" },
      { emoji: "📊", kind: "图片", name: "和美乡村成果展板", sub: "宣传图片 · 06/01", grad: "thumb-grad-6" },
    ],
    materials: [
      { emoji: "🏞️", kind: "门头照", name: "余村景区大门.jpg", sub: "4032×3024", grad: "thumb-grad-3" },
      { emoji: "🎋", kind: "历史物料", name: "去年文化节主视觉.png", sub: "1920×1080", grad: "thumb-grad-5" },
    ],
  },
  {
    id: "br3",
    name: "竹乡·笋制品",
    logo: "🎋",
    grad: "thumb-grad-5",
    industry: "农副食品",
    owned: false,
    assets: [
      { id: "b8", type: "logo", name: "竹乡笋制品 LOGO", sub: "已定稿 · 竹叶图形", emoji: "🎋" },
      { id: "b9", type: "color", name: "标准色规范", sub: "主色 笋黄 #E6C07B · 辅色 竹青 #5A8F4E", colors: ["#E6C07B", "#5A8F4E", "#f2e3c4", "#2d2d2d"] },
    ],
    works: [
      { emoji: "🏷️", kind: "图片", name: "鲜笋秒杀价签", sub: "宣传图片 · 06/04", grad: "thumb-grad-5" },
    ],
    materials: [
      { emoji: "🥢", kind: "产品照", name: "笋干礼盒.png", sub: "2000×2000", grad: "thumb-grad-2" },
    ],
  },
];

// 品牌资产类型元数据（新增/编辑表单用）
export const brandTypes: BrandType[] = [
  { type: "logo", name: "LOGO", emoji: "🍃" },
  { type: "color", name: "标准色", emoji: "🎨" },
  { type: "font", name: "字体", emoji: "🔤" },
  { type: "slogan", name: "Slogan", emoji: "💬" },
];

// 自增 id 起始值（运行时在组件内维护）
export const BRAND_SEQ_START = 5;
