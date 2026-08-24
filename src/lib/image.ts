/* 图片相关的前端工具。 */

/* 把远程图片地址换成可安全显示的同源地址：
   Seedream 等返回的 volces/三方 URL 直接 <img src> 会因防盗链/CORS/本机代理而加载失败（裂图），
   经 /api/proxy-image 由服务端代理后以图片字节内联返回即可正常显示。
   - http(s):  → /api/proxy-image?url=...
   - blob:/data:/同源相对路径 → 原样返回（本就能显示） */
export function displaySrc(src?: string): string {
  if (!src) return "";
  if (/^https?:\/\//.test(src)) return `/api/proxy-image?url=${encodeURIComponent(src)}`;
  return src;
}

/* 把任意来源的图片（data: / blob: / http(s):）统一转成 base64 data URL。
   用于图生图：Seedream 的 image 参数接受 data URL，故本地 blob: 上传图也能保人物一致。
   - data: 直接返回
   - blob: 同源，直接 fetch→FileReader
   - http(s): 可能跨域，经 /api/proxy-image 同源代理后再读
   失败返回 ""，调用方据此决定是否退回纯文生图。 */
export async function imgToDataUrl(src: string): Promise<string> {
  if (!src) return "";
  if (src.startsWith("data:")) return src;
  try {
    // blob: 同源直读；http(s): 经代理防盗链；站内绝对路径（/productcase/...）直接 fetch，勿误走代理
    const fetchUrl = src.startsWith("blob:")
      ? src
      : /^https?:\/\//.test(src)
        ? `/api/proxy-image?url=${encodeURIComponent(src)}`
        : src;
    const res = await fetch(fetchUrl);
    if (!res.ok) return "";
    const blob = await res.blob();
    if (!blob.type.startsWith("image/") && !blob.type.startsWith("application/octet-stream")) {
      // 部分静态服不回 image/*，仍尝试按图读
      if (!blob.size) return "";
    }
    return await new Promise<string>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : "");
      fr.onerror = () => resolve("");
      fr.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

/* 读取一张图片的真实像素尺寸（自然宽高）。
   用于「生成相似图」按样图尺寸/比例出图：传入参考图（data:/blob:/http(s):）→ 返回 {w,h}。
   传 data URL 最稳（无跨域）；失败返回 null，调用方回退到用户所选比例。 */
export async function imageNaturalSize(
  src: string,
): Promise<{ w: number; h: number } | null> {
  if (!src) return null;
  // http(s) 直接给 <img> 可能被防盗链/CORS 拦，先转同源 data URL 再量尺寸
  const usable = /^https?:\/\//.test(src) ? await imgToDataUrl(src) : src;
  if (!usable) return null;
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve(
        img.naturalWidth && img.naturalHeight
          ? { w: img.naturalWidth, h: img.naturalHeight }
          : null,
      );
    img.onerror = () => resolve(null);
    img.src = usable;
  });
}

/** 出图单边像素上限（电商超长详情页可达 1 万；再高按比例压回，避免上游拒收）。 */
export const IMAGE_MAX_SIDE_PX = 10000;
const IMAGE_MIN_SIDE_PX = 64;

/** 从修改需求/描述里解析目标像素尺寸（宽×高）。图生图时写入 API size，避免只写在文案里却按默认正方形出图。 */
export function parsePxDimensionsFromPrompt(text: string): { w: number; h: number } | null {
  const t = text.trim();
  if (!t) return null;

  // 允许到 6 位数字（如 10000），超出上限时在 normalize 里按比例压回，不再整段丢弃
  const widthM = t.match(/宽\s*(\d{2,6})\s*(?:px|像素)?/i);
  const heightM = t.match(/高\s*(\d{2,6})\s*(?:px|像素)?/i);
  const lengthM = t.match(/长\s*(\d{2,6})\s*(?:px|像素)?/i);

  let w = widthM ? Number(widthM[1]) : 0;
  let h = heightM ? Number(heightM[1]) : 0;
  if (!h && lengthM) h = Number(lengthM[1]);

  if (w && h) return normalizeParsedDimensions(w, h, t);

  const pairM =
    t.match(/(\d{2,6})\s*(?:px\s*)?[×x*]\s*(\d{2,6})\s*(?:px|像素)?/i) ??
    t.match(/(\d{2,6})\s*(?:px|像素)?\s*[×x*]\s*(\d{2,6})/i);
  if (pairM) {
    w = Number(pairM[1]);
    h = Number(pairM[2]);
    return normalizeParsedDimensions(w, h, t);
  }

  return null;
}

