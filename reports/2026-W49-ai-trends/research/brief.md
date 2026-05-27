# Research Brief

## Report Frame

- Working thesis: healthcare AI equity has to be checked where the tool is used, because fairness claims made at the model or vendor layer do not show how a local care workflow distributes help, burden, delay, escalation, or exclusion.
- Preferred H1: `Healthcare AI Equity Has to Be Checked Where It Is Used`
- Alternate H1s only if clearly stronger and still source-bounded:
  - `Fairness Has to Survive the Workflow`
  - `Healthcare AI Fairness Is a Local Operating Question`
- Keep the piece as a local equity-review argument, not a weekly market roundup, vendor comparison, product review, or legal analysis.

## Core Argument To Preserve

1. Start with the local workflow, not the model in isolation. Define the care setting, decision point, user group, patient path, and fallback route being reviewed.
2. Show how the same model output can create different burden depending on language access, disability accommodation, digital access, portal dependence, documentation load, referrals, scheduling, escalation paths, and caregiver reliance.
3. Treat source attributes, proxy variables, and missing data as review inputs that can reveal risk, not as proof that a workflow is fair or unfair.
4. Frame monitoring, feedback, complaints, appeals, overrides, and recourse as ways to make equity risk more reviewable after launch.
5. End on governance: who owns unresolved risk, what mitigation is available, what evidence gap remains, and what operating decision follows.

## Recommended Report Structure

1. Lead with the locale-specific `EVIDENCE_GRADE_WARN` comment and the thesis.
2. Explain why local subgroup and workflow review matters more than a generic fairness statement or prelaunch packet.
3. Add a section on access burden and workflow burden:
   - language access
   - disability access
   - health literacy and digital access
   - delay, escalation, callback, referral, and documentation friction
4. Add a section on source attributes and proxy risk:
   - what data are used
   - why they are used
   - where they came from
   - when they were updated
   - what missingness or proxy risk stays unresolved
5. Add a section on monitoring, feedback, and recourse:
   - false positives and false negatives
   - overrides and escalations
   - missed referrals or delays
   - staff and patient correction paths
6. Add a section on mitigation and ownership:
   - continue
   - narrow scope
   - require monitoring
   - require mitigation
   - pause use
   - reopen validation
   - add fallback path
   - assign follow-up owner
7. Include a short `Selected Source Basis` section in each locale.
8. Place the second locale-specific `EVIDENCE_GRADE_WARN` comment near the discussion of subgroup review, source attributes, monitoring, feedback channels, mitigation, or governance ownership.

## Safe Emphases

- Fairness is a local operating question because workflows touch different patients, settings, and access paths differently.
- A subgroup list should follow local risk and available evidence, not a copied vendor template.
- Accessibility, language, health-literacy, and digital-access constraints matter even when the model score looks unchanged.
- Monitoring can reveal who is affected and whether burden or delay differs across groups or settings.
- Governance should produce a decision record and a named owner when evidence stays incomplete.

## Red Lines

- Do not claim any named vendor, hospital, health system, product, or public program is fair, unfair, discriminatory, compliant, noncompliant, safe, unsafe, effective, ineffective, or trustworthy.
- Do not give legal advice or legal conclusions about Section 1557, patient care decision support tools, ONC certification, FDA, HIPAA, malpractice, procurement, or civil-rights compliance.
- Do not turn subgroup review, source attributes, monitoring, feedback channels, mitigation records, or governance ownership into proof of fairness, safety, compliance, patient trust, outcome improvement, or operational maturity.
- Do not invent local subgroup metrics, complaints, appeal volumes, implementation sites, patient stories, validation results, or enforcement facts.
- Do not include the week key in the H1.

## Evidence Gaps To Keep Explicit

- No local subgroup performance data
- No utilization logs
- No patient outcomes
- No complaint or appeal files
- No accessibility testing
- No language-service records
- No named implementation proof
- No local mitigation evidence
- No legal review

## Downstream Writing Notes

- Keep the tone evidence-cautious and operational.
- Prefer concrete workflow questions over abstract fairness rhetoric.
- Keep both locale files source-bounded and preserve locale-specific warnings only in their matching language files.
- Aim for a final draft length that can support a structured argument without padding.
