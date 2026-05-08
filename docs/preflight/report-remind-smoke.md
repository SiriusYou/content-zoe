# report-remind smoke evidence

- Command: `bun run report-remind-smoke`
- Started: 2026-05-08T13:20:15.664Z
- Finished: 2026-05-08T13:20:15.709Z
- Scenario root: /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-report-remind-smoke-2026-05-08T13-20-15.663Z (removed by finally-cleanup)
- Result: 10/10 PASS

This smoke exercises the read-only `report:remind` CLI surface only. It does not run operator-only `bun run report:run`, real Codex report generation, real Telegram network, real git/process execution, notifier sending, publish/promote behavior, DB migrations beyond scenario setup, or preflight.

| Scenario | Status | Evidence |
|---|---:|---|
| report-remind-missing-db | PASS | Missing .data/content.db exits 0 with exact NO_DATABASE stdout.<br>Missing DB path does not create .data, content.db, migrations, or WAL files. |
| report-remind-no-reminders | PASS | Existing DB with zero eligible awaiting_approval rows exits 0 with exact NO_REMINDERS stdout. |
| report-remind-never-notified | PASS | Awaiting-approval job with notified_at=NULL and no error is listed as never_notified. |
| report-remind-notify-failed | PASS | Awaiting-approval job with last_notify_error is listed as notify_failed even after notified_at is set.<br>Error summaries replace CR/LF/TAB with spaces, collapse whitespace, trim, and cap at 160 chars. |
| report-remind-excludes-already-notified | PASS | Awaiting-approval job with notified_at set and no error is excluded. |
| report-remind-excludes-non-awaiting | PASS | Queued, running, failed, and published jobs are excluded even when notify fields would otherwise match. |
| report-remind-output-order-and-format | PASS | Rows are ordered by updated_at ASC, attempt_number ASC, id ASC.<br>Every row uses the exact eight-field tab-delimited REMINDER format. |
| report-remind-read-only-no-mutation | PASS | Jobs and events snapshots are byte-identical before and after report:remind.<br>No .runs, reports, or attempt output directories are created. |
| report-remind-malformed-db | PASS | Malformed existing DB exits non-zero with DB_READ_FAILED on stderr and no stdout.<br>Malformed DB handling does not remove or recreate the DB file. |
| report-remind-boundary-static-check | PASS | Cycle-scope boundary check ran in active-slice mode and saw changed files: docs/preflight/bot-smoke.md, docs/preflight/report-create-smoke.md, docs/preflight/report-remind-smoke.md, package.json, scripts/bot-smoke.ts, scripts/report-create-smoke.ts, scripts/report-remind-smoke.ts, docs/preflight/report-status-smoke.md, scripts/report-status-smoke.ts, src/bin/report-status.ts.<br>Synthetic active-slice scope check rejects out-of-scope Telegram product files.<br>Synthetic report-create changed-set resolves to inherited-surface mode for report-remind-smoke.<br>Synthetic Slice 4.14 report:status changed-set resolves to inherited-surface mode for report-remind-smoke.<br>package.json change is limited to report:remind/report-status smoke scripts with dependency sets unchanged.<br>report-remind.ts avoids mutating DB helpers, report-create/report-run/report-status imports, Telegram, promote, preflight/Codex, process, network, LLM, and prompt surfaces. |
