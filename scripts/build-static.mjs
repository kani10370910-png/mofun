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

const root = process.cwd();
const apiDir = join(root, "src", "app", "api");
const apiStash = join(root, "src", "app", "_api_stashed");

// 清掉上次构建的类型缓存，避免残留的 /api 路由类型误报
const typesDir = join(root, ".next", "types");
if (existsSync(typesDir)) rmSync(typesDir, { recursive: true, force: true });

let moved = false;
if (existsSync(apiDir)) {
  renameSync(apiDir, apiStash);
  moved = true;
  console.log("[build-static] 已临时移走 src/app/api（静态导出不支持后端路由）");
}

function restore() {
  if (moved && existsSync(apiStash)) {
    renameSync(apiStash, apiDir);
    console.log("[build-static] 已恢复 src/app/api");
  }
}

// 进程异常退出也要恢复
process.on("exit", restore);
process.on("SIGINT", () => {
  restore();
  process.exit(130);
});

const env = { ...process.env, EXPORT: "1", BASE_PATH: process.env.BASE_PATH || "/mofun" };
const res = spawnSync("npx", ["next", "build"], { stdio: "inherit", env, shell: true });

restore();
process.exit(res.status ?? 1);
