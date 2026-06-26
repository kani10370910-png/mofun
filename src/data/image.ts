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
  PaintStyle,
  FontEffect,
  FontCase,
  FontStory,
  FontHistoryGroup,
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

/* ---------- 文生图：画面风格（九宫格选择；首项「智能匹配」不拼风格词） ----------
   prompt 为出图时追加到画面描述后的风格提示；占位用 emoji+渐变，真图后补 img。 */
export const paintStyles: PaintStyle[] = [
  { key: "auto", name: "智能匹配", emoji: "🎨", grad: "thumb-grad-4", prompt: "" },
  { key: "guochao", name: "国潮", emoji: "🏮", grad: "thumb-grad-2", prompt: "国潮插画风格，融合传统纹样与现代设计，色彩浓郁、东方韵味" },
  { key: "watercolor", name: "水彩", emoji: "🖌️", grad: "thumb-grad-3", prompt: "水彩画风格，柔和晕染、清新通透、笔触自然" },
  { key: "flat", name: "扁平矢量", emoji: "🟪", grad: "thumb-grad-1", prompt: "扁平矢量插画风格，简洁色块、几何造型、现代设计感" },
  { key: "cartoon", name: "卡通动漫", emoji: "🧑‍🎨", grad: "thumb-grad-5", prompt: "卡通动漫风格，鲜明轮廓、明快配色、可爱有活力" },
  { key: "lineart", name: "线描", emoji: "✏️", grad: "thumb-grad-6", prompt: "线描风格，黑白线条勾勒、简洁干净、素描质感" },
  { key: "engraving", name: "版画", emoji: "🗿", grad: "thumb-grad-3", prompt: "版画风格，强烈黑白对比、刀刻肌理、复古质朴" },
  { key: "photo", name: "写实摄影", emoji: "📷", grad: "thumb-grad-4", prompt: "写实摄影风格，真实光影、高细节、商业级质感" },
  { key: "pattern", name: "纹样", emoji: "🔴", grad: "thumb-grad-2", prompt: "传统纹样风格，对称装饰图案、吉祥纹饰、东方美学" },
];

/* ---------- 海报专用尺寸（活动·成图类型选「海报」时的「图片尺寸」下拉） ----------
   首项「自定义」点选后展示宽×高输入框；其后为 px 比例组与 cm 实物海报组。
   size 字段为副值展示用；实际出图尺寸由 ImageEditor 按 name 解析为像素。 */
export const posterRatios: SizePreset[] = [
  { name: "自定义", size: "自定义宽高", ico: "szSquare" },
  // —— px 比例组 ——
  { name: "竖版9:16", size: "1080 × 1920 px", ico: "szPortrait" },
  { name: "横版16:9", size: "1920 × 1080 px", ico: "szLandscape" },
  { name: "竖版3:4", size: "1080 × 1440 px", ico: "szPortrait" },
  { name: "横版4:3", size: "1440 × 1080 px", ico: "szLandscape" },
  { name: "方版1:1", size: "1080 × 1080 px", ico: "szSquare" },
  { name: "电商海报竖版", size: "1200 × 1920 px", ico: "szPortrait" },
  { name: "电商海报横版", size: "1920 × 1200 px", ico: "szLandscape" },
  { name: "标准长图", size: "800 × 2000 px", ico: "szLong" },
  // —— cm 实物海报组 ——
  { name: "13*18cm海报", size: "13 × 18 cm", ico: "szPortrait" },
  { name: "19*25cm海报", size: "19 × 25 cm", ico: "szPortrait" },
  { name: "42*57cm海报", size: "42 × 57 cm", ico: "szPortrait" },
  { name: "50*70cm海报", size: "50 × 70 cm", ico: "szPortrait" },
  { name: "60*90cm海报", size: "60 × 90 cm", ico: "szPortrait" },
  { name: "57*84cm海报", size: "57 × 84 cm", ico: "szPortrait" },
];

/* ---------- 易拉宝专用尺寸（活动·成图类型选「易拉宝」时） ---------- */
export const rollupRatios: SizePreset[] = [
  { name: "自定义", size: "自定义宽高", ico: "szRollup" },
  { name: "标准易拉宝(2m)", size: "80 × 200 cm", ico: "szRollup" },
  { name: "标准易拉宝(1.8m)", size: "80 × 180 cm", ico: "szRollup" },
  { name: "X展架(1.6m)", size: "60 × 160 cm", ico: "szXstand" },
  { name: "X展架(1.8m)", size: "60 × 180 cm", ico: "szXstand" },
  { name: "门型展架(1.8m)", size: "80 × 180 cm", ico: "szRollup" },
  { name: "门型展架(2m)", size: "120 × 200 cm", ico: "szRollup" },
];

/* ---------- 宣传单专用尺寸（活动·成图类型选「宣传单」时） ---------- */
export const flyerRatios: SizePreset[] = [
  { name: "自定义", size: "自定义宽高", ico: "szA4" },
  { name: "A4单页", size: "210 × 297 mm", ico: "szA4" },
  { name: "A5单页", size: "148 × 210 mm", ico: "szA4" },
];

/* ---------- 图生图：图片处理预设（点击把对应提示词填入「修改需求」） ----------
   顺序即展示顺序（前 6 个直接显示，其余「更多预设选项」展开）。
   「不使用预设」点击则清空修改需求。 */
