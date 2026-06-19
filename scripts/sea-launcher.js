// SEA 启动器：被注入进 启动.exe。双击 exe 时运行此脚本——
// 定位 exe 所在目录，启动 Next standalone server.js（隐藏控制台），并打开浏览器。
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// exe 所在目录：SEA 下 process.execPath 即 启动.exe 的完整路径
const dir = path.dirname(process.execPath);
const serverJs = path.join(dir, "server.js");

if (!fs.existsSync(serverJs)) {
  // 找不到说明 exe 被单独拿出文件夹了
  spawn("cmd", ["/c", "echo 请把 启动.exe 放在解压后的文件夹内运行（需与 server.js 同级）。& pause"], {
    shell: true,
    stdio: "inherit",
  });
  return;
}

const PORT = "3300";
const nodeExe = fs.existsSync(path.join(dir, "node-runtime", "node.exe"))
  ? path.join(dir, "node-runtime", "node.exe")
  : "node";

// 后台启动服务器（脱离控制台，detached + 隐藏窗口）
const child = spawn(nodeExe, [serverJs], {
  cwd: dir,
  env: { ...process.env, PORT, HOSTNAME: "127.0.0.1" },
  detached: true,
  stdio: "ignore",
  windowsHide: true,
});
child.unref();

// 等服务器就绪后打开浏览器
setTimeout(() => {
  spawn("cmd", ["/c", "start", "", `http://127.0.0.1:${PORT}/`], { detached: true, stdio: "ignore" }).unref();
  // 启动器自身退出，服务器已 detached 在后台继续跑
  process.exit(0);
}, 3500);
