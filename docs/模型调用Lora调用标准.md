# 模型调用 Lora · 调用标准

> 产品：魔方智绘  
> 文档性质：**调用标准**（何时调、怎么匹配、如何上送）  
> 关联实现：`src/data/loraCatalog.ts` · `src/lib/loraMatch.ts` · `src/lib/loraResolve.ts` · `imageRequestBody`  
> 关联能力矩阵：`docs/文生图区县增强模型与知识库调用逻辑.md`  
> 版本：v1.0

---

## 0. 术语与原则

| 术语 | 含义 |
|------|------|
| **区县模型族** | 支持挂载 Lora 的图模：`MoFun区域文化大模型` / Qwen 本地文生图、图生图 |
| **useLora** | 是否允许挂载 Lora（通常与区县增强中的「挂载本地 Lora」一致） |
| **在地 Lora** | 按区县归属的物产/地标气质模型（白茶、竹海、莫干山…） |
| **风格 Lora** | 全站共用的画风/版式模型，**不按区县拆包** |
| **ready** | 权重文件是否已就绪；`false` 时可匹配、**禁止上送上游** |

**硬原则**

1. **能挂 Lora ⇔ `useLora === true` ∧ 当前出图模型 ∈ 区县模型族**  
2. **风格不按区县拆**：同选「国潮 / 图文插画」，安吉与德清挂同一风格 id，仅在地包不同  
3. **风格需用户选择**（含「智能匹配」）；在地及其它扩展维默认**随增强开关**  
4. **知识库管「说什么」，Lora 管「画成什么样」**；二者可同时开，职责不混

---

## 1. 调用门槛（模型 × 开关）

### 1.1 总闸

| useLora | 模型支持 Lora | 结果 |
|---------|---------------|------|
| 关 | 任意 | **不调 Lora** |
| 开 | ✗（Seedream / Seedance / LLM 等） | **不调 Lora**（仍可调知识库） |
| 开 | ✓（区县模型族） | **进入匹配器**，按规则产出 `lora[]` |

### 1.2 支持 Lora 的模型（标准名单）

| 模型族 | 典型 ID / UI 名 | 支持 Lora |
|--------|-----------------|-----------|
| 文生图 · Qwen 本地 | `Qwen-Image-本地-文生图` / MoFun区域文化大模型 | ✓ |
| 图生图 · Qwen 本地 | `Qwen-Image-本地-图生图` / MoFun区域文化大模型 | ✓ |
| Seedream 4.0 / 4.5 / 5.0 | doubao-seedream-* | ✗ |
| 视频 Seedance 族 | — | ✗ |
| 文本 LLM / Vision / TTS | — | ✗ |

判定函数：`modelSupportsCountyLora(model)`。

### 1.3 上送形态（上游契约）

出图请求体中：

```ts
{
  model: string;
  useLora: boolean;
  regionId?: string;
  lora?: Array<{ id: string; name: string; strength: number }>; // 仅 ready 项
}
```

- `id` / `name`：经 `LORA_UPSTREAM_MAP` 映射后的**上游通道名**  
- `strength`：裁剪到 `[0.05, 1.2]`  
- 服务端：`resolveUpstreamLoras`；无列表且 `useLora` 时回退默认在地包  

---

## 2. 使用场景（何时生成、调什么）

下列「场景」对应匹配器入参 `scene`，并决定风格资产池。

### 2.1 场景总表

| scene | 功能入口 | 出图是否可挂 Lora | 风格来源 | 在地 Lora |
|-------|----------|-------------------|----------|-----------|
| `event` | 品牌设计 · 活动文生/图生 | 区县模型族 + useLora | `paintStyles.key`（国潮/水彩…） | 账号区县默认包 / 手动勾选 |
| `logo` | 品牌设计 · Logo | 同上（现网若固定 Seedream 则实际不挂） | `logoStyles.key` | 同上 |
| `ip` | IP 创新 / 扩展 | 视所选图模 | 活动风格池（预留） | 同上 |
| `font` | AI 字体 | 视所选图模 | 活动风格池（预留） | 同上 |
| `product` | 商拍 | 默认 Seedream → **不挂** | — | — |
| （无 scene） | 其它出图 | 仅模型门槛 | 无风格维或弱匹配 | 默认在地 |

