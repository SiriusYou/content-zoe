# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

Healthcare AI has to pass a workload test. After intake, transparency, monitoring, and exit planning, a practical adoption question remains: can clinicians, staff, patients, and oversight teams actually use the AI-enabled workflow without adding unmanaged attention load, alert fatigue, documentation burden, training gaps, or ambiguous human-review expectations?

This is a human-factors and workflow-fit argument, not a claim that a specific AI tool is safe, effective, usable, or beneficial. The staged sources support the need to evaluate how people interact with technology in real use environments. They do not provide local workload measurements, usability-test results, patient outcomes, or named implementation proof.

## Primary source basis

- FDA human factors and medical devices:
  https://www.fda.gov/medical-devices/device-advice-comprehensive-regulatory-assistance/human-factors-and-medical-devices
- FDA human factors considerations:
  https://www.fda.gov/medical-devices/human-factors-and-medical-devices/human-factors-considerations
- FDA guidance on applying human factors and usability engineering to medical devices:
  https://www.fda.gov/regulatory-information/search-fda-guidance-documents/applying-human-factors-and-usability-engineering-medical-devices
- AHRQ PSNet alert fatigue primer:
  https://psnet.ahrq.gov/primer/alert-fatigue
- AMA augmented intelligence in medicine:
  https://www.ama-assn.org/practice-management/digital-health/augmented-intelligence-medicine
- NIST AI Risk Management Framework 1.0 and AI RMF program page:
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
  https://www.nist.gov/itl/ai-risk-management-framework
- ONC Decision Support Interventions test method:
  https://www.healthit.gov/test-method/decision-support-interventions
- Joint Commission and Coalition for Health AI guidance announcement on responsible AI adoption:
  https://www.jointcommission.org/en-us/knowledge-library/news/2025-09-jc-and-chai-release-initial-guidance-to-support-responsible-ai-adoption
- WHO ethics and governance of artificial intelligence for health:
  https://www.who.int/publications/i/item/9789240029200

## Required style

- Do not include any week key in the H1 title.
- Use a title frame that differs from recent frames: "Next Test Is ...", "Assurance Phase", "Show Its Work", "Operating Question", "Needs a Learning Loop", "Data Boundary Behind ...", "Has to Produce Evidence", "Needs an Exit Plan", "Transparency Only Matters If People Can Use It", and "Needs a Front Door".
- Prefer a workload, human-factors, workday-fit, or attention-budget frame over another transparency, evidence, intake, learning-loop, or exit-plan frame.
- Keep the report source-bounded and evidence-cautious.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep evidence warnings locale-specific: English warnings only in `report.en.md`, Chinese warnings only in `report.zh.md`.
- Avoid promotional language, vendor ranking, health-system ranking, or claims that workflow review proves safety.

## Safe claims

- Healthcare AI governance should evaluate how tools affect real work, not only whether documentation exists.
- Human-factors review can ask who uses the tool, where it appears, what information the user sees, how much time and authority the user has, and what happens when the output is wrong or unclear.
- Alert fatigue and attention load are relevant cautionary examples for AI-mediated decision support and workflow prompts.
- FDA human-factors materials are strongest for medical-device contexts and should be used as a disciplined example, not generalized to every AI workflow.
- AMA materials support an assistive framing for AI and continued attention to physician workflow, training, and responsibility.
- NIST AI RMF, WHO, ONC, and Joint Commission/CHAI materials support governance, local validation, monitoring, and lifecycle questions; they do not prove local usability or benefit.

## Unsafe claims

- Do not claim a specific AI tool reduces burden, improves safety, improves outcomes, improves productivity, reduces alert fatigue, or increases trust unless staged evidence specifically supports it.
- Do not imply human-factors methods prove safety, effectiveness, fairness, compliance, privacy safety, cybersecurity readiness, clinical benefit, or patient trust.
- Do not imply FDA device human-factors guidance applies to all healthcare AI tools.
- Do not imply every AI output requires the same type of clinician review.
- Do not claim an organization has measured workload, usability, training adequacy, or oversight capacity without staged local evidence.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- repeats recent title templates;
- cites runtime metadata;
- converts human-factors review, training, usability, or workflow design into proof of safety or maturity;
- treats AI burden reduction as established fact rather than as a claim requiring local measurement;
- omits the evidence-limits posture;
- writes another generic transparency, intake, monitoring, or exit-planning piece instead of the workday/workload problem.
