# approval-summary smoke evidence

- Command: `bun run approval-summary-smoke`
- Started: 2026-05-02T12:46:18.000Z
- Finished: 2026-05-02T12:46:18.079Z
- Scenario root: /Users/youjia/.openclaw-worktrees/ED4ICcj64TOGDbO4EG6ox/target/.runs/approval-summary-smoke/2026-05-02T12-46-17.999Z (removed by finally-cleanup)

| Scenario | Result | Evidence |
|---|---:|---|
| compose-bilingual | PASS | Bilingual summary includes job id, attempt number, report paths, previews, sources path, and Evidence Grade section. |
| compose-en-only | PASS | En-only summary includes English preview and a deterministic translation skip note without a Chinese path. |
| evidence-grade-warnings | PASS | Two Evidence Grade warning comments were surfaced as payloads without HTML wrappers. |
| summary-length-bound | PASS | Oversized summary stayed within 6000 chars and retained "\n\n[approval-summary truncated]". |
| compose-deterministic | PASS | Identical inputs produced byte-identical approval summaries. |
| db-persistence-existing-job | PASS | Existing DB row reached awaiting_approval with job-root run_dir, attempt-local paths, current attempt, and non-empty summary.<br>updated_at advanced, error/notify fields cleared, and report artifact hashes did not change during persistence. |
| stage-failure-no-approval-persistence | PASS | Forced fake-provider stage failure left approval_summary null, status non-terminal, and report paths unadvanced. |
| persistence-failure-nonzero | PASS | After loop success, a seeded-row persistence attempt with a missing required artifact threw a readable approval-summary error. |
| missing-job-nonfatal | PASS | No-row fake CLI run exited 0 and emitted an operator-readable skipped-persistence stderr note. |
| already-complete-idempotent | PASS | Already-complete resume created no new attempt, did not call the provider, and left report artifact hashes unchanged. |
| no-prompt-surface-static-check | PASS | Added TS lines contain no buildPrompt, provider runPrompt call, prompt delimiter constants, or prompt-file references. |
