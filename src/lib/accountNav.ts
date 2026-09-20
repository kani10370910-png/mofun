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

/** 打开账户相关页时附带 from=当前页；sub 用于会员中心内的算力明细等子页 */
export function accountHref(
  tab: "personal" | "member" | "creations" | "space" | "invite" | string,
  fromPath: string,
  sub?: string,
): string {
  const base =
    tab === "personal" || tab === ""
      ? "/account"
      : `/account?tab=${encodeURIComponent(tab)}`;
  const from = accountReturnPath(fromPath);
  const sep = base.includes("?") ? "&" : "?";
  let href = `${base}${sep}from=${encodeURIComponent(from)}`;
  if (sub) href += `&sub=${encodeURIComponent(sub)}`;
  return href;
}

/** 账户内切换 tab 时保留 from */
export function accountTabHref(tab: string, from: string | null | undefined): string {
  const base = !tab || tab === "personal" ? "/account" : `/account?tab=${encodeURIComponent(tab)}`;
  const ret = accountReturnPath(from);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}from=${encodeURIComponent(ret)}`;
}