export const editPresets: { name: string; prompt: string }[] = [
  { name: "不使用预设", prompt: "" },
  { name: "生成相似图", prompt: "生成相似图" },
  { name: "细节修复", prompt: "细节修复" },
  { name: "变清晰", prompt: "将这张图片变清晰" },
  { name: "去除文字", prompt: "去除图片中的所有文字" },
  { name: "去水印", prompt: "去除画面中的水印" },
  { name: "换风格", prompt: "将图片改为XX风格" },
  { name: "相似字体", prompt: "按照图片中的字体生成“XXXX”文字" },
  { name: "删除元素", prompt: "删除XX内容" },
  { name: "增加元素", prompt: "在图片的XX位置增加一个XX内容" },
  { name: "改图片尺寸", prompt: "将图片扩展为XX:XX的尺寸" },
  { name: "提取线稿", prompt: "将图片转为黑白线稿图" },
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
  { key: "ModernSt", name: "ModernSt", cat: "现代体", preview: "M", img: "/webfont/ModernSt.png" },
  { key: "RetroBold", name: "RetroBold", cat: "现代体", preview: "R", img: "/webfont/RetroBold.png" },
  { key: "WaveBold", name: "WaveBold", cat: "现代体", preview: "W", img: "/webfont/WaveBold.png" },
  { key: "jiu_gong_kai_shu", name: "九宫楷书", cat: "现代体", preview: "九", img: "/webfont/jiu_gong_kai_shu.png" },
  { key: "yun_shan_xing_shu", name: "云山行书", cat: "书法体", preview: "云", img: "/webfont/yun_shan_xing_shu.png" },
  { key: "yun_liu_ti", name: "云流体", cat: "书法体", preview: "云", img: "/webfont/yun_liu_ti.png" },
  { key: "yun_ya_ti", name: "云涯体", cat: "书法体", preview: "云", img: "/webfont/yun_ya_ti.png" },
  { key: "yun_que_shou_shu", name: "云雀手书", cat: "书法体", preview: "云", img: "/webfont/yun_que_shou_shu.png" },
  { key: "jin_li", name: "今隶", cat: "现代体", preview: "今", img: "/webfont/jin_li.png" },
  { key: "fo_xi_fang_li", name: "佛系仿隶", cat: "书法体", preview: "佛", img: "/webfont/fo_xi_fang_li.png" },
  { key: "cu_xiao_ti", name: "促销体", cat: "艺术体", preview: "促", img: "/webfont/cu_xiao_ti.png" },
  { key: "xiu_yue_ti", name: "修悦体", cat: "现代体", preview: "修", img: "/webfont/xiu_yue_ti.png" },
  { key: "yuan_qi_cu_hei_ti", name: "元气粗黑体", cat: "现代体", preview: "元", img: "/webfont/yuan_qi_cu_hei_ti.png" },
  { key: "xie_yi_shu", name: "写意书", cat: "书法体", preview: "写", img: "/webfont/xie_yi_shu.jpg" },
  { key: "xie_yi_shou_shu", name: "写意手书", cat: "书法体", preview: "写", img: "/webfont/xie_yi_shou_shu.png" },
  { key: "dong_ri_ti", name: "冬日体", cat: "艺术体", preview: "冬", img: "/webfont/dong_ri_ti.png" },
  { key: "jin_yi_cao_shu", name: "净一草书", cat: "书法体", preview: "净", img: "/webfont/jin_yi_cao_shu.png" },
  { key: "ji_he", name: "几何", cat: "现代体", preview: "几", img: "/webfont/ji_he.png" },
  { key: "ji_he_hou_hei_ti", name: "几何厚黑体", cat: "现代体", preview: "几", img: "/webfont/ji_he_hou_hei_ti.png" },
  { key: "ji_he_dian_xian_ti", name: "几何点线体", cat: "现代体", preview: "几", img: "/webfont/ji_he_dian_xian_ti.png" },
  { key: "dao_feng_ti", name: "刀锋体", cat: "现代体", preview: "刀", img: "/webfont/dao_feng_ti.png" },
  { key: "qian_wei_yi_shu", name: "前卫艺术", cat: "艺术体", preview: "前", img: "/webfont/qian_wei_yi_shu.jpeg" },
  { key: "jian_qi_song", name: "剑气宋", cat: "现代体", preview: "剑", img: "/webfont/jian_qi_song.png" },
  { key: "nan_feng_shou_shu", name: "南风手书", cat: "书法体", preview: "南", img: "/webfont/nan_feng_shou_shu.png" },
  { key: "yin_he_ti", name: "印何体", cat: "现代体", preview: "印", img: "/webfont/yin_he_ti.png" },
  { key: "hou_mo_wang_ji_ti", name: "厚墨忘机体", cat: "书法体", preview: "厚", img: "/webfont/hou_mo_wang_ji_ti.jpg" },
  { key: "hou_zhuo_shou_shu", name: "厚拙手书", cat: "书法体", preview: "厚", img: "/webfont/hou_zhuo_shou_shu.png" },
  { key: "hou_hei_ti", name: "厚黑体", cat: "书法体", preview: "厚", img: "/webfont/hou_hei_ti.png" },
  { key: "cu_feng_kuang_cao", name: "周有赏月卷", cat: "书法体", preview: "周", img: "/webfont/cu_feng_kuang_cao.png" },
  { key: "he_feng", name: "和风", cat: "书法体", preview: "和", img: "/webfont/he_feng.png" },
  { key: "ge_te", name: "哥特", cat: "现代体", preview: "哥", img: "/webfont/ge_te.png" },
  { key: "shang_chao_ti", name: "商超体", cat: "艺术体", preview: "商", img: "/webfont/shang_chao_ti.png" },
  { key: "yuan_gun_gun_you_ti", name: "圆滚滚友体", cat: "现代体", preview: "圆", img: "/webfont/yuan_gun_gun_you_ti.png" },
  { key: "mo_zhi_shou_shu", name: "墨炙手书", cat: "书法体", preview: "墨", img: "/webfont/mo_zhi_shou_shu.png" },
  { key: "mo_hen_shou_shu", name: "墨痕手书", cat: "书法体", preview: "墨", img: "/webfont/mo_hen_shou_shu.png" },
  { key: "shou_shu", name: "墨迹榜书", cat: "书法体", preview: "墨", img: "/webfont/shou_shu.png" },
  { key: "xia_ri_ti", name: "夏日体", cat: "艺术体", preview: "夏", img: "/webfont/xia_ri_ti.png" },
  { key: "duo_cai", name: "多彩", cat: "艺术体", preview: "多", img: "/webfont/duo_cai.png" },
  { key: "tian_xing_shu", name: "天行书", cat: "书法体", preview: "天", img: "/webfont/tian_xing_shu.png" },
  { key: "tian_xing_cao_shu", name: "天行草书", cat: "书法体", preview: "天", img: "/webfont/tian_xing_cao_shu.png" },
  { key: "nv_shen_ti", name: "女神体", cat: "艺术体", preview: "女", img: "/webfont/nv_shen_ti.png" },
  { key: "bao_zi_ming", name: "宝子铭", cat: "书法体", preview: "宝", img: "/webfont/bao_zi_ming.png" },
  { key: "bao_xu_li_shu", name: "宝序隶书", cat: "现代体", preview: "宝", img: "/webfont/bao_xu_li_shu.png" },
  { key: "xiao_shi_ti", name: "小石体", cat: "书法体", preview: "小", img: "/webfont/xiao_shi_ti.png" },
  { key: "xiao_zhuan", name: "小篆", cat: "书法体", preview: "小", img: "/webfont/xiao_zhuan.png" },
  { key: "shan_hai_xiang_yun_kai", name: "山海祥云楷", cat: "书法体", preview: "山", img: "/webfont/shan_hai_xiang_yun_kai.png" },
  { key: "shan_ye_cao_shu", name: "山野草书", cat: "书法体", preview: "山", img: "/webfont/shan_ye_cao_shu.png" },
  { key: "huan_mei_ti", name: "幻魅体", cat: "现代体", preview: "幻", img: "/webfont/huan_mei_ti.png" },
  { key: "you_yuan_ti", name: "幼圆体", cat: "现代体", preview: "幼", img: "/webfont/you_yuan_ti.png" },
  { key: "gui_yun_xing_cao", name: "归云行草", cat: "书法体", preview: "归", img: "/webfont/gui_yun_xing_cao.png" },
  { key: "xing_hui", name: "形绘", cat: "艺术体", preview: "形", img: "/webfont/xing_hui.png" },
  { key: "jing_tang_bi", name: "惊堂笔", cat: "书法体", preview: "惊", img: "/webfont/jing_tang_bi.jpg" },
  { key: "jing_lan_shou_shu", name: "惊澜手书", cat: "书法体", preview: "惊", img: "/webfont/jing_lan_shou_shu.png" },
  { key: "xiu_yue_ti_2", name: "憨圆体", cat: "现代体", preview: "憨", img: "/webfont/xiu_yue_ti.png" },
  { key: "chou_xiang", name: "抽象", cat: "艺术体", preview: "抽", img: "/webfont/chou_xiang.png" },
  { key: "zhuo_mo_shou_shu", name: "拙墨手书", cat: "书法体", preview: "拙", img: "/webfont/zhuo_mo_shou_shu.png" },
  { key: "zhuo_pu", name: "拙朴", cat: "书法体", preview: "拙", img: "/webfont/zhuo_pu.png" },
  { key: "zhuo_bei_ti", name: "拙碑体", cat: "书法体", preview: "拙", img: "/webfont/zhuo_bei_ti.png" },
  { key: "zhuo_li_hei", name: "拙隶黑", cat: "现代体", preview: "拙", img: "/webfont/zhuo_li_hei.png" },
  { key: "gu_zhang_feng", name: "故障风", cat: "艺术体", preview: "故", img: "/webfont/gu_zhang_feng.png" },
  { key: "wen_ya_hei", name: "文雅黑", cat: "现代体", preview: "文", img: "/webfont/wen_ya_hei.png" },
  { key: "dou_jin_wei_kai", name: "斗金魏楷", cat: "书法体", preview: "斗", img: "/webfont/dou_jin_wei_kai.png" },
  { key: "duan_yun_ku_bi", name: "断云枯笔", cat: "书法体", preview: "断", img: "/webfont/duan_yun_ku_bi.png" },
  { key: "xin_gai_nian_ti", name: "新概念体", cat: "现代体", preview: "新", img: "/webfont/xin_gai_nian_ti.png" },
  { key: "fang_ya_wei_kai", name: "方雅魏楷", cat: "书法体", preview: "方", img: "/webfont/fang_ya_wei_kai.png" },
  { key: "shi_guang_ti", name: "时光体", cat: "艺术体", preview: "时", img: "/webfont/shi_guang_ti.png" },
  { key: "chun_ri_ti", name: "春日体", cat: "艺术体", preview: "春", img: "/webfont/chun_ri_ti.png" },
  { key: "qu_mei_ti", name: "曲美体", cat: "艺术体", preview: "曲", img: "/webfont/qu_mei_ti.png" },
  { key: "cao_quan_li", name: "曹全隶", cat: "书法体", preview: "曹", img: "/webfont/cao_quan_li.png" },
  { key: "wang_yue_shou_shu", name: "望月手书", cat: "书法体", preview: "望", img: "/webfont/wang_yue_shou_shu.png" },
  { key: "mu_ke_ban_hua_ti", name: "木刻版画体", cat: "现代体", preview: "木", img: "/webfont/mu_ke_ban_hua_ti.png" },
  { key: "song_yan_ti", name: "松烟体", cat: "书法体", preview: "松", img: "/webfont/song_yan_ti.png" },
  { key: "song_xue_xing_shu", name: "松雪行书", cat: "书法体", preview: "松", img: "/webfont/song_xue_xing_shu.png" },
  { key: "ku_mo_cao_shu", name: "枯墨糙书", cat: "书法体", preview: "枯", img: "/webfont/ku_mo_cao_shu.png" },
  { key: "ku_bi", name: "枯笔", cat: "书法体", preview: "枯", img: "/webfont/ku_bi.png" },
  { key: "meng_huan", name: "梦幻", cat: "艺术体", preview: "梦", img: "/webfont/meng_huan.png" },
  { key: "ye_nai_ti", name: "椰奶体", cat: "现代体", preview: "椰", img: "/webfont/ye_nai_ti.png" },
  { key: "ci_dai_hei_ti", name: "次代黑体", cat: "现代体", preview: "次", img: "/webfont/ci_dai_hei_ti.png" },
  { key: "mao_rong_rong", name: "毛茸茸", cat: "艺术体", preview: "毛", img: "/webfont/mao_rong_rong.jpeg" },
  { key: "min_yun_hou_di_hei", name: "民韵厚底黑", cat: "现代体", preview: "民", img: "/webfont/min_yun_hou_di_hei.png" },
  { key: "min_yun_hou_hei", name: "民韵厚黑", cat: "现代体", preview: "民", img: "/webfont/min_yun_hou_hei.png" },
  { key: "han_li_ku_tuo_ti", name: "汉隶枯拓体", cat: "书法体", preview: "汉", img: "/webfont/han_li_ku_tuo_ti.png" },
  { key: "jiang_wan_shou_shu", name: "江晚手书", cat: "书法体", preview: "江", img: "/webfont/jiang_wan_shou_shu.png" },
  { key: "jiang_hu_shou_shu", name: "江湖手书", cat: "书法体", preview: "江", img: "/webfont/jiang_hu_shou_shu.png" },
  { key: "po_mo", name: "泼墨", cat: "书法体", preview: "泼", img: "/webfont/po_mo.png" },
  { key: "huo_li_ti", name: "活力体", cat: "艺术体", preview: "活", img: "/webfont/huo_li_ti.png" },
  { key: "huo_po", name: "活泼", cat: "现代体", preview: "活", img: "/webfont/huo_po.png" },
  { key: "liu_yun_shou_shu", name: "流韵手书", cat: "书法体", preview: "流", img: "/webfont/liu_yun_shou_shu.png" },
  { key: "lang_tao_shou_shu", name: "浪涛手书", cat: "书法体", preview: "浪", img: "/webfont/lang_tao_shou_shu.png" },
  { key: "lang_cao_ti", name: "浪潮体", cat: "艺术体", preview: "浪", img: "/webfont/lang_cao_ti.png" },
  { key: "hai_dong_mo_shu", name: "海东墨书", cat: "书法体", preview: "海", img: "/webfont/hai_dong_mo_shu.png" },
  { key: "tu_ya", name: "涂鸦", cat: "艺术体", preview: "涂", img: "/webfont/tu_ya.png" },
  { key: "qing_ju_shu", name: "清居书", cat: "书法体", preview: "清", img: "/webfont/qing_ju_shu.png" },
  { key: "qing_shui_shou_shu", name: "清水手书", cat: "书法体", preview: "清", img: "/webfont/qing_shui_shou_shu.png" },
  { key: "qi_wa_shu", name: "漆瓦书", cat: "书法体", preview: "漆", img: "/webfont/qi_wa_shu.png" },
  { key: "shu_shi_xing_cao", name: "漱石行草", cat: "书法体", preview: "漱", img: "/webfont/shu_shi_xing_cao.png" },
  { key: "xiao_sa", name: "潇洒", cat: "现代体", preview: "潇", img: "/webfont/xiao_sa.png" },
  { key: "chao_yuan_ji_he_hei", name: "潮圆几何黑", cat: "现代体", preview: "潮", img: "/webfont/chao_yuan_ji_he_hei.png" },
  { key: "chao_ku", name: "潮酷", cat: "艺术体", preview: "潮", img: "/webfont/chao_ku.png" },
  { key: "dian_yu_xian_zhuan", name: "点玉纤篆", cat: "现代体", preview: "点", img: "/webfont/dian_yu_xian_zhuan.png" },
  { key: "yan_huo_zhi_bi", name: "烟火稚笔", cat: "现代体", preview: "烟", img: "/webfont/yan_huo_zhi_bi.png" },
  { key: "lang_hao", name: "狼毫", cat: "书法体", preview: "狼", img: "/webfont/lang_hao.png" },
  { key: "cu_feng_kuang_cao_2", name: "王福庵印", cat: "书法体", preview: "王", img: "/webfont/cu_feng_kuang_cao.png" },
  { key: "jia_gu_wen", name: "甲骨文", cat: "现代体", preview: "甲", img: "/webfont/jia_gu_wen.png" },
  { key: "shou_jin_ti", name: "瘦金体", cat: "书法体", preview: "瘦", img: "/webfont/shou_jin_ti.png" },
  { key: "xiang_he_kai", name: "相鹤楷", cat: "现代体", preview: "相", img: "/webfont/xiang_he_kai.png" },
  { key: "zhuan_shi_li", name: "砖石隶", cat: "书法体", preview: "砖", img: "/webfont/zhuan_shi_li.png" },
  { key: "po_feng_yong_shu", name: "破锋勇书体", cat: "书法体", preview: "破", img: "/webfont/po_feng_yong_shu.jpg" },
  { key: "li_yan_shou_shu", name: "砾岩手书", cat: "书法体", preview: "砾", img: "/webfont/li_yan_shou_shu.png" },
  { key: "xiu_li", name: "秀丽", cat: "书法体", preview: "秀", img: "/webfont/xiu_li.png" },
  { key: "qiu_ri_ti", name: "秋日体", cat: "艺术体", preview: "秋", img: "/webfont/qiu_ri_ti.png" },
  { key: "zhi_shou_tong_shu_ti", name: "稚手童书体", cat: "现代体", preview: "稚", img: "/webfont/zhi_shou_tong_shu_ti.png" },
  { key: "jian_shu_ti", name: "简书体", cat: "书法体", preview: "简", img: "/webfont/jian_shu_ti.png" },
  { key: "cu_hao", name: "粗毫", cat: "书法体", preview: "粗", img: "/webfont/cu_hao.png" },
  { key: "cu_li_fang_bei_ti", name: "粗粝方碑体", cat: "书法体", preview: "粗", img: "/webfont/cu_li_fang_bei_ti.png" },
  { key: "cu_feng_kuang_cao_3", name: "粗锋狂草", cat: "书法体", preview: "粗", img: "/webfont/cu_feng_kuang_cao.png" },
  { key: "xian_ya_hei", name: "纤雅黑", cat: "现代体", preview: "纤", img: "/webfont/xian_ya_hei.png" },
  { key: "xian_li_hei", name: "线隶黑", cat: "现代体", preview: "线", img: "/webfont/xian_li_hei.png" },
  { key: "xi_yuan_ti", name: "细圆体", cat: "现代体", preview: "细", img: "/webfont/xi_yuan_ti.png" },
  { key: "xi_yu_song_ti", name: "细雨宋体", cat: "现代体", preview: "细", img: "/webfont/xi_yu_song_ti.png" },
  { key: "xi_yu_xing", name: "细雨行", cat: "现代体", preview: "细", img: "/webfont/xi_yu_xing.jpg" },
  { key: "zi_zai_ji_yi_ti", name: "自在极意体", cat: "书法体", preview: "自", img: "/webfont/zi_zai_ji_yi_ti.png" },
  { key: "hua_rou_ti", name: "花柔体", cat: "现代体", preview: "花", img: "/webfont/hua_rou_ti.jpg" },
  { key: "cao_mang", name: "草莽", cat: "书法体", preview: "草", img: "/webfont/cao_mang.png" },
  { key: "meng_qu_yuan_hei_ti", name: "萌趣圆黑体", cat: "现代体", preview: "萌", img: "/webfont/meng_qu_yuan_hei_ti.png" },
  { key: "meng_qu_shou_hui_ti", name: "萌趣手绘体", cat: "现代体", preview: "萌", img: "/webfont/meng_qu_shou_hui_ti.png" },
  { key: "ying_xiao_ti", name: "营销体", cat: "艺术体", preview: "营", img: "/webfont/ying_xiao_ti.png" },
  { key: "xiao_ran_kai", name: "萧然楷", cat: "书法体", preview: "萧", img: "/webfont/xiao_ran_kai.png" },
  { key: "luo_yun_xing_cao", name: "落云行草", cat: "书法体", preview: "落", img: "/webfont/luo_yun_xing_cao.png" },
  { key: "lie_mo_ti", name: "裂墨体", cat: "书法体", preview: "裂", img: "/webfont/lie_mo_ti.png" },
  { key: "sai_bo", name: "赛博", cat: "现代体", preview: "赛", img: "/webfont/sai_bo.png" },
  { key: "qu_wei_ji_mu_ti", name: "趣味积木体", cat: "现代体", preview: "趣", img: "/webfont/qu_wei_ji_mu_ti.png" },
  { key: "ruan_yuan_ti", name: "软圆体", cat: "现代体", preview: "软", img: "/webfont/ruan_yuan_ti.png" },
  { key: "ruan_meng_shou_xie_ti", name: "软萌手写体", cat: "现代体", preview: "软", img: "/webfont/ruan_meng_shou_xie_ti.png" },
  { key: "chi_mo_ti", name: "迟墨体", cat: "书法体", preview: "迟", img: "/webfont/chi_mo_ti.png" },
  { key: "xiao_yao_bi", name: "逍遥笔", cat: "书法体", preview: "逍", img: "/webfont/xiao_yao_bi.png" },
  { key: "su_xie_tu_ya_ti", name: "速写涂鸦体", cat: "现代体", preview: "速", img: "/webfont/su_xie_tu_ya_ti.png" },
  { key: "yi_mo_ti", name: "逸墨体", cat: "书法体", preview: "逸", img: "/webfont/yi_mo_ti.png" },
  { key: "yi_chen_ti", name: "逸尘体", cat: "书法体", preview: "逸", img: "/webfont/yi_chen_ti.png" },
  { key: "yi_feng_shu_bi_ti", name: "逸风疏笔体", cat: "书法体", preview: "逸", img: "/webfont/yi_feng_shu_bi_ti.png" },
  { key: "zui_mo_xing", name: "醉墨行", cat: "书法体", preview: "醉", img: "/webfont/zui_mo_xing.png" },
  { key: "rui_rong_hei_ti", name: "锐融黑体", cat: "现代体", preview: "锐", img: "/webfont/rui_rong_hei_ti.png" },
  { key: "long_dong_cao_shu", name: "隆冬手书", cat: "书法体", preview: "隆", img: "/webfont/long_dong_cao_shu.png" },
  { key: "ku_mo_cao_shu_2", name: "隆基鹡鸰颂", cat: "书法体", preview: "隆", img: "/webfont/ku_mo_cao_shu.png" },
  { key: "xue_yun_shu", name: "雪云书", cat: "书法体", preview: "雪", img: "/webfont/xue_yun_shu.png" },
  { key: "feng_dong_xing", name: "风动行", cat: "书法体", preview: "风", img: "/webfont/feng_dong_xing.png" },
  { key: "feng_he_shou_shu", name: "风禾手书", cat: "书法体", preview: "风", img: "/webfont/feng_he_shou_shu.png" },
  { key: "mo_fang_biao_ti_hei", name: "魔方标题黑", cat: "现代体", preview: "魔", img: "/webfont/mo_fang_biao_ti_hei.png" },
];

