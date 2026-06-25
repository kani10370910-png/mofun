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
    const fetchUrl = src.startsWith("blob:")
      ? src
      : `/api/proxy-image?url=${encodeURIComponent(src)}`;
    const blob = await (await fetch(fetchUrl)).blob();
    if (!blob.type.startsWith("image/")) return "";
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
