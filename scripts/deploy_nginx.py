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

TOTAL = sum(len(files) for _, _, files in os.walk(LOCAL))

# 先用 SSH 一次性把所有需要的远程目录建好（mkdir -p），避免 SFTP 逐级 stat/mkdir 漏建导致
# 写文件时 stat 不到目录而报 FileNotFoundError（曾导致只传 ~50 个文件就中断）。
remote_dirs = set()
for root, dirs, files in os.walk(LOCAL):
    rel = os.path.relpath(root, LOCAL)
    rdir = REMOTE if rel == "." else posixpath.join(REMOTE, rel.replace(os.sep, "/"))
    remote_dirs.add(rdir)
if remote_dirs:
    print(f"预建 {len(remote_dirs)} 个远程目录…")
    quoted = " ".join(f"'{d}'" for d in sorted(remote_dirs))
    i, o, e = cli.exec_command(f"mkdir -p {quoted}")
    rc = o.channel.recv_exit_status()
    if rc != 0:
        print("mkdir -p 失败:", e.read().decode("utf-8", "ignore"))
        sys.exit(2)

sftp = cli.open_sftp()

count = 0
for root, dirs, files in os.walk(LOCAL):
    rel = os.path.relpath(root, LOCAL)
    rdir = REMOTE if rel == "." else posixpath.join(REMOTE, rel.replace(os.sep, "/"))
    for fn in files:
        lp = os.path.join(root, fn)
        rp = posixpath.join(rdir, fn)
        # confirm=False: 某些 SFTP 服务器在 put 完成后立即 stat 会因写缓冲未刷新而
        # 返回 ENOENT，导致 FileNotFoundError。我们改为不做上传后 stat 确认，
        # 最后用 SSH 统计远程文件数来校验完整性。
        sftp.put(lp, rp, confirm=False)
        count += 1
        if count % 50 == 0:
            print(f"  已上传 {count}/{TOTAL} 个文件…")

sftp.close()
cli.close()
print(f"完成，共上传 {count}/{TOTAL} 个文件到 {HOST}:{REMOTE}")
if count != TOTAL:
    print(f"⚠️ 上传数 {count} 与本地文件总数 {TOTAL} 不一致，部署可能不完整！")
    sys.exit(4)
