# Research Brief

## Working Thesis

Preferred title: **Healthcare AI Needs a Near-Miss File**.

The report should argue that once an AI-enabled healthcare workflow is live, governance should not wait for confirmed patient harm before learning from failures. Near misses, unsafe conditions, wrong-context use, escalation failures, downtime workarounds, override spikes, queue delays, and cases caught before patient impact should be captured in a reviewable record with triage, ownership, corrective action, and follow-up.

## Reader Promise

This is a patient-safety governance argument, not a market roundup, vendor analysis, legal memo, or proof that any named product or organization caused harm or improved safety. Keep the report source-bounded and evidence-cautious throughout.

## Drafting Priorities

1. Define what belongs in scope before the first report arrives.
2. Show why vague "report strange AI behavior" guidance is not enough for clinical workflows.
3. Explain that a useful record joins technical traces with human workflow context.
4. End with triage, ownership, corrective action, communication, and follow-up rather than abstract monitoring language.

## Core Building Blocks

- **Scope:** reportable incidents, near misses, unsafe conditions, unexpected outputs, wrong-context use, escalation failures, downtime/fallback failures, workflow delays.
- **Signal source:** clinician report, staff report, monitoring alert, patient feedback, complaint path, audit, or technical log.
- **Context capture:** what the system showed, what data or attributes were available, what the user understood, whether override or fallback occurred, and whether the case reached the patient.
- **Triage:** urgency, patient-facing impact, whether to continue/narrow/pause the workflow, whether to route to fallback, reopen validation, notify a vendor, or escalate internally.
- **Ownership and action:** accountable clinical, operational, quality, patient-safety, IT, data-governance, compliance, or vendor-management owner; track whether risk was closed, reduced, accepted, or unresolved.
- **Communication and recourse:** staff need a reporting route; affected patients or caregivers may need a way to ask questions, correct information, or understand a changed care path; avoid legal-duty claims.

## Recommended Report Shape

1. Open with the thesis and the first `EVIDENCE_GRADE_WARN`.
2. Explain why near misses and unsafe conditions matter before confirmed harm.
3. Describe what a near-miss file should capture.
4. Show why technical logs alone are insufficient without workflow context.
5. Cover explicit triage and fallback decisions.
6. Close with ownership, corrective action, communication, and follow-up.
7. Include a short `Selected Source Basis` section in each locale.

## Non-Negotiable Constraints

- Do not include the week key in the H1.
- Keep each locale file language-pure for `EVIDENCE_GRADE_WARN` comments.
- Preserve a mid-report warning that reviewability does not prove safety, compliance, harm reduction, trust, culture, outcome improvement, or maturity.
- Target roughly 75-95 markdown lines per locale.
- Prefer a near-miss / incident-file / unsafe-condition frame over generic transparency or learning-loop framing.

## Source Gaps to State Clearly

- No local incident reports, near-miss logs, patient harm investigations, root-cause analyses, legal analysis, measured outcomes, named implementation proof, local logs, screenshots, or patient communications are available in this run.
- Do not invent severity classes, local escalation policies, vendor notices, remediation results, patient stories, or event counts.
- Do not claim that incident reporting, dashboards, committee review, corrective action, communication records, or technical traces prove safety or compliance.

## Selected Source Basis

- AHRQ patient-safety reporting and response materials
- AHRQ CANDOR communication-and-resolution framing
- ONC SAFER contingency-planning framing
- ONC decision-support visibility framing
- NIST AI RMF governance, monitoring, and response framing
- WHO health-AI ethics framing
- AMA augmented-intelligence workflow and accountability framing
- Joint Commission / CHAI responsible-use governance framing
