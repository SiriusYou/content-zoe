# report-show smoke evidence

- Command: `bun run report-show-smoke`
- Started: 2026-05-08T16:16:46.266Z
- Finished: 2026-05-08T16:16:46.328Z
- Scenario root: /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-report-show-smoke-2026-05-08T16-16-46.266Z (removed by finally-cleanup)
- Result: 20/20 PASS

This smoke exercises the read-only `report:show` CLI surface only. It does not run operator-only `bun run report:run`, real Codex report generation, real Telegram network, real git/process execution, notifier sending, publish/promote behavior, manifest authority reads, DB migrations beyond scenario setup, or preflight.

| Scenario | Status | Evidence |
|---|---:|---|
| report-show-missing-db | PASS | Missing DB exits 0 with NO_DATABASE.<br>Missing DB path does not create .data or content.db. |
| report-show-invalid-command | PASS | Invalid grammar exits 1 with INVALID_COMMAND and no stdout. |
| report-show-invalid-artifact | PASS | Invalid artifact key exits 1 with INVALID_ARTIFACT and no stdout. |
| report-show-unknown-job | PASS | Existing DB with unknown job exits 1 with UNKNOWN_JOB and no stdout. |
| report-show-approval-summary | PASS | approval-summary is emitted from DB text with source=db and path=-. |
| report-show-primary-report | PASS | primary-report is emitted from a repo-contained file path with deterministic header and body. |
| report-show-translated-report | PASS | translated-report is emitted from a repo-contained file path with deterministic header and body. |
| report-show-sources | PASS | sources is emitted from a repo-contained file path with deterministic header and body. |
| report-show-missing-artifact-value | PASS | Blank DB-backed approval summary exits 1 with NO_ARTIFACT. |
| report-show-missing-artifact-file | PASS | Missing repo-contained artifact file exits 1 with ARTIFACT_MISSING. |
| report-show-unsafe-traversal | PASS | Unsafe path ../outside.md is rejected before artifact read. |
| report-show-unsafe-absolute-outside | PASS | Unsafe path /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-report-show-smoke-2026-05-08T16-16-46.266Z/absolute-outside.md is rejected before artifact read. |
| report-show-unsafe-sibling-prefix | PASS | Sibling-prefix absolute path is rejected with path-relative containment, not string prefix. |
| report-show-unsafe-symlink-outside | PASS | Symlink-to-outside artifact path is rejected after realpath containment check. |
| report-show-directory-rejection | PASS | Directory artifact path is rejected as unsafe/non-file. |
| report-show-read-failure | PASS | Injected file-read failure exits with ARTIFACT_READ_FAILED and leaves jobs/events unchanged. |
| report-show-newline-bytes | PASS | Body without trailing newline gets exactly one newline and bytes= counts the emitted body. |
| report-show-read-only-no-mutation | PASS | Representative success and failure calls leave jobs/events byte-identical. |
| report-show-malformed-db | PASS | Malformed existing DB exits non-zero with DB_READ_FAILED and no stdout. |
| report-show-boundary-static-check | PASS | Cycle-scope boundary check ran in active-slice mode and saw changed files: docs/preflight/bot-smoke.md, docs/preflight/report-create-smoke.md, docs/preflight/report-remind-smoke.md, docs/preflight/report-status-smoke.md, package.json, scripts/bot-smoke.ts, scripts/report-create-smoke.ts, scripts/report-remind-smoke.ts, scripts/report-status-smoke.ts, docs/preflight/report-show-smoke.md, scripts/report-show-smoke.ts, src/bin/report-show.ts.<br>Synthetic active-slice scope check rejects out-of-scope Telegram product files.<br>Synthetic Slice 4.14 report:status changed-set resolves to inherited-surface mode for report-show-smoke.<br>package.json change is limited to report:show and report-show-smoke scripts with dependency sets unchanged.<br>report-show.ts avoids mutating DB helpers, events reads, other CLI imports, Telegram, promote/manifest authority, preflight/Codex, process, network, LLM, and prompt surfaces. |
