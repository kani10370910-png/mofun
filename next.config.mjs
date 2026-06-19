/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 关闭开发模式左下角的 Next.js Dev Tools 指示器（N 字圆形按钮）
  devIndicators: false,
};

export default nextConfig;

// Cloudflare（OpenNext）本地开发支持：仅在开发时初始化，不影响生产构建。
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
