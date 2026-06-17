import type {
  ImageEntry,
  ImageType,
  ModelOption,
  SizePreset,
  LogoStyle,
  LogoCase,
  LogoHistoryGroup,
  ImageTool,
  ImageResult,
  ActiveGalleryItem,
  FontEffect,
  FontCase,
  FontStory,
  Grad,
} from "@/lib/types";

/* ---------- 宣传图片：两种入口 + 图片类型 ---------- */
export const imageEntries: ImageEntry[] = [
  { key: "desc", ico: "✨", title: "描述做图", desc: "用文字描述需求，AI 直接出图", tag: "文生图" },
  { key: "photo", ico: "📷", title: "照片做图", desc: "上传产品/实拍照片，AI 智能合成", tag: "图生图" },
];

// 每个成图类型自带「尺寸预设」数组（第一个为切换时默认选中）
export const imageTypes: ImageType[] = [
  { key: "event", ico: "🎉", name: "活动", grad: "thumb-grad-2", sizes: [
    { name: "海报", size: "1080 × 1440 px", ico: "szPortrait" },
    { name: "长图", size: "1080 × 3000 px", ico: "szPortrait" },
    { name: "菜单", size: "21 × 29.7 cm", ico: "szA4" },
    { name: "易拉宝", size: "80 × 180 cm", ico: "szRollup" },
    { name: "宣传单", size: "21 × 29.7 cm", ico: "szA4" },
  ] },
  { key: "product", ico: "📷", name: "商拍", grad: "thumb-grad-1", sizes: [
    { name: "白底商品图", size: "1000 × 1000 px", ico: "szSquare" },
    { name: "产品场景图", size: "1920 × 1080 px", ico: "szLandscape" },
    { name: "竖版细节图", size: "1080 × 1440 px", ico: "szPortrait" },
  ] },
  { key: "logo", ico: "✴️", name: "logo", grad: "thumb-grad-3", sizes: [
    { name: "标准 LOGO", size: "1024 × 1024 px", ico: "szSquare" },
    { name: "透明底 LOGO", size: "1024 × 1024 px · PNG", ico: "szSquare" },
  ] },
  { key: "ip", ico: "🧸", name: "IP设计", grad: "thumb-grad-4", sizes: [
    { name: "IP 形象图", size: "1024 × 1024 px", ico: "szSquare" },
    { name: "IP 三视图", size: "1920 × 1080 px", ico: "szLandscape" },
    { name: "表情包九宫格", size: "1080 × 1080 px", ico: "szSquare" },
  ] },
  { key: "font", ico: "🔤", name: "AI字体", grad: "thumb-grad-6", sizes: [
    { name: "艺术标题字", size: "1920 × 1080 px", ico: "szLandscape" },
    { name: "方形字图", size: "1080 × 1080 px", ico: "szSquare" },
  ] },
  { key: "signage", ico: "🏪", name: "店招设计", grad: "thumb-grad-5", sizes: [
    { name: "线上店招", size: "1920 × 150 px", ico: "szLandscape" },
    { name: "实体门头", size: "300 × 80 cm", ico: "szLandscape" },
  ] },
];

/* ---------- 宣传图片：生图模型（下拉选择） ---------- */
export const imageModels: ModelOption[] = [
  { name: "MoFun 区域文化大模型", desc: "更好地理解并体现当地农文旅元素" },
  { name: "Z-Image", desc: "真实感增强" },
  { name: "全能模型 2.1", desc: "Banana 2 同款" },
  { name: "Seedream 4.0", desc: "高细节 · 商业级出图" },
];

/* ---------- 文生图：图片比例（活动文生图用） ---------- */
export const imageRatios: SizePreset[] = [
  { name: "正方形 1:1", size: "1080 × 1080 px", ico: "szSquare" },
  { name: "纵向 3:5", size: "1080 × 1800 px", ico: "szPortrait" },
  { name: "横向 5:3", size: "1800 × 1080 px", ico: "szLandscape" },
  { name: "宽屏 16:9", size: "1920 × 1080 px", ico: "szLandscape" },
];

/* ---------- 图生图：编辑模型（活动图生图用） ---------- */
export const editModels: ModelOption[] = [
  { name: "基础编辑模型", desc: "通用图像编辑，速度快" },
  { name: "高清重绘模型", desc: "细节增强 · 商业级" },
  { name: "局部重绘模型", desc: "精准修改指定区域" },
];

