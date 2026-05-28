# Topic and source boundary

## Intended reader-facing angle

The article should focus on this thesis:

Healthcare AI should make uncertainty visible in a reader-usable way. A score, flag, draft, recommendation, summary, or ranking can look more settled than the available evidence supports. An uncertainty label can help readers see what the output is based on, what it leaves out, what context may change interpretation, when human review is needed, and where fallback or escalation should begin.

This is a source-bounded governance, communication, and workflow-fit argument. It is not a claim that any named hospital, health system, vendor, product, public program, or regulator uses a particular uncertainty label. It is not legal advice, a clinical practice rule, a product-safety claim, a compliance checklist, or a statistical-calibration standard. The source basis supports disciplined questions about transparency, documentation, human oversight, risk management, monitoring, workflow fit, decision-support visibility, and responsible adoption. It does not provide local model-performance results, calibration curves, patient outcomes, audit trails, legal conclusions, or named implementation proof.

Suggested title direction:

- Healthcare AI Needs an Uncertainty Label
- Healthcare AI Should Mark Its Uncertainty
- Healthcare AI Should Say What It Does Not Know

Prefer the first title unless generation produces a clearly stronger, source-bounded variant.

## Primary source basis

- NIST AI Risk Management Framework 1.0 and AI RMF program page:
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
  https://www.nist.gov/itl/ai-risk-management-framework
- NIST AI RMF Core / AI Resource Center, including govern, map, measure, manage, documentation, human-centered risk, transparency, monitoring, and risk communication concepts:
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
- The article must describe the uncertainty-label idea only. It must not describe non-reader operational details.
- Use a title frame that differs from recent frames: "Starts the Year With a Review Queue", "Needs an Owner Before It Needs a Score", "Should Carry a Review Date", "Needs a Disagreement Path", "Needs a Handoff Note", and "Workarounds Are Governance Signals".
- Prefer an uncertainty-label, limits-of-output, missing-context, review-trigger, fallback, or escalation frame over another queue, owner, review-date, disagreement, handoff, workaround, inventory, permission, change-control, equity, near-miss, or generic monitoring frame.
- Keep the article source-bounded and evidence-cautious.
- When discussing evidence limits in public prose, use phrases such as "the source basis" or "available governance sources".
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep evidence warnings locale-specific: English warnings only in `report.en.md`, Chinese warnings only in `report.zh.md`. Locale purity is the publication invariant; warning count may vary if every warning is source-bounded and locale-pure.
- Include a short `Selected Source Basis` section in both locales.
- In `Selected Source Basis`, list only public source families by name, such as NIST AI RMF, ONC SAFER, ONC decision-support intervention material, WHO, AMA, Joint Commission/CHAI, and bounded FDA AI/ML device context.
- Aim for 75-95 markdown lines per locale. Reject if the article is under 68 lines per locale unless a reviewer explicitly accepts editorial compression. If the article exceeds 106 lines, review for unnecessary expansion but do not reject solely for length if the source basis and structure are strong.
- Avoid promotional language, vendor ranking, health-system ranking, legal advice, compliance claims, maturity scoring, completeness claims, product-safety claims, or claims that an uncertainty label proves safety, compliance, effectiveness, fairness, trust, outcome improvement, continuity, or operational maturity.

## Safe claims

- Healthcare AI outputs can appear more certain than the available evidence supports when limits, missing context, review triggers, or fallback routes are not visible.
- An uncertainty label can help readers see what the output is based on, what it does not know, what local context may matter, and when a person should review before acting.
- Useful uncertainty-label fields can include output purpose, intended user, decision point, evidence basis, missing context, confidence qualifier, known limitation, last review signal, review trigger, fallback route, escalation route, and owner group when those fields exist.
- An uncertainty label can help route questions about workflow fit, evidence gaps, monitoring, human oversight, fallback, and escalation, but it does not prove that the AI-enabled workflow is safe, compliant, effective, fair, trusted, outcome-improving, or locally validated.
- NIST AI RMF, ONC SAFER, ONC decision-support intervention material, WHO, AMA, Joint Commission/CHAI, and bounded FDA device-context sources can support risk-communication and monitoring questions; they do not prove any local uncertainty label exists or works.
- Unknown or missing uncertainty information should remain visible as a review question rather than being treated as proof that the output is reliable.

## Unsafe claims

- Do not claim any named vendor, product, hospital, health system, regulator, or public program has or lacks a sufficient uncertainty-label process.
- Do not claim that an uncertainty label, confidence score, dashboard field, owner field, review trigger, documentation field, fallback route, or escalation path satisfies law, regulation, accreditation, certification, or contractual duties.
- Do not give legal advice about FDA, ONC certification, HIPAA, procurement, civil rights, malpractice, cybersecurity, disclosure, informed consent, labor, or professional liability.
- Do not claim an uncertainty label proves safety, compliance, effectiveness, fairness, patient trust, outcome improvement, resilience, continuity, or operational maturity.
- Do not invent local calibration results, accuracy rates, confidence thresholds, uncertainty scores, review dates, audit findings, utilization trends, validation results, incidents, risk tiers, owner names, or named implementation facts.
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
- turns an uncertainty label, confidence score, dashboard field, owner field, review trigger, risk tier, documentation field, fallback route, or escalation label into proof of safety, compliance, effectiveness, fairness, patient trust, outcome improvement, resilience, continuity, or maturity;
- gives legal advice or legal conclusions;
- implies FDA device context covers every healthcare AI workflow;
- omits the evidence-limits posture;
- omits `Selected Source Basis`;
- names anything other than public source families in `Selected Source Basis`;
- falls under 68 markdown lines per locale without explicit reviewer acceptance;
- loses the uncertainty-label / source-limit / review-trigger angle.
