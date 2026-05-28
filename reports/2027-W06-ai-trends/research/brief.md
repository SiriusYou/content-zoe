# Research Brief

## Scope

- Topic: AI in healthcare - weekly
- Locales: `en`, `zh`
- Research mode: local-only synthesis from staged `source-material/`

## Core Thesis

Healthcare AI governance should treat workarounds as signals, not just user behavior to ignore. If clinicians, staff, reviewers, or operational teams bypass, duplicate, delay, reinterpret, or avoid an AI-enabled output, the workflow may be exposing a workflow-fit problem, trust problem, context gap, evidence gap, escalation gap, fallback issue, or user-burden problem.

## Preferred Title Direction

- Preferred H1: `Healthcare AI Workarounds Are Governance Signals`
- Acceptable alternates:
  - `When Healthcare AI Gets Worked Around`
  - `Healthcare AI Needs to Notice the Workaround`

Do not include any calendar key in the H1. Keep the frame on workaround signals, non-use, bypass, duplicate work, shadow workflows, and workflow fit.

## What The Article Should Explain

1. Why non-use and bypass behavior can matter as governance signals.
2. Why invisible or normalized workarounds should remain review questions.
3. What a useful workaround log can capture when those fields exist.
4. Why owner group, monitoring contact, fallback route, escalation route, and review trigger matter for routing follow-up.
5. Why visible workarounds help surface governance questions without proving the AI is right or wrong.

## Recommended Narrative Structure

1. Open with the thesis that workaround behavior is a workflow signal, not background noise.
2. Define the workaround categories in plain language: bypass, duplicate work, delayed use, informal reinterpretation, non-AI path, peer confirmation, repeated non-use.
3. Explain why invisibility matters: workarounds can happen outside the system of record, in side conversations, or in other tools.
4. Show how context changes interpretation: intended user, output purpose, timing, downstream action, setting, and available review context.
5. Describe what makes a workaround log operationally useful:
   - workflow or AI-enabled function
   - output type
   - intended user
   - observed workaround type
   - setting and timing
   - reason category when known
   - affected next action
   - monitoring contact
   - owner group
   - fallback route
   - escalation route
   - review trigger
6. Close with the boundary: a workaround log can route review, but it does not prove safety, compliance, effectiveness, fairness, trust, maturity, or outcomes.

## Safe, Source-Bounded Claims

- Workarounds, bypasses, duplicate work, delayed use, non-use, and informal reinterpretation can be useful governance signals when they become visible.
- A workaround log can help route questions about workflow fit, user context, evidence gaps, fallback, ownership, and escalation when those fields exist.
- Unknown, invisible, or normalized workaround behavior should stay visible as a review question.
- Workaround visibility can support monitoring and governance review without proving that a workflow is safe, unsafe, compliant, noncompliant, effective, ineffective, fair, unfair, mature, or outcome-changing.

## Claims To Avoid

- Do not claim any named hospital, health system, vendor, regulator, or public program has a specific workaround-monitoring practice.
- Do not invent local workaround logs, counts, rates, owner rosters, committee charters, audit trails, incidents, or measured outcomes.
- Do not treat workaround documentation, owner assignment, or escalation routing as proof of safety, compliance, effectiveness, fairness, trust, resilience, continuity, or maturity.
- Do not give legal advice, clinical instructions, procurement guidance, or generalize FDA device context to all healthcare AI.

## Evidence And Warning Posture

- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep warnings locale-pure: English-only in `report.en.md`, Chinese-only in `report.zh.md`.
- State that the source basis is limited to governance, health IT, decision-support, workflow documentation, safety-management, responsible-adoption, and bounded device-context material.
- State that the source basis does not include local workaround logs, bypass counts, committee charters, audit logs, legal analysis, measured outcomes, or named implementation proof.
- Use public-facing phrasing such as `the source basis` and `available governance sources`.

## Required Article Elements

- Include a short `Selected Source Basis` section in both locales.
- In that section, list only public source families by name:
  - NIST AI RMF
  - ONC SAFER
  - ONC decision-support intervention material
  - WHO
  - AMA
  - Joint Commission/CHAI
  - bounded FDA AI/ML device context
- Target roughly 75-95 markdown lines per locale unless editorial review approves compression.

## Source Gap To Acknowledge

The staged workspace contains operator-authored summaries and boundaries, not the underlying public documents themselves. The article can therefore name the allowed public source families and make source-bounded governance claims, but it should not imply direct verification of any detailed primary-source language beyond what the staged material supports.
