/** 全站四季主题色 */
export type HomeSeason = "spring" | "summer" | "autumn" | "winter";

export const HOME_SEASONS: { id: HomeSeason; label: string }[] = [
  { id: "spring", label: "芳华之春" },
  { id: "summer", label: "葱茏之夏" },
  { id: "autumn", label: "丰饶之秋" },
  { id: "winter", label: "静谧之冬" },
];

export const HOME_SEASON_KEY = "mofun_home_season_v1";
export const HOME_SEASON_EVENT = "mofun-home-season";

/** 各季节品牌主色（来自用户色板） */
export const SEASON_THEMES: Record<
  HomeSeason,
  {
    primary: string;
    dark: string;
    soft: string;
    bg: string;
    rgb: string;
  }
> = {
  spring: {
    primary: "#1B9D39",
    dark: "#15802E",
    soft: "#E6F7EA",
    bg: "#F3FBF5",
    rgb: "27, 157, 57",
  },
  summer: {
    primary: "#218673",
    dark: "#196A5B",
    soft: "#E4F5F1",
    bg: "#F3FBF9",
    rgb: "33, 134, 115",
  },
  autumn: {
    primary: "#FEA933",
    dark: "#D4890F",
    soft: "#FFF5E6",
    bg: "#FFFAF2",
    rgb: "254, 169, 51",
  },
  winter: {
    primary: "#1BACAF",
    dark: "#15898B",
    soft: "#E0F6F7",
    bg: "#F0FAFA",
    rgb: "27, 172, 175",
  },
};

export function readHomeSeason(): HomeSeason {
  if (typeof window === "undefined") return "summer";
  const v = window.localStorage.getItem(HOME_SEASON_KEY);
  if (v === "spring" || v === "summer" || v === "autumn" || v === "winter") return v;
  return "summer";
}

/** 把季节主题写到 <html>，驱动全站 CSS 变量 */
export function applyHomeSeasonTheme(season: HomeSeason) {
  if (typeof document === "undefined") return;
  const theme = SEASON_THEMES[season];
  const root = document.documentElement;
  root.setAttribute("data-season", season);
  root.style.setProperty("--c-primary", theme.primary);
  root.style.setProperty("--c-primary-dark", theme.dark);
  root.style.setProperty("--c-primary-soft", theme.soft);
  root.style.setProperty("--c-primary-bg", theme.bg);
  root.style.setProperty("--c-primary-rgb", theme.rgb);
}

export function writeHomeSeason(season: HomeSeason) {
  window.localStorage.setItem(HOME_SEASON_KEY, season);
  applyHomeSeasonTheme(season);
  window.dispatchEvent(new CustomEvent(HOME_SEASON_EVENT, { detail: season }));
}
