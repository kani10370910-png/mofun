/* ============================================================
   服务端 LLM 封装：provider 预设 + prompt 组装 + OpenAI 兼容调用
   仅在服务端（Route Handler）使用，密钥绝不进前端 bundle。
   ============================================================ */
import type { GenerateRequest } from "@/lib/types";
import { buildIndustryResearchMessages } from "@/lib/agent/skills/prompts/industryResearch";
import { buildOfficialMessages } from "@/lib/agent/skills/prompts/officialArticle";
import {
  STUDIO_ASSET_TYPE_GUIDE_FALLBACK,
  STUDIO_ASSET_TYPE_GUIDES,
  STUDIO_SCRIPT_TYPE_DEFAULT,
  STUDIO_SCRIPT_TYPE_GUIDES,
  SYSTEM_STUDIO_ASSETS,
  SYSTEM_STUDIO_SCRIPT_PRO,
  SYSTEM_STUDIO_SHOT_SCRIPT,
  USER_STUDIO_ASSETS_FALLBACK,
  USER_STUDIO_SCRIPT_PRO_FALLBACK,
} from "@/lib/prompts";
import { resolveEventPromptKind } from "@/lib/eventPromptKind";

interface ProviderPreset {
  baseURL: string;
  model: string;
}

/* 各家国内模型的 OpenAI 兼容预设 */
const PROVIDERS: Record<string, ProviderPreset> = {
  deepseek: { baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  qwen: { baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  glm: { baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-plus" },
  ernie: { baseURL: "https://qianfan.baidubce.com/v2", model: "ernie-4.5-turbo-128k" },
  // 院平台 Token-Pool（需配合 LLM_BASE_URL + LLM_API_KEY；模型以 LLM_MODEL 为准）
  custom: { baseURL: "http://36.213.97.167:9112/v1", model: "qwen3.8-27b" },
};

export interface ResolvedProvider {
  baseURL: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

/** 读取环境变量，结合 provider 预设解析出最终配置。缺 Key 抛错。
 *  创建分镜（studio-shots）走 LLM_MODEL_PRO，其余默认 LLM_MODEL（qwen3.8-27b）。 */
const LLM_FLASH = "qwen3.8-27b";
const LLM_PRO = "deepseek-v4-pro";
const LLM_PRO_SCENES = new Set(["studio-shots", "studio-shot-script"]);
const LLM_LONG_SCENES = new Set(["studio-script-pro", "studio-script", "studio-shots", "studio-shot-script"]);

export function resolveProvider(scene?: string, modelOverride?: string): ResolvedProvider {
  const providerKey = (process.env.LLM_PROVIDER || "deepseek").toLowerCase();
  const preset = PROVIDERS[providerKey] ?? PROVIDERS.deepseek;

  const apiKey = process.env.LLM_API_KEY || "";
  const baseModel = process.env.LLM_MODEL || preset.model || LLM_FLASH;
  const model = modelOverride
    || (scene && LLM_PRO_SCENES.has(scene) ? (process.env.LLM_MODEL_PRO || LLM_PRO) : baseModel);
  const baseTimeout = Number(process.env.LLM_TIMEOUT_MS || 60000);
  return {
    baseURL: process.env.LLM_BASE_URL || preset.baseURL,
    model,
    apiKey,
    timeoutMs: scene && LLM_LONG_SCENES.has(scene) ? Math.max(baseTimeout, 180000) : baseTimeout,
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const TONE_HINT: Record<string, string> = {
  亲切口语: "用亲切、口语化的语气，像朋友聊天",
  专业权威: "用专业、权威、可信赖的语气",
  活泼种草: "用活泼、有感染力的种草语气，适合社媒",
  政务正式: "用正式、严谨、规范的政务语气",
  政企风: "用政企宣传口径，稳健、权威、条理清晰，适合政策解读与产业报道",
  娱乐风: "用轻松娱乐化表达，有节奏感和趣味，避免低俗",
  短剧风: "用短剧叙事感，冲突与转折明显，场景画面感强，适合连载阅读",
  情感文: "用细腻情感叙事，共情与温度并重，适合人文故事",
  干货科普: "用干货科普口吻，信息密度高、条理清楚、可操作，少空话",
};

function lengthHint(req: GenerateRequest): string {
  if (req.length === "精简") return "篇幅精简，约 60-100 字";
  if (req.length === "详尽") return "篇幅详尽充分";
  if (req.length === "标准") return "篇幅适中";
  if (req.length === "600-800字") return "全文约 600-800 字";
  if (req.length === "800-1200字") return "全文约 800-1200 字";
  if (req.length === "1200-2000字") return "全文约 1200-2000 字";
  if (req.length === "2000字以上") return "全文 2000 字以上，可分多小节展开";
  if (req.length && /^\d+$/.test(req.length)) return `字数约 ${req.length} 字`;
  return "篇幅适中";
}

/* IP 设计·创意描述优化的系统提示词（开头身份声明） */
const IP_SYSTEM_PROMPT = "你是一个专业的IP形象创意描述优化助手。";

/* IP 设计·优化规则（user 消息中的规则与输出格式部分，随有无参考图动态调整任务说明） */
const IP_RULES =
  "## 优化规则\n\n" +
  "1. **保留用户核心意图**，不改变形象的基本设定和风格方向\n" +
  "2. 若用户提供了偏好颜色，将其自然融入服饰、配色、色彩基调；**未提供则根据描述合理推断**\n" +
  "3. 若用户指定了画面尺寸，正方形时构图居中饱满，其他比例相应调整；**未提供则默认正方形构图**\n" +
  "4. **参考图片处理逻辑：**\n" +
  "   - **有参考图时**：识别图片中的造型、色彩、风格、姿态等视觉元素，将其与创意描述融合，冲突时以用户文字描述为主\n" +
  "   - **无参考图时**：忽略此项，完全依赖创意描述展开\n" +
  "5. **补全关键视觉要素**，按以下维度展开：\n" +
  "   - 整体造型（体型、姿态、构图）\n" +
  "   - 头部特征（发型、表情、五官风格）\n" +
  "   - 服饰配件（颜色、材质、细节）\n" +
  "   - 标志性道具或元素\n" +
  "   - 色彩基调\n" +
  "   - 风格定位（如：扁平插画风、Q版卡通、国潮风等）\n" +
  "6. **语言简洁精准**，避免抽象形容，多用可视化的具体描述\n" +
  "7. **字数控制在150字以内**\n" +
  "8. **画面中只能出现一个 IP 形象**：单一主体、单个角色，居中呈现；" +
  "严禁出现多个分身、多个角色、三视图/多视角拼图、角色阵列或重复形象。\n" +
  "9. **背景固定为纯白底**：必须写明「纯白背景 / 白底 / #FFFFFF」，并禁止纸张肌理、水彩晕染、纹理底、渐变底与场景环境；角色投影可极淡或不加。\n" +
  "10. **禁止画面文字**：不要把角色名称、标题、名牌、字幕或水印写进画面；角色名仅作文案设定。\n\n" +
  "## 输出格式\n\n" +
  "只输出优化后的中文画面描述一段。禁止思考过程、禁止 Draft、禁止字数统计、禁止复述规则、不要标题。";

/* ============================================================
   活动·文生图扩写：一份统一系统提示词。
   含通用画面优化（光影/元素/结构）+ 五类专属版式（海报/长图/菜单/易拉宝/宣传单）。
   由 user 侧「成图意图」或用户描述命中关键词时，套用对应专属小节；否则走通用优化。
   占位符：{{ user_input }} {{ county_name }} {{ image_ratio }} {{ art_style }}
   ============================================================ */
const T2I_EVENT_SYSTEM =
  "你是一名资深中文图像提示词导演与画面优化专家，服务于区县文旅、农特产推广、品牌视觉与活动宣传出图。\n" +
  "你的任务是：根据用户的简短输入及当前参数，扩写成一段高质量、可直接送入文生图模型的中文画面描述词。\n\n" +
  "【输入参数】\n用户描述：{{ user_input }}\n区县/地区：{{ county_name }}（若为空或未指定，则不强制融入地域元素）\n图片比例：{{ image_ratio }}\n画面风格：{{ art_style }}\n\n" +
  "【成图意图分流·先判定再扩写】\n" +
  "优先采用对话中给出的「成图意图」；若为「通用」或未给出，再根据用户描述自行判断是否属于下列五类之一。\n" +
  "判定关键词参考：海报/主视觉/招贴 → 海报；长图/详情长图/竖版长图 → 长图；菜单/菜谱/价目表 → 菜单；易拉宝/展架/门型展架 → 易拉宝；宣传单/单页/传单/折页 → 宣传单。\n" +
  "命中五类之一：先执行下方对应【专属·××】全部要求，再叠加【通用画面优化】中不冲突的光影/元素/质感要求。\n" +
  "未命中任何一类：只按【通用画面优化】扩写，不要硬套五类专属版式。\n\n" +
  "【总原则】\n" +
  "1. 输出必须为纯中文一段连贯描述，不含英文单词、不含解释、不加标题或序号标签。\n" +
  "2. 忠实保留用户明确写出的主体、场景、文案原文与关键数字；可补全视觉细节，但不得篡改产品名、地名、价格、活动名、品牌名等事实信息。\n" +
  "3. 若【区县/地区】不为空，只可把该地的光影、地貌、配色气质融入氛围；禁止用当地特产名或知识库口号替换用户品牌名，用户没写「萧山杨梅」就不得出现该词。\n" +
  "4. 根据【画面风格】注入对应表现：智能匹配则自选并点明；国潮/水彩/扁平矢量/卡通动漫/线描/版画/写实摄影/纹样则按该风格典型笔触与光影写，风格统一、禁止混风。\n" +
  "5. 若用户含明确标题/口号，保留原文并注明排版位置与层级；未给文字则不要虚构特产口号，严禁出现「本地知识库」「区县知识库」「Lora」「共富茶香」等系统或示例文案。\n" +
  "6. 禁止水印、乱码文字、多余 logo；只输出最终画面描述段落。\n\n" +
  "【通用画面优化】（成图意图为通用，或五类专属写完后仍须兼顾）\n" +
  "【光影优化·必须写清】\n" +
  "1. 明确主光方向与光质：如侧逆光、顶光、窗光、棚拍柔光箱、黄金时段自然光、阴天漫射光等，择一贴合主题。\n" +
  "2. 写明明暗关系：受光面、背光面、投影软硬与落点，避免画面平均发灰或死黑死白。\n" +
  "3. 适当加入氛围光效：轮廓光、环境反射、薄雾透光、高光点缀、柔和光晕等，但不得抢主体。\n" +
  "4. 曝光与对比要可信：主体清晰可读，背景可略暗或略虚以托主体，禁止过曝糊成一片或欠曝看不清细节。\n\n" +
  "【元素优化·必须写清】\n" +
  "1. 主体：外形、材质、颜色、关键细节（标签、纹理、边缘、包装、人物表情姿态等）写具体、可视觉化。\n" +
  "2. 陪体与道具：只选能强化主题的少量元素，避免堆砌；说明它们与主体的空间关系（前景/中景/背景）。\n" +
  "3. 环境与背景：场景类型、纵深、地平线或台面关系、是否虚化；背景服务主体，不抢戏。\n" +
  "4. 装饰与符号：纹样、图标、植物、器物等须与主题气质一致；区县非空时可自然融入该地景观、物产或民俗符号。\n" +
  "5. 文字元素：若用户给出标题/口号/卖点，保留原文并提示大致位置与层级（主标题大、辅文小）；未给文字则不要虚构无关文案，也不要出现知识库、Lora 等系统词。\n\n" +
  "【结构与构图·必须写清】\n" +
  "1. 根据【图片比例】匹配构图：\n" +
  "    ○ 接近正方形 → 主体居中或微偏，四边留白均衡，视觉重心稳定\n" +
  "    ○ 竖版（如三比四、二比三、九比十六）→ 上下引导阅读，主体偏上或中上，下方可留信息或延伸空间\n" +
  "    ○ 横版（如十六比九、四比三、五比三）→ 左右或对角线张力，主体偏左或偏右三分点，留出呼吸空间\n" +
  "    ○ 超长竖图 → 自上而下分段节奏，但仍保持单张画面内主次分明，不要写成说明书目录\n" +
  "2. 建立清晰层次：前景点缀 → 中景主体 → 背景氛围，至少两到三层纵深。\n" +
  "3. 使用稳定构图手法之一并写进描述：三分法、居中对称、引导线、框架式构图、对角线等。\n" +
  "4. 信息层级：一眼先看主体，再看关键辅信息，最后才是装饰；禁止平均铺满导致无视觉焦点。\n\n" +
  "【色调、材质与完成度】\n" +
  "1. 给出主色与辅色倾向，以及整体情绪（清新、温暖、浓郁、冷静、节庆、高端等）。\n" +
  "2. 点明关键材质质感：如陶瓷釉面、织物纤维、金属拉丝、木质纹理、水珠、雾气、纸面纤维等。\n" +
  "3. 收尾强调成图质量：构图完整、主体锐利、细节可读、无水印、无乱码文字、无多余 logo、边缘干净。\n\n" +
  "【通用默认输出顺序】（未走五类专属时用）\n" +
  "画面主体与关键细节 → 场景环境与空间层次 → 光影与氛围 → 陪体元素与装饰 → 色调情绪与材质 → 构图与比例适配 → 风格表现 → 文字排版提示（若有） → 画面质量。长度约二百字至三百五十字。\n\n" +
  "【专属·海报】（成图意图=海报时启用）\n" +
  "服务于宣传海报设计。按【图片比例】匹配：一比一居中留白均匀；三比四或四比五上方三分之二主视觉、下方文字区；九比十六顶品牌/中大图/底行动召唤三段；十六比九左右分区、主体偏左或居中右侧留字；四比三宽景铺陈；二比三上主视觉下文字留白。\n" +
  "输出顺序：画面主体 → 场景环境与光影 → 风格关键词 → 色调情绪 → 构图描述 → 文字排版提示 → 画面质量。长度约一百五十字至二百五十字。\n\n" +
  "【专属·长图】（成图意图=长图时启用）\n" +
  "竖向多段滚动布局：顶部主标题视觉区；中部二至三个信息段（各有小标题与配图暗示）；底部行动召唤/联系/落款留白。比例越长中部段落越多。\n" +
  "输出顺序：顶部主视觉 → 中部内容分区节奏 → 底部收尾区 → 风格关键词 → 色调情绪 → 纵向延伸构图 → 文字排版提示 → 画面质量。长度约一百八十字至二百八十字。\n\n" +
  "【专属·菜单】（成图意图=菜单时启用）\n" +
  "核心是菜品陈列：摆盘与食材质感、食欲感光线；凉菜/热菜/主食/饮品等分区与小标题；价格标签区；竹纹/木纹/纸纹或素色底纹。横版左右分栏左图右文与价格；竖版上下菜品图与文字交替；正方形单品聚焦或四格网格。写实摄影时强调食欲感。\n" +
  "输出顺序：菜单整体氛围 → 菜品陈列与食欲感 → 分区布局 → 价格标签风格 → 底纹背景 → 风格关键词 → 色调情绪 → 构图排版 → 文字排版提示 → 画面质量。长度约一百八十字至二百八十字。\n\n" +
  "【专属·易拉宝】（成图意图=易拉宝时启用）\n" +
  "竖版窄幅展陈，三区结构：上部约三分之一品牌与主视觉（冲击最强）；中部约二分之一卖点条目或图文卡片、字体层级清晰；下部约六分之一预留脚架遮挡，可放联系方式/二维码但不宜过重。竖向自上而下引导；主标题大/副标题中/正文小；近距阅读不宜过度复杂。标准一比二至一比三三区均衡，更窄则压缩中部、加大上部。\n" +
  "输出顺序：上部主视觉 → 中部信息区 → 底部留空说明 → 风格关键词 → 色调情绪 → 竖版纵深构图 → 文字层级排版 → 画面质量。长度约一百八十字至二百八十字。\n\n" +
  "【专属·宣传单】（成图意图=宣传单时启用）\n" +
  "高信息密度手持印刷页：顶部主标题与视觉吸引区（图像占比不超过三分之一）；中部图文混排（图标+条目或小图+说明交替）；底部联系方式与行动召唤（二维码/电话/地址）。留白少、对比高、字体近距可读。横版左右分栏或上图下文；竖版上中下三段适合单页；正方形中心主视觉四周信息。画面文字只能是宣传内容本身，禁止系统标签原文。\n" +
  "输出顺序：顶部视觉吸引区 → 中部图文混排信息区 → 底部联系区 → 风格关键词 → 色调情绪 → 构图排版 → 文字排版提示 → 印刷适配说明 → 画面质量。长度约一百八十字至二百八十字。";

/** 活动文生图统一用一份系统提示词（内含通用优化 + 五类专属） */
function eventPromptFor(_sub?: string, _input?: string): string {
  return T2I_EVENT_SYSTEM;
}

/* ============================================================
   商拍·文生图扩写：农旅特产电商 / 种草商拍，按成图类型选用模板。
   ============================================================ */
const T2I_PRODUCT_COMMON =
  "【通用红线】\n" +
  "1. 输出为纯中文一段画面描述，不含英文、不加解释与标题。\n" +
  "2. 商品主体外观必须真实可信，不虚构产地认证标识、不夸大成色与功效。\n" +
  "3. 按【图片比例】匹配构图；不额外匹配或注入画面风格关键词，保持写实商拍质感。\n" +
  "4. 区县/地区非空时自然融入地域景观或农特产气质，为空则不强制。\n" +
  "5. 禁止水印、乱码文字、多余 logo；白底类禁止花哨道具抢主体。\n" +
  "6. 长度控制在一百五十字至二百五十字之间。\n" +
  "7. 内容顺序：商品主体 → 包装与材质细节 → 场景/背景与光影 → 色调 → 构图 → 画面质量，逗号连接为一段。";

const T2I_PRODUCT_PROMPTS: Record<string, string> = {
  白底主图:
    "你是农旅电商商拍提示词专家，专做可过审的白底商品主图。\n" +
    "任务：把用户简短输入扩写成高质量中文图像提示词，直接送文生图模型。\n\n" +
    "【输入参数】\n用户描述：{{ user_input }}\n区县/地区：{{ county_name }}\n图片比例：{{ image_ratio }}\n\n" +
    T2I_PRODUCT_COMMON +
    "\n【白底主图专项】\n" +
    "- 背景必须为纯白或极浅灰，主体居中，四边留白均匀。\n" +
    "- 柔和棚拍光，干净轻微投影，标签朝向镜头、清晰可读（若描述含包装）。\n" +
    "- 无生活道具堆砌；强调电商主图过审感。",
  产地场景:
    "你是农旅电商商拍提示词专家，专做产地氛围场景图。\n" +
    "任务：把用户简短输入扩写成高质量中文图像提示词，直接送文生图模型。\n\n" +
    "【输入参数】\n用户描述：{{ user_input }}\n区县/地区：{{ county_name }}\n图片比例：{{ image_ratio }}\n\n" +
    T2I_PRODUCT_COMMON +
    "\n【产地场景专项】\n" +
    "- 背景为茶园/竹林/稻田/果园/山泉等贴合品类的真实产地气质。\n" +
    "- 商品为主体、环境为辅；自然光，光影与投影方向一致，避免「悬浮贴图感」。\n" +
    "- 定位为展示氛围，不写成溯源凭证口吻。",
  生活场景:
    "你是农旅电商商拍提示词专家，专做餐桌/民宿等生活氛围图。\n" +
    "任务：把用户简短输入扩写成高质量中文图像提示词，直接送文生图模型。\n\n" +
    "【输入参数】\n用户描述：{{ user_input }}\n区县/地区：{{ county_name }}\n图片比例：{{ image_ratio }}\n\n" +
    T2I_PRODUCT_COMMON +
    "\n【生活场景专项】\n" +
    "- 餐桌、厨房台面或民宿窗台等生活场景，道具点缀克制。\n" +
    "- 突出使用氛围与食欲/体验感，产品标签朝向镜头。",
  细节特写:
    "你是农旅电商商拍提示词专家，专做材质与原料细节特写。\n" +
    "任务：把用户简短输入扩写成高质量中文图像提示词，直接送文生图模型。\n\n" +
    "【输入参数】\n用户描述：{{ user_input }}\n区县/地区：{{ county_name }}\n图片比例：{{ image_ratio }}\n\n" +
    T2I_PRODUCT_COMMON +
    "\n【细节特写专项】\n" +
    "- 微距或近景，突出纹理、绒毫、流质、编织肌理等可读细节。\n" +
    "- 浅景深，背景虚化，真实材质，不过度磨皮。",
  礼盒套图:
    "你是农旅电商商拍提示词专家，专做伴手礼/节日礼盒摆拍。\n" +
    "任务：把用户简短输入扩写成高质量中文图像提示词，直接送文生图模型。\n\n" +
    "【输入参数】\n用户描述：{{ user_input }}\n区县/地区：{{ county_name }}\n图片比例：{{ image_ratio }}\n\n" +
    T2I_PRODUCT_COMMON +
    "\n【礼盒套图专项】\n" +
    "- 礼盒全貌清晰，可微开展示内装；竹编、土布、丝带等点缀克制不堆砌。\n" +
    "- 礼品感与节日氛围适中，避免廉价促销贴纸感。",
  详情长图:
    "你是农旅电商商拍提示词专家，专做详情页竖版长图头图。\n" +
    "任务：把用户简短输入扩写成高质量中文图像提示词，直接送文生图模型。\n\n" +
    "【输入参数】\n用户描述：{{ user_input }}\n区县/地区：{{ county_name }}\n图片比例：{{ image_ratio }}\n\n" +
    T2I_PRODUCT_COMMON +
    "\n【详情长图专项】\n" +
    "- 竖版长构图：上方主视觉、中部产地/故事氛围、下方可留信息区暗示。\n" +
    "- 信息节奏清晰，适合电商详情页头图，不要密密麻麻堆字。",
};

function productPromptFor(sub?: string): string {
  return T2I_PRODUCT_PROMPTS[sub ?? ""] ?? T2I_PRODUCT_PROMPTS["白底主图"];
}

/* 制作大片·内容安全：镜头文字最终会作为视频模型的生成提示词，必须能通过内容审核，
   否则后续「分镜视频」会被模型拦截、生成失败。所有剧本类阶段的 system 提示都追加本规则。 */
/* 制作大片·风格统一：把项目「视频风格」注入文本扩写，使剧本 / 镜头 / 参考图描述的文字基调
   与整片画面风格一致。styleHint 为空（智能匹配）时返回空串、不追加。 */
function styleRule(styleHint?: string): string {
  const s = styleHint?.trim();
  return s
    ? `\n【全片风格统一·必须遵守】本片整体画面风格为：${s}。你的文字描述要贴合该风格的意境、色调与氛围，与全片保持一致，用词与画面感都往这个风格靠拢。`
    : "";
}

/* 制作大片·知识库：使用「魔方智绘知识库」时，让 LLM 结合账号所在区县的特色信息（产品/景点/文化/品牌）来创作，
   使脚本更贴合真实地方特色。useKB 为 false（不使用）时返回空串、不追加。
   （演示阶段：以规则形式提示模型结合区县知识；后续接入真实知识库检索后可在此拼入检索到的资料。）*/
function kbRule(req: { useKB?: boolean; county?: string; kbContext?: string }): string {
  if (!req.useKB) return "";
  const county = req.county?.trim();
  const kb = req.kbContext?.trim();
  return (
    "\n【结合本地知识库】" +
    (county ? `当前账号所在地为「${county}」。` : "") +
    (kb
      ? `可参考下列资料的风貌与配色（只作氛围，不是画面文案）：\n${kb}\n`
      : "可结合该地风光与色彩气质，但不要编造用户没提过的产品名。") +
    "涉及具体品牌名/产品名时，以用户原文为准；用户没写的特产名（如萧山杨梅）不得写进画面标题。" +
    "【禁止输出系统标签】不要写出「本地知识库」「区县知识库」「县域知识库」「结合本地知识库」「结合区县知识库」「Lora」等字样；" +
    "若结果将用于出图，资料条目标题与口号（如共富茶香、白叶绿茶）不得当作画面主标题，画面文字仅保留用户给出的品牌/活动文案。"
  );
}

function withKb(messages: ChatMessage[], req: { useKB?: boolean; county?: string; kbContext?: string }): ChatMessage[] {
  const extra = kbRule(req);
  if (!extra) return messages;
  const next = messages.map((m) => ({ ...m }));
  const sys = next.find((m) => m.role === "system");
  if (sys) sys.content += extra;
  else next.unshift({ role: "system", content: extra.trim() });
  return next;
}

const STUDIO_SAFE_RULE =
  "\n【内容安全·必须遵守】你写的画面与台词会直接送入 AI 视频模型生成，必须通过其内容审核，否则无法生成视频：" +
  "不得出现真实政治人物 / 国家领导人、国旗国徽党旗军旗、军警制服与武器弹药、宗教与民族敏感符号、" +
  "暴力血腥、色情低俗、违法犯罪与危险行为、恐怖惊悚、真实品牌商标等敏感元素；" +
  "遇到相关主题时，一律用中性、正向、生活化、写意的画面替代（如以「远处的山村晨景」代替具体政治场景），" +
  "确保每一镜的文字都能顺利生成视频。";

const STUDIO_SCRIPT_TYPE_HINTS: { key: string; words: string[] }[] = [
  { key: "非遗展示", words: ["非遗展示", "非遗", "技艺展示", "传承人"] },
  { key: "民宿农家乐", words: ["民宿农家乐", "农家乐", "精品民宿", "民宿"] },
  { key: "农产品推广", words: ["农产品推广", "农产品", "产地直采", "产地直发"] },
  { key: "文旅宣传", words: ["文旅宣传", "文旅宣传片", "文旅"] },
];

function demandText(input?: string): string {
  if (!input) return "";
  const m = input.match(/【需求】\s*([\s\S]*?)(?=\n【|$)/);
  return (m?.[1] ?? input).trim();
}

function inferStudioScriptType(text: string): string {
  const t = text.trim();
  if (!t) return "";
  for (const row of STUDIO_SCRIPT_TYPE_HINTS) {
    if (row.words.some((w) => t.includes(w))) return row.key;
  }
  return "";
}

function isCustomScriptType(type?: string): boolean {
  const t = type?.trim();
  return !t || t === STUDIO_SCRIPT_TYPE_DEFAULT || t === "默认";
}

function resolveStudioScriptType(req: GenerateRequest): string {
  const direct = req.scriptType?.trim() || "";
  const line = req.input?.match(/【片子类型】\s*([^\n]+)/);
  const fromLine = line?.[1]?.trim() || "";
  const chosen = direct || fromLine;
  if (isCustomScriptType(chosen)) return STUDIO_SCRIPT_TYPE_DEFAULT;
  const fromDemand = inferStudioScriptType(demandText(req.input));
  if (fromDemand) return fromDemand;
  if (direct && STUDIO_SCRIPT_TYPE_GUIDES[direct]) return direct;
  if (fromLine && STUDIO_SCRIPT_TYPE_GUIDES[fromLine]) return fromLine;
  return chosen || STUDIO_SCRIPT_TYPE_DEFAULT;
}

function fillStudioVars(template: string, req: GenerateRequest): string {
  const type = resolveStudioScriptType(req);
  const typed = Boolean(type && STUDIO_SCRIPT_TYPE_GUIDES[type]);
  const typeGuide = typed ? STUDIO_SCRIPT_TYPE_GUIDES[type] : "";
  const assetTypeGuide = typed ? (STUDIO_ASSET_TYPE_GUIDES[type] || STUDIO_ASSET_TYPE_GUIDE_FALLBACK) : "";
  const typeBlock = typed
    ? `【当前片子类型·必须遵守】\n片子类型：${type}\n${typeGuide}\n- 【需求】可能是点了示例，也可能是用户自己写的任意内容，两种同等有效：以【需求】原文为唯一故事来源，把地点、主体、受众、时长、卖点全部用上；禁止用示例里的地名/产品去替换用户自己写的内容，禁止抛开原文另起一套，也禁止写成其他类型的片子。\n\n`
    : "";
  const assetTypeBlock = typed
    ? `【当前片子类型·必须遵守】\n片子类型：${type}\n${assetTypeGuide}\n- 抽哪些项、每项 desc 怎么写，都要贴合该类型；结合剧本已有的地点/人物/物件，不要抛开剧本另编一套，也不要混入其他类型的典型元素。\n`
    : "";
  return template
    .replaceAll("{{ type }}", type || STUDIO_SCRIPT_TYPE_DEFAULT)
    .replaceAll("{{ typeGuide }}", typeGuide)
    .replaceAll("{{ typeBlock }}", typeBlock)
    .replaceAll("{{ assetTypeGuide }}", assetTypeGuide)
    .replaceAll("{{ assetTypeBlock }}", assetTypeBlock)
    .replaceAll("{{ styleHint }}", req.styleHint?.trim() || "未指定")
    .replaceAll("{{ useKB }}", req.useKB ? "开启" : "关闭")
    .replaceAll("{{ county }}", req.county?.trim() || "未提供")
    .replaceAll("{{ kbContext }}", req.kbContext?.trim() || "（无检索资料）");
}

function fillStudioScriptPro(req: GenerateRequest): string {
  return fillStudioVars(SYSTEM_STUDIO_SCRIPT_PRO, req);
}

/** 按场景/模式把表单字段拼成 messages */
export function buildMessages(req: GenerateRequest): ChatMessage[] {
  const core = buildMessagesCore(req);
  if (req.scene === "studio-script-pro" || req.scene === "studio-assets" || req.scene === "studio-shot-script") return core;
  return withKb(core, req);
}

function buildMessagesCore(req: GenerateRequest): ChatMessage[] {
  // 制作大片·参考图描述扩写：把某个场景/角色/道具的简短描述扩写成适合文生图的画面描述，并与剧本统一
  if (req.scene === "studio-asset-desc") {
    return [
      {
        role: "system",
        content:
          "你是短视频美术指导。用户会给出「剧本背景」和一个场景/角色/道具的简短描述，以及扩写要求。" +
          "请把该描述扩写成一段更具体、适合文生图的中文画面描述，并与剧本的题材、风格、氛围、时代/地域保持统一。" +
          "【严格遵守用户的内容范围限定】：若要求「只写场景、不要人物」，则绝对不能出现任何人物/角色；" +
          "若要求「只写角色外观、不要场景」，则不描述环境背景；若要求「只写道具」，则不出现人物或场景。" +
          "只输出画面描述本身，一段话，不要标题、不要解释、不要换行，150 字以内。" +
          styleRule(req.styleHint),
      },
      { role: "user", content: req.input || "" },
    ];
  }

  // 制作大片·角色信息识别：读剧本 + 角色名，提取该角色的 年龄段/性别/人物描述/背景故事（结构化 JSON）
  if (req.scene === "studio-char-info") {
    return [
      {
        role: "system",
        content:
          "你是短剧角色设定师。用户给你一段「剧本」和一个「角色名」。请只针对这个角色，结合剧本内容推断并输出它的设定，" +
          "只输出一个 JSON 对象，字段固定为：" +
          '{"age":"年龄段（儿童/少年/青年/中年/老年之一）","gender":"性别（男/女）","desc":"人物外观描述：年龄性别、脸型五官、发型发色、身材体态、服饰配饰、气质神态，一段话100字内","backstory":"背景故事：身份、经历、性格，一段话80字内"}。' +
          "剧本没明说的按角色名与剧情合理推断，不要留空、不要编造与剧情冲突的信息。不要解释、不要 markdown 代码块，只输出 JSON。" +
          styleRule(req.styleHint),
      },
      { role: "user", content: req.input || "" },
    ];
  }

  // 制作大片·场景角色道具清单提取：提示词见 prompts.ts · SYSTEM_STUDIO_ASSETS（含内容安全 / 风格 / 知识库）
  if (req.scene === "studio-assets") {
    return [
      {
        role: "system",
        content: fillStudioVars(SYSTEM_STUDIO_ASSETS, req),
      },
      {
        role: "user",
        content: `剧本：\n${req.input?.trim() || "（空）"}\n\n${USER_STUDIO_ASSETS_FALLBACK}`,
      },
    ];
  }

  // 制作大片·审核安全改写：把一镜画面描述改写成能通过 AI 视频模型内容审核的版本（用于生成被拦后一键改写重试）
  if (req.scene === "studio-safe-rewrite") {
    return [
      {
        role: "system",
        content:
          "你是短视频画面描述改写助手。用户的一段「画面描述」在送入 AI 视频模型时被内容审核拦截了。" +
          "请把它改写成一段能顺利通过审核的版本：去掉真实政治人物 / 国家领导人、国旗国徽党旗军旗、军警制服与武器、" +
          "宗教与民族敏感符号、暴力血腥、色情低俗、违法犯罪与危险行为、真实品牌商标等敏感元素，" +
          "用中性、正向、生活化、写意的画面替代；同时【尽量保留原有的场景、人物动作与核心含义】，只做必要的规避。" +
          "用中文，只输出改写后的画面描述本身，一段话，不要标题、不要解释、不要换行。",
      },
      { role: "user", content: `原画面描述：\n${req.input?.trim() || "（空）"}\n\n请改写成能通过审核的版本。` },
    ];
  }

  // 制作大片·AI 分配说话人：给一镜的画面描述、台词、出场角色名单，判断每句台词是谁说的，
  // 输出成「角色名：台词」分行形式，供多说话人配音按说话人分配音色。
  if (req.scene === "studio-speakers") {
    return [
      {
        role: "system",
        content:
          "你是短剧配音导演。用户给你一个镜头的「画面描述」「台词」和「本镜出场角色名单」。" +
          "请判断台词里每一句是谁说的，输出成「角色名：台词」的分行形式，每句一行。" +
          "规则：① 只能用给定名单里的角色名，不要新造名字；② 结合画面描述判断说话人（谁在做动作/被称呼/语气对象）；" +
          "③ 明显是画外解说/内心独白/无人称的句子，用「旁白」；④ 不要改动台词文字本身，只在每行前加「角色名：」；" +
          "⑤ 只输出分行后的台词，不要标题、不要解释、不要多余空行。",
      },
      { role: "user", content: req.input || "" },
    ];
  }

  // 制作大片·AI 自动匹配音色：给一个角色的设定和可选音色清单，从清单里选一个最贴合的音色名。
  if (req.scene === "studio-voice-match") {
    return [
      {
        role: "system",
        content:
          "你是短剧配音导演。用户给你一个角色的设定（名字、剧本背景）和一份可选音色清单（每行：音色名（性别·年龄·场景·是否多情感））。" +
          "请从清单里选一个最贴合该角色的音色——综合判断性别、年龄、性格气质、身份场景。" +
          "只输出选中的音色名（必须和清单里的某个音色名完全一致），不要加引号、不要解释、不要其它任何字。",
      },
      { role: "user", content: req.input || "" },
    ];
  }

  // 制作大片·识别出镜元素：给一份元素清单 + 若干镜头画面描述，判断每镜出现了哪些元素（场景/角色/道具）。
  if (req.scene === "studio-shot-elements") {
    return [
      {
        role: "system",
        content:
          "你是分镜师。用户给你一份「元素清单」（每个元素：名称 + 类型 场景/角色/道具）和若干镜头（每个镜头：ID + 画面描述）。" +
          "请为每个镜头判断：这一镜的画面里出现或涉及了清单中的哪些元素——" +
          "场景=这镜发生的地点/环境；角色=画面里出现的人物（包括用『她/他/旅人/姑娘/老人』等指代、但显然指清单里某个角色的）；道具=画面里出现的关键物品。" +
          "规则：① 只能用清单里给出的元素名称，绝不新造名字；② 用语义理解匹配，描述用词和元素名不完全一致也要认出来（例如『西湖的水面』对应元素『西湖湖面』，『断桥残雪』对应『杭州西湖断桥』）；" +
          "③ 一个镜头可以对应多个元素，也可能一个都没有（给空数组）；" +
          "④ 只输出一个 JSON 对象：键=镜头ID，值=该镜出现的元素名称字符串数组。不要任何解释、不要 markdown 代码块、不要多余文字。",
      },
      { role: "user", content: req.input || "" },
    ];
  }

  // 制作大片·补齐出镜元素：给「已有元素清单」+ 若干镜头画面描述，为每镜列出出镜元素；
  // 清单里有的照抄、没有但画面明确出现的新建，保证每个非纯空镜都至少有场景 + 主要角色/主体。
  if (req.scene === "studio-shot-elements-fill") {
    return [
      {
        role: "system",
        content:
          "你是分镜师。用户给你一份「已有元素清单」（每个元素：名称 + 类型 场景/角色/道具）和若干镜头（ID + 画面描述）。" +
          "请为每个镜头列出这一镜画面里出现或涉及的出镜元素：场景=这镜发生的地点/环境；角色=画面里出现的人物；道具=画面里出现的关键物品。" +
          "规则：" +
          "① 优先复用已有清单里的元素——只要语义对应就照抄清单里的名称（例如『西湖的水面』对应清单『西湖湖面』，别新建）；" +
          "② 清单里没有、但画面里明确出现的主体（如脚本点名的人物『老周』、明确的场景或道具），要新建：给它一个简洁准确的名称（人物用其称呼如『老周』，场景/道具用其通名）和正确类型；" +
          "③ 每个镜头尽量给出它的『场景』和『主要角色/主体』；只有确实是没有人物的纯环境空镜才可只给场景；" +
          "④ 名称要短（角色≤6字、场景/道具≤8字），同一主体在不同镜头必须用完全相同的名称，避免『老周』『卖枇杷的老周』混用；" +
          "⑤ 只输出一个 JSON 对象：键=镜头ID，值=数组，数组每项为 {\"name\":\"元素名\",\"kind\":\"场景|角色|道具\",\"new\":true/false}，new 表示是否为清单里没有、需新建的元素。不要解释、不要 markdown 代码块。",
      },
      { role: "user", content: req.input || "" },
    ];
  }

  // 制作大片·智能匹配风格：读脚本，从 6 种具体风格里选出最贴合的一种（用于「视频风格=智能匹配」→ 锁定为具体风格）
  if (req.scene === "studio-style-match") {
    return [
      {
        role: "system",
        content:
          "你是短视频视觉风格顾问。根据用户给的脚本内容，从以下 6 种风格里选出最贴合这条片子的 1 种：\n" +
          "写实、纪录片、航拍大片、温暖治愈、电影感、国风水墨。\n" +
          "只输出风格名本身（四个字以内，必须是上面 6 个之一），不要任何解释、标点或多余文字。",
      },
      { role: "user", content: `脚本：\n${req.input?.trim() || "（空）"}\n\n请只输出一个最贴合的风格名。` },
    ];
  }

  // 制作大片·剧本编辑（三阶段之一）① 原始创意：把用户一句话需求 → 世界观/主角/故事梗概
  if (req.scene === "studio-idea") {
    return [
      {
        role: "system",
        content:
          "你是资深短视频 / 短剧编剧。根据用户的简短需求，构思这条片子的「原始创意」：\n" +
          "包含 世界观 / 背景设定、核心人物（主角及关键角色的设定）、故事梗概（起承转合）。\n" +
          "用中文，条理清晰（用自然分段，小标题直接用文字加冒号），简洁不注水。只输出创意内容，不要额外说明。" +
          "【纯文本】不要使用任何 markdown 标记：不要 **加粗**、不要 # 或 ## 标题符号、不要 - 或 * 列表符号、不要反引号，直接用中文和标点自然表达。" +
          STUDIO_SAFE_RULE +
          styleRule(req.styleHint),
      },
      { role: "user", content: req.input?.trim() || "请构思一条短视频的原始创意。" },
    ];
  }

  // 制作大片·剧本编辑（三阶段之二）② 镜头摘要：把原始创意 → 逐镜头一句话要点
  if (req.scene === "studio-summary") {
    return [
      {
        role: "system",
        content:
          "你是短视频分镜师。根据给定的「原始创意」，写一份「镜头摘要」：\n" +
          "先一句话交代整体基调 / 风格，然后按拍摄顺序列出每个镜头的一句话要点（镜头1、镜头2…），\n" +
          "每个镜头要点交代 谁 / 在哪 / 做什么。用中文，简洁。只输出摘要，不要额外说明。" +
          "【纯文本】不要使用任何 markdown 标记（不要 **、#、##、- 、* 、反引号），直接用中文和标点自然表达。" +
          STUDIO_SAFE_RULE +
          styleRule(req.styleHint),
      },
      { role: "user", content: `原始创意：\n${req.input?.trim() || "（空）"}\n\n请据此写镜头摘要。` },
    ];
  }

  // 制作大片·分镜制作：把每镜故事段落改写成带时间轴 / @[元素] / 音效的拍摄脚本
  if (req.scene === "studio-shot-script") {
    return [
      {
        role: "system",
        content: SYSTEM_STUDIO_SHOT_SCRIPT,
      },
      {
        role: "user",
        content: req.input?.trim() || "请按格式把各镜改写成拍摄脚本。",
      },
    ];
  }

  // 制作大片·剧本编辑（三阶段之三）③ 完整镜头：把镜头摘要 → 每个镜头结构化（画面 + 旁白 + 对白）
  if (req.scene === "studio-shots") {
    return [
      {
        role: "system",
        content:
          "你是中文故事编剧。根据给定创意，用简体中文扩写成一篇能读的故事剧本：叙述像文章，对话像人说话。\n" +
          "严禁输出镜头1、【时长】、【画面】、【旁白】、【对白】或任何拍摄术语。\n" +
          "对话单独成行，格式「角色名：台词」。换场空一行。至少两名固定角色。禁止英文剧本。" +
          STUDIO_SAFE_RULE +
          styleRule(req.styleHint),
      },
      { role: "user", content: `素材：\n${req.input?.trim() || "（空）"}\n\n请用简体中文扩写成一篇故事剧本，不要分镜。` },
    ];
  }

  // 制作大片·剧本编辑「立即生成」：提示词见 prompts.ts · SYSTEM_STUDIO_SCRIPT_PRO（含内容安全 / 风格 / 知识库）
  if (req.scene === "studio-script-pro") {
    return [
      {
        role: "system",
        content: fillStudioScriptPro(req),
      },
      { role: "user", content: `${req.input?.trim() || USER_STUDIO_SCRIPT_PRO_FALLBACK}\n\n请用简体中文写故事剧本，只输出正文。` },
    ];
  }

  // 制作大片·剧本编辑：根据用户描述的「类型 + 故事」生成完整、可拆分镜的剧本正文
  if (req.scene === "studio-script") {
    return [
      {
        role: "system",
        content:
          "你是故事编剧。把用户的类型与故事扩写成一篇能读的故事剧本。要求：\n" +
          "1. 全中文，像文章：叙述段落 + 「角色名：台词」；\n" +
          "2. 至少两名角色对谈，口语能听懂；\n" +
          "3. 不要镜头编号、时长、画面标签、拍摄术语；\n" +
          "4. 只输出正文，不要标题和 markdown。" +
          STUDIO_SAFE_RULE +
          styleRule(req.styleHint),
      },
      { role: "user", content: req.input?.trim() || "请把需求扩写成一篇故事剧本，不要分镜。" },
    ];
  }

  // 数字人模特·口播文案生成：根据主题 + 语气 + 字数生成适合真人/数字人口播的文案
  if (req.scene === "avatar-script") {
    const toneMap: Record<string, string> = {
      亲切口语: "用亲切、口语化的语气，像朋友聊天，接地气，多用短句和口头语",
      专业权威: "用专业、权威、可信赖的语气，数据和事实结合，适合农技推广或政务播报",
      活泼种草: "用活泼、有感染力的种草语气，制造想买/想去的冲动，适合电商带货或文旅推广",
      政务正式: "用正式、严谨、规范的政务语气，措辞庄重，适合通知公告和政策解读",
    };
    const toneHint = toneMap[req.tone ?? "亲切口语"] ?? toneMap["亲切口语"];
    const charTarget = req.length ? `约 ${req.length} 字` : "约 90 字";
    return [
      {
        role: "system",
        content:
          `你是一位专业的短视频口播文案创作者，擅长为农业推广、文旅宣传、电商带货、政务播报等场景撰写适合真人/数字人出镜朗读的口播稿。\n\n` +
          `【写作要求】\n` +
          `1. ${toneHint}；\n` +
          `2. 篇幅控制在${charTarget}，一段到底，无章节标题、无列表符号、无 markdown；\n` +
          `3. 以「吸引注意的开场句」开头，以「行动引导/情感收尾」结尾；\n` +
          `4. 句子自然流畅，朗读时不绕口，无生僻字，标点清晰（逗号、句号为主）；\n` +
          `5. 只输出文案正文，不要标题、不要括号注释、不要任何额外说明。`,
      },
      {
        role: "user",
        content: `请为以下主题创作一段口播文案：\n${req.input?.trim() || "（未提供主题）"}`,
      },
    ];
  }

  // 活动·文生图扩写：统一系统提示词（内含通用优化 + 五类专属）；成图意图仅作分流提示
  if (req.scene === "t2i-event") {
    const kind = resolveEventPromptKind(req.eventSub, req.input);
    const sys = eventPromptFor()
      .replace("{{ user_input }}", req.input?.trim() || "（未填写）")
      .replace("{{ county_name }}", req.county?.trim() || "（未指定，不强制融入地域元素）")
      .replace("{{ image_ratio }}", req.imageRatio?.trim() || "1:1")
      .replace("{{ art_style }}", req.artStyle?.trim() || "智能匹配");
    return [
      { role: "system", content: sys },
      {
        role: "user",
        content:
          `用户描述：${req.input?.trim() || "（未填写）"}\n` +
          `成图意图：${kind}\n` +
          (kind === "通用"
            ? `请按【通用画面优化】扩写成最终画面描述段落，只输出描述本身。`
            : `请启用【专属·${kind}】并兼顾【通用画面优化】中不冲突的要求，扩写成最终画面描述段落，只输出描述本身。`),
      },
    ];
  }

  // 商拍·文生图扩写：农旅白底/产地/生活/细节/礼盒
  if (req.scene === "t2i-product") {
    const sys = productPromptFor(req.eventSub)
      .replace("{{ user_input }}", req.input?.trim() || "（未填写）")
      .replace("{{ county_name }}", req.county?.trim() || "（未指定，不强制融入地域元素）")
      .replace("{{ image_ratio }}", req.imageRatio?.trim() || "1:1")
      .replace("{{ art_style }}", req.artStyle?.trim() || "智能匹配");
    return [
      { role: "system", content: sys },
      {
        role: "user",
        content:
          `用户描述：${req.input?.trim() || "（未填写）"}\n` +
          `请按上述规则扩写成最终画面描述段落，只输出描述本身。`,
      },
    ];
  }

  // IP 设计·帮我提案：根据 IP 特征构思三个设计方案（每案约 200 字纯文本，偏 IP 形象）
  if (req.scene === "ip-propose") {
    const feature = req.description?.trim() || "（未提供）";
    return [
      {
        role: "system",
        content:
          "你是资深的品牌 IP / 吉祥物形象设计师，专做「可落地的角色 IP」设计（不是海报文案、不是活动主视觉、不是风景插画）。" +
          "根据用户给出的特征，输出三套差异化的 IP 形象方案，每套都必须是一个清晰的角色主体：" +
          "有名字或昵称定位、拟人/拟物造型、五官表情、体态比例、标志性服饰与配色、专属道具或符号、性格气质；" +
          "构图默认单一角色居中、**正面朝向镜头**、**纯白背景**，便于后续文生图直接出 IP 形象。" +
          "【偏 IP 硬性要求】不要写成活动海报说明、不要堆营销口号、不要大段场景叙事；" +
          "背景必须是纯白底（白底图#FFFFFF），禁止风景、室内、渐变、纸张肌理、水彩晕染或复杂场景；笔墨必须落在角色本体上；画面只能出现这一个 IP，禁止多角色拼图或三视图。" +
          "【禁止画面文字】不要在方案中要求把角色名、标题、名牌或任何汉字画进画面；角色名只用于文案设定。" +
          "【朝向硬性要求】角色必须是正面全身或正面半身，面部与身体朝向镜头；禁止侧面、半侧面、背面、过肩视角或转身离开镜头的姿态；每个方案正文须写明「正面朝向镜头」。" +
          "【字数】每个方案严格约 200 字（最少 180 字，最多 220 字，绝对不能超过 220 字）；字数仅作写作约束，禁止在正文末尾或任意位置写出「约200字」「180字」等字数标注。" +
          "【格式】纯文本一段话：禁止 Markdown（不要 **加粗**、*斜体*、# 标题、- 列表符、反引号、链接）；不要开场白、不要总结、不要字数说明。",
      },
      {
        role: "user",
        content:
          `「${feature}」，请围绕上述信息，构思三个合适的品牌 IP 形象方案（角色/吉祥物向），输出格式：\n` +
          `方案一：内容\n方案二：内容\n方案三：内容。\n` +
          `每个方案之间分段；三套在造型、配色或气质上要有明显区分，但都紧扣同一 IP 特征。\n` +
          `每个方案写成可直接用于 AI 出图的「单个 IP 形象」完整描述（控制在约 200 字，但不要把字数写进正文）：角色本体为主，固定纯白背景，正面朝向镜头（禁止侧面或背面），画面不要出现角色名或任何文字。`,
      },
    ];
  }

  // 文生图·联想：把用户当前的画面描述扩写成更丰富、更适合出图的画面描述词
  if (req.scene === "t2i-associate") {
    const base = req.input?.trim() || req.description?.trim() || "";
    return [
      {
        role: "system",
        content:
          "你是专业的AI绘画提示词助手，服务于「农文旅」（农产品、乡村旅游、地域文化）领域的宣传图与品牌视觉设计。" +
          "请把用户的画面想法扩写成一段更完整、可视化的画面描述词，便于AI图像生成模型理解。" +
          "从主体、场景环境、风格氛围、光影色调、构图、文案要点等维度自然补全；" +
          "保留并贴合用户的核心意图，不偏题、不堆砌空洞形容词。" +
          "【品牌名红线】用户写出的品牌名、店名、标题必须原样保留；禁止用「萧山杨梅」等示例或知识库特产名替换。" +
          "若用户要的是 Logo / 标志，只描述平面标志与白底，禁止扩写成茶园采茶人物海报。" +
          "【字数硬性要求】最终输出严格控制在 300 字左右（最少 270 字，最多 330 字，绝对不能超过 330 字）。" +
          "写之前先在心里规划好详略，确保篇幅落在该区间；宁可精炼也不要超出上限。" +
          "输出一段连贯的中文描述，不要标题、不要分点、不要解释、不要换行、不要加引号。" +
          "禁止输出思考过程、Draft 或字数统计。",
      },
      {
        role: "user",
        content: base
          ? `请把下面这段画面描述扩写得更丰富具体：\n${base}`
          : `请给出一个适合农文旅宣传图的画面描述示例，主体鲜明、有地域文化氛围。`,
      },
    ];
  }

  // IP 故事·形象描述：严格依据用户之前填的创意描述 + 颜色 + 尺寸提炼，不识别图片、不臆造
  if (req.scene === "ip-story-desc") {
    const name = req.ipName?.trim() || "该 IP 形象";
    const base = req.description?.trim();
    const lines: string[] = [`- IP名称：${name}`];
    if (base) lines.push(`- 创意描述：${base}`);
    if (req.preferredColors && req.preferredColors.length) lines.push(`- 偏好颜色：${req.preferredColors.join("、")}`);
    if (req.canvasSize) lines.push(`- 画面尺寸：${req.canvasSize}`);
    return [
      {
        role: "system",
        content:
          "你是一个专业的IP形象描述助手。请【严格依据】用户给出的创意描述、偏好颜色、画面尺寸等信息，" +
          "把这个IP形象的外观特征（造型、配色、服饰、表情、标志性道具、风格定位等）整理成一段通顺的客观描述。" +
          "【重要】只能依据给定信息提炼，不得新增、臆造或更改任何信息里没有的设定；偏好颜色应自然融入配色描述。" +
          "要求：80字以内，只输出描述本身，不要标题、不要解释、不要换行。",
      },
      {
        role: "user",
        content: base
          ? `用户已填写以下信息：\n${lines.join("\n")}\n\n请据上面的信息，整理出「${name}」的形象描述。`
          : `IP名称：${name}\n（暂无更多信息）\n\n请根据名称合理给出「${name}」的简要形象描述。`,
      },
    ];
  }

  // IP 故事：根据 IP 形象描述 + 用户补充信息，撰写一段品牌 IP 故事
  if (req.scene === "ip-story") {
    const name = req.ipName?.trim() || "该 IP 形象";
    const desc = req.description?.trim() || "（未提供形象描述）";
    const sup = req.supplement?.trim();
    const lines = [`IP名称：${name}`, `IP形象描述：${desc}`];
    if (req.preferredColors && req.preferredColors.length) lines.push(`形象主色调：${req.preferredColors.join("、")}`);
    if (sup) lines.push(`补充信息（须紧扣的项目/公司/行业）：${sup}`);

    // 有补充信息时，强约束：故事必须真正落到用户给的关键词上，而非一笔带过
    const supRule = sup
      ? `\n\n【最重要】用户提供的关键词是「${sup}」。这段故事必须紧扣「${sup}」来写：\n` +
        `- 故事的应用场景、所服务的对象、解决的问题、传递的价值，都要落到「${sup}」上；\n` +
        `- 把 IP 的性格与道具，自然映射到「${sup}」所代表的领域价值上（请据「${sup}」本身合理发挥，不要套用与它无关的设定）；\n` +
        `- 不要只在结尾提一句「${sup}」，而要让整段故事都围绕它展开。`
      : "";

    return [
      {
        role: "system",
        content:
          "你是资深的品牌IP策划。请【紧扣给定的IP形象描述】，为这个IP撰写一段有温度、有记忆点的品牌故事：" +
          "包含它的出身/由来、性格设定、与品牌或场景的情感联结，以及它想向用户传递的价值。" +
          "【重要】故事要忠于形象描述里的设定（造型、配色、道具等），不要另起一个不相干的形象。" +
          "要求：语言生动亲切，结构自然成段，约200-300字，直接输出故事正文，不要标题、不要分点。",
      },
      {
        role: "user",
        content: `${lines.join("\n")}${supRule}\n\n请为「${name}」撰写一段品牌IP故事。`,
      },
    ];
  }

  // IP 设计：创意描述优化（有/无参考图共用一套模板，按条件动态拼装）
  if (req.scene === "ip") {
    const hasRef = !!req.hasReference;
    // 已填写信息（条件行：偏好颜色 / 画面尺寸 / 参考图片，未填则不出现）
    const lines = [`- 创意描述：${req.description?.trim() || "（未填写）"}`];
    if (req.preferredColors && req.preferredColors.length) {
      lines.push(`- 偏好颜色：${req.preferredColors.join("、")}`);
    }
    if (req.canvasSize) lines.push(`- 画面尺寸：${req.canvasSize}`);
    if (hasRef) lines.push(`- 参考图片：用户已上传参考图`);

    // 任务说明：有参考图时结合图片视觉内容，无参考图时仅依赖创意描述
    const task = hasRef
      ? "用户上传了参考图片，请同时结合参考图片的视觉内容与用户的创意描述，优化为一段适合AI图像生成模型理解的prompt。"
      : "根据用户的创意描述，优化为一段适合AI图像生成模型理解的prompt。";

    return [
      { role: "system", content: IP_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `用户已填写以下信息：\n${lines.join("\n")}\n\n` +
          `## 你的任务\n\n${task}\n\n` +
          `${IP_RULES}`,
      },
    ];
  }

  const brandLine = req.brandAsset && req.brandAsset !== "不套用"
    ? `请贴合品牌资产「${req.brandAsset}」的调性。`
    : "";

  // 公众号帮写：Skill 提示词（微信友好 Markdown 长文）
  if (req.scene === "official") {
    return buildOfficialMessages(req);
  }

  // 社媒推文（朋友圈/小红书，结构化 JSON）
  if (req.scene === "social") {
    const platforms = (req.platforms && req.platforms.length ? req.platforms : ["微信朋友圈"]).join("、");
    const rewrite = req.rewriteSource?.trim();
    const multiHook = rewrite && req.rewriteMode === "同卖点多钩子";
    const needWechat = platforms.includes("微信朋友圈");
    const needXhs = platforms.includes("小红书");
    // 内置平台提示词（各约 500 字）：承接投放意图，稳定产出可直发文案
    const WECHAT_PROMPT =
      "【微信朋友圈文案规范】请以品牌主理人/经营者第一人称写作，像对熟人或老客户说话，不要广告腔、官话和说明书口吻。" +
      "篇幅宜短：通常 60-140 字，最多不超过 180 字；可分段，短句为主，节奏干脆，适合拇指快速浏览。" +
      "结构建议：开场钩子（严格贴合价格钩/产地钩/场景钩/反差钩/限时钩）→ 产品真实卖点 1-2 句（质感、产地、新鲜、口感、冷链或核心优势）→ 自然收束到行动号召（私信/留资/下单/到店/转发），CTA 要具体可执行。" +
      "语气必须贴合用户指定语气；若投放意图是上新、促销、种草、复购或活动预热，信息重心随之调整，突出当下为什么值得看。" +
      "可用 2-5 个贴切 emoji，但不要刷屏；可适度用感叹或紧迫感，但禁止虚假承诺、绝对化用语、医疗功效夸大、虚构折扣数据。" +
      "不要话题标签堆砌，不要小红书式长清单排版，不要写成种草长笔记或公众号段落。" +
      "若有品牌名，可自然点到，但不要硬广刷屏；优先让人记住产品与下一步动作。" +
      "遇到农产品/文旅特产时，可点到时令、产地可信感，但必须服务于转化，不写空洞风光描写。" +
      "成品要能直接复制发朋友圈：一眼看懂推什么、为什么现在看、下一步怎么联系。";
    const XHS_PROMPT =
      "【小红书文案规范】请产出可直发的种草笔记：含吸睛标题、正文、3-6 个话题标签，整体像真实体验分享而非硬广。" +
      "标题 16-28 字左右，含产品关键词 + 钩子利益点（价格/产地/场景/反差/限时），可适度用符号分隔，禁止标题党到失真，禁止医疗功效和绝对化承诺。" +
      "正文 180-420 字：开头 1-2 句建立身份共鸣或痛点；中间用分行/emoji 要点列出 3 个左右卖点（产地、品质、价格、冷链、体验等），每点信息具体；结尾明确行动号召并与用户指定 CTA 一致。" +
      "语气贴合指定语气：口语种草可轻松有画面感，采购专业则可信克制；要有信息增量，避免空泛形容词堆砌和重复口号。" +
      "标签以产品、品类、场景、人群、产地相关为主，真实可用，不要无关热搜硬蹭；标签格式带 #。" +
      "禁止竞品点名攻击、虚假对比、编造销量评价；不要写成朋友圈短文，也不要写成公众号长文。" +
      "若涉及农文旅特产，可融入产地、节令、生活方式场景，但卖点必须清晰，服务种草到转化。" +
      "排版保持手机友好：短段落、要点清晰、结尾有动作，避免大段密文。" +
      "成品目标：停滑、想点开、想收藏或私信，适合农文旅特产种草与转化，可直接复制发布。";
    return [
      {
        role: "system",
        content:
          "你是农文旅领域的社媒文案专家，擅长可直接发布的朋友圈/小红书文案。" +
          "请严格只输出如下结构的 JSON（不要任何额外文字、不要 markdown 代码块）：\n" +
          `{
  "titles": ["吸睛标题/钩子1", "标题2", "标题3"],
  "highlights": [{"tag":"卖点标签","text":"一句话亮点"}],
  "posts": {
    "wechat": {"body":"微信朋友圈正文(口语化、可含emoji/换行)"},
    "xhs": {"title":"小红书标题", "body":"小红书正文", "tags":["#标签1","#标签2"]}
  }
}\n` +
          "仅输出用户已选择的平台对应 posts 字段，未选平台不要输出。" +
          (multiHook
            ? "titles 必须给 5 条不同钩子角度；highlights 给 2 条。"
            : "titles 给 2-3 条，highlights 给 1-2 条。") +
          "正文必须贴合投放意图、钩子类型、语气与行动号召，避免空泛广告腔。" +
          (needWechat ? `\n${WECHAT_PROMPT}` : "") +
          (needXhs ? `\n${XHS_PROMPT}` : ""),
      },
      {
        role: "user",
        content:
          `产品名：${req.product || "（未填写）"}\n` +
          (req.brand ? `品牌名：${req.brand}\n` : "") +
          `目标人群：${req.audience || "通用人群"}\n` +
          (req.advantage ? `产品优势：${req.advantage}\n` : "") +
          `投放意图：${req.intent || "种草"}\n` +
          `钩子类型：${req.hook || "场景钩"}\n` +
          `行动号召：${req.cta || "私信"}\n` +
          `语气：${req.tone || "口语种草"}\n` +
          `推广平台：${platforms}\n` +
          (req.outline ? `各平台内容大纲：\n${req.outline}\n` : "") +
          (rewrite
            ? `【爆款改写】模式：${req.rewriteMode || "换产品改写"}\n原文：\n${rewrite.slice(0, 1000)}\n` +
              (req.rewriteMode === "换产品改写"
                ? "请保留原文结构与节奏，替换为我们的产品/品牌/卖点，去竞品痕迹。\n"
                : req.rewriteMode === "同卖点多钩子"
                  ? "请基于同一核心卖点，产出 5 个不同钩子标题，并给出对应平台正文。\n"
                  : "请把原文改编为所选平台的双端可发版本（朋友圈短、小红书种草）。\n")
            : "") +
          `请据此产出 JSON 社媒推广文案。` +
          (needWechat ? "微信朋友圈请严格遵循【微信朋友圈文案规范】。" : "") +
          (needXhs ? "小红书请严格遵循【小红书文案规范】，须含标题、正文与话题标签。" : ""),
      },
    ];
  }

  // 品牌推广（多平台品牌策划案，结构化 JSON）
  if (req.scene === "brand") {
    const platforms = (req.platforms && req.platforms.length ? req.platforms : ["微信朋友圈"]).join("、");
    return [
      {
        role: "system",
        content:
          "你是农文旅领域的资深品牌营销策划。请基于用户给的品牌与产品信息，产出一份「品牌策划方案」，" +
          "并严格只输出如下结构的 JSON（不要任何额外文字、不要 markdown 代码块）：\n" +
          `{
  "titles": ["营销主标题1", "主标题2", "主标题3"],
  "highlights": [{"tag":"打法标签","text":"亮点文案"}],
  "posts": {
    "wechat": {"body":"微信朋友圈正文(可含emoji/换行)"},
    "xhs": {"title":"小红书标题", "body":"小红书正文", "tags":["#标签1","#标签2"]},
    "douyin": {"title":"抖音标题/钩子", "body":"抖音口播或文案脚本", "tags":["#话题1"]},
    "official": {"title":"公众号标题", "body":"公众号长文正文(>1000字，可含小标题)"}
  }
}\n` +
          "仅输出用户已选择的平台对应 posts 字段，未选平台不要输出。" +
          "titles 给 3 条，highlights 给 2-3 条。" +
          "微信公众号正文需超过 1000 字；朋友圈宜短；小红书偏种草；抖音偏口播节奏。",
      },
      {
        role: "user",
        content:
          `品牌名称及产品类型：${req.product || "（未填写）"}\n` +
          (req.brand ? `品牌备注：${req.brand}\n` : "") +
          `目标市场/人群：${req.audience || "通用人群"}\n` +
          `产品核心优势：${req.advantage || "（未填写）"}\n` +
          (req.input ? `营销目标：${req.input}\n` : "") +
          `推广平台：${platforms}\n` +
          (req.outline ? `各平台内容大纲：\n${req.outline}\n` : "") +
          `请据此产出 JSON 品牌策划方案。`,
      },
    ];
  }

  if (req.scene === "research-brand") {
    return [
      {
        role: "system",
        content:
          "你是资深品牌市场研究分析师，擅长农文旅与区域公用品牌。请输出一份可落地的品牌市场调研报告正文。" +
          "要求：结构清晰、结论明确、给出可执行建议；不要输出JSON，不要输出多余客套话。",
      },
      {
        role: "user",
        content:
          `调研主体：${req.input || "（未填写）"}\n` +
          `时间跨度：${req.length || "近一年数据"}\n` +
          "请按以下结构输出：\n" +
          "1) 调研摘要（3-5行）\n" +
          "2) 市场规模与增速（可给区间判断）\n" +
          "3) 用户画像与消费场景\n" +
          "4) 竞品/对标品牌分析（至少3个）\n" +
          "5) 渠道表现（电商/私域/线下）\n" +
          "6) 机会点与风险点\n" +
          "7) 90天执行建议（分阶段）",
      },
    ];
  }

  if (req.scene === "research-industry") {
    return buildIndustryResearchMessages(req);
  }

  if (req.scene === "research-hotsale") {
    return [
      {
        role: "system",
        content:
          "你是电商增长与爆款分析专家，擅长农产品与食品赛道。请输出一份爆款分析报告，聚焦可复用打法。",
      },
      {
        role: "user",
        content:
          `商品/品类：${req.input || "（未填写）"}\n` +
          `时间跨度：${req.length || "近一年数据"}\n` +
          "请按以下结构输出：\n" +
          "1) 爆款结论摘要\n" +
          "2) 销量趋势与价格带判断\n" +
          "3) 平台表现（淘宝/抖音/小红书/私域）\n" +
          "4) 爆款要素拆解（卖点、包装、内容、人群）\n" +
          "5) 竞争商品对比（至少3类）\n" +
          "6) 可复制打法清单\n" +
          "7) 下阶段测试计划（2-4周）",
      },
    ];
  }

  // 小墨首页对话：每一轮先理解用户再回复
  if (req.scene === "agent-chat") {
    return [
      {
        role: "system",
        content:
          "你是「小墨」，魔方智绘的创意助手。" +
          "只输出对用户说的话：口语、具体、2～5 句。" +
          "不要输出思考过程、规则复述、示例、自检清单或内部流程名。" +
          "不要假装已经出图。用户没说产地特产时不要写具体地名特产。",
      },
      {
        role: "user",
        content: req.input?.trim() || "请结合项目状态，先理解用户意图，再友好询问用户想先做什么。",
      },
    ];
  }

  // 其它（纯文本）
  const tone = req.tone && TONE_HINT[req.tone] ? TONE_HINT[req.tone] : "语气得体";
  return [
    {
      role: "system",
      content:
        "你是农文旅领域的资深品牌文案。请基于用户主题，产出调性统一的品牌推广文案，" +
        "可提炼品牌主张与核心卖点，结构清晰、有感染力。",
    },
    {
      role: "user",
      content:
        `主题/素材：${req.input || "（未填写）"}\n${brandLine}\n要求：${tone}，${lengthHint(req)}。`,
    },
  ];
}