/* ---------- AI 字体：参考灵感案例 ---------- */
export const fontCases: FontCase[] = [
  { text: "不羁制衣", cat: "书法体", tag: "行草", grad: "thumb-grad-1", img: "/fontcase/1.png" },
  { text: "纯粮酿造", cat: "书法体", tag: "狂草", grad: "thumb-grad-2", img: "/fontcase/2.png" },
  { text: "大块头烧烤", cat: "书法体", tag: "豪放行书", grad: "thumb-grad-3", img: "/fontcase/3.png" },
  { text: "匠心打造", cat: "书法体", tag: "行草", grad: "thumb-grad-4", img: "/fontcase/4.png" },
  { text: "悍椒辣椒酱", cat: "书法体", tag: "劲毫行草", grad: "thumb-grad-5", img: "/fontcase/5.png" },
  { text: "柚香唤醒", cat: "书法体", tag: "手写体", grad: "thumb-grad-6", img: "/fontcase/6.png" },
  { text: "初摘茶饼", cat: "书法体", tag: "粗毫", grad: "thumb-grad-1", img: "/fontcase/7.png" },
  { text: "檀香留驻", cat: "书法体", tag: "厚朴隶书", grad: "thumb-grad-2", img: "/fontcase/8.png" },
  { text: "元气满满", cat: "艺术体", tag: "卡通圆体", grad: "thumb-grad-3", img: "/fontcase/9.png" },
  { text: "咕噜果铺", cat: "艺术体", tag: "卡通圆体", grad: "thumb-grad-4", img: "/fontcase/10.png" },
  { text: "果蹦哒", cat: "艺术体", tag: "卡通", grad: "thumb-grad-5", img: "/fontcase/11.png" },
  { text: "叠序书架", cat: "现代体", tag: "厚黑", grad: "thumb-grad-6", img: "/fontcase/12.png" },
  { text: "几何美学", cat: "现代体", tag: "几何", grad: "thumb-grad-1", img: "/fontcase/13.png" },
  { text: "几何贴肤", cat: "现代体", tag: "粗黑", grad: "thumb-grad-2", img: "/fontcase/14.png" },
  { text: "静默制衣", cat: "现代体", tag: "厚黑", grad: "thumb-grad-3", img: "/fontcase/15.png" },
  { text: "港岩", cat: "书法体", tag: "粗毫", grad: "thumb-grad-4", img: "/fontcase/16.png" },
  { text: "山野之风", cat: "书法体", tag: "狂草", grad: "thumb-grad-5", img: "/fontcase/17.png" },
  { text: "茶香入心", cat: "书法体", tag: "行草", grad: "thumb-grad-6", img: "/fontcase/18.png" },
  { text: "邀君共醉", cat: "书法体", tag: "行草", grad: "thumb-grad-1", img: "/fontcase/19.png" },
  { text: "裁云", cat: "书法体", tag: "飞白", grad: "thumb-grad-2", img: "/fontcase/20.png" },
  { text: "松风山堂", cat: "书法体", tag: "行草", grad: "thumb-grad-3", img: "/fontcase/21.png" },
  { text: "采芝斋", cat: "书法体", tag: "行书", grad: "thumb-grad-4", img: "/fontcase/22.png" },
  { text: "浅饮山岚", cat: "书法体", tag: "行草", grad: "thumb-grad-5", img: "/fontcase/23.png" },
  { text: "晨曦蜜语", cat: "现代体", tag: "衬线宋", grad: "thumb-grad-6", img: "/fontcase/24.png" },
  { text: "倒转星河", cat: "现代体", tag: "花体宋", grad: "thumb-grad-1", img: "/fontcase/25.png" },
  { text: "幻笺", cat: "现代体", tag: "尖角宋", grad: "thumb-grad-2", img: "/fontcase/26.png" },
  { text: "幻旅家居服", cat: "现代体", tag: "花体宋", grad: "thumb-grad-3", img: "/fontcase/27.png" },
  { text: "酒酣意浓", cat: "书法体", tag: "行草", grad: "thumb-grad-4", img: "/fontcase/28.png" },
  { text: "墨池香茗", cat: "书法体", tag: "行书", grad: "thumb-grad-5", img: "/fontcase/29.png" },
  { text: "墨匠酒坊", cat: "书法体", tag: "粗毫", grad: "thumb-grad-6", img: "/fontcase/30.png" },
  { text: "墨染茶心", cat: "书法体", tag: "行草", grad: "thumb-grad-1", img: "/fontcase/31.png" },
  { text: "甜润诗篇", cat: "书法体", tag: "手写行楷", grad: "thumb-grad-2", img: "/fontcase/32.png" },
  { text: "豆匠人手札", cat: "书法体", tag: "粗毫行草", grad: "thumb-grad-3", img: "/fontcase/33.png" },
  { text: "蜂语手札", cat: "书法体", tag: "行草", grad: "thumb-grad-4", img: "/fontcase/34.png" },
  { text: "治愈好物", cat: "书法体", tag: "手写体", grad: "thumb-grad-5", img: "/fontcase/35.png" },
  { text: "电镀流影", cat: "艺术体", tag: "电镀金属", grad: "thumb-grad-6", img: "/fontcase/36.png" },
  { text: "定型如金属", cat: "艺术体", tag: "镭射金属", grad: "thumb-grad-1", img: "/fontcase/37.png" },
  { text: "无核散热", cat: "艺术体", tag: "液态金属", grad: "thumb-grad-2", img: "/fontcase/38.png" },
  { text: "半杯涂鸦", cat: "艺术体", tag: "潮酷涂鸦", grad: "thumb-grad-3", img: "/fontcase/39.png" },
  { text: "不羁背包客", cat: "艺术体", tag: "潮酷", grad: "thumb-grad-4", img: "/fontcase/40.png" },
];

