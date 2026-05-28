# Modality Registry Smoke

Generated: 2026-05-28T18:10:56.882Z

| Scenario | Status | Details |
| --- | --- | --- |
| text-pipeline-unchanged | PASS | Text pipeline registry delegates to the existing STAGES and nextStage contract. |
| en-only-skips-zh | PASS | Text pipeline preserved locales=['en'] translation skip. |
| registry-has-image | PASS | Image registry exposes stage order, transitions, reject rewind, and slice-6 stageDef sentinel. |
| unknown-modality-throws | PASS | Unknown modalities, including prototype-key strings, failed closed. |
| text-stagedef-unknown-throws | PASS | Text stageDef resolver throws on unknown ids, including prototype-key strings. |

## Registry Coverage

- TEXT_REPORT delegates to the existing report stage registry and `nextStage` behavior.
- IMAGE exposes the Slice 1 stage identifiers and transition/rewind contract without implementing image stage defs.
- Unknown text stage ids and unknown modalities fail closed with thrown errors, including prototype-key strings.

