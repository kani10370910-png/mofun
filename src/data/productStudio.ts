import type { SizePreset } from "@/lib/types";

/* ============================================================
   商拍 · 商品出图台：竞品能力全集数据
   对标：美图设计室 / LinkPix / 图叮 / 易可图 / PixMiller
   ============================================================ */

export type ProductTaskKey =
  | "white"
  | "scene"
  | "detail"
  | "multi"
  | "cutout"
  | "refine"
  | "handheld"
  | "gift";

/** 商拍固定生图模型：即梦 Seedream（不提供前端切换） */
export const PRODUCT_IMAGE_MODEL = "Seedream-5.0-lite";

export interface ProductTask {
  key: ProductTaskKey;
  name: string;
  desc: string;
  needProduct: boolean; // 是否强制要求上传商品图
  tag?: string;
}

/** 左侧任务卡（竞品功能集合）——能力已全部收拢到换底抠图 */
export const productTasks: ProductTask[] = [
  { key: "cutout", name: "换底抠图", desc: "商品换背景 · 抠图/精修/溶图", needProduct: false, tag: "主图" },
];

/** 产地 / 生活场景预设（静态空景图在 public/productcase/，无 API 亦可展示与合成） */
export const productScenePresets: { name: string; prompt: string; img: string }[] = [
  { name: "高山茶园", prompt: "层叠茶垄与薄雾的高山茶园，自然晨光", img: "/productcase/scene-tea-garden.png" },
  { name: "竹林青石", prompt: "翠绿竹林边的青石台面，斑驳光影", img: "/productcase/scene-bamboo.png" },
  { name: "稻田秋收", prompt: "金黄稻田收获季，暖色自然光", img: "/productcase/scene-rice.png" },
  { name: "果园枝头", prompt: "果园枝头与木筐，户外柔光", img: "/productcase/scene-orchard.png" },
  { name: "山泉溪边", prompt: "清澈山泉溪石，清凉自然氛围", img: "/productcase/scene-spring.png" },
  { name: "农家餐桌", prompt: "农家粗陶餐桌，碗碟与餐布，烟火气", img: "/productcase/scene-table.png" },
  { name: "民宿窗台", prompt: "原木民宿窗台，窗外山景虚化", img: "/productcase/scene-homestay.png" },
  { name: "厨房料理", prompt: "明亮厨房台面，料理使用氛围", img: "/productcase/scene-kitchen.png" },
  { name: "原木静物", prompt: "原木桌面与竹编、粗陶点缀", img: "/productcase/scene-wood.png" },
  { name: "节日礼赠", prompt: "节日礼赠氛围，丝带点缀克制", img: "/productcase/scene-gift.png" },
];

export function productSceneImg(name: string): string | undefined {
  return productScenePresets.find((s) => s.name === name)?.img;
}

/** 多角度选项 */
export const productAngles: { key: string; name: string; prompt: string }[] = [
  { key: "origin", name: "原图视角", prompt: "保持与原图一致的拍摄视角，主体角度尽量不变" },
  { key: "right", name: "右侧视角", prompt: "右侧视角，展示商品右侧轮廓与结构细节" },
  { key: "left", name: "左侧视角", prompt: "左侧视角，展示商品左侧轮廓与结构细节" },
  { key: "back", name: "背面视角", prompt: "背面视角，突出背标、封口或背部结构" },
  { key: "custom", name: "自定义视角", prompt: "" },
];

/** AI 场景：白底 / 色底 / 产地场景统一入口 */
export const PRODUCT_AI_SCENE_WHITE = "纯白底";
export const PRODUCT_AI_SCENE_NONE = "不使用预设";
export const PRODUCT_AI_SCENE_COLOR = "纯色场景";
export const PRODUCT_AI_SCENE_UPLOAD = "上传补充图";

/** 换底抠图模式：AI 生成 / 套图多角度 / 本地抠图&精修 */
export type ProductBgMode =
  | "aiscene"
  | "aimulti"
  | "cutwhite"
  | "transparent"
  | "color"
  | "scene";

export type ProductBgPath = "ai" | "batch" | "local";