/* ---------- AI 字体：字体故事（精选字体展示 + 立即使用） ---------- */
export const fontStories: FontStory[] = [
  { name: "民韵商标", cat: "艺术体", scene: "ink", title: "民韵商标", cover: "/fontstory/20260522001_cover.jpg", introduce: "/fontstory/20260522001_introduce.jpg" },
  { name: "稚手童书体", cat: "书法体", scene: "ink", title: "稚手童书体", cover: "/fontstory/20260522002_cover.jpg", introduce: "/fontstory/20260522002_introduce.jpg" },
  { name: "拙墨手书", cat: "书法体", scene: "ink", title: "拙墨手书", cover: "/fontstory/20260522003_cover.jpg", introduce: "/fontstory/20260522003_introduce.jpg" },
  { name: "浪潮体", cat: "艺术体", scene: "ink", title: "浪潮体", cover: "/fontstory/20260522004_cover.jpg", introduce: "/fontstory/20260522004_introduce.jpg" },
  { name: "云山行书", cat: "书法体", scene: "ink", title: "云山行书", cover: "/fontstory/20260522005_cover.jpg", introduce: "/fontstory/20260522005_introduce.jpg" },
  { name: "惊澜手书", cat: "书法体", scene: "ink", title: "惊澜手书", cover: "/fontstory/20260522006_cover.jpg", introduce: "/fontstory/20260522006_introduce.jpg" },
  { name: "元气粗黑体", cat: "现代体", scene: "ink", title: "元气粗黑体", cover: "/fontstory/20260522007_cover.jpg", introduce: "/fontstory/20260522007_introduce.jpg" },
  { name: "枯墨糙书", cat: "书法体", scene: "ink", title: "枯墨糙书", cover: "/fontstory/20260522008_cover.jpg", introduce: "/fontstory/20260522008_introduce.jpg" },
  { name: "枯墨行草", cat: "书法体", scene: "ink", title: "枯墨行草", cover: "/fontstory/20260522009_cover.jpg", introduce: "/fontstory/20260522009_introduce.jpg" },
  { name: "焦墨飞白", cat: "书法体", scene: "ink", title: "焦墨飞白", cover: "/fontstory/20260522011_cover.jpg", introduce: "/fontstory/20260522011_introduce.jpg" },
  { name: "童趣拙墨", cat: "书法体", scene: "ink", title: "童趣拙墨", cover: "/fontstory/20260522012_cover.jpg", introduce: "/fontstory/20260522012_introduce.jpg" },
  { name: "沧海行草", cat: "书法体", scene: "ink", title: "沧海行草", cover: "/fontstory/20260522013_cover.jpg", introduce: "/fontstory/20260522013_introduce.jpg" },
  { name: "斑墨拙体", cat: "书法体", scene: "ink", title: "斑墨拙体", cover: "/fontstory/20260522014_cover.jpg", introduce: "/fontstory/20260522014_introduce.jpg" },
  { name: "粗刻刀体", cat: "艺术体", scene: "ink", title: "粗刻刀体", cover: "/fontstory/20260522015_cover.jpg", introduce: "/fontstory/20260522015_introduce.jpg" },
  { name: "飞白行草", cat: "书法体", scene: "ink", title: "飞白行草", cover: "/fontstory/20260522016_cover.jpg", introduce: "/fontstory/20260522016_introduce.jpg" },
  { name: "山月手札", cat: "书法体", scene: "ink", title: "山月手札", cover: "/fontstory/20260522017_cover.jpg", introduce: "/fontstory/20260522017_introduce.jpg" },
  { name: "古拙方碑", cat: "现代体", scene: "ink", title: "古拙方碑", cover: "/fontstory/20260522018_cover.jpg", introduce: "/fontstory/20260522018_introduce.jpg" },
  { name: "顽墨体", cat: "书法体", scene: "ink", title: "顽墨体", cover: "/fontstory/20260522019_cover.jpg", introduce: "/fontstory/20260522019_introduce.jpg" },
  { name: "云舒圆意体", cat: "艺术体", scene: "ink", title: "云舒圆意体", cover: "/fontstory/20260522021_cover.jpg", introduce: "/fontstory/20260522021_introduce.jpg" },
  { name: "斩风体", cat: "艺术体", scene: "ink", title: "斩风体", cover: "/fontstory/20260522022_cover.jpg", introduce: "/fontstory/20260522022_introduce.jpg" },
  { name: "锐融黑体", cat: "现代体", scene: "ink", title: "锐融黑体", cover: "/fontstory/20260522023_cover.jpg", introduce: "/fontstory/20260522023_introduce.jpg" },
  { name: "山居手书", cat: "书法体", scene: "ink", title: "山居手书", cover: "/fontstory/20260522024_cover.jpg", introduce: "/fontstory/20260522024_introduce.jpg" },
  { name: "糙墨手书", cat: "书法体", scene: "ink", title: "糙墨手书", cover: "/fontstory/20260522025_cover.jpg", introduce: "/fontstory/20260522025_introduce.jpg" },
  { name: "拙圆体", cat: "艺术体", scene: "ink", title: "拙圆体", cover: "/fontstory/20260522026_cover.jpg", introduce: "/fontstory/20260522026_introduce.jpg" },
  { name: "清纹线韵体", cat: "现代体", scene: "ink", title: "清纹线韵体", cover: "/fontstory/20260522027_cover.jpg", introduce: "/fontstory/20260522027_introduce.jpg" },
  { name: "宋刻禅意体", cat: "书法体", scene: "ink", title: "宋刻禅意体", cover: "/fontstory/20260522028_cover.jpg", introduce: "/fontstory/20260522028_introduce.jpg" },
  { name: "无界方黑", cat: "现代体", scene: "ink", title: "无界方黑", cover: "/fontstory/20260522029_cover.jpg", introduce: "/fontstory/20260522029_introduce.jpg" },
  { name: "拙圆黑体", cat: "现代体", scene: "ink", title: "拙圆黑体", cover: "/fontstory/20260522031_cover.jpg", introduce: "/fontstory/20260522031_introduce.jpg" },
  { name: "金国行草", cat: "书法体", scene: "ink", title: "金国行草", cover: "/fontstory/20260522032_cover.jpg", introduce: "/fontstory/20260522032_introduce.jpg" },
  { name: "凌厉手书", cat: "书法体", scene: "ink", title: "凌厉手书", cover: "/fontstory/20260522033_cover.jpg", introduce: "/fontstory/20260522033_introduce.jpg" },
  { name: "陇月行书", cat: "书法体", scene: "ink", title: "陇月行书", cover: "/fontstory/20260522034_cover.jpg", introduce: "/fontstory/20260522034_introduce.jpg" },
  { name: "散人书", cat: "书法体", scene: "ink", title: "散人书", cover: "/fontstory/20260522035_cover.jpg", introduce: "/fontstory/20260522035_introduce.jpg" },
  { name: "新黑几何体", cat: "现代体", scene: "ink", title: "新黑几何体", cover: "/fontstory/20260522036_cover.jpg", introduce: "/fontstory/20260522036_introduce.jpg" },
  { name: "逸飞行草体", cat: "书法体", scene: "ink", title: "逸飞行草体", cover: "/fontstory/20260522037_cover.jpg", introduce: "/fontstory/20260522037_introduce.jpg" },
  { name: "斫石体", cat: "艺术体", scene: "ink", title: "斫石体", cover: "/fontstory/20260522038_cover.jpg", introduce: "/fontstory/20260522038_introduce.jpg" },
  { name: "敦墨手书", cat: "书法体", scene: "ink", title: "敦墨手书", cover: "/fontstory/20260522039_cover.jpg", introduce: "/fontstory/20260522039_introduce.jpg" },
  { name: "残碑石刻体", cat: "书法体", scene: "ink", title: "残碑石刻体", cover: "/fontstory/20260522041_cover.jpg", introduce: "/fontstory/20260522041_introduce.jpg" },
  { name: "疾笔秋锋体", cat: "书法体", scene: "ink", title: "疾笔秋锋体", cover: "/fontstory/20260522042_cover.jpg", introduce: "/fontstory/20260522042_introduce.jpg" },
  { name: "墨韵写意体", cat: "书法体", scene: "ink", title: "墨韵写意体", cover: "/fontstory/20260522043_cover.jpg", introduce: "/fontstory/20260522043_introduce.jpg" },
];

