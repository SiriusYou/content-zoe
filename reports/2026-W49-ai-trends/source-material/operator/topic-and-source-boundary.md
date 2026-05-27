# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

Healthcare AI equity has to be checked where the tool is used. A vendor fairness statement, model-card attribute list, or prelaunch validation packet is not enough to show what happens inside a local care workflow. After the recent series on exit plans, transparency, intake, workflow fit, permission boundaries, continuity, approved use, and renewal, this beat should ask whether the tool creates different help, burden, delay, escalation, or exclusion for different patient groups and care settings.

This is a local equity review argument. It is not a claim that any specific AI product, vendor, model, hospital, health system, or public program is fair, unfair, discriminatory, compliant, noncompliant, safe, unsafe, effective, or ineffective. The staged sources support disciplined questions about nondiscrimination risk, decision support, source attributes, lifecycle risk management, governance, patient protection, professional responsibility, and local monitoring. They do not provide local subgroup performance data, utilization logs, patient outcomes, complaint records, legal analysis, named implementation proof, or a basis for legal conclusions.

Suggested title direction:

- Healthcare AI Equity Has to Be Checked Where It Is Used
- Fairness Has to Survive the Workflow
- Healthcare AI Fairness Is a Local Operating Question

Prefer the first title unless generation produces a clearly stronger, source-bounded variant.

## Primary source basis

- eCFR 45 CFR 92.210, Nondiscrimination in the use of patient care decision support tools:
  https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-A/part-92/subpart-C/section-92.210
- HHS Office for Civil Rights Section 1557 nondiscrimination overview:
  https://www.hhs.gov/civil-rights/for-individuals/section-1557/index.html
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
- Use a title frame that differs from recent frames: "Needs an Exit Plan", "Transparency Only Matters If People Can Use It", "Needs a Front Door", "Still Has to Fit the Workday", "Needs a Permission Line Before It Automates Work", "If the Model Stops, What Keeps Moving?", "Approved for One Use Is Not Approved for the Next", and "Should Re-Earn Continued Use".
- Prefer a local equity, subgroup review, access-burden, or workflow-fairness frame over another transparency, intake, workload, permission, fallback, use-creep, or renewal frame.
- Keep the report source-bounded and evidence-cautious.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep evidence warnings locale-specific: English warnings only in `report.en.md`, Chinese warnings only in `report.zh.md`.
- Include a short `Selected Source Basis` section in both locales.
- Aim for 75-95 markdown lines per locale. Reject if the draft is under 65 lines per locale unless a reviewer explicitly accepts editorial compression. If the draft exceeds 105 lines, review for unnecessary expansion but do not reject solely for length if the source basis and structure are strong.
- Avoid promotional language, vendor ranking, health-system ranking, legal advice, compliance claims, demographic outcome proof, or claims that equity review proves fairness, safety, compliance, patient trust, clinical benefit, or operational maturity.

## Safe claims

- Local equity review should define the local population, subgroup questions, care settings, access pathways, language and disability needs, data availability, workflow effects, and escalation route.
- Source attributes and demographic variables can make some risks visible, but they do not prove fairness.
- Local validation and monitoring should ask whether behavior, burden, delay, escalation, override patterns, false positives, false negatives, or access friction differ across groups or settings.
- Accessibility, language, health-literacy, and digital-access constraints matter because an AI workflow can shift burden even when the model output looks unchanged.
- Feedback, complaint, appeal, recourse, and human-review channels are evidence inputs, not proof that the system is equitable.
- HHS, ONC, NIST, WHO, AMA, and Joint Commission/CHAI sources can define useful review questions; they do not prove any local product is fair, compliant, safe, or beneficial.

## Unsafe claims

- Do not claim any named vendor, product, hospital, or health system is fair, unfair, discriminatory, compliant, noncompliant, safe, unsafe, effective, ineffective, or trustworthy.
- Do not give legal advice about Section 1557, patient care decision support tools, FDA, ONC certification, HIPAA, malpractice, procurement, civil rights, or professional responsibility.
- Do not claim demographic parity, source-attribute review, model cards, representative data, bias mitigation, audits, monitoring dashboards, or complaint processes prove fairness.
- Do not imply every group has the same risk or every AI workflow requires the same subgroup metrics.
- Do not invent local subgroup metrics, outcome gaps, complaint patterns, patient stories, implementation sites, or enforcement facts.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- repeats recent title templates;
- cites runtime metadata;
- converts subgroup review, source attributes, accessibility review, language review, monitoring, feedback, recourse, mitigation records, or governance ownership into proof of fairness, safety, compliance, patient trust, clinical benefit, or operational maturity;
- gives legal advice or legal conclusions;
- omits the evidence-limits posture;
- omits `Selected Source Basis`;
- falls under 65 markdown lines per locale without explicit reviewer acceptance;
- loses the local equity and access-burden angle.
