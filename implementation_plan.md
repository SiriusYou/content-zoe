# 内容创作与发布工作流：架构规划

> **基座**: `openclaw-market` (OpenClaw 核心能力)
> **编排层**: `openclaw-healthcare` 的 Zoe (三阶段流水线 + Spec 系统)
> **目标**: 端到端内容创作自动化工作流

---

## 思路评估：这条路可行且有明确优势

你的想法核心是：**把 Zoe 已经验证的"规划→编排→执行"三阶段架构，从代码工程场景迁移到内容创作场景**。这个思路成立，原因如下：

### ✅ 架构同构性

代码工程和内容创作的工作流在结构上高度同构：

```
代码工程流水线                        内容创作流水线
─────────────────                    ─────────────────
模糊需求 → spec_final.md             选题灵感 → content_brief.md
工单拆解 → Linear 工单                内容拆解 → 研究/写作/审校 子任务
路由选择 → claude/codex/symphony      路由选择 → researcher/writer/editor
Agent 执行 → 代码变更                 Agent 执行 → 内容产出
审批 → merge/reject                  审批 → publish/revise
```

### ✅ Zoe 已有的基础设施可直接复用

| Zoe 组件 | 代码工程用途 | 内容创作映射 |
|---|---|---|
| **Intake Decision** (`decision.ts`) | 判断 direct/spec/conversational | 判断 quick-post/deep-article/chat |
| **Spec System** (`specs/`) | 设计文档 → 拆解 → 执行 | 内容大纲 → 任务拆解 → 多 Agent 生产 |
| **Task Groups** (`task-groups/`) | Fanout/Debate 多 Agent 协同 | 研究+写作+编辑 并行/串行 |
| **Pipeline Stages** (`pipeline.ts`) | design → decompose → deliver → review | research → draft → edit → publish |
| **Agent Adapters** (`*-adapter.ts`) | codex/claude/gemini | researcher/writer/editor/publisher |
| **Worker Loops** (`runner-worker.ts`) | 13 个独立 reconciler | 可扩展 content-specific loops |

### ⚠️ 需要定制的部分

| 维度 | 差异 | 需要做什么 |
|---|---|---|
| **执行产物** | 代码 diff vs. Markdown 内容 | 新的 `taskKind: "content"` 跳过 git worktree + merge |
| **审批标准** | 代码质量 vs. 内容质量 | 需要内容特定的 review criteria |
| **发布渠道** | Git merge vs. 多平台发布 | 接入 openclaw-market 的 channel 能力 |
| **输入源** | 手动任务/Linear vs. 自动触发 | 接入 RSS/Cron/Standing Orders 触发 |

---

## Spec 系统的借鉴价值

> [!IMPORTANT]
> openclaw-healthcare 的 Spec 系统是**整个方案最有借鉴价值的部分**——它把"先想清楚再动手"变成了一个有状态机、有质量门禁、有 AI 辅助的结构化流程。

### Spec 状态机 → 内容状态机

healthcare 的 spec 状态：
```
draft → planning → converged → decomposed → confirmed
```

映射到内容创作：
```
idea → briefing → researched → outlined → approved_for_production
```

### 核心机制复用

#### 1. Intake Decision (路由决策)

**现有**: `decision.ts` 用正则和长度判断路由到 direct/spec/conversational

**内容版本**:

```typescript
// 内容创作的路由决策
const DEEP_CONTENT_HINTS = [
  /\b(深度|长文|系列|专题|white\s*paper)\b/i,
  /\b(research|分析|对比|评测|tutorial)\b/i,
  /\b(案例|case\s*study|行业报告)\b/i,
]

function shouldRouteToContentSpec(input: IntakeSubmitInput): boolean {
  // 长内容需求 → 走 spec 流程
  if (DEEP_CONTENT_HINTS.some(p => p.test(input.message))) return true
  // 短内容 → 直接执行
  return false
}
```

#### 2. Spec Decompose (内容拆解)