/* ---------- logo 设计：风格 + 参考灵感案例 ---------- */
export const logoStyles: LogoStyle[] = [
  { key: "auto", name: "智能匹配", emoji: "🎨", grad: "thumb-grad-4" },
  { key: "illust", name: "图文插画", emoji: "⛰️", grad: "thumb-grad-1", img: "/logos/1.png" },
  { key: "simple", name: "图文简约", emoji: "📖", grad: "thumb-grad-5", img: "/logos/20251114_1.png" },
  { key: "word", name: "文字logo", emoji: "🍶", grad: "thumb-grad-6", img: "/logos/20251114_13.png" },
  { key: "letter", name: "字母logo", emoji: "🔠", grad: "thumb-grad-3", img: "/logos/57.png" },
  { key: "badge", name: "经典徽章", emoji: "🏅", grad: "thumb-grad-2", img: "/logos/55.png" },
  { key: "newcn", name: "新中式", emoji: "🪭", grad: "thumb-grad-1", img: "/logos/2025112606.png" },
];

export const logoCats: string[] = ["全部", "图文插画", "图文简约", "文字logo", "字母logo", "经典徽章", "新中式"];

// 真实 logo 案例：图片在 public/logos/ 下，按样例表格的「编号 · 风格 · 品牌名」录入
const G: Grad[] = ["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4", "thumb-grad-5", "thumb-grad-6"];

// 按风格生成贴合该品牌的创意描述（制作同款时回填到「创意描述」）
function logoDesc(name: string, cat: string): string {
  switch (cat) {
    case "图文插画":
      return `为「${name}」设计图文插画风 LOGO：以贴合品牌调性的卡通/手绘元素为主体，画面生动有故事感，搭配品牌名「${name}」中文字体，色彩明快、亲和力强。`;
    case "图文简约":
      return `为「${name}」设计图文简约风 LOGO：几何化的简洁图形 + 品牌名「${name}」，线条干净、留白充足，现代极简、辨识度高，适配多场景。`;
    case "文字logo":
      return `为「${name}」设计文字型 LOGO：以「${name}」字体设计为核心，笔画做艺术化处理，可点缀印章/落款元素，整体大气耐看、有品牌记忆点。`;
    case "字母logo":
      return `为「${name}」设计字母 LOGO：提取品牌名首字母做图形化组合，结构稳定、富有设计感，配色简洁现代，适合科技/商务气质的品牌。`;
    case "经典徽章":
      return `为「${name}」设计经典徽章 LOGO：盾形/圆形徽章版式，内含品牌名「${name}」与象征元素，可加绶带、年份、英文环绕，质感复古、专业可信。`;
    case "新中式":
      return `为「${name}」设计新中式 LOGO：以国风线条、剪纸/窗花/水墨等元素构图，融入品牌名「${name}」书法字，雅致东方、清新而有底蕴。`;
    case "扁平矢量":
      return `为「${name}」设计扁平矢量 LOGO：纯色块 + 几何图形构成，配色协调、边缘干净，矢量可无损缩放，现代清爽、易于印刷与延展。`;
    case "日系线条":
      return `为「${name}」设计日系线条 LOGO：以细线条勾勒和风意象（如山海、枝叶、鸟居），搭配品牌名「${name}」，留白克制、素雅治愈。`;
    default:
      return `为「${name}」设计 LOGO：智能匹配最合适的风格，突出品牌名「${name}」，简洁现代、辨识度高。`;
  }
}

const lc = (img: string, name: string, cat: string, i: number): LogoCase => ({
  emoji: "🎨",
  name,
  cat,
  grad: G[i % G.length],
  img: `/logos/${img}`,
  desc: logoDesc(name, cat),
});

