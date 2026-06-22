/** @type {import('next').NextConfig} */
<<<<<<< HEAD
=======
// 部署到子目录 /mofun 时设 BASE_PATH=/mofun（构建时注入），本地开发留空。
const basePath = process.env.BASE_PATH || "";

>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
const nextConfig = {
  reactStrictMode: true,
  // 关闭开发模式左下角的 Next.js Dev Tools 指示器（N 字圆形按钮）
  devIndicators: false,
<<<<<<< HEAD
  // 跳过构建时的 TypeScript 类型检查（node_modules-2 虚拟目录中的依赖类型问题）
  typescript: {
    ignoreBuildErrors: true,
  },
  // 导出为静态 HTML
  output: 'export',
  distDir: 'mofun',
  // basePath: '/mofun',
};

export default nextConfig;

// Cloudflare（OpenNext）本地开发支持：仅在开发时初始化，不影响生产构建。
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
=======
  // 静态导出：构建产物为纯静态 HTML，部署到 nginx 子目录（仅 EXPORT=1 时启用，本地 dev 不受影响）
  // 导出时排除了 /api 路由，框架自动生成的旧路由类型会误报，故跳过类型检查（类型已在常规 build 验证）
  ...(process.env.EXPORT === "1"
    ? { output: "export", typescript: { ignoreBuildErrors: true } }
    : {}),
  images: { unoptimized: true }, // 静态导出不支持图片优化服务
  // 部署在 /mofun 子目录：让框架资源(_next)、路由、Image 等自动带前缀
  basePath: basePath || undefined,
  // 把 basePath 暴露给客户端，供手写 <img> 的图片路径拼前缀（见 src/lib/asset.ts）
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
>>>>>>> 89f8a5db19e534152e320d08e31d7866ab306664
