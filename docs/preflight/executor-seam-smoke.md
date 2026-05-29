# Executor Seam Smoke - Evidence Report

**Slice:** V2 Slice 6a executor seam
**Generated:** 2026-05-29T06:07:46.828Z
**Provider scope:** Generic run-handler + fake text provider only; no real provider execution performed.
**Evidence ceiling:** Executor seam smoke passed.

## Outcome Matrix

| Scenario | Status |
|---|---:|
| `seam-run-handler-executes-without-provider` | PASS |
| `seam-canonical-run-dir-and-timeout` | PASS |
| `seam-manifest-validates-run-output` | PASS |
| `seam-run-branch-bypasses-build-prompt` | PASS |
| `seam-manifest-throw-normalizes-to-error` | PASS |
| `seam-run-handler-throw-maps-to-error` | PASS |
| `seam-non-run-stage-without-provider-errors` | PASS |
| `seam-text-stage-unchanged` | PASS |
| `executor-seam-static-boundary-check` | PASS |
| `executor-seam-no-image-imports` | PASS |

## Scenario Evidence

### seam-run-handler-executes-without-provider

- Command: `bun run executor-seam-smoke`
- Status: PASS
- Started: 2026-05-29T06:07:46.810Z
- Finished: 2026-05-29T06:07:46.810Z
- Evidence: Run handler executed without an LLMProvider.
- Evidence: Shared manifest validation accepted the handler-written artifact.
- Evidence: Successful run-handler result returned output="".

### seam-canonical-run-dir-and-timeout

- Command: `bun run executor-seam-smoke`
- Status: PASS
- Started: 2026-05-29T06:07:46.810Z
- Finished: 2026-05-29T06:07:46.811Z
- Evidence: Symlinked jobContext.runDir was resolved before handler execution.
- Evidence: StageDef.timeoutMs reached the handler unchanged.
- Evidence: Handler-written bytes validated from the canonical path.

### seam-manifest-validates-run-output

- Command: `bun run executor-seam-smoke`
- Status: PASS
- Started: 2026-05-29T06:07:46.811Z
- Finished: 2026-05-29T06:07:46.811Z
- Evidence: Run-handler output passed file_exists + file_non_empty rules.
- Evidence: A handler that wrote nothing failed through the same manifest_invalid path.

### seam-run-branch-bypasses-build-prompt

- Command: `bun run executor-seam-smoke`
- Status: PASS
- Started: 2026-05-29T06:07:46.811Z
- Finished: 2026-05-29T06:07:46.811Z
- Evidence: Run-handler branch succeeded even though buildPrompt would throw.

### seam-manifest-throw-normalizes-to-error

- Command: `bun run executor-seam-smoke`
- Status: PASS
- Started: 2026-05-29T06:07:46.811Z
- Finished: 2026-05-29T06:07:46.812Z
- Evidence: Text stage manifest-validator throw normalized to StageResult.error.
- Evidence: Run-handler manifest-validator throw normalized to the same StageResult.error shape.

### seam-run-handler-throw-maps-to-error

- Command: `bun run executor-seam-smoke`
- Status: PASS
- Started: 2026-05-29T06:07:46.812Z
- Finished: 2026-05-29T06:07:46.812Z
- Evidence: Plain handler throw normalized to LLMProviderError(kind=spawn).
- Evidence: Handler-thrown LLMProviderError was preserved unchanged.

### seam-non-run-stage-without-provider-errors

- Command: `bun run executor-seam-smoke`
- Status: PASS
- Started: 2026-05-29T06:07:46.812Z
- Finished: 2026-05-29T06:07:46.813Z
- Evidence: A non-run stage without provider returned StageResult.error without throwing.

### seam-text-stage-unchanged

- Command: `bun run executor-seam-smoke`
- Status: PASS
- Started: 2026-05-29T06:07:46.813Z
- Finished: 2026-05-29T06:07:46.813Z
- Evidence: Text stage still routed through provider.runPrompt and returned provider output.

### executor-seam-static-boundary-check

- Command: `bun run executor-seam-smoke`
- Status: PASS
- Started: 2026-05-29T06:07:46.813Z
- Finished: 2026-05-29T06:07:46.828Z
- Evidence: Static boundary check skipped implementation-range assertion at HEAD^; executor seam package diff belongs to the original 6a range.

### executor-seam-no-image-imports

- Command: `bun run executor-seam-smoke`
- Status: PASS
- Started: 2026-05-29T06:07:46.828Z
- Finished: 2026-05-29T06:07:46.828Z
- Evidence: types.ts and run-stage.ts contain no image-provider or vision-judge provider references.

## Error-Mapping Contract

- Run-handler success returns the existing `StageResult.ok` shape with `output: ""`.
- Plain run-handler throws normalize to `StageResult.error` with `LLMProviderError(kind="spawn")` and a `runStage internal:` prefix.
- Handler-thrown `LLMProviderError` values are preserved unchanged.
- Manifest validator throws normalize to the same `StageResult.error` shape on text and run-handler branches.

## Scope Notes

- The static boundary check uses `SLICE_IMPLEMENTATION_BASE` when provided, so pre-merge and post-merge verification inspect the approval-label-commit range.
- `image-provider-fake-smoke` and `vision-judge-fake-smoke` are intentionally not invoked by this Slice 6a smoke because their static boundary checks are prior-slice-local.