export const logoCases: LogoCase[] = [
  // —— 图文插画（根目录数字系列，品牌名以图片实际内容为准）——
  lc("1.png", "鳄鱼文创", "图文插画", 0),
  lc("10.png", "阿姨家热卤", "图文插画", 1),
  lc("11.png", "山喜", "图文插画", 2),
  lc("12.png", "茶饮品牌", "图文插画", 3),
  lc("13.png", "bluebread", "图文插画", 4),
  lc("14.png", "三山两院", "图文插画", 5),
  lc("15.png", "山也", "图文插画", 6),
  lc("16.png", "野珍", "图文插画", 7),
  lc("17.png", "永松", "图文插画", 8),
  lc("18.png", "十里面馆", "图文插画", 9),
  lc("19.png", "遇见小面", "图文插画", 10),
  lc("20.png", "柳叶茶道", "图文插画", 11),
  // —— 20251114 子目录系列 ——
  lc("20251114_1.png", "mojo", "图文简约", 12),
  lc("20251114_2.png", "KONK", "图文简约", 13),
  lc("20251114_3.png", "OOUUO", "图文简约", 14),
  lc("20251114_4.png", "TOMPANY", "字母logo", 15),
  lc("20251114_5.png", "QUANTUM", "字母logo", 16),
  lc("20251114_6.png", "lathias Danielsson", "字母logo", 17),
  lc("20251114_7.png", "sav aceniry", "字母logo", 18),
  lc("20251114_8.png", "CREATE", "字母logo", 19),
  lc("20251114_9.png", "YPSY 远洋实业", "图文简约", 20),
  lc("20251114_11.png", "ROMA 罗玛全屋定制", "图文简约", 21),
  lc("20251114_12.png", "亚北建筑", "图文简约", 22),
  lc("20251114_13.png", "雲野堂", "文字logo", 23),
  lc("20251114_14.png", "青梅酒", "文字logo", 24),
  lc("20251114_15.png", "舟渔记", "文字logo", 25),
  lc("20251114_16.png", "捞面馆", "文字logo", 26),
  lc("20251114_17.png", "粥香万家", "文字logo", 27),
  lc("20251114_18.png", "深夜食堂", "文字logo", 28),
  lc("20251114_19.png", "食物说", "文字logo", 29),
  lc("20251114_21.png", "城市咖啡", "图文简约", 30),
  lc("20251114_22.png", "蔓花居", "图文简约", 31),
  lc("20251114_23.png", "城市拾遗", "文字logo", 32),
  lc("20251114_24.png", "虎啸山庄", "经典徽章", 33),
  lc("20251114_25.png", "堂前燕", "经典徽章", 34),
  lc("20251114_26.png", "茶马贡茶", "经典徽章", 35),
  lc("20251114_27.png", "蜀龙记", "经典徽章", 36),
  lc("20251114_28.png", "补益堂", "经典徽章", 37),
  lc("20251114_29.png", "TAURUS", "经典徽章", 38),
  lc("20251114_31.png", "先卤为敬", "经典徽章", 39),
  lc("20251114_32.png", "甜记铺", "经典徽章", 40),
  lc("20251114_33.png", "山楂汽酒", "经典徽章", 41),
  lc("20251114_34.png", "贺大爷烤串", "经典徽章", 42),
  lc("20251114_35.png", "LB CREATIVE", "字母logo", 43),
  lc("20251114_36.png", "GRAN TURISMO", "字母logo", 44),
  lc("20251114_37.png", "Getaria 野奢酒店", "字母logo", 45),
  lc("20251114_38.png", "西普科技", "字母logo", 46),
  lc("20251114_39.png", "未创针织", "图文简约", 47),
  lc("20251114_41.png", "thrive", "字母logo", 48),
  lc("20251114_42.png", "DIMARCO", "字母logo", 49),
  lc("20251114_43.png", "城市森林基地", "图文简约", 50),
  lc("20251114_44.png", "黑爵舞蹈", "图文简约", 51),
  lc("20251114_45.png", "马克重工", "图文简约", 52),
  // —— 20251126 新中式系列 ——
  lc("2025112601.png", "珑华珠宝", "新中式", 53),
  lc("2025112602.png", "燕味春", "新中式", 54),
  lc("2025112603.png", "无忧雨民宿", "新中式", 55),
  lc("2025112604.png", "鹿韵坊", "新中式", 56),
  lc("2025112605.png", "三山候", "新中式", 57),
  lc("2025112606.png", "鹿福康", "新中式", 58),
  lc("2025112607.png", "鹤羽堂", "新中式", 59),
  lc("2025112608.png", "雀羽", "新中式", 60),
  lc("2025112609.png", "孤山茶舍", "新中式", 61),
  // —— 根目录 21-68 系列 ——
  lc("21.jpeg", "老妈水饺", "图文插画", 0),
  lc("22.png", "老巷面馆", "图文插画", 1),
  lc("23.png", "蜀韵红锅", "图文插画", 2),
  lc("24.png", "渔人码头", "图文插画", 3),
  lc("25.png", "鹿果森林", "图文插画", 4),
  lc("26.png", "ELE ARCHITECTS", "图文简约", 5),
  lc("27.jpeg", "梵音", "图文插画", 6),
  lc("28.jpeg", "藏书林", "图文插画", 7),
  lc("29.jpeg", "花满弄", "图文插画", 8),
  lc("30.jpeg", "四石文化", "图文简约", 9),
  lc("31.png", "有山茶商", "图文简约", 10),
  lc("32.jpeg", "云府", "图文简约", 11),
  lc("33.jpeg", "景城美居", "图文简约", 12),
  lc("34.jpeg", "道山茶庄", "图文简约", 13),
  lc("35.jpeg", "青居阁", "图文简约", 14),
  lc("36.png", "柯氏糊汤", "文字logo", 15),
  lc("37.png", "豆蔻年华", "文字logo", 16),
  lc("38.png", "善薰", "文字logo", 17),
  lc("39.png", "雲焱堂", "文字logo", 18),
  lc("40.png", "鸟酒居", "文字logo", 19),
  lc("41.png", "酿山秋", "文字logo", 20),
  lc("42.png", "古木茶社", "文字logo", 21),
  lc("43.png", "东方韵味", "文字logo", 22),
  lc("44.png", "卤味盛宴", "文字logo", 23),
  lc("45.png", "青雲逸品", "文字logo", 24),
  lc("46.png", "唐朝烤鱼", "经典徽章", 25),
  lc("47.png", "花鸟间", "经典徽章", 26),
  lc("48.png", "粤港记", "经典徽章", 27),
  lc("49.png", "觅花", "经典徽章", 28),
  lc("50.png", "鹿小堂", "经典徽章", 29),
  lc("51.png", "爆汁汉堡", "经典徽章", 30),
  lc("52.png", "暹罗食集", "经典徽章", 31),
  lc("53.png", "老少兴点心行", "经典徽章", 32),
  lc("54.png", "品鉴大师", "经典徽章", 33),
  lc("55.png", "老茶王", "经典徽章", 34),
  lc("56.png", "NOVEX 诺威", "字母logo", 35),
  lc("57.png", "hero", "字母logo", 36),
  lc("58.png", "luxe", "字母logo", 37),
  lc("59.png", "ZYNC", "字母logo", 38),
  lc("6.png", "章鱼丸子", "图文插画", 39),
  lc("60.png", "YT TECH", "字母logo", 40),
  lc("61.png", "生鲜汇", "字母logo", 41),
  lc("62.png", "A&W BUILDING", "字母logo", 42),
  lc("63.png", "FRANK", "字母logo", 43),
  lc("64.png", "极光工作室", "字母logo", 44),
  lc("65.png", "ANBOLI", "字母logo", 45),
  lc("66.png", "恒宇地产", "字母logo", 46),
  lc("67.png", "BOSILI", "字母logo", 47),
  lc("68.png", "TOA RALLIC", "字母logo", 48),
  lc("7.png", "食趣坊", "图文插画", 49),
  lc("8.png", "小方精酿", "图文插画", 50),
  lc("9.png", "暖焙坊", "图文插画", 51),
];

