#!/usr/bin/env python3
# 仅补传 out/productcase/（商拍场景预设与案例图），断点续传。
import os, socket, posixpath, time
import paramiko

HOST, PORT, USER = "10.0.120.2", 22, "root"
REMOTE = "/data/base/nginx/usr/share/nginx/html/out/productcase"
LOCAL = os.path.join(os.getcwd(), "out", "productcase")
IMG_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif")

with open(os.path.join("scripts", ".nginx_pwd"), "r", encoding="utf-8-sig") as f:
    pwd = f.read().strip()

if not os.path.isdir(LOCAL):
    raise SystemExit(f"缺少本地目录: {LOCAL}（请先 npm run build:export）")

sock = socket.create_connection((HOST, PORT), timeout=20)
cli = paramiko.SSHClient()
cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect(HOST, PORT, USER, pwd, banner_timeout=30, auth_timeout=30,
            allow_agent=False, look_for_keys=False, sock=sock)
sftp = cli.open_sftp()

try:
    sftp.stat(REMOTE)
except IOError:
    sftp.mkdir(REMOTE)

done = skip = 0
files = [fn for fn in sorted(os.listdir(LOCAL)) if fn.lower().endswith(IMG_EXT)]
print(f"待检查 {len(files)} 个文件 …", flush=True)
for fn in files:
    lp = os.path.join(LOCAL, fn)
    rp = posixpath.join(REMOTE, fn)
    lsize = os.path.getsize(lp)
    try:
        if sftp.stat(rp).st_size == lsize:
            skip += 1
            print(f"  skip {fn}", flush=True)
            continue
    except IOError:
        pass
    print(f"  upload {fn} ({lsize/1024/1024:.1f} MB) …", flush=True)
    t0 = time.time()
    sftp.put(lp, rp)
    print(f"    ok {time.time()-t0:.1f}s", flush=True)
    done += 1

sftp.close()
cli.close()
print(f"[OK] productcase 补传完成：新传 {done}，跳过 {skip}", flush=True)
