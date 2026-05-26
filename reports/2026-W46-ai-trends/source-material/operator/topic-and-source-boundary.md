# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

Healthcare AI is only ready when the fallback works. After governance has defined intake, transparency, workload fit, action authority, and exit controls, the next operational question is continuity: what happens when the AI feature, EHR capability, interface, model service, data feed, vendor platform, or network path is unavailable, degraded, or intentionally disabled?

This is a downtime, fallback, and continuity-of-care argument, not a claim that any specific AI workflow is resilient, safe, compliant, or ready for degraded-mode operation. The staged sources support disciplined questions about EHR unavailability, contingency planning, criticality, backup and recovery, emergency-mode operations, system interfaces, and local responsibilities. They do not provide local downtime drills, incident logs, recovery-time measurements, patient outcomes, legal analysis, or named implementation proof.

## Primary source basis

- ONC / HealthIT.gov 2025 SAFER Guides:
  https://healthit.gov/clinical-quality-and-safety/safer-guides/
- ONC 2025 SAFER Guide: Contingency Planning:
  https://healthit.gov/resources/2025-safer-guide-contingency-planning/
- ONC SAFER Contingency Planning PDF:
  https://www.healthit.gov/wp-content/uploads/2025/06/SAFER-Guide-2.-Contingency-Planning-Final.pdf
- ONC / HealthIT.gov Selecting or Upgrading Health IT:
  https://www.healthit.gov/topic/safety/selecting-or-upgrading-health-it
- HHS HIPAA Security Rule:
  https://www.hhs.gov/ocr/privacy/hipaa/administrative/securityrule/index.html
- HHS Summary of the HIPAA Security Rule:
  https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html
- HHS Fact Sheet: Ransomware and HIPAA:
  https://www.hhs.gov/hipaa/for-professionals/security/guidance/cybersecurity/ransomware-fact-sheet/index.html
- NIST Artificial Intelligence Risk Management Framework 1.0 and AI RMF program page:
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
  https://www.nist.gov/itl/ai-risk-management-framework
- Joint Commission and Coalition for Health AI guidance announcement on responsible AI adoption:
  https://www.jointcommission.org/en-us/knowledge-library/news/2025-09-jc-and-chai-release-initial-guidance-to-support-responsible-ai-adoption

## Required style

- Do not include any week key in the H1 title.
- Use a title frame that differs from recent frames: "Next Test Is ...", "Assurance Phase", "Show Its Work", "Operating Question", "Needs a Learning Loop", "Data Boundary Behind ...", "Has to Produce Evidence", "Needs an Exit Plan", "Transparency Only Matters If People Can Use It", "Needs a Front Door", "Still Has to Fit the Workday", and "Needs a Permission Line Before It Automates Work".
- Prefer a fallback, manual-mode, downtime, continuity, degraded-operation, or resilience frame over another transparency, evidence, intake, learning-loop, exit-plan, workload, or permission-boundary frame.
- Keep the report source-bounded and evidence-cautious.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep evidence warnings locale-specific: English warnings only in `report.en.md`, Chinese warnings only in `report.zh.md`.
- Avoid promotional language, vendor ranking, health-system ranking, legal advice, or claims that fallback planning proves safety, compliance, cybersecurity readiness, continuity, or clinical benefit.

## Safe claims

- Healthcare AI governance should define how work continues when an AI-enabled workflow is unavailable, degraded, disconnected, or paused.
- Contingency planning should ask which data, decisions, messages, queues, orders, summaries, and handoffs become harder when an AI or EHR-dependent function is unavailable.
- Manual-mode plans should specify who switches modes, who communicates the change, what information is still available, what must be deferred, what must continue, and how work is reconciled after recovery.
- Interface, data-feed, model-service, vendor-platform, and network dependencies can create continuity risk even when the AI model itself has not changed.
- Health IT safety, security, and AI governance sources can define useful continuity questions; they do not prove any local downtime process is tested, safe, compliant, or effective.

## Unsafe claims

- Do not claim any specific healthcare AI workflow is resilient, highly available, safe in downtime, compliant, cybersecurity-ready, or clinically beneficial.
- Do not claim ONC SAFER Guides, HHS Security Rule materials, HHS ransomware guidance, NIST AI RMF, or Joint Commission/CHAI guidance create a complete legal or operational answer for a local workflow.
- Do not imply a contingency plan, backup plan, downtime binder, manual workaround, or recovery procedure proves continuity of care.
- Do not imply all AI downtime is an EHR outage, all EHR downtime is caused by AI, or every AI workflow handles protected health information.
- Do not treat a fallback as adequate without staged evidence that staff can find it, use it, reconcile it, and return safely to normal operation.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- repeats recent title templates;
- cites runtime metadata;
- converts fallback planning, backups, contingency procedures, downtime drills, interface controls, or recovery plans into proof of safety, compliance, cybersecurity readiness, continuity, or outcome improvement;
- gives legal advice about HIPAA, FDA, ONC, malpractice, procurement, contracting, cybersecurity, or emergency operations;
- omits the evidence-limits posture;
- writes another generic permission, transparency, intake, monitoring, exit-planning, or workload piece instead of the fallback/continuity problem.
