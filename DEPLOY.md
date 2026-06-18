# MOFUN 魔方智绘平台 — 服务器部署 & 定期同步交接文档

> 给运维/部署同事：本文档说明如何把本项目部署到服务器，并配置「定期自动同步 Git 最新代码」。

## 一、项目信息

- **技术栈**：Next.js 16 + React 19 + TypeScript（Node.js 全栈应用，自带后端 API）
- **Git 仓库**：`https://github.com/kani10370910-png/mofun`（main 分支为生产分支）
- **运行端口**：默认 80（可改，见下）
- **依赖的环境变量**：5 个 `LLM_*`（文案 AI 用，见第三节）

## 二、首次部署（一次性）

服务器需可访问外网（拉代码 + 装依赖）。Ubuntu/Debian 用 `apt`，CentOS 用 `yum`。

```bash
# 1. 装 Node.js 20 + git（已装可跳过）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs git      # CentOS: sudo yum install -y nodejs git

# 2. 拉代码到 /opt/mofun
sudo git clone https://github.com/kani10370910-png/mofun.git /opt/mofun
cd /opt/mofun

# 3. 配置环境变量（密钥向项目负责人索取，不在 Git 里）
sudo tee /opt/mofun/.env.local > /dev/null <<'EOF'
LLM_PROVIDER=deepseek
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=向项目负责人索取
LLM_MODEL=deepseek-chat
LLM_TIMEOUT_MS=60000
EOF

# 4. 装依赖 + 构建
sudo npm install
sudo npm run build

# 5. 用 PM2 常驻运行（80 端口，开机自启）
sudo npm install -g pm2
sudo PORT=80 HOSTNAME=0.0.0.0 pm2 start "npm run start" --name mofun
sudo pm2 save
sudo pm2 startup systemd -u root --hp /root   # 按提示执行它输出的命令
```

部署完成后访问 `http://服务器IP/` 应能看到平台首页。

> **改端口**：把上面 `PORT=80` 改成别的（如 `PORT=8080`），重启即可。
> **80 端口注意**：公网环境下 80/443 端口对外提供网站需域名 ICP 备案；内网/测试可直接用。

## 三、环境变量（必须配，否则「文案策划」不可用）

| 变量 | 值 |
|---|---|
| `LLM_PROVIDER` | `deepseek` |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` |
| `LLM_API_KEY` | **向项目负责人索取**（DeepSeek 密钥） |
| `LLM_MODEL` | `deepseek-chat` |
| `LLM_TIMEOUT_MS` | `60000` |

其它功能（logo / 图片 / 视频 / 字体 / 仓库）无需密钥即可用。

## 四、定期自动同步最新代码

把下面脚本存为 `/opt/mofun/sync.sh`，它会拉取 Git 最新代码、若有更新则重新构建并重启服务。

```bash
sudo tee /opt/mofun/sync.sh > /dev/null <<'EOF'
#!/usr/bin/env bash
# MOFUN 定期同步：有新提交才重新构建+重启，无变化则跳过
set -e
cd /opt/mofun
git fetch --quiet origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" = "$REMOTE" ]; then
  echo "$(date '+%F %T') 无更新，跳过"
  exit 0
fi
echo "$(date '+%F %T') 检测到新代码，开始更新…"
git reset --hard origin/main
npm install
npm run build
pm2 restart mofun
echo "$(date '+%F %T') 已更新到 $REMOTE"
EOF
sudo chmod +x /opt/mofun/sync.sh
```

配置 crontab 定时执行（示例：每 10 分钟检查一次）：

```bash
sudo crontab -e
# 在末尾加一行（每 10 分钟同步一次，日志写到 /var/log/mofun-sync.log）：
*/10 * * * * /opt/mofun/sync.sh >> /var/log/mofun-sync.log 2>&1
```

> 想改频率：`*/10` 改成 `*/5`（5分钟）、`0 * * * *`（每小时）、`0 3 * * *`（每天凌晨3点）等。

## 五、常用运维命令

```bash
pm2 status                 # 查看运行状态
pm2 logs mofun             # 看运行日志
pm2 restart mofun          # 手动重启
/opt/mofun/sync.sh         # 手动同步一次最新代码
cat /var/log/mofun-sync.log  # 看同步日志
```

## 六、私有仓库说明（如仓库改回 Private）

本仓库目前为 Public，可直接 clone。若改为 Private，需在 `git clone`/`git fetch` 时提供 GitHub 凭据：
用 Personal Access Token，clone 地址改为
`https://<TOKEN>@github.com/kani10370910-png/mofun.git`（TOKEN 由仓库管理员生成，授 repo 读权限）。