export const logoHistory: LogoHistoryGroup[] = [
  {
    group: "今天",
    items: [
      {
        prompt: "王一鸣，零食公司，需要和零食元素结合",
        style: "经典徽章",
        desc: "为零食公司「王一鸣」设计经典徽章 LOGO，盾形徽章融合饼干、坚果等零食元素，复古质感、专业可信，突出品牌名。",
        results: [
          { emoji: "🏅", grad: "thumb-grad-2", fav: true },
          { emoji: "🍪", grad: "thumb-grad-1", fav: false },
          { emoji: "🥨", grad: "thumb-grad-5", fav: false },
          { emoji: "🍩", grad: "thumb-grad-3", fav: false },
        ],
      },
      {
        prompt: "刘一锅，新中式，要有锅的形状，要有刘这个字结合",
        style: "智能匹配",
        desc: "为「刘一锅」设计新中式 LOGO，以锅的形状为主体图形，巧妙融入「刘」字，国风线条、雅致有食欲感。",
        results: [
          { emoji: "🍲", grad: "thumb-grad-6", fav: false },
          { emoji: "🥘", grad: "thumb-grad-4", fav: false },
          { emoji: "🍜", grad: "thumb-grad-2", fav: false },
          { emoji: "🫕", grad: "thumb-grad-1", fav: false },
        ],
      },
    ],
  },
];