**视频 / 内容 / 调研 / TTS**：永远不调 Lora（可调知识库）。

### 2.2 生成链路（标准时序）

```
用户点击「立即生成」
  → 解析：useLora / model / regionId / artStyleKey / scene / prompt / manualLoraIds
  → matchLoras(...)           // 匹配规则见 §3
  → 过滤 ready === true
  → imageRequestBody / /api/image
       · 文本侧：可选 useKB 注入知识库（与 Lora 独立）
       · 图像侧：lora[] 挂载上游
  → 返回成图；历史可记 useLora / regionId / styleKey
```

### 2.3 各场景「组装输入」约定

| 场景 | artStyleKey | prompt（弱匹配语料） | manualLoraIds |
|------|-------------|----------------------|---------------|
| 活动 | `paintStyles` 的 key；「智能匹配」=`auto` | 扩写后或用户画面描述 | 增强条勾选的在地 ids |
| Logo | `logoStyles` 的 key；智能匹配=`auto` | Logo 风格提示词 + 品牌名描述 | 若开启 Lora 时的在地 ids |
| 其它 | 可选 | 用户/扩写文本 | 可选 |

---

## 3. 匹配规则（量化）

### 3.1 输入

```ts
type LoraMatchInput = {
  useLora: boolean;
  model?: string;
  regionId?: string;       // 账号/组织区县，如 anji
  scene?: string;          // event | logo | …
  artStyleKey?: string;    // guochao | illust | auto | …
  prompt?: string;         // 仅 auto 弱匹配
  manualLoraIds?: string[]; // 只覆盖 follow_enhance（在地等）
  strengths?: Record<string, number>;
  includeUnready?: boolean; // 测规则用；上送必须 false
};
```

### 3.2 资产维度与选择方式

| kind | selection | 用户是否勾选 | 检索键 |
|------|-----------|--------------|--------|
| `style` | `user_style` | **是**（风格选择器） | `styleKeys` 精确；`auto`→`styleKeywords` 弱匹配；`scenes` 过滤 |
| `region` | `follow_enhance` | **否**（默认同开关；可选手动） | `regionIds` + 市内管辖 |
| 未来扩展 | `follow_enhance` | **否** | 自定义字段 + `scenes` |

风格资产：`regionIds = ["*"]`，**禁止**按区县复制多套同名风格包。

### 3.3 优先级（必须按序执行）

| 序 | 条件 | 行为 | reason 标记 |
|----|------|------|-------------|
| **P0** | `!useLora` 或模型不支持 | 返回空 | — |
| **P1** | 有 `manualLoraIds` | 校验市内管辖后作为 follow 维；**不覆盖风格** | `follow_manual` |
| **P2** | `artStyleKey` 存在且 ≠ `auto` | 在 scene 池内 `styleKeys` **精确命中**，取 1 个 | `style_exact:{key}` |
| **P3** | `artStyleKey` 为 `auto` 或空 | 对 `prompt` 做弱匹配，分数 ≥ 门槛取 Top1；无人选则无风格 | `style_weak:auto` |
| **P4** | follow 无手动 | `defaultLoraIdsForRegion(regionId)` 经市内过滤 | `follow_default_region` |
| **P5** | 同 `kind + direction` 冲突 | 只留 1 个（分高 / priority 高优先） | — |
| **P6** | 风格与在地同时命中 | **允许叠加** | — |

### 3.4 数量与强度上限

| 项 | 标准值 |
|----|--------|
| 风格 Lora 上限 | **1** |
| follow 维合计上限（含在地） | **2** |
| 弱匹配门槛 `WEAK_STYLE_MIN_SCORE` | **2** |
| 弱匹配计分 | 关键词命中：长度≥3 记 1.5，否则 1；再加 `priority * 0.01` |
| 默认强度 | 资产 `strength`；可被 `strengths[id]` 覆盖 |
| 强度裁剪 | `[0.05, 1.2]` |

### 3.5 区县管辖（在地）

