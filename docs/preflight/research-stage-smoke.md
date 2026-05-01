# research-stage smoke evidence

- Command: `bun run research-stage-smoke`
- Started: 2026-05-01T13:02:55.916Z
- Finished: 2026-05-01T13:02:55.919Z
- Scenario root: /Users/youjia/dev/content-zoe/.runs/research-stage-smoke/2026-05-01T13-02-55.916Z (removed by finally-cleanup)

| Scenario | Result | Evidence |
|---|---:|---|
| research-success | PASS | Shared fake-artifact helper wrote non-empty research/brief.md.<br>Shared fake-artifact helper wrote parseable JSON array sources.json. |
| missing-research-brief | PASS | Provider wrote only sources.json.<br>The concrete research manifest failed with MANIFEST_FILE_MISSING. |
| empty-research-brief | PASS | Provider wrote a zero-byte research/brief.md and valid sources.json.<br>The concrete research manifest failed with MANIFEST_FILE_EMPTY. |
| empty-sources-json | PASS | Provider wrote non-empty research/brief.md and empty sources.json.<br>The concrete research manifest failed with MANIFEST_JSON_UNPARSEABLE. |
| path-boundary-inherited | PASS | research/brief.md was a symlink to a file outside the run directory.<br>The concrete research manifest inherited runStage boundary validation. |
