# Evidence limits and reader boundaries

## Editorial use

Use this reference to keep the W50 report cautious. The report should offer a governance frame: "Healthcare AI needs a near-miss file." It must not offer a factual weekly market roundup, vendor ranking, product review, legal/regulatory opinion, or proof that any local AI workflow caused harm or improved safety.

## What the sources support

- Patient-safety event reporting, near-miss reporting, unsafe-condition review, investigation, analysis, communication, resolution, contingency planning, decision-support visibility, lifecycle monitoring, governance, and corrective-action ownership are useful governance questions for AI-enabled workflows.
- A reviewable file can connect technical traces, human workflow context, patient-facing impact, triage, fallback use, escalation, communication, corrective action, and follow-up.
- Incident and near-miss records can support learning, but they are not proof of safety, compliance, harm reduction, patient trust, culture, outcome improvement, or operational maturity.
- Absence of incident reports is not evidence that no incidents or unsafe conditions exist.

## What the sources do not support

- No claim that any specific AI workflow, product, vendor, hospital, health system, or public program caused harm, avoided harm, concealed harm, complied with law, violated law, operated safely, or operated unsafely.
- No local incident reports, near-miss logs, unsafe-condition reports, patient harm investigations, root-cause analyses, patient communications, technical logs, legal analysis, PSO or PSWP determinations, measured outcomes, or named implementation proof.
- No legal advice about PSQIA, Patient Safety Organizations, Patient Safety Work Product, malpractice, FDA reporting, ONC certification, HIPAA, civil rights, procurement, disclosure, privilege, cybersecurity, or professional responsibility.

## Required evidence warnings

The final report should preserve evidence-grade warnings in each locale, but each report file should use only its own language. Warning count may vary if every warning is source-bounded and locale-pure:

1. A leading warning that the draft is limited to staged patient-safety, incident-reporting, decision-support, contingency-planning, risk-management, governance, and professional-source material and does not include local incident reports, near-miss logs, patient harm investigations, legal analysis, measured outcomes, or named implementation proof.
2. A mid-report warning near the discussion of event reporting, technical logs, dashboards, corrective actions, communication records, and committee review noting that these practices can make safety learning more reviewable but do not prove safety, compliance, harm reduction, patient trust, culture, outcome improvement, or operational maturity.

Locale rule:

- `report.en.md` must include only English `EVIDENCE_GRADE_WARN` comments.
- `report.zh.md` must include only Chinese `EVIDENCE_GRADE_WARN` comments.
- Do not duplicate both languages into both report files.

Suggested EN warning:

`EVIDENCE_GRADE_WARN: This draft is limited to staged patient-safety, incident-reporting, decision-support, contingency-planning, risk-management, governance, and professional-source material. It does not include local incident reports, near-miss logs, patient harm investigations, legal analysis, measured outcomes, or named implementation proof.`

Suggested ZH warning:

`EVIDENCE_GRADE_WARN: 本草稿仅限于已暂存的患者安全、事件报告、决策支持、应急规划、风险管理、治理和专业资料。不包含本地事件报告、未遂事件日志、患者伤害调查、法律分析、已测量结果或具名实施证明。`

Suggested mid-report EN warning:

`EVIDENCE_GRADE_WARN: Event reports, near-miss files, technical traces, dashboards, corrective actions, communication records, and committee review can make safety learning more reviewable, but they do not prove safety, compliance, harm reduction, patient trust, safety culture, outcome improvement, or operational maturity.`

Suggested mid-report ZH warning:

`EVIDENCE_GRADE_WARN: 事件报告、未遂事件档案、技术轨迹、仪表盘、纠正措施、沟通记录和委员会审查可以让安全学习更可审查，但不能证明安全性、合规性、伤害减少、患者信任、安全文化、结果改善或运营成熟度。`

## Reader promise

The report may argue that AI-enabled healthcare workflows need a structured way to capture near misses and unsafe conditions. It must not claim that the sector has solved incident reporting, patient-safety response, communication, corrective action, or AI harm detection.
