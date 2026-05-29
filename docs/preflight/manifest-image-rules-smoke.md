# Manifest Image Rules Smoke

Generated: 2026-05-29T06:07:46.825Z

| Scenario | Status | Details |
| --- | --- | --- |
| image-exists-pass | PASS | Existing PNG satisfied image_exists. |
| image-exists-missing | PASS | Missing image returned MANIFEST_IMAGE_MISSING. |
| image-dimensions-pass | PASS | PNG IHDR dimensions matched 640x480. |
| image-dimensions-mismatch | PASS | PNG IHDR mismatch returned MANIFEST_IMAGE_DIMENSIONS. |
| image-format-bad-magic | PASS | Bad magic bytes returned MANIFEST_IMAGE_FORMAT. |
| image-format-oversize | PASS | Valid PNG over maxBytes returned MANIFEST_IMAGE_FORMAT with oversize detail. |
| judge-verdict-pass | PASS | Judge verdict passed only with a valid full JudgeVerdict and overallPass strictly true. |
| judge-verdict-fail | PASS | overallPass false returned MANIFEST_JUDGE_FAILED. |
| judge-verdict-missing-overallPass | PASS | Missing overallPass returned MANIFEST_JUDGE_FAILED. |
| judge-verdict-unparseable | PASS | Unparseable judge JSON reused MANIFEST_JSON_UNPARSEABLE. |

## Type-Consumer Audit

- Audit command: `rg -n "StageDef\\.stage|stageDef\\.stage|Set<Stage>|ReadonlySet<Stage>|Record<Stage|: Stage|Stage\\[\\]|<Stage>" src`.
- `StageDef.stage`, `StagePromptContext.stage`, and `StageResult.stage` are widened to `string` for modality-neutral stages.
- `src/lib/report-run-fake-provider.ts` widens its internal enabled-stage set to `ReadonlySet<string>`; `omitStages` remains text-only.
- `src/pipeline/run-stage.ts` returns the widened `stageDef.stage` value without narrowing it back to `Stage`.
- Existing report-loop, db, bin, and text-stage `Stage` consumers remain text-pipeline-owned and do not accept arbitrary image stage ids.
- No other audited consumer required widening for Slice 1 because the existing report runner still indexes `STAGES[current]` from a text-only `Stage` value.

