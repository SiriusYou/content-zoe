# Run Stage Smoke - Evidence Report

**Slice:** cz Slice 3 (Phase 4.2) pipeline framework
**Generated:** 2026-04-28T08:44:35.312Z
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

## Scenario Evidence

### success

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-04-28T08:44:35.302Z
- Finished: 2026-04-28T08:44:35.303Z
- Evidence: Pre-staged non-empty file satisfied the manifest.
- Evidence: FakeProvider returned canned text and no transcriptPath was present on success.

### manifest-invalid

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-04-28T08:44:35.303Z
- Finished: 2026-04-28T08:44:35.303Z
- Evidence: Pre-staged empty file failed a file_non_empty rule.
- Evidence: The first manifest error was MANIFEST_FILE_EMPTY.

### provider-error

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-04-28T08:44:35.303Z
- Finished: 2026-04-28T08:44:35.303Z
- Evidence: Missing canned response surfaced FakeProvider's LLMProviderError(kind=parse).
- Evidence: A non-LLMProviderError throw normalized to LLMProviderError(kind=spawn) with runStage internal prefix.

### timeout

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-04-28T08:44:35.303Z
- Finished: 2026-04-28T08:44:35.310Z
- Evidence: DelayedFakeProvider used constructor-injected delay greater than the stage timeout.
- Evidence: runStage returned the provider's LLMProviderError(kind=timeout).

### transition-coverage

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-04-28T08:44:35.310Z
- Finished: 2026-04-28T08:44:35.311Z
- Evidence: Covered research -> draft_en -> edit_en -> translate_zh -> awaiting_approval.
- Evidence: Covered locales=['en'] translation skip and invalid-current-stage error.

### manifest-path-outside-rundir

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-04-28T08:44:35.311Z
- Finished: 2026-04-28T08:44:35.311Z
- Evidence: Path rules rejected both ../outside.md and an absolute outside path.
- Evidence: Missing runDir, runDir-as-file, and runDir symlink escaping cwd all failed pre-provider.

### manifest-symlink-escape

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-04-28T08:44:35.311Z
- Finished: 2026-04-28T08:44:35.312Z
- Evidence: Path rule realpath checked runDir/sneaky.md.
- Evidence: Symlink target outside runDir produced MANIFEST_PATH_OUTSIDE_RUNDIR.

### manifest-glob-escape

- Command: `bun run run-stage-smoke`
- Status: PASS
- Started: 2026-04-28T08:44:35.312Z
- Finished: 2026-04-28T08:44:35.312Z
- Evidence: Glob rules rejected absolute and parent-segment patterns before matching.
- Evidence: A glob match whose symlink target escaped runDir produced MANIFEST_PATH_OUTSIDE_RUNDIR.

## Scope Notes

- Smoke setup used per-invocation, per-scenario directories under `.runs/run-stage-smoke/<iso-stamp>/<scenario-id>/`.
- The smoke runner removes its temporary invocation root in a `finally` cleanup.
- Manifest policy is the contract: empty provider output is not implicitly rejected unless a manifest rule fails.
- `runStage internal:` is an operational classifier prefix only; downstream code must inspect `LLMProviderError` object properties.
