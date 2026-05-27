# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

Healthcare AI needs a near-miss file. Once an AI-enabled workflow is in use, governance should not wait for a confirmed patient harm event before learning from failures. Unexpected outputs, unsafe conditions, overrides, escalation failures, downtime workarounds, queue delays, wrong-context use, and cases that almost reached the patient should be captured in a reviewable record with triage, ownership, corrective action, and follow-up.

This is a patient-safety incident and near-miss governance argument. It is not a claim that any specific AI product, vendor, model, hospital, health system, or public program caused harm, avoided harm, improved safety, met legal duties, or operated unsafely. The staged sources support disciplined questions about patient safety event reporting, near misses, unsafe conditions, communication-and-resolution programs, decision-support visibility, contingency planning, lifecycle risk management, local governance, monitoring, and professional responsibility. They do not provide local incident reports, near-miss logs, patient harm investigations, legal analysis, Patient Safety Organization or Patient Safety Work Product determinations, measured outcomes, or named implementation proof.

Suggested title direction:

- Healthcare AI Needs a Near-Miss File
- Healthcare AI Safety Needs a Near-Miss Record
- Near Misses Are Part of Healthcare AI Governance

Prefer the first title unless generation produces a clearly stronger, source-bounded variant.

## Primary source basis

- AHRQ Communication and Optimal Resolution (CANDOR) toolkit:
  https://www.ahrq.gov/patient-safety/capacity/candor/index.html
- AHRQ Network of Patient Safety Databases overview:
  https://www.ahrq.gov/npsd/how-does-npsd-work/index.html
- AHRQ PSNet primer on reporting patient safety events:
  https://psnet.ahrq.gov/primer/reporting-patient-safety-events
- AHRQ PSNet primer on responding to patient safety events:
  https://psnet.ahrq.gov/primer/responding-patient-safety-events
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
- Use a title frame that differs from recent frames: "Needs an Exit Plan", "Transparency Only Matters If People Can Use It", "Needs a Front Door", "Still Has to Fit the Workday", "Needs a Permission Line Before It Automates Work", "If the Model Stops, What Keeps Moving?", "Approved for One Use Is Not Approved for the Next", "Should Re-Earn Continued Use", and "Equity Has to Be Checked Where It Is Used".
- Prefer a near-miss, incident file, unsafe-condition, patient-safety event, response-record, or corrective-action frame over another transparency, intake, workload, permission, fallback, renewal, equity, or generic learning-loop frame.
- Keep the report source-bounded and evidence-cautious.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep evidence warnings locale-specific: English warnings only in `report.en.md`, Chinese warnings only in `report.zh.md`. Locale purity is the publication invariant; warning count may vary if every warning is source-bounded and locale-pure.
- Include a short `Selected Source Basis` section in both locales.
- Aim for 75-95 markdown lines per locale. Reject if the draft is under 68 lines per locale unless a reviewer explicitly accepts editorial compression. If the draft exceeds 106 lines, review for unnecessary expansion but do not reject solely for length if the source basis and structure are strong.
- Avoid promotional language, vendor ranking, health-system ranking, legal advice, compliance claims, patient harm allegations, incident-count claims, or claims that incident reporting proves safety, compliance, harm reduction, patient trust, culture, outcome improvement, or operational maturity.

## Safe claims

- AI-enabled workflows should define what counts as a reportable incident, near miss, unsafe condition, unexpected output, wrong-context use, escalation failure, downtime workaround, or workflow delay.
- A near-miss file should connect technical traces with human workflow context: who saw the issue, where it appeared, what the user did, whether it reached the patient, what fallback or escalation occurred, and what changed afterward.
- Triage should identify severity, urgency, patient-facing impact, whether the workflow should continue, narrow, pause, or return to validation, and which owner is accountable for follow-up.
- Patient-safety reporting, CANDOR, ONC SAFER, NIST, WHO, AMA, and Joint Commission/CHAI sources can define useful review questions; they do not prove any local product is safe, unsafe, compliant, or beneficial.
- Absence of reports should not be treated as proof of absence of risk.

## Unsafe claims

- Do not claim any named vendor, product, hospital, or health system caused harm, avoided harm, concealed harm, complied with law, violated law, operated safely, or operated unsafely.
- Do not give legal advice about PSQIA, Patient Safety Organizations, Patient Safety Work Product, malpractice, FDA reporting, ONC certification, HIPAA, civil rights, procurement, disclosure, privilege, or professional liability.
- Do not claim incident reporting, near-miss reporting, technical logs, dashboards, corrective actions, communication records, or committee review prove safety, compliance, harm reduction, patient trust, safety culture, outcome improvement, or operational maturity.
- Do not imply absence of reported events proves absence of incidents.
- Do not invent local incident counts, near-miss examples, patient stories, root-cause findings, downtime events, vendor notices, or corrective-action results.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- repeats recent title templates;
- cites runtime metadata;
- converts incident reporting, near-miss files, technical traces, dashboards, corrective actions, communication records, or committee review into proof of safety, compliance, harm reduction, patient trust, culture, outcome improvement, or operational maturity;
- gives legal advice or legal conclusions;
- omits the evidence-limits posture;
- omits `Selected Source Basis`;
- falls under 68 markdown lines per locale without explicit reviewer acceptance;
- loses the near-miss and patient-safety event record angle.
