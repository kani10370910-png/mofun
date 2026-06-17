# MOFUN 魔方智绘平台

面向「农文旅」（农产品 / 乡村旅游 / 地域文化）场景的 AI 内容与设计生成平台。
由原单文件 HTML 演示（`魔方智绘_demo.html`）重构为可部署的 **Next.js 16 + React 19 + TypeScript** 全栈应用。

## 功能模块

| 导航 | 路由 | 说明 |
|------|------|------|
| 首页 | `/` | 意图识别输入框 + 优秀案例墙（分类/搜索） |
| 模版 | `/template` | 场景 → 类型 → 子类 三级联动筛选 |
| **文案策划** | `/content` | **真实接入大模型**，逐字流式生成（社媒推文 / 公众号帮写 / 品牌推广） |
| 品牌设计 | `/image` | 活动（文生图/图生图）、商拍、logo、IP、AI字体、店招 —— **生成为演示模拟** |
| 视频宣传 | `/video` | 一句话成片、数字人模特、制作大片(6 步) —— **生成为演示模拟** |
| 市场调研 | `/research` | 功能框架（建设中） |
| 仓库 | `/storage` | 我的作品 / 素材 / 品牌资产（多选展开、新增品牌） |

> 说明：**仅「文案策划」接入真实 AI**；图片 / 视频生成保留进度动画 + 占位结果的演示效果（按需求设计）。

## 文案策划：真实 AI 接入

- 后端 `app/api/generate/route.ts`（Next.js Route Handler）作为代理，调用 **OpenAI 兼容**的国内大模型 `/chat/completions`（默认 DeepSeek），以 **SSE 流式**把文本逐块转发给前端。
- **API Key 只在服务端读取**，绝不进前端 bundle / 不出现在响应里。
- 支持：社媒推文（结构化策划案 JSON，解析失败自动回退纯文本）、公众号「先提纲 → 按提纲生成全文」两步流、品牌推广纯文本。
- 内置 provider 预设，切换模型**无需改代码**，只改环境变量。

### provider 预设（`src/lib/llm.ts`）

| `LLM_PROVIDER` | 默认 baseURL | 默认 model |
|---|---|---|
| `deepseek` | `https://api.deepseek.com/v1` | `deepseek-chat` |
| `qwen`（通义） | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| `glm`（智谱） | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-plus` |
| `ernie`（文心） | `https://qianfan.baidubce.com/v2` | `ernie-4.5-turbo-128k` |

`LLM_BASE_URL` / `LLM_MODEL` 留空则用预设值，填了则覆盖。

## 本地运行

```bash
cd mofun
npm install

# 配置模型：复制 .env.example 为 .env.local，填入真实 Key
cp .env.example .env.local
# 编辑 .env.local：至少填 LLM_API_KEY（默认用 DeepSeek）

npm run dev      # http://localhost:3000
```

### 环境变量（`.env.local`）

```
LLM_PROVIDER=deepseek      # deepseek | qwen | glm | ernie
LLM_BASE_URL=              # 留空用预设
LLM_API_KEY=sk-xxxx        # ★ 必填，你的真实 Key
LLM_MODEL=                 # 留空用预设
LLM_TIMEOUT_MS=60000
```

> 未配置 `LLM_API_KEY` 时，文案策划会给出友好提示（不会崩溃）；其余模块不受影响。

## 构建与部署

```bash
npm run build
npm run start    # 生产模式本地预览
```

### 部署到 Vercel
1. 导入仓库（根目录指向 `mofun/`）。
2. 在 Vercel 项目的 Environment Variables 里配置 `LLM_PROVIDER` / `LLM_API_KEY` 等（**不要**把 `.env.local` 提交到 git）。
3. 部署。`/api/generate` 会作为 Serverless Function 运行。

### 自托管
```bash
npm run build
LLM_API_KEY=sk-xxxx npm run start   # 或在环境里导出变量
```
也可用 Docker / PM2 等托管 `next start`。

## 技术栈与目录

- Next.js 16（App Router, Turbopack）+ React 19 + TypeScript
- 全局 CSS（`src/app/globals.css`，自原 demo 1:1 迁入，配色 `#188772`）
- 无额外 UI 框架；图标系统在 `src/data/icons.ts` + `src/components/ui/Icon.tsx`

```
src/
  app/            # 7 个页面路由 + api/generate
  components/     # shell / ui / home / template / content / image / video / storage / research
  data/           # 静态数据（由原 DATA 拆分）+ 图标
  lib/            # types / llm(服务端) / intent / useGenerateStream / useSimGenerate
```

## 安全要点
- 密钥仅服务端可见（变量无 `NEXT_PUBLIC_` 前缀）。
- `Icon` 的 `dangerouslySetInnerHTML` 仅用于可信静态 SVG 常量；用户输入一律走 React 文本节点。
- 上游错误不回传密钥相关细节，仅给状态码与精简提示。
