# translate-zh-stage smoke evidence

- Command: `bun run translate-zh-stage-smoke`
- Started: 2026-05-02T02:31:48.042Z
- Finished: 2026-05-02T02:31:48.045Z
- Scenario root: /Users/youjia/dev/content-zoe/.runs/translate-zh-stage-smoke/2026-05-02T02-31-48.042Z (removed by finally-cleanup)

| Scenario | Result | Evidence |
|---|---:|---|
| translate-success | PASS | buildPrompt consumed preseeded report.en.md.<br>Shared fake provider wrote non-empty report.zh.md through the translate_zh branch.<br>report.en.md remained present and unchanged after translation. |
| missing-english-input | PASS | report.en.md was absent before prompt construction.<br>runStage returned LLMProviderError and did not invoke the provider. |
| empty-english-input | PASS | report.en.md was zero-byte before prompt construction.<br>runStage returned LLMProviderError and did not invoke the provider. |
| payload-delimiter-escape | PASS | Embedded English report payload occurrences of all five sentinels were neutralized.<br>The only structural delimiters left are the wrapper <<<ENGLISH_REPORT_DATA>>> and final <<<END>>>. |
| provider-empties-zh-report | PASS | Provider wrote a zero-byte report.zh.md.<br>The translate_zh manifest failed with MANIFEST_FILE_EMPTY. |
| omit-translate-stage-fails | PASS | Fake provider omitted Stage.TRANSLATE_ZH and did not write the fake translation marker.<br>runStage failed with status=error. |
| prompt-boundary-static-check | PASS | Prompt contains delimiter markers, untrusted-data sentence, report.en.md input, and report.zh.md output instructions.<br>Prompt includes the cwd-confinement footer, length-ratio guidance, Markdown directive, and Evidence Grade directive.<br>Prompt starts with TRANSLATE_ZH_PROMPT. |
