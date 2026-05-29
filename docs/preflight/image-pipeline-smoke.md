# Image Pipeline Smoke - Evidence Report

**Slice:** V2 Slice 6b image stages + regenerate loop
**Generated:** 2026-05-29T12:38:21.560Z
**Provider scope:** Fake text/image/judge providers only; no real provider execution.
**Evidence ceiling:** Image pipeline smoke passed.

## Outcome Matrix

| Scenario | Status |
|---|---:|
| `image-happy-path` | PASS |
| `image-regen-then-pass` | PASS |
| `image-exhaust-regen` | PASS |
| `image-crash-resume` | PASS |
| `image-safety-escalation` | PASS |
| `image-judge-transport-failure` | PASS |
| `image-mechanical-authoritative` | PASS |
| `image-pipeline-static-boundary-check` | PASS |

## Scenario Evidence

### image-happy-path

- Command: `bun run image-pipeline-smoke`
- Status: PASS
- Started: 2026-05-29T12:38:21.465Z
- Finished: 2026-05-29T12:38:21.475Z
- Evidence: elaborate_spec -> generate -> judge completed on the first pass.
- Evidence: No image_regen or did_not_pass_auto_gate lifecycle events fired.

### image-regen-then-pass

- Command: `bun run image-pipeline-smoke`
- Status: PASS
- Started: 2026-05-29T12:38:21.475Z
- Finished: 2026-05-29T12:38:21.492Z
- Evidence: First parseable failing verdict rewound to generate.
- Evidence: regenerateFeedback was threaded into the second FakeImageProvider call.
- Evidence: Second verdict passed and reached awaiting_approval.

### image-exhaust-regen

- Command: `bun run image-pipeline-smoke`
- Status: PASS
- Started: 2026-05-29T12:38:21.492Z
- Finished: 2026-05-29T12:38:21.518Z
- Evidence: 3 bounded image_regen events fired before exhaustion.
- Evidence: Exhaustion returned awaiting_approval with did_not_pass_auto_gate rather than stage_failed.
- Evidence: The final image.png and verdict.json remained in the run directory for human review.

### image-crash-resume

- Command: `bun run image-pipeline-smoke`
- Status: PASS
- Started: 2026-05-29T12:38:21.518Z
- Finished: 2026-05-29T12:38:21.525Z
- Evidence: Direct resume from generate preserved regenRound>0.
- Evidence: The carried failing verdict supplied feedback to the resumed generate stage.
- Evidence: No orphan attempt directory was created by the in-place loop resume.

### image-safety-escalation

- Command: `bun run image-pipeline-smoke`
- Status: PASS
- Started: 2026-05-29T12:38:21.525Z
- Finished: 2026-05-29T12:38:21.538Z
- Evidence: VisionJudgeError(code=safety) escalated immediately with zero regen.
- Evidence: A parseable failed safety criterion also escalated without regen.

### image-judge-transport-failure

- Command: `bun run image-pipeline-smoke`
- Status: PASS
- Started: 2026-05-29T12:38:21.538Z
- Finished: 2026-05-29T12:38:21.544Z
- Evidence: Non-safety judge transport failure remained an ordinary stage_failed result.
- Evidence: No image_regen or did_not_pass_auto_gate event fired for timeout.

### image-mechanical-authoritative

- Command: `bun run image-pipeline-smoke`
- Status: PASS
- Started: 2026-05-29T12:38:21.544Z
- Finished: 2026-05-29T12:38:21.545Z
- Evidence: A wrong-dimension PNG failed the generate-stage manifest before judging.
- Evidence: Mechanical image_dimensions remained authoritative over any later judge verdict.

### image-pipeline-static-boundary-check

- Command: `bun run image-pipeline-smoke`
- Status: PASS
- Started: 2026-05-29T12:38:21.545Z
- Finished: 2026-05-29T12:38:21.560Z
- Evidence: Static boundary check skipped implementation-range assertion at HEAD^; image pipeline package diff belongs to the original 6b range.

## Coverage Notes

- Regeneration is bounded by `IMAGE_MAX_REGEN_ROUNDS`; max generated candidates are N+1.
- Only parseable failed judge verdicts enter regen; non-safety transport failures stay `stage_failed`.
- Safety transport failures and failed judged safety criteria become `did_not_pass_auto_gate` equivalents through the image auto-gate lifecycle hook.
- Mechanical image manifest checks run before judging and remain authoritative.
