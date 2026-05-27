# Research Brief

## Scope

- Topic: AI in healthcare - weekly
- Job id: `2027-W03-ai-trends`
- Locales: `en`, `zh`
- Use only the staged local source basis in `source-material/`.

## Recommended thesis

Healthcare AI use should carry a review date, not only a launch date. The core argument is lifecycle governance: a workflow can look settled after approval or rollout while its use boundary, users, evidence, monitoring signals, fallback plan, source attributes, and ownership continue to change.

## Drafting target

- Prefer the H1 `Healthcare AI Should Carry a Review Date` unless a clearly stronger source-bounded variant emerges.
- Keep the article centered on the review-date / continued-use question. Do not drift into generic monitoring, inventory, owner-assignment, or change-control framing.
- Treat the review date as a routing device, not as proof of safety, compliance, effectiveness, fairness, resilience, maturity, or outcome improvement.

## Core points to cover

1. A review date creates a visible moment to ask whether the previous decision still fits the current use.
2. The workflow can drift even if its name stays the same: setting, users, inputs, outputs, downstream decisions, vendor material, monitoring expectations, fallback readiness, and ownership can all change.
3. A useful review-date record can include owner, reviewed use boundary, last/next review date, trigger categories, monitoring responsibility, fallback contact, escalation route, continued-use decision, and unresolved evidence gaps when available.
4. Trigger categories can reopen review without proving harm or noncompliance.
5. Expired, unknown, or disputed review status should remain visible rather than being silently treated as continued approval.
6. Continued-use review should route a decision such as continue, continue with conditions, gather evidence, narrow use, revise fallback, escalate, pause, retire, or reopen governance review.

## Required structure cues

- Include an explicit `EVIDENCE_GRADE_WARN` comment in both locales.
- Keep warning language locale-pure: English only in `report.en.md`, Chinese only in `report.zh.md`.
- Include a short `Selected Source Basis` section in both locales.
- In `Selected Source Basis`, name only public source families:
  - NIST AI RMF
  - ONC SAFER
  - ONC decision-support intervention material
  - WHO
  - AMA
  - Joint Commission/CHAI
  - bounded FDA AI/ML device context
- Avoid local filenames, markdown paths, and non-reader operational details in reader-facing copy.
- Target roughly 75-95 markdown lines per locale. Under 68 lines should be treated as underdeveloped unless explicitly accepted.

## Evidence posture

- Say the article is limited to the source basis or available governance sources.
- State that the source basis supports governance, lifecycle review, monitoring, contingency planning, decision-support visibility, responsible adoption, and bounded device-context discussion.
- State that the article does not provide local review calendars, committee charters, audit logs, legal analysis, measured outcomes, or named implementation proof.
- Do not describe the evidence as locally written notes or author-prepared summaries.

## Safe phrasing

- "A review date can make continued-use questions visible."
- "The source basis supports a governance-oriented argument for time-bounded review."
- "Useful review-date fields can include..."
- "Unknown or expired review status should remain visible."
- "Available governance sources can support lifecycle and review-trigger questions."

## Do not claim

- Any named vendor, product, hospital, health system, regulator, or program has or lacks a sufficient review-date model.
- A review date or review record satisfies legal, regulatory, accreditation, certification, procurement, privacy, or liability obligations.
- A review date proves safety, compliance, effectiveness, fairness, patient trust, continuity, resilience, maturity, or outcome improvement.
- FDA device context covers the whole healthcare AI landscape.
- Invented local facts such as owners, calendars, committees, incidents, audit findings, utilization trends, or validation results.

## Source gaps to respect

- The staged material provides boundary notes and claim constraints, not locally staged full text from the public source families.
- Do not use direct quotations, fine-grained source attribution, or organization-specific factual claims that would require the underlying public documents.
- Do not answer whether any specific local deployment should continue, narrow, pause, retire, or be used in care.

## Implementation note

The strongest draft will read like a healthcare AI governance essay with a narrow thesis: approval at launch is not enough; continued use needs a visible review date and a routing decision when conditions change.
