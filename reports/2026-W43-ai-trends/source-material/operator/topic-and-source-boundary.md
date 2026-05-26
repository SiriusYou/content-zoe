# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

Healthcare AI needs an intake layer before it can have credible governance. Transparency, monitoring, exit planning, and local validation all depend on a more basic operating question: can the organization identify an AI-enabled use case, classify what kind of tool it is, route it to the right review path, assign an accountable owner, and define what evidence is needed before people rely on it?

This is not a claim that intake proves safety. It is a claim that without intake, organizations cannot reliably know which AI tools are in use, which rules or frameworks may apply, which workflows are affected, what data or vendor dependencies exist, or who owns follow-up.

## Primary source basis

- NIST AI Risk Management Framework 1.0 and AI RMF program page:
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
  https://www.nist.gov/itl/ai-risk-management-framework
- WHO ethics and governance of artificial intelligence for health:
  https://www.who.int/publications/i/item/9789240029200
- ONC HTI-1 final rule and Decision Support Interventions test method:
  https://www.healthit.gov/topic/laws-regulation-and-policy/health-data-technology-and-interoperability-certification-program
  https://www.healthit.gov/test-method/decision-support-interventions
- FDA AI-enabled medical device materials:
  https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices
  https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-software-medical-device
- FDA, Health Canada, and MHRA predetermined-change-control-plan guiding principles for machine-learning-enabled medical devices:
  https://www.fda.gov/medical-devices/software-medical-device-samd/predetermined-change-control-plans-machine-learning-enabled-medical-devices-guiding-principles
- Joint Commission and Coalition for Health AI guidance announcement on responsible AI adoption:
  https://www.jointcommission.org/en-us/knowledge-library/news/2025-09-jc-and-chai-release-initial-guidance-to-support-responsible-ai-adoption
- AMA augmented intelligence in medicine:
  https://www.ama-assn.org/practice-management/digital-health/augmented-intelligence-medicine
- Health Sector Coordinating Council third-party AI risk guide:
  https://healthsectorcouncil.org/wp-content/uploads/2026/04/AI-Third-Party-Risk-Guide.pdf

## Required style

- Do not include any week key in the H1 title.
- Use a title frame that differs from recent frames: "Next Test Is ...", "Assurance Phase", "Show Its Work", "Operating Question", "Needs a Learning Loop", "Data Boundary Behind ...", "Has to Produce Evidence", "Needs an Exit Plan", and "Transparency Only Matters If People Can Use It".
- Prefer an intake/front-door/routing frame over another transparency, evidence, learning-loop, or exit-plan frame.
- Keep the report source-bounded and evidence-cautious.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Avoid promotional language, vendor ranking, health-system ranking, or claims that intake proves maturity.

## Safe claims

- Healthcare AI governance starts earlier when organizations can intake and classify AI-enabled use cases before deployment.
- Intake records can capture intended use, user group, workflow context, data sensitivity, vendor dependence, regulatory category, human oversight expectations, and local owner.
- NIST AI RMF supports mapping context and managing risk across the lifecycle, but it is voluntary and not healthcare-specific by itself.
- ONC HTI-1 and Decision Support Intervention materials support structured transparency and risk-management practices for covered certified-health-IT contexts; they do not cover every healthcare AI tool.
- FDA AI-enabled device materials help route regulated medical-device software, but many healthcare AI tools are not device software.
- Third-party AI risk guidance supports discovery, contract, monitoring, and escalation questions when AI enters through vendors or embedded tools.
- Intake can make later transparency, validation, monitoring, and retirement decisions more actionable.

## Unsafe claims

- Do not claim intake proves safety, effectiveness, fairness, compliance, cybersecurity readiness, privacy safety, clinical benefit, or patient trust.
- Do not imply every healthcare AI tool is an FDA-regulated device or an ONC-covered predictive DSI.
- Do not claim an organization has a complete AI inventory, mature intake process, or audited governance program unless staged evidence names and supports it.
- Do not claim a vendor or health system is safe, unsafe, compliant, or noncompliant.
- Do not turn a checklist, intake form, model card, certification record, public device-list entry, or contract term into proof of real-world performance.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- repeats the recent title templates;
- cites runtime metadata;
- turns intake, classification, or governance routing into proof of safety or maturity;
- treats FDA, ONC, NIST, WHO, AMA, CHAI, Joint Commission, or HSCC materials as applying uniformly to all healthcare AI tools;
- omits the evidence-limits posture;
- writes another generic transparency or monitoring piece instead of the front-door/intake problem.
