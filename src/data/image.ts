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
