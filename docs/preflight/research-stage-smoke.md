# research-stage smoke evidence

- Command: `bun run research-stage-smoke`
- Started: 2026-04-30T13:49:20.704Z
- Finished: 2026-04-30T13:49:20.706Z
- Scenario root: /Users/youjia/.openclaw-worktrees/4x3AUVbi-E64e7wNEnmzk/target/.runs/research-stage-smoke/2026-04-30T13-49-20.704Z (removed by finally-cleanup)

| Scenario | Result | Evidence |
|---|---:|---|
| research-success | PASS | Shared fake-artifact helper wrote non-empty research/brief.md.<br>Shared fake-artifact helper wrote parseable JSON array sources.json. |
| missing-research-brief | PASS | Provider wrote only sources.json.<br>The concrete research manifest failed with MANIFEST_FILE_MISSING. |
| empty-research-brief | PASS | Provider wrote a zero-byte research/brief.md and valid sources.json.<br>The concrete research manifest failed with MANIFEST_FILE_EMPTY. |
| empty-sources-json | PASS | Provider wrote non-empty research/brief.md and empty sources.json.<br>The concrete research manifest failed with MANIFEST_JSON_UNPARSEABLE. |
| path-boundary-inherited | PASS | research/brief.md was a symlink to a file outside the run directory.<br>The concrete research manifest inherited runStage boundary validation. |
