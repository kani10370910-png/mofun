/** 账户页返回来源：校验可回跳的站内路径 */
export function accountReturnPath(from: string | null | undefined): string {
  if (!from) return "/";
  const path = from.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  if (
    path.startsWith("/account") ||
    path.startsWith("/login") ||
    path.startsWith("/enterprise")
  ) {
    return "/";
  }
  return path;
}

/** 打开账户相关页时附带 from=当前页 */
export function accountHref(tab: "personal" | "member" | "creations" | "org" | string, fromPath: string): string {
  const base =
    tab === "personal" || tab === ""
      ? "/account"
      : `/account?tab=${encodeURIComponent(tab)}`;
  const from = accountReturnPath(fromPath);
  if (from === "/") {
    // 仍带 from=/ ，便于账户内切换 tab 时保留；退出时回首页
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}from=${encodeURIComponent(from)}`;
  }
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}from=${encodeURIComponent(from)}`;
}

/** 账户内切换 tab 时保留 from */
export function accountTabHref(tab: string, from: string | null | undefined): string {
  const base = !tab || tab === "personal" ? "/account" : `/account?tab=${encodeURIComponent(tab)}`;
  const ret = accountReturnPath(from);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}from=${encodeURIComponent(ret)}`;
}
