# Research Brief

## Scope

- Topic: AI in healthcare - weekly
- Locales: `en`, `zh`
- Working angle: healthcare AI outputs need handoff context when they move between people, teams, shifts, or settings.

## Core Thesis

The article should argue that an AI-enabled recommendation, flag, score, summary, or alert can be misread once it leaves the original workflow context. A handoff note helps the receiving user understand the output purpose, reviewed use boundary, intended receiver, evidence limits, unresolved gaps, fallback contact, and escalation route. The note improves interpretability and routing, but it does not prove safety, compliance, effectiveness, fairness, resilience, trust, continuity, or maturity.

## Recommended Title

Prefer `Healthcare AI Needs a Handoff Note`.

Acceptable alternates if the draft is stronger and stays source-bounded:

- `Healthcare AI Outputs Need Context When They Travel`
- `Healthcare AI Should Not Travel Without Context`

Do not include the calendar key in the H1.

## Audience And Frame

- Reader-facing governance article, not an operator memo.
- Keep the focus on output transfer, receiving-user context, and actionability.
- Treat the handoff note as a workflow-context and routing discipline.
- Avoid non-reader operational details.

## What The Draft Should Cover

1. Explain why the output value alone is not enough once it moves downstream.
2. Keep the receiving user in view: the next user may not know the original evidence limits, workflow setup, or reviewed boundary.
3. Describe practical handoff fields:
   - output purpose
   - intended receiver
   - reviewed use boundary
   - current owner or owner group
   - timestamp or recency marker
   - source attributes
   - evidence gaps
   - monitoring responsibility
   - fallback contact
   - escalation route
   - next action when available
4. Use workflow-transfer examples, such as shift change, team handoff, referral, dashboard-to-task-list transfer, summary into documentation, or alert into follow-up queue.
5. Explain that unknown, stale, or missing context should stay visible rather than being converted into assumed approval.
6. Explain fallback, escalation, and next-action categories as routing tools, not clinical or legal instructions.
7. Close with explicit evidence limits and a short `Selected Source Basis` section.

## Safe Claim Bank

- A handoff note can make AI-enabled outputs easier to interpret when the output travels beyond the original workflow context.
- A receiving user may need more than the output label or score to understand what the output is meant to support and what it does not support.
- Handoff context should connect to workflow use, not only to a model name, vendor name, dashboard field, or output value.
- Useful handoff fields can include use boundary, intended receiver, output purpose, source attributes, evidence gaps, fallback contact, escalation route, and next action when those fields exist.
- Unknown, stale, or missing handoff context should remain visible.
- Available governance sources can support questions about documentation, workflow fit, visibility, monitoring, contingency planning, escalation, and responsible adoption.

## Hard Bans

- No claims about named vendors, products, hospitals, health systems, regulators, or public programs having a sufficient or insufficient handoff process.
- No legal advice or legal conclusions.
- No claim that a handoff note proves safety, compliance, effectiveness, fairness, trust, outcome improvement, continuity, resilience, or maturity.
- No invented local logs, review records, owner rosters, audit trails, incidents, validation results, or measured outcomes.
- Do not imply FDA device context covers all healthcare AI workflows.
- Do not turn fallback contacts, escalation routes, owner fields, or documentation fields into proof of compliance or readiness.

## Required Language

- Prefer phrases such as `the source basis`, `available governance sources`, `handoff note`, `receiving user`, `use boundary`, `output purpose`, `fallback contact`, `escalation route`, and `evidence gap`.
- Keep evidence-limit language public-facing.
- Do not discuss how evidence was prepared.

## Locale And Format Requirements

- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- English warning text must be English-only.
- Chinese warning text must be Chinese-only.
- Each warning should say the article is limited to source-bounded governance, health IT, decision-support, workflow documentation, safety-management, responsible-adoption, and bounded device-context material.
- Each warning should also say the article does not include local handoff logs, committee charters, audit logs, legal analysis, measured outcomes, or named implementation proof.
- Include a short `Selected Source Basis` section in both locales.
- In `Selected Source Basis`, list only public source families by name:
  - NIST AI RMF
  - ONC SAFER
  - ONC decision-support intervention material
  - WHO
  - AMA
  - Joint Commission/CHAI
  - bounded FDA AI/ML device context
- Target roughly 75-95 markdown lines per locale.

## Suggested Outline Per Locale

1. H1 with the handoff-note frame.
2. Opening paragraph: why outputs become risky when they travel without context.
3. Section on the receiving user and why the next person may lack the original boundary.
4. Section on what a handoff note should carry.
5. Section on transfer situations and downstream routing.
6. Section on unknown, stale, and missing context.
7. Section on fallback, escalation, and next action.
8. `EVIDENCE_GRADE_WARN` block.
9. `Selected Source Basis` list.

## Source Gaps To Keep Visible

- The staged material provides operator-authored summaries and boundaries, not primary excerpts from NIST, ONC, WHO, AMA, FDA, or Joint Commission/CHAI.
- The staged material does not provide local handoff logs, audit trails, committee records, legal analysis, measured outcomes, or named implementation proof.
- The draft should therefore stay at the level of governance framing, workflow context, actionability, and evidence limits.
