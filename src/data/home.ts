import type { CaseItem, Intent, IntentRule } from "@/lib/types";

/* ---------- 首页：区县案例墙 ---------- */
export const cases: CaseItem[] = [
  { emoji: "🍃", type: "宣传海报", cat: "image", name: "安吉白茶·明前新茶上市", region: "安吉县", author: "县农业农村局", grad: "thumb-grad-1" },
  { emoji: "🏞️", type: "文旅推介文案", cat: "content", name: "余村绿水青山一日游", region: "安吉县", author: "天荒坪镇", grad: "thumb-grad-5" },
  { emoji: "🎋", type: "短视频", cat: "video", name: "竹乡安吉·一节一会预热", region: "安吉县", author: "县文广旅体局", grad: "thumb-grad-1" },
  { emoji: "🏮", type: "节庆海报", cat: "image", name: "畲乡风情节·活动门头", region: "安吉县", author: "报福镇", grad: "thumb-grad-2" },
  { emoji: "🛍️", type: "电商主图", cat: "image", name: "高山笋干·年货节主图", region: "安吉县", author: "章村镇合作社", grad: "thumb-grad-3" },
  { emoji: "📊", type: "政务宣传文案", cat: "content", name: "和美乡村建设成果展板", region: "安吉县", author: "县委宣传部", grad: "thumb-grad-6" },
  { emoji: "🎬", type: "宣传短视频", cat: "video", name: "云上草原·日出露营季", region: "安吉县", author: "山川乡", grad: "thumb-grad-3" },
  { emoji: "🥬", type: "促销价签", cat: "image", name: "鲜笋直供·限时秒杀价签", region: "安吉县", author: "孝丰镇", grad: "thumb-grad-5" },
];

/* ---------- 首页：意图快捷入口 ---------- */
export const intents: Intent[] = [
  { text: "帮安吉白茶写一条<b>社媒推文</b>", view: "content", sub: "social" },
  { text: "做一张茶文化节<b>活动主视觉</b>", view: "image", sub: "event" },
  { text: "用<b>一句话成片</b>做条产品视频", view: "video", sub: "oneline" },
  { text: "写一篇竹博园<b>公众号</b>长文", view: "content", sub: "official" },
  { text: "设计一个品牌<b>logo</b>", view: "image", sub: "logo" },
];

/* 引擎识别意图（演示：根据关键词映射到模块的具体类型） */
export const intentRules: IntentRule[] = [
  // 文案策划（社媒推文/公众号帮写/品牌推广）
  { kw: ["公众号", "长文"], view: "content", sub: "official", label: "文案策划 · 公众号帮写" },
  { kw: ["品牌", "推广", "卖点", "主张", "slogan"], view: "content", sub: "brand", label: "文案策划 · 品牌推广" },
  { kw: ["朋友圈", "小红书", "笔记", "微博", "话题", "推文", "社媒", "抖音", "口播", "文案"], view: "content", sub: "social", label: "文案策划 · 社媒推文" },
  // 品牌设计（活动[海报/长图/菜单/易拉宝/宣传单] / 商拍 / logo / IP设计 / AI字体 / 店招设计）
  { kw: ["logo", "标志", "商标", "LOGO"], view: "image", sub: "logo", label: "品牌设计 · logo" },
  { kw: ["IP", "ip", "吉祥物", "形象", "表情包"], view: "image", sub: "ip", label: "品牌设计 · IP设计" },
  { kw: ["字体", "艺术字", "书法字", "标题字"], view: "image", sub: "font", label: "品牌设计 · AI字体" },
  { kw: ["商拍", "电商", "主图", "详情页", "白底", "商品图", "场景", "渲染", "实拍"], view: "image", sub: "product", label: "品牌设计 · 商拍" },
  { kw: ["店招", "门头"], view: "image", sub: "signage", label: "品牌设计 · 店招设计" },
  { kw: ["活动", "海报", "长图", "菜单", "价目", "易拉宝", "展架", "宣传单", "传单", "单页", "上市", "价签", "展板", "图"], view: "image", sub: "event", label: "品牌设计 · 活动" },
  // 视频宣传（一句话成片 / 数字人模特 / 制作大片）
  { kw: ["数字人", "口播", "主播", "模特", "出镜"], view: "video", sub: "avatar", label: "视频宣传 · 数字人模特" },
  { kw: ["大片", "宣传片", "品牌片", "剧本", "分镜", "制作大片"], view: "studio", sub: "script", label: "视频宣传 · 制作大片" },
  { kw: ["一句话", "快速成片", "成片", "视频", "短视频", "广告", "促销", "展示", "介绍片"], view: "video", sub: "oneline", label: "视频宣传 · 一句话成片" },
];
