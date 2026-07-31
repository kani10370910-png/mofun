# 制作大片 / mofun 内网 Nginx 部署流程

> 目标服务器:内网 Nginx `10.0.120.2`(Docker 容器 `base-nginx-1`,nginx:1.29)
> **nginx 真实根目录 = `/data/base/nginx/usr/share/nginx/html/out`**(`nginx -T` 里 `root /usr/share/nginx/html/out`)
> ⚠ 旧脚本 `deploy_tar.py` / `deploy_code.py` 都误指到 `.../mofun`,**传了不生效**。统一用下面的 `deploy_code_tar.py`(已指向 `out`)。
> 密码存在 `scripts/.nginx_pwd`,脚本自动读取,**不要打印/提交**。

---

## 一、日常「只改了代码」→ 极速部署(推荐,几秒)

图片(~199MB / 476 张)基本不变,只需传代码(~6MB)。

```bash
cd "D:/AIcoding项目/魔方绘图1/mofun"

# 1) 停掉本地 dev server(它锁住 src/app/api,导出构建会 EPERM rename 失败)
#    找 3000 端口 PID:  netstat -ano | grep :3000
taskkill //PID <PID> //F

# 2) 静态导出构建 → out/(会临时移走 src/app/api;线上是无 /api 后端的静态版)
npm run build:export

# 3) 打「仅代码」包(排除图片/视频,~6MB)
tar -czf out-code.tar.gz -C out \
  --exclude='*.png' --exclude='*.jpg' --exclude='*.jpeg' --exclude='*.webp' \
  --exclude='*.gif' --exclude='*.ico' --exclude='*.svg' --exclude='*.mp4' .

# 4) 上传代码到正确目录(叠加解压、保留图片、自动补路由 index.html)
python scripts/deploy_code_tar.py

# 5) 重启本地 dev server(恢复开发环境)
npm run dev
```

完成后在**线上页面按 Ctrl+Shift+R 强制刷新**(清浏览器缓存)。

---

## 二、图片也有新增/变化时 → 传图片

代码走上面的流程;图片单独补传(断点续传,已存在且大小一致的跳过):
`deploy_images.py` 也需先把 `REMOTE` 改成 `.../html/out`(原为 `.../mofun`),再运行。
> 或整站全量:把 `out/` 打成 `out.tar.gz` 用 `deploy_tar.py`——但它 `rm -rf` 全站再解压、要重传 ~200MB,慢,一般不用。同样需先把 `REMOTE_DIR` 改成 `.../out`。

---

## 三、验证线上是否最新(不改动、只读)

```bash
# 本地 video 页 chunk 应与服务器返回完全一致
grep -o '/_next/static/chunks/[a-z0-9_]*\.js' out/video.html | sort -u
curl -s --compressed --noproxy '*' "http://10.0.120.2/video/" | grep -o '/_next/static/chunks/[a-z0-9_]*\.js' | sort -u

# 深链应返回 200(不是 403)
curl -sL --noproxy '*' -o /dev/null -w "%{http_code}\n" "http://10.0.120.2/video?sub=studio"
```

---

## 踩过的坑(避免重复)

- **传错目录**:nginx 根是 `.../html/out`,不是 `.../mofun`。`deploy_code_tar.py` 已修正。
- **EPERM rename**:dev server 锁住 `src/app/api`,构建前必须停 dev server。
- **deploy_code.py 逐文件 SFTP 会 EOF 断连**:一定用 tar 单文件上传。
- **深链 403**:Next 静态导出产出扁平 `video.html` + 空的 `video/` 目录(仅 RSC),nginx `/video`→301→`/video/`→无 index→403。`deploy_code_tar.py` 解压后会自动 `cp {route}.html {route}/index.html` 修复(路由:video/content/image/research/storage/template)。
- **curl 走代理返回 502**:内网 HTTP 用 `--noproxy '*'` 直连(SSH/部署走 22 端口不受影响)。
- **改完不生效八成是浏览器缓存**:Ctrl+Shift+R,或 DevTools→Network 勾 Disable cache。
- **线上无 AI**:静态导出把 `/api` 移走了,线上没有实时文案/图/视频生成,属正常。
