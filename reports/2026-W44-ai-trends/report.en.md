# Healthcare AI Still Has to Fit the Workday

<!-- EVIDENCE_GRADE_WARN: This report relies on staged human-factors, workflow, patient-safety, and governance sources. It does not include local workload measurements, usability-test results, deployment evidence, outcome data, or named implementation proof. -->

Healthcare AI governance is often framed around model documentation, data provenance, policy controls, and monitoring plans. Those checks matter, but they do not answer the practical question that determines whether a tool can be used responsibly in care delivery: does the AI-enabled workflow fit real human work under real conditions?

That question applies even when a tool is presented as merely assistive. An AI summary, triage signal, documentation suggestion, or decision-support output can change routing, review queues, handoffs, communication patterns, and accountability. A workflow is not ready just because it has a model description or an intake record. Someone still has to ask who sees the output, what else they are seeing at the same time, what task they are performing, what pressure they are under, and what authority they have to question or override the result.

## Workflow Fit Matters Even for Assistive AI

Healthcare workflows are already dense with competing tasks, limited attention, and handoff risk. In that setting, an assistive AI feature does not stay confined to the model layer. It changes the surrounding work system: documentation timing, queue management, escalation paths, and the point at which a human reviewer has to step in.

That is why human-factors review is most useful as an evidence question rather than a slogan. A serious review asks which users are involved, which interface they encounter, which environment they work in, and what happens when the output is wrong, unclear, late, or easy to overtrust. It also has to be revisited when the model changes, the interface changes, staffing changes, or local protocols change.

## Attention Load Is Part of the Governance Problem

Healthcare already offers a clear cautionary lesson in alert fatigue: a technically plausible prompt can still fail if it appears at the wrong moment, arrives too often, or competes with more urgent demands. That does not prove AI systems are causing measured alert-fatigue harm in any specific deployment. It does show why AI-mediated prompts should be reviewed as part of an attention budget, not only as a content-quality issue.

AI prompts, summaries, triage flags, documentation suggestions, and decision-support outputs all compete for attention. A workload-aware review should ask whether the output is interruptive or passive, mandatory or dismissible, time-sensitive or easy to defer, and likely to be misunderstood under pressure. Relevant local evidence could include override patterns, review-queue growth, duplicate work, escalation rates, complaint patterns, handoff friction, and user feedback.

## Local Validation Should Measure Workday Burden

If an organization claims that a healthcare AI tool reduces burden, that claim should be tested locally rather than assumed. Local validation should look beyond output quality and ask how the tool changes the amount, timing, difficulty, and accountability of work.

Useful burden measures can include time to review, duplicate documentation, review-queue volume, handoff complexity, escalation friction, training completion, and user-reported burden. If a tool creates a new review obligation, governance should also decide who owns that task and what gets deprioritized to make room for it. Without that step, an AI workflow can shift work rather than reduce it.

<!-- EVIDENCE_GRADE_WARN: Human-factors review, alert-burden checks, training plans, and local validation can strengthen governance discipline, but the staged sources do not by themselves prove safety, effectiveness, burden reduction, or operational maturity. -->

## Human Review Has to Be Operational, Not Symbolic

"Human in the loop" matters only if the reviewer has enough context, time, training, authority, and escalation support to act. A paper requirement for human review is weak if the reviewer cannot see the right context, cannot challenge the output, or cannot resolve disagreements without delay and confusion.

Training therefore belongs to workflow design, not to a blanket assurance claim. At minimum, training should cover intended use, known limits, workflow steps, escalation routes, documentation expectations, and change notices. Oversight teams also need realistic capacity. Adding AI review tasks without time, staffing, or decision authority can turn oversight into a paper control instead of a functioning safeguard.

## Governance Has to Be Category-Aware

The staged sources support using FDA device-usability guidance as a disciplined example of why intended users, intended uses, interfaces, and use environments matter. They do not support treating every healthcare AI tool as a regulated medical device. A regulated AI-enabled medical device, a certified-health-IT predictive decision support intervention, an ambient documentation feature, a patient-facing assistant, and an administrative model should not be treated as one governance category.

That distinction matters because the routing questions differ. Device contexts, certified-health-IT contexts, and non-device workflow tools call for different evidence questions, different review paths, and different claims discipline. When the category is unclear, the safer move is a qualified review rather than casual generalization.

## What This Draft Cannot Show

- No local workload measurements.
- No usability-test results.
- No deployment evidence or named implementation cases.
- No outcome data.
- No proof that any local oversight process is adequate.

## Bottom Line

Healthcare AI governance should not stop at whether documentation exists. The harder and more useful test is whether the tool fits the workday without adding unmanaged attention load, ambiguous review duties, duplicate documentation, or unowned escalation work. Until that question is answered with local evidence, burden reduction and operational maturity should remain claims to test rather than conclusions to assume.

## Selected Source Basis

- FDA, "Human Factors and Medical Devices"  
  https://www.fda.gov/medical-devices/device-advice-comprehensive-regulatory-assistance/human-factors-and-medical-devices
- FDA, "Human Factors Considerations"  
  https://www.fda.gov/medical-devices/human-factors-and-medical-devices/human-factors-considerations
- FDA, "Applying Human Factors and Usability Engineering to Medical Devices"  
  https://www.fda.gov/regulatory-information/search-fda-guidance-documents/applying-human-factors-and-usability-engineering-medical-devices
- AHRQ PSNet, "Alert Fatigue"  
  https://psnet.ahrq.gov/primer/alert-fatigue
- AMA, "Augmented Intelligence in Medicine"  
  https://www.ama-assn.org/practice-management/digital-health/augmented-intelligence-medicine
- NIST, "Artificial Intelligence Risk Management Framework (AI RMF 1.0)"  
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
- NIST, "AI Risk Management Framework Program"  
  https://www.nist.gov/itl/ai-risk-management-framework
- ONC, "Decision Support Interventions Test Method"  
  https://www.healthit.gov/test-method/decision-support-interventions
- The Joint Commission, "Initial Guidance to Support Responsible AI Adoption"  
  https://www.jointcommission.org/en-us/knowledge-library/news/2025-09-jc-and-chai-release-initial-guidance-to-support-responsible-ai-adoption
- WHO, "Ethics and Governance of Artificial Intelligence for Health"  
  https://www.who.int/publications/i/item/9789240029200
