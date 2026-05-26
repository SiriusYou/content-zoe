# Evidence limits and reader boundaries

## Editorial use

Use this reference to keep the W44 report cautious. The report should offer a governance frame: "Healthcare AI has to fit the workday." It must not offer a factual weekly market roundup, vendor ranking, case-specific performance claim, or legal/regulatory opinion.

## What the sources support

- Human-factors and usability questions matter when technology enters high-consequence healthcare work.
- Workflow fit should include users, use environments, interfaces, attention load, training, review authority, and escalation paths.
- Alert fatigue is a relevant patient-safety analogy for AI prompts, signals, summaries, and decision-support outputs that compete for attention.
- Local validation and monitoring should include workflow effects and burden claims, not only model descriptions.
- Device, certified-health-IT, and non-device AI contexts require different routing and evidence questions.

## What the sources do not support

- No claim that any specific AI tool reduces burden, improves safety, improves outcomes, improves productivity, reduces alert fatigue, or increases trust.
- No claim that every AI tool is a regulated device, certified-health-IT predictive DSI, or high-risk clinical intervention.
- No claim that any specific hospital, vendor, or product has succeeded or failed.
- No claim that human-factors review, training, workflow design, source attributes, or usability documentation proves local implementation quality.
- No legal advice about FDA, ONC, HIPAA, malpractice, procurement, or contract obligations.

## Required evidence warnings

The final report should preserve two evidence-grade warnings in each locale, but each report file should use only its own language:

1. A leading warning that the draft is limited to staged human-factors, workflow, patient-safety, and governance source material and does not include local workload measurements, usability-test results, deployment evidence, outcome data, or named case proof.
2. A mid-report warning near the discussion of human-factors review, alert burden, training, and local validation noting that those practices can improve review quality but do not prove safety, effectiveness, burden reduction, or operational maturity.

Locale rule:

- `report.en.md` must include only the English `EVIDENCE_GRADE_WARN` comments.
- `report.zh.md` must include only the Chinese `EVIDENCE_GRADE_WARN` comments.
- Do not duplicate both languages into both report files.

Suggested EN warning:

`EVIDENCE_GRADE_WARN: This draft is limited to staged human-factors, workflow, patient-safety, and governance source material. It does not include local workload measurements, usability-test results, deployment evidence, outcome data, or named case proof.`

Suggested ZH warning:

`EVIDENCE_GRADE_WARN: 本草稿仅限于已暂存的人因、工作流、患者安全和治理资料。不包含本地工作量测量、可用性测试结果、部署证据、结果数据或具名案例证明。`

Suggested mid-report EN warning:

`EVIDENCE_GRADE_WARN: Human-factors review, alert-burden checks, training plans, and local validation can improve review quality, but they do not prove safety, effectiveness, burden reduction, or operational maturity.`

Suggested mid-report ZH warning:

`EVIDENCE_GRADE_WARN: 人因审查、警报负担检查、培训计划和本地验证可以提升审查质量，但不能证明安全性、有效性、负担降低或运营成熟度。`

## Reader promise

The report may argue that healthcare AI has to fit the workday before organizations can rely on it responsibly. It must not claim that the sector has solved human factors, burden, usability, training, or oversight capacity.
