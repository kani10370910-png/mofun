#!/usr/bin/env python3
# 极速部署：上传 out.tar.gz 一个包，服务器端解压到 nginx 目录。
import os, socket, time
import paramiko

HOST, PORT, USER = "10.0.120.2", 22, "root"
REMOTE_DIR = "/data/base/nginx/usr/share/nginx/html/mofun"
TAR_LOCAL = "out.tar.gz"
TAR_REMOTE = "/tmp/mofun_out.tar.gz"

with open(os.path.join("scripts", ".nginx_pwd"), "r", encoding="utf-8-sig") as f:
    pwd = f.read().strip()

sock = socket.create_connection((HOST, PORT), timeout=20)
cli = paramiko.SSHClient(); cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect(HOST, PORT, USER, pwd, banner_timeout=30, auth_timeout=30,
            allow_agent=False, look_for_keys=False, sock=sock)

size = os.path.getsize(TAR_LOCAL)
print(f"上传 {TAR_LOCAL} ({size//1024//1024} MB) …", flush=True)
sftp = cli.open_sftp()
last = [0, time.time()]
def cb(sent, total):
    now = time.time()
    if now - last[1] >= 3:
        print(f"  {sent//1024//1024}/{total//1024//1024} MB", flush=True); last[1] = now
sftp.put(TAR_LOCAL, TAR_REMOTE, callback=cb)
sftp.close()
print("上传完成，服务器端解压…", flush=True)

cmd = (f"mkdir -p {REMOTE_DIR} && rm -rf {REMOTE_DIR}/* && "
       f"tar -xzf {TAR_REMOTE} -C {REMOTE_DIR} && rm -f {TAR_REMOTE} && "
       f"find {REMOTE_DIR} -type f | wc -l")
i, o, e = cli.exec_command(cmd)
code = o.channel.recv_exit_status()
out = o.read().decode().strip(); err = e.read().decode().strip()
print(f"解压退出码 {code}，远程文件总数: {out}", flush=True)
if err: print("STDERR:", err, flush=True)
cli.close()
print("✅ 完成" if code == 0 else "⚠ 解压可能失败", flush=True)
