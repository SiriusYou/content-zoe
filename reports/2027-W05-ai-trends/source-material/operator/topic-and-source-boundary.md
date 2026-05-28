# Topic and source boundary

## Intended reader-facing angle

The article should focus on this thesis:

Healthcare AI outputs need handoff context. A model-enabled recommendation, flag, score, summary, or alert may be created in one part of a workflow but acted on by another person, team, shift, or setting. If the output travels without its use boundary, intended user, confidence limits, evidence gaps, fallback contact, and escalation route, the next user may inherit a label without understanding what it means, what it does not mean, and what to do when it does not fit.

This is a handoff-context, workflow-transfer, and actionability argument. It is not a claim that any named hospital, health system, vendor, product, public program, or regulator uses a particular handoff model. It is not legal advice, a clinical handoff rule, a product-safety claim, or a compliance checklist. The source basis supports disciplined questions about documentation, workflow fit, decision-support visibility, human oversight, monitoring, contingency planning, governance roles, escalation, and responsible adoption. It does not provide local handoff logs, audit trails, legal conclusions, measured outcomes, or named implementation proof.

Suggested title direction:

- Healthcare AI Needs a Handoff Note
- Healthcare AI Outputs Need Context When They Travel
- Healthcare AI Should Not Travel Without Context

Prefer the first title unless generation produces a clearly stronger, source-bounded variant.

## Primary source basis

- NIST AI Risk Management Framework 1.0 and AI RMF program page:
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
  https://www.nist.gov/itl/ai-risk-management-framework
- NIST AI RMF Core / AI Resource Center, including govern, map, measure, manage, documentation, accountability, monitoring, and human-centered risk concepts:
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
- The article must describe the handoff-context idea only. It must not describe non-reader operational details.
- Use a title frame that differs from recent frames: "Needs an Exit Plan", "Transparency Only Matters If People Can Use It", "Needs a Front Door", "Still Has to Fit the Workday", "Needs a Permission Line Before It Automates Work", "If the Model Stops, What Keeps Moving?", "Approved for One Use Is Not Approved for the Next", "Should Re-Earn Continued Use", "Equity Has to Be Checked Where It Is Used", "Needs a Near-Miss File", "Updates Should Leave a Change Record", "You Cannot Govern Healthcare AI You Cannot Find", "Needs a Carry-Forward File", "Starts the Year With a Review Queue", "Needs an Owner Before It Needs a Score", "Should Carry a Review Date", and "Needs a Disagreement Path".
- Prefer a handoff-context, travel-with-context, receiving-user, output-transfer, shift-change, or actionability frame over another queue, owner, review-date, disagreement, inventory, carry-forward, transparency, intake, workload, permission, fallback, equity, near-miss, change-control, or generic monitoring frame.
- Keep the article source-bounded and evidence-cautious.
- When discussing evidence limits in public prose, use phrases such as "the source basis" or "available governance sources".
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep evidence warnings locale-specific: English warnings only in `report.en.md`, Chinese warnings only in `report.zh.md`. Locale purity is the publication invariant; warning count may vary if every warning is source-bounded and locale-pure.
- Include a short `Selected Source Basis` section in both locales.
- In `Selected Source Basis`, list only public source families by name, such as NIST AI RMF, ONC SAFER, ONC decision-support intervention material, WHO, AMA, Joint Commission/CHAI, and bounded FDA AI/ML device context.
- Aim for 75-95 markdown lines per locale. Reject if the article is under 68 lines per locale unless a reviewer explicitly accepts editorial compression. If the article exceeds 106 lines, review for unnecessary expansion but do not reject solely for length if the source basis and structure are strong.
- Avoid promotional language, vendor ranking, health-system ranking, legal advice, compliance claims, maturity scoring, completeness claims, product-safety claims, or claims that a handoff note proves safety, compliance, effectiveness, fairness, patient trust, outcome improvement, continuity, or operational maturity.

## Safe claims

- A handoff note can make AI-enabled outputs easier to interpret by carrying the use boundary, intended user, output purpose, evidence limits, fallback contact, escalation route, and unresolved questions when those fields exist.
- Handoff context should connect to actual workflow use, not only to a model name, vendor name, dashboard field, or output value.
- Useful handoff fields can include output purpose, intended receiver, reviewed use boundary, current owner, timestamp, source attributes, evidence gaps, monitoring responsibility, fallback contact, escalation route, and next action when those fields exist.
- A handoff note can help reveal missing context, changed setting, user mismatch, unresolved ownership, monitoring concerns, or evidence gaps, but it does not prove that the workflow is safe, compliant, effective, fair, trusted, mature, or outcome-improving.
- NIST AI RMF, ONC SAFER, ONC decision-support intervention material, WHO, AMA, Joint Commission/CHAI, and bounded FDA device-context sources can support handoff-context and documentation questions; they do not prove any local handoff record is complete or correct.
- Unknown, stale, or missing handoff context should remain visible rather than being treated as evidence that the output is ready for use.

## Unsafe claims

- Do not claim any named vendor, product, hospital, health system, regulator, or public program has or lacks a sufficient AI handoff model.
- Do not claim that a handoff note, dashboard field, summary field, owner field, committee review, documentation field, or escalation path satisfies law, regulation, accreditation, certification, or contractual duties.
- Do not give legal advice about FDA, ONC certification, HIPAA, procurement, civil rights, malpractice, cybersecurity, disclosure, informed consent, or professional liability.
- Do not claim a handoff note proves safety, compliance, effectiveness, fairness, patient trust, outcome improvement, resilience, continuity, or operational maturity.
- Do not invent local handoff logs, shift-change practices, committee names, owner names, review dates, audit findings, utilization trends, validation results, incidents, risk tiers, or named implementation facts.
- Do not present FDA AI/ML-enabled device context as the whole healthcare AI landscape.
- Do not cite non-public process records as reader sources.
- Evidence-limit language should focus on what the source basis can and cannot prove. Use public-facing phrases such as "the source basis" and "available governance sources".

## Publication gate

Reject or restage if the article:

- uses only job metadata or generated context as evidence;
- includes any calendar key in the H1;
- mentions non-reader operational details;
- repeats recent title templates;
- cites non-public process records;
- turns a handoff note, dashboard field, summary field, committee review, owner field, risk tier, documentation field, or escalation label into proof of safety, compliance, effectiveness, fairness, patient trust, outcome improvement, resilience, continuity, or maturity;
- gives legal advice or legal conclusions;
- implies FDA device context covers every healthcare AI workflow;
- omits the evidence-limits posture;
- omits `Selected Source Basis`;
- names anything other than public source families in `Selected Source Basis`;
- falls under 68 markdown lines per locale without explicit reviewer acceptance;
- loses the handoff-context / output-transfer angle.
