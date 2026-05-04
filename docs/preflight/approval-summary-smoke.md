# approval-summary smoke evidence

- Command: `bun run approval-summary-smoke`
- Started: 2026-05-04T03:20:05.962Z
- Finished: 2026-05-04T03:20:06.032Z
- Scenario root: /Users/youjia/dev/content-zoe/.runs/approval-summary-smoke/2026-05-04T03-20-05.962Z (removed by finally-cleanup)

| Scenario | Result | Evidence |
|---|---:|---|
| compose-bilingual | PASS | Bilingual summary includes job id, attempt number, report paths, previews, sources path, and Evidence Grade section. |
| compose-en-only | PASS | En-only summary includes English preview and a deterministic translation skip note without a Chinese path. |
| evidence-grade-warnings | PASS | Two English Evidence Grade warning comments were surfaced as payloads without HTML wrappers; Chinese warning comments were ignored. |
| summary-length-bound | PASS | Oversized summary stayed within 3500 chars and retained "\n\n[approval-summary truncated]". |
| compose-deterministic | PASS | Identical inputs produced byte-identical approval summaries. |
| db-persistence-existing-job | PASS | Existing DB row reached awaiting_approval with job-root run_dir, attempt-local paths, current attempt, and non-empty summary.<br>updated_at advanced, error/notify fields cleared, and report artifact hashes did not change during persistence. |
| db-persistence-en-only-existing-job | PASS | Existing en-only DB row reached awaiting_approval with current_stage=edit_en, translated_report_path=null, and an en-only skip note. |
| stage-failure-no-approval-persistence | PASS | Forced fake-provider stage failure left approval_summary null, status non-terminal, and report paths unadvanced. |
| persistence-failure-nonzero | PASS | After loop success, a seeded-row persistence attempt with a missing required artifact threw a readable approval-summary error. |
| missing-job-nonfatal | PASS | No-row fake CLI run exited 0 and emitted an operator-readable skipped-persistence stderr note. |
| already-complete-idempotent | PASS | Already-complete resume created no new attempt, did not call the provider, and left report artifact hashes unchanged. |
| no-prompt-surface-static-check | PASS | Committed runtime TS files contain no buildPrompt, provider runPrompt call, prompt delimiter constants, or prompt-file references. |
