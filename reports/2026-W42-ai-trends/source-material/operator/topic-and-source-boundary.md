# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

Healthcare AI transparency is becoming an operating requirement, not a disclosure slogan. The practical question is whether clinicians, patients, administrators, and governance teams can see enough about an AI-enabled workflow to understand its intended use, source attributes, evidence limits, local fit, monitoring needs, and escalation path.

## Primary source basis

- FDA, Health Canada, and MHRA transparency guiding principles for machine learning-enabled medical devices:
  https://www.fda.gov/medical-devices/software-medical-device-samd/transparency-machine-learning-enabled-medical-devices-guiding-principles
- FDA AI-enabled medical devices list and list limitations:
  https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices
- ONC HTI-1 final rule page for algorithm transparency:
  https://www.healthit.gov/topic/laws-regulation-and-policy/health-data-technology-and-interoperability-certification-program
- HealthIT.gov decision support interventions test method:
  https://www.healthit.gov/test-method/decision-support-interventions
- NIST AI Risk Management Framework 1.0:
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
- WHO ethics and governance of artificial intelligence for health:
  https://www.who.int/publications/i/item/9789240029200

## Required style

- Do not include any week key in the H1 title.
- Use a title frame that differs from recent frames: "Next Test Is ...", "Assurance Phase", "Show Its Work", "Operating Question", "Needs a Learning Loop", "Data Boundary Behind ...", "Has to Produce Evidence", and "Needs an Exit Plan".
- Keep the report source-bounded and evidence-cautious.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- If using a leading doc-level warning before the H1, keep it concise and ensure the H1 itself remains clean and reader-facing.
- Avoid promotional language, vendor ranking, health-system ranking, or claims that transparency proves safety.

## Safe claims

- Transparency is more useful when it explains intended use, intended users, workflow context, data and performance limits, monitoring status, and escalation path.
- FDA/Health Canada/MHRA transparency guidance for ML-enabled medical devices supports communicating information to relevant audiences across the product lifecycle.
- ONC HTI-1 creates certified-health-IT transparency expectations for decision support interventions, including source attributes and risk management practices for predictive DSIs supplied by the health IT developer.
- FDA's AI-enabled medical device list can support public visibility, but the FDA states the list is not comprehensive and public summaries are not all-inclusive.
- NIST AI RMF supports governance, mapping, measurement, and management as lifecycle risk-management functions.

## Unsafe claims

- Do not claim transparency proves safety, effectiveness, fairness, clinical outcome improvement, privacy safety, cybersecurity readiness, or patient trust.
- Do not imply every healthcare AI tool is an FDA-regulated medical device or an ONC-certified predictive DSI.
- Do not claim a specific organization has achieved usable transparency unless staged evidence names it and supports it.
- Do not present public device-list inclusion as a complete evidence file.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- repeats the recent title templates;
- cites runtime metadata;
- converts transparency, source attributes, labels, or device-list entries into proof of real-world performance;
- omits the evidence-limits posture;
- treats transparency as mature across the sector rather than as an operating duty organizations still have to make usable.
