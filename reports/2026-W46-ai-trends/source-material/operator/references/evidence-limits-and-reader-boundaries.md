# Evidence limits and reader boundaries

## Editorial use

Use this reference to keep the W46 report cautious. The report should offer a governance frame: "Healthcare AI is only ready when the fallback works." It must not offer a factual weekly market roundup, vendor ranking, product review, legal/regulatory opinion, cybersecurity assessment, or proof that any continuity plan works.

## What the sources support

- Planned and unplanned EHR unavailability can create safety and continuity concerns.
- AI-enabled workflows may depend on EHR availability, data feeds, interfaces, hosted services, identity systems, vendor platforms, and local queues or messages.
- Fallback planning should define mode-switch triggers, manual workflows, roles, communication, criticality, reconciliation, and restart criteria.
- Availability, integrity, backup, disaster recovery, emergency-mode operation, testing, revision, and criticality analysis are relevant concepts when systems containing electronic protected health information are disrupted.
- Local governance should revisit fallback plans when workflows, interfaces, vendors, data flows, AI capabilities, or operational conditions change.

## What the sources do not support

- No claim that any specific healthcare AI workflow is resilient, highly available, compliant, cybersecurity-ready, safe in downtime, or clinically beneficial.
- No claim that any local fallback plan, backup plan, downtime binder, manual workflow, or recovery procedure has been tested.
- No claim that ONC SAFER Guides, HHS Security Rule materials, HHS ransomware guidance, NIST AI RMF, or Joint Commission/CHAI materials create a complete legal or operational answer for a local workflow.
- No claim that restored access means restored safety, complete records, or successful reconciliation.
- No claim that every AI workflow handles protected health information or that every AI outage is a reportable privacy/security incident.
- No legal advice about HIPAA, FDA, ONC, malpractice, procurement, contracting, cybersecurity, or emergency operations.

## Required evidence warnings

The final report should preserve two evidence-grade warnings in each locale, but each report file should use only its own language:

1. A leading warning that the draft is limited to staged health IT contingency, security-safeguard, resilience, and governance source material and does not include local downtime drills, recovery tests, incident logs, patient outcomes, legal analysis, or named implementation proof.
2. A mid-report warning near the discussion of fallback workflows, backups, reconciliation, drills, and restart criteria noting that these practices can make downtime response more reviewable but do not prove safety, compliance, cybersecurity readiness, continuity, outcome improvement, or operational maturity.

Locale rule:

- `report.en.md` must include only the English `EVIDENCE_GRADE_WARN` comments.
- `report.zh.md` must include only the Chinese `EVIDENCE_GRADE_WARN` comments.
- Do not duplicate both languages into both report files.

Suggested EN warning:

`EVIDENCE_GRADE_WARN: This draft is limited to staged health IT contingency, security-safeguard, resilience, and governance source material. It does not include local downtime drills, recovery tests, incident logs, patient outcomes, legal analysis, or named implementation proof.`

Suggested ZH warning:

`EVIDENCE_GRADE_WARN: 本草稿仅限于已暂存的健康 IT 应急、安全保障、韧性和治理资料。不包含本地停机演练、恢复测试、事件日志、患者结果、法律分析或具名实施证明。`

Suggested mid-report EN warning:

`EVIDENCE_GRADE_WARN: Fallback workflows, backups, reconciliation routines, drills, and restart criteria can make downtime response more reviewable, but they do not prove safety, compliance, cybersecurity readiness, continuity, outcome improvement, or operational maturity.`

Suggested mid-report ZH warning:

`EVIDENCE_GRADE_WARN: 备用工作流、备份、对账流程、演练和重启标准可以让停机响应更可审查，但不能证明安全性、合规性、网络安全就绪度、连续性、结果改善或运营成熟度。`

## Reader promise

The report may argue that healthcare AI has to work through degraded operation and recovery before organizations rely on it responsibly. It must not claim that the sector has solved downtime, fallback execution, recovery reconciliation, cybersecurity readiness, or emergency-mode governance.
