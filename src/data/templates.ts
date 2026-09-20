import type { Template, TemplateType } from "@/lib/types";
import { mergeTemplates, templatesFromInspiration } from "@/data/templatesFromInspiration";

/* ---------- 模版库 ----------
   三级筛选：场景（行1）→ 类型（行2）→ 子类（行3，随类型切换）
   数据 = 各功能页「参考灵感」全量 + 下方精选热门（同名精选覆盖）
*/
export const templateScenes: string[] = ["全部", "农产品", "农家乐·民宿", "旅游景点", "节庆活动", "电商推广", "社交媒体", "招商宣传", "政策科普"];

export const templateTypes: TemplateType[] = [
  { key: "all", name: "全部" },
  { key: "content", name: "文案策划" },
  { key: "image", name: "品牌设计" },
  { key: "video", name: "视频宣传" },
];

export const templateSubs: Record<"content" | "image" | "video", string[]> = {
  content: ["全部", "社媒推文", "公众号帮写", "品牌推广"],
  image: ["全部", "海报", "长图", "菜单", "易拉宝", "宣传单", "商拍", "logo", "IP设计", "AI字体", "店招设计"],
  video: ["全部", "一句话成片", "数字人模特", "制作大片"],
};

/** 精选热门（场景化命名）；与灵感全量合并后展示 */
const featuredTemplates: Template[] = [
  {
    emoji: "",
    name: "萧山杨梅上市海报",
    scene: "农产品",
    type: "image",
    sub: "海报",
    hot: true,
    uses: "1.2k",
    grad: "thumb-grad-1",
    img: "/active/haibao-baicha.png",
    fill: {
      eventSub: "海报",
      input:
        "萧山杨梅上市海报，以米白与洋红为主色，中央展示一筐紫红杨梅与枝头鲜果，背景杨梅林晨光。上方文案「初夏头茬 · 酸甜爆汁」，右侧标签突出「核小肉厚」「当日采摘」「产地直发」。底部标注开摘季与限量预订，整体清新时令，写实商业摄影质感。",
    },
  },
  {
    emoji: "",
    name: "杨梅种草社媒推文",
    scene: "农产品",
    type: "content",
    sub: "社媒推文",
    hot: true,
    uses: "986",
    grad: "thumb-grad-2",
    img: "/active/xuanchuan-baicha.png",
    fill: {
      product: "萧山杨梅",
      brand: "杜家鲜果",
      audience: "喜欢应季鲜果的人",
      advantage: "萧山杜家杨梅林，初夏头茬，紫红饱满、核小肉厚、酸甜爆汁，当日采摘冷链直发",
      platforms: "微信朋友圈,小红书",
    },
  },
  {
    emoji: "",
    name: "竹乡风光一句话成片",
    scene: "旅游景点",
    type: "video",
    sub: "一句话成片",
    hot: true,
    uses: "2.3k",
    grad: "thumb-grad-5",
    img: "/active/changtu-lvyou.png",
    fill: {
      input:
        "竹乡风光宣传片：航拍翠竹海与云雾山峦，清晨茶园采茶、竹筏游湖、民宿窗景，暖色调浅景深，旁白突出「一竹一世界 · 到安吉看春天」",
    },
  },
  {
    emoji: "",
    name: "竹博园公众号帮写",
    scene: "旅游景点",
    type: "content",
    sub: "公众号帮写",
    hot: false,
    uses: "642",
    grad: "thumb-grad-6",
    img: "/active/changtu-wenlv.png",
    fill: {
      title: "走进中国竹乡：一座竹博园里的绿意中国",
      keywords: "安吉竹博园,竹文化,乡村旅游,亲子研学",
      input: "一座竹博园，半部绿意中国",
    },
  },
  {
    emoji: "",
    name: "高山笋干电商海报",
    scene: "电商推广",
    type: "image",
    sub: "海报",
    hot: true,
    uses: "1.5k",
    grad: "thumb-grad-1",
    img: "/active/haibao-sungan.png",
    fill: {
      eventSub: "海报",
      input:
        "极简高级感高山笋干电商海报，纯净浅米白背景，中央展示袋装/礼盒笋干，突出产地与干制工艺细节。上方标注「高山笋干 · 自然本味」，右侧标签「高山采挖」「日晒风干」「煲汤首选」。底部撞色促销区展示活动价与「下单赠试吃装」，风格干净利落，突出助农直供与高性价比。",
    },
  },
  {
    emoji: "",
    name: "笋干礼盒商拍图",
    scene: "电商推广",
    type: "image",
    sub: "商拍",
    hot: false,
    uses: "418",
    grad: "thumb-grad-3",
    img: "/productcase/scene-gift.png",
    fill: {
      input:
        "铁罐/礼盒装笋干商品白底主图，主体居中，标签清晰，柔和棚拍光，四周留白均匀，电商过审风格，写实摄影",
    },
  },
  {
    emoji: "",
    name: "农家乐店招设计",
    scene: "农家乐·民宿",
    type: "image",
    sub: "店招设计",
    hot: false,
    uses: "377",
    grad: "thumb-grad-5",
    img: "/signagecase/signage-farm.png",
    fill: {
      brand: "稻香农家乐",
      slogan: "田园食堂 · 预约有座",
      input:
        "横版电商店招，淘宝通栏比例，店铺名「稻香农家乐」大字居中，副文案「田园食堂 · 预约有座」，餐饮农家乐，简约高级，适合淘宝页头",
    },
  },
  {
    emoji: "",
    name: "乡村旅游长图",
    scene: "旅游景点",
    type: "image",
    sub: "长图",
    hot: false,
    uses: "529",
    grad: "thumb-grad-3",
    img: "/active/changtu-lvyou.png",
    fill: {
      eventSub: "长图",
      input:
        "国潮清新风乡村旅游打卡长图，茶绿+米白为主色，搭配竹林、茶垄、民宿、研学路线元素。标题「四季安吉 · 一竹一世界」，分模块展示游园打卡规则、竹海徒步、茶园体验、非遗工坊，每个模块配对应实景图与参与说明。排版层次分明，突出乡村文旅的趣味与氛围感。",
    },
  },
  {
    emoji: "",
    name: "鲜笋促销宣传单",
    scene: "电商推广",
    type: "image",
    sub: "宣传单",
    hot: true,
    uses: "1.1k",
    grad: "thumb-grad-5",
    img: "/active/xuanchuan-xiansun.png",
    fill: {
      eventSub: "宣传单",
      input:
        "鲜笋促销宣传单，主色调为嫩绿+浅米，背景是春笋与竹林实拍。顶部「春日鲜笋 · 产地直达」，主体分核心卖点：「当日采挖」「冷链保鲜」「煲汤炒菜皆宜」；右侧标注「尝鲜价」与下单福利；底部放产地地址与咨询电话，风格清新助农，突出时令鲜味。",
    },
  },
  {
    emoji: "",
    name: "杨梅季品牌推广文",
    scene: "节庆活动",
    type: "content",
    sub: "品牌推广",
    hot: false,
    uses: "284",
    grad: "thumb-grad-2",
    img: "/active/yilabao-chawenhua.png",
    fill: {
      product: "萧山杨梅季",
      brand: "杜家鲜果",
      audience: "文旅游客与鲜果爱好者",
      advantage: "开摘仪式、杨梅林研学、现摘现尝、限量鲜果礼盒",
      platforms: "微信朋友圈,小红书,抖音,微信公众号",
      input: "传递「一颗杨梅甜一方水土」的共富故事，邀约线下参节",
    },
  },
  {
    emoji: "",
    name: "和美乡村政策科普图",
    scene: "政策科普",
    type: "image",
    sub: "长图",
    hot: false,
    uses: "356",
    grad: "thumb-grad-6",
    img: "/active/changtu-zhengce.png",
    fill: {
      eventSub: "长图",
      input:
        "科技浅蓝渐变风和美乡村政策解读长图，浅蓝渐变背景搭配圆环装饰，专业权威氛围。顶部突出「和美乡村政策解读」主题，分模块呈现：核心文件背景、如何把握政策要求、农户可享惠民举措。风格专业清新，模块划分清晰，让政策信息更易理解。",
    },
  },
  {
    emoji: "",
    name: "茶乡国风 logo",
    scene: "农产品",
    type: "image",
    sub: "logo",
    hot: true,
    uses: "873",
    grad: "thumb-grad-4",
    img: "/logos/20251114_26.png",
    fill: {
      brand: "茶马贡茶",
      style: "经典徽章",
      input: "茶乡国风 logo，茶马古道意象与茶叶纹样结合，经典徽章构图，墨色与茶绿，适合茶品牌主标识",
    },
  },
  {
    emoji: "",
    name: "文旅推介数字人模特",
    scene: "旅游景点",
    type: "video",
    sub: "数字人模特",
    hot: false,
    uses: "612",
    grad: "thumb-grad-3",
    img: "/avatars/av1.jpg",
    fill: {
      input:
        "各位游客朋友大家好！欢迎来到竹乡安吉，这里山清水秀、四季如画。今天就由我带大家一起打卡竹海云雾、杨梅林与竹博园，走进自然、感受人文。",
    },
  },
  {
    emoji: "",
    name: "招商宣传制作大片",
    scene: "招商宣传",
    type: "video",
    sub: "制作大片",
    hot: false,
    uses: "495",
    grad: "thumb-grad-1",
    img: "/active/yilabao-zhaoshang.png",
    fill: {
      input:
        "区县招商宣传大片：航拍产业园与田园风光，企业访谈与落地项目镜头，字幕突出「区位优势 · 政策护航 · 共富机遇」",
    },
  },
  {
    emoji: "",
    name: "民宿菜单设计",
    scene: "农家乐·民宿",
    type: "image",
    sub: "菜单",
    hot: false,
    uses: "402",
    grad: "thumb-grad-2",
    img: "/active/caidan-zhongshi.png",
    fill: {
      eventSub: "菜单",
      input:
        "复古温馨风民宿农家菜单设计，浅米色做旧纸质感背景，搭配手绘花卉与家常菜实拍。顶部标注民宿名与「山野时令菜单」，分汤品、主食、小菜、饮品板块，菜名与价格清晰对齐，底部标注营业时间与预订电话，温暖治愈，突出田园家常质感。",
    },
  },
  {
    emoji: "",
    name: "招商推介易拉宝",
    scene: "招商宣传",
    type: "image",
    sub: "易拉宝",
    hot: false,
    uses: "318",
    grad: "thumb-grad-6",
    img: "/active/yilabao-zhaoshang.png",
    fill: {
      eventSub: "易拉宝",
      input:
        "科技风招商推介易拉宝，浅蓝渐变背景，顶部主标题「汇聚力量 共赴新程」，副标题区县投资峰会。中间分模块展示区位优势、产业政策、落地案例与对接方式，底部配二维码，整体简约高级，信息清晰易读。",
    },
  },
  {
    emoji: "",
    name: "茶旅节 AI 艺术字",
    scene: "节庆活动",
    type: "image",
    sub: "AI字体",
    hot: false,
    uses: "266",
    grad: "thumb-grad-4",
    img: "/fontcase/18.png",
    fill: {
      text: "茶香入心",
      effect: "云山行书",
      dir: "横向",
    },
  },
  {
    emoji: "",
    name: "杨梅 IP 形象设计",
    scene: "农产品",
    type: "image",
    sub: "IP设计",
    hot: true,
    uses: "734",
    grad: "thumb-grad-3",
    img: "/ipcase/chalinger.png",
    fill: {
      input:
        "「梅小圆」——以萧山杨梅为灵感的清新少女 IP，酒红双丸子头点缀杨梅发饰，眉眼弯弯、笑容甜美。身着浅粉改良汉服，腰系小果篓，手捧一颗紫红杨梅。整体清新时令、色调以洋红与米白为主，Q 版三头身、扁平插画风格，适合鲜果文旅品牌主视觉。",
      colors: "#7FB069,#F5EFE0",
      ratio: "正方形 1:1",
    },
  },
  {
    emoji: "",
    name: "政策科普社媒推文",
    scene: "政策科普",
    type: "content",
    sub: "社媒推文",
    hot: false,
    uses: "389",
    grad: "thumb-grad-5",
    img: "/active/changtu-zhengce.png",
    fill: {
      product: "和美乡村政策要点",
      brand: "区县宣讲",
      audience: "农户与村集体",
      advantage: "一图读懂惠民举措，报名线下宣讲会，咨询专员一对一答疑",
      platforms: "微信朋友圈,小红书",
    },
  },
  {
    emoji: "",
    name: "节庆活动一句话成片",
    scene: "节庆活动",
    type: "video",
    sub: "一句话成片",
    hot: true,
    uses: "1.0k",
    grad: "thumb-grad-2",
    img: "/active/haibao-shexiang.png",
    fill: {
      input:
        "杨梅季活动成片：开摘仪式鼓点、采果体验、市集烟火与游客打卡，喜庆暖色，字幕「初夏开摘 · 邀你来赴一场杨梅季」",
    },
  },
];

