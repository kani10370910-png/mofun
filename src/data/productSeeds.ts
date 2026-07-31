import type { EventRunRow } from "@/components/image/ActiveGallery";

/** 商拍·预置生成历史（演示）：补充图换背景假数据，图在 public/productcase/product-mix-seed.png */
export const SEED_PRODUCT_RUNS: EventRunRow[] = [
  {
    id: "seed-pd-mix-1",
    prompt: "图中人物手上端着的茶换成图中的鞋",
    sub: "商品换背景·补充图",
    ratioName: "电商主图1:1",
    time: "2026-07-29 19:03",
    pct: 100,
    imgs: ["/productcase/product-mix-seed.png"],
    grads: ["thumb-grad-1"],
  },
];
