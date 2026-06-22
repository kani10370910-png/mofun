/* ICON_PATHS：线性 SVG 图标库（自 魔方智绘_demo.html 1:1 迁入）
   统一 stroke 风格 · currentColor · 圆角端点。用法：<Icon name="home" /> */
export const ICON_PATHS = {
  // —— 导航 ——
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  content:
    '<path d="M5 3h11l3 3v15a0 0 0 0 1 0 0H5a0 0 0 0 1 0 0V3Z"/><path d="M15 3v4h4"/><path d="M8.5 12h7"/><path d="M8.5 15.5h7"/><path d="M8.5 8.5h3"/>',
  image:
    '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L20 21"/>',
  video:
    '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3V9Z"/>',
  storage:
    '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z"/><path d="M3.5 7.5 12 12l8.5-4.5"/><path d="M12 12v9"/>',
  // —— 内容创作场景 ——
  wechat:
    '<path d="M20 11.5a7.5 6.5 0 0 1-10.5 6L4 19l1.3-3.4A6.5 6.5 0 0 1 12 5a7.5 6.5 0 0 1 8 6.5Z"/><circle cx="9.5" cy="11.5" r=".6" fill="currentColor" stroke="none"/><circle cx="14.5" cy="11.5" r=".6" fill="currentColor" stroke="none"/>',
  official:
    '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 8h7"/><path d="M7 12h10"/><path d="M7 16h10"/>',
  xhs:
    '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 8.5v7"/><path d="M11.5 15.5v-7l3.5 7v-7"/>',
  douyin:
    '<path d="M9 9.5v6.5a3 3 0 1 1-3-3"/><path d="M14 4c.4 2.5 2 4 4.5 4.3"/><path d="M14 4v9"/>',
  shop:
    '<path d="M4 7h16l-1 5.5a3 3 0 0 1-3 2.5H8a3 3 0 0 1-3-2.5L4 7Z"/><path d="M4 7 6.5 3"/><path d="M20 7 17.5 3"/><path d="M9.5 18.5h0"/><path d="M15 18.5h0"/>',
  print:
    '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v6H6z"/><circle cx="17" cy="12" r=".7" fill="currentColor" stroke="none"/>',
  weibo:
    '<circle cx="12" cy="12" r="9"/><path d="M8 13.5a3 3 0 1 0 5.4 1.8c0-2-2.4-2.6-4-1.4"/><path d="M15.5 8.5a2.5 2.5 0 0 1 2.3 3"/>',
  comment:
    '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3a2 2 0 0 1-1-1.7V6Z"/><path d="M8 9h8M8 12h5"/>',
  // —— 图片类型（海报/长图/简历/易拉宝/菜单/三折页/宣传单/招聘广告）——
  imgPoster:
    '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="m7 16 3-3.5 2.5 2.5L16 11l1 1"/><circle cx="9" cy="8" r="1.3"/>',
  imgLong:
    '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10 7h4"/><path d="M10 11h4"/><path d="M10 15h4"/>',
  imgResume:
    '<rect x="4.5" y="3" width="15" height="18" rx="2"/><circle cx="9.5" cy="9" r="1.8"/><path d="M6.8 15.5a2.7 2.7 0 0 1 5.4 0"/><path d="M14.5 9h3"/><path d="M14.5 12.5h3"/>',
  imgRollup:
    '<path d="M7 4h10"/><rect x="6" y="4" width="12" height="13" rx="1.5"/><path d="M12 17v3"/><path d="M9.5 20h5"/>',
  imgMenu:
    '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h4"/>',
  imgTrifold:
    '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M9 6v12"/><path d="M15 6v12"/>',
  imgFlyer:
    '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8"/><path d="M8 13h8"/><path d="M8 16.5h5"/><rect x="13.5" y="8.5" width="3" height="3" rx=".5"/>',
  imgFont:
    '<path d="M6 19 11 5h2l5 14"/><path d="M8 14h8"/>',
  imgLogo:
    '<path d="M12 3.2c2 2.6 2 4.4 5 5-3 .6-3 2.4-5 5-2-2.6-2-4.4-5-5 3-.6 3-2.4 5-5Z"/><circle cx="12" cy="12" r="9"/>',
  imgIp:
    '<circle cx="12" cy="9" r="5"/><circle cx="9.8" cy="8.5" r=".7" fill="currentColor" stroke="none"/><circle cx="14.2" cy="8.5" r=".7" fill="currentColor" stroke="none"/><path d="M10 11c.8.6 3.2.6 4 0"/><path d="M7 21c0-3 2.2-5 5-5s5 2 5 5"/>',
  imgEcom:
    '<path d="M4 7h16l-1.2 8a2 2 0 0 1-2 1.7H7.2a2 2 0 0 1-2-1.7L4 7Z"/><path d="M4 7 6 3.5h12L20 7"/><path d="M9 11h6"/>',
  imgSignage:
    '<path d="M4 9h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Z"/><path d="M4 9 6 4.5h12L20 9"/><path d="M6 14v6h12v-6"/><path d="M10 20v-3h4v3"/>',
  imgScene:
    '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="9.5" r="1.4"/><path d="m3 16 5-4 3.5 3 3-2.5L21 16"/>',
  // —— 图片结果 AI 处理工具 ——
  toolEnhance:
    '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.4-3.4"/><path d="M11 8.5v5M8.5 11h5"/>',
  toolErase:
    '<path d="M8 18 4.5 14.5a2 2 0 0 1 0-2.8l7-7a2 2 0 0 1 2.8 0l3 3a2 2 0 0 1 0 2.8L11 18Z"/><path d="M8 18h11"/><path d="m8.5 8.5 5 5"/>',
  toolMatting:
    '<path d="M5 5h2M11 5h2M17 5h2M5 19h2M11 19h2M17 19h2M5 5v2M5 11v2M5 17v2M19 5v2M19 11v2M19 17v2"/><circle cx="12" cy="12" r="3"/>',
  toolExpand:
    '<path d="M4 9V5a1 1 0 0 1 1-1h4"/><path d="M20 9V5a1 1 0 0 0-1-1h-4"/><path d="M4 15v4a1 1 0 0 0 1 1h4"/><path d="M20 15v4a1 1 0 0 1-1 1h-4"/><path d="M9 12h6M12 9v6"/>',
  toolVector:
    '<rect x="3" y="3" width="4" height="4" rx="1"/><rect x="17" y="3" width="4" height="4" rx="1"/><rect x="3" y="17" width="4" height="4" rx="1"/><rect x="17" y="17" width="4" height="4" rx="1"/><path d="M7 5h10M5 7v10M19 7v10M7 19h10"/>',
  toolRepair:
    '<path d="M3 21s2-1 4-1 3 1 5 1 3-1 5-1 4 1 4 1"/><path d="M14.5 3.5 16 5l-7.5 7.5L6 14l-2 4 4-2 7.5-7.5Z"/>',
  // —— 视频类型（商品展示/功能演示/虚拟模特/短视频广告/促销/品牌/招商）——
  vidShowcase:
    '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M4 7 6.5 3.5h11L20 7"/><path d="m10 13 4 2.5-4 2.5v-5Z"/>',
  vidFeature:
    '<circle cx="12" cy="12" r="3"/><path d="M12 4.5v2M12 17.5v2M19.5 12h-2M6.5 12h-2M17.3 6.7l-1.4 1.4M8.1 15.9l-1.4 1.4M17.3 17.3l-1.4-1.4M8.1 8.1 6.7 6.7"/>',
  vidModel:
    '<circle cx="12" cy="6" r="2.5"/><path d="M12 8.5v7"/><path d="M8 11l4-1 4 1"/><path d="m9 21 3-5 3 5"/>',
  vidShortad:
    '<path d="M3 11v2a1 1 0 0 0 1 1h2l4 3.5V6.5L6 10H4a1 1 0 0 0-1 1Z"/><path d="M14 8.5a4 4 0 0 1 0 7"/><path d="M16.5 6a7 7 0 0 1 0 12"/>',
  vidPromo:
    '<path d="M5 19 9 8l7 3-3 8-8 0Z"/><path d="M9 8 11 4"/><circle cx="16" cy="7" r="1.2"/><path d="M19 11h2"/>',
  vidBrand:
    '<path d="M4 21V9l8-5 8 5v12"/><path d="M4 21h16"/><rect x="9" y="13" width="6" height="8"/><path d="M8 9h8"/>',
  vidInvest:
    '<path d="M7.5 11.5a2.5 2.5 0 0 1 3.5 0l1 1 1-1a2.5 2.5 0 1 1 3.5 3.5L12 19l-4.5-4a2.5 2.5 0 0 1 0-3.5Z"/><path d="M4 7h4M6 5v4"/>',
  // —— 通用 / 工具 ——
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M5 12.5 10 17l9-10"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M10 11v6M14 11v6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  // 分享 / 另存为：缺右上角的方框 + 从框内弧线伸出指向右上的箭头
  share:
    '<path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v10A2.5 2.5 0 0 0 6.5 20h10a2.5 2.5 0 0 0 2.5-2.5V14"/><path d="M9 14c.4-4 3-6.6 8-7"/><path d="M13.5 5.5 19.5 5l-.6 6"/>',
  // —— 尺寸形状图标 ——
  szPortrait: '<rect x="7" y="3" width="10" height="18" rx="1.5"/>',
  szLandscape: '<rect x="3" y="7" width="18" height="10" rx="1.5"/>',
  szSquare: '<rect x="5" y="5" width="14" height="14" rx="1.5"/>',
  szA4: '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  szLong: '<rect x="8.5" y="2.5" width="7" height="19" rx="1"/>',
  szRollup: '<path d="M8 3h8"/><rect x="8.5" y="3" width="7" height="15" rx=".8"/><path d="M12 18v3"/><path d="M9.5 21h5"/>',
  szXstand: '<path d="M7 21 12 4l5 17"/><path d="M9 15h6"/>',
  pencil: '<path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.8-2.8L5 17.5V20Z"/><path d="m14 8 2.8 2.8"/>',
  sparkle:
    '<path d="M12 3.5c.6 3.4 1.6 4.4 5 5-3.4.6-4.4 1.6-5 5-.6-3.4-1.6-4.4-5-5 3.4-.6 4.4-1.6 5-5Z"/><path d="M18.5 14.5c.3 1.4.7 1.8 2 2-1.3.3-1.7.7-2 2-.3-1.3-.7-1.7-2-2 1.3-.2 1.7-.6 2-2Z"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  // 吸管/取色：色相条左侧的取色器入口图标
  eyedropper:
    '<path d="m19.5 4.5-1-1a1.8 1.8 0 0 0-2.5 0l-2 2 3.5 3.5 2-2a1.8 1.8 0 0 0 0-2.5Z"/><path d="m15.5 8.5-8 8L6 20l3.5-1.5 8-8Z"/>',
  attach:
    '<path d="M20 11.5 12.5 19a4.5 4.5 0 0 1-6.4-6.4l7.6-7.6a3 3 0 0 1 4.3 4.3l-7.6 7.6a1.5 1.5 0 0 1-2.1-2.1L12 8"/>',
  upload:
    '<path d="M12 16V5"/><path d="m7.5 9.5 4.5-4.5 4.5 4.5"/><path d="M5 19h14"/>',
  camera:
    '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8 7 9.5 4h5L16 7"/><circle cx="12" cy="13" r="3.2"/>',
  film:
    '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 4v16"/><path d="M17 4v16"/><path d="M3 9h4"/><path d="M3 15h4"/><path d="M17 9h4"/><path d="M17 15h4"/>',
  copy:
    '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5V4.5A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/>',
  heart:
    '<path d="M12 20.5l-1.45-1.32C5.4 14.5 2 11.4 2 7.6 2 5.1 4 3 6.5 3c1.7 0 3.3.8 4.3 2.1l1.2 1.5 1.2-1.5C14.2 3.8 15.8 3 17.5 3 20 3 22 5.1 22 7.6c0 3.8-3.4 6.9-8.55 11.58z"/>',
  refresh:
    '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.7L4 16"/><path d="M4 20v-4h4"/>',
  save:
    '<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M8 3v5h7V3"/><path d="M8 14h8v7H8z"/>',
  edit:
    '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m14 6 4 4"/>',
  download:
    '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 20h14"/>',
  pin: '<path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10Z"/><circle cx="12" cy="11" r="2.2"/>',
  // 置顶：经典图钉（📌 thumbtack）—— 顶部帽 + 钉身 + 下方针尖，用于字体卡片「置顶到列表最前」
  pinTop: '<path d="M9 4h6"/><path d="M10 4l-.5 7-3 2v1.5h11V13l-3-2-.5-7"/><path d="M12 14.5V21"/>',
  thermo: '<path d="M14 14.76V4a2 2 0 0 0-4 0v10.76a4 4 0 1 0 4 0Z"/><path d="M12 9v6"/>',
  gear:
    '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7 5.6 5.6"/>',
  shield:
    '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  outline:
    '<path d="M5 4h14"/><path d="M5 9h14"/><path d="M5 14h9"/><path d="M5 19h9"/>',
} as const;

export type IconName = keyof typeof ICON_PATHS;

/* data key → 图标名 映射（编辑器左侧栏用） */
export const IMG_ICON: Record<string, IconName> = { event: "imgPoster", product: "imgScene", logo: "imgLogo", ip: "imgIp", font: "imgFont", signage: "imgSignage" };
export const VID_ICON: Record<string, IconName> = { oneline: "vidShortad", avatar: "vidShowcase", studio: "vidBrand" };
export const CONTENT_ICON: Record<string, IconName> = { social: "wechat", official: "official", brand: "sparkle" };
export const RESEARCH_ICON: Record<string, IconName> = { brand: "search", industry: "storage", hotsale: "sparkle" };

