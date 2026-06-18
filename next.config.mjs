/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 关闭开发模式左下角的 Next.js Dev Tools 指示器（N 字圆形按钮）
  devIndicators: false,
  // 跳过构建时的 TypeScript 类型检查（node_modules-2 虚拟目录中的依赖类型问题）
  typescript: {
    ignoreBuildErrors: true,
  },
  // 导出为静态 HTML
  output: 'export',
  basePath: '/mofun',
};

export default nextConfig;

// Cloudflare（OpenNext）本地开发支持：仅在开发时初始化，不影响生产构建。
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
