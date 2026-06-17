import type { Template, TemplateType } from "@/lib/types";

/* ---------- 模版库 ----------
   三级筛选：场景（行1）→ 类型（行2）→ 子类（行3，随类型切换）
*/
// 行1：场景（含「全部」）
export const templateScenes: string[] = ["全部", "农产品", "农家乐·民宿", "旅游景点", "节庆活动", "电商推广", "社交媒体", "招商宣传", "政策科普"];

// 行2：类型（含「全部」），key 与导航/模块一致
export const templateTypes: TemplateType[] = [
  { key: "all", name: "全部" },
  { key: "content", name: "文案策划" },
  { key: "image", name: "品牌设计" },
  { key: "video", name: "视频宣传" },
];

// 行3：每个类型对应的子类（首项「全部」）
export const templateSubs: Record<"content" | "image" | "video", string[]> = {
  content: ["全部", "社媒推文", "公众号帮写", "品牌推广"],
  image: ["全部", "海报", "长图", "菜单", "易拉宝", "宣传单", "商拍", "logo", "IP设计", "AI字体", "店招设计"],
  video: ["全部", "一句话成片", "数字人模特", "制作大片"],
};

// 模版数据：scene 场景 / type 类型 / sub 子类
export const templates: Template[] = [
  { emoji: "🍃", name: "明前白茶上市海报", scene: "农产品", type: "image", sub: "海报", hot: true, uses: "1.2k", grad: "thumb-grad-1" },
  { emoji: "📕", name: "白茶种草社媒推文", scene: "农产品", type: "content", sub: "社媒推文", hot: true, uses: "986", grad: "thumb-grad-2" },
  { emoji: "🎬", name: "竹乡风光一句话成片", scene: "旅游景点", type: "video", sub: "一句话成片", hot: true, uses: "2.3k", grad: "thumb-grad-5" },
  { emoji: "📰", name: "竹博园公众号帮写", scene: "旅游景点", type: "content", sub: "公众号帮写", hot: false, uses: "642", grad: "thumb-grad-6" },
  { emoji: "🛍️", name: "高山笋干电商海报", scene: "电商推广", type: "image", sub: "海报", hot: true, uses: "1.5k", grad: "thumb-grad-1" },
  { emoji: "🥢", name: "笋干礼盒商拍图", scene: "电商推广", type: "image", sub: "商拍", hot: false, uses: "418", grad: "thumb-grad-3" },
  { emoji: "🏪", name: "农家乐店招设计", scene: "农家乐·民宿", type: "image", sub: "店招设计", hot: false, uses: "377", grad: "thumb-grad-5" },
  { emoji: "📑", name: "乡村旅游长图", scene: "旅游景点", type: "image", sub: "长图", hot: false, uses: "529", grad: "thumb-grad-3" },
  { emoji: "🥬", name: "鲜笋促销宣传单", scene: "电商推广", type: "image", sub: "宣传单", hot: true, uses: "1.1k", grad: "thumb-grad-5" },
  { emoji: "🏮", name: "茶文化节品牌推广文", scene: "节庆活动", type: "content", sub: "品牌推广", hot: false, uses: "284", grad: "thumb-grad-2" },
  { emoji: "📊", name: "和美乡村政策科普图", scene: "政策科普", type: "image", sub: "长图", hot: false, uses: "356", grad: "thumb-grad-6" },
  { emoji: "🎨", name: "茶乡国风 logo", scene: "农产品", type: "image", sub: "logo", hot: true, uses: "873", grad: "thumb-grad-4" },
  { emoji: "📱", name: "文旅推介数字人模特", scene: "旅游景点", type: "video", sub: "数字人模特", hot: false, uses: "612", grad: "thumb-grad-3" },
  { emoji: "📺", name: "招商宣传制作大片", scene: "招商宣传", type: "video", sub: "制作大片", hot: false, uses: "495", grad: "thumb-grad-1" },
  { emoji: "🍵", name: "民宿菜单设计", scene: "农家乐·民宿", type: "image", sub: "菜单", hot: false, uses: "402", grad: "thumb-grad-2" },
  { emoji: "🎏", name: "招商推介易拉宝", scene: "招商宣传", type: "image", sub: "易拉宝", hot: false, uses: "318", grad: "thumb-grad-6" },
  { emoji: "🔤", name: "茶旅节 AI 艺术字", scene: "节庆活动", type: "image", sub: "AI字体", hot: false, uses: "266", grad: "thumb-grad-4" },
  { emoji: "🧸", name: "白茶 IP 形象设计", scene: "农产品", type: "image", sub: "IP设计", hot: true, uses: "734", grad: "thumb-grad-3" },
  { emoji: "💬", name: "政策科普社媒推文", scene: "政策科普", type: "content", sub: "社媒推文", hot: false, uses: "389", grad: "thumb-grad-5" },
  { emoji: "🎉", name: "节庆活动一句话成片", scene: "节庆活动", type: "video", sub: "一句话成片", hot: true, uses: "1.0k", grad: "thumb-grad-2" },
];
