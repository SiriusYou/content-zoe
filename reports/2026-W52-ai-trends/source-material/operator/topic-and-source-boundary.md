# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

You cannot govern healthcare AI you cannot find. After a year of source-bounded governance frames around intake, approved use, renewal, equity, near misses, and change control, W52 should focus on the operating prerequisite underneath all of them: a local inventory of AI-enabled workflows. An organization needs a reviewable register that says what AI is in use, where it is embedded, who owns it, what patient or staff pathway it touches, what status it has, what evidence applies, what review thread it belongs to, and when it should be revisited.

This is an AI inventory and use-register argument. It is not a claim that any specific AI product, vendor, model, hospital, health system, or public program has a complete or incomplete inventory, is mature or immature, compliant or noncompliant, safe or unsafe, effective or ineffective. The staged sources support disciplined questions about AI system inventory, context mapping, health IT system management, decision-support visibility, source attributes, local validation, monitoring, governance, professional responsibility, and responsible adoption. They do not provide local inventories, hidden-use audits, procurement records, vendor lists, utilization logs, user interviews, legal analysis, measured outcomes, or named implementation proof.

Suggested title direction:

- You Cannot Govern Healthcare AI You Cannot Find
- Healthcare AI Inventory Has to Be Local
- Before Healthcare AI Governance, Make the List

Prefer the first title unless generation produces a clearly stronger, source-bounded variant.

## Primary source basis

- NIST AI Risk Management Framework 1.0 and AI RMF program page:
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
  https://www.nist.gov/itl/ai-risk-management-framework
- NIST AI RMF Core / AI Resource Center, including inventory and mapping concepts:
  https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
- ONC / HealthIT.gov 2025 SAFER Guide: System Management:
  https://healthit.gov/resources/2025-safer-guide-system-management/
- ONC / HealthIT.gov 2025 SAFER Guide: Contingency Planning:
  https://healthit.gov/resources/2025-safer-guide-contingency-planning/
- ONC / HealthIT.gov Decision Support Interventions test method:
  https://www.healthit.gov/test-method/decision-support-interventions
- FDA Artificial Intelligence and Machine Learning-Enabled Medical Devices page:
  https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-and-machine-learning-aiml-enabled-medical-devices
- WHO ethics and governance of artificial intelligence for health:
  https://www.who.int/publications/i/item/9789240029200
- AMA augmented intelligence in medicine:
  https://www.ama-assn.org/practice-management/digital-health/augmented-intelligence-medicine
- Joint Commission and Coalition for Health AI guidance announcement on responsible AI adoption:
  https://www.jointcommission.org/en-us/knowledge-library/news/2025-09-jc-and-chai-release-initial-guidance-to-support-responsible-ai-adoption

## Required style

- Do not include any week key in the H1 title.
- Use a title frame that differs from recent frames: "Needs an Exit Plan", "Transparency Only Matters If People Can Use It", "Needs a Front Door", "Still Has to Fit the Workday", "Needs a Permission Line Before It Automates Work", "If the Model Stops, What Keeps Moving?", "Approved for One Use Is Not Approved for the Next", "Should Re-Earn Continued Use", "Equity Has to Be Checked Where It Is Used", "Needs a Near-Miss File", and "Updates Should Leave a Change Record".
- Prefer an inventory, local register, AI system list, embedded-use discovery, ownership map, or review-status frame over another transparency, intake, workload, permission, fallback, renewal, equity, near-miss, change-control, or generic monitoring frame.
- Keep the report source-bounded and evidence-cautious.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep evidence warnings locale-specific: English warnings only in `report.en.md`, Chinese warnings only in `report.zh.md`. Locale purity is the publication invariant; warning count may vary if every warning is source-bounded and locale-pure.
- Include a short `Selected Source Basis` section in both locales.
- Aim for 75-95 markdown lines per locale. Reject if the draft is under 68 lines per locale unless a reviewer explicitly accepts editorial compression. If the draft exceeds 106 lines, review for unnecessary expansion but do not reject solely for length if the source basis and structure are strong.
- Avoid promotional language, vendor ranking, health-system ranking, legal advice, compliance claims, maturity scoring, completeness claims, product-safety claims, or claims that an inventory proves safety, compliance, effectiveness, fairness, patient trust, outcome improvement, or operational maturity.

## Safe claims

- A local AI inventory should identify the workflow, owner, status, use case, users, care setting, patient or staff pathway, data/source basis, decision-support role, vendor or internal dependency, approved-use boundary, monitoring owner, fallback path, review date, and change history when those fields fit the use case.
- Inventory should include embedded and indirect AI, not only standalone AI products: EHR modules, decision-support interventions, documentation tools, patient-access workflows, operations queues, imaging support, coding or billing support, triage, scheduling, patient portals, and analytics workflows may all need review.
- Inventory is a starting point for governance; it does not prove that listed tools are safe, compliant, effective, fair, trusted, or mature.
- NIST inventory/context-mapping material, ONC SAFER and DSI material, FDA device-list context, WHO, AMA, and Joint Commission/CHAI sources can define useful review questions; they do not prove any local inventory is complete or correct.
- A useful inventory should stay alive: items can be proposed, piloted, active, narrowed, paused, retired, replaced, or pending review.

## Unsafe claims

- Do not claim any named vendor, product, hospital, or health system has or lacks a complete AI inventory.
- Do not claim the FDA AI/ML-enabled medical devices page defines all healthcare AI or all inventory obligations.
- Do not give legal advice about FDA, ONC certification, HIPAA, procurement, civil rights, malpractice, cybersecurity, disclosure, or professional liability.
- Do not claim an inventory, dashboard, model card, procurement list, governance board, source-attribute list, or risk tier proves safety, compliance, effectiveness, fairness, patient trust, outcome improvement, or operational maturity.
- Do not invent local inventory counts, hidden tools, shadow AI uses, vendor lists, utilization logs, risk scores, maturity levels, or named implementation facts.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- repeats recent title templates;
- cites runtime metadata;
- converts an inventory, dashboard, model card, procurement list, source-attribute list, risk tier, or governance board into proof of safety, compliance, effectiveness, fairness, patient trust, outcome improvement, or operational maturity;
- gives legal advice or legal conclusions;
- implies FDA device inventory context covers every healthcare AI workflow;
- omits the evidence-limits posture;
- omits `Selected Source Basis`;
- falls under 68 markdown lines per locale without explicit reviewer acceptance;
- loses the local inventory and embedded-use discovery angle.
