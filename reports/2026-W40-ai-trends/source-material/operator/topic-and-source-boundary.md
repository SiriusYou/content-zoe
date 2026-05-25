# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

Healthcare AI is entering a measurement phase. After several weeks of governance, transparency, learning-loop, and data-boundary themes, the practical question is whether organizations can turn those duties into measured operating evidence: defined baselines, monitored drift, workflow impact review, change-control evidence, human-oversight checks, and documented response when signals move.

## Required style

- Do not include any week key in the H1 title.
- Use a title frame that differs from recent frames: "Next Test Is ...", "Assurance Phase", "Show Its Work", "Operating Question", "Needs a Learning Loop", and "Data Boundary Behind ...".
- Keep the report source-bounded and evidence-cautious.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- If using a leading doc-level warning before the H1, keep it concise and ensure the H1 itself remains clean and reader-facing.
- Avoid promotional language, vendor ranking, health-system ranking, or claims that monitoring proves safety.

## Safe claims

- Healthcare AI governance becomes more credible when policies are tied to measurable operating evidence.
- Useful evidence can include baseline performance context, workflow fit, override patterns, escalation logs, drift review, change-control records, and user feedback.
- Regulatory, professional, standards, and patient-safety guidance can define measurement questions, but they do not prove local deployment quality.
- Human oversight needs observable workflow conditions, not only a policy sentence.

## Unsafe claims

- Do not claim clinical outcomes, cost savings, compliance, privacy safety, cybersecurity readiness, fairness, safety, or patient trust are proven.
- Do not imply monitoring alone prevents harm.
- Do not treat an evaluation checklist, model card, source attribute, or change plan as proof that controls work in practice.
- Do not imply FDA device lifecycle concepts apply to every healthcare AI tool.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- repeats the recent title templates;
- cites runtime metadata;
- converts monitoring or documentation into outcome proof;
- omits the evidence-limits posture;
- treats measurement as mature across the sector rather than as a governance duty organizations still have to operationalize.
