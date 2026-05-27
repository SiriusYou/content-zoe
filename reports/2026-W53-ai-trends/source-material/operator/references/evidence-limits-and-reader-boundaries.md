# Evidence limits and reader boundaries

## Evidence posture

The source pack supports a governance-continuity report, not a factual survey of actual year-end AI reviews. The reader should understand that the report is built from staged governance, health IT safety, decision-support, device-context, and professional-source material. It does not contain local committee minutes, AI inventory exports, validation packets, procurement records, user interviews, audit findings, legal analysis, measured outcomes, or named implementation proof.

The report may say that a carry-forward file is useful because AI governance work crosses calendar boundaries. It may not say that a carry-forward file proves that governance is mature, compliant, safe, fair, effective, resilient, trusted, or outcome-improving.

## Required warning posture

Use a leading warning in both locales. The English warning should stay close to:

`<!-- EVIDENCE_GRADE_WARN: This report is limited to staged AI risk-management, health IT safety, decision-support, governance, device-context, and professional-source material. It does not include local year-end review packets, committee minutes, audit logs, utilization data, legal analysis, measured outcomes, or named implementation proof. -->`

Use a mid-report warning in both locales. The English warning should stay close to:

`<!-- EVIDENCE_GRADE_WARN: Carry-forward files, open-item lists, owner follow-ups, monitoring notes, change records, near-miss links, and retirement states can make unfinished AI governance work more reviewable, but they do not prove safety, compliance, effectiveness, fairness, continuity, patient trust, outcome improvement, or operational maturity. -->`

The Chinese report should translate the warnings into Chinese. Do not leave English warning prose inside `report.zh.md` except for the literal marker `EVIDENCE_GRADE_WARN`.

## Reader boundary

Frame the report for healthcare leaders, clinical informatics teams, operational owners, safety leaders, privacy/security partners, and governance groups that need a handoff artifact at the year boundary. The piece should be practical but not prescriptive as law.

The reader should leave with these questions:

- Which AI-enabled workflows have unresolved reviews or open conditions?
- Which owners need to confirm status before continued use?
- Which evidence, monitoring, validation, source-attribute, fallback, or retirement records are incomplete?
- Which changes, incidents, near misses, user concerns, or workflow shifts should be carried into the next review cycle?
- Which items should remain active, narrow, pause, retire, replace, or reopen review?

## Explicit exclusions

Do not make any claim about:

- completeness of any local AI inventory;
- legal sufficiency of an annual review;
- required timing for a regulated filing or accreditation process;
- named vendor, product, hospital, health system, or public program performance;
- actual local incident counts, near misses, patient outcomes, utilization, or audit results;
- hidden or shadow AI use in a named organization;
- year-end review being a universal compliance obligation.

The report can recommend keeping unresolved items visible. It cannot convert unresolved items into a finding of noncompliance, negligence, unsafe practice, or maturity failure.
