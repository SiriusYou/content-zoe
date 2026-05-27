# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

Healthcare AI review work needs an owner before it needs another score. A queue can show which AI-enabled workflows need attention, but unresolved items still stall if no accountable person or group owns the next action. A useful owner-of-record should connect the workflow to the people who can gather evidence, confirm intended use, review monitoring, escalate risk, decide whether to continue, narrow, pause, retire, or reopen review, and explain what remains unresolved.

This is an ownership and decision-rights argument. It is not a claim that any named hospital, health system, vendor, product, public program, or regulator uses a particular owner model. It is not a legal or compliance checklist. The source basis supports disciplined questions about governance roles, accountability, system management, decision-support visibility, monitoring, workflow fit, safety management, contingency planning, responsible adoption, and lifecycle review. It does not provide local owner maps, committee charters, job descriptions, audit logs, legal analysis, measured outcomes, or named implementation proof.

Suggested title direction:

- Healthcare AI Needs an Owner Before It Needs a Score
- Healthcare AI Review Needs Someone on the Hook
- Every Healthcare AI Review Item Needs an Owner

Prefer the first title unless generation produces a clearly stronger, source-bounded variant.

## Primary source basis

- NIST AI Risk Management Framework 1.0 and AI RMF program page:
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
  https://www.nist.gov/itl/ai-risk-management-framework
- NIST AI RMF Core / AI Resource Center, including govern, map, measure, manage, documentation, monitoring, accountability, roles, and lifecycle review concepts:
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
- The reader-facing report must describe the ownership and decision-rights idea only. It must not describe internal scheduling, run classification, retry mechanics, source-preparation mechanics, or draft mechanics.
- Use a title frame that differs from recent frames: "Needs an Exit Plan", "Transparency Only Matters If People Can Use It", "Needs a Front Door", "Still Has to Fit the Workday", "Needs a Permission Line Before It Automates Work", "If the Model Stops, What Keeps Moving?", "Approved for One Use Is Not Approved for the Next", "Should Re-Earn Continued Use", "Equity Has to Be Checked Where It Is Used", "Needs a Near-Miss File", "Updates Should Leave a Change Record", "You Cannot Govern Healthcare AI You Cannot Find", "Needs a Carry-Forward File", and "Starts the Year With a Review Queue".
- Prefer an owner-of-record, accountable owner, decision-rights, escalation-route, owner-confirmation, or unresolved-action frame over another queue, inventory, carry-forward, transparency, intake, workload, permission, fallback, renewal, equity, near-miss, change-control, or generic monitoring frame.
- Keep the report source-bounded and evidence-cautious.
- When discussing evidence limits in public prose, use reader-facing phrases such as "the source basis" or "available governance sources" rather than describing how input materials were prepared.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep evidence warnings locale-specific: English warnings only in `report.en.md`, Chinese warnings only in `report.zh.md`. Locale purity is the publication invariant; warning count may vary if every warning is source-bounded and locale-pure.
- Include a short `Selected Source Basis` section in both locales.
- Aim for 75-95 markdown lines per locale. Reject if the draft is under 68 lines per locale unless a reviewer explicitly accepts editorial compression. If the draft exceeds 106 lines, review for unnecessary expansion but do not reject solely for length if the source basis and structure are strong.
- Avoid promotional language, vendor ranking, health-system ranking, legal advice, compliance claims, maturity scoring, completeness claims, product-safety claims, or claims that an owner record proves safety, compliance, effectiveness, fairness, patient trust, outcome improvement, continuity, or operational maturity.

## Safe claims

- A healthcare AI owner-of-record can make review work more actionable by naming who can gather evidence, confirm use boundary, review monitoring, coordinate fallback, route concerns, and escalate unresolved questions when those records exist.
- Ownership should connect to a workflow, not only to a vendor or model name.
- Useful owner fields include owner group, clinical or operational setting, intended users, decision rights, review responsibility, monitoring responsibility, escalation route, fallback contact, and last confirmation date when those fields exist.
- Owner confirmation can help reveal unresolved items, but it does not prove that a workflow is safe, compliant, effective, fair, trusted, mature, or outcome-improving.
- NIST AI RMF, ONC SAFER, ONC DSI, WHO, AMA, Joint Commission/CHAI, and bounded FDA device-context sources can support ownership and decision-rights questions; they do not prove any local owner map is complete or correct.
- Unknown or disputed ownership should remain visible rather than being converted into assumed accountability.

## Unsafe claims

- Do not claim any named vendor, product, hospital, health system, regulator, or public program has or lacks a sufficient AI ownership model.
- Do not claim that owner assignment, committee review, dashboard fields, inventory entries, or decision-right labels satisfy law, regulation, accreditation, certification, or contractual duties.
- Do not give legal advice about FDA, ONC certification, HIPAA, procurement, civil rights, malpractice, cybersecurity, disclosure, or professional liability.
- Do not claim owner assignment proves safety, compliance, effectiveness, fairness, patient trust, outcome improvement, resilience, continuity, or operational maturity.
- Do not invent local owners, committee names, review dates, audit findings, utilization trends, validation results, near misses, incidents, risk tiers, or named implementation facts.
- Do not present FDA AI/ML-enabled device context as the whole healthcare AI landscape.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- mentions internal scheduling, run classification, retry mechanics, source-preparation mechanics, or draft mechanics;
- repeats recent title templates;
- cites runtime metadata;
- turns owner assignment, committee review, dashboard fields, inventory entries, risk tiers, or decision-right labels into proof of safety, compliance, effectiveness, fairness, patient trust, outcome improvement, resilience, continuity, or maturity;
- gives legal advice or legal conclusions;
- implies FDA device context covers every healthcare AI workflow;
- omits the evidence-limits posture;
- omits `Selected Source Basis`;
- falls under 68 markdown lines per locale without explicit reviewer acceptance;
- loses the owner-of-record / decision-rights angle.
