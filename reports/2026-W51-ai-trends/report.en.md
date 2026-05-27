<!-- EVIDENCE_GRADE_WARN: This draft is limited to staged change-control, health IT safety, decision-support, device-software, risk-management, governance, and professional-source material. It does not include local update logs, release notes, validation results, user notices, legal analysis, measured outcomes, or named implementation proof. -->

# Healthcare AI Updates Should Leave a Change Record

Healthcare AI governance does not end when a workflow is approved.
It becomes harder when the workflow changes after approval, renewal, equity review, or near-miss review.
At that point, a version number or vendor release note is too thin to carry local accountability.

The staged source set supports a narrow argument.
AI-enabled healthcare workflows should leave a reviewable change record when they are updated.
That is a governance standard for update review, not proof that any named tool, vendor, hospital, or health system handled an update well or badly.

The problem is straightforward.
A technical team may receive a model version, a release date, and a short list of fixes.
Clinicians, operators, and governance leads still need to know what changed in the workflow they actually use.
Small technical updates can have large operational effects if they alter timing, handoffs, interpretation, escalation, or fallback behavior.
A material workflow change can exist even when the model name stays the same.

## Why release notes are not enough

Release notes usually describe an update from the supplier's point of view.
Healthcare workflow governance needs that update translated into local questions.
Which step changes for the person who sees the output?
Which step changes for the person who acts on it?
Which patient pathway, handoff, documentation step, or escalation route is affected?
If the organization cannot answer those questions, that uncertainty should stay visible in the record rather than disappear behind a new version label.

A reviewable change record should connect the technical update to the care workflow.
It should say what changed, when it changed, why it changed, who authorized release, and which local workflow uses it.
It should also state whether the update affects approved-use boundaries, expected users, fallback routes, escalation paths, or the evidence base that supported earlier review.

## What the change record should capture

The record should separate different kinds of change instead of collapsing them into a single line item.
That includes changes to source data, model behavior, prompts, thresholds, source attributes, user interface, integrations, permissions, escalation logic, monitoring, and fallback procedures.
The goal is not to force every update into the same burden.
The goal is to leave enough detail for the organization to review the update in the context where it will be used.

That matters because the workflow impact may sit outside the model itself.
A new data feed may change who appears eligible for review.
A threshold change may alter false-positive or false-negative burden.
A prompt change may shift how users interpret an output.
An interface redesign may change timing or hide context that used to be visible.
An integration change may move the handoff point to a different team.

## What should trigger deeper review

The record should help determine when an update deserves more than passive filing.
Review triggers can include new data feeds, changed thresholds, changed prompts, changed source attributes, interface redesigns, integration changes, user-role changes, new settings, changed escalation paths, vendor dependency changes, or changed downtime and fallback behavior.

Those triggers matter because update review is not only about whether code changed.
It is about whether the workflow changed in a way that affects care, documentation, responsibility, or recovery when something goes wrong.
The practical questions are concrete: who sees the change, who acts on it, which patient pathway it touches, which decision, handoff, or documentation step it may influence, and whether a prior review thread should reopen because the update changes an earlier answer about equity, near misses, renewal, monitoring, or exit readiness.

## Why validation may need to be refreshed

Launch validation can become stale after an update.
Vendor evidence about an update does not replace local evidence that the updated workflow still fits the setting where it is used.
That does not mean every update requires a full relaunch review.
It does mean the change record should identify which parts of local validation may need to be refreshed.

Depending on the change, refreshed review may need to revisit the affected workflow, user group, patient group, setting, timing, overrides, false positives, false negatives, handoffs, or subgroup questions.
If the update changes source data, output behavior, access burden, or fallback readiness, prior review conclusions may no longer carry forward cleanly.
If refreshed validation cannot happen before release, the record should say so clearly and specify whether interim monitoring, narrowed use, or a return to governance review is planned.

## Why notice and training belong in the record

Update governance fails if the only people who know about a change are technical owners.
Users should know when an update changes what the tool shows, how the output should be interpreted, when it should be overridden, when fallback should be used, and who owns unresolved questions.
That notice should be workflow-specific.
A generic announcement that an AI tool was updated does not tell the affected user what to do differently.

Training expectations may also change after an update.
If output meaning, user roles, documentation expectations, escalation paths, or patient-facing communication are affected, the update record should say what training changed and who was notified.
Some updates may also require clearer routes for patients or caregivers to ask questions or correct information if the updated workflow changes their experience.

<!-- EVIDENCE_GRADE_WARN: Change records, release notes, validation triggers, monitoring, rollback plans, user notices, and change boards can make updates more reviewable, but they do not prove safety, compliance, effectiveness, patient trust, outcome improvement, or operational maturity. -->

## Monitoring, ownership, and rollback readiness

An update is not well governed merely because it shipped with paperwork.
Post-release accountability requires named ownership and defined response paths.
The release record should identify who monitors the update after release and who can narrow, pause, or roll it back if new risk appears.

The signals worth watching depend on the workflow, but the record can still define the categories.
Changed output behavior, override patterns, delays, escalation failures, support tickets, complaints, near misses, subgroup concerns, and workflow burden are all examples of signals that may matter when they fit the use case.
The record should also define what evidence would trigger action.
That can include narrowing the update, disabling a feature, routing to fallback, reopening validation, pausing the AI-enabled step, or returning to a prior workflow where that option exists.

This is also where use creep should be checked.
An update may stay technically within the same product boundary while drifting into a broader operational role.
The organization should be able to ask whether the updated workflow remained in scope, whether new users or settings were pulled in, and whether earlier approval assumptions still hold.

The source set does not prove that any organization already does this well.
It supports a narrower conclusion.
If healthcare AI updates affect real workflows, those updates should leave a change record that makes review, validation refresh, notice, monitoring, and rollback decisions visible.
Without that record, the organization may know that a version changed while still not knowing what changed for the people who rely on the workflow.

## Selected Source Basis

- FDA materials on predetermined change control plans for certain AI-enabled device software functions
- ONC SAFER guidance on system management and contingency planning
- ONC decision support intervention materials on visibility into logic and source attributes
- NIST AI RMF lifecycle governance and monitoring framework
- WHO, AMA, and Joint Commission/CHAI materials on oversight, accountability, workflow fit, and responsible use
