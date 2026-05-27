# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

Healthcare AI should earn its renewal. After a tool has been reviewed, launched, scoped, monitored, given fallback plans, and checked for use creep, the next governance moment is renewal: contract renewal, license renewal, budget renewal, platform renewal, model-service renewal, or an internal decision to keep using the workflow. Continued use should be reviewed against what actually happened, not carried forward because the original launch was approved.

This is a renewal-review and continued-use argument, not a claim that any specific AI product, vendor, contract, or health system is safe, unsafe, effective, compliant, or worth renewing. The staged sources support disciplined questions about health IT selection and upgrading, implementation, vendor support, lifecycle risk management, local validation, monitoring, policies, human oversight, and responsible adoption. They do not provide local contract terms, renewal decisions, utilization logs, performance metrics, incident records, user feedback data, legal analysis, or named implementation proof.

## Primary source basis

- ONC / HealthIT.gov Selecting or Upgrading Health IT:
  https://www.healthit.gov/topic/safety/selecting-or-upgrading-health-it
- ONC / HealthIT.gov Implementing Health IT:
  https://healthit.gov/clinical-quality-and-safety/safer-guides/implementing-health-it/
- ONC EHR Contracts Untangled:
  https://healthit.gov/resources/ehr-contracts-untangled-selecting-wisely-negotiating-terms-and-understanding-the-fine-print/
- ONC / HealthIT.gov Decision Support Interventions test method:
  https://www.healthit.gov/test-method/decision-support-interventions
- NIST Artificial Intelligence Risk Management Framework 1.0 and AI RMF program page:
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
  https://www.nist.gov/itl/ai-risk-management-framework
- Joint Commission and Coalition for Health AI guidance announcement on responsible AI adoption:
  https://www.jointcommission.org/en-us/knowledge-library/news/2025-09-jc-and-chai-release-initial-guidance-to-support-responsible-ai-adoption
- AMA augmented intelligence in medicine:
  https://www.ama-assn.org/practice-management/digital-health/augmented-intelligence-medicine
- WHO ethics and governance of artificial intelligence for health:
  https://www.who.int/publications/i/item/9789240029200

## Required style

- Do not include any week key in the H1 title.
- Use a title frame that differs from recent frames: "Next Test Is ...", "Assurance Phase", "Show Its Work", "Operating Question", "Needs a Learning Loop", "Data Boundary Behind ...", "Has to Produce Evidence", "Needs an Exit Plan", "Transparency Only Matters If People Can Use It", "Needs a Front Door", "Still Has to Fit the Workday", "Needs a Permission Line Before It Automates Work", "If the Model Stops, What Keeps Moving?", and "Approved for One Use Is Not Approved for the Next".
- Prefer a renewal, continued-use, contract checkpoint, evidence refresh, support-review, or reapproval frame over another transparency, evidence, intake, learning-loop, exit-plan, workload, permission-boundary, fallback-continuity, or use-creep frame.
- Keep the report source-bounded and evidence-cautious.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep evidence warnings locale-specific: English warnings only in `report.en.md`, Chinese warnings only in `report.zh.md`.
- Include a short `Selected Source Basis` section in both locales.
- Aim for 60-80 markdown lines per locale. Reject if the draft is under 55 lines per locale unless a reviewer explicitly accepts editorial compression.
- Avoid promotional language, vendor ranking, health-system ranking, legal advice, or claims that renewal controls prove safety, compliance, fairness, cybersecurity readiness, patient trust, operational maturity, or clinical benefit.

## Safe claims

- Renewal should ask whether the tool is still used for the approved purpose, by the expected users, in the expected settings, with the expected data and downstream effects.
- Renewal review can examine actual use, incidents, complaints, overrides, workflow burden, downtime, vendor changes, support history, monitoring results, training gaps, and exit readiness.
- Vendor evidence and contract checkpoints can help organizations ask for change notices, support commitments, audit access, data return or deletion expectations, performance evidence, and responsibilities after updates.
- A renewal decision can continue, narrow, pause, replace, retire, or reopen validation for the AI-enabled workflow.
- Health IT, AI risk-management, and professional governance sources can define useful review questions; they do not prove any local product is safe, compliant, beneficial, or worth renewing.

## Unsafe claims

- Do not claim any named vendor, product, hospital, or health system should renew or not renew.
- Do not claim renewal review proves safety, compliance, fairness, cybersecurity readiness, patient trust, outcome improvement, or operational maturity.
- Do not imply contract terms alone solve workflow risk, clinical risk, privacy risk, security risk, or vendor dependency.
- Do not give legal advice about EHR contracts, AI contracts, FDA, ONC, HIPAA, procurement, malpractice, or professional liability.
- Do not imply every AI workflow requires the same renewal cadence or evidence burden.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- repeats recent title templates;
- cites runtime metadata;
- converts renewal review, vendor evidence, contract checkpoints, monitoring records, support history, or training updates into proof of safety, compliance, fairness, cybersecurity readiness, trust, clinical benefit, or outcome improvement;
- gives legal advice about contracts, FDA, ONC, HIPAA, malpractice, procurement, cybersecurity, or professional responsibility;
- omits the evidence-limits posture;
- omits `Selected Source Basis`;
- falls under 55 markdown lines per locale without explicit reviewer acceptance;
- writes another generic permission, fallback, transparency, intake, monitoring, exit-planning, use-creep, or workload piece instead of the renewal/continued-use problem.
