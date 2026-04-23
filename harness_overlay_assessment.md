# harness-overlay 对内容创作工作流的借鉴分析

## 一句话结论

**有借鉴价值，但价值集中在「质量管控协议」而非「执行编排」**——它解决的是"怎么确保产出物过关"，而不是"怎么组织生产流程"。

---

## 定位对比

| 维度 | harness-overlay | openclaw-healthcare (Zoe) | 内容工作流需要 |
|---|---|---|---|
| 核心能力 | 质量门禁 + 证据链 | 任务编排 + 多 Agent 协同 | 两者都需要 |
| 运行模式 | 协议规范（无运行时） | 运行时系统（Web + Worker） | 运行时 |
| 产物类型 | 代码 commit + 评估报告 | 任务/运行/事件 | 内容 artifact |
| 已集成到 Zoe | ✅ `executionProtocol: "harness"` | — | 可复用 |

> [!NOTE]
> harness-overlay 已经作为 v1 参考被集成到了 openclaw-healthcare 中（见 `executionProtocol: "harness"` 和 `harnessPhase` 字段），所以你不需要从 overlay 直接搬代码——需要的是**提取协议理念**并为内容场景定制。

---

## 🟢 高价值借鉴：4 个可迁移的模式

### 1. Contract-Driven Quality Gate（合同驱动的质量门禁）

**Harness 做法**: 每个 sprint 有一个 `sprint-contract-N.md`，定义二元测试标准，必须 evaluator 达成 `agreed` 后才能开始执行。

**内容工作流映射**: → **Content Brief Contract**

```markdown
# Content Brief Contract — 本周技术趋势报告

**Status:** agreed
**Proposed by:** content-strategist
**Date:** 2026-04-22

## Quality Criteria

| # | Criterion | How to Verify | Expected Result |
|---|-----------|---------------|-----------------|
| 1 | 数据源覆盖 | 检查引用来源 | ≥3 个独立数据源 (HN/ArXiv/X) |
| 2 | 无幻觉 | 事实核查 | 所有数据点可溯源 |
| 3 | 品牌调性 | 对照 SOUL.md | 符合品牌声音定义 |
| 4 | 字数范围 | 字数统计 | 2000-3000 字 |
| 5 | 结构完整 | 大纲对照 | 包含 概述/热点/深度/建议 四节 |
| 6 | SEO 就绪 | 检查 meta | 标题/描述/关键词 完整 |
```

**价值**: 把内容质量从"感觉还行"变成**可核查、可自动化的二元判断**。Editor Agent 可以对照合同逐条验证。

---

### 2. Evidence Grade System（证据分级体系）

**Harness 做法**: 4 级证据体系 (A/B/C/D)，Grade D 不可用于最终审批。

**内容工作流映射**:

| 等级 | 代码场景 | 内容场景 |
|---|---|---|
| **Grade A** | 运行时证据 + 持久化回归 | 已发布 + 用户反馈数据 |
| **Grade B** | 浏览器交互截图 | 人工编辑审核通过 |
| **Grade C** | 单元测试/代码检查 | AI Agent 自动检查通过 |
| **Grade D** | 纯推理/代码阅读 | AI 自认为"写得不错" |

**核心规则迁移**: 
- AI Editor Agent 的自动通过 = Grade C，不能作为最终发布依据
- 人工审核 = Grade B，可发布
- 发布后有用户互动数据 = Grade A

---

### 3. Experiment Mode（实验模式 → 内容 A/B 测试）

**Harness 做法**: v2 实验模式用 `program.md` + `experiment-results.jsonl` 账本，支持 `keep/discard/crash` 三种结果。

**这是 harness-overlay 对内容工作流最有启发性的部分**。映射方式：

```
代码场景: "比较两种 prompt 变体的代码生成质量"
                    ↓
内容场景: "比较两种写作风格/结构的内容效果"
```

**具体应用**: 让两个 Writer Agent 用不同策略写同一主题（Debate 模式），然后用实验账本记录比较结果：

```jsonl
{"run_id":"content-exp-001","experiment_id":"style-comparison","candidate_id":"formal-analytical","outcome":"keep","comparison_fields":{"readability_score":78,"seo_score":85,"brand_alignment":0.92},"evidence_summary":"Formal style better matches SOUL.md brand voice"}
{"run_id":"content-exp-002","experiment_id":"style-comparison","candidate_id":"casual-narrative","outcome":"discard","comparison_fields":{"readability_score":82,"seo_score":71,"brand_alignment":0.65},"evidence_summary":"Higher readability but brand misalignment"}
```

**价值**: 内容创作天然适合 A/B 比较，Harness 的实验协议给了一个**结构化的记录和决策框架**。

---

### 4. Structured Evaluation Artifacts（结构化评估产物）

**Harness 做法**: 每个 feature 都有 `evaluations/*-eval.md`，包含逐条标准检查 + 证据等级 + 最终建议。

**内容工作流映射**: → **Content Review Report**

```markdown
# Content Review — 2026-W17 AI 趋势报告

## Summary
- **Overall:** PASS
- **Criteria Passed:** 5/6
- **Evidence Grade:** B (人工审核)

## Criterion Results

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | 数据源覆盖 | PASS | 引用 HN(3), ArXiv(2), X(5) |
| 2 | 无幻觉 | PASS | 人工核实 12 个数据点全部可溯源 |
| 3 | 品牌调性 | PASS | SOUL.md 对照检查通过 |
| 4 | 字数范围 | PASS | 2,847 字 |
| 5 | 结构完整 | FAIL | 缺少"行动建议"小节 |
| 6 | SEO 就绪 | PASS | meta title/desc/keywords 完整 |

## Recommendation
NEEDS-FIX. 补充"行动建议"后重新提交。
```

---

## 🟡 低价值 / 不适用的部分

### Sprint Backlog 机制
Harness 的 sprint backlog (`pending → in-progress → done → evaluated`) 是面向**代码 feature 的单一任务执行**的。内容创作更适合 Zoe 已有的 **Pipeline Stage** 模型（research → draft → edit → publish），不需要再引入一层 sprint 概念。

### 代码特定的 Gate Scripts
`check-coverage.sh`、`check-scope.sh` 等是代码特定的门禁。内容场景需要**替代门禁**而不是复用这些脚本：
- `check-coverage.sh` → `check-source-diversity.sh`（引用多样性检查）
- `check-scope.sh` → `check-topic-drift.sh`（主题偏移检查）
- `validate-state.sh` → 可复用（结构验证是通用的）

### 单一 Feature 纪律
"一次只做一个 feature" 是代码场景为防范 scope creep 设计的。内容创作中一篇文章本身就是一个原子单元，不需要这个约束——但如果是内容**系列**，这个纪律可以映射为"一次只生产一篇"。

---

## 集成建议

不要从 harness-overlay 直接搬文件。正确的做法是：

1. **Content Brief Contract** — 参照 `sprint-contract-*.md` 的格式，为每类内容定义标准合同模板
2. **Evidence Grade** — 在 Zoe 的审批流程中区分 AI 自动审核 (C) vs 人工审核 (B)
3. **Experiment Ledger** — 在 Debate 模式中引入 `experiment-results.jsonl` 风格的账本记录 A/B 比较
4. **Review Artifact** — Editor Agent 产出结构化的评审报告而非简单的 pass/fail

这四个模式全部通过 Zoe 的现有基础设施实现（`executionProtocol: "harness"` + `harnessPhase` + events table），不需要额外的系统集成。