export const productBgModes: { key: ProductBgMode; name: string; desc: string; path: ProductBgPath }[] = [
  { key: "aiscene", name: "商品换背景", desc: "白底/色底/产地生活场景，实拍选填", path: "ai" },
  { key: "aimulti", name: "多角度", desc: "右侧/左侧/背面/自定义视角批量出图", path: "batch" },
  { key: "cutwhite", name: "抠图白底", desc: "本地抠图后铺白底", path: "local" },
  { key: "transparent", name: "透明底", desc: "PNG 抠图", path: "local" },
  { key: "color", name: "抠图色底", desc: "本地抠图后铺纯色", path: "local" },
  { key: "scene", name: "场景底", desc: "实拍溶图换景（须上传）", path: "local" },
];

export function isProductBgAi(mode: ProductBgMode): boolean {
  return mode === "aiscene";
}

export function isProductAiScenePreset(scenePreset: string): boolean {
  return scenePreset !== PRODUCT_AI_SCENE_COLOR;
}

/** 按 AI 场景选项拼装提示词（白底=白色场景，色底=纯色场景） */
export function buildAiScenePrompt(opts: {
  productName: string;
  desc: string;
  scenePreset: string;
  bgColor: string;
  scenePrompt?: string;
  hasRef?: boolean;
}): string {
  if (opts.scenePreset === PRODUCT_AI_SCENE_WHITE) {
    return buildProductPrompt({
      task: "white",
      productName: opts.productName,
      desc: opts.desc,
      hasRef: opts.hasRef,
    });
  }
  if (opts.scenePreset === PRODUCT_AI_SCENE_COLOR) {
    return buildProductPrompt({
      task: "white",
      productName: opts.productName,
      desc: opts.desc,
      solidBg: opts.bgColor,
      hasRef: opts.hasRef,
    });
  }
  return buildProductPrompt({
    task: "scene",
    productName: opts.productName,
    desc: opts.desc,
    scenePrompt: opts.scenePrompt,
    hasRef: opts.hasRef,
  });
}

export function aiSceneExpandSub(scenePreset: string): string {
  return isProductAiScenePreset(scenePreset) ? "产地场景" : "白底主图";
}

export function aiSceneJobLabel(scenePreset: string): string {
  if (scenePreset === PRODUCT_AI_SCENE_WHITE) return "商品换背景·白底";
  if (scenePreset === PRODUCT_AI_SCENE_COLOR) return "商品换背景·纯色";
  if (scenePreset === PRODUCT_AI_SCENE_UPLOAD) return "商品换背景·补充图";
  return `商品换背景·${scenePreset}`;
}

/** 参考灵感卡片 → 出图方式回填 */
export function productGalleryBgPatch(it: { sub: string; name: string }): {
  bgMode: ProductBgMode;
  scenePreset: string;
} {
  if (it.sub === "白底主图" || it.sub === "细节特写") {
    return { bgMode: "aiscene", scenePreset: PRODUCT_AI_SCENE_COLOR };
  }

  const preset = productScenePresets.find((p) => it.name.includes(p.name));
  if (preset) return { bgMode: "aiscene", scenePreset: preset.name };
  if (it.name.includes("民宿")) return { bgMode: "aiscene", scenePreset: "民宿窗台" };
  if (it.name.includes("竹林")) return { bgMode: "aiscene", scenePreset: "竹林青石" };
  return { bgMode: "aiscene", scenePreset: productScenePresets[0].name };
}

export function isProductBgLocalCut(mode: ProductBgMode): boolean {
  return mode === "cutwhite" || mode === "transparent" || mode === "color";
}

export function isProductBgNeedUpload(mode: ProductBgMode): boolean {
  return isProductBgLocalCut(mode) || mode === "scene";
}

export function isProductBgBatch(mode: ProductBgMode): boolean {
  return mode === "aimulti";
}