/* ---------- AI 字体：生成历史（静态种子，类比 logoHistory） ---------- */
export const fontHistory: FontHistoryGroup[] = [
  {
    group: "今天",
    items: [
      {
        text: "安吉白茶",
        effect: "斗金魏楷",
        dir: "横向",
        desc: "为「安吉白茶」设计书法体艺术字，魏楷笔意、苍劲有力，适合茶礼包装与门头招牌。",
        results: [
          { grad: "thumb-grad-2", fav: true },
          { grad: "thumb-grad-1", fav: false },
          { grad: "thumb-grad-5", fav: false },
          { grad: "thumb-grad-3", fav: false },
        ],
      },
      {
        text: "竹乡好物",
        effect: "剑气宋",
        dir: "横向",
        desc: "为「竹乡好物」设计现代体艺术字，剑气宋瘦劲挺拔、质感分明，适合电商主图与品牌标语。",
        results: [
          { grad: "thumb-grad-6", fav: false },
          { grad: "thumb-grad-4", fav: false },
          { grad: "thumb-grad-2", fav: false },
          { grad: "thumb-grad-1", fav: false },
        ],
      },
    ],
  },
  {
    group: "昨天",
    items: [
      {
        text: "山野食集",
        effect: "矻石体",
        dir: "竖向",
        desc: "为「山野食集」设计艺术体竖排字，矻石体粗犷有力、潮酷立体，适合市集海报与短视频封面。",
        results: [
          { grad: "thumb-grad-3", fav: false },
          { grad: "thumb-grad-5", fav: false },
          { grad: "thumb-grad-6", fav: false },
          { grad: "thumb-grad-4", fav: false },
        ],
      },
    ],
  },
];

/* ---------- 宣传图片：生成结果图的 AI 处理工具 ---------- */
export const imageTools: ImageTool[] = [
  { key: "enhance", name: "AI变清晰" },
  { key: "erase", name: "AI消除" },
  { key: "matting", name: "AI抠图" },
  { key: "expand", name: "AI扩图" },
  { key: "repair", name: "细节修复" },
  { key: "vector", name: "转矢量" },
];

export const imageResults: ImageResult[] = [
  { emoji: "🍃", tag: "方案 A · 清新", grad: "thumb-grad-1" },
  { emoji: "🌿", tag: "方案 B · 国风", grad: "thumb-grad-5" },
  { emoji: "🏔️", tag: "方案 C · 大气", grad: "thumb-grad-3" },
  { emoji: "✨", tag: "方案 D · 促销", grad: "thumb-grad-2" },
];

/* ---------- 活动 · 右侧案例画廊（未生成时展示；按左侧子类筛选） ----------
   预设案例已清空，等待后续填充真实内容。
   每项格式：{ emoji, sub（成图子类：海报/长图/菜单/易拉宝/宣传单）, name, grad, img? } */
