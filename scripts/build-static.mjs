#!/usr/bin/env node
/*
 * 静态导出构建（内网 Nginx 用）：
 * Next.js 的 output:export 不支持服务端 route handler，而本项目有 /api/generate（AI 文案）。
 * 这里在导出前临时把 src/app/api 移走，构建完无论成败都恢复，从而让静态导出成功。
 * 代价：静态版没有「AI 文案策划」后端，其余功能正常。
 *
 * 用法：node scripts/build-static.mjs   （等价于 EXPORT=1 BASE_PATH=/mofun next build，但会排除 API）
 */
import { spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Windows 上 renameSync 常被 dev/杀毒占用 → EPERM，改用 PowerShell Move-Item */
function moveDirSync(from, to) {
  if (process.platform === "win32") {
    if (existsSync(to)) rmSync(to, { recursive: true, force: true });
    const r = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `Move-Item -LiteralPath '${from.replace(/'/g, "''")}' -Destination '${to.replace(/'/g, "''")}' -Force`],
      { stdio: "inherit" },
    );
    if (r.status !== 0) throw new Error(`Move-Item failed: ${from} -> ${to}`);
    return;
  }
  renameSync(from, to);
}

const root = process.cwd();
const apiDir = join(root, "src", "app", "api");
const apiStash = join(root, "src", "app", "_api_stashed");

// 清掉上次构建的类型缓存，避免残留的 /api 路由类型误报
const typesDir = join(root, ".next", "types");
if (existsSync(typesDir)) rmSync(typesDir, { recursive: true, force: true });

let moved = false;
if (existsSync(apiDir)) {
  moveDirSync(apiDir, apiStash);
  moved = true;
  console.log("[build-static] 已临时移走 src/app/api（静态导出不支持后端路由）");
}

function restore() {
  if (moved && existsSync(apiStash)) {
    moveDirSync(apiStash, apiDir);
    console.log("[build-static] 已恢复 src/app/api");
  }
}

// 进程异常退出也要恢复
process.on("exit", restore);
process.on("SIGINT", () => {
  restore();
  process.exit(130);
});

// NEXT_PUBLIC_DEMO=1：静态导出无 /api 后端，数字人模特模块用本地假数据兜底（见 src/lib/demo.ts）
const env = { ...process.env, EXPORT: "1", BASE_PATH: process.env.BASE_PATH || "", NEXT_PUBLIC_DEMO: "1" };
// 直接调用本地 next 可执行文件，避免 alpine/sh 下 npx + shell 的参数与查找问题
const isWin = process.platform === "win32";
const nextBin = join(root, "node_modules", ".bin", isWin ? "next.cmd" : "next");
const cmd = existsSync(nextBin) ? nextBin : "next";
const res = spawnSync(cmd, ["build", "--webpack"], { stdio: "inherit", env, shell: isWin });

restore();
if (res.error) {
  console.error("[build-static] 启动 next build 失败:", res.error.message);
}
process.exit(res.status ?? 1);
