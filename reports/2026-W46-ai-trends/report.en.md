# If the Model Stops, What Keeps Moving?

<!-- EVIDENCE_GRADE_WARN: This report is limited to staged health IT contingency, security-safeguard, resilience, and governance source material. It does not include local downtime drills, recovery tests, incident logs, patient outcomes, legal analysis, or named implementation proof. -->

Healthcare AI governance does not end once a workflow is approved for launch. The harder operational question is what happens when an AI-enabled step, EHR capability, interface, data feed, vendor platform, identity service, queue, or model endpoint becomes unavailable, degraded, delayed, or intentionally paused. If an organization cannot answer that continuity question, it does not yet know how much of the work truly depends on the tool.

The staged source material supports a straightforward governance claim: fallback planning has to specify which work stops, which work becomes slower or less complete, and which work must continue regardless. That is not the same as proving any local workflow is resilient, safe, compliant, or clinically beneficial during downtime. It is a way to make dependence visible before disruption reveals it in real time.

## Map dependence before calling it operational

An AI workflow should be treated as part of a larger chain, not as an isolated model. Continuity review should ask what upstream data the workflow requires, what downstream tasks it shapes, what records or messages it helps produce, and what users lose when it becomes unavailable. That review should cover planned downtime, unplanned disruption, degraded service, interface failure, data-feed delay, vendor-service degradation, and intentional pause.

This matters because criticality is not uniform. Scheduling support, summarization, triage flags, order-related support, and patient messaging do not create the same downtime consequences. A missed summary may slow work. A broken queue or delayed flag may change which work gets seen, when it gets seen, and how much manual checking staff must absorb. The practical risk sits in the workflow, not only in the model.

The dependency map also has to extend beyond the model itself. A model can remain unchanged while the real reliability of the workflow shifts because an API changes, an identity service fails, a queue backs up, a vendor release alters behavior, or an interface stops delivering the expected data. Continuity governance has to track those surrounding dependencies because users experience workflow failure even when the model artifact is technically untouched.

## Fallback has to name triggers, owners, and substitute work

Manual mode is useful only when it is concrete. A fallback plan should identify who decides that the AI-supported path is no longer trustworthy, who communicates the mode change, which substitute workflow takes over, and what minimum information is required to keep critical work moving. It should also distinguish between tasks that can be deferred, tasks that require manual completion, and tasks that require escalation because the fallback changes the risk profile.

That makes fallback a workflow-design problem, not a slogan. Staff need to know where information comes from when the usual AI-assisted step disappears, which messages or requests still enter the queue, which handoffs must be made explicitly, and where confusion gets escalated. Without that level of specificity, a continuity plan remains mostly an intention.

## Recovery is about reconciliation, not just restored access

Downtime and degraded operation create integrity problems even when service returns quickly. Records, messages, summaries, alerts, queue states, and task status can become missing, delayed, duplicated, stale, or inconsistent across systems. If a workflow depends on AI-generated routing, summarization, or record-population steps, restored access does not by itself confirm that downstream work is complete or trustworthy again.

Recovery therefore needs a reconciliation phase. The organization should decide what newly created or delayed work must be reviewed, what source data must be checked, which notes or orders need confirmation, and which handoffs or task states may have drifted during the disruption. In practice, the continuity question is not only "Can we turn the feature back on?" but also "What happened while it was impaired, and how do we show that the workflow has caught up enough to reduce uncertainty?"

<!-- EVIDENCE_GRADE_WARN: Fallback workflows, backups, reconciliation routines, drills, and restart criteria can make downtime response more reviewable, but they do not prove safety, compliance, cybersecurity readiness, continuity, outcome improvement, or operational maturity. -->

## Restart should be governed as a scoped decision

The staged material points toward drills, revision, communication, and restart criteria as ongoing governance work. Teams need to know when fallback starts, how affected users are informed, how the plan is practiced, and what changes force the plan to be revised. Those changes can come from staffing, interfaces, vendors, data flows, or the AI capability itself.

Restart also should not be treated as a purely technical event. A reachable service is not the same as a recovered workflow. The relevant decision may be to restore full use, restore a narrowed scope, keep manual mode in place for some tasks, or pause the workflow until delayed data and downstream actions are reconciled. That makes restart an operational decision with scope, ownership, and conditions, not just a status light turning green.

Healthcare AI does not have an operational scale story until it has a downtime story. The staged sources support asking harder questions about fallback, degraded operation, and recovery integrity. They do not show that any local organization has answered those questions well. That gap is exactly why continuity belongs inside governance rather than after it.
