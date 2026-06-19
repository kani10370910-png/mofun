// 给 public 下的静态资源（手写 <img src> 的图片等）拼接 basePath 前缀。
// 部署到子目录 /mofun 时，BASE_PATH=/mofun 会让图片路径变成 /mofun/webfont/x.png；
// 本地开发 BASE_PATH 为空，路径保持 /webfont/x.png 不变。
// 注意：Next 的 basePath 只会自动给 _next 资源/<Link>/<Image> 加前缀，
//       手写的 <img src="/..."> 不会自动加，所以统一用本函数包一下。
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function asset(path: string): string {
  if (!path) return path;
  // 外链或 data URI 原样返回
  if (/^(https?:)?\/\//.test(path) || path.startsWith("data:")) return path;
  // 只给以 / 开头的站内绝对路径加前缀
  if (path.startsWith("/")) return `${BASE_PATH}${path}`;
  return path;
}