/* ---------- AI 字体：文字效果（书法体 / 现代体 / 艺术体） ---------- */
export const fontCats = ["书法体", "现代体", "艺术体"] as const;

export const fontEffects: FontEffect[] = [
  // 书法体
  { key: "doujin", name: "斗金魏楷", cat: "书法体", preview: "斗" },
  { key: "xiaoyao", name: "逍遥笔", cat: "书法体", preview: "逍" },
  { key: "haidong", name: "海东墨书", cat: "书法体", preview: "海" },
  { key: "zizai", name: "自在极意体", cat: "书法体", preview: "自" },
  { key: "fengdong", name: "风动行", cat: "书法体", preview: "风" },
  { key: "yifeng", name: "逸风疏笔体", cat: "书法体", preview: "逸" },
  { key: "xieyi", name: "写意书", cat: "书法体", preview: "写" },
  { key: "houmo", name: "厚墨忘机体", cat: "书法体", preview: "厚" },
  { key: "pofeng", name: "破锋勇书体", cat: "书法体", preview: "破" },
  // 现代体
  { key: "jianqi", name: "剑气宋", cat: "现代体", preview: "剑" },
  { key: "kuhei", name: "酷黑标题体", cat: "现代体", preview: "酷" },
  { key: "yuanrun", name: "圆润幼圆", cat: "现代体", preview: "圆" },
  { key: "keji", name: "科技无界体", cat: "现代体", preview: "科" },
  { key: "zhihei", name: "质感黑体", cat: "现代体", preview: "质" },
  { key: "qingxian", name: "轻线细体", cat: "现代体", preview: "轻" },
  // 艺术体
  { key: "chaoku", name: "潮酷立体", cat: "艺术体", preview: "潮" },
  { key: "guofeng", name: "国风手书", cat: "艺术体", preview: "国" },
  { key: "rixi", name: "日系和风", cat: "艺术体", preview: "和" },
  { key: "霓虹", name: "霓虹描边", cat: "艺术体", preview: "霓" },
  { key: "tangguo", name: "糖果泡泡", cat: "艺术体", preview: "糖" },
  { key: "fugu", name: "复古像素", cat: "艺术体", preview: "像" },
];

/* ---------- AI 字体：参考灵感案例 ---------- */
export const fontCases: FontCase[] = [
  { text: "喜报", cat: "书法体", tag: "粗毫", grad: "thumb-grad-1" },
  { text: "家宴", cat: "书法体", tag: "泼墨", grad: "thumb-grad-3" },
  { text: "798社区", cat: "艺术体", tag: "潮酷", grad: "thumb-grad-2" },
  { text: "喜乐常在", cat: "书法体", tag: "松雪行书", grad: "thumb-grad-5" },
  { text: "东阿非遗", cat: "书法体", tag: "砖石隶", grad: "thumb-grad-6" },
  { text: "新年快乐", cat: "现代体", tag: "剑气宋", grad: "thumb-grad-4" },
  { text: "明月山", cat: "书法体", tag: "和风", grad: "thumb-grad-1" },
  { text: "中医体验卡", cat: "书法体", tag: "秀丽", grad: "thumb-grad-3" },
  { text: "高山云雾", cat: "书法体", tag: "行楷", grad: "thumb-grad-5" },
  { text: "潮野生活", cat: "艺术体", tag: "立体", grad: "thumb-grad-2" },
  { text: "春茶上新", cat: "现代体", tag: "质感黑", grad: "thumb-grad-6" },
  { text: "山海之间", cat: "书法体", tag: "枯笔", grad: "thumb-grad-4" },
];

