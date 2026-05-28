# Research Brief

## Scope

- Topic: AI in healthcare - weekly.
- Working thesis: healthcare AI needs a reader-usable uncertainty label.
- Output posture: reader-facing governance and workflow-fit article, not product marketing, legal advice, clinical guidance, or implementation proof.
- Research constraint: this brief is derived only from staged local material in `source-material/`; no external verification or local performance evidence is available in this stage.

## Core Thesis

Healthcare AI outputs can look more settled than the available evidence supports when limits, missing context, review triggers, and fallback routes are not visible. The article should argue that an uncertainty label helps readers understand what an AI-enabled output is based on, what it leaves out, what context may change interpretation, and what should happen when uncertainty matters.

## Default Title Direction

- Preferred H1: `Healthcare AI Needs an Uncertainty Label`
- Acceptable variants:
  - `Healthcare AI Should Mark Its Uncertainty`
  - `Healthcare AI Should Say What It Does Not Know`
- Hard rule: no calendar key in the H1.
- Avoid recent title frames about queues, owners, review dates, disagreement paths, handoff notes, workarounds, or generic monitoring.

## Article Build Requirements

- Keep the piece source-bounded and evidence-cautious.
- Describe the uncertainty-label idea only; do not expose non-reader operational details.
- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Keep warnings locale-pure: English-only warning text in `report.en.md`, Chinese-only warning text in `report.zh.md`.
- Include a short `Selected Source Basis` section in both locales.
- In `Selected Source Basis`, list only public source families by name:
  - NIST AI RMF
  - ONC SAFER
  - ONC decision-support intervention material
  - WHO
  - AMA
  - Joint Commission/CHAI
  - bounded FDA AI/ML device context
- Target 75-95 markdown lines per locale; under 68 lines should be treated as a likely restage unless a reviewer explicitly accepts compression.

## Recommended Structure

1. Opening problem: healthcare AI output can appear more certain than the source basis supports.
2. Why a confidence score alone is insufficient.
3. What an uncertainty label should tell the reader.
4. Missing context and review-trigger examples.
5. Fallback route, escalation route, owner group, and human review.
6. Why labels should stay connected to monitoring, feedback, and workflow change.
7. `Selected Source Basis`.
8. `EVIDENCE_GRADE_WARN` language and evidence-limit close.

## Useful Uncertainty-Label Fields

- output purpose
- intended user
- decision point
- evidence basis
- missing context
- confidence qualifier
- known limitation
- last review signal
- review trigger
- fallback route
- escalation route
- owner group

Use these only when they help the reader route action. The briefed source posture rejects decorative labels and false precision.

## Safe Claims To Carry Forward

- Healthcare AI outputs can appear more certain than the available evidence supports when limits are not visible.
- A confidence score may be one signal, but it is not enough on its own.
- A usable uncertainty label should help the intended reader understand limits, missing context, and next-step routing.
- Missing context should remain visible as a review question rather than being hidden behind a routine-looking output.
- Review triggers are more useful than generic labels such as `AI-generated` or `low confidence` with no action path.
- Fallback route, escalation route, human review, and owner group matter because uncertainty needs a next action.
- Available governance sources can support questions about transparency, documentation, workflow fit, monitoring, human oversight, and responsible adoption.
- An uncertainty label does not prove safety, compliance, effectiveness, fairness, trust, outcome improvement, local validation, or operational maturity.

## Claims To Avoid

- No named vendor, product, hospital, health system, regulator, or public program claims.
- No legal conclusions, compliance advice, or professional-liability guidance.
- No claim that any label, score, field, route, or workflow satisfies law or accreditation.
- No invented local calibration results, thresholds, validation studies, incidents, review dates, owner names, or audit findings.
- Do not treat bounded FDA device context as the entire healthcare AI landscape.
- Do not claim that every workflow needs the same display or that every missing field makes an output wrong or unsafe.

## Evidence-Limit Posture

The article must repeatedly frame its claims with reader-facing language such as `the source basis` and `available governance sources`. It should say clearly that the source basis supports a governance-oriented argument about uncertainty communication, documentation, review routing, workflow fit, monitoring, and bounded device context. It should also say clearly that the article does not have local calibration data, model-performance results, confidence thresholds, validation reports, measured outcomes, legal analysis, or named implementation proof.

## Source Gaps To State Transparently

- No local model-performance or calibration evidence.
- No local workflow-fit review or monitoring record.
- No override, non-use, or incident data.
- No named implementation examples or proof that any organization uses a specific uncertainty-label process.
- No external-source verification in this stage beyond the staged references to public source families.

## Drafting Notes For Both Locales

- Keep the argument practical and reader-usable.
- Prefer short explanations of what the label helps a reader do next.
- Treat review triggers and fallback routes as governance prompts, not clinical instructions.
- Keep monitoring references narrow: labels should stay connected to review and change over time, but this is not a general monitoring article.
- When naming the public source basis, use source-family names only, not internal process details.
