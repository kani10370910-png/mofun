/* 按品牌名 + 风格动态生成 logo SVG（dataURL）。
   图片生成保持模拟，但让结果体现用户输入的品牌名 —— 不同风格给不同版式/配色。 */

// 一组协调的配色（主色 / 辅色）
const PALETTES: { main: string; soft: string; bg: string }[] = [
  { main: "#188772", soft: "#7fc8b8", bg: "#eef6f3" },
  { main: "#d97d1a", soft: "#f3b96a", bg: "#fdf3e7" },
  { main: "#3358c4", soft: "#8aa3e8", bg: "#eef1fb" },
  { main: "#b03a5b", soft: "#e08aa0", bg: "#fbeef2" },
  { main: "#5a3da6", soft: "#a991dd", bg: "#f2eefb" },
  { main: "#2f7a93", soft: "#86bccb", bg: "#eef6f8" },
];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 取品牌名首字符（中文取首字，英文取首字母大写）做图形主体
function mark(brand: string): string {
  const t = brand.trim();
  if (!t) return "M";
  const ch = t[0];
  return /[a-zA-Z]/.test(ch) ? ch.toUpperCase() : ch;
}

/** 生成一张 logo 的 SVG 字符串（按风格不同版式） */
export function buildLogoSvg(brand: string, style: string, variant: number): string {
  const p = PALETTES[variant % PALETTES.length];
  const name = esc(brand.trim() || "品牌名");
  const m = esc(mark(brand));
  const W = 512;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">`;
  const bg = `<rect width="${W}" height="${W}" fill="#ffffff"/>`;

  let graphic = "";
  let nameStyle = `font-weight="800" fill="${p.main}"`;
  let nameFont = `font-family="'PingFang SC','Microsoft YaHei',sans-serif"`;
  let nameSize = 56;

  switch (style) {
    case "图文插画":
      // 圆形场景 + 首字
      graphic = `<g transform="translate(256 196)">
        <circle r="92" fill="${p.bg}"/>
        <circle r="92" fill="none" stroke="${p.main}" stroke-width="4"/>
        <text x="0" y="6" font-size="84" font-weight="800" fill="${p.main}" text-anchor="middle" dominant-baseline="middle" ${nameFont}>${m}</text>
        <path d="M-60 60 Q0 30 60 60" fill="none" stroke="${p.soft}" stroke-width="6" stroke-linecap="round"/>
      </g>`;
      break;
    case "图文简约":
      graphic = `<g transform="translate(256 196)">
        <rect x="-70" y="-70" width="140" height="140" rx="30" fill="none" stroke="${p.main}" stroke-width="6"/>
        <text x="0" y="6" font-size="78" font-weight="800" fill="${p.main}" text-anchor="middle" dominant-baseline="middle" ${nameFont}>${m}</text>
      </g>`;
      break;
    case "文字logo":
      // 以文字为主体，加印章方块
      graphic = `<g transform="translate(256 180)">
        <rect x="-16" y="-40" width="32" height="32" rx="4" fill="${p.main}"/>
        <text x="0" y="-18" font-size="22" fill="#fff" text-anchor="middle" dominant-baseline="middle" ${nameFont}>${m}</text>
      </g>`;
      nameSize = 64;
      nameFont = `font-family="'STKaiti','KaiTi',serif"`;
      break;
    case "字母logo":
      graphic = `<g transform="translate(256 196)">
        <circle r="84" fill="${p.main}"/>
        <text x="0" y="6" font-size="92" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif">${m}</text>
      </g>`;
      break;
    case "经典徽章":
      graphic = `<g transform="translate(256 196)">
        <path d="M-78 -78 H78 V40 Q78 92 0 110 Q-78 92 -78 40 Z" fill="${p.main}"/>
        <path d="M-66 -66 H66 V36 Q66 80 0 96 Q-66 80 -66 36 Z" fill="none" stroke="#fff" stroke-width="3"/>
        <text x="0" y="0" font-size="58" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="middle" ${nameFont}>${m}</text>
      </g>`;
      break;
    case "新中式":
      graphic = `<g transform="translate(256 196)">
        <circle r="86" fill="none" stroke="${p.main}" stroke-width="5"/>
        <circle r="70" fill="${p.bg}"/>
        <text x="0" y="4" font-size="72" fill="${p.main}" text-anchor="middle" dominant-baseline="middle" font-family="'STKaiti','KaiTi',serif">${m}</text>
      </g>`;
      nameFont = `font-family="'STKaiti','KaiTi',serif"`;
      break;
    case "扁平矢量":
      graphic = `<g transform="translate(256 196)">
        <circle cx="-28" cy="0" r="56" fill="${p.main}"/>
        <circle cx="28" cy="0" r="56" fill="${p.soft}" opacity="0.85"/>
        <text x="0" y="6" font-size="56" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="middle" ${nameFont}>${m}</text>
      </g>`;
      break;
    case "日系线条":
      graphic = `<g transform="translate(256 196)" fill="none" stroke="${p.main}" stroke-width="4" stroke-linecap="round">
        <circle r="84"/>
        <path d="M-60 24 Q-20 -6 0 18 Q20 42 60 12"/>
        <path d="M0 -84 L0 -64"/>
      </g>`;
      nameFont = `font-family="'STKaiti','Songti SC',serif"`;
      nameStyle = `font-weight="600" fill="#2b2b2b"`;
      nameSize = 50;
      break;
    default: // 智能匹配
      graphic = `<g transform="translate(256 196)">
        <circle r="86" fill="${p.bg}"/>
        <text x="0" y="6" font-size="84" font-weight="800" fill="${p.main}" text-anchor="middle" dominant-baseline="middle" ${nameFont}>${m}</text>
      </g>`;
  }

  // 品牌名（可能多字，自动缩小）
  const fit = name.length > 6 ? Math.max(30, Math.floor(nameSize * (6 / name.length))) : nameSize;
  const label = `<text x="256" y="360" font-size="${fit}" ${nameStyle} text-anchor="middle" ${nameFont} letter-spacing="2">${name}</text>`;

  return `${head}${bg}${graphic}${label}</svg>`;
}

/** 转成可直接用于 <img src> 的 dataURL */
export function logoSvgDataUrl(brand: string, style: string, variant: number): string {
  const svg = buildLogoSvg(brand, style, variant);
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
