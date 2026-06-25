#!/usr/bin/env python3
# 只传「代码文件」(HTML/JS/CSS/txt 等)到内网 Nginx，跳过图片。
# 让网站先用最新代码跑起来；图片用 deploy_images.py 后续补传。
# 密码从 scripts/.nginx_pwd 读（utf-8-sig 自动剥 BOM）。
import os, socket, posixpath
import paramiko

HOST, PORT, USER = "10.0.120.2x", 22, "root"
REMOTE = "/data/base/nginx/usr/share/nginx/html/mofun"
LOCAL = os.path.join(os.getcwd(), "out")
IMG_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".svg")

with open(os.path.join("scripts", ".nginx_pwd"), "r", encoding="utf-8-sig") as f:
    pwd = f.read().strip()

sock = socket.create_connection((HOST, PORT), timeout=20)
cli = paramiko.SSHClient()
cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect(HOST, PORT, USER, pwd, banner_timeout=30, auth_timeout=30,
            allow_agent=False, look_for_keys=False, sock=sock)
sftp = cli.open_sftp()

def ensure(d):
    parts = d.strip("/").split("/"); cur = ""
    for p in parts:
        cur += "/" + p
        try: sftp.stat(cur)
        except IOError: sftp.mkdir(cur)

count = 0
for root, dirs, files in os.walk(LOCAL):
    rel = os.path.relpath(root, LOCAL)
    rdir = REMOTE if rel == "." else posixpath.join(REMOTE, rel.replace(os.sep, "/"))
    code_files = [fn for fn in files if not fn.lower().endswith(IMG_EXT)]
    if not code_files:
        continue
    ensure(rdir)
    for fn in code_files:
        sftp.put(os.path.join(root, fn), posixpath.join(rdir, fn))
        count += 1
        if count % 20 == 0:
            print(f"  已传 {count} 个代码文件…", flush=True)

sftp.close(); cli.close()
print(f"代码文件传完，共 {count} 个。网站应已是最新代码（图片待补传）。")
