/** 商拍抠图换底：本地 WASM 抠图 + 可选铺底色 */

import { imgToDataUrl } from "@/lib/image";

export async function cutoutProduct(
  srcUrl: string,
  mode: "white" | "transparent" | "color",
  color = "#ffffff",
): Promise<string> {
  const { removeBackground } = await import("@imgly/background-removal");
  // blob/data/同源路径均可；远程 http(s) 先转 data URL 再喂 WASM
  let srcBlob: Blob;
  if (srcUrl.startsWith("blob:") || srcUrl.startsWith("data:")) {
    const resp = await fetch(srcUrl);
    srcBlob = await resp.blob();
  } else if (/^https?:\/\//.test(srcUrl) || srcUrl.startsWith("/")) {
    const data = await imgToDataUrl(srcUrl);
    if (!data) throw new Error("image_load");
    const resp = await fetch(data);
    srcBlob = await resp.blob();
  } else {
    const resp = await fetch(srcUrl);
    srcBlob = await resp.blob();
  }

  const cutout = await removeBackground(srcBlob);
  if (mode === "transparent") {
    return await blobToDataUrl(cutout);
  }
  const cutUrl = URL.createObjectURL(cutout);
  try {
    const img = await loadImage(cutUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = mode === "color" ? color : "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(cutUrl);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(blob);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("img"));
    img.src = url;
  });
}
