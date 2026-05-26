# Research Brief: Healthcare AI Has to Fit the Workday

## Objective

Produce a source-bounded report on `AI in healthcare - weekly` that argues a narrow governance thesis: healthcare AI should be judged not only by documentation or model claims, but by whether the AI-enabled workflow fits real human work under real conditions.

## Core thesis

The strongest available angle is workload and workflow fit. After intake, transparency, monitoring, and exit planning, the open question is whether clinicians, staff, patients, and oversight teams can actually use the workflow without adding unmanaged attention load, alert fatigue, documentation burden, training gaps, or ambiguous human-review expectations.

## What to emphasize

1. Documentation is not enough.
   An AI workflow is not ready just because it has a policy, intake record, model description, or source attribute. The report should ask who uses the output, in what environment, under what time pressure, with what authority to question or override it.

2. Attention is a limited resource.
   AI prompts, summaries, triage flags, documentation suggestions, and decision-support outputs all compete for attention. Alert fatigue is a useful cautionary analogy, not proof of a measured AI outcome.

3. Local validation should include workday burden.
   Validation should look beyond output quality and include time to review, queue growth, handoff friction, duplicate documentation, escalation friction, training completion, and user-reported burden.

4. Human review must be operational, not symbolic.
   "Human in the loop" only matters if the reviewer has context, time, training, authority, and escalation support. Otherwise oversight can become a paper control.

5. Governance should be category-aware.
   FDA device usability guidance is a disciplined example for device contexts, but it should not be generalized to every healthcare AI workflow. Regulated devices, certified-health-IT predictive DSI, ambient documentation tools, patient-facing assistants, and administrative models should not be treated as one category.

## Safe claims

- Healthcare AI governance should evaluate effects on real work, not only whether documentation exists.
- Human-factors review can ask who sees the output, what else they see, what task they are doing, what pressure they are under, and what happens when the output is wrong or unclear.
- Alert fatigue is a relevant cautionary analogy for AI-mediated prompts and decision-support outputs that compete for attention.
- Burden reduction should be framed as a claim to test locally, not a default property of AI.
- Training should cover intended use, known limits, workflow steps, escalation routes, documentation expectations, and change notices.

## Claims to avoid

- Do not claim any specific AI tool reduces burden, burnout, alert fatigue, cost, staffing pressure, or time burden.
- Do not claim human-factors review, training, workflow design, source attributes, or usability documentation proves safety, effectiveness, fairness, privacy, security, compliance, trust, or operational maturity.
- Do not imply every healthcare AI tool is a regulated device or a covered predictive DSI.
- Do not offer legal or regulatory advice.
- Do not claim any named organization has completed local validation or has adequate oversight capacity.

## Recommended structure

1. Lead with the workday-fit thesis and the evidence-limits posture.
2. Explain why workflow fit matters even for assistive AI.
3. Make the burden case concrete through attention load and alert-fatigue analogies.
4. Define what local validation should measure in the workday.
5. Make human-review capacity concrete: reviewer context, authority, staffing, and escalation.
6. Close with category-aware governance: different tools need different routing and evidence questions.

## Title guidance

- H1 must not include the week key.
- Prefer a workload or workday-fit frame.
- Avoid recent title frames listed in the staged boundary note.
- Strong candidates:
  - `Healthcare AI Still Has to Fit the Workday`
  - `A Workload Test for Healthcare AI`
  - `Healthcare AI Meets the Workday`

## Required evidence warnings for later report drafting

`report.en.md` must include only the English warnings:

```text
EVIDENCE_GRADE_WARN: This draft is limited to staged human-factors, workflow, patient-safety, and governance source material. It does not include local workload measurements, usability-test results, deployment evidence, outcome data, or named case proof.

EVIDENCE_GRADE_WARN: Human-factors review, alert-burden checks, training plans, and local validation can improve review quality, but they do not prove safety, effectiveness, burden reduction, or operational maturity.
```

`report.zh.md` must include only the Chinese warnings:

```text
EVIDENCE_GRADE_WARN: 本草稿仅限于已暂存的人因、工作流、患者安全和治理资料。不包含本地工作量测量、可用性测试结果、部署证据、结果数据或具名案例证明。

EVIDENCE_GRADE_WARN: 人因审查、警报负担检查、培训计划和本地验证可以提升审查质量，但不能证明安全性、有效性、负担降低或运营成熟度。
```

## Source gaps to state plainly

- No local workload measurements.
- No usability-test results.
- No deployment evidence or named implementation cases.
- No outcome data.
- No proof that any local oversight process is adequate.
