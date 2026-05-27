# Healthcare AI Needs a Near-Miss File

<!-- EVIDENCE_GRADE_WARN: This draft is limited to staged patient-safety, incident-reporting, decision-support, contingency-planning, risk-management, governance, and professional-source material. It does not include local incident reports, near-miss logs, patient harm investigations, legal analysis, measured outcomes, or named implementation proof. -->

Healthcare workflows that use AI should not wait for confirmed patient harm before they start learning from failure.
The safer posture is to define a reviewable near-miss file before the first serious dispute over what happened.
This is a patient-safety governance argument, not a market roundup, vendor ranking, legal memo, or claim that any named product or organization caused harm or improved safety.
The source basis supports questions about reporting, review, contingency planning, accountability, and response, but it does not prove that any local implementation is safe, unsafe, compliant, or beneficial.

## Why a near-miss file belongs upstream of harm
In healthcare, a case intercepted before patient impact can still reveal an unsafe condition.
A wrong-context recommendation, a delayed escalation, a downtime workaround, or a broken fallback path may show that the workflow is fragile even when no one can point to confirmed injury.
If an organization records only confirmed harm, it loses the cases that show where the workflow almost failed and whether staff had to override the system, route around it, or compensate for it in real time.
A useful near-miss file therefore treats near misses as learning signals, not as proof that harm occurred, while still marking them as evidence that the workflow deserves review before the same pattern appears again under worse conditions.

## What should count as reportable
The scope should be explicit before staff are asked to use it.
At minimum, the file can define reportable incidents and reportable conditions such as:

- unexpected outputs in a patient-care workflow
- wrong-context use or recommendations shown in the wrong place
- escalation failures, including missed or delayed routing
- downtime and recovery problems that break fallback plans
- override spikes that suggest the workflow is not behaving as expected
- queue delays or handoff failures that change the timing of care
- cases caught before reaching the patient
- unsafe conditions that did not become confirmed harm

The point is not to declare that every unusual model output is a patient-safety event.
The point is to keep staff from guessing which categories matter once an event is already in motion.

## Why vague reporting advice is not enough
"Report strange AI behavior" is too vague for a clinical workflow.
Staff need to know what to capture, where to send it, and how urgent the response should be.
An explicit threshold does not have to claim universal rules for every setting, but it does need to separate immediate safety concerns from lower-urgency evidence gaps without losing either category.
It should also give people a route to report concerns without forcing them to decide alone whether the issue is legally reportable or operationally trivial.
Signal sources can come from more than one direction: a clinician report, staff report, monitoring alert, patient feedback, complaint path, audit finding, or technical log can all be the first sign that a workflow needs review.

## What the record should capture
A near-miss file is more useful when it captures context, not just conclusions.
That means recording what the system showed, when it showed it, what data or source attributes were available, and whether the output appeared as an alert, recommendation, score, note, or handoff.
It also means recording what the human side of the workflow understood: who saw the issue, what the care path required at that moment, whether an override happened, whether fallback was available and used, and whether the case reached the patient.
The file should preserve timing as well: when the issue was observed, when it was escalated, and when follow-up occurred.
Without those details, a record can show that something odd happened without showing whether the response path itself failed.

## Why logs alone are not enough
Technical traces matter, but they are incomplete on their own.
Logs can help show what the system displayed and what inputs or source attributes were available, but they usually cannot explain by themselves what the clinician or staff member understood, whether the workflow fit the care moment, or how the event was intercepted before patient impact.
User narratives are incomplete on their own as well, because people may describe confusion, delay, or override behavior without being able to prove model behavior, integration behavior, or data-feed behavior.
That is why the record should join technical traces with human workflow context instead of choosing one and discarding the other.

<!-- EVIDENCE_GRADE_WARN: Event reports, near-miss files, technical traces, dashboards, corrective actions, communication records, and committee review can make safety learning more reviewable, but they do not prove safety, compliance, harm reduction, patient trust, safety culture, outcome improvement, or operational maturity. -->

Reviewability is still worth building because it helps an organization ask better questions.
It does not remove the need for local validation, privacy review, minimum-necessary handling, operational judgment, or continued oversight.

## Triage, fallback, and escalation decisions
The file should not stop at description.
It should support a triage decision about what happens next.
That decision can ask:

- what is the urgency of the issue
- was there patient-facing impact
- should the workflow continue, narrow, pause, or return to validation
- should staff route to fallback or contingency operations
- should the issue be escalated to clinical, patient-safety, quality, IT, operations, compliance, data-governance, or vendor-management owners
- does the pattern justify vendor questions, additional monitoring, or a change in training

Downtime and fallback events deserve special attention.
A technically capable model can still sit inside an unsafe interruption, recovery, or handoff path.
If fallback fails, the problem is not only the model output but also the surrounding workflow design.

## Ownership, communication, and follow-up
A near-miss file becomes operational only when someone owns the next step.
A report that ends with "received" is not enough; the record should identify the accountable role for follow-up and track whether the risk was closed, reduced, accepted, or remains unresolved.
Corrective action should fit the failure mode.
Possible responses can include narrowing use, reopening validation, changing escalation paths, improving training, fixing integration points, improving notices, monitoring a repeated pattern, pausing the workflow, or retiring it.
Repeated low-severity events can still matter if they reveal the same weakness again and again.
Communication matters too, but the sources here do not support legal conclusions about disclosure duties.
They do support a practical point: staff need a reporting route, and affected patients or caregivers may need a way to ask questions, correct information, or understand a changed care path when an AI-enabled workflow shaped their experience.
Recourse is part of governance because people need to know who can review, override, correct, pause, or route around the workflow.
Healthcare AI governance should not begin at confirmed harm.
It should begin where the workflow first shows that something unsafe, confusing, delayed, misrouted, or fragile nearly happened.
That is what a near-miss file is for.

## Selected Source Basis
- AHRQ patient-safety reporting and response materials
- AHRQ CANDOR communication-and-resolution framing
- ONC SAFER contingency-planning framing
- ONC decision-support visibility framing
- NIST AI RMF governance, monitoring, and response framing
- WHO health-AI ethics framing
- AMA augmented-intelligence workflow and accountability framing
- Joint Commission / CHAI responsible-use governance framing
