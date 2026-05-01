# Run Stage Smoke - Evidence Report

**Slice:** cz Slice 3 (Phase 4.2) pipeline framework
**Generated:** 2026-05-01T13:02:59.358Z
**Provider scope:** FakeProvider-only; no real Codex execution performed.
**Evidence ceiling:** FakeProvider-only framework smoke approval.

## Outcome Matrix

| Scenario | Status |
|---|---:|
| `success` | PASS |
| `manifest-invalid` | PASS |
| `provider-error` | PASS |
| `timeout` | PASS |
| `transition-coverage` | PASS |
| `manifest-path-outside-rundir` | PASS |
| `manifest-symlink-escape` | PASS |
| `manifest-glob-escape` | PASS |
| `manifest-glob-mixed-safe-and-escape` | PASS |
| `manifest-glob-min-count-zero` | PASS |
| `manifest-glob-broken-symlink` | PASS |

## Scenario Evidence

### success

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-05-01T13:02:59.348Z
- Finished: 2026-05-01T13:02:59.349Z
- Evidence: Pre-staged non-empty file satisfied the manifest.
- Evidence: FakeProvider returned canned text and no transcriptPath was present on success.

### manifest-invalid

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-05-01T13:02:59.349Z
- Finished: 2026-05-01T13:02:59.349Z
- Evidence: Pre-staged empty file failed a file_non_empty rule.
- Evidence: The first manifest error was MANIFEST_FILE_EMPTY.

### provider-error

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-05-01T13:02:59.349Z
- Finished: 2026-05-01T13:02:59.349Z
- Evidence: Missing canned response surfaced FakeProvider's LLMProviderError(kind=parse).
- Evidence: A non-LLMProviderError throw normalized to LLMProviderError(kind=spawn) with runStage internal prefix.

### timeout

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-05-01T13:02:59.349Z
- Finished: 2026-05-01T13:02:59.356Z
- Evidence: DelayedFakeProvider used constructor-injected delay greater than the stage timeout.
- Evidence: runStage returned the provider's LLMProviderError(kind=timeout).

### transition-coverage

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-05-01T13:02:59.356Z
- Finished: 2026-05-01T13:02:59.356Z
- Evidence: Covered research -> draft_en -> edit_en -> translate_zh -> awaiting_approval.
- Evidence: Covered locales=['en'] translation skip and invalid-current-stage error.

### manifest-path-outside-rundir

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-05-01T13:02:59.356Z
- Finished: 2026-05-01T13:02:59.357Z
- Evidence: Path rules rejected both ../outside.md and an absolute outside path.
- Evidence: Missing runDir, runDir-as-file, and runDir symlink escaping cwd all failed pre-provider.

### manifest-symlink-escape

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-05-01T13:02:59.357Z
- Finished: 2026-05-01T13:02:59.357Z
- Evidence: Path rule realpath checked runDir/sneaky.md.
- Evidence: Symlink target outside runDir produced MANIFEST_PATH_OUTSIDE_RUNDIR.

### manifest-glob-escape

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-05-01T13:02:59.357Z
- Finished: 2026-05-01T13:02:59.358Z
- Evidence: Glob rules rejected absolute and parent-segment patterns before matching.
- Evidence: A glob match whose symlink target escaped runDir produced MANIFEST_PATH_OUTSIDE_RUNDIR.

### manifest-glob-mixed-safe-and-escape

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-05-01T13:02:59.358Z
- Finished: 2026-05-01T13:02:59.358Z
- Evidence: Glob had two safe matches plus one symlink escape.
- Evidence: Boundary validation examined all matches before count success and rejected the escape.

### manifest-glob-min-count-zero

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-05-01T13:02:59.358Z
- Finished: 2026-05-01T13:02:59.358Z
- Evidence: Explicit minCount=0 with zero matches succeeded.
- Evidence: Default minCount remains 1 when minCount is omitted.

### manifest-glob-broken-symlink

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-05-01T13:02:59.358Z
- Finished: 2026-05-01T13:02:59.358Z
- Evidence: Glob matched a broken symlink whose target did not exist.
- Evidence: ENOENT from realpath resolution was classified as MANIFEST_FILE_MISSING.

## Scope Notes

- Smoke setup used per-invocation, per-scenario directories under `.runs/run-stage-smoke/<iso-stamp>/<scenario-id>/`.
- The smoke runner removes its temporary invocation root in a `finally` cleanup.
- Manifest policy is the contract: empty provider output is not implicitly rejected unless a manifest rule fails.
- `runStage internal:` is an operational classifier prefix only; downstream code must inspect `LLMProviderError` object properties.