/* ---------- AI 字体：字体故事（精选字体展示 + 立即使用） ---------- */
export const fontStories: FontStory[] = [
  { name: "墨韵写意体", cat: "书法体", scene: "inkgreen", title: "墨韵写意体" },
  { name: "疾笔秋锋体", cat: "书法体", scene: "inkland", title: "破锋" },
  { name: "残碑石刻体", cat: "书法体", scene: "stone", title: "残碑断碣" },
  { name: "敦墨手书", cat: "书法体", scene: "festive", title: "顺风顺水恭喜发财" },
  { name: "矻石体", cat: "艺术体", scene: "blast", title: "矻石体" },
  { name: "逸飞行草体", cat: "书法体", scene: "sunset", title: "逸飞行草体" },
  { name: "新黑几何体", cat: "现代体", scene: "minimal", title: "简约 黑与白" },
  { name: "散人书", cat: "书法体", scene: "ribbon", title: "散人书" },
  { name: "陇月行书", cat: "书法体", scene: "package", title: "松风入怀" },
  { name: "岁岁平安", cat: "艺术体", scene: "watercolor", title: "岁岁平安" },
  { name: "踏海行书", cat: "书法体", scene: "wave", title: "踏海再行" },
  { name: "缤纷童趣体", cat: "艺术体", scene: "kids", title: "缤纷童趣集市" },
];

/* ---------- 宣传图片：生成结果图的 AI 处理工具 ---------- */
export const imageTools: ImageTool[] = [
  { key: "enhance", name: "AI 变清晰" },
  { key: "erase", name: "AI 消除" },
  { key: "matting", name: "AI 抠图" },
  { key: "expand", name: "AI 扩图" },
  { key: "vector", name: "转矢量" },
  { key: "repair", name: "细节修复" },
];

export const imageResults: ImageResult[] = [
  { emoji: "🍃", tag: "方案 A · 清新", grad: "thumb-grad-1" },
  { emoji: "🌿", tag: "方案 B · 国风", grad: "thumb-grad-5" },
  { emoji: "🏔️", tag: "方案 C · 大气", grad: "thumb-grad-3" },
  { emoji: "✨", tag: "方案 D · 促销", grad: "thumb-grad-2" },
];

/* ---------- 活动 · 右侧案例画廊（未生成时展示；按左侧子类筛选） ---------- */
export const activeGalleryItems: ActiveGalleryItem[] = [
  { emoji: "🍃", sub: "海报", name: "明前白茶上市海报", grad: "thumb-grad-1" },
  { emoji: "🛍️", sub: "海报", name: "高山笋干年货节海报", grad: "thumb-grad-5" },
  { emoji: "🌅", sub: "海报", name: "云上草原露营季海报", grad: "thumb-grad-3" },
  { emoji: "🏮", sub: "海报", name: "畲乡风情节活动海报", grad: "thumb-grad-2" },
  { emoji: "📑", sub: "长图", name: "乡村旅游长图", grad: "thumb-grad-3" },
  { emoji: "📊", sub: "长图", name: "和美乡村政策科普长图", grad: "thumb-grad-6" },
  { emoji: "📱", sub: "长图", name: "文旅推介长页", grad: "thumb-grad-4" },
  { emoji: "🍵", sub: "菜单", name: "半地咖啡饮品菜单", grad: "thumb-grad-1" },
  { emoji: "☕", sub: "菜单", name: "精选咖啡价目表", grad: "thumb-grad-5" },
  { emoji: "🍲", sub: "菜单", name: "「是真的汤」中式菜单", grad: "thumb-grad-3" },
  { emoji: "🍝", sub: "菜单", name: "午餐套餐 LUNCH MENU", grad: "thumb-grad-2" },
  { emoji: "🎏", sub: "易拉宝", name: "招商推介易拉宝", grad: "thumb-grad-6" },
  { emoji: "🎪", sub: "易拉宝", name: "茶文化节活动易拉宝", grad: "thumb-grad-4" },
  { emoji: "📣", sub: "易拉宝", name: "门店开业 X 展架", grad: "thumb-grad-2" },
  { emoji: "📰", sub: "宣传单", name: "鲜笋促销宣传单", grad: "thumb-grad-2" },
  { emoji: "📄", sub: "宣传单", name: "农家乐套餐 DM 单", grad: "thumb-grad-5" },
  { emoji: "🗞️", sub: "宣传单", name: "白茶产地直发传单", grad: "thumb-grad-3" },
];

