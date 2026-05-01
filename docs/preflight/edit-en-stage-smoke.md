# edit-en-stage smoke evidence

- Command: `bun run edit-en-stage-smoke`
- Started: 2026-05-01T13:02:34.642Z
- Finished: 2026-05-01T13:02:34.645Z
- Scenario root: /Users/youjia/dev/content-zoe/.runs/edit-en-stage-smoke/2026-05-01T13-02-34.642Z (removed by finally-cleanup)

| Scenario | Result | Evidence |
|---|---:|---|
| edit-success | PASS | buildPrompt consumed preseeded report.en.md.<br>Shared fake provider overwrote report.en.md through the edit_en branch. |
| missing-report-input | PASS | report.en.md was absent before prompt construction.<br>runStage returned LLMProviderError and did not invoke the provider. |
| empty-report-input | PASS | report.en.md was zero-byte before prompt construction.<br>runStage returned LLMProviderError and did not invoke the provider. |
| payload-delimiter-escape | PASS | Embedded draft payload occurrences of all four sentinels were neutralized.<br>The only structural delimiters left are the wrapper <<<DRAFT_DATA>>> and final <<<END>>>. |
| provider-empties-report | PASS | Provider wrote a zero-byte report.en.md.<br>The edit_en manifest failed with MANIFEST_FILE_EMPTY. |
| omit-edit-stage-fails | PASS | Fake provider omitted Stage.EDIT_EN and did not write the edited report marker.<br>runStage failed with status=error. |
| prompt-boundary-static-check | PASS | Prompt contains delimiter markers, untrusted-data sentence, report.en.md instruction, and Evidence Grade marker prefix.<br>Prompt includes the cwd-confinement footer and starts with EDIT_EN_PROMPT. |