/** 实拍精修预设 */
export const productRefinePresets: { name: string; prompt: string }[] = [
  { name: "变清晰", prompt: "在不改变商品外观的前提下，将图片变清晰，提升细节锐度，去除噪点与模糊" },
  { name: "细节修复", prompt: "修复商品图瑕疵与破损感，补全细节，保持外观真实不过度美颜" },
  { name: "去文字", prompt: "去除图片中的所有文字与贴纸，保持商品主体完整" },
  { name: "去水印", prompt: "去除画面中的水印，自然补全背景" },
  { name: "生成相似图", prompt: "生成与参考商品图相似的商拍图，保留包装与主体" },
  { name: "提亮匀光", prompt: "均匀打光，提亮暗部，消除过曝，棚拍质感" },
];

export const productStudioSizes: SizePreset[] = [
  { name: "自定义", size: "自定义宽高", ico: "szSquare" },
  { name: "电商主图1:1", size: "800 × 800 px", ico: "szSquare" },
  { name: "方版1:1", size: "1080 × 1080 px", ico: "szSquare" },
  { name: "竖版3:4", size: "1080 × 1440 px", ico: "szPortrait" },
  { name: "竖版9:16", size: "1080 × 1920 px", ico: "szPortrait" },
];

/** 自定义场景描述 · 词库（主体 / 装饰 / 光线），tag 展示名，prompt 写入描述/出图 */
export type ProductDescLexCat = "主体" | "装饰" | "光线";

export const productDescLexicon: {
  key: ProductDescLexCat;
  items: { tag: string; prompt: string }[];
}[] = [
  {
    key: "主体",
    items: [
      { tag: "悬浮展示", prompt: "商品悬浮居中展示，轻微投影，棚拍电商构图" },
      { tag: "平铺俯拍", prompt: "俯拍平铺构图，商品置于画面中央，空间疏朗" },
      { tag: "模特佩戴", prompt: "真人模特自然佩戴或手持展示商品，突出使用感" },
      { tag: "手持特写", prompt: "手部特写托举商品，焦点在商品主体，背景虚化" },
      { tag: "3D渲染", prompt: "精致三维渲染质感，干净光滑，商业级建模打光" },
      { tag: "微距特写", prompt: "微距特写，材质纹理清晰，浅景深突出细节" },
    ],
  },
  {
    key: "装饰",
    items: [
      { tag: "热带植物", prompt: "点缀热带绿植叶片，清新衬托不抢主体" },
      { tag: "鲜花点缀", prompt: "少量鲜花点缀画面，色彩柔和克制" },
      { tag: "水珠", prompt: "表面细腻水珠，清爽通透质感" },
      { tag: "烟雾缭绕", prompt: "轻薄烟雾缭绕，氛围感但不遮挡商品" },
      { tag: "丝绸飘带", prompt: "丝绸飘带轻柔环绕，高级礼赠感" },
      { tag: "几何石膏", prompt: "几何石膏道具衬托，极简静物构图" },
      { tag: "光影斑驳", prompt: "窗影树影斑驳落在主体与台面，层次自然" },
      { tag: "竹叶", prompt: "竹叶点缀，东方清雅氛围" },
      { tag: "麦穗", prompt: "麦穗点缀，丰收农旅气息" },
      { tag: "露珠", prompt: "晨露般露珠附着，新鲜自然" },
    ],
  },
  {
    key: "光线",
    items: [
      { tag: "自然光", prompt: "柔和自然光，真实日光感" },
      { tag: "柔光箱", prompt: "柔光箱均匀打光，棚拍电商质感" },
      { tag: "硬光", prompt: "硬光高对比，轮廓分明有张力" },
      { tag: "侧逆光", prompt: "侧逆光勾勒边缘，立体通透" },
      { tag: "轮廓光", prompt: "轮廓光勾边，主体从背景中分离" },
      { tag: "霓虹光", prompt: "霓虹色光氛围，时尚夜景感克制使用" },
      { tag: "晨光", prompt: "清晨暖调晨光，清透柔和" },
      { tag: "夕阳", prompt: "夕阳暖金光，氛围温暖" },
    ],
  },
];