/* ---------- IP 扩展设计：延展项（6 个子 Tab，各自的预设选项） ---------- */
export const ipExtendTabs = ["视角", "场景", "动作", "表情", "服装", "周边"] as const;
export type IpExtendTab = (typeof ipExtendTabs)[number];

export const ipExtendPresets: Record<IpExtendTab, string[]> = {
  视角: ["右侧视角", "左侧视角", "背面视角", "自定义视角"],
  场景: ["不使用预设", "果园场景", "电商场景", "都市场景", "田园场景", "公园场景"],
  动作: ["不使用预设", "手提竹篮", "挥手迎客", "比心打卡", "举杯品茶", "撑油纸伞"],
  表情: ["不使用预设", "喜笑颜开", "呆萌可爱", "腼腆害羞", "好奇张望", "元气满满"],
  服装: ["不使用预设", "国潮套装", "复古港风", "美式前卫", "宋韵古装", "奢华礼服"],
  周边: ["不使用预设", "抱枕", "马克杯", "笔记本", "钥匙扣", "手提袋"],
};

/* 各延展项的「描述词」输入占位 */
export const ipExtendPlaceholder: Record<IpExtendTab, string> = {
  视角: "描述 IP 视角，例如：俯视 45°，半身",
  场景: "描述 IP 场景，例如：高山云雾茶园，清晨",
  动作: "描述 IP 动作，例如：举起右手，摆出剪刀手",
  表情: "描述 IP 表情，例如：开怀大笑",
  服装: "描述 IP 服装，例如：旗袍，高开叉，白色",
  周边: "描述 IP 周边，例如：抱枕、马克杯等",
};

/* 点击延展项预设时，自动回填到「描述词」的提示文案（「不使用预设」= 清空） */
export const ipPresetPrompts: Partial<Record<IpExtendTab, Record<string, string>>> = {
  场景: {
    果园场景: "果园场景，背景是果实累累的果园，阳光洒落，充满丰收气息。",
    电商场景: "电商场景，背景是华丽的商品展台，灯光璀璨，突出产品质感。",
    都市场景: "都市场景，背景是现代化城市，高楼大厦鳞次栉比，展现都市繁华。",
    田园场景: "田园场景，背景是美丽的稻田和农庄，充满自然宁静的乡村氛围。",
    公园场景: "公园场景，背景是公园的一角，有假山和湖水，绿意盎然，清新怡人。",
  },
  动作: {
    手提竹篮: "人物手提精致竹篮，姿态优雅自然，充满生活气息。",
    挥手迎客: "人物挥手致意，笑容可掬，热情友好的迎客姿态。",
    比心打卡: "人物双手比心，俏皮可爱，适合打卡拍照的互动姿势。",
    举杯品茶: "人物举杯品茶，神情悠然自得，展现闲适雅致的生活态度。",
    撑油纸伞: "人物手持油纸伞，姿态温婉，充满东方古典韵味。",
  },
  表情: {
    喜笑颜开: "人物笑容灿烂，眉眼弯弯，流露出由衷的喜悦与幸福。",
    呆萌可爱: "人物表情呆萌，眼神清澈，惹人怜爱的可爱模样。",
    腼腆害羞: "人物略带羞涩，微微低头，脸颊泛红，羞涩可人的神态。",
    好奇张望: "人物眼神好奇，微微探头张望，充满探索欲的生动表情。",
    元气满满: "人物精神饱满，眼神明亮，充满活力与正能量的积极状态。",
  },
  服装: {
    国潮套装: "人物身着国潮风格套装，融合传统与现代元素，彰显文化自信。",
    复古港风: "人物穿着复古港风服饰，经典怀旧，展现八九十年代的独特韵味。",
    美式前卫: "人物身着美式前卫服装，个性张扬，潮流感十足的大胆穿搭。",
    宋韵古装: "人物身穿宋代风格古装，素雅端庄，尽显古典雅致的宋韵之美。",
    奢华礼服: "人物身着华丽礼服，高贵典雅，适合正式场合的精致着装。",
  },
  周边: {
    抱枕: "柔软抱枕，放在沙发上",
    马克杯: "白色马克杯，摆在木质书桌上",
    笔记本: "精美笔记本，放在展示架上",
    钥匙扣: "亚克力钥匙扣，配有金属环",
    手提袋: "时尚布艺手提袋，手提",
  },
};
