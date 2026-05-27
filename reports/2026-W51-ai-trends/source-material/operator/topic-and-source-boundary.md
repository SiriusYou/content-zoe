# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

Healthcare AI updates should leave a change record. If an AI-enabled workflow changes after approval, renewal, equity review, or near-miss review, the organization needs more than a version number or vendor release note. It needs a reviewable record of what changed, why it changed, which workflow and users it touches, which evidence or validation should be refreshed, what staff and patients may notice, what monitoring should watch after release, and what rollback or narrowing path exists if the update creates new risk.

This is a change-control and update-governance argument. It is not a claim that any specific AI product, vendor, model, hospital, health system, or public program updated safely, unsafely, legally, illegally, effectively, or ineffectively. The staged sources support disciplined questions about AI-enabled device software change planning, health IT configuration and maintenance, decision-support visibility, lifecycle risk management, local validation, monitoring, governance, professional responsibility, and contingency planning. They do not provide local release notes, change tickets, validation results, user notices, rollback tests, legal analysis, measured outcomes, or named implementation proof.

Suggested title direction:

- Healthcare AI Updates Should Leave a Change Record
- Every Healthcare AI Update Needs a Receipt
- Healthcare AI Change Control Has to Reach the Workflow

Prefer the first title unless generation produces a clearly stronger, source-bounded variant.

## Primary source basis

- FDA guidance page: Marketing Submission Recommendations for a Predetermined Change Control Plan for Artificial Intelligence-Enabled Device Software Functions:
  https://www.fda.gov/regulatory-information/search-fda-guidance-documents/marketing-submission-recommendations-predetermined-change-control-plan-artificial-intelligence
- FDA / Health Canada / MHRA guiding principles for Predetermined Change Control Plans for machine-learning-enabled medical devices:
  https://www.fda.gov/medical-devices/software-medical-device-samd/predetermined-change-control-plans-machine-learning-enabled-medical-devices-guiding-principles
- ONC / HealthIT.gov 2025 SAFER Guide: System Management:
  https://healthit.gov/resources/2025-safer-guide-system-management/
- ONC / HealthIT.gov 2025 SAFER Guide: Contingency Planning:
  https://healthit.gov/resources/2025-safer-guide-contingency-planning/
- ONC / HealthIT.gov Decision Support Interventions test method:
  https://www.healthit.gov/test-method/decision-support-interventions
- NIST Artificial Intelligence Risk Management Framework 1.0 and AI RMF program page:
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
  https://www.nist.gov/itl/ai-risk-management-framework
- WHO ethics and governance of artificial intelligence for health:
  https://www.who.int/publications/i/item/9789240029200
- AMA augmented intelligence in medicine:
  https://www.ama-assn.org/practice-management/digital-health/augmented-intelligence-medicine
- Joint Commission and Coalition for Health AI guidance announcement on responsible AI adoption:
  https://www.jointcommission.org/en-us/knowledge-library/news/2025-09-jc-and-chai-release-initial-guidance-to-support-responsible-ai-adoption

## Required style

- Do not include any week key in the H1 title.
- Use a title frame that differs from recent frames: "Needs an Exit Plan", "Transparency Only Matters If People Can Use It", "Needs a Front Door", "Still Has to Fit the Workday", "Needs a Permission Line Before It Automates Work", "If the Model Stops, What Keeps Moving?", "Approved for One Use Is Not Approved for the Next", "Should Re-Earn Continued Use", "Equity Has to Be Checked Where It Is Used", and "Needs a Near-Miss File".
- Prefer an update record, change-control, release-note, validation trigger, user-notice, or rollback-after-update frame over another transparency, intake, workload, permission, fallback, renewal, equity, near-miss, or generic monitoring frame.
- Keep the report source-bounded and evidence-cautious.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep evidence warnings locale-specific: English warnings only in `report.en.md`, Chinese warnings only in `report.zh.md`. Locale purity is the publication invariant; warning count may vary if every warning is source-bounded and locale-pure.
- Include a short `Selected Source Basis` section in both locales.
- Aim for 75-95 markdown lines per locale. Reject if the draft is under 68 lines per locale unless a reviewer explicitly accepts editorial compression. If the draft exceeds 106 lines, review for unnecessary expansion but do not reject solely for length if the source basis and structure are strong.
- Avoid promotional language, vendor ranking, health-system ranking, legal advice, compliance claims, device-regulatory conclusions, product-safety claims, or claims that change records prove safety, compliance, effectiveness, patient trust, outcome improvement, or operational maturity.

## Safe claims

- An AI update record should identify what changed, when it changed, why it changed, which users and workflows are affected, whether the approved-use boundary changed, and who owns the release decision.
- Change review can ask whether source data, model behavior, user interface, integration, decision-support logic, source attributes, thresholds, prompts, escalation paths, monitoring, or fallback procedures changed.
- Some updates should trigger refreshed local validation, user notice, training updates, monitoring, rollback readiness, narrowed use, or a return to governance review.
- FDA PCCP materials are useful as bounded source context for AI-enabled device software functions; they do not define all healthcare AI or replace local legal/regulatory review.
- ONC SAFER, ONC DSI, NIST, WHO, AMA, and Joint Commission/CHAI sources can define useful review questions; they do not prove any local update is safe, compliant, effective, or beneficial.

## Unsafe claims

- Do not claim any named vendor, product, hospital, or health system updated safely, unsafely, legally, illegally, effectively, or ineffectively.
- Do not give legal advice about FDA, PCCPs, medical devices, ONC certification, HIPAA, malpractice, procurement, civil rights, disclosure, cybersecurity, or professional liability.
- Do not claim release notes, version numbers, validation, monitoring, rollback plans, user notices, or change boards prove safety, compliance, effectiveness, patient trust, outcome improvement, or operational maturity.
- Do not imply every healthcare AI update is a regulated medical-device change or requires the same evidence burden.
- Do not invent local release notes, change tickets, validation results, downtime events, vendor notices, user complaints, rollback tests, or corrective-action results.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- repeats recent title templates;
- cites runtime metadata;
- converts release notes, version numbers, validation triggers, monitoring, rollback plans, user notices, or change boards into proof of safety, compliance, effectiveness, patient trust, outcome improvement, or operational maturity;
- gives legal advice or legal conclusions;
- implies FDA PCCP materials apply to every healthcare AI workflow;
- omits the evidence-limits posture;
- omits `Selected Source Basis`;
- falls under 68 markdown lines per locale without explicit reviewer acceptance;
- loses the change-control and update-record angle.
