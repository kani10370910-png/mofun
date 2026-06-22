#!/usr/bin/env python3
# 把本地 out/ 通过 SFTP 部署到内网 Nginx（绕过 CI）。
# 密码从环境变量 NGINX_PWD 读取，不写在文件/命令行里。
# 用法：NGINX_PWD=xxx python scripts/deploy_nginx.py
import os, sys, socket, posixpath
import paramiko

HOST = "10.0.120.2"
PORT = 22
USER = "root"
REMOTE = "/data/base/nginx/usr/share/nginx/html/mofun"
LOCAL = os.path.join(os.getcwd(), "out")

# 密码优先从环境变量 NGINX_PWD 读；否则从同目录 .nginx_pwd 文件读（该文件不提交）
pwd = os.environ.get("NGINX_PWD")
if not pwd:
    pwd_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".nginx_pwd")
    if os.path.isfile(pwd_file):
        # utf-8-sig 自动剥掉 BOM；strip 去掉换行/空白，避免混入密码
        with open(pwd_file, "r", encoding="utf-8-sig") as f:
            pwd = f.read().strip().lstrip("﻿")
if not pwd:
    print("缺少密码：请把内网 root 密码写入 scripts/.nginx_pwd 文件（单行），或设 NGINX_PWD 环境变量")
    sys.exit(2)
if not os.path.isdir(LOCAL):
    print(f"本地 out/ 不存在: {LOCAL}")
    sys.exit(2)

cli = paramiko.SSHClient()
cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    # 预先建立 socket 再交给 paramiko，避免某些网络下读不到 SSH banner 的问题
    sock = socket.create_connection((HOST, PORT), timeout=20)
    cli.connect(HOST, port=PORT, username=USER, password=pwd, timeout=25,
                banner_timeout=30, auth_timeout=30,
                allow_agent=False, look_for_keys=False, sock=sock)
except paramiko.AuthenticationException:
    print("认证失败：密码不对，请把正确的 root 密码写入 scripts/.nginx_pwd")
    sys.exit(3)
except Exception as e:
    print(f"连接失败: {e}")
    sys.exit(2)

# 先清空远程目录
print("清空远程目录…")
cli.exec_command(f"mkdir -p {REMOTE}")[1].channel.recv_exit_status()
i, o, e = cli.exec_command(f"rm -rf {REMOTE}/*")
o.channel.recv_exit_status()

sftp = cli.open_sftp()

def ensure_dir(remote_dir):
    parts = remote_dir.strip("/").split("/")
    cur = ""
    for p in parts:
        cur += "/" + p
        try:
            sftp.stat(cur)
        except IOError:
            sftp.mkdir(cur)

count = 0
for root, dirs, files in os.walk(LOCAL):
    rel = os.path.relpath(root, LOCAL)
    rdir = REMOTE if rel == "." else posixpath.join(REMOTE, rel.replace(os.sep, "/"))
    ensure_dir(rdir)
    for fn in files:
        lp = os.path.join(root, fn)
        rp = posixpath.join(rdir, fn)
        sftp.put(lp, rp)
        count += 1
        if count % 50 == 0:
            print(f"  已上传 {count} 个文件…")

sftp.close()
cli.close()
print(f"完成，共上传 {count} 个文件到 {HOST}:{REMOTE}")
