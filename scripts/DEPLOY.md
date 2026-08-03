# mofun 部署上线路径

修改代码后按目标环境选一条路径即可。  
工作目录一律：`D:/AIcoding项目/魔方绘图1/mofun`（本仓库根目录）。

| 环境 | 触发方式 | 线上地址 | 能力说明 |
|------|----------|----------|----------|
| **GitHub → Cloudflare** | 推送到 GitHub `main` | https://mofun.kani10370910.workers.dev | Workers 全栈（含 OpenNext）；控制台自动构建 |
| **GitLab / 内网 Nginx** | 本地静态导出 + 脚本上传 | http://10.0.120.2/ | **静态站**，无 `/api` 实时生成 |

密码 / Token：

- 内网 SSH：`scripts/.nginx_pwd`（**勿提交、勿打印**）
- Cloudflare：GitHub 已绑定 Workers，一般**推代码即可**，不必本地 `wrangler login`

---

## A. GitHub 线上（Cloudflare Workers）

### 地址与控制台

- 访问：https://mofun.kani10370910.workers.dev
- 控制台：Cloudflare → **Compute → Workers & Pages** → 点 **mofun**
- 仓库：https://github.com/kani10370910-png/mofun  
  子域：`kani10370910.workers.dev` · Worker 名：`mofun`

### 日常上线（推荐）

```bash
cd "D:/AIcoding项目/魔方绘图1/mofun"

# 1) 提交改动
git add -A
git status
git commit -m "你的说明"

# 2) 推到 GitHub（会触发 Cloudflare 自动构建部署）
git push origin HEAD:main
# 或当前分支已是 main-clean 且要同步两处：
# git push origin HEAD:main
# git push origin HEAD:main-clean
```

约几分钟后到 Cloudflare 控制台看最新 Deployment；浏览器 **Ctrl+Shift+R** 强刷。

### 可选：本机手动部署到 Cloudflare

需本机已 `npx wrangler login`，或环境变量 `CLOUDFLARE_API_TOKEN`：

```bash
npm run cf:deploy
```

Windows 上 OpenNext 可能不稳定，优先用「推 GitHub 自动部署」。

---

## B. GitLab / 内网 Nginx

> 目标：`10.0.120.2`（Docker `base-nginx-1`）  
> **真实根目录**：`/data/base/nginx/usr/share/nginx/html/out`  
> ⚠ 旧脚本若指向 `.../mofun` 会不生效。请用已改好的 `deploy_code_tar.py` / `deploy_images.py`。  
> 远程 `glpush` 指向内网 GitLab，**日常可先不动**；内网上线以本机脚本为准。

### B1. 只改了代码（极速，推荐）

```bash
cd "D:/AIcoding项目/魔方绘图1/mofun"

# 1) 停掉本地 dev（锁住 src/app/api 会导致导出 EPERM）
#    netstat -ano | findstr :3000
taskkill /PID <PID> /F

# 2) 静态导出 → out/（会临时移走 src/app/api）
npm run build:export

# 3) 打「仅代码」包（排除图片/视频）
tar -czf out-code.tar.gz -C out \
  --exclude='*.png' --exclude='*.jpg' --exclude='*.jpeg' --exclude='*.webp' \
  --exclude='*.gif' --exclude='*.ico' --exclude='*.svg' --exclude='*.mp4' \
  --exclude='*.webm' --exclude='*.mov' --exclude='*.onnx' --exclude='*.wasm' .

# 4) 叠加解压到 nginx out（保留已有图片，并补路由 index.html）
python scripts/deploy_code_tar.py

# 5) 恢复本地开发
npm run dev
```

完成后打开 http://10.0.120.2/ ，**Ctrl+Shift+R**。

### B2. 图片 / 视频有新增

先走 **B1**，再补传媒体（断点续传，已存在且大小一致则跳过）：

```bash
python scripts/deploy_images.py
```

只补首页等少量资源时，也可按目录手工 SFTP 到  
`/data/base/nginx/usr/share/nginx/html/out/...`（例如 `out/home/*.mp4`）。

### B3. 验证内网是否最新

```bash
curl -sL --noproxy '*' -o /dev/null -w "%{http_code}\n" "http://10.0.120.2/"
curl -sL --noproxy '*' -o /dev/null -w "%{http_code}\n" "http://10.0.120.2/video/"
curl -sL --noproxy '*' -o /dev/null -w "%{http_code}\n" "http://10.0.120.2/home/hero-summer.mp4"
```

深链应 200（不是 403）。若走系统代理导致 502，务必加 `--noproxy '*'`。

---

## 改完后怎么选？

1. **只要公网演示** → 推 GitHub `main` → 等 Cloudflare → 打开  
   https://mofun.kani10370910.workers.dev
2. **只要内网** → 走 **B1**（有新媒体再 **B2**）→ http://10.0.120.2/
3. **两边都要** → 先推 GitHub，再跑内网 B1/B2

---

## 踩过的坑

- **内网传错目录**：必须是 `.../html/out`，不是 `.../mofun`。
- **导出前未停 dev**：`src/app/api` 被锁 → EPERM。
- **内网深链 403**：扁平 `video.html` + 空 `video/`；`deploy_code_tar.py` 会把 `{route}.html` 拷成 `{route}/index.html`（含 video/content/image/research/storage/template；login/account/enterprise 若新增也需同样处理）。
- **内网无 AI**：静态导出无 `/api`，属正常。
- **改完不生效**：浏览器缓存，Ctrl+Shift+R。
- **Cloudflare 本机 deploy 失败**：未登录 / 无 Token；改用推 GitHub 自动构建。
- **勿把** `scripts/.nginx_pwd`、真实 `.env`、`out-code.tar.gz`、部署日志提交进 Git。