export const activeGalleryItems: ActiveGalleryItem[] = [
  { sub: "宣传单", name: "香水产品宣传图", grad: "thumb-grad-1", img: "/poster-samples/20251219150028966406xict5e.jpg", w: 1242, h: 2208, prompt: "创作一张香水产品宣传图，呈现一瓶香水，瓶子是高级砂透明瓶子，里面是淡紫色的液体，以深色粗糙木板作垫片，产品置于米色大理石石块，置于平静的水面上，右边有木料，有青苔，有雪松，有衣草，旁边点缀干枯的紫色植物，背景是渐变的灰紫色调，上面大面积留白，营造出高端、质感、胧，自然的氛围。整体打造出独特、凸显产品修护功效与高端品质的视觉效果，吸引注重肌肤修护、追求高品质护肤产品的消费者。" },
  { sub: "宣传单", name: "新中式禅意风格", grad: "thumb-grad-2", img: "/poster-samples/20251219155206556275bh8mcn.jpg", w: 1242, h: 2208, prompt: "新中式禅意风格，静谧雅致调性，平视视角，竖版构图。间面主体是一支点燃的米白色哑光陶瓷香薰蜡烛，置于堆叠的浅灰色岩石上;岩石位于浅米色水面中史，水面有蜡烛和岩石的清晰倒影，岩石左侧有一小淡绿色盆最植物，右侧有造型雅致的浅绿松树盆景延伸入回;蜡烛为米白色陶瓷材质，表面哑光细腻，正面矩形标签区域印有黑色文字\"SAINT\"\"AUGUST & PERS\"\"LONDON\"，火焰明亮;整体配色以米白、浅灰、淡绿为主，背最是纯米白色渐变，营造出宁静的东方美学氛围，光影细腻，质感写实，充满意与高级感。" },
  { sub: "宣传单", name: "在红色背景上有装饰和彩灯的圣", grad: "thumb-grad-3", img: "/poster-samples/20251219175905342092j5c2dj.jpg", w: 1242, h: 2208, prompt: "在红色背景上有装饰和彩灯的圣诞树。海报的顶部用大字写着“圣诞快乐”。它的风格是3D插图，3D渲染，高分辨率，以及非常详细和对称的构图。灯光柔和，色彩明亮，气氛喜庆。调色板是红色、白色和金色，给人一种电影般的感觉。" },
  { sub: "宣传单", name: "艺术感十足", grad: "thumb-grad-4", img: "/poster-samples/20251222150201108065evwftz.jpg", w: 1242, h: 2208, prompt: "艺术感十足，大师级作品，完美构图。左边留白放置黑体中文标题“智联万物.启新未来”，副标题为“2025 互联网科技生态大会”。右侧画面主体是一个浅蓝到深蓝半透明渐变色过渡的螺旋状立体结构，造型夸张，从右侧中间由小向右上方向延伸螺旋生长变大至画面外，每层略微重叠，板块之间有明显的层次感、立体感与纵深感。结构表面光滑且带有光泽，呈现出渐变的蓝色调，增强了视觉的深度与质感。玻璃质感，背景是浅蓝色的渐变背景，带有柔和的线条纹理，与主体形成和谐的色彩搭配，整体给人一种科技、未来、流动的感觉。纹理光滑细腻，表面光亮，赋予图像一种现代而未来感。作品风格简约几何，强调简洁的线条和和谐的配色。" },
  { sub: "长图", name: "劳斯莱斯 2026 全新款的", grad: "thumb-grad-5", img: "/poster-samples/20251223153921706507udqknx.jpg", w: 1080, h: 5688, prompt: "帮我设计一个劳斯莱斯 2026 全新款的宣发长图； 整体设计风格：高贵的深蓝和白色； 车型：库里南，车身颜色深蓝色和白色双拼色； 字体采用：衬线体； 极简主义，不要任何的装饰元素，只需要凸高级感和文字的表达； 需要局部的特写镜头；" },
  { sub: "宣传单", name: "“设计‘地球一小时’公益海报", grad: "thumb-grad-6", img: "/poster-samples/20251225143202617562fe2mzh.jpg", w: 1080, h: 1920, prompt: "“设计‘地球一小时’公益海报，主色调为深绿 + 黑色，背景是夜晚城市轮廓（部分建筑熄灯）。中心用发光字体写‘关掉灯光 点亮地球’，配地球 + 灯泡的创意插画；左侧标注‘2025.03.29 20:30-21:30’；右侧列行动建议：‘关灯 1 小时’‘低碳出行’‘减少一次性用品’；底部加‘WWF 联合发起’标识，风格简约有冲击力，传递环保理念。”" },
  { sub: "宣传单", name: "“设计‘湖景楼盘开盘’海报", grad: "thumb-grad-1", img: "/poster-samples/202512251546312686458uijkp.jpg", w: 1080, h: 1920, prompt: "“设计‘湖景楼盘开盘’海报，主色调为蓝绿 + 浅棕，背景是湖景别墅实拍图（带阳光草坪）。顶部展示楼盘名称‘湖境壹号’，配‘城市湖居 理想生活’标语；主体分‘核心卖点’：‘一线湖景’‘全明户型’‘双语学区’‘商圈环绕’；右侧标注‘开盘时间：2025.08.08’‘认筹享 95 折’；底部放项目地址与咨询电话，风格高端舒适，突出宜居属性。”" },
  { sub: "宣传单", name: "“设计‘文学经典读书分享会’", grad: "thumb-grad-2", img: "/poster-samples/202512251516181258973mq1jx.jpg", w: 1080, h: 1920, prompt: "“设计‘文学经典读书分享会’海报，主色调为米黄 + 深棕，背景是翻开的书本纹理。中心用手写体写‘以书会友 共品经典’，配‘《百年孤独》主题分享’副标题；左侧标注‘主讲人：XX 文学教授’‘时间：2025.06.20 14:00’‘地点：XX 书店三楼’；右侧放书本插画与报名二维码；底部加‘限 20 人 需提前预约’提示，风格安静文艺，契合读书氛围。”" },
  { sub: "宣传单", name: "整体风格现代、极简", grad: "thumb-grad-3", img: "/poster-samples/20251225153650081304bh84jz.jpg", w: 1080, h: 1920, prompt: "整体风格现代、极简，以高对比的红白配色营造出热烈、纯粹的节日氛围。手绘线描香槟杯采用自然变化的线宽，体现流畅动感与轻盈感，搭配细致白色烟花点缀，提升画面活力。各文本信息分区明确，排版留白合理，视觉节奏清晰有序。背景渐变红色与点状星光营造出温馨中带有活力的欢庆感整体视觉简洁明快、充满现代感。" },
  { sub: "宣传单", name: "打造高级感的3C/电器类目海", grad: "thumb-grad-4", img: "/poster-samples/20251225154726126237fybah8.jpg", w: 1080, h: 1920, prompt: "打造高级感的3C/电器类目海报设计" },
  { sub: "宣传单", name: "极简朦胧意识流美学", grad: "thumb-grad-5", img: "/poster-samples/202512251604349712033swvxu.jpg", w: 1080, h: 1920, prompt: "极简朦胧意识流美学，高级排版海报，雅致淡金黄色艺术，模糊梦幻的抽象纹理，拉丝渐变效果，艺术概念风格，视觉柔和且充满静谧深沉感；画面右下角放主题字：主题字进行字体设计，极细宋体风格“桂影霜华”，文字进行错位穿插摆放，字体优雅细长，笔画尾部添加花体曲线，在文字间穿插，整体呈现东方诗意，探索非凡自然与微观世界的艺术化表达，画面上方小文案依次放“2026”“visual concept”“2026”，下方左边文案突出时间数字“TIME——09.23/09.26”，画面中融入小小字英文“Osmanthus Shadow Frost”“Oriental Visual Concept”“Autumn Equinox Culture New Expression”，最下角放版权信息：“Copyright 2024 OsmanthusLab. All Rights Reserved.”" },
  { sub: "宣传单", name: "典雅的艺术展览海报", grad: "thumb-grad-6", img: "/poster-samples/202512251628229555568qistj.jpg", w: 1080, h: 1920, prompt: "制作一个典雅的艺术展览海报" },
  { sub: "宣传单", name: "请帮我制作地产海报分享户型价", grad: "thumb-grad-1", img: "/poster-samples/20251226141229152394pj2l1o.jpg", w: 1080, h: 1920, prompt: "请帮我制作地产海报分享户型价值点海报以下信息由你来写 地产名称： 详细介绍（多一点）： 卖点优势： 联系电话：" },
  { sub: "易拉宝", name: "温暖活泼的微博创作者广告共享", grad: "thumb-grad-2", img: "/poster-samples/20260202173900324322jp19aq.jpg", w: 800, h: 2000, prompt: "温暖活泼的微博创作者广告共享计划年终活动海报，浅米色背景，橙黄渐变圆角标题栏，分为“入驻奖励”“成长任务”“查看成长任务的路径”三个模块。左上角是带人民币符号的3D金色金币，右上角是黑色加粗字体“广告共享计划 年终大动作”。每个模块用橙色对勾和序号标注步骤，“最高两个月的收益”“1.5倍的收入”“200元惊喜奖励金”等核心福利用橙色加粗突出。整体为清爽的卡片式布局，亲和力强，视觉吸引，面向创作者社群推广。" },
  { sub: "易拉宝", name: "2026 省考上岸计划 教", grad: "thumb-grad-3", img: "/poster-samples/20260202180212305382jtnrv8.jpg", w: 800, h: 2000, prompt: "生成一张 2026 省考上岸计划 教育培训类海报，风格专业、活力且具有说服力，吸引备考人群报名。 画面主体 标题区：顶部用醒目的渐变橙黄色艺术字突出 “2026 省考 上岸计划”，搭配 “搞定” 品牌标识，视觉冲击力强。 核心信息模块 明确标注 “行测 + 申论高端班”，并强调 “公考领域资深教师，平均授课经验 8 年以上”，建立专业信任。 课程阶段：用橙黄色渐变卡片式布局，分模块列出： 导学摸底（7 + 课时）：知考情、识大纲，快速入门备考 理论精讲（100 + 课时）：零基础起步，全面夯实知识基底 强化拔高（40 + 课时）：重点聚焦，针对性强化训练 巩固刷题（30 + 课时）：提速提质，实现学以致用 核心优势：用实景配图 + 文字说明，突出： 配套完备：精编资料一站式备齐，省心备考无遗漏 全新体系：重回高三学习状态，营造沉浸式备考氛围 排版：采用上下分层的视觉结构，标题区、人物区、课程区、优势区、信息区清晰分隔，信息层级一目了然。 底部信息：包含机构地址、联系电话，右下角放置二维码，方便用户扫码咨询。" },
  { sub: "易拉宝", name: "极简风格的艺术留学公开课海报", grad: "thumb-grad-4", img: "/poster-samples/202602030951225753533awfz7.jpg", w: 800, h: 2000, prompt: "极简风格的艺术留学公开课海报，浅灰白到渐变蓝的背景，右侧用蓝色细线条勾勒“LAC×Roys”字母艺术装饰。顶部是课程标题「LAC×Roys 「艺术+空间」本科留学介绍 &「雅思口语」突击课」，标注课程时间。中间是嘉宾头像+简介列表，底部是课程流程和二维码，整体排版干净、信息层级清晰，视觉简约高级。" },
  { sub: "易拉宝", name: "科技感校招海报", grad: "thumb-grad-5", img: "/poster-samples/20260203110400782583nzlt30.jpg", w: 800, h: 2000, prompt: "科技感校招海报，整体为渐变蓝色调，右上角有透明质感的向上箭头装饰。顶部是“2021校招启动”标签，主标题用白色加粗字体写“等你一起 创造新世界”。中间分模块展示“校招岗位”“福利待遇”“时间地点”，每个模块用浅蓝色圆形点作为项目符号，底部有二维码和品牌LOGO，整体风格年轻活力，信息层次清晰。" },
  { sub: "易拉宝", name: "公益风志愿者招募长海报", grad: "thumb-grad-6", img: "/poster-samples/20260203111514201997jzif0o.jpg", w: 800, h: 2000, prompt: "公益风志愿者招募长海报，主色调为渐变蓝色，顶部是白色加粗标题“微医大病群 爱心志愿者招募”，搭配“奉献|互助|友爱|温暖”标语。上方是扁平风格的城市与医疗主题插画，包含人物、建筑、太阳等元素。中间白色内容区用简洁排版，介绍病友群背景、志愿者职责与荣誉，底部有二维码和微医品牌标识，整体风格温暖、专业且富有感染力。" },
  { sub: "易拉宝", name: "科技风活动长海报", grad: "thumb-grad-1", img: "/poster-samples/20260203112728539636be16n4.jpg", w: 800, h: 2000, prompt: "科技风活动长海报，浅灰渐变背景，顶部是火山引擎与豆包大模型的品牌标识，主标题为“2024火山引擎 AI创新巡展”，搭配英文副标题。中间是未来感城市插画，包含蓝紫色渐变的立体“A”字造型和摩天大楼。下方分模块展示“活动亮点”，用浅紫渐变卡片突出“科技前沿，触手可及”“行业实践，深度交流”“区域协同，创新驱动”，整体风格简约高级，充满科技感。" },
  { sub: "易拉宝", name: "潮流风插画课程长海报", grad: "thumb-grad-2", img: "/poster-samples/20260203113553149641k07u5v.jpg", w: 800, h: 2000, prompt: "潮流风插画课程长海报，以黑、深紫为主色调，顶部是“我们的设计日记”品牌标识和“WE DESIGN”白色粗体字，右侧是讲师的黑白人像。中间用紫色块分隔，展示讲师简介和“21天打卡日程安排”，分三周列出植物、动物、人物主题插画练习。底部橙色加粗字体显示打卡时间“5.10-5.30”，右侧配二维码，整体风格个性鲜明，信息层次清晰。" },
  { sub: "易拉宝", name: "科技感会议海报", grad: "thumb-grad-3", img: "/poster-samples/20260203143139350850d9yv6x.jpg", w: 800, h: 2000, prompt: "科技感会议海报，浅蓝渐变背景搭配透明流体装饰，顶部用加粗蓝色字体写“汇聚力量 乘胜而起”，副标题为“202X互联网流量峰会”。中间分模块展示会议时间、地点和讨论议程，底部配二维码，整体风格简约高级，信息清晰易读。" },
  { sub: "海报", name: "治愈清新风森之露洗发水海报", grad: "thumb-grad-4", img: "/poster-samples/20260204165107990130xe92i6.jpg", w: 1080, h: 1080, prompt: "治愈清新风森之露洗发水海报，以米白为背景，搭配天然岩石台与鲜橙切片。中央展示极简白瓶洗发水，瓶身印着品牌名；上方是“撩发即沦陷 治愈系橙香”的文案，突出“苦参控油”“丰盈蓬松”卖点；左侧用圆形标签标注“洗出蓬松感”，整体风格温柔治愈，突出产品的香氛与丰盈效果。" },
  { sub: "海报", name: "简约科技风米家声波扫振电动牙", grad: "thumb-grad-5", img: "/poster-samples/202602041724199902428j5nhr.jpg", w: 1080, h: 1080, prompt: "简约科技风米家声波扫振电动牙刷Pro新品海报，以浅灰渐变与质感展示台为背景，中央展示蓝、紫、白三款电动牙刷，突出智能屏显设计。上方是“米家声波扫振电动牙刷 Pro”的标题与“分面扫振专业清洁，智能屏显指导洁净加倍”的卖点，标注199元的首销价格与开售时间，整体风格简洁高级，突出产品的科技感与性价比。" },
  { sub: "海报", name: "极简科技风头戴式耳机电商海报", grad: "thumb-grad-6", img: "/poster-samples/20260205151245452052s6e2qk.jpg", w: 1080, h: 1080, prompt: "极简科技风头戴式耳机电商海报，以纯净白为背景，中央展示银白色头戴式耳机，突出其流畅的线条与柔软的耳罩质感。背景搭配细腻的声波波纹与渐变光影，营造沉浸听觉氛围。上方用简约字体标注「沉浸降噪·无感佩戴」，右侧用科技感标签突出「主动降噪」「HiFi音质」「30h超长续航」的卖点。底部用醒目的橙白撞色区域展示价格信息：「日常价：¥899 | 限时活动价：¥599 | 立省¥300」，并标注「晒单赠定制收纳包+一年质保」的促销福利，整体风格高级清爽，突出产品的科技感与高性价比。" },
  { sub: "海报", name: "参考我的产品图并保持产品细节", grad: "thumb-grad-1", img: "/poster-samples/20260205160504416511nr7cm5.jpg", w: 1080, h: 1080, prompt: "参考我的产品图并保持产品细节不便，帮我生成一张极简高级感WYE充电宝电商海报，以纯净白为背景，中央展示WYE品牌的白色充电宝，突出其顶部的纹理设计与电量显示灯条的细节。背景搭配柔和的渐变光影营造科技感，上方用简约字体标注「薄如卡片·电力满格」，右侧用精致标签突出「20000mAh大容量」「22.5W双向快充」「数显电量」的卖点。底部用撞色区域展示价格：「日常价：¥179 | 限时活动价：¥119 | 立省¥60」，并标注「下单赠快充线+30天免费试用」的促销福利，整体风格干净利落，突出产品的轻薄便携与高效充电体验。" },
  { sub: "菜单", name: "极简高级风咖啡酒吧菜单设计", grad: "thumb-grad-2", img: "/poster-samples/202602091023081923244xvzwy.jpg", w: 1440, h: 1920, prompt: "极简高级风咖啡酒吧菜单设计，浅灰纹理纸质感背景，顶部用粗体无衬线字体标注“Menu”，右上角搭配“HALFLAND”品牌标识与“COFFEE & WHISKEY”小字。菜单分为HAND PUNCH精选茶饮、SOFT DRINKS气泡水、COFFEE甜品、CAKE蛋糕四个板块，每个板块前配有简约手绘图标，菜品名称与价格采用清晰的左右对齐排版，整体风格黑白灰调，突出高级质感与清晰的阅读体验。" },
  { sub: "菜单", name: "极简高级风星巴克菜单设计", grad: "thumb-grad-3", img: "/poster-samples/20260209104056324561wrnj3j.jpg", w: 1440, h: 1920, prompt: "极简高级风星巴克菜单设计，浅灰纹理纸质感背景，顶部用绿色品牌色展示星巴克LOGO与“STARBUCKS”字样。菜单分为“精选咖啡”“冬季专属·其他饮品”两大板块，板块标题采用绿色字体并搭配细绿线分隔。饮品名称与热/冰饮价格采用清晰的三列对齐排版，整体风格干净利落，突出品牌调性与清晰的阅读体验。" },
  { sub: "菜单", name: "复古温馨风台式汤品店菜单设计", grad: "thumb-grad-4", img: "/poster-samples/202602091138334756043q2rz7.jpg", w: 1440, h: 1920, prompt: "复古温馨风台式汤品店菜单设计，浅米色做旧纸质感背景，搭配手绘花卉与美食实拍图点缀。顶部用简约线条LOGO标注“是真的汤”，菜单分为四大板块： 1. 汤品：人蔘雞湯、藥燉排骨湯、清燉牛花腱、香菇雞湯、剝皮辣椒雞湯、青木瓜排骨湯、高麗菜雞湯、何首烏雞湯； 2. 主食：原味鹹粿、醬燒雞腿飯、金沙富粿、豬腳飯、川辣鹹粿、滷汁淋飯、白飯； 3. 小菜：溏心蛋、燙青菜、麻油米血、柚香蘿萄、幼筍、煙燻豬耳朵、炸蝦天婦羅； 4. 飲品：微糖紅茶、無糖綠茶、可爾必思蘇打、古早味黑糖牛奶、謝絕買醉。 板块名称采用竖排书法字体，菜品名称与价格清晰对齐，底部标注营业时间、预订电话与外卖平台标识，整体风格温暖治愈，突出台式家常汤品的亲切质感。" },
  { sub: "菜单", name: "优雅意式餐厅午餐菜单设计", grad: "thumb-grad-5", img: "/poster-samples/202602091407084091565dwr2s.jpg", w: 1440, h: 1920, prompt: "优雅意式餐厅午餐菜单设计，浅米色纹理纸质感背景，顶部用复古衬线字体标注“MIRI RESTAURANT LUNCH MENU”。菜单分为套餐区与单点区： 1. 套餐区：主餐可选意式番茄肉酱意面、海鲜烩饭、玛格丽特披萨，搭配田园蔬菜沙拉、特调饮品（柠檬气泡水/冰美式）、每日例汤； 2. 单点主菜：意式番茄肉酱意面、玛格丽特披萨、海鲜烩饭、黑椒牛排； 3. 小食：香炸薯角、凯撒沙拉、蒜香法棍； 4. 饮品：咖啡、红茶、橙汁。 采用中英双语排版，搭配菜品实拍图，整体风格优雅精致，突出意式午餐的仪式感。" },
  { sub: "菜单", name: "暖冬日式意面限定菜单设计", grad: "thumb-grad-6", img: "/poster-samples/2026020915231061696936pmjd.jpg", w: 1440, h: 1920, prompt: "暖冬日式意面限定菜单设计，浅米色做旧纸质感背景，搭配雪花元素营造冬日氛围，顶部标注“WINTER SPECIAL MENU 12月-2月冬限定菜单”。菜单包含三款具体意面： 1.  prime牛肉寿喜风意面：搭配广岛县向原农场温泉玉子或生鸡蛋，售价199，可加选精选套餐+20元，大份+35元，特大份+60元； 2.  牡蛎里芋奶油墨鱼意面：搭配扬州赤糖、越路生麦的土锅仕上，售价109元，可加选精选套餐+10日元，大份+35元，特大份+60元； 3.  蟹肉海老柠檬奶油意面：生ショートパスタのリガトーニにすっぱい蟹と海老、菊をあしらいました，售价109元，可加选精选套餐+10元。 搭配意面实拍图，整体风格温暖治愈，突出冬日限定的暖心美味。" },
  { sub: "菜单", name: "轻奢商务风午市套餐菜单设计", grad: "thumb-grad-1", img: "/poster-samples/2026020916115139311890yo73.jpg", w: 1440, h: 1920, prompt: "轻奢商务风午市套餐菜单设计，浅米色纹理纸质感背景，顶部用复古衬线字体标注“LUNCH SET 商業午餐”，并标注限时供应至14:00。菜单分为两大板块，包含具体菜名： 1. 主餐（任选1）：经典凯撒沙拉（290元）、经典起司培根牛肉堡（330元）、香草鸡腿排奶油青酱细扁面（340元）、清炒蒜味鲜虾海鲜细扁面（360元）、碳烤猪五花剥皮辣椒橄榄饭（360元）、炙烤牛排松露卡菲酱饭（390元）、炙烤顶级雪花牛排佐鳀鱼香草酱（570元），可加50元升级暖汤/饮品/甜点（3选2）； 2. 饮品/甜点/暖汤（任选2）：美式咖啡、精品锡兰红茶、季节果酱苏打、可口可乐、经典布朗尼、今日暖汤、原味拿铁（+90元）、红鸟脆鲜奶茶（+110元）、香醇伯爵鲜奶茶（+110元）、热带雨林水果茶（+110元）、焦糖海盐可颂松饼（+110元）。 搭配菜品实拍图，整体风格精致高级，突出商务午餐的仪式感与丰富选择。" },
  { sub: "长图", name: "科技浅蓝渐变风新能源政策解读", grad: "thumb-grad-2", img: "/poster-samples/202602101740251925371imfl8.jpg", w: 1080, h: 3688, prompt: "科技浅蓝渐变风新能源政策解读长图海报设计，采用浅蓝渐变背景搭配科技感圆环装饰，营造专业权威的氛围。顶部用蓝白渐变字体突出“最新能源政策解读”主题，下方分模块清晰呈现核心内容： **核心文件** - 为落实有关政策方案要求，完善能源消耗总量和强度调控，有关部门近日联合公布了《关于进一步做好原料用能不纳入能源消费总量控制有关工作的通知》（以下简称《通知》）。 **解读一：《通知》出台的背景** - 2021年底，中央经济工作会议明确提出原料用能不纳入能源消费总量控制，这是完善能源消耗总量和强度调控的重要举措，对积极稳妥推进碳达峰碳中和具有重要意义。 - 近年来，随着相关产业稳步发展，原料用能在我国能源消费中的占比持续提升。加快夯实能源消费统计中原料用能数据基础，在“十四五”节能目标责任评价考核中扣除原料用能，能够更加客观地反映我国能源消费实际情况，有效增强能源消费总量管理弹性，为高质量发展提供用能保障。 **解读二：如何准确把握原料用能不纳入能源消费总量控制有关政策要求** - 《通知》出台有利于保障高质量发展用能需求，为高水平项目合理用能提供保障，增强产业链韧性。 - 原料用能扣减不是放松对相关产业发展的要求，产业发展必须符合产业规划和政策，履行必要审批程序，在能效方面达到先进水平，有效控制碳排放和污染物排放。 - 相关产业要持续推动节能和提高能效，原料用能不纳入能源消费总量控制，并不意味着原料用能可以无限制、无效率地使用，节能审查、节能标准等仍将对原料用能消费提出要求。 整体风格专业清新，突出政策解读的权威性与指导性，同时用清晰的模块划分让复杂政策信息更易理解。" },
  { sub: "长图", name: "国潮喜庆风元宵游园打卡长图设", grad: "thumb-grad-3", img: "/poster-samples/20260211161731633183ox0mqw.jpg", w: 1080, h: 3688, prompt: "国潮喜庆风元宵游园打卡长图设计，大红+金色为主色调，搭配卡通汤圆、灯笼、中式屋檐等元宵元素，传统节日氛围浓厚。核心内容：标题“喜闹元宵”，游园打卡规则（签到领卡、集印章兑新年礼包），分模块展示庙会游戏区（投壶、捞金鱼）、民俗非遗区（捏面人、糖画）、彩绘花灯区，每个模块配对应实景图，文字说明参与规则。排版层次分明，中式卷轴/印章样式分区，突出元宵传统活动的趣味性与节日氛围感。" },
  { sub: "长图", name: "高端商务风出国留学服务海报设", grad: "thumb-grad-4", img: "/poster-samples/20260211170447468552jfkpu2.jpg", w: 1080, h: 3688, prompt: "高端商务风出国留学服务海报设计，深蓝主底色搭配红粉撞色，顶部嵌入欧洲城市建筑实景图，专业大气的留学服务风格。核心内容：标题“出国留学 大龙一站式服务”，分模块展示机构优势（出国考试、留学申请、海外就业、名企实习）、权威保障（金牌评估师个性化留学评估、全程督导习题讲解提分、多对一辅导提升竞争力、拒绝裸归进顶尖名企），底部标注二维码、咨询电话002-88888888、地址陕西大龙区大龙留学，扫码公众号客服在线解答。排版采用圆形图标+渐变卡片分区，字体高亮核心卖点，突出留学服务的专业性与权威性。" },
  { sub: "海报", name: "电压力锅电商促销海报设计", grad: "thumb-grad-5", img: "/poster-samples/20260225170726230656qsbljt.jpg", w: 1080, h: 1080, prompt: "电压力锅电商促销海报设计，高端商务风，整体采用深枪灰色+黑色为主色调，搭配红色促销元素点缀，质感高级且促销氛围鲜明。核心内容与布局： 1. 顶部：左上角白色“Panasonic 松下电器”品牌标识； 2. 核心卖点标题区（左侧）：超大号白色粗体字“15分钟一餐饭”“1键1餐·3菜同熟”；下方红色箭头引导，列出“触控双屏显示”“压出精华营养”两大核心功能； 3. 数据化卖点区（左侧中下部）：四个浅灰圆角矩形卡片，依次标注“2.0倍真高压”“5层厚釜 高效导热”“16重保障 安心使用”“70年悠久 电饭煲历史”；下方红色“送”字标识+“定制不锈钢蒸盒”文案，搭配蒸盒示意图； 4. 产品展示区（右侧视觉中心）：参考图主图产品，放置在深灰色纹理背景上，质感厚重；右上角红色圆角标，标注“5L”“适合1-8人”； 5. 底部促销与售后栏： - 左侧：黑色背景，白色“活动到手低至：”+超大号白色¥2099； - 右侧：红色通栏，白色粗体字“下单返100元红包”，搭配“100 专享红包”图标； - 最底部：黑色服务条，白色图标+文字标注“官方正品”“全国联保”“极速发货”； 整体画面光影沉稳，产品金属质感突出，卖点层级清晰，兼顾高端家电的品质感与电商大促的促销力度。" },
  { sub: "海报", name: "拉图嘉利干红葡萄酒宣传海报设", grad: "thumb-grad-6", img: "/poster-samples/20260225175126533521tn35qy.jpg", w: 1080, h: 1080, prompt: "拉图嘉利干红葡萄酒宣传海报设计，整体为高端银灰+酒红主色调，搭配极简几何背景，专业进口葡萄酒电商风格。核心内容与布局： 1. 顶部信息区： - 左上角：“赛尚名庄旗舰店”+英文“S AISHANG MINGZHUANG FLAGSHIP STORE”； - 中央：浅灰色英文“Chateau La Tour Carnet”，下方大号黑色粗体字“拉图嘉利干红”，再下方小字“法国·波尔多”； 2. 核心视觉区： - 右侧：拉图嘉利干红葡萄酒瓶（酒红色瓶身，带金色徽章与酒庄图案，标签标注“CHÂTEAU LA TOUR CARNET”“2017”等信息）； - 左侧：两个红色圆角标签，依次标注“酿酒顾问米歇尔·罗兰”“上梅多克古老酒庄之一”； 3. 底部服务与保障栏： - 左侧：SF顺丰快递标识+“EXPRESS 顺丰包邮”； - 右侧：红色通栏，白色粗体字“正品保证 假一罚十”； 整体画面层次分明，色彩以银灰+酒红为主，突出“法国波尔多、名庄品质”的高端调性，信息清晰专业，符合进口葡萄酒的宣传风格。" },
  { sub: "易拉宝", name: "腾讯会议展会邀请函竖版长图设", grad: "thumb-grad-1", img: "/poster-samples/20260227171450231700kiu1aj.jpg", w: 800, h: 2000, prompt: "腾讯会议展会邀请函竖版长图设计，整体采用深邃科技蓝渐变，搭配光感玻璃拟态（Frosted Glass）与几何光效，营造高端前沿的数字化视觉氛围。核心内容与严格布局： 1. 顶部品牌区：左上角白色“腾讯会议”Logo，下方超大号流光渐变立体字主标题“AI时代 会议新实践”； 2. 邀请信息区：半透明蓝色毛玻璃卡片，内印“诚邀您莅临”，核心信息“2023年北京InfoComm腾讯会议展区”，并标注时间（7月19-21日）、地点（北京国家会议中心），展位号用紫蓝渐变色块高亮标注“C馆CA1-01”“C馆CB1-01”； 3. 核心体验区：以“// 您将会在展区现场体验到 //”为引导，采用2列3行的网格布局，每个格子包含一个线性科技风图标+文字说明： - 第一行：最新自研AI音频与智能纪要能力、4K共享屏幕（游戏级实时动态臻彩效果）； - 第二行：腾讯天籁inside音频解决方案、混合式智慧教学实景； - 第三行：全新互动布局（超宽屏会议室）、行业大咖最新实践分享； 4. 底部转化区：“// 立刻扫码 预约VIP专属讲解 //”引导语，下方居中放置一个清晰的二维码； 整体风格极简、专业，光影层次丰富，突出AI与音视频技术的核心卖点，适合作为高规格B端展会的电子邀请函。" },
  { sub: "易拉宝", name: "雅艺德口腔连锁招聘海报设计", grad: "thumb-grad-2", img: "/poster-samples/20260227173307529019spowm3.jpg", w: 800, h: 2000, prompt: "雅艺德口腔连锁招聘海报设计，竖版排版，整体采用浅蓝渐变+白色主色调，搭配简约线条纹理，专业医疗行业招聘风格。核心内容与布局： 1. 顶部品牌区：左上角“YYD口腔连锁”品牌标识，右上角小字“邀您关心每一颗牙”； 2. 核心标题区： - 左侧：超大号黑色粗体艺术字“招聘”，叠加蓝色手写体“Recruit”； - 右侧：“雅艺德口腔连锁 期待你的加入”+英文“YYD KOUQIANG WELCOME TO JOIN US”，搭配喇叭图标； 3. 岗位信息区： - 半透明白色卡片内，以竖排蓝色竖线为分隔，依次列出5个岗位： 1. 口腔医生：薪资10000-50000元，要求18-50周岁、善于沟通、大专及以上学历，有经验优先； 2. 口腔护士：薪资4500-10000元，要求18-50周岁、善于沟通、大专及以上学历，有经验优先； 3. 抖音拍摄：薪资5000-12000元，要求18-30周岁、会拍摄剪辑、有经验优先； 4. 行政前台：薪资3500-8000元，要求18-30周岁、160cm以上女性、形象气质佳； 5. 服务文员：薪资3500-6000元，要求18-30周岁、160cm以上女性、形象气质佳； - 每个岗位右侧配有蓝色箭头图标； 4. 底部信息栏： - 电话“6060 1010”+地址“江苏苏州市青商大厦富成商务中心三楼”； - 底部小字“分享好作品 天天拿收益”； 整体画面清新专业，字体层级分明，符合口腔医疗行业的严谨与亲和力调性。" },
  { sub: "海报", name: "全自动扫拖洗扫地机器人促销海", grad: "thumb-grad-3", img: "/poster-samples/20260302145711922703x3mjy4.jpg", w: 1080, h: 1080, prompt: "全自动扫拖洗扫地机器人促销海报设计，整体为浅米白+暖棕主色调，搭配现代家居场景，专业智能家电电商风格。核心内容与布局： 1. 背景：浅米色竖纹墙面+浅木色台面，营造现代家居氛围； 2. 核心视觉区： - 顶部：大号黑色粗体字“全自动扫拖洗！这台扫地机承包全屋清洁”，下方浅米色圆角标签标注“自动集尘 | 热水洗拖 | 精准避障”； - 左侧：三个深棕色圆角标签，依次标注“实力工厂”“超长待机”“纯铜电机”； - 中央：参考图主图产品； 3. 底部促销栏： - 左侧：浅米色块“促销活动价”+超大号黑色“¥2199”； - 右侧：深棕色通栏，白色粗体字“限时付定立减100元”； 整体画面层次分明，色彩以浅米白+暖棕为主，突出“全自动扫拖洗、承包全屋清洁”的核心卖点，促销信息醒目清晰，符合智能家电的专业现代调性。" },
];

