# Evidence limits and reader boundaries

## Editorial use

Use this reference to keep the W47 report cautious. The report should offer a governance frame: "Healthcare AI has a use-creep problem." It must not offer a factual weekly market roundup, vendor ranking, product review, legal/regulatory opinion, or proof that any scope-control system works.

## What the sources support

- Intended use, context, users, workflow setting, data source, and decision point are important to healthcare AI governance.
- Scope expansion can change the governance question even when the model, vendor, or product label appears unchanged.
- General-purpose and embedded AI tools can be used in ways that formal records do not initially capture.
- Use-creep controls can include approved-use records, monitoring against actual use, owner sign-off, change notices, local validation, training updates, fallback updates, and escalation routes.
- Governance sources can define useful review questions; they do not prove local implementation quality or benefit.

## What the sources do not support

- No claim that any specific healthcare AI workflow expanded safely or unsafely.
- No claim that any specific organization, vendor, product, or health system has use creep.
- No claim that a registry, intake record, source attribute, change notice, training update, audit log, or approval workflow proves safety, compliance, fairness, privacy protection, patient trust, outcome improvement, or operational maturity.
- No claim that every expanded use is inappropriate.
- No legal advice about FDA, ONC, HIPAA, malpractice, procurement, contracting, professional responsibility, or patient communication.

## Required evidence warnings

The final report should preserve two evidence-grade warnings in each locale, but each report file should use only its own language:

1. A leading warning that the draft is limited to staged intended-use, decision-support, risk-management, governance, and professional-source material and does not include local usage logs, user-behavior evidence, outcome data, legal analysis, or named implementation proof.
2. A mid-report warning near the discussion of approved-use records, expansion review, monitoring, change notices, and training updates noting that these practices can make use creep more reviewable but do not prove safety, compliance, fairness, privacy protection, patient trust, outcome improvement, or operational maturity.

Locale rule:

- `report.en.md` must include only the English `EVIDENCE_GRADE_WARN` comments.
- `report.zh.md` must include only the Chinese `EVIDENCE_GRADE_WARN` comments.
- Do not duplicate both languages into both report files.

Suggested EN warning:

`EVIDENCE_GRADE_WARN: This draft is limited to staged intended-use, decision-support, risk-management, governance, and professional-source material. It does not include local usage logs, user-behavior evidence, outcome data, legal analysis, or named implementation proof.`

Suggested ZH warning:

`EVIDENCE_GRADE_WARN: 本草稿仅限于已暂存的预期用途、决策支持、风险管理、治理和专业资料。不包含本地使用日志、用户行为证据、结果数据、法律分析或具名实施证明。`

Suggested mid-report EN warning:

`EVIDENCE_GRADE_WARN: Approved-use records, expansion review, monitoring, change notices, and training updates can make use creep more reviewable, but they do not prove safety, compliance, fairness, privacy protection, patient trust, outcome improvement, or operational maturity.`

Suggested mid-report ZH warning:

`EVIDENCE_GRADE_WARN: 已批准用途记录、扩展审查、监测、变更通知和培训更新可以让用途蔓延更可审查，但不能证明安全性、合规性、公平性、隐私保护、患者信任、结果改善或运营成熟度。`

## Reader promise

The report may argue that healthcare AI should not quietly expand beyond its reviewed context. It must not claim that the sector has solved use creep, scaling, training drift, scope review, or accountability drift.
