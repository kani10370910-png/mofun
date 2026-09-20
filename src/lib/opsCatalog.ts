import { logoStyles as localLogoStyles } from "@/data/image";
import type { LogoStyle } from "@/lib/types";

const OPS = process.env.NEXT_PUBLIC_OPS_API_BASE || "http://localhost:4100";

export type OpsLogoStyle = LogoStyle & { prompt?: string };

let cache: OpsLogoStyle[] | null = null;
let inflight: Promise<OpsLogoStyle[]> | null = null;

export function getLogoStylesCached(): OpsLogoStyle[] {
  return cache || localLogoStyles;
}

export function loadLogoStyles(): Promise<OpsLogoStyle[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch(`${OPS}/public/app/logo/styles`)
    .then((r) => {
      if (!r.ok) throw new Error("ops");
      return r.json() as Promise<{ list: { name: string; prompt: string; icon_url: string }[] }>;
    })
    .then((data) => {
      cache = (data.list || []).map((x, i) => ({
        key: x.name.includes("智能匹配") ? "auto" : `ops-${i}`,
        name: x.name,
        emoji: "",
        grad: "thumb-grad-1" as const,
        img: x.icon_url || undefined,
        prompt: x.prompt,
      }));
      if (!cache.length) cache = localLogoStyles;
      return cache;
    })
    .catch(() => {
      cache = localLogoStyles;
      return cache;
    });
  return inflight;
}

export function fillOpsPrompt(template: string, brand: string, desc: string) {
  return template
    .replaceAll("品牌名称", brand.trim() || "品牌")
    .replaceAll("用户提示", desc.trim() || "");
}
