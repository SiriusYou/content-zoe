# draft-en-stage smoke evidence

- Command: `bun run draft-en-stage-smoke`
- Started: 2026-05-01T13:02:52.284Z
- Finished: 2026-05-01T13:02:52.287Z
- Scenario root: /Users/youjia/dev/content-zoe/.runs/draft-en-stage-smoke/2026-05-01T13-02-52.284Z (removed by finally-cleanup)

| Scenario | Result | Evidence |
|---|---:|---|
| draft-success | PASS | buildPrompt consumed preseeded research inputs.<br>Shared fake provider wrote non-empty report.en.md for draft_en. |
| missing-research-input | PASS | sources.json was absent before prompt construction.<br>runStage returned LLMProviderError and did not invoke the provider. |
| payload-delimiter-escape | PASS | Embedded delimiter sentinels were neutralized inside research payloads.<br>The only literal <<<END>>> left in the prompt is the final delimiter. |
| missing-report-en | PASS | Provider returned without writing report.en.md.<br>The draft_en manifest failed with MANIFEST_FILE_MISSING. |
| empty-report-en | PASS | Provider wrote a zero-byte report.en.md.<br>The draft_en manifest failed with MANIFEST_FILE_EMPTY. |
| omit-draft-stage-fails | PASS | Fake provider omitted Stage.DRAFT_EN and did not write report.en.md.<br>runStage failed with status=error. |
| prompt-boundary-static-check | PASS | Prompt contains delimiter markers, untrusted-data sentence, and report.en.md instruction.<br>Prompt includes the cwd-confinement footer and starts with DRAFT_EN_PROMPT. |
