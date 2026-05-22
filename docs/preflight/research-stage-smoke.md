# research-stage smoke evidence

- Command: `bun run research-stage-smoke`
- Started: 2026-05-22T14:45:26.800Z
- Finished: 2026-05-22T14:45:26.809Z
- Scenario root: /Users/youjia/dev/content-zoe/.runs/research-stage-smoke/2026-05-22T14-45-26.799Z (removed by finally-cleanup)

| Scenario | Result | Evidence |
|---|---:|---|
| research-source-context-prompt | PASS | buildResearchPrompt output began with RESEARCH_PROMPT verbatim.<br>The dynamic prompt exposed source-material/context.md, manifest.json, and operator/facts.md content.<br>The dynamic prompt labeled staged source text as untrusted data and required root sources.json citations without external tools. |
| research-source-context-absent | PASS | buildResearchPrompt recorded absence of source-material without throwing.<br>Direct research runStage with no source-material still completed with the fake provider. |
| research-source-context-sentinel-neutralization | PASS | Staged context/operator text containing prompt delimiters was embedded only after delimiter neutralization.<br>Wrapper sentinels remained present exactly once, proving staged data could not close the boundary. |
| report-run-fake-provider-research-match | PASS | Fake report-run provider matched a dynamic research prompt by strict RESEARCH_PROMPT prefix.<br>The same fake research artifacts were written for the dynamic prompt path. |
| research-success | PASS | Shared fake-artifact helper wrote non-empty research/brief.md.<br>Shared fake-artifact helper wrote parseable JSON array sources.json. |
| missing-research-brief | PASS | Provider wrote only sources.json.<br>The concrete research manifest failed with MANIFEST_FILE_MISSING. |
| empty-research-brief | PASS | Provider wrote a zero-byte research/brief.md and valid sources.json.<br>The concrete research manifest failed with MANIFEST_FILE_EMPTY. |
| empty-sources-json | PASS | Provider wrote non-empty research/brief.md and empty sources.json.<br>The concrete research manifest failed with MANIFEST_JSON_UNPARSEABLE. |
| path-boundary-inherited | PASS | research/brief.md was a symlink to a file outside the run directory.<br>The concrete research manifest inherited runStage boundary validation. |