/* ---------- 商拍：参考灵感案例（按子类筛选，结构同活动；占位 emoji，真图后补 img） ---------- */
export const productGalleryItems: ActiveGalleryItem[] = [
  { emoji: "🫙", sub: "白底商品图", name: "蜂蜜白底主图", grad: "thumb-grad-1" },
  { emoji: "🍵", sub: "白底商品图", name: "茶叶礼盒白底图", grad: "thumb-grad-5" },
  { emoji: "🍶", sub: "白底商品图", name: "土特产酱料白底图", grad: "thumb-grad-3" },
  { emoji: "🧴", sub: "白底商品图", name: "护肤瓶身白底图", grad: "thumb-grad-2" },
  { emoji: "🏞️", sub: "产品场景图", name: "高山茶园场景图", grad: "thumb-grad-3" },
  { emoji: "🍱", sub: "产品场景图", name: "农家美食桌景图", grad: "thumb-grad-6" },
  { emoji: "🪵", sub: "产品场景图", name: "原木质感氛围图", grad: "thumb-grad-4" },
  { emoji: "🛍️", sub: "产品场景图", name: "节日礼盒摆拍图", grad: "thumb-grad-1" },
  { emoji: "🔍", sub: "竖版细节图", name: "纹理特写细节图", grad: "thumb-grad-2" },
  { emoji: "💧", sub: "竖版细节图", name: "饮品质感细节图", grad: "thumb-grad-5" },
  { emoji: "🌾", sub: "竖版细节图", name: "原料成分细节图", grad: "thumb-grad-3" },
];

