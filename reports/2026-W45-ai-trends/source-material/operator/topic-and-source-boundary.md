# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

Healthcare AI needs action boundaries before it automates work. After intake, transparency, lifecycle review, exit planning, and workload fit, the next practical question is what an AI-enabled workflow is actually allowed to do: suggest, draft, route, populate, prioritize, notify, schedule, or trigger a downstream action. Governance should distinguish recommendation from directive output, preparation from execution, and assistive drafting from authorized action.

This is an authority and permission-boundary argument, not a claim that any specific AI system is safe, compliant, effective, or ready for autonomous operation. The staged sources support disciplined questions about decision support, safeguards, access, auditability, human authorization, and accountability. They do not provide local audit logs, role-permission tests, outcome data, legal analysis, or named implementation proof.

## Primary source basis

- FDA Clinical Decision Support Software FAQ:
  https://www.fda.gov/medical-devices/software-medical-device-samd/clinical-decision-support-software-frequently-asked-questions-faqs
- FDA Clinical Decision Support Software guidance:
  https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software
- FDA Policy for Device Software Functions and Mobile Medical Applications:
  https://www.fda.gov/regulatory-information/search-fda-guidance-documents/policy-device-software-functions-and-mobile-medical-applications
- ONC / HealthIT.gov Decision Support Interventions test method:
  https://www.healthit.gov/test-method/decision-support-interventions
- HHS Security Rule and Summary of the HIPAA Security Rule:
  https://www.hhs.gov/ocr/privacy/hipaa/administrative/securityrule/index.html
  https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html
- NIST Artificial Intelligence Risk Management Framework 1.0 and AI RMF program page:
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
  https://www.nist.gov/itl/ai-risk-management-framework
- AMA augmented intelligence in medicine:
  https://www.ama-assn.org/practice-management/digital-health/augmented-intelligence-medicine
- Joint Commission and Coalition for Health AI guidance announcement on responsible AI adoption:
  https://www.jointcommission.org/en-us/knowledge-library/news/2025-09-jc-and-chai-release-initial-guidance-to-support-responsible-ai-adoption
- WHO ethics and governance of artificial intelligence for health:
  https://www.who.int/publications/i/item/9789240029200

## Required style

- Do not include any week key in the H1 title.
- Use a title frame that differs from recent frames: "Next Test Is ...", "Assurance Phase", "Show Its Work", "Operating Question", "Needs a Learning Loop", "Data Boundary Behind ...", "Has to Produce Evidence", "Needs an Exit Plan", "Transparency Only Matters If People Can Use It", "Needs a Front Door", and "Still Has to Fit the Workday".
- Prefer an action-boundary, permission-line, authority, or delegation-limit frame over another transparency, evidence, intake, learning-loop, exit-plan, or workload frame.
- Keep the report source-bounded and evidence-cautious.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep evidence warnings locale-specific: English warnings only in `report.en.md`, Chinese warnings only in `report.zh.md`.
- Avoid promotional language, vendor ranking, health-system ranking, legal advice, or claims that permission controls prove safety, compliance, privacy protection, or clinical benefit.

## Safe claims

- Healthcare AI governance should define what a tool may do, what it may only suggest, what requires human authorization, and what should never be delegated without a separate review.
- Decision-support framing is strongest when the output preserves the basis for review and does not obscure whether a human is being informed, nudged, or directed.
- Permission boundaries can include role-based access, action logging, review queues, escalation paths, override routes, fallback workflow, and change notices.
- Security, decision-support, professional, and governance sources can define review questions about access, auditability, human authorization, and accountability; they do not prove any local implementation is secure, compliant, or clinically effective.
- The same model can carry different risk depending on whether it drafts a note, places content into a record, sends a message, changes a queue, triggers a task, or influences a clinical decision.

## Unsafe claims

- Do not claim any specific healthcare AI system can safely act autonomously.
- Do not claim FDA CDS guidance, ONC DSI requirements, HIPAA Security Rule materials, NIST AI RMF, AMA policy, WHO guidance, or Joint Commission/CHAI guidance creates a complete legal answer for a local workflow.
- Do not imply role-based access, audit logs, human authorization, or escalation paths prove safety, compliance, privacy protection, cybersecurity readiness, fairness, or trust.
- Do not imply all AI workflows are regulated medical devices or certified-health-IT predictive decision support interventions.
- Do not claim that a human signature or final click necessarily means meaningful review occurred.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- repeats recent title templates;
- cites runtime metadata;
- converts permission boundaries, audit logs, security controls, human authorization, or escalation paths into proof of safety, compliance, privacy protection, or outcome improvement;
- gives legal advice about FDA, ONC, HIPAA, malpractice, procurement, or contract obligations;
- omits the evidence-limits posture;
- writes another generic transparency, intake, monitoring, exit-planning, or workload piece instead of the action-authority problem.
