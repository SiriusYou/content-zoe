# report-list smoke evidence

- Command: `bun run report-list-smoke`
- Started: 2026-05-11T04:17:06.337Z
- Finished: 2026-05-11T04:17:06.421Z
- Scenario root: /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-report-list-smoke-2026-05-11T04-17-06.337Z (removed by finally-cleanup)
- Result: 13/13 PASS

This smoke exercises the read-only `report:list` CLI surface only. It does not run operator-only `bun run report:run`, real Codex report generation, real Telegram network, real git/process execution, notifier sending, publish/promote behavior, manifest authority reads, artifact body reads, events reads, DB migrations beyond scenario setup, or preflight.

| Scenario | Status | Evidence |
|---|---:|---|
| report-list-missing-db | PASS | Missing .data/content.db exits 0 with NO_DATABASE.<br>No .data directory is created before the read-only DB open path. |
| report-list-empty-db | PASS | Existing empty DB emits NO_JOBS with no stderr. |
| report-list-default-all-sort-limit | PASS | Default invocation lists all statuses, applies limit=20, and sorts by updated_at DESC.<br>The oldest of 21 seeded jobs is excluded by the default limit. |
| report-list-status-filter | PASS | Status filtering returns only jobs with the requested status. |
| report-list-limit | PASS | Explicit --limit 2 constrains row count after sort. |
| report-list-flag-order-reverse | PASS | Reversed --limit/--status order is byte-identical to canonical order. |
| report-list-invalid-status | PASS | Unknown status token exits 1 with INVALID_STATUS and no stdout. |
| report-list-invalid-limit | PASS | Limit grammar accepts only canonical unsigned base-10 integers from 1 through 100.<br>Zero, >100, decimal, signed, leading-zero, and suffixed limits are rejected. |
| report-list-invalid-command | PASS | Equals-form flags, missing values, duplicate flags, and unknown flags are INVALID_COMMAND. |
| report-list-excerpt-format | PASS | DB-derived path/excerpt fields collapse tabs/newlines/repeated whitespace into field-safe values.<br>Blank path-like fields degrade to '-' and long error text is capped at 160 chars. |
| report-list-read-only-no-mutation | PASS | Jobs and events snapshots are byte-identical before and after report:list.<br>No .runs, reports, or attempt output directories are created. |
| report-list-malformed-db | PASS | Malformed existing DB exits non-zero with DB_READ_FAILED on stderr and no stdout.<br>Malformed DB handling does not remove or recreate the DB file. |
| report-list-boundary-static-check | PASS | Cycle-scope boundary check ran in active-slice mode and saw changed files: docs/preflight/bot-smoke.md, docs/preflight/db-smoke.md, docs/preflight/report-create-smoke.md, docs/preflight/report-list-smoke.md, docs/preflight/report-remind-smoke.md, docs/preflight/report-run-smoke.md, docs/preflight/report-show-smoke.md, docs/preflight/report-status-smoke.md, scripts/bot-smoke.ts, scripts/db-smoke.ts, scripts/report-create-smoke.ts, scripts/report-list-smoke.ts, scripts/report-remind-smoke.ts, scripts/report-run-smoke.ts, scripts/report-show-smoke.ts, scripts/report-status-smoke.ts, src/bin/report-run.ts, src/db.ts, src/lib/report-loop.ts.<br>Synthetic active-slice scope check rejects out-of-scope Telegram product files.<br>Synthetic Slice 4.12 report:create, Slice 4.13 report:remind, Slice 4.14 report:status, and Slice 4.15 report:show changed-sets resolve to inherited-surface mode for report-list-smoke.<br>package.json change is limited to report:list and report-list-smoke additions with dependency sets unchanged.<br>report-list.ts avoids mutating DB helpers, events reads, other CLI imports, Telegram, promote/manifest authority, preflight/Codex, process, network, LLM, and prompt surfaces. |
