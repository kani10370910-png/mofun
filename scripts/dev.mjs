// 本地开发启动器：强制清除导出/独立部署相关的环境变量后再拉起 next dev。
// 目的：避免终端里残留 EXPORT=1 / STANDALONE=1（常见于跑过内网部署脚本的同一会话），
// 否则 dev server 会以 output:"export" 静态导出模式运行，导致 /api/* 路由全部 500，
// 本地无法调用任何后端 API（图转文 /api/vision、生图 /api/image、联想 /api/generate 等）。
import { spawn } from "node:child_process";

// 显式剔除会切换构建模式的变量，保证本地开发始终是完整的 Node 服务端（API 可用）。
delete process.env.EXPORT;
delete process.env.STANDALONE;
// basePath 只用于子目录部署，本地开发应留空，避免资源/接口带上 /mofun 前缀。
delete process.env.BASE_PATH;

const args = ["dev", "--webpack", ...process.argv.slice(2)];
const child = spawn("next", args, {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("[dev] 启动 next dev 失败：", err);
  process.exit(1);
});
