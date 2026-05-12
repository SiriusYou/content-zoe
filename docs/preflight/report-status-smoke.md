# report-status smoke evidence

- Command: `bun run report-status-smoke`
- Started: 2026-05-12T02:16:25.330Z
- Finished: 2026-05-12T02:16:25.369Z
- Scenario root: /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-report-status-smoke-2026-05-12T02-16-25.329Z (removed by finally-cleanup)
- Result: 13/13 PASS

This smoke exercises the read-only `report:status` CLI surface only. It does not run operator-only `bun run report:run`, real Codex report generation, real Telegram network, real git/process execution, notifier sending, publish/promote behavior, DB migrations beyond scenario setup, or preflight.

| Scenario | Status | Evidence |
|---|---:|---|
| report-status-missing-db | PASS | Missing .data/content.db exits 0 with exact NO_DATABASE stdout.<br>Missing DB path does not create .data, content.db, migrations, or WAL files. |
| report-status-invalid-command | PASS | Missing, flag-like, and extra-argument invocations fail with exact INVALID_COMMAND stderr.<br>Invalid command parsing happens before any DB open or .data creation. |
| report-status-unknown-job | PASS | Existing DB with no matching job exits 1 with exact UNKNOWN_JOB stderr.<br>Unknown job path leaves jobs and events byte-identical. |
| report-status-known-queued | PASS | Queued job prints the exact five-record STATUS/PATHS/MANIFEST/APPROVAL/ERROR contract. |
| report-status-awaiting-approval-summary | PASS | Awaiting-approval status prefers the Evidence Grade line from approval_summary.<br>Approval summaries collapse whitespace and cap at 160 chars. |
| report-status-published-paths | PASS | Published job prints stored artifact/report/source paths from jobs only.<br>Published job without promoted event exposes publish_manifest=missing. |
| report-status-published-manifest-authority | PASS | Published job reads latest promoted event payload and prints present manifest authority.<br>aggregate_sha256 is first 12 lowercase hex chars from events.payload.publish_manifest. |
| report-status-published-manifest-missing-and-unparseable | PASS | Published job with no promoted event reports publish_manifest=missing.<br>Invalid JSON and malformed publish_manifest fields report publish_manifest=unparseable. |
| report-status-error-state | PASS | Failed job prints collapsed terminal error detail in the ERROR row. |
| report-status-notify-error | PASS | Notification error is collapsed and capped in APPROVAL last_notify_error. |
| report-status-read-only-no-mutation | PASS | Jobs and events snapshots are byte-identical before and after report:status.<br>No .runs, reports, or attempt output directories are created. |
| report-status-malformed-db | PASS | Malformed existing DB exits non-zero with DB_READ_FAILED on stderr and no stdout.<br>Malformed DB handling does not remove or recreate the DB file. |
| report-status-boundary-static-check | PASS | Cycle-scope boundary check ran in active-slice mode and saw changed files: docs/preflight/bot-smoke.md, docs/preflight/report-deliver-local-smoke.md, docs/preflight/report-run-smoke.md, scripts/report-deliver-local-smoke.ts, src/lib/publish-destination.ts.<br>Synthetic active-slice scope check rejects out-of-scope Telegram product files.<br>Synthetic Slice 4.13 report:remind changed-set resolves to inherited-surface mode for report-status-smoke.<br>Synthetic Slice 4.15 report:show changed-set resolves to inherited-surface mode for report-status-smoke.<br>Synthetic Slice 4.16 report:list changed-set resolves to inherited-surface mode for report-status-smoke.<br>package.json includes report:list/report-list-smoke and report:show/report-show-smoke additions while preserving report:status/remind/create scripts and dependency sets.<br>report-status.ts avoids mutating DB helpers, other CLI imports including report-show, Telegram, promote, preflight/Codex, process, network, LLM, and prompt surfaces. |