/** 用户指定的热门推荐（按名称命中灵感全量 / 精选） */
const HOT_PICKS: { name: string; uses: string }[] = [
  { name: "半杯涂鸦 · 潮酷涂鸦", uses: "269" },
  { name: "不羁背包客 · 潮酷", uses: "306" },
  { name: "不羁制衣 · 行草", uses: "663" },
  { name: "茶灵儿 IP 形象", uses: "589" },
  { name: "电压力锅电商促销海报设计", uses: "1.4k" },
  { name: "稻小金 IP 形象", uses: "552" },
  { name: "请帮我制作地产海报分享户型价", uses: "624" },
  { name: "温暖活泼的微博创作者广告共享", uses: "661" },
  { name: "香水产品宣传图", uses: "180" },
  { name: "竹宝宝 IP 形象", uses: "626" },
];

function applyHotPicks(list: Template[]): Template[] {
  const pick = new Map(HOT_PICKS.map((p) => [p.name, p.uses]));
  return list.map((t) => {
    const uses = pick.get(t.name);
    if (!uses) return { ...t, hot: false };
    return { ...t, hot: true, uses };
  });
}

export const templates: Template[] = applyHotPicks(
  mergeTemplates(
    featuredTemplates.map((t) => ({ ...t, hot: false })),
    templatesFromInspiration(),
  ),
);
