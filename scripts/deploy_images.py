#!/usr/bin/env python3
# 补传图片到内网 Nginx（代码已由 deploy_code.py 传完）。
# 断点续传：远程已存在且大小一致的跳过，可反复运行。
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

imgs = []
for root, dirs, files in os.walk(LOCAL):
    for fn in files:
        if fn.lower().endswith(IMG_EXT):
            imgs.append(os.path.join(root, fn))

total = len(imgs)
done = skip = 0
for i, lp in enumerate(imgs, 1):
    rel = os.path.relpath(lp, LOCAL).replace(os.sep, "/")
    rp = posixpath.join(REMOTE, rel)
    lsize = os.path.getsize(lp)
    try:
        if sftp.stat(rp).st_size == lsize:
            skip += 1
            continue
    except IOError:
        pass
    ensure(posixpath.dirname(rp))
    sftp.put(lp, rp)
    done += 1
    if done % 25 == 0:
        print(f"  进度 {i}/{total}（新传 {done}，跳过 {skip}）", flush=True)

sftp.close(); cli.close()
print(f"图片补传完成：新传 {done}，已存在跳过 {skip}，共 {total}。")
