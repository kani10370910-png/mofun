#!/usr/bin/env python3
# 极速代码部署：只上传「代码包」out-code.tar.gz（不含图片/视频），服务器端「叠加解压」到 nginx 目录，
# 不删除已存在的图片——用于「只改了代码、图片没变」的场景，避免整包重传 ~200MB。
# 与 deploy_tar.py 的区别：不做 rm -rf，仅覆盖代码文件；图片沿用上次已传的。
# 密码从 scripts/.nginx_pwd 读（utf-8-sig 自动剥 BOM）。
import os, socket, time
import paramiko

HOST, PORT, USER = "10.0.120.2", 22, "root"
# nginx 容器实际 docroot 是 .../html/out（见 nginx -T：root /usr/share/nginx/html/out）。
# 旧的 deploy_*.py 都误指到 .../mofun，导致部署不生效。这里改到正确目录。
REMOTE_DIR = "/data/base/nginx/usr/share/nginx/html/out"
TAR_LOCAL = "out-code.tar.gz"
TAR_REMOTE = "/tmp/mofun_out_code.tar.gz"

with open(os.path.join("scripts", ".nginx_pwd"), "r", encoding="utf-8-sig") as f:
    pwd = f.read().strip()

sock = socket.create_connection((HOST, PORT), timeout=20)
cli = paramiko.SSHClient()
cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect(HOST, PORT, USER, pwd, banner_timeout=30, auth_timeout=30,
            allow_agent=False, look_for_keys=False, sock=sock)

size = os.path.getsize(TAR_LOCAL)
print(f"上传 {TAR_LOCAL} ({size/1024/1024:.1f} MB) …", flush=True)
sftp = cli.open_sftp()
last = [time.time()]
def cb(sent, total):
    now = time.time()
    if now - last[0] >= 2:
        print(f"  {sent//1024//1024}/{total//1024//1024} MB", flush=True); last[0] = now
sftp.put(TAR_LOCAL, TAR_REMOTE, callback=cb)
sftp.close()
print("上传完成，服务器端叠加解压（保留图片）…", flush=True)

# 关键：不 rm -rf，直接把代码包覆盖解压到目录上，已有图片原样保留。
# 解压后给每个路由目录补 index.html(= 扁平预渲染页)：Next 静态导出产出 video.html + 空的 video/ 目录(仅RSC)，
# nginx 会把 /video 301 到 /video/ 而该目录无 index → 403。补上后深链 /video/ 正确返回预渲染页。
ROUTES = "video content image research storage template"
fix_routes = f"for r in {ROUTES}; do [ -f {REMOTE_DIR}/$r.html ] && cp -f {REMOTE_DIR}/$r.html {REMOTE_DIR}/$r/index.html; done"
cmd = (f"mkdir -p {REMOTE_DIR} && tar -xzf {TAR_REMOTE} -C {REMOTE_DIR} && rm -f {TAR_REMOTE} && "
       f"{fix_routes} && "
       f"find {REMOTE_DIR} -type f | wc -l")
_i, o, e = cli.exec_command(cmd)
code = o.channel.recv_exit_status()
out = o.read().decode().strip(); err = e.read().decode().strip()
print(f"解压退出码 {code}，远程文件总数: {out}", flush=True)
if err:
    print("STDERR:", err, flush=True)
cli.close()
print("[OK] 完成（代码已更新，图片沿用原有）" if code == 0 else "[WARN] 解压可能失败", flush=True)
