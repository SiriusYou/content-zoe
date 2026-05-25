# Topic and source boundary

## Intended reader-facing angle

The report should focus on this thesis:

Healthcare AI governance is incomplete without an exit plan. After organizations define baselines, monitoring, and accountability records, the next practical question is whether they can limit, pause, retire, or replace an AI-mediated workflow when evidence, context, vendor support, or operational fit changes.

## Required style

- Do not include any week key in the H1 title.
- Use a title frame that differs from recent frames: "Next Test Is ...", "Assurance Phase", "Show Its Work", "Operating Question", "Needs a Learning Loop", "Data Boundary Behind ...", and "Has to Produce Evidence".
- Keep the report source-bounded and evidence-cautious.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- If using a leading doc-level warning before the H1, keep it concise and ensure the H1 itself remains clean and reader-facing.
- Avoid promotional language, vendor ranking, health-system ranking, or claims that retirement discipline proves safety.

## Safe claims

- Healthcare AI lifecycle governance needs off-ramps, not only launch controls.
- Pause, rollback, retirement, and replacement criteria make monitoring more operationally meaningful.
- Portfolio inventories and ownership records help organizations know which tools remain active, limited, suspended, or retired.
- Vendor exit and model end-of-life planning are trust and resilience issues, but they do not prove any vendor is safe or unsafe.

## Unsafe claims

- Do not claim clinical outcomes, cost savings, compliance, privacy safety, cybersecurity readiness, fairness, safety, effectiveness, or patient trust are proven.
- Do not imply a tool should be retired unless staged evidence specifically supports that claim.
- Do not claim an incident, drift event, or vendor failure occurred.
- Do not treat a pause or retirement policy as proof that organizations execute it well.
- Do not cite runtime metadata, transcripts, run-state files, or repo-internal files as reader sources.

## Publication gate

Reject or restage if the draft:

- uses only job metadata or generated context as evidence;
- includes any week key in the H1;
- repeats the recent title templates;
- cites runtime metadata;
- converts exit planning into proof of maturity or safety;
- omits the evidence-limits posture;
- treats retirement as failure rather than as one normal option in accountable lifecycle governance.
