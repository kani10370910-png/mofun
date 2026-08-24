/** @type {(phase: string) => import('next').NextConfig} */
export default function config(phase) {
  // 本地开发（next dev）绝不能走静态导出，否则 /api/* 路由全部 500、本地调不了任何后端接口。
  // 即使当前终端残留了 EXPORT=1 / STANDALONE=1，也在 dev 阶段强制忽略，保证 API 始终可用。
  const isDev = phase === "phase-development-server";
  const wantExport = !isDev && process.env.EXPORT === "1";
  const wantStandalone = !isDev && process.env.STANDALONE === "1";

  // 部署到子目录 /mofun 时设 BASE_PATH=/mofun（构建时注入），本地开发留空。
  const basePath = isDev ? "" : process.env.BASE_PATH || "";

  return {
    reactStrictMode: true,
    // 关闭开发模式左下角的 Next.js Dev Tools 指示器（N 字圆形按钮）
    devIndicators: false,
    // 静态导出：构建产物为纯静态 HTML，部署到 nginx 子目录（仅生产构建 + EXPORT=1 时启用）
    // 导出时排除了 /api 路由，框架自动生成的旧路由类型会误报，故跳过类型检查（类型已在常规 build 验证）
    ...(wantExport
      ? { output: "export", typescript: { ignoreBuildErrors: true } }
      : {}),
    // Node 全栈部署：STANDALONE=1 时产出 .next/standalone（自带最小依赖，服务器免 npm install）
    ...(wantStandalone ? { output: "standalone" } : {}),
    images: { unoptimized: true }, // 静态导出不支持图片优化服务
    // 部署在 /mofun 子目录：让框架资源(_next)、路由、Image 等自动带前缀
    basePath: basePath || undefined,
    // 把 basePath 暴露给客户端，供手写 <img> 的图片路径拼前缀（见 src/lib/asset.ts）
    env: { NEXT_PUBLIC_BASE_PATH: basePath },
    // 跨源隔离头：让 onnxruntime-web 用 SharedArrayBuffer 多线程（RVM 抠像提速）。
    // 注意：静态导出不生成响应头，生产需在 nginx 配同样两个头（见 scripts/DEPLOY 说明）。
    // COEP 用 credentialless，避免破坏跨源图片/视频加载。
    ...(wantExport
      ? {}
      : {
          async headers() {
            return [
              {
                source: "/:path*",
                headers: [
                  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
                  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
                ],
              },
            ];
          },
        }),
  };
}
