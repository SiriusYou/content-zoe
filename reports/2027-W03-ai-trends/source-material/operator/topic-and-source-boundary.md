# Topic and source boundary

## Intended reader-facing angle

The article should focus on this thesis:

Healthcare AI use should carry a review date, not only a launch date. A model-enabled workflow can look settled after approval, implementation, or owner assignment, but its evidence, users, setting, vendor behavior, monitoring signals, fallback plan, and downstream decisions can change. A review date gives the organization a visible moment to ask whether the use boundary still fits, whether the owner can still act, whether monitoring signals have changed, and whether the workflow should continue, narrow, pause, retire, or return to governance review.

This is a lifecycle review and time-bound governance argument. It is not a claim that any named hospital, health system, vendor, product, public program, or regulator uses a particular renewal model. It is not legal advice, a compliance checklist, or a device-change-control instruction. The source basis supports disciplined questions about lifecycle monitoring, documentation, roles, system management, contingency planning, decision-support visibility, responsible adoption, and bounded device context. It does not provide local review calendars, approval terms, committee charters, audit logs, legal conclusions, measured outcomes, or named implementation proof.

Suggested title direction:

- Healthcare AI Should Carry a Review Date
- Healthcare AI Use Should Not Be Approved Forever
- Healthcare AI Needs a Renewal Question

Prefer the first title unless generation produces a clearly stronger, source-bounded variant.

## Primary source basis

- NIST AI Risk Management Framework 1.0 and AI RMF program page:
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
  https://www.nist.gov/itl/ai-risk-management-framework
- NIST AI RMF Core / AI Resource Center, including govern, map, measure, manage, documentation, accountability, monitoring, and lifecycle review concepts:
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

- Do not include any calendar key in the H1 title.
- The article must describe the review-date idea only. It must not describe non-reader operational details.
- Use a title frame that differs from recent frames: "Needs an Exit Plan", "Transparency Only Matters If People Can Use It", "Needs a Front Door", "Still Has to Fit the Workday", "Needs a Permission Line Before It Automates Work", "If the Model Stops, What Keeps Moving?", "Approved for One Use Is Not Approved for the Next", "Should Re-Earn Continued Use", "Equity Has to Be Checked Where It Is Used", "Needs a Near-Miss File", "Updates Should Leave a Change Record", "You Cannot Govern Healthcare AI You Cannot Find", "Needs a Carry-Forward File", "Starts the Year With a Review Queue", and "Needs an Owner Before It Needs a Score".
- Prefer a review-date, renewal-question, time-bound-use, review-trigger, sunset-review, or continued-use frame over another queue, owner, inventory, carry-forward, transparency, intake, workload, permission, fallback, equity, near-miss, change-control, or generic monitoring frame.
- Keep the article source-bounded and evidence-cautious.
- When discussing evidence limits in public prose, use phrases such as "the source basis" or "available governance sources".
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep evidence warnings locale-specific: English warnings only in `report.en.md`, Chinese warnings only in `report.zh.md`. Locale purity is the publication invariant; warning count may vary if every warning is source-bounded and locale-pure.
- Include a short `Selected Source Basis` section in both locales.
- In `Selected Source Basis`, list public source families by name, such as NIST AI RMF, ONC SAFER, ONC DSI, WHO, AMA, Joint Commission/CHAI, and bounded FDA AI/ML device context. Do not print local filenames, markdown paths, or evidence-preparation labels in that section.
- Aim for 75-95 markdown lines per locale. Reject if the article is under 68 lines per locale unless a reviewer explicitly accepts editorial compression. If the article exceeds 106 lines, review for unnecessary expansion but do not reject solely for length if the source basis and structure are strong.
- Avoid promotional language, vendor ranking, health-system ranking, legal advice, compliance claims, maturity scoring, completeness claims, product-safety claims, or claims that a review date proves safety, compliance, effectiveness, fairness, patient trust, outcome improvement, continuity, or operational maturity.

## Safe claims

- A review date can make continued-use questions visible by creating a recurring moment to examine ownership, use boundary, monitoring signals, fallback readiness, source attributes, and unresolved evidence gaps.
- Review dates should connect to actual workflow use, not only to a model name, procurement date, or vendor version.
- Useful review-date fields can include current owner, last review date, next review date, reviewed use boundary, change triggers, monitoring responsibility, fallback contact, escalation route, and continued-use decision when those fields exist.
- A review date can help reveal stale evidence, expanded use, changed users, monitoring concerns, unresolved ownership, or missing fallback planning, but it does not prove that the workflow is safe, compliant, effective, fair, trusted, mature, or outcome-improving.
- NIST AI RMF, ONC SAFER, ONC DSI, WHO, AMA, Joint Commission/CHAI, and bounded FDA device-context sources can support lifecycle and review-trigger questions; they do not prove any local review calendar is complete or correct.
- Unknown or expired review status should remain visible rather than being converted into assumed approval.

## Unsafe claims

- Do not claim any named vendor, product, hospital, health system, regulator, or public program has or lacks a sufficient review-date model.
- Do not claim that a review date, renewal decision, committee review, dashboard field, inventory entry, or owner field satisfies law, regulation, accreditation, certification, or contractual duties.
- Do not give legal advice about FDA, ONC certification, HIPAA, procurement, civil rights, malpractice, cybersecurity, disclosure, or professional liability.
- Do not claim a review date proves safety, compliance, effectiveness, fairness, patient trust, outcome improvement, resilience, continuity, or operational maturity.
- Do not invent local review dates, committee names, owner names, approval terms, audit findings, utilization trends, validation results, incidents, risk tiers, or named implementation facts.
- Do not present FDA AI/ML-enabled device context as the whole healthcare AI landscape.
- Do not cite non-public process records as reader sources.
- Do not describe the article as relying on locally written notes, author-prepared summaries, or non-public process records. Use public-facing phrases such as "the source basis" and "available governance sources" instead.

## Publication gate

Reject or restage if the article:

- uses only job metadata or generated context as evidence;
- includes any calendar key in the H1;
- mentions non-reader operational details;
- repeats recent title templates;
- cites runtime metadata;
- turns a review date, renewal decision, committee review, dashboard field, inventory entry, risk tier, owner field, or decision-right label into proof of safety, compliance, effectiveness, fairness, patient trust, outcome improvement, resilience, continuity, or maturity;
- gives legal advice or legal conclusions;
- implies FDA device context covers every healthcare AI workflow;
- omits the evidence-limits posture;
- omits `Selected Source Basis`;
- falls under 68 markdown lines per locale without explicit reviewer acceptance;
- loses the review-date / continued-use angle.
