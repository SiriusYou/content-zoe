# report-events smoke evidence

- Command: `bun run report-events-smoke`
- Started: 2026-05-14T14:49:51.461Z
- Finished: 2026-05-14T14:49:51.503Z
- Scenario root: /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-report-events-smoke-2026-05-14T14-49-51.460Z (removed by finally-cleanup)
- Result: 14/14 PASS

This smoke exercises the read-only `report:events` CLI surface only. It does not run operator-only `bun run report:run`, real Codex report generation, real Telegram network, notifier sending, publish/promote behavior, destination writes, artifact-body reads, or preflight. The boundary-static scenario reads git metadata only to prove the approved hard-out implementation range.

| Scenario | Status | Evidence |
|---|---:|---|
| report-events-missing-db | PASS | Missing .data/content.db exits 0 with exact NO_DATABASE stdout.<br>Missing DB path creates no .data, content.db, .runs, reports, README, WAL, or temp fixture file. |
| report-events-invalid-command | PASS | Invalid arity, equals-form flags, duplicates, unknown flags, blank/control/path-shaped job IDs, invalid attempts, invalid type tokens, and invalid limits fail as INVALID_COMMAND.<br>Invalid command parsing happens before DB open and leaves the filesystem unchanged. |
| report-events-unknown-job | PASS | Existing DB with no matching jobs.id exits 1 with exact UNKNOWN_JOB stderr.<br>Unknown job failure leaves jobs, events, and filesystem snapshots byte-identical. |
| report-events-known-job-empty-timeline | PASS | Known job with zero matching events emits only the byte-exact EVENTS count=0 summary line.<br>No EVENT rows are printed for an empty audit timeline. |
| report-events-single-event | PASS | Single event prints deterministic field order, ISO timestamp, 12-hex payload hash, and sorted payload summary.<br>Payload hash is computed over the raw stored JSON string without canonicalization. |
| report-events-multi-event-ordering | PASS | Events inserted with out-of-order explicit IDs print in events.id ASC order.<br>Semantic type order is not used as an implicit ordering fallback. |
| report-events-attempt-filter | PASS | Default selection includes all attempts.<br>--attempt N exact-matches only that attempt and preserves id ASC output. |
| report-events-type-filter | PASS | --type exact-matches one event type while accepting the approved token grammar.<br>Comma/glob/suffix behavior is absent; promoted does not match promoted_extra. |
| report-events-limit-most-recent | PASS | --limit N selects the most recent matching N rows by id DESC.<br>Selected limit rows print back in chronological events.id ASC order. |
| report-events-payload-safety | PASS | Malformed JSON, nested objects, arrays, top-level scalar JSON, long strings, tabs, newlines, pipes, brackets, and terminal-control-like text all render safely.<br>Payload summaries are bounded to 200 chars, field-safe, and malformed JSON remains a successful <invalid-json> row. |
| report-events-byte-exact-output | PASS | Representative multi-event output exactly matches marker grammar, tab separators, field order, and one trailing newline.<br>Byte-exact assertions cover attempt=all vs attempt=2, type=all vs type=beta, and limit=all vs limit=2 summary variants. |
| report-events-read-only-no-mutation | PASS | Success, filtered success, malformed-payload success, unknown-job failure, and invalid-command failure leave jobs/events byte-identical.<br>The same paths leave .runs, reports, README, WAL side files, and temp fixture paths unchanged. |
| report-events-db-field-safety | PASS | DB event types with control characters are collapsed and overlong event types are capped at 80 characters.<br>Invalid event IDs, attempt numbers, empty/non-renderable event types, invalid timestamps, and non-finite timestamps fail as EVENTS_READ_FAILED.<br>Malformed payload JSON remains a successful <invalid-json> summary rather than DB_READ_FAILED. |
| report-events-boundary-static-check | PASS | Implementation range cc5e09549dd4908af12082e9e9d9e35aaa55f7bc..HEAD plus worktree contains only declared files: docs/preflight/report-events-smoke.md, package.json, scripts/report-events-smoke.ts, src/bin/report-events.ts.<br>Synthetic active-slice boundary rejects out-of-scope product files.<br>Static source inspection covered src/bin/report-events.ts, scripts/report-events-smoke.ts, and package.json.<br>report-events.ts visibly uses readonly SQLite, explicit events.id ordering, no DB mutation SQL/helpers, no migrations, no sibling CLI imports, no Telegram/network, no prompt/LLM/Codex/preflight/report-run, no artifact-body reads, and no destination writes.<br>package.json contains only the report:events and report-events-smoke script additions with dependency metadata unchanged. |
