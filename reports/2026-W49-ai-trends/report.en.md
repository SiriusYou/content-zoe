<!-- EVIDENCE_GRADE_WARN: This draft is limited to staged nondiscrimination, decision-support, risk-management, governance, and professional-source material. It does not include local subgroup performance data, utilization logs, patient outcomes, complaint records, legal analysis, or named implementation proof. -->

# Healthcare AI Equity Has to Be Checked Where It Is Used

Healthcare AI equity cannot be assessed at the model layer alone. A fairness statement, model card, or prelaunch review packet can describe design intent, but none of those artifacts can show how a local care workflow distributes help, burden, delay, escalation, or exclusion once the tool is embedded in real operations.

That is why the review has to begin where the tool is actually used. The practical question is not whether a generic system sounds responsible in the abstract. The practical question is what happens in a specific setting, at a specific decision point, for the patients and staff who must live with the workflow.

## Start With the Local Workflow

An equity review should start by naming the workflow under review: the care setting, the decision point, the intended user, the patient path, and the fallback route when the tool does not fit the situation. Without that frame, fairness language drifts too far from the operating reality that patients and staff actually experience.

The same AI output can matter very differently across settings. A triage aid, documentation support step, or referral prompt may sit inside very different handoffs, queue rules, scheduling constraints, and escalation paths. Those differences shape who gets served quickly, who receives extra review, who is asked for more information, and who is more likely to end up on the fallback path.

A local subgroup list should also come from local risk, not from a copied vendor template. The review may need to examine differences tied to language, disability accommodation, digital access, caregiver reliance, geography, age, or fragmented care history, but the point is to connect those questions to the actual workflow rather than treat labels as a substitute for context.

## Burden Can Shift Even When the Score Does Not

Equity risk often emerges around the model rather than inside the score itself. A workflow can look technically stable while still creating different burdens through portal dependence, unclear notices, inaccessible forms, callback friction, referral loops, documentation load, or more difficult escalation steps.

Language access matters because a patient may face a different path if notices, instructions, or follow-up steps are not understandable at the point of use. Disability access matters because the workflow may depend on interfaces, documents, or communications that are not equally usable across patients. Health literacy and digital access matter because a system can quietly assume that people can navigate portals, upload information, interpret prompts, or coordinate follow-up without assistance.

Staff burden also belongs in the equity review. If clinicians, access staff, or operations teams face uneven override work, manual documentation, or exception handling, those pressures can change which patients receive timely review and which cases are more likely to stall in the queue.

## Source Attributes and Proxy Risk

Source attributes and data provenance matter because they show what sits behind a decision-support workflow: what data are used, why they are used, where they came from, when they were updated, and what assumptions travel with them into the local setting.

That review matters because variables can function as proxies even when a system does not directly use protected-class labels. Geography, utilization history, portal activity, prior documentation, referral patterns, and network-connected records can all reflect uneven access conditions or fragmented care in ways that remain operationally important.

Missing data should remain visible as a risk signal. Some patients may have fewer records, more care outside the connected network, less consistent portal use, or documentation gaps tied to language barriers, disability accommodation, or irregular access to care. If the review cannot see those patterns clearly, that evidence gap should stay explicit rather than being covered over by generic assurances.

<!-- EVIDENCE_GRADE_WARN: Subgroup review, source attributes, monitoring, feedback channels, and mitigation records can make equity risks more reviewable, but they do not prove fairness, compliance, safety, patient trust, outcome improvement, or operational maturity. -->

## Monitoring, Feedback, and Recourse

Prelaunch review is not enough. Post-launch monitoring is where a local team can start asking whether false positives, false negatives, overrides, delays, missed referrals, escalations, or documentation burdens appear to differ across relevant groups or settings.

That does not mean a dashboard alone is sufficient. Monitoring becomes useful only when someone can connect the signal to action: what changed, who was affected, what correction path exists, and whether the workflow needs a narrower scope, a fallback route, extra review, or a return to validation.

Feedback and recourse also need to be understandable to the people touched by the workflow. Clinical users, operations teams, patient access staff, and, when appropriate, patient-facing complaint or appeal paths can all help surface missing context. The point is not to treat those channels as proof that the system is equitable, but to use them to make unresolved risk more reviewable after deployment.

## Governance Means Naming the Decision and the Owner

An equity review should end with an operating decision record, not a broad statement of values. Based on the available evidence, an organization may continue the workflow, narrow its scope, require monitoring, require specific mitigations, pause use, reopen validation, add a fallback path, or assign a follow-up owner for unresolved risk.

That decision should stay tied to concrete gaps. In this source set, the gaps remain substantial: there is no local subgroup performance data, no utilization logs, no patient outcomes, no complaint or appeal files, no accessibility testing, no language-service records, no named implementation proof, no local mitigation evidence, and no legal review.

Those absences do not settle the fairness question either way. They do show why the next step has to be operationally disciplined: define the local workflow, name the subgroup questions that fit the setting, inspect burden and proxy risk, create monitoring and correction paths, and assign ownership for what remains unknown.

## What This Draft Cannot Show

- It cannot show local subgroup performance.
- It cannot show measured utilization patterns.
- It cannot show patient outcomes.
- It cannot show complaint or appeal volumes.
- It cannot show accessibility testing results.
- It cannot show language-service performance.

<!-- EVIDENCE_GRADE_WARN: The source basis below supports governance, oversight, and workflow-review framing. It does not by itself establish local effectiveness, equitable impact, legal sufficiency, or deployment readiness in any named care setting. -->

## Selected Source Basis

- HHS OCR Section 1557 materials and eCFR 45 CFR 92.210 for nondiscrimination context around patient care decision support tools.
- ONC decision support intervention materials for source attributes, logic, and implementation visibility.
- NIST AI RMF for governance, context mapping, measurement, monitoring, and lifecycle risk management.
- WHO health-AI ethics and governance guidance for inclusiveness, accountability, human oversight, and protection of affected people.
- AMA and Joint Commission/CHAI guidance for workflow fit, responsible adoption, local validation, monitoring, and accountability.
