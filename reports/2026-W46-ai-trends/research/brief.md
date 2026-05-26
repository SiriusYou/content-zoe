# Research Brief

## Core thesis

Healthcare AI is only operationally ready when the fallback works. This report should move from launch-time governance to continuity: what happens when an AI feature, EHR capability, interface, data feed, vendor platform, identity service, queue, or model endpoint is unavailable, degraded, delayed, or intentionally paused.

## Recommended angle

Write this as a continuity and degraded-operation governance brief, not as a market roundup or product assessment. The strongest source-grounded argument is that fallback planning has to specify:

- what work depends on the AI-enabled step;
- which upstream data and downstream tasks break or degrade;
- who decides when to switch modes;
- what manual or alternate workflow takes over;
- how records, messages, queues, summaries, tasks, and handoffs are reconciled after recovery;
- what conditions are required before restarting full or narrowed AI-enabled use.

## Draft shape

Suggested H1 direction: use a fallback or downtime frame and avoid the recent title templates listed in the staged boundary file. Viable directions include:

- `Healthcare AI Has a Downtime Problem Before It Has a Scale Story`
- `If the Model Stops, What Keeps Moving?`
- `Healthcare AI Needs a Fallback, Not Just a Launch Plan`

Suggested section flow:

1. Lead with the continuity question and the first `EVIDENCE_GRADE_WARN`.
2. Explain that AI dependence must be mapped across tool, EHR, interface, data feed, vendor, and workflow dependencies.
3. Make fallback concrete: triggers, owners, substitute workflow, minimum information, deferred work, escalations, and communication paths.
4. Cover degraded data and recovery integrity: missing, delayed, duplicated, stale, or inconsistent records, messages, queues, summaries, and task states.
5. Close on drills, revision, and restart criteria as governance work rather than proof of readiness, with the second `EVIDENCE_GRADE_WARN`.

## Source-grounded claims to use

- Continuity review should cover planned downtime, unplanned disruption, degraded service, interface failure, data-feed delay, vendor-service degradation, and intentional pause.
- Criticality differs by workflow. Scheduling support, summarization, triage flags, order-related support, and patient messaging do not have the same downtime consequences.
- Recovery is not just restored access. It also requires reconciliation of notes, orders, alerts, messages, queues, summaries, and handoffs created or delayed during downtime.
- A model can stay unchanged while the practical reliability of the workflow shifts because an API, identity service, queue, vendor release, or interface changes.
- Restart should be a decision with scope, not a purely technical event.

## Claims to avoid

- Do not present contingency planning, backups, drills, or reconciliation as proof of safety, continuity, compliance, cybersecurity readiness, or clinical benefit.
- Do not imply every AI outage is an EHR outage, every AI workflow handles protected health information, or every outage is a reportable incident.
- Do not infer local testing success, service levels, contractual protections, or legal conclusions.
- Do not turn this into a vendor comparison, implementation proof point, or generalized weekly news summary.

## Evidence posture

State the source gap plainly. The staged material supports governance questions about contingency planning, availability, integrity, interfaces, manual-mode operations, communication, and restart criteria. It does not provide local downtime drills, incident logs, recovery-time evidence, audit-log validation, patient outcomes, legal analysis, contracts, architecture diagrams, or named implementation proof.

Required warning lines for downstream report files:

`report.en.md`

```text
EVIDENCE_GRADE_WARN: This draft is limited to staged health IT contingency, security-safeguard, resilience, and governance source material. It does not include local downtime drills, recovery tests, incident logs, patient outcomes, legal analysis, or named implementation proof.
EVIDENCE_GRADE_WARN: Fallback workflows, backups, reconciliation routines, drills, and restart criteria can make downtime response more reviewable, but they do not prove safety, compliance, cybersecurity readiness, continuity, outcome improvement, or operational maturity.
```

`report.zh.md`

```text
EVIDENCE_GRADE_WARN: 本草稿仅限于已暂存的健康 IT 应急、安全保障、韧性和治理资料。不包含本地停机演练、恢复测试、事件日志、患者结果、法律分析或具名实施证明。
EVIDENCE_GRADE_WARN: 备用工作流、备份、对账流程、演练和重启标准可以让停机响应更可审查，但不能证明安全性、合规性、网络安全就绪度、连续性、结果改善或运营成熟度。
```
