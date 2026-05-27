# Evidence limits and reader boundaries

## Editorial use

Use this reference to keep the W51 report cautious. The report should offer a governance frame: "Healthcare AI updates should leave a change record." It must not offer a factual weekly market roundup, vendor ranking, product review, legal/regulatory opinion, or proof that any local AI update was safe or unsafe.

## What the sources support

- AI-enabled workflow updates can be reviewed through change records, release notes, source attributes, affected workflows, validation triggers, monitoring plans, user notices, training updates, fallback readiness, rollback paths, and accountable ownership.
- FDA PCCP materials can inform bounded questions about planned changes to AI-enabled device software functions. They must not be treated as a universal framework for all healthcare AI or as legal advice.
- ONC SAFER and DSI materials support review questions about configuration, validation, maintenance, system interfaces, contingency planning, and decision-support visibility.
- NIST, WHO, AMA, and Joint Commission/CHAI materials support lifecycle governance, monitoring, accountability, local validation, workflow fit, and professional responsibility.

## What the sources do not support

- No claim that any specific AI workflow, product, vendor, hospital, health system, or public program updated safely, unsafely, legally, illegally, effectively, or ineffectively.
- No local release notes, version records, change tickets, validation results, user notices, training records, rollback tests, monitoring data, legal analysis, measured outcomes, or named implementation proof.
- No legal advice about FDA, PCCPs, medical devices, ONC certification, HIPAA, malpractice, procurement, disclosure, civil rights, cybersecurity, or professional responsibility.
- No claim that change records, validation, monitoring, release notes, user notices, rollback plans, or committees prove safety, compliance, effectiveness, patient trust, outcome improvement, or operational maturity.

## Required evidence warnings

The final report should preserve evidence-grade warnings in each locale, but each report file should use only its own language. Warning count may vary if every warning is source-bounded and locale-pure:

1. A leading warning that the draft is limited to staged change-control, health IT safety, decision-support, device-software, risk-management, governance, and professional-source material and does not include local update logs, release notes, validation results, user notices, legal analysis, measured outcomes, or named implementation proof.
2. A mid-report warning near the discussion of release notes, validation triggers, monitoring, rollback plans, user notices, and change boards noting that these practices can make updates more reviewable but do not prove safety, compliance, effectiveness, patient trust, outcome improvement, or operational maturity.

Locale rule:

- `report.en.md` must include only English `EVIDENCE_GRADE_WARN` comments.
- `report.zh.md` must include only Chinese `EVIDENCE_GRADE_WARN` comments.
- Do not duplicate both languages into both report files.

Suggested EN warning:

`EVIDENCE_GRADE_WARN: This draft is limited to staged change-control, health IT safety, decision-support, device-software, risk-management, governance, and professional-source material. It does not include local update logs, release notes, validation results, user notices, legal analysis, measured outcomes, or named implementation proof.`

Suggested ZH warning:

`EVIDENCE_GRADE_WARN: 本草稿仅限于已暂存的变更控制、健康 IT 安全、决策支持、设备软件、风险管理、治理和专业资料。不包含本地更新日志、发布说明、验证结果、用户通知、法律分析、已测量结果或具名实施证明。`

Suggested mid-report EN warning:

`EVIDENCE_GRADE_WARN: Change records, release notes, validation triggers, monitoring, rollback plans, user notices, and change boards can make updates more reviewable, but they do not prove safety, compliance, effectiveness, patient trust, outcome improvement, or operational maturity.`

Suggested mid-report ZH warning:

`EVIDENCE_GRADE_WARN: 变更记录、发布说明、验证触发条件、监测、回滚计划、用户通知和变更委员会可以让更新更可审查，但不能证明安全性、合规性、有效性、患者信任、结果改善或运营成熟度。`

## Reader promise

The report may argue that updates to AI-enabled healthcare workflows need a structured change record. It must not claim that the sector has solved change control, post-update validation, release communication, rollback, or update safety.
