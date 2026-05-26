# Approved for One Use Is Not Approved for the Next

<!-- EVIDENCE_GRADE_WARN: This draft is limited to staged intended-use, decision-support, risk-management, governance, and professional-source material. It does not include local usage logs, user-behavior evidence, outcome data, legal analysis, or named implementation proof. -->

Healthcare AI governance often begins with a sensible first step: identify the tool, review it, assign an owner, and launch it with clear boundaries.
The harder problem begins afterward, when a model or feature reviewed for one context quietly spreads into another before records, training, monitoring, and escalation paths catch up.

That is why inventory alone is not enough.
The same tool name can raise very different governance questions once the workflow, user group, setting, data source, population, or reliance pattern changes.
Approval for one use is not standing approval for adjacent work.

## Inventory Is Not Scope Control

An inventory entry can confirm that a tool exists, but it does not define what that tool is approved to do.
In healthcare AI, that gap matters.

An approved-use record should specify the intended users, workflow setting, data context, affected population, decision point, evidence status, and accountable owner.
It should also state what remains out of scope, including unreviewed settings, users, populations, data sources, interfaces, downstream actions, or decision roles.

Without that boundary, a tool can drift from administrative drafting into decision support without anyone explicitly recognizing that the governance question has changed.
It can move from one clinic to another, from one role to another, or from adult workflows into pediatric or specialty contexts while still carrying the same label.
The label may stay the same, but the operational risk does not.

## How Use Creep Actually Happens

Some spread is formal: a pilot becomes production use, and a limited workflow becomes routine infrastructure.
That shift can change staffing, workflow pressure, monitoring burden, and escalation expectations even when the model itself appears unchanged.

Some spread happens through embedded vendor features, where an AI capability appears inside a product teams already use and workflow impact expands faster than formal intake records.
Some spread comes through general-purpose assistants or local workarounds that begin as harmless drafting support and then start shaping documentation, coding, scheduling, triage, patient communication, or operational decisions.

The governance question, then, is not only what category the tool claims to occupy.
It is what work the tool is actually shaping now.
Healthcare organizations do not need to assume every expansion is wrong, but they do need a review line before expansion becomes normal practice.

## Expansion Needs Explicit Triggers

Scope control becomes operational when review is tied to recognizable changes.
Useful triggers include a new user group, a new setting, a new patient population, a new data source, a new interface, a vendor release, a new downstream action, or a new reliance pattern.
Any of those can turn an old approval into a new governance question.

Change notices matter because the people responsible for review, training, monitoring, fallback, and escalation are not always the same people who notice day-to-day workflow drift.
Expansion review should determine whether the approved use is still unchanged, should be narrowed, should pause, or should reopen for local validation.
Monitoring should compare actual use against the approved-use record, not merely inspect output quality in the abstract.

<!-- EVIDENCE_GRADE_WARN: Approved-use records, expansion review, monitoring, change notices, and training updates can make use creep more reviewable, but they do not prove safety, compliance, fairness, privacy protection, patient trust, outcome improvement, or operational maturity. -->

## The Human Layer Drifts Too

Training can become stale when the real users or decisions change.
Ownership can drift when the sponsor and escalation path remain attached to the original pilot even as the workflow spreads elsewhere, and accountability can blur when the launch record says one thing while daily practice says another.

That is why training updates should cover intended use, limits, what changed, fallback expectations, and escalation routes.
It is also why accountable ownership should follow actual use, not just the original project file.
Human oversight works only when it is attached to the workflow that now exists.

## What This Source-Bounded Draft Cannot Show

The staged material supports a governance posture, not a named implementation verdict.
It does not show local usage logs, local registry evidence, user interviews, training-comprehension evidence, safety outcomes, operational-performance evidence, or legal analysis, and it does not prove that any specific organization expanded use safely or unsafely.

The practical takeaway is narrower and more useful.
Healthcare AI governance should not stop at knowing that a tool is present.
It should maintain a live approved-use boundary and reopen review when the work, users, settings, or downstream decisions move beyond that line.

## Selected Source Basis

- NIST AI RMF and the Generative AI Profile for context mapping, lifecycle monitoring, and roles-and-accountability framing.
- FDA clinical decision support materials for intended-use discipline and user-context questions.
- ONC decision-support intervention materials for source-attribute visibility in covered contexts.
- WHO, AMA, and Joint Commission/CHAI materials for accountability, human oversight, locally adapted governance, and responsible-adoption posture.
