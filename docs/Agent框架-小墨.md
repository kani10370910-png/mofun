# 魔方智绘 · Agent 框架（小墨）

> 参考：[Miora](https://miora.design/) · Harness Engineering（驾驭工程）  
> 配套：[AI回复逻辑方案-小墨.md](./AI回复逻辑方案-小墨.md)  
> **可视化总图（浏览器打开）**：[小墨-Agent总体架构图.html](./小墨-Agent总体架构图.html) · [框架详细流程](./小墨-Agent框架详细流程图.html) · [用户操作流程](./小墨-用户操作生成流程图.html)  
> **范围**：首页对话框（小墨）Harness；**下游功能页（Studio / 各工作台）不在本框架内，契约与行为保持不变。**

---

## 0. 一句话定位

**小墨 = Model + Harness。**  
模型只负责措辞与提案文案；**问不问槽、出不出图、调不调 API** 由对话框驾驭层（代码）决定。  
用户 Brief → 意图 → 同组双问 → 方向策划闸门 → Tool（`/api/generate` · `/api/image`）→ 交付与建议栈。

与 Miora / Harness 对应：

| 概念 | 小墨落地 |
|------|----------|
| One Creative Agent | **小墨 Loop**（`runAgentTurn`） |
| Harness A/B/C/D | **装配 / 推理委托 / 工具调度 / 硬闸门** |
| Agent Memory | **品牌事实轨（localStorage）+ 会话进度轨（不写长期记忆）** |
| Specialist / Skills | **`specialists.ts` 槽位表 + `skills/` 闸门与工具策略** |
| Brief → Delivery | **多轮澄清 → 确认闸门 → Tool → 对话内交付**（不强制跳转） |

**产品原则：**

1. 首页对话 **不强制跳转**功能页。  
2. 顶栏「首页」在对话态不选中；点「首页」退出对话回 Hero。  
3. 助手名：**小墨**。  
4. **能用闸门别用 prompt**：未确认方案禁止出图。

---

## 1. 总体架构（Harness 四层 · 对话框）

```
┌─────────────────────────────────────────────────────────────┐
│  UI：HomeView（气泡 / 双问卡 / 行动卡 / 历史 / 附件 / 灯箱）   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Harness · 小墨（仅对话框）                                    │
│  A 装配 context.ts（SOUL / AGENTS / TOOLS 三段）               │
│  Loop orchestrator.ts（意图 · 双问槽 · phase 状态机）          │
│  D 边界 gates.ts（确认方案 / 参考图 / 失败重试卡）              │
│  C 调度 tools/*（propose · generate · memory_*）               │
│  Skills skills/（按 Specialist 按需挂载策略，非预加载全书）      │
│  Memory memory.ts（brand 轨 ≠ session 进度轨）                 │
└───────┬─────────────────────────────────────────────────────┘
        │ 薄封装，契约不变
        ▼
┌───────────────────────────────────┐
│  /api/generate · /api/image       │  ← 下游 API 不变
│  （功能页 Studio 等不接入本轮）    │
└───────────────────────────────────┘
```

### 分层职责（落地目录）

| 层 | 职责 | 目录 |
|----|------|------|
| **UI** | 对话壳、点选、历史、调 Tool | `components/home/HomeView.tsx` |
| **Loop** | 每句意图、双问填槽、phase 推进 | `lib/agent/orchestrator.ts` · `loop/` |
| **A 装配** | stable / context / volatile | `lib/agent/context.ts` |
| **D 边界** | `assertCanGenerate` 等硬拒绝 | `lib/agent/gates.ts` |
| **C 工具** | 经闸门再调 execute 实现 | `lib/agent/tools/*` |
| **Skills** | 闸门策略 + 工具绑定描述 | `lib/agent/skills/index.ts` |
| **Specialist** | 关键词 + 槽位 schema | `lib/agent/specialists.ts` |
| **Memory** | 品牌事实读写；会话进度不入库 | `lib/agent/memory.ts` |
| **Contracts** | phase / Action / SkillDef / Gate | `lib/agent/types.ts` |

**明确不改**：`Studio.tsx`、各 image/content/video/research 工作台 UI、现有 API 请求体与生成效果路径（`execute.ts` 内部 prompt 保持）。

### Skills vs Tools

| | Skills | Tools |
|--|--------|-------|
| 是什么 | 工作流 / 闸门策略手册 | 外部能力调用 |
| 形态 | `SkillDef`（description + gatePolicy） | `propose` / `generate` / `memory_*` |
| 加载 | 按当前专家按需 | Registry 统一入口 |
| 例子 | IP：direction_plan → 确认再出图 | `toolGenerate` → `/api/image` |

---

## 2. 核心对象（开发合同）

### 2.1 Session（一次对话）

```ts
type AgentSession = {
  id: string;
  title: string;
  messages: AgentMessage[];
  memoryRefs: string[];          // 关联品牌 / 偏好 id
  activeSpecialist?: SpecialistId;
  plan?: AgentPlan;              // 当前执行计划
  slots: Record<string, unknown>; // 已收集槽位
  status: "idle" | "clarifying" | "planning" | "executing" | "handoff" | "done";
  updatedAt: number;
};
```

### 2.2 Message（对话消息）

```ts
type AgentMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  text?: string;
  // UI 块：对齐「思考 / 已回复 / 行动卡」体验
  blocks?: Array<
    | { type: "thinking"; content: string }
    | { type: "text"; content: string }
    | { type: "intent"; label: string; specialistId: SpecialistId }
    | { type: "slots"; missing: string[]; filled: Record<string, unknown> }
    | { type: "action"; actions: AgentAction[] }
    | { type: "asset"; assets: AgentAssetRef[] }
    | { type: "tool_result"; tool: string; ok: boolean; summary: string }
  >;
  createdAt: number;
};
```

### 2.3 Action（行动卡 — 对话内可点）

```ts
type AgentAction =
  | { type: "fill_slot"; key: string; options?: string[] }
  | { type: "confirm_intent"; specialistId: SpecialistId }
  | { type: "run_skill"; skillId: string }
  | { type: "generate"; tool: string; params: Record<string, unknown> }
  | { type: "handoff"; href: string; label: string; payload: HandoffPayload }
  | { type: "open_history" }
  | { type: "new_session" };
```

### 2.4 HandoffPayload（进入模块时携带）

与现有 `?sub=` / 编辑器 query 对齐：

```ts
type HandoffPayload = {
  view: "content" | "image" | "video" | "research" | "template" | "storage";
  sub: string;                 // 如 ip / event / studio:script
  input?: string;              // 主 Brief
  slots?: Record<string, unknown>;
  memoryBrandId?: string;
  sessionId: string;
};
// 例：/image?sub=ip&input=可爱IP&from=agent&sid=xxx
```

---

## 3. 状态机（对话框 Harness · 落地 phase）

```
[Hero 输入] → ENTER_CHAT（不跳转功能页）
[resolveIntentEveryTurn] 每句自由文本
    → category / confirm → phase=route（大类卡 / 双意图卡）
    → set / switch / keep → 抽槽
[clarify · 同组双问]
    → 缺必填 → askGroups（只问未填）
    → P1 齐 + needsDirectionGate → phase=planned（方向策划确认）
    → P1 齐 + 无需策划 → phase=ready
[D 闸门]
    → 未 confirm_plan → assertCanGenerate 拒绝
    → 已确认 → C Tool：propose / generate
[proposed / delivered]
    → 选用方案 → 回 planned 或 ready
    → 出图成功 → postDeliveryActions（VI / 换方向 / 配色 / 重试）
[失败]
    → failureRetryActions 固定重试卡（禁止假装成功）
[退出]
    → 顶栏首页 / 新建 → 持久化会话历史；品牌事实写 memory，进度不进长期记忆
```

**关键规则：**

- `ENTER_CHAT` **不** `router.push` 到功能页；`handoff` 仅 toast。  
- 视觉类：无「确认方案」→ **代码拒绝**调用 image API。  
- 任何生成失败：对话内 `failureRetryActions`，不静默失败。

---

## 4. Specialist 注册表（专家网络）

每个 Specialist = 一个「能力包」：意图标签、槽位、工具、交接路由。  
替换并扩展现有 `intentRules`（`data/home.ts` + `lib/intent.ts`）。

| SpecialistId | 展示名 | view/sub | 必填槽（示例） | 主 Tools |
|--------------|--------|----------|----------------|----------|
| `content.social` | 文案 · 社媒推文 | content/social | platform, topic, tone | `generate:social` |
| `content.official` | 文案 · 公众号 | content/official | topic, audience | `generate:official` |
| `content.brand` | 文案 · 品牌推广 | content/brand | brand, sellingPoints | `generate:brand` |
| `image.logo` | 品牌 · Logo | image/logo | brandName, style | `image.gen`, `vision` |
| `image.ip` | 品牌 · IP | image/ip | character, style, usage | `generate:ip*`, `image.gen` |
| `image.font` | 品牌 · AI字体 | image/font | text, style | `image.gen` |
| `image.product` | 品牌 · 商拍 | image/product | productImage?, scene | `image.gen`, `vision` |
| `image.signage` | 品牌 · 店招 | image/signage | shopName, style | `image.gen` |
| `image.event` | 品牌 · 活动 | image/event | eventName, format | `generate:t2i-*`, `image.gen` |
| `video.oneline` | 视频 · 一句话成片 | video/oneline | script | `video.*` |
| `video.avatar` | 视频 · 数字人 | video/avatar | script, avatarRef | `generate:avatar-script`, `tts`, `lipsync` |
| `video.studio` | 视频 · 制作大片 | video/studio:* | brief, style | `generate:studio-*`, `video.*` |
| `research.brand` | 调研 · 品牌 | research/brand | brand, market | `generate:research-brand` |
| `research.industry` | 调研 · 产业 | research/industry | industry | `generate:research-industry` |
| `research.hotsale` | 调研 · 爆款 | research/hotsale | category | `generate:research-hotsale` |

**注册表最小接口：**

```ts
type SpecialistDef = {
  id: SpecialistId;
  label: string;                 // 「品牌设计 · IP设计」
  keywords: string[];            // 兼容现有 kw 匹配，作弱信号
  route: { view: string; sub: string };
  slots: Array<{
    key: string;
    label: string;
    required: boolean;
    ask: string;                 // 追问文案
    enum?: string[];             // 选项卡
  }>;
  tools: string[];               // ToolRegistry ids
  skillDefault?: string;         // 默认 Skill
  systemHint: string;            // 注入 Orchestrator 的领域提示
};
```

**Intent Router 策略（建议三层）：**

1. **规则召回**：现有关键词（快、可离线）→ Top-N Specialist  
2. **LLM 精排**：`/api/generate` 新 scene `agent-route`，输出 `{ specialistId, confidence, reason }`  
3. **用户确认**：`confidence < 0.7` 或 Top-2 接近时，展示确认卡  

修复已知冲突：如「口播」应优先 `video.avatar`，不应被 `content.social` 抢先匹配。

---

## 5. Memory（记忆系统）

对齐 Miora「越用越像你」；魔方优先落地 **品牌记忆**（仓库已有 `storage?tab=brand`）。

### 5.1 记忆类型

| 类型 | 内容 | 存储 |
|------|------|------|
| **Brand Memory** | 品牌名、主色、字体、口号、禁用项、参考图 | `store` 品牌资产 + `mofun_agent_memory_v1` |
| **User Preference** | 默认语气、常用平台、季节主题偏好 | localStorage / 账号侧 |
| **Session Memory** | 本轮 Brief、已填槽、计划、中间产物 | 会话对象（可同步现有 `mofun_home_chat_history_v1`） |
| **Project Memory** | 某次 IP/大片项目的跨步骤上下文 | 与 Studio / IP 项目持久化对齐 |

### 5.2 读写时机

- **读**：每次 Orchestrator 规划前注入 system context（控制 token，摘要化）。  
- **写**：用户确认品牌信息、生成成功入库、用户说「记住：不要用红色」时。  
- **隔离**：企业多品牌时按 `brandId` 隔离，禁止串味。

### 5.3 注入模板（示意）

```
[品牌记忆]
- 名称：…
- 主色：…
- 语气：朴实、乡土、可信
- 禁止：夸张网红腔、竞品名

[本轮会话]
- Brief：设计一个可爱的 IP
- Specialist：image.ip
- 已填：style=可爱 Q版；usage=表情包+吉祥物
- 待填：character 物种/人设
```

---

## 6. Tools（工具层）

**原则：不重写业务 API，只做 Agent 可调用的统一封装。**

| ToolId | 对应现有能力 | 输入 | 输出 |
|--------|--------------|------|------|
| `llm.generate` | `/api/generate` + scene | scene, fields | SSE text / JSON |
| `image.generate` | `/api/image` | prompt, size, refs | image urls |
| `vision.understand` | `/api/vision` | image, question | caption / tags |
| `video.generate` | `/api/video` 等 | prompt / form | video url |
| `tts.speak` | `/api/tts` | text, voice | audio |
| `avatar.lipsync` | `/api/lipsync` | image, audio | video |
| `router.handoff` | Next 路由 | HandoffPayload | href |
| `memory.read/write` | Memory Layer | brandId / patch | memory |
| `library.save` | `store` / 仓库 | asset | id |

```ts
type ToolResult = {
  ok: boolean;
  summary: string;               // 给对话展示
  data?: unknown;                // 结构化结果
  assets?: AgentAssetRef[];
};
```

Orchestrator **禁止**直接 `fetch` 散落 URL；一律走 ToolRegistry，便于鉴权、计费、日志、重试。

---

## 7. Skills（可复用工作流）

Miora 的 Skill = 打包好的专家行为。魔方 Phase 1 先做 **内置 Skill**，Phase 2 再开放自定义。

### 示例 Skill：`skill.ip.fullpack`（IP 全案）

```
steps:
  1. clarify 人设 / 风格 / 用途
  2. llm.generate scene=ip-propose（方案）
  3. 用户选方案
  4. image.generate（主视觉）
  5. llm.generate scene=ip-story（故事）
  6. action.handoff → /image?sub=ip（精修 / 周边）
```

### 示例 Skill：`skill.studio.film`（制作大片）

```
steps:
  1. clarify brief / 时长 / 风格
  2. handoff → /video?sub=studio:script（剧本）
  3.（模块内继续）assets → storyboard → preview
  # 对话侧只负责启动与回访摘要；重流程仍在 Studio
```

**Skill 定义：**

```ts
type SkillDef = {
  id: string;
  name: string;
  specialistIds: SpecialistId[];
  steps: Array<{
    id: string;
    kind: "ask" | "tool" | "handoff" | "wait_user";
    tool?: string;
    when?: string; // 简单条件表达式或固定
  }>;
};
```

---

## 8. 对话 UI 合同（对齐现有 + Miora 体验）

在现有左右气泡基础上，Assistant 消息支持结构化 `blocks`：

1. **thinking**：「深度思考」可折叠（对应「思考」开关）  
2. **intent**：识别标签，如 `品牌设计 · IP设计`  
3. **text**：自然语言回复（小墨人设）  
4. **slots**：缺什么、已填什么  
5. **action**：确认意图 / 选项 / **进入创作** / 重新生成  
6. **asset**：缩略图预览（可点进仓库或工作台）

顶栏右上（对话态）：**新建对话**、**历史记录**（已有）。  
历史结构升级为完整 `AgentSession`（含 slots / plan），兼容旧 `messages[]`。

---

## 9. API 合同（新增）

在现有 `/api/generate` 之上增加 Agent 入口（推荐）：

### `POST /api/agent/chat`（SSE）

**Request：**

```ts
{
  sessionId: string;
  message: string;
  attachments?: { type: "image" | "file"; url: string }[];
  brandId?: string;
  think?: boolean;          // 是否输出 thinking 块
}
```

**SSE events：**

```
event: thinking     data: { delta }
event: message      data: { blocks partial }
event: tool_start   data: { tool }
event: tool_end     data: { tool, summary, assets? }
event: action       data: { actions: AgentAction[] }
event: done         data: { session: AgentSession snapshot }
event: error        data: { message }
```

### 建议新增 LLM scenes（写入 `types` + `llm.ts`）

| scene | 用途 |
|-------|------|
| `agent-route` | 意图精排 → specialistId |
| `agent-slot` | 从用户句抽取槽位 JSON |
| `agent-reply` | 小墨人设回复（非工具结果时） |
| `agent-plan` | 多步计划（可选） |
| `agent-memory-extract` | 从对话抽取可写入记忆的事实 |

---

## 10. 与现有代码的迁移路径

| 阶段 | 交付 | 替换 / 接入点 |
|------|------|----------------|
| **M0 壳对齐** | 已完成：对话 UI、历史、不跳转、小墨命名、顶栏行为 | `HomeView`, `TopBar` |
| **M1 合同落地** | `lib/agent/types` + Specialist 注册表（从 `intentRules` 迁出） | `data/home.ts`, `lib/intent.ts` |
| **M2 Router+Slots** | `/api/agent/chat`：路由 + 追问，仍不调生成 | `HomeView.sendMessage` → agent API |
| **M3 Tools** | 对话内可调 `llm.generate` / `image.generate`，结果进气泡 | 复用 `/api/generate`, `/api/image` |
| **M4 Handoff** | 行动卡进入模块并带 `input/slots` | `ImageEditor` / `ContentEditor` 等读 query |
| **M5 Memory** | 读写品牌记忆并注入 | `storage` brand + memory store |
| **M6 Skills** | IP 全案、活动物料、大片启动等 3～5 个内置 Skill | specialists + skills |
| **M7（可选）** | 统一画布 / 跨模态同屏 | 新产品形态，非必须 |

---

## 11. 小墨人设与安全

**人设：** 亲切、务实、懂农文旅与县域品牌；先确认需求再动手；不夸大能力。  
**输出：** 短句 + 结构化卡，避免超长空话。  
**安全：** 工具调用参数校验；禁止把密钥打进 Prompt；企业数据按账号隔离；上传图走现有代理。

---

## 12. 验收标准（开发可测）

1. 输入「设计一个可爱的 IP」→ 识别 `image.ip` → 追问人设/风格 → 确认后可生成或出现「进入 IP 设计」卡。  
2. 置信度冲突场景（「口播」）→ 进入 `video.avatar` 而非社媒文案。  
3. 对话中途点「首页」→ 回 Hero，会话进历史；历史可恢复。  
4. 点「进入创作」→ URL 含正确 `sub` 与 Brief，模块表单预填。  
5. 绑定品牌后，二次对话无需重复「我们主色是绿色」。  
6. 关闭「思考」时无 thinking 块；开启时有可折叠思考过程。

---

## 13. 非目标（本框架明确不做）

- 不在 Phase 1 复制 Miora 自由画布。  
- 不在对话里重做 Studio 全流程时间线（大片以 handoff 进 `Studio` 为准）。  
- 不替换各模块内部编辑器，Agent 是 **编排与入口**，不是唯一 UI。

---

## 14. 关键文件索引（现状）

| 用途 | 路径 |
|------|------|
| 对话 UI | `src/components/home/HomeView.tsx` |
| 意图规则 | `src/data/home.ts`, `src/lib/intent.ts` |
| 顶栏对话态 | `src/components/shell/TopBar.tsx`, `src/lib/homeSeason.ts` |
| 文本生成 | `src/app/api/generate/route.ts`, `src/lib/llm.ts`, `src/lib/prompts.ts` |
| 图像 / 视频 / TTS | `src/app/api/image`, `video`, `tts`, `lipsync` |
| 品牌资产 | `src/components/storage/*`, `src/lib/store.tsx` |
| 模块 PRD | `docs/PRD-*.md`, `docs/*prd*.md`, `../docs/IP设计功能-PRD.md` |

---

## 15. 建议的首个迭代切片（1～2 周）

1. 抽出 `SpecialistRegistry`（含冲突修复）。  
2. 实现 `/api/agent/chat`：`route → slot → reply + action(handoff)`，工具先 mock。  
3. `HomeView` 改为消费 SSE blocks。  
4. Handoff 打通 `image.ip` 与 `content.social` 两条黄金路径。  

完成以上四条，即具备「可按框架继续加专家与 Skill」的骨架；其后按 M3→M6 扩展即可。