**现有**: `decompose.ts` 调用 Claude/Codex CLI 把 spec 拆成 task proposals

**内容版本**: 把一个内容大纲拆成研究任务 + 写作任务 + 编辑任务

```typescript
// 复用 decompose 的 buildPrompt 模式
function buildContentDecomposePrompt(briefContent: string): string {
  return [
    "You are a content strategist. Analyze the following content brief and decompose it into production tasks.",
    "Each task must have:",
    '- role: one of "researcher", "writer", "editor", "publisher"',
    '- title: concise task title',  
    '- description: detailed instructions for this production step',
    '- dependencies: which other tasks must complete first',
    "",
    "--- CONTENT BRIEF ---",
    briefContent,
    "--- END ---",
  ].join("\n")
}
```

#### 3. Pipeline Stages (阶段管理)

**现有** 4 阶段:
```typescript
const PIPELINE_STAGES = [
  { key: "design_converge",    label: "Design Converge" },
  { key: "decompose_confirm",  label: "Decompose & Confirm" },
  { key: "delivery",           label: "Delivery" },
  { key: "final_review",       label: "Final Review" },
]
```

**内容版本** 5 阶段:
```typescript
const CONTENT_PIPELINE_STAGES = [
  { key: "research",     label: "Research & Source" },
  { key: "outline",      label: "Outline & Structure" },
  { key: "draft",        label: "Draft Production" },
  { key: "edit_review",  label: "Edit & Quality Review" },
  { key: "publish",      label: "Publish & Distribute" },
]
```

#### 4. Confirm Spec → Confirm Content Plan

**现有**: `confirm-spec.ts` 锁定 spec、创建 tasks + runs、绑定 group

**内容版本**: 锁定内容大纲、按角色创建子任务、绑定发布目标

#### 5. Fanout/Debate (多 Agent 协作)

**现有**: Fanout (leader→workers→merger) / Debate (对抗性讨论)

**内容创作中的应用**:
- **Fanout**: 研究 Agent 并行收集多个数据源 → Writer 整合
- **Debate**: 两个 Writer Agent 独立写初稿 → Editor Agent 评判选最优 → 合并精华

---

## 提议的三层架构

```
层 0: 触发层 (openclaw-market 提供)
┌──────────────────────────────────────────────────────┐
│  Cron Jobs | Standing Orders | RSS/Blogwatcher       │
│  Telegram 指令 | Webchat 输入 | API Webhook          │
└─────────────────────┬────────────────────────────────┘
                      │
层 1: 编排层 (Zoe — openclaw-healthcare 提供)
┌─────────────────────▼────────────────────────────────┐
│  Intake Decision → Content Spec → Pipeline Manager   │
│                                                       │
│  ┌─────────┐  ┌───────────┐  ┌──────────────────┐   │
│  │ Router  │→ │ Decompose │→ │ Task Group       │   │
│  │         │  │ (AI拆解)  │  │ (Fanout/Serial)  │   │
│  └─────────┘  └───────────┘  └──────────────────┘   │
│                                                       │
│  Worker Loops:                                        │
│  • content-research-loop (15s)                       │
│  • content-draft-loop (15s)                          │
│  • content-review-loop (15s)                         │
│  • content-publish-loop (30s)                        │
└─────────────────────┬────────────────────────────────┘
                      │
层 2: 执行层 (Agent Adapters)
┌─────────────────────▼────────────────────────────────┐
│  ┌────────────┐  ┌────────────┐  ┌────────────┐     │
│  │ Researcher │  │   Writer   │  │  Editor    │     │
│  │ (claude)   │  │ (claude)   │  │ (claude)   │     │
│  │ + web tool │  │ + SOUL.md  │  │ + style    │     │
│  │ + RSS      │  │            │  │   guide    │     │
│  └────────────┘  └────────────┘  └────────────┘     │
│                                                       │
│  ┌────────────┐  ┌──────────────────────────────┐    │
│  │ Publisher  │  │ openclaw-market channels     │    │
│  │ (adapter)  │→ │ X/Telegram/Notion/Webhook   │    │
│  └────────────┘  └──────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

---

## 端到端工作流示例

### 场景：每周技术趋势报告

```
① 触发
   Cron (每周五 9:00) → Standing Order 触发

