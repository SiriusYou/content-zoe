# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

Healthcare AI should start a new review year with a queue, not a blank slate. The prior year can close with unresolved AI governance work still visible. The first review cycle should turn that handoff into an operating queue: which AI-enabled workflows need review first, who owns each item, what trigger put it in the queue, what evidence or monitoring gap remains open, and what decision would close or escalate the item.

This is a first-cycle review-queue and triage argument. It is not a claim that any named hospital, health system, vendor, product, public program, or regulator uses this specific queue. It is not a legal or compliance calendar. The source basis supports disciplined questions about AI risk management, governance roles, mapping, monitoring, system management, contingency planning, decision-support attributes, workflow fit, accountable adoption, and lifecycle review. It does not provide local queue records, committee calendars, audit logs, utilization data, legal analysis, measured outcomes, or named implementation proof.

Suggested title direction:

- Healthcare AI Starts the Year With a Review Queue
- The First AI Governance Job Is Sorting the Queue
- Healthcare AI Review Should Start With Open Items

Prefer the first title unless generation produces a clearly stronger, source-bounded variant.

## Primary source basis

- NIST AI Risk Management Framework 1.0 and AI RMF program page:
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
  https://www.nist.gov/itl/ai-risk-management-framework
- NIST AI RMF Core / AI Resource Center, including govern, map, measure, manage, documentation, monitoring, and lifecycle review concepts:
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
- The reader-facing report must describe the review-queue idea only. It must not describe internal scheduling, run classification, retry mechanics, source-preparation mechanics, or draft mechanics.
- Use a title frame that differs from recent frames: "Needs an Exit Plan", "Transparency Only Matters If People Can Use It", "Needs a Front Door", "Still Has to Fit the Workday", "Needs a Permission Line Before It Automates Work", "If the Model Stops, What Keeps Moving?", "Approved for One Use Is Not Approved for the Next", "Should Re-Earn Continued Use", "Equity Has to Be Checked Where It Is Used", "Needs a Near-Miss File", "Updates Should Leave a Change Record", "You Cannot Govern Healthcare AI You Cannot Find", and "Needs a Carry-Forward File".
- Prefer a review-queue, triage, first-cycle sorting, open-item prioritization, owner follow-up, evidence-gap, monitoring-gap, or review-trigger frame over another inventory, carry-forward, transparency, intake, workload, permission, fallback, renewal, equity, near-miss, change-control, or generic monitoring frame.
- Keep the report source-bounded and evidence-cautious.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep evidence warnings locale-specific: English warnings only in `report.en.md`, Chinese warnings only in `report.zh.md`. Locale purity is the publication invariant; warning count may vary if every warning is source-bounded and locale-pure.
- Include a short `Selected Source Basis` section in both locales.
- Aim for 75-95 markdown lines per locale. Reject if the draft is under 68 lines per locale unless a reviewer explicitly accepts editorial compression. If the draft exceeds 106 lines, review for unnecessary expansion but do not reject solely for length if the source basis and structure are strong.
- Avoid promotional language, vendor ranking, health-system ranking, legal advice, compliance claims, maturity scoring, completeness claims, product-safety claims, or claims that a review queue proves safety, compliance, effectiveness, fairness, patient trust, outcome improvement, continuity, or operational maturity.

## Safe claims

- A first-cycle AI review queue can make open governance work actionable by naming workflow, owner, trigger, evidence gap, monitoring gap, source-attribute gap, fallback question, change thread, near-miss thread, and decision needed when those records exist.
- A queue can sort items by review need, but it does not prove the underlying workflows are safe, compliant, effective, fair, trusted, mature, or outcome-improving.
- Useful queue triggers include unresolved carry-forward item, new or changed use, expanded user group, changed output, source-attribute update, monitoring exception, near miss, incident, owner change, fallback gap, pending validation, or retirement question.
- NIST AI RMF, ONC SAFER, ONC DSI, WHO, AMA, Joint Commission/CHAI, and bounded FDA device-context sources can support review-queue questions; they do not prove any local queue is complete or correctly prioritized.
- Queue status can distinguish intake-needed, owner-confirm-needed, evidence-needed, monitoring-review-needed, validation-needed, fallback-review-needed, decision-needed, paused, retired, and closed.
- Unknown fields should remain visible rather than being converted into assumed clearance.

## Unsafe claims

- Do not claim any named vendor, product, hospital, health system, regulator, or public program has or lacks a first-year AI review queue.
- Do not claim that a queue, calendar, dashboard, committee agenda, or annual review packet satisfies law, regulation, accreditation, certification, or contractual duties.
- Do not give legal advice about FDA, ONC certification, HIPAA, procurement, civil rights, malpractice, cybersecurity, disclosure, or professional liability.
- Do not claim a review queue proves safety, compliance, effectiveness, fairness, patient trust, outcome improvement, resilience, continuity, or operational maturity.
- Do not invent local open items, review dates, committee decisions, audit findings, utilization trends, validation results, near misses, incidents, owners, risk tiers, or named implementation facts.
- Do not present FDA AI/ML-enabled device context as the whole healthcare AI landscape.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- mentions internal scheduling, run classification, retry mechanics, source-preparation mechanics, or draft mechanics;
- repeats recent title templates;
- cites runtime metadata;
- turns a review queue, calendar, dashboard, committee packet, risk tier, or annual review into proof of safety, compliance, effectiveness, fairness, patient trust, outcome improvement, resilience, continuity, or maturity;
- gives legal advice or legal conclusions;
- implies FDA device context covers every healthcare AI workflow;
- omits the evidence-limits posture;
- omits `Selected Source Basis`;
- falls under 68 markdown lines per locale without explicit reviewer acceptance;
- loses the review-queue / first-cycle triage angle.
