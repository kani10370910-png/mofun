#!/usr/bin/env python3
# 循环补传图片直到完整：每轮断点续传，传完后核对远程图片数==本地，未完成则重试。
import os, socket, posixpath, time
import paramiko

HOST, PORT, USER = "10.0.120.2", 22, "root"
REMOTE = "/data/base/nginx/usr/share/nginx/html/mofun"
LOCAL = os.path.join(os.getcwd(), "out")
IMG_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".svg")

with open(os.path.join("scripts", ".nginx_pwd"), "r", encoding="utf-8-sig") as f:
    pwd = f.read().strip()

# 本地图片清单
local_imgs = []
for root, dirs, files in os.walk(LOCAL):
    for fn in files:
        if fn.lower().endswith(IMG_EXT):
            local_imgs.append(os.path.join(root, fn))
TOTAL = len(local_imgs)
print(f"本地图片总数: {TOTAL}", flush=True)

def connect():
    sock = socket.create_connection((HOST, PORT), timeout=20)
    c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, PORT, USER, pwd, banner_timeout=30, auth_timeout=30,
              allow_agent=False, look_for_keys=False, sock=sock)
    return c

def ensure(sftp, d):
    parts = d.strip("/").split("/"); cur = ""
    for p in parts:
        cur += "/" + p
        try: sftp.stat(cur)
        except IOError: sftp.mkdir(cur)

MAX_ROUNDS = 30
for rnd in range(1, MAX_ROUNDS + 1):
    try:
        cli = connect(); sftp = cli.open_sftp()
    except Exception as e:
        print(f"[第{rnd}轮] 连接失败 {e}，5秒后重试", flush=True); time.sleep(5); continue
    done = skip = fail = 0
    for lp in local_imgs:
        rel = os.path.relpath(lp, LOCAL).replace(os.sep, "/")
        rp = posixpath.join(REMOTE, rel)
        lsize = os.path.getsize(lp)
        try:
            if sftp.stat(rp).st_size == lsize:
                skip += 1; continue
        except IOError:
            pass
        try:
            ensure(sftp, posixpath.dirname(rp))
            sftp.put(lp, rp)
            done += 1
            if done % 25 == 0:
                print(f"  [第{rnd}轮] 新传 {done}，跳过 {skip}", flush=True)
        except Exception as e:
            fail += 1
    try: sftp.close(); cli.close()
    except Exception: pass
    print(f"[第{rnd}轮结束] 新传 {done}，已存在 {skip}，本轮失败 {fail}", flush=True)
    if skip + done >= TOTAL and fail == 0:
        # 复核远程实际数量
        try:
            c2 = connect()
            i,o,e = c2.exec_command(
                f"find {REMOTE} -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' "
                f"-o -iname '*.webp' -o -iname '*.gif' -o -iname '*.ico' -o -iname '*.svg' \) | wc -l")
            remote_n = o.read().decode().strip(); c2.close()
            print(f"远程图片数: {remote_n} / 本地 {TOTAL}", flush=True)
            if remote_n.isdigit() and int(remote_n) >= TOTAL:
                print("✅ 图片已全部补完整！", flush=True)
                break
        except Exception as e:
            print(f"复核失败 {e}", flush=True)
    time.sleep(2)
else:
    print("⚠ 达到最大轮次仍未完全补齐，请再次运行。", flush=True)
