# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

Healthcare AI governance should not reset at the calendar boundary. After source-bounded reports on intake, approval boundaries, renewal, equity, near misses, change records, and local inventory, W53 should focus on the carry-forward file that preserves unfinished governance work across the year boundary. A useful carry-forward file names the AI-enabled workflows that still need review, the open decisions attached to them, the owners responsible for follow-up, the evidence or monitoring gaps that remain unresolved, the changes and near misses that should inform next review, and the items that should be paused, narrowed, retired, or revalidated before continued use.

This is a year-end handoff and open-item continuity argument. It is not a claim that any named health system, vendor, product, or regulator requires a specific calendar-year ritual. It is not a legal or compliance checklist. The staged sources support disciplined questions about AI risk management, governance roles, lifecycle review, health IT system management, decision-support source attributes, monitoring, fallback planning, change control, and responsible adoption. They do not provide local committee minutes, audit logs, procurement files, annual review packets, legal analysis, measured outcomes, or named implementation proof.

Suggested title direction:

- Healthcare AI Needs a Carry-Forward File
- Healthcare AI Work Should Not Reset at Year-End
- The AI Year Should Close With Open Items

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
- This W53 publication is intentional because 2026 has an ISO week 53. Do not roll the report forward to 2027-W01 or imply that the campaign skipped the year-boundary beat.
- Use a title frame that differs from recent frames: "Needs an Exit Plan", "Transparency Only Matters If People Can Use It", "Needs a Front Door", "Still Has to Fit the Workday", "Needs a Permission Line Before It Automates Work", "If the Model Stops, What Keeps Moving?", "Approved for One Use Is Not Approved for the Next", "Should Re-Earn Continued Use", "Equity Has to Be Checked Where It Is Used", "Needs a Near-Miss File", "Updates Should Leave a Change Record", and "You Cannot Govern Healthcare AI You Cannot Find".
- Prefer a carry-forward, open-item, year-boundary handoff, unresolved review, evidence-debt, owner-follow-up, or governance-continuity frame over another inventory, transparency, intake, workload, permission, fallback, renewal, equity, near-miss, change-control, or generic monitoring frame.
- Keep the report source-bounded and evidence-cautious.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep evidence warnings locale-specific: English warnings only in `report.en.md`, Chinese warnings only in `report.zh.md`. Locale purity is the publication invariant; warning count may vary if every warning is source-bounded and locale-pure.
- Include a short `Selected Source Basis` section in both locales.
- Aim for 75-95 markdown lines per locale. Reject if the draft is under 68 lines per locale unless a reviewer explicitly accepts editorial compression. If the draft exceeds 106 lines, review for unnecessary expansion but do not reject solely for length if the source basis and structure are strong.
- Avoid promotional language, vendor ranking, health-system ranking, legal advice, compliance claims, maturity scoring, completeness claims, product-safety claims, or claims that a carry-forward file proves safety, compliance, effectiveness, fairness, patient trust, outcome improvement, or operational maturity.

## Safe claims

- A carry-forward file can make unfinished AI governance work visible across a year boundary: open reviews, unresolved evidence gaps, owner follow-ups, pending validation, monitoring exceptions, change records, near-miss threads, fallback questions, and retirement decisions.
- The file should link back to the local inventory or register when one exists, but it is not the inventory itself.
- Useful carry-forward fields include workflow, owner, current status, last review, next review trigger, open decision, evidence gap, monitoring gap, recent change, near-miss or incident link, fallback status, retirement state, and escalation path when those records exist.
- NIST AI RMF, ONC SAFER, ONC DSI, WHO, AMA, Joint Commission/CHAI, and bounded FDA device-context sources can support governance-continuity questions; they do not prove any local organization has answered those questions.
- Year-boundary review should keep unknowns visible rather than converting unresolved items into assumed approval.
- Carry-forward records can help distinguish active, pending, paused, narrowed, retired, replaced, and unresolved items.

## Unsafe claims

- Do not claim any named vendor, product, hospital, or health system has or lacks a year-end AI carry-forward process.
- Do not claim that an annual handoff, committee packet, dashboard, inventory export, or carry-forward file satisfies law, regulation, accreditation, certification, or contractual duties.
- Do not give legal advice about FDA, ONC certification, HIPAA, procurement, civil rights, malpractice, cybersecurity, disclosure, or professional liability.
- Do not claim a carry-forward file proves safety, compliance, effectiveness, fairness, patient trust, outcome improvement, resilience, continuity, or operational maturity.
- Do not invent local open items, committee decisions, audit findings, utilization trends, validation results, near misses, incidents, owners, risk tiers, or named implementation facts.
- Do not present FDA AI/ML-enabled device context as the whole healthcare AI landscape.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- rolls W53 into 2027-W01 or treats ISO W53 as a mistake;
- repeats recent title templates;
- cites runtime metadata;
- turns a carry-forward file, inventory, dashboard, committee packet, risk tier, or annual review into proof of safety, compliance, effectiveness, fairness, patient trust, outcome improvement, resilience, continuity, or maturity;
- gives legal advice or legal conclusions;
- implies FDA device context covers every healthcare AI workflow;
- omits the evidence-limits posture;
- omits `Selected Source Basis`;
- falls under 68 markdown lines per locale without explicit reviewer acceptance;
- loses the carry-forward / open-item continuity angle.
