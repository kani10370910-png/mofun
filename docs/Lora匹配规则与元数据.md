# Lora 使用场景与匹配规则（一期：规则 / 元数据 / 匹配器）

> 对齐产品共识：风格 **不按区县拆包**；除风格外其它维度默认随「区县增强 / 挂载 Lora」开关；智能匹配做弱匹配。  
> 本期交付：`src/data/loraCatalog.ts` + `src/lib/loraMatch.ts`；真实风格权重文件可后补（`ready: false` 时不会发往上游）。

---

## 1. 维度模型（可扩展）

| 维度 `kind` | 含义 | 用户是否勾选 | 开关行为 |
|-------------|------|--------------|----------|
| **style**（风格） | 画法 / Logo 版式 | **要**：活动跟 `paintStyles`；Logo 跟 `logoStyles`（智能匹配弱匹配） | 不跟区县；精确或弱匹配后挂载 |
| **region**（在地） | 物产 / 地标气质：白茶、竹海、莫干山… | **否**（可选手动覆盖） | **随 `useLora` 开/关** |
| **（预留）其它** | 如题材、节日、版式… | **否**（默认同在地） | **随 `useLora` 开/关**；元数据加 `kind` + 注册即可 |

代码约定：

```ts
selection: "user_style" | "follow_enhance"
// style → user_style
// region / 未来维度 → follow_enhance
```

---

## 2. 使用场景

| 场景 | 能否挂 Lora | 风格维度 | 在地及其它 follow 维度 |
|------|-------------|---------|------------------------|
| 活动文生图 / 图生图（区县模型族） | 增强开且模型支持 | 按 `artStyleKey` | 默认开则挂默认在地包 |
| Logo / IP / 字体（区县模型族） | 同上 | Logo：`illust/simple/word/letter/badge/newcn`（样张见 `logoStyles.img`） | 同上 |
| 商拍 / 店招（非区县图模） | 否 | — | — |
| 视频 / 文本 / 调研 | 否（仅知识库） | — | — |
| 增强关或 `useLora=false` | **全部不挂** | — | — |

硬门槛（与《文生图区县增强…》一致）：

```
能挂 Lora ⇔ useLora ∧ modelSupportsCountyLora(model)
```

---

## 3. 元数据字段（量化检索）

| 字段 | 量化方式 | 说明 |
|------|----------|------|
| `kind` | 枚举 | `style` / `region` / 未来扩展 |
| `regionIds` | 集合包含 | 在地：归属区县；风格：`["*"]` |
| `styleKeys` | 与 UI key **精确相等** | 活动如 `guochao`；Logo 如 `illust` |
| `styleKeywords` | 子串命中计数 | 仅 `artStyleKey=auto` 弱匹配 |
| `scenes` | 集合包含 | `event` / `logo` / `ip` / …；空=全场景 |
| `previewImg` | 路径 | Logo 风格卡样张（与 UI 一致） |
| `direction` | 同 kind 内互斥 | 同方向只留 1 个 |
| `priority` | 0–100 | 同分取高 |
| `strength` | 0.05–1.2 | 默认强度 |
| `ready` | bool | `false`=元数据占位，匹配器可算出，**不发上游** |
| `selection` | 见上 | 决定是否随增强开关 |

### Logo 风格 ↔ 样张（与界面一致）

| key | 名称 | previewImg |
|-----|------|------------|
| auto | 智能匹配 | （无样张，弱匹配） |
| illust | 图文插画 | `/logos/14.png`（三山两院） |
| simple | 图文简约 | `/logos/28.jpeg`（藏书林） |
| word | 文字logo | `/logos/41.png`（酿山秋） |
| letter | 字母logo | `/logos/57.png`（hero） |
| badge | 经典徽章 | `/logos/48.png`（粤港记） |
| newcn | 新中式 | `/logos/2025112607.png`（鹤羽堂） |

---

## 4. 匹配优先级

| 序 | 规则 | 行为 |
|----|------|------|
| P0 | `useLora=false` 或模型不支持 | `[]` |
| P1 | 用户传入 `manualLoraIds`（在地等 follow 维） | 校验管辖后采用；**不覆盖**风格维 |
| P2 | `artStyleKey` 非 `auto` 且有精确 `styleKeys` | 挂 1 个风格 Lora |
| P3 | `artStyleKey=auto`（或空） | **弱匹配**：`prompt` 对 `styleKeywords` 计分，≥门槛取 Top1；无人选则不挂风格 |
| P4 | follow 维无手动列表 | 挂该 `regionId` 默认在地 Lora（及未来同 selection 的默认项） |
| P5 | 同 `kind+direction` 冲突 | 只留 1 个（优先手动 > 高分 > priority） |
| P6 | 风格 + 在地同时命中 | **允许叠加**；上限默认 风格1 + follow 各维合计≤2 |

### 弱匹配计分

```
score = Σ(keyword 命中 ? 权重 : 0) + priority * 0.01
门槛 WEAK_STYLE_MIN_SCORE = 2（至少约 2 个有效词或 1 个强词）
```

---

## 5. 与知识库分工

| 资产 | 检索键 | 作用 |
|------|--------|------|
| 区县知识库 | 区县 + query | 文本：说什么 |
| 在地 Lora | 区县（随增强） | 图像：在地气质 |
| 风格 Lora | 风格 key / 弱匹配词 | 图像：怎么画 |

---

## 6. 验收用例（一期）

| 输入 | 期望 |
|------|------|
| useLora=false | 空 |
| 安吉 + useLora + style=guochao | 风格精确命中 `lora-style-guochao` + 默认安吉在地 |
| 德清 + 同上 | **同一**风格 id + 德清默认在地 |
| style=auto，prompt 含「国潮/朱红/祥云」 | 弱匹配出国潮风格（若 ready 或仅看匹配结果） |
| style=auto，prompt 无风格词 | 仅在地，无风格 |
| 手动指定在地 id | 用手动在地；风格仍按 style key |

---

## 7. 代码入口

- 元数据：`src/data/loraCatalog.ts`
- 匹配器：`src/lib/loraMatch.ts` → `matchLoras(input)`
- 出图体可选：`imageRequestBody({ artStyleKey, scene, … })` 走匹配器；`ready:false` 的风格项本期不写入 `lora` 数组
