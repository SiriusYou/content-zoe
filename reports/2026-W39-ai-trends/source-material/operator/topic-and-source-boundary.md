# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

Healthcare AI trust is moving to the data boundary. The practical question is no longer only whether a model performs well in a test setting, but whether the organization can explain what data is used, how source attributes and limitations are surfaced, who can reuse or transfer data, how vendors are constrained, and how patients or clinicians can question AI-mediated work.

## Required style

- Do not include any week key in the H1 title.
- Use a title frame that differs from recent frames: "Next Test Is ...", "Assurance Phase", "Show Its Work", "Operating Question", and "Needs a Learning Loop".
- Keep the report source-bounded and evidence-cautious.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- If using a leading doc-level warning before the H1, keep it concise and ensure the H1 itself remains clean and reader-facing.
- Avoid promotional language, vendor ranking, health-system ranking, or claims that documentation proves trust.

## Safe claims

- Responsible healthcare AI increasingly depends on data stewardship, not only model selection.
- Source attributes, patient transparency, secondary-use controls, vendor access limits, and feedback routes are connected trust duties.
- Federal, standards, professional, and health-system guidance can define better governance questions, but they do not prove local safety, fairness, security, or outcomes.
- Patient-facing trust requires clear communication and accountability routes, not only internal policy.

## Unsafe claims

- Do not claim clinical outcomes, cost savings, compliance, privacy safety, cybersecurity readiness, fairness, or patient trust are proven.
- Do not say patients consented, understood, or benefited unless a staged source specifically says so.
- Do not imply de-identification eliminates all risk.
- Do not treat transparency labels, source attributes, model cards, or certification language as proof of implementation quality.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- repeats the recent title templates;
- cites runtime metadata;
- turns guidance into proof of outcomes, compliance, or trust;
- omits the evidence-limits posture;
- treats data-use disclosure as equivalent to patient consent or patient understanding.