- 企业账号：仅本市及下辖区县 Lora（`filterLoraIdsForCity`）  
- 越权 manual id：**丢弃该条**，不报错中断整次匹配  
- 风格维：**不做区县过滤**

### 3.6 scene 隔离（防串包）

| 风格包 | scenes | 说明 |
|--------|--------|------|
| 活动画面风格（国潮/水彩…） | `event,ip,font,product` | **不含** `logo` |
| Logo 版式风格（插画/简约/徽章…） | `logo` | 与活动画风分离 |

同一次匹配只在对应 scene 池内检索风格。

---

## 4. 风格 Key 登记表（标准目录）

### 4.1 活动 / 通用画面（paintStyles）

| styleKeys | 名称 | 说明 |
|-----------|------|------|
| auto | 智能匹配 | 弱匹配；无词则不挂风格 |
| guochao | 国潮 | |
| watercolor | 水彩 | |
| flat | 扁平矢量 | |
| cartoon | 卡通动漫 | |
| lineart | 线描 | |
| engraving | 版画 | |
| photo | 写实摄影 | |
| pattern | 纹样 | |

### 4.2 Logo（logoStyles）

| styleKeys | 名称 | 样张（UI） |
|-----------|------|------------|
| auto | 智能匹配 | 无 |
| illust | 图文插画 | `/logos/14.png` |
| simple | 图文简约 | `/logos/28.jpeg` |
| word | 文字logo | `/logos/41.png` |
| letter | 字母logo | `/logos/57.png` |
| badge | 经典徽章 | `/logos/48.png` |
| newcn | 新中式 | `/logos/2025112607.png` |

权重未就绪时：`ready: false`，匹配结果可测，**上送列表不含该项**。

---

## 5. 与知识库的调用关系

| 开关组合 | 知识库 | Lora |
|----------|--------|------|
| 增强全关 | ✗ | ✗ |
| 开增强 + 非区县图模 | ✓（文本注入） | ✗ |
| 开增强 + 区县图模 + useLora | ✓ | ✓（匹配后） |
| 开增强 + 区县图模 + 仅关 Lora | ✓ | ✗ |

禁止把「Lora / 区县知识库」等系统标签写入画面文案。

---

## 6. 验收用例（标准用例集）

| # | 输入摘要 | 期望 |
|---|----------|------|
| U1 | useLora=false | `lora=[]` |
| U2 | Seedream + useLora | `lora=[]` |
| U3 | 区县模型 + 安吉 + guochao + includeUnready | 风格=`lora-style-guochao` + 安吉默认在地 |
| U4 | 同上换德清 | **同一**风格 id + 德清默认在地 |
| U5 | scene=logo + illust | 命中 `lora-logo-illust`，不命中国潮包 |
| U6 | artStyleKey=auto，prompt 含「国潮/朱红/祥云」 | 弱匹配出国潮（测规则） |
| U7 | auto 且 prompt 无风格词 | 仅在地 |
| U8 | readyOnly 上送 | 风格占位不出现在上游 `lora[]` |
| U9 | manual 指定在地 id | follow=手动；风格仍按 key |

---

## 7. 扩展规范（后续维度）

新增「非风格」角度（如节日、题材）时：

1. 在目录增加 `kind`，`selection: "follow_enhance"`  
2. 配置默认解析函数（类似 `defaultLoraIdsForRegion`）  
3. **不要**要求用户再勾一层开关；默认跟随 `useLora`  
4. 更新本标准 §2 场景表与 §6 用例  

新增风格 key：只扩 `styleKeys` / 样张 / 关键词，**禁止**复制为「安吉国潮 / 德清国潮」两套包。

---

## 8. 文档与代码索引

| 内容 | 位置 |
|------|------|
| 本标准 | `docs/模型调用Lora调用标准.md` |
| 区县增强总矩阵 | `docs/文生图区县增强模型与知识库调用逻辑.md` |
| 资产目录 | `src/data/loraCatalog.ts` |
| 匹配器 | `src/lib/loraMatch.ts` → `matchLoras` / `matchLorasForUpstream` |
| 上游名解析 | `src/lib/loraResolve.ts` |
| 出图组装 | `src/lib/regionEnhance.ts` → `imageRequestBody` |
