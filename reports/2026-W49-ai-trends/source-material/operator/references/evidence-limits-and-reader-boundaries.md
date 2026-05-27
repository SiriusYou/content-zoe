# Evidence limits and reader boundaries

## Editorial use

Use this reference to keep the W49 report cautious. The report should offer a governance frame: "Healthcare AI equity has to be checked where the tool is used." It must not offer a factual weekly market roundup, vendor ranking, product review, legal/regulatory opinion, or proof that any local workflow is fair or unfair.

## What the sources support

- Patient care decision support tools and AI-enabled workflows can be reviewed for nondiscrimination, local context, source attributes, decision-support logic, lifecycle risk, monitoring, governance, oversight, access burden, and accountability.
- Local equity review can examine subgroup behavior, data proxies, missingness, access pathways, language and disability needs, health-literacy constraints, workflow burden, feedback channels, recourse, mitigation, and ownership.
- Source attributes, model cards, monitoring records, complaints, appeals, dashboards, and mitigation records can make risk more reviewable.
- Equity review can produce decisions such as continue, narrow, monitor, mitigate, pause, reopen validation, add a fallback path, or assign follow-up ownership.

## What the sources do not support

- No claim that any specific AI workflow, product, vendor, hospital, health system, or public program is fair, unfair, discriminatory, compliant, noncompliant, safe, unsafe, effective, ineffective, or trustworthy.
- No claim that subgroup review, source attributes, monitoring, feedback channels, mitigation plans, governance boards, audits, model cards, or source data prove fairness, compliance, safety, patient trust, outcome improvement, or operational maturity.
- No local subgroup performance data, utilization logs, outcome data, patient complaints, appeal files, language-service records, accessibility tests, legal analysis, enforcement record, or named implementation proof.
- No legal advice about Section 1557, patient care decision support tools, FDA, ONC certification, HIPAA, malpractice, procurement, civil rights, cybersecurity, or professional responsibility.

## Required evidence warnings

The final report should preserve two evidence-grade warnings in each locale, but each report file should use only its own language:

1. A leading warning that the draft is limited to staged nondiscrimination, decision-support, risk-management, governance, and professional-source material and does not include local subgroup performance data, utilization logs, patient outcomes, complaint records, legal analysis, or named implementation proof.
2. A mid-report warning near the discussion of subgroup review, source attributes, monitoring, feedback channels, mitigation, and governance ownership noting that these practices can make equity risks more reviewable but do not prove fairness, compliance, safety, patient trust, outcome improvement, or operational maturity.

Locale rule:

- `report.en.md` must include only the English `EVIDENCE_GRADE_WARN` comments.
- `report.zh.md` must include only the Chinese `EVIDENCE_GRADE_WARN` comments.
- Do not duplicate both languages into both report files.

Suggested EN warning:

`EVIDENCE_GRADE_WARN: This draft is limited to staged nondiscrimination, decision-support, risk-management, governance, and professional-source material. It does not include local subgroup performance data, utilization logs, patient outcomes, complaint records, legal analysis, or named implementation proof.`

Suggested ZH warning:

`EVIDENCE_GRADE_WARN: 本草稿仅限于已暂存的非歧视、决策支持、风险管理、治理和专业资料。不包含本地分组性能数据、使用日志、患者结果、投诉记录、法律分析或具名实施证明。`

Suggested mid-report EN warning:

`EVIDENCE_GRADE_WARN: Subgroup review, source attributes, monitoring, feedback channels, and mitigation records can make equity risks more reviewable, but they do not prove fairness, compliance, safety, patient trust, outcome improvement, or operational maturity.`

Suggested mid-report ZH warning:

`EVIDENCE_GRADE_WARN: 分组审查、来源属性、监测、反馈渠道和缓解记录可以让公平风险更可审查，但不能证明公平性、合规性、安全性、患者信任、结果改善或运营成熟度。`

## Reader promise

The report may argue that local equity review should examine how an AI-enabled workflow behaves for different patients, settings, access pathways, and staff roles. It must not claim that the sector has solved fairness, nondiscrimination review, subgroup monitoring, recourse, patient trust, or mitigation.
