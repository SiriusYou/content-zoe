# Research Brief

## Working thesis

The report should argue that healthcare AI review work needs an accountable owner-of-record before it needs another score. The core value of the owner record is routing the next action: who can gather evidence, confirm use boundaries, review monitoring, coordinate fallback, and escalate unresolved issues.

## Recommended title

`Healthcare AI Needs an Owner Before It Needs a Score`

Keep the H1 free of any week key.

## Draft objective

Produce an evidence-cautious, reader-facing report for healthcare leaders, clinical informatics teams, operational owners, safety leaders, privacy/security partners, and governance groups. The report should help readers decide who owns the next action for an AI-enabled workflow and what that owner is empowered to do.

## Must-land points

- Ownership should attach to a workflow and its local use boundary, not only to a vendor or model name.
- A useful owner-of-record can be a person or group that can move the review item forward.
- A weak owner field is not enough; the report should emphasize decision rights and next-action routing.
- Useful owner fields may include owner group, setting, intended users, reviewed use boundary, decision rights, review responsibility, monitoring responsibility, fallback contact, escalation route, and last confirmation date when available.
- Unknown, disputed, split, or outdated ownership should remain visible as a review problem rather than being treated as resolved.
- Monitoring, fallback, and escalation responsibilities improve reviewability, but they do not prove safety, compliance, resilience, fairness, effectiveness, or maturity.

## Suggested report structure

1. Lead with the locale-specific `EVIDENCE_GRADE_WARN` comment.
2. Open with the owner-before-score thesis and explain why unresolved review items stall without accountable ownership.
3. Define what an owner-of-record is and what it is not.
4. Explain why decision rights matter, using concrete next-action categories such as confirm owner, gather evidence, clarify use boundary, review monitoring, coordinate fallback, narrow or pause use, retire or archive, reopen review, and escalate for decision.
5. Describe the fields that make an owner record operationally useful.
6. Cover split ownership and the need to show both the next-action owner and consulted groups.
7. Explain how unknown, disputed, and stale ownership should be handled.
8. Insert the mid-report locale-specific `EVIDENCE_GRADE_WARN` comment before shifting from model design to governance limits.
9. Include a short `Selected Source Basis` section.
10. Close on routing unresolved questions, not on scoring maturity or proving compliance.

## Allowed framing

- Use phrases such as `the source basis` or `available governance sources` when describing evidence limits.
- Say that owner-of-record fields can make governance work more actionable or easier to route.
- Say that vendor evidence may inform review but does not answer every local workflow question.
- Treat FDA AI/ML-enabled device material as bounded device-context input, not a full map of healthcare AI.

## Avoid

- No legal advice, compliance conclusions, or claims about accreditation or regulatory sufficiency.
- No named hospital, health-system, vendor, product, regulator, or public-program performance claims.
- No invented local owners, committees, monitoring results, incidents, audit findings, validation outcomes, or utilization data.
- No claim that owner assignment proves safety, compliance, fairness, trust, continuity, outcome improvement, or operational maturity.
- No internal pipeline details, retry mechanics, run metadata, or source-preparation mechanics in the reader-facing draft.

## Source gaps to keep explicit

- The staged material gives a strong governance angle and a declared source basis, but it does not include local owner maps, committee charters, job descriptions, audit logs, measured outcomes, or named implementation proof.
- The staged material names external primary frameworks and guidance, but their full texts are not locally staged here; use them only as part of the declared source basis already summarized in the staged notes.
- Because the local evidence is governance-oriented rather than implementation-specific, the report should stay at the level of accountable ownership, review routing, and bounded governance questions.

## Tone and format checks

- Prefer a firm governance-operations tone over a policy memo or marketing tone.
- Keep the angle centered on owner-of-record and decision rights, not on generic inventory or monitoring.
- Include `Selected Source Basis` in both locales.
- Preserve locale purity for warnings: English warning prose only in `report.en.md`, Chinese warning prose only in `report.zh.md`.
- The downstream draft target remains roughly 75-95 markdown lines per locale unless editorial compression is explicitly accepted.