/* ---------- 店招设计：参考灵感案例（按子类筛选，结构同活动；占位 emoji，真图后补 img） ---------- */
export const signageGalleryItems: ActiveGalleryItem[] = [
  { emoji: "🏪", sub: "线上店招", name: "茶饮品牌线上店招", grad: "thumb-grad-1" },
  { emoji: "🛒", sub: "线上店招", name: "土特产旗舰店招", grad: "thumb-grad-5" },
  { emoji: "🎍", sub: "线上店招", name: "新中式生鲜店招", grad: "thumb-grad-3" },
  { emoji: "🍜", sub: "线上店招", name: "面馆外卖店招", grad: "thumb-grad-2" },
  { emoji: "🏮", sub: "实体门头", name: "国风茶馆门头", grad: "thumb-grad-6" },
  { emoji: "☕", sub: "实体门头", name: "社区咖啡门头", grad: "thumb-grad-4" },
  { emoji: "🥢", sub: "实体门头", name: "中式餐馆门头", grad: "thumb-grad-1" },
  { emoji: "🌿", sub: "实体门头", name: "农家乐招牌门头", grad: "thumb-grad-3" },
];

/* ---------- IP 创新设计：参考灵感案例 ----------
   先放 2 个示范案例，功能完整；后期人工往此数组追加即可（可补 img 真实图）。 */
export interface IpCase {
  name: string; // IP 名称
  cat: string; // 分类标签（如：吉祥物 / 拟人）
  desc: string; // 创意描述（点「制作同款」回填到左侧创意描述）
  colors?: string[]; // 偏好颜色（点「制作同款」一并回填）
  ratioName?: string; // 画面尺寸（点「制作同款」一并回填）
  emoji: string; // 无图时的占位 emoji
  grad: Grad; // 卡片背景渐变
  img?: string; // 真实案例图（在 public 下），有则优先于 emoji
}

export const ipCases: IpCase[] = [
  {
    name: "稻小金",
    cat: "农业吉祥物",
    emoji: "🌾",
    grad: "thumb-grad-1",
    colors: ["#E8B84B", "#F5EFE0"],
    ratioName: "正方形 1:1",
    img: "/ipcase/daoxiaojin.png",
    desc: "「稻小金」——拟人化金色稻穗，头戴竹编斗笠，圆眼弯眉、憨厚微笑的 Q 版二头身少年。身穿米白与金黄拼接汉服马甲，袖口绣「丰」字纹，右手高举金色丰收镰刀，左手怀抱一捆稻穗。整体圆润亲和、色彩温暖明亮，扁平卡通风格，正方形居中构图，专属某县农业局品牌 IP。",
  },
  {
    name: "茶灵儿",
    cat: "文旅吉祥物",
    emoji: "🍵",
    grad: "thumb-grad-3",
    colors: ["#7FB069", "#F5EFE0"],
    ratioName: "正方形 1:1",
    img: "/ipcase/chalinger.png",
    desc: "「茶灵儿」——以高山云雾茶为灵感的清新少女 IP，绿色双丸子头点缀嫩芽发饰，眉眼弯弯、笑容甜美。身着青绿色改良汉服，腰系茶篓，手捧一杯热茶冒着袅袅热气。整体国风清新、色调以茶绿与米白为主，Q 版三头身、扁平插画风格，适合茶文旅品牌主视觉。",
  },
  {
    name: "竹宝宝",
    cat: "竹乡吉祥物",
    emoji: "🎋",
    grad: "thumb-grad-2",
    colors: ["#6FA84B", "#F2F0E6"],
    ratioName: "正方形 1:1",
    img: "/ipcase/zhubaobao.png",
    desc: "「竹宝宝」——以安吉翠竹与春笋为灵感的活泼男孩 IP，头顶冒出嫩绿小竹芽，圆脸大眼、笑容灿烂的 Q 版三头身。身着竹青色对襟短褂，背一只小竹篓，手握一截嫩笋。整体清新自然、色调以竹绿与米白为主，扁平卡通风格，正方形居中构图，适合竹乡文旅品牌主视觉。",
  },
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
