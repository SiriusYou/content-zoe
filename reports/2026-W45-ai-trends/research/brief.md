# Research Brief: Healthcare AI Needs a Permission Line Before It Automates Work

## Scope

This brief is for the `AI in healthcare - weekly` report in `en` and `zh`. It is limited to the staged local source pack and should be treated as a governance and workflow-boundary piece, not a market roundup, product review, legal memo, or proof of safe deployment.

## Core Thesis

Healthcare AI becomes harder to govern once it moves from informing work to acting inside workflows. The report should argue that organizations need explicit action boundaries before they rely on AI to suggest, draft, route, populate, prioritize, notify, schedule, or trigger downstream actions. The key distinction is not "AI or no AI," but what the system is actually allowed to do, what remains a recommendation, and what still requires explicit human authorization.

## Recommended Title Direction

Use an action-authority frame and avoid week keys in the H1. Viable options:

- `Healthcare AI Needs a Permission Line Before It Automates Work`
- `Before Healthcare AI Acts, Define What It May Do`
- `Healthcare AI Still Needs an Authority Boundary`

## Implementation Outline

1. Open with the evidence-limit warning and the thesis that action authority is the next practical governance question.
2. Define the action ladder clearly: suggest, draft, route, populate, prioritize, notify, schedule, trigger.
3. Distinguish recommendation from directive output. Emphasize that displayed basis and function-specific context matter, but do not by themselves prove meaningful review.
4. Explain that human authorization is only meaningful when the reviewer has context, authority, override power, and escalation support. A final click is not enough.
5. Connect permission boundaries to access, auditability, integrity, attribution, and reviewability when AI touches records, queues, messages, or task routing.
6. Cover vendor-embedded and agent-like workflows: local review should be revisited when updates change what the tool can read, write, recommend, route, or trigger.
7. Close with a narrow governance claim: defined action boundaries can make authority reviewable, but they do not prove safety, compliance, privacy protection, outcome improvement, or operational maturity.

## Required Warning Comments

`report.en.md` must include only the English warnings:

```text
EVIDENCE_GRADE_WARN: This draft is limited to staged governance, decision-support, security-safeguard, and professional-source material. It does not include local deployment evidence, audit-log data, authorization tests, outcome data, legal analysis, or named implementation proof.
```

```text
EVIDENCE_GRADE_WARN: Permission boundaries, human authorization, audit controls, and escalation paths can make action authority reviewable, but they do not prove safety, compliance, privacy protection, outcome improvement, or operational maturity.
```

`report.zh.md` must include only the Chinese warnings:

```text
EVIDENCE_GRADE_WARN: 本草稿仅限于已暂存的治理、决策支持、安全保障和专业资料。不包含本地部署证据、审计日志数据、授权测试、结果数据、法律分析或具名实施证明。
```

```text
EVIDENCE_GRADE_WARN: 权限边界、人工授权、审计控制和升级路径可以让行动权限更可审查，但不能证明安全性、合规性、隐私保护、结果改善或运营成熟度。
```

## Safe Claims To Preserve

- Governance should define what the tool may do, what it may only prepare, and what requires explicit human authorization.
- The same model output has different governance meaning depending on whether it stays passive text or changes a record, queue, message, schedule, or downstream process.
- Decision-support review should distinguish information, ranked options, recommendations, prefilled content, and triggered actions.
- Auditability should separate human action, AI suggestion, system-populated fields, vendor-triggered updates, and automated downstream actions.
- Embedded and agent-like features need renewed local review when capabilities, permissions, interfaces, or downstream effects change.

## Claims To Avoid

- Do not claim any specific healthcare AI system can safely or legally act autonomously.
- Do not present FDA, ONC, HHS, NIST, AMA, WHO, or Joint Commission/CHAI materials as a complete legal or operational answer for a local workflow.
- Do not turn logs, role-based access, human review, escalation paths, or source-attribute visibility into proof of safety, compliance, privacy protection, fairness, trust, or clinical benefit.
- Do not imply that every healthcare AI workflow is a medical device, a certified-health-IT predictive DSI, or a high-risk clinical tool.
- Do not rank vendors, praise specific products, or infer local maturity from staged governance material alone.

## Source Gaps To State Transparently

- No local deployment evidence
- No audit-log samples or role-permission tests
- No outcome or performance data
- No vendor contract or configuration evidence
- No legal analysis or named implementation proof

## Practical Writing Note

Keep both locales aligned on argument and evidence limits, but write each report in its own language and include only the locale-matching `EVIDENCE_GRADE_WARN` comments in that file.