function normalizeParsedDimensions(w: number, h: number, text: string): { w: number; h: number } | null {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < IMAGE_MIN_SIDE_PX || h < IMAGE_MIN_SIDE_PX) {
    return null;
  }
  // 电商长图/竖版：用户常把「长/宽」写反（如长1080宽6000），按竖版长图纠正为宽<高
  if (/长图|竖版|详情页|scroll/i.test(text) && w > h) [w, h] = [h, w];
  // 超单边上限时按比例缩小（保留长宽比），不再 return null 导致退回默认正方形
  const maxSide = Math.max(w, h);
  if (maxSide > IMAGE_MAX_SIDE_PX) {
    const s = IMAGE_MAX_SIDE_PX / maxSide;
    w = Math.max(IMAGE_MIN_SIDE_PX, Math.round(w * s));
    h = Math.max(IMAGE_MIN_SIDE_PX, Math.round(h * s));
  }
  return { w, h };
}

/** Seedream 5.0 等上游出图像素下限（约 1920²） */
export const SEEDREAM_MIN_PIXELS = 3_686_400;
const SEEDREAM_MAX_SIDE = 10_000;

/**
 * 界面显示宽高 → 实际送 Seedream 的 WxH。
 * 规则与工作台一致：总像素不足 369 万则按比例放大，取整到 8；已足够大则保持。
 * 例：1080×1080 → 1920×1920；1800×1080 → 约 2480×1488。
 */
export function seedreamOutputSize(uiW: number, uiH: number): string {
  let w = Math.max(1, Number(uiW) || 1);
  let h = Math.max(1, Number(uiH) || 1);
  const maxSide = Math.max(w, h);
  if (maxSide > SEEDREAM_MAX_SIDE) {
    const s = SEEDREAM_MAX_SIDE / maxSide;
    w = Math.max(64, Math.round(w * s));
    h = Math.max(64, Math.round(h * s));
  }
  const pixels = w * h;
  const scale = pixels < SEEDREAM_MIN_PIXELS ? Math.sqrt(SEEDREAM_MIN_PIXELS / pixels) : 1;
  const round8 = (n: number) => Math.ceil((n * scale) / 8) * 8;
  return `${round8(w)}x${round8(h)}`;
}

/** 解析「1080 × 1800 px」类文案为宽高；失败返回 null */
export function parseDisplaySize(sizeText: string): { w: number; h: number } | null {
  const m = sizeText.match(/(\d+(?:\.\d+)?)\s*[×x:：]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const w = Number(m[1]) || 0;
  const h = Number(m[2]) || 0;
  if (!w || !h) return null;
  return { w, h };
}

/**
 * IP 创新设计：强制白底约束（前置，权重更高）。
 * 水彩/插画风常把「纯白背景」理解成纸张肌理，故显式禁止肌理/晕染，并始终前置，不因用户已写白底而跳过。
 */
export const IP_WHITE_BG_PREFIX =
  "【强制白底】纯白色背景#FFFFFF，电商抠图白底，无纸张肌理、无水彩晕染、无纹理、无渐变、无地面阴影场景、无杂物。";

/** 禁止把角色名/标题画进 IP 图（避免底部名牌、悬浮字等） */
export const IP_NO_NAME_ON_IMAGE =
  "【禁止画面文字】画面中不要出现角色名称、标题、名牌、字幕、水印或任何可读汉字与字母；角色名只作文案设定，禁止写在图上。";

export function enforceIpWhiteBg(prompt: string): string {
  const body = (prompt || "").trim();
  if (!body) return IP_WHITE_BG_PREFIX;
  if (body.startsWith("【强制白底】")) return body;
  return `${IP_WHITE_BG_PREFIX}${body}`;
}

/** IP 创新设计送模：白底 + 禁止画面出现角色名等文字 */
export function enforceIpCreatePrompt(prompt: string): string {
  let body = (prompt || "").trim();
  // 去掉旧版「服装文字强制」（易诱发把名字/标语画进画面）
  body = body.replace(/【服装文字强制】[^【]*/g, "").replace(/[。．.，,\s]+$/g, "").trim();
  body = enforceIpWhiteBg(body);
  if (body.includes("【禁止画面文字】")) return body;
  return `${body.replace(/[。．.]*$/, "")}。${IP_NO_NAME_ON_IMAGE}`;
}

/** 从创意描述提取 IP 角色名：优先开头名（如「茶小乐变身…」），避免误取胸前标语等引号文案 */
export function extractIpTitle(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "IP 形象";
  const lead = t.match(
    /^([一-龥A-Za-z0-9]{2,10})(?=变身|[，,：:\s]|是一位|是一个|是只|是个|IP|吉祥物|形象|角色)/,
  );
  if (lead?.[1]) return lead[1];
  // 仅看描述开头一段，避免「共富茶香」等服饰文字抢标题
  const headQ = t.slice(0, 28).match(/[「“"'『]([^」”"'』]{1,10})[」”"'』]/);
  if (headQ?.[1]) return headQ[1];
  return t.slice(0, 8) || "IP 形象";
}
