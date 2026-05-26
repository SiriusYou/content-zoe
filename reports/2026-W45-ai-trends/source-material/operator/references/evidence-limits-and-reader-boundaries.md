# Evidence limits and reader boundaries

## Editorial use

Use this reference to keep the W45 report cautious. The report should offer a governance frame: "Healthcare AI has to define what it is allowed to do before it acts." It must not offer a factual weekly market roundup, vendor ranking, product review, legal/regulatory opinion, or claim that permission boundaries prove safety.

## What the sources support

- Decision-support review should distinguish recommendation, directive output, displayed basis, and function-specific context.
- Healthcare AI action authority should be explicit: suggest, draft, route, populate, notify, schedule, trigger, or execute.
- Human authorization should include context, authority, override, escalation, and workload capacity rather than only a final click.
- Access, auditability, integrity, authentication, and logging concepts are relevant when AI touches health records, queues, messages, workflow tasks, or other controlled systems.
- Vendor-embedded and agent-like workflows require local review when capabilities, permissions, interfaces, data access, or downstream actions change.

## What the sources do not support

- No claim that any specific AI tool can safely or legally act autonomously.
- No claim that any local permission model, access control, audit log, or human authorization step is adequate.
- No claim that FDA, ONC, HIPAA, NIST, AMA, WHO, or Joint Commission/CHAI materials create a complete legal answer for a specific workflow.
- No claim that controls prove safety, compliance, privacy protection, cybersecurity readiness, fairness, patient trust, or outcome improvement.
- No claim that every healthcare AI feature is a medical device, certified-health-IT predictive DSI, or high-risk clinical tool.
- No legal advice about FDA, ONC, HIPAA, malpractice, procurement, contracting, security-rule compliance, or professional liability.

## Required evidence warnings

The final report should preserve two evidence-grade warnings in each locale, but each report file should use only its own language:

1. A leading warning that the draft is limited to staged governance, decision-support, security-safeguard, and professional-source material and does not include local deployment evidence, audit-log data, authorization tests, outcome data, legal analysis, or named implementation proof.
2. A mid-report warning near the discussion of permission boundaries, human authorization, auditability, and escalation noting that these controls can make action authority reviewable but do not prove safety, compliance, privacy protection, outcome improvement, or operational maturity.

Locale rule:

- `report.en.md` must include only the English `EVIDENCE_GRADE_WARN` comments.
- `report.zh.md` must include only the Chinese `EVIDENCE_GRADE_WARN` comments.
- Do not duplicate both languages into both report files.

Suggested EN warning:

`EVIDENCE_GRADE_WARN: This draft is limited to staged governance, decision-support, security-safeguard, and professional-source material. It does not include local deployment evidence, audit-log data, authorization tests, outcome data, legal analysis, or named implementation proof.`

Suggested ZH warning:

`EVIDENCE_GRADE_WARN: 本草稿仅限于已暂存的治理、决策支持、安全保障和专业资料。不包含本地部署证据、审计日志数据、授权测试、结果数据、法律分析或具名实施证明。`

Suggested mid-report EN warning:

`EVIDENCE_GRADE_WARN: Permission boundaries, human authorization, audit controls, and escalation paths can make action authority reviewable, but they do not prove safety, compliance, privacy protection, outcome improvement, or operational maturity.`

Suggested mid-report ZH warning:

`EVIDENCE_GRADE_WARN: 权限边界、人工授权、审计控制和升级路径可以让行动权限更可审查，但不能证明安全性、合规性、隐私保护、结果改善或运营成熟度。`

## Reader promise

The report may argue that healthcare AI has to stay inside defined action boundaries before organizations rely on it responsibly. It must not claim that the sector has solved autonomous action, authorization, auditability, permission design, or legal accountability.