② Intake
   Zoe Intake 收到: "生成本周 AI 领域技术趋势报告"
   → Router 判断: 长内容 → 走 spec 流程

③ Content Spec
   AI 生成 Content Brief:
   - 数据源: HackerNews, ArXiv, Twitter/X 热门话题
   - 结构: 概述 → 3-5 个热点 → 技术深度 → 行动建议
   - 风格: SOUL.md 中定义的品牌调性
   - 目标渠道: X thread + Telegram 长文 + Notion 存档

④ Decompose
   拆解为 4 个子任务:
   Task 1: [researcher] 收集 HN/ArXiv/X 数据 (web search tools)
   Task 2: [researcher] 收集竞品/行业数据
   Task 3: [writer] 基于研究结果撰写报告
   Task 4: [editor] 润色 + 格式化 + 生成各渠道版本

⑤ 执行 (Fanout 模式)
   Task 1 + Task 2 并行执行 (researcher agents)
   → 合并研究结果
   → Task 3 串行执行 (writer agent, 注入 SOUL.md 调性)
   → Task 4 串行执行 (editor agent + 多渠道格式化)

⑥ 审批
   内容进入 awaiting_review
   → 人工在 Zoe Web UI 审核
   → 批准: 触发 publish loop
   → 拒绝: 触发 revision (Task 3 重做, 附 feedback)

⑦ 发布
   Publisher adapter 调用 openclaw-market channels:
   → X: 拆成 thread 发送
   → Telegram: 长文推送
   → Notion: 存档到知识库
