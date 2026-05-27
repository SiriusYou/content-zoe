# Evidence limits and reader boundaries

## Evidence posture

The source basis supports a governance-operating report, not a factual survey of actual AI review queues. The reader should understand that the report is source-bounded to AI risk-management, health IT safety, decision-support, governance, device-context, and professional-source material. It does not contain local queue records, committee calendars, audit logs, utilization data, user interviews, legal analysis, measured outcomes, or named implementation proof.

The report may say that a first-cycle review queue helps convert carry-forward items into action. It may not say that the queue proves that governance is mature, compliant, safe, fair, effective, resilient, trusted, or outcome-improving.

## Required warning posture

Use a leading warning in both locales. The English warning should stay close to:

`<!-- EVIDENCE_GRADE_WARN: This report is limited to source-bounded AI risk-management, health IT safety, decision-support, governance, device-context, and professional-source material. It does not include local review queues, committee calendars, audit logs, utilization data, legal analysis, measured outcomes, or named implementation proof. -->`

Use a mid-report warning in both locales. The English warning should stay close to:

`<!-- EVIDENCE_GRADE_WARN: Review queues, owner follow-ups, trigger lists, evidence-gap fields, monitoring notes, validation flags, fallback questions, and decision statuses can make AI governance work easier to route, but they do not prove safety, compliance, effectiveness, fairness, continuity, patient trust, outcome improvement, or operational maturity. -->`

The Chinese report should translate the warnings into Chinese. Do not leave English warning prose inside `report.zh.md` except for the literal marker `EVIDENCE_GRADE_WARN`.

## Reader boundary

Frame the report for healthcare leaders, clinical informatics teams, operational owners, safety leaders, privacy/security partners, and governance groups that need to turn carry-forward items into first-cycle review work.

The reader should leave with these questions:

- Which AI-enabled workflows need review first after the year boundary?
- What put each item into the queue?
- Who owns the next action?
- Which evidence, monitoring, validation, source-attribute, fallback, or retirement question remains open?
- What decision would close the item, narrow it, pause it, retire it, or escalate it?

## Explicit exclusions

Do not make any claim about:

- legal sufficiency of a first-cycle review queue;
- completeness of any local AI inventory or queue;
- required timing for a regulated filing or accreditation process;
- named vendor, product, hospital, health system, or public program performance;
- actual local incident counts, near misses, patient outcomes, utilization, or audit results;
- hidden or shadow AI use in a named organization;
- a January review queue being a universal compliance obligation.

The report can recommend visible routing of open items. It cannot convert missing local queue fields into legal findings, safety findings, maturity scores, or noncompliance claims.