/** 描述文本中的标签名 → 展开提示词（出图时用） */
export function expandProductDescLexicon(desc: string): string {
  const raw = desc.trim();
  if (!raw) return "";
  const map = new Map<string, string>();
  for (const cat of productDescLexicon) {
    for (const it of cat.items) map.set(it.tag, it.prompt);
  }
  // 按标签长度降序，避免短词误伤长词
  const tags = [...map.keys()].sort((a, b) => b.length - a.length);
  let out = raw;
  for (const tag of tags) {
    const prompt = map.get(tag)!;
    if (out.includes(tag)) out = out.split(tag).join(prompt);
  }
  return out;
}

/** 商拍默认去 AI 感约束（所有生图任务固定追加，无前端开关） */
export const PRODUCT_DEAI_SUFFIX =
  "写实商业摄影，真实材质与微瑕保留，自然光影，非 CGI，非塑料感，非过度磨皮，像相机实拍";

/** 有商品实拍时追加：强制模型按参考图保主体，避免只跟文字跑偏 */
export const PRODUCT_REF_KEEP =
  "【必须严格保留参考图中的商品主体】外形、配色、材质、包装与标签细节与参考图一致，禁止换成其他商品或凭空改款；仅按任务要求调整背景、构图、光影与场景";

/** 按任务拼装出图 prompt（用户描述 + 任务约束；始终含去 AI 感） */
export function buildProductPrompt(opts: {
  task: ProductTaskKey;
  productName: string;
  desc: string;
  scenePreset?: string;
  scenePrompt?: string;
  anglePrompt?: string;
  packItem?: string;
  hasRef?: boolean;
  /** AI 色底时的背景色，如 #F5E6C8；缺省则白底 */
  solidBg?: string;
}): string {
  const name = opts.productName.trim();
  const base = opts.desc.trim() || (name ? `商品「${name}」` : "农旅特产商品");
  const subject = name && !base.includes(name) ? `商品「${name}」，${base}` : base;
  const anti = `，${PRODUCT_DEAI_SUFFIX}`;
  const scene = opts.scenePrompt?.trim() || "";
  const refPrefix = opts.hasRef ? `${PRODUCT_REF_KEEP}。基于参考商品图，` : "";
  const solid = opts.solidBg?.trim();

  switch (opts.task) {
    case "white":
      return solid
        ? `${refPrefix}${subject}，电商纯色底主图，均匀纯色背景 ${solid}，主体居中，四边留白均匀，柔和棚拍光，干净轻微投影，无道具堆砌，无文字水印${anti}`
        : `${refPrefix}${subject}，电商纯白底主图，主体居中，四边留白均匀，柔和棚拍光，干净轻微投影，无道具堆砌，无文字水印${anti}`;
    case "scene":
      return `${refPrefix}${subject}，置于${scene || "真实农旅产地场景"}，产品为主体环境为辅，光影投影方向一致，展示氛围图不过度夸大成色${anti}`;
    case "detail":
      return `${refPrefix}${subject}，微距细节特写，材质纹理清晰可读，浅景深，竖版卖点图质感${anti}`;
    case "multi":
      return `${refPrefix}${subject}，${opts.anglePrompt || "正面平视"}，电商商品多角度展示，背景简洁，棚拍光${anti}`;
    case "gift":
      return `${refPrefix}${subject}，农旅伴手礼礼盒摆拍，可微开展示，竹编土布丝带点缀克制，礼品感${anti}`;
    case "handheld":
      return `${refPrefix}人物双手自然托持或展示${subject}，半身或手部特写，农旅生活感，面容友好，背景虚化产地或民宿，商品标签朝向镜头清晰${anti}`;
    case "cutout":
    case "refine":
      return (opts.hasRef ? `${PRODUCT_REF_KEEP}。` : "") + subject + anti;
    default:
      return (opts.hasRef ? `${PRODUCT_REF_KEEP}。` : "") + subject + anti;
  }
}

/** 任务 → LLM 扩写用的 eventSub 名（复用 t2i-product 模板） */
export function taskToExpandSub(task: ProductTaskKey, packItem?: string): string {
  const t = task;
  const map: Record<string, string> = {
    white: "白底主图",
    scene: "产地场景",
    detail: "细节特写",
    multi: "白底主图",
    gift: "礼盒套图",
    handheld: "生活场景",
    cutout: "白底主图",
    refine: "白底主图",
  };
  return map[t] || "白底主图";
}
