# report-remind smoke evidence

- Command: `bun run report-remind-smoke`
- Started: 2026-05-11T04:17:06.322Z
- Finished: 2026-05-11T04:17:06.384Z
- Scenario root: /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-report-remind-smoke-2026-05-11T04-17-06.322Z (removed by finally-cleanup)
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
| report-remind-boundary-static-check | PASS | Cycle-scope boundary check ran in active-slice mode and saw changed files: docs/preflight/bot-smoke.md, docs/preflight/db-smoke.md, docs/preflight/report-create-smoke.md, docs/preflight/report-list-smoke.md, docs/preflight/report-remind-smoke.md, docs/preflight/report-run-smoke.md, docs/preflight/report-show-smoke.md, docs/preflight/report-status-smoke.md, scripts/bot-smoke.ts, scripts/db-smoke.ts, scripts/report-create-smoke.ts, scripts/report-list-smoke.ts, scripts/report-remind-smoke.ts, scripts/report-run-smoke.ts, scripts/report-show-smoke.ts, scripts/report-status-smoke.ts, src/bin/report-run.ts, src/db.ts, src/lib/report-loop.ts.<br>Synthetic active-slice scope check rejects out-of-scope Telegram product files.<br>Synthetic report-create changed-set resolves to inherited-surface mode for report-remind-smoke.<br>Synthetic Slice 4.14 report:status changed-set resolves to inherited-surface mode for report-remind-smoke.<br>Synthetic Slice 4.15 report:show changed-set resolves to inherited-surface mode for report-remind-smoke.<br>Synthetic Slice 4.16 report:list changed-set resolves to inherited-surface mode for report-remind-smoke.<br>package.json includes report:list/report-list-smoke and report:show/report-show-smoke additions while preserving report:remind/status/create scripts and dependency sets.<br>report-remind.ts avoids mutating DB helpers, report-create/report-run/report-status/report-show imports, Telegram, promote, preflight/Codex, process, network, LLM, and prompt surfaces. |
