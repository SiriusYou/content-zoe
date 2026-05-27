# Research Brief

## Assignment

Produce a source-bounded governance report for `AI in healthcare - weekly` arguing that healthcare AI updates should leave a reviewable change record. This is not a market roundup, product review, vendor ranking, or local implementation audit.

## Recommended H1

Prefer `Healthcare AI Updates Should Leave a Change Record`.

Alternate source-bounded options:

- `Every Healthcare AI Update Needs a Receipt`
- `Healthcare AI Change Control Has to Reach the Workflow`

Do not include the week key in the H1.

## Core Thesis

The report should argue that once an AI-enabled healthcare workflow changes after approval, renewal, equity review, or near-miss review, a version number or vendor release note is not enough. The organization needs a record of what changed, why it changed, which users and workflow steps it touches, which validation should be refreshed, what notice or training may be needed, what monitoring should follow release, and what narrowing or rollback path exists if the update creates new risk.

## Draft Shape

1. Open with an `EVIDENCE_GRADE_WARN` comment that states the staged-source limit.
2. Frame the piece as update governance for AI-enabled healthcare workflows, not as proof about any named deployment.
3. Explain why version numbers and release notes are insufficient without a workflow-linked change record.
4. Define what the change record should capture:
   - what changed, when, why, who authorized it, and which local workflow uses it;
   - whether the update affects source data, model behavior, prompts, thresholds, source attributes, interface, integration, permissions, escalation, monitoring, or fallback.
5. Explain review triggers and impact questions:
   - who sees the change;
   - who acts on it;
   - which patient path, decision, handoff, or documentation step it touches;
   - whether prior review threads should reopen.
6. Explain validation refresh after change:
   - vendor evidence does not replace local evidence;
   - some changes should refresh workflow, user-group, patient-group, setting, timing, override, false-positive, false-negative, handoff, or subgroup review.
7. Explain notice and training expectations:
   - users should know what changed in output meaning, override expectations, fallback use, and question ownership;
   - some changes may also require clearer patient or caregiver routes for questions or corrections.
8. End on monitoring, accountable ownership, and rollback readiness:
   - who monitors;
   - what signals matter;
   - who can narrow, pause, or roll back;
   - how use creep will be checked after release.
9. Include a short `Selected Source Basis` section in each locale.
10. Place a second `EVIDENCE_GRADE_WARN` comment near the monitoring / rollback / change-board discussion stating that these practices improve reviewability but do not prove safety or maturity.

## Safe Claims To Use

- A material change can exist even when the model name does not change.
- Small technical updates can create large workflow effects if they alter timing, handoffs, interpretation, escalation, or fallback behavior.
- The change record should keep uncertainty visible when the organization cannot tell what changed.
- FDA PCCP material is bounded source context for AI-enabled device software functions, not a universal rulebook for all healthcare AI.
- ONC SAFER, ONC DSI, NIST AI RMF, WHO, AMA, and Joint Commission/CHAI support useful governance questions about lifecycle review, visibility, validation, workflow fit, accountability, monitoring, and contingency planning.

## Claims To Block

- No named vendor, product, hospital, health system, or public program claims.
- No legal advice or legal conclusions.
- No claim that release notes, version records, validation, monitoring, rollback plans, user notices, or change boards prove safety, compliance, effectiveness, patient trust, outcome improvement, or operational maturity.
- No implication that every healthcare AI update is a device-software change or needs the same approval burden.
- No invented local release notes, tickets, validation results, complaints, incident counts, rollback tests, or measured outcomes.

## Evidence Posture

State clearly that the staged material supports a governance frame and review questions only. It does not include local update logs, release notes, validation results, training records, rollback tests, monitoring data, legal analysis, measured outcomes, or named implementation proof.

## Implementation Notes

- Keep the angle on change control and update governance, not generic AI transparency or generic monitoring.
- Prefer concrete workflow questions over abstract ethics language.
- Preserve locale purity for evidence warnings in later `report.en.md` and `report.zh.md`.
- Keep `Selected Source Basis` short and source-bounded.

## Source Gaps To Acknowledge

- No local architecture maps or workflow observations.
- No local change tickets, release records, or version history.
- No local validation metrics or subgroup analyses.
- No local user notices, training attendance, or patient-facing communications.
- No local rollback drills, support-ticket history, near-miss counts, or operational outcomes.
