# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

Healthcare AI has a use-creep problem. After a tool is inventoried, reviewed, tested, launched, assigned permissions, and given a fallback plan, the next practical risk is quiet expansion: a feature approved for one use case, user group, care setting, patient population, data source, or decision point starts being used for something adjacent but materially different.

This is a scope-control and expansion-review argument, not a claim that any specific AI tool is unsafe, noncompliant, beneficial, or ready for wider use. The staged sources support disciplined questions about intended use, context mapping, local validation, monitoring, source attributes, human oversight, and responsible adoption. They do not provide local utilization logs, user-behavior evidence, outcome data, patient-safety evidence, legal analysis, or named implementation proof.

## Primary source basis

- FDA Clinical Decision Support Software guidance:
  https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software
- FDA Clinical Decision Support Software FAQ:
  https://www.fda.gov/medical-devices/software-medical-device-samd/clinical-decision-support-software-frequently-asked-questions-faqs
- ONC / HealthIT.gov Decision Support Interventions test method:
  https://www.healthit.gov/test-method/decision-support-interventions
- NIST Artificial Intelligence Risk Management Framework 1.0 and AI RMF program page:
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
  https://www.nist.gov/itl/ai-risk-management-framework
- NIST AI RMF Generative AI Profile:
  https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
- Joint Commission and Coalition for Health AI guidance announcement on responsible AI adoption:
  https://www.jointcommission.org/en-us/knowledge-library/news/2025-09-jc-and-chai-release-initial-guidance-to-support-responsible-ai-adoption
- AMA augmented intelligence in medicine:
  https://www.ama-assn.org/practice-management/digital-health/augmented-intelligence-medicine
- WHO ethics and governance of artificial intelligence for health:
  https://www.who.int/publications/i/item/9789240029200
- WHO statement on safe and ethical AI for health:
  https://www.who.int/news/item/16-05-2023-who-calls-for-safe-and-ethical-ai-for-health

## Required style

- Do not include any week key in the H1 title.
- Use a title frame that differs from recent frames: "Next Test Is ...", "Assurance Phase", "Show Its Work", "Operating Question", "Needs a Learning Loop", "Data Boundary Behind ...", "Has to Produce Evidence", "Needs an Exit Plan", "Transparency Only Matters If People Can Use It", "Needs a Front Door", "Still Has to Fit the Workday", "Needs a Permission Line Before It Automates Work", and "If the Model Stops, What Keeps Moving?"
- Prefer a use-creep, scope-expansion, approved-use, spread-control, or review-trigger frame over another transparency, evidence, intake, learning-loop, exit-plan, workload, permission-boundary, or fallback-continuity frame.
- Keep the report source-bounded and evidence-cautious.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep evidence warnings locale-specific: English warnings only in `report.en.md`, Chinese warnings only in `report.zh.md`.
- Include a short `Selected Source Basis` section in both locales.
- Aim for 55-75 markdown lines per locale. Reject if the draft is under 50 lines per locale unless a reviewer explicitly accepts editorial compression.
- Avoid promotional language, vendor ranking, health-system ranking, legal advice, or claims that scope controls prove safety, compliance, fairness, patient trust, operational maturity, or clinical benefit.

## Safe claims

- Healthcare AI governance should define the approved use, user group, workflow setting, data context, population assumptions, and decision point before use expands.
- A tool can become a different governance question when it moves from one clinic to another, from one role to another, from administrative support to clinical support, from drafting to decision support, or from adult to pediatric or specialty contexts.
- Scope-expansion review can include usage monitoring, owner sign-off, change notices, local validation, training updates, fallback updates, and evidence review.
- Source attributes, intended-use descriptions, transparency records, and governance intake records can help detect use creep, but they do not prove local fit or outcome benefit.
- General-purpose tools and embedded vendor features need special attention because their actual use can expand faster than formal governance records.

## Unsafe claims

- Do not claim use creep has caused harm in a specific organization without staged evidence.
- Do not claim any specific tool, vendor, hospital, or health system has expanded use safely or unsafely.
- Do not claim FDA, ONC, NIST, WHO, AMA, Joint Commission, or CHAI materials create a complete legal answer for a local workflow.
- Do not imply that a registry, intake record, source attribute, training update, audit log, or approval workflow proves safety, compliance, fairness, privacy protection, patient trust, or operational maturity.
- Do not imply every expanded use is inappropriate. The point is that expansion should trigger review, not that all expansion is wrong.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- repeats recent title templates;
- cites runtime metadata;
- converts a registry, use-case record, source attribute, monitoring artifact, approval workflow, or training update into proof of safety, compliance, fairness, privacy protection, trust, or clinical benefit;
- gives legal advice about FDA, ONC, HIPAA, malpractice, procurement, contracting, or professional liability;
- omits the evidence-limits posture;
- omits `Selected Source Basis`;
- falls under 50 markdown lines per locale without explicit reviewer acceptance;
- writes another generic permission, fallback, transparency, intake, monitoring, exit-planning, or workload piece instead of the use-creep/scope-expansion problem.