```

---

## User Review Required

> [!IMPORTANT]
> ### 发布渠道优先级
> 你的内容主要发布到哪些渠道？这决定了 Publisher Adapter 的实现优先级：
> - X/Twitter thread?
> - Telegram 频道?
> - Notion 知识库?
> - 微信公众号/飞书文档?
> - 个人博客 (Markdown → Git)?

> [!IMPORTANT]
> ### Human-in-the-Loop 程度
> 两种模式，你偏好哪种？
> - **全自动**: 内容生产后直接发布，仅异常时人工介入
> - **审批制**: 每篇内容必须人工审核后才发布（当前 Zoe 的 `awaiting_review` 模式）

> [!WARNING]
> ### 存储策略
> 内容是存在 Zoe 的 SQLite 中（和代码任务混在一起），还是独立存储？
> - **共存**: 复用现有 schema，加 `taskKind = "content"` 区分
> - **独立**: 新建 content-specific 表/数据库

## Open Questions

1. **openclaw-healthcare 是否已有 OpenClaw Gateway 实例在运行？** 如果是，内容发布可以直接通过 Gateway 的 channel 能力推送。如果不是，需要额外配置 Gateway 连接。

2. **研究阶段的数据源**：你希望用哪些工具收集信息？openclaw-market 内置了 Tavily/Exa/Firecrawl/Blogwatcher 等，需要确认哪些已配置。

3. **内容语言**：主要产出中文还是英文内容？这影响 SOUL.md 的风格定义和 Editor Agent 的 prompt 设计。

4. **是否需要 i18n**：产出的内容是否需要多语种版本？如果需要，可以直接复用 openclaw-market 的 `docs/.i18n` 管线模式。

---

## Proposed Changes

### 组件 1: Content Adapters (新增)

#### [NEW] `src/lib/agents/content-adapter-registry.ts`
注册内容创作专用的 Agent Adapter（researcher, writer, editor, publisher），复用现有的 `AgentAdapter` 接口但跳过 git worktree 逻辑。

#### [NEW] `src/lib/agents/content-researcher-adapter.ts`
Research Agent：调用 web search tools (Tavily/Exa)，输出结构化研究报告。

#### [NEW] `src/lib/agents/content-writer-adapter.ts`
Writer Agent：注入 SOUL.md 风格，基于研究报告生成内容初稿。

#### [NEW] `src/lib/agents/content-editor-adapter.ts`
Editor Agent：按风格指南润色，生成多渠道格式版本。

---

### 组件 2: Content Pipeline (扩展 pipeline.ts)

#### [MODIFY] `src/lib/task-groups/pipeline.ts`
增加 `CONTENT_PIPELINE_STAGES` 常量和 `isContentPipelineKind()` 判断函数。

#### [NEW] `src/lib/content/content-pipeline.ts`
内容管线的阶段推进逻辑，复用 `writeStageOutput` / `getLatestStageOutput` 基础设施。

---

### 组件 3: Content Intake Router (扩展 decision.ts)

#### [MODIFY] `src/lib/intake/decision.ts`
在现有 `decideIntake()` 中增加 `contentMode` 判断分支，识别内容创作类请求。

---

### 组件 4: Publisher Integration

#### [NEW] `src/lib/content/publishers/`
- `x-publisher.ts` — X/Twitter thread 发布
- `telegram-publisher.ts` — Telegram 频道推送
- `notion-publisher.ts` — Notion 页面存档
- `markdown-publisher.ts` — Git repo Markdown 文件

---

### 组件 5: Content Worker Loop

#### [NEW] `src/lib/content/content-reconcile-loop.ts`
独立的 Worker Loop，按阶段推进内容生产管线。

---

### 组件 6: OpenClaw Gateway Bridge (内容发布通道)

#### [MODIFY] `src/lib/gateway/ws-client.ts`
增加内容发布的 channel 调用方法，复用 Gateway 的多渠道能力。

---

## Verification Plan

### Automated Tests
1. 内容路由决策单元测试 — 验证不同输入被正确分流
2. Content Pipeline 阶段推进测试 — 复用 pipeline.ts 现有测试模式
3. Publisher Adapter 集成测试 — mock 外部 API 验证格式正确

### Manual Verification
1. 端到端冒烟测试：通过 Webchat 提交内容请求 → 观察 Pipeline 推进 → 在 Zoe UI 审核 → 发布到测试频道
2. 在 Zoe Dashboard 中验证内容任务的可视化状态流转

---

## 参考文件索引

| 文件 | 借鉴维度 |
|---|---|
| [UNIFIED_PIPELINE_SPEC.md](file:///Users/youjia/dev/openclaw-healthcare/UNIFIED_PIPELINE_SPEC.md) | 三阶段流水线架构蓝本 |
| [decision.ts](file:///Users/youjia/dev/openclaw-healthcare/src/lib/intake/decision.ts) | Intake 路由决策逻辑 |
| [decompose.ts](file:///Users/youjia/dev/openclaw-healthcare/src/lib/specs/decompose.ts) | AI 驱动的任务拆解 |
| [confirm-spec.ts](file:///Users/youjia/dev/openclaw-healthcare/src/lib/specs/confirm-spec.ts) | Spec 锁定 + 任务物化 |
| [pipeline.ts](file:///Users/youjia/dev/openclaw-healthcare/src/lib/task-groups/pipeline.ts) | 阶段管理 + Stage Output |
| [fanout.ts](file:///Users/youjia/dev/openclaw-healthcare/src/lib/task-groups/fanout.ts) | 多 Agent 并行协作 |
| [debate.ts](file:///Users/youjia/dev/openclaw-healthcare/src/lib/task-groups/debate.ts) | 对抗性内容评选 |
| [CLAUDE.md](file:///Users/youjia/dev/openclaw-healthcare/CLAUDE.md) | Worker Loop 架构参考 |
| [docs/concepts/soul.md](file:///Users/youjia/dev/openclaw-market/docs/concepts/soul.md) | 品牌声音工程 |
| [docs/automation/standing-orders.md](file:///Users/youjia/dev/openclaw-market/docs/automation/standing-orders.md) | 自动触发机制 |
