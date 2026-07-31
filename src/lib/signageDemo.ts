/** 店招 DEMO/离线：无 /api/image 时，用预置横图 + canvas 贴店名出图 */

import { DEMO, demoWait } from "@/lib/demo";
import { asset } from "@/lib/asset";

export const DEMO_SIGNAGE_CASES = {
  tea: asset("/signagecase/signage-tea.png"),
  specialty: asset("/signagecase/signage-specialty.png"),
  farm: asset("/signagecase/signage-farm.png"),
} as const;

const DEMO_LIST = [DEMO_SIGNAGE_CASES.tea, DEMO_SIGNAGE_CASES.specialty, DEMO_SIGNAGE_CASES.farm];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("img"));
    img.src = url;
  });
}

function pickBg(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return DEMO_LIST[Math.abs(h) % DEMO_LIST.length];
}

/** 按目标比例输出店招演示图（贴店名 + slogan） */
export async function demoSignageGenerate(opts: {
  shopName: string;
  slogan?: string;
  width: number;
  height: number;
  logoImg?: string;
  industry?: string;
}): Promise<string> {
  await demoWait(700 + Math.min(900, (opts.shopName.length * 80) % 600));
  const w = Math.max(64, Math.round(opts.width) || 1920);
  const h = Math.max(64, Math.round(opts.height) || 150);
  const bgUrl = pickBg(`${opts.shopName}|${opts.industry || ""}`);

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return bgUrl;

  try {
    const bg = await loadImage(bgUrl);
    const scale = Math.max(w / bg.width, h / bg.height);
    const dw = bg.width * scale;
    const dh = bg.height * scale;
    ctx.drawImage(bg, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } catch {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#1a5c3a");
    g.addColorStop(1, "#2d8a5e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // 半透明底条保证店名可读
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(0, h * 0.18, w, h * 0.64);

  const name = (opts.shopName || "店铺名称").slice(0, 16);
  const slogan = (opts.slogan || "").trim().slice(0, 24);
  const nameSize = Math.max(18, Math.min(h * 0.42, w / Math.max(6, name.length * 0.85)));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${nameSize}px "Microsoft YaHei","PingFang SC",sans-serif`;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 6;
  ctx.fillText(name, w / 2, slogan ? h * 0.42 : h * 0.5);

  if (slogan) {
    const subSize = Math.max(12, Math.min(h * 0.2, w / 28));
    ctx.font = `400 ${subSize}px "Microsoft YaHei","PingFang SC",sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(slogan, w / 2, h * 0.68);
  }

  // Logo 小角标（有则贴左）
  if (opts.logoImg) {
    try {
      const logo = await loadImage(opts.logoImg);
      const side = Math.min(h * 0.7, w * 0.08);
      const lx = w * 0.04;
      const ly = (h - side) / 2;
      ctx.shadowBlur = 0;
      ctx.drawImage(logo, lx, ly, side, side);
    } catch { /* ignore */ }
  }

  ctx.shadowBlur = 0;
  return c.toDataURL("image/jpeg", 0.92);
}

export function shouldUseSignageDemo(): boolean {
  return DEMO;
}
