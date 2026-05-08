# report-create smoke evidence

- Command: `bun run report-create-smoke`
- Started: 2026-05-08T16:15:38.080Z
- Finished: 2026-05-08T16:15:38.122Z
- Scenario root: /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-report-create-smoke-2026-05-08T16-15-38.080Z (removed by finally-cleanup)
- Result: 10/10 PASS

This smoke exercises the report:create CLI seed surface only. It does not run operator-only `bun run report:run`, real Codex report generation, real Telegram network, real git/process execution, report generation, notifier sending, or publish/promote behavior.

| Scenario | Status | Evidence |
|---|---:|---|
| report-create-parse-success | PASS | Space-separated CLI grammar parsed --week and --topic with default locales.<br>CLI stdout was exactly the deterministic job ID.<br>DB row stored queued/research attempt-1 with run_dir as a future path string. |
| report-create-default-locales | PASS | Omitting --locales created the job with locales=en,zh. |
| report-create-en-only-locales | PASS | --locales en created an en-only job.<br>Invalid locales failed with INVALID_LOCALES and no stdout. |
| report-create-week-validation | PASS | YYYY-W01/W17/W53 were accepted and W00/W54/lowercase/short forms were rejected.<br>Equals-form flags are rejected as UNKNOWN_FLAG per v1.1 F1. |
| report-create-topic-sanitization | PASS | sanitizeTopic applied the ordered control, delimiter, shell-byte, phrase, and whitespace pipeline.<br>CLI stored the sanitized topic, not the raw operator input. |
| report-create-invalid-topic | PASS | Empty-after-sanitization and over-160-character topics fail with INVALID_TOPIC.<br>Invalid topics fail before DB creation. |
| report-create-duplicate-week | PASS | Duplicate week failed with exact WEEK_ALREADY_EXISTS stderr including existing job ID and status.<br>Duplicate week left the existing row unchanged and wrote no events or .runs directory. |
| report-create-force-rejected | PASS | --force is recognized but rejected with UNSUPPORTED_FORCE before DB mutation. |
| report-create-no-filesystem-touch | PASS | Successful create only created the cwd-owned SQLite DB.<br>No .runs, attempt directory, reports directory, or artifact output was created. |
| report-create-boundary-static-check | PASS | Cycle-scope boundary check ran in active-slice mode and saw changed files: docs/preflight/report-remind-smoke.md, docs/preflight/report-status-smoke.md, package.json, scripts/bot-smoke.ts, scripts/report-create-smoke.ts, scripts/report-remind-smoke.ts, scripts/report-status-smoke.ts, docs/preflight/report-show-smoke.md, scripts/report-show-smoke.ts, src/bin/report-show.ts<br>Synthetic active-slice scope check rejects out-of-scope Telegram product files.<br>Synthetic Slice 4.13 report:remind files resolve to inherited-surface mode without a report-create-smoke exemption.<br>Synthetic Slice 4.14 report:status files resolve to inherited-surface mode without a report-create-smoke exemption.<br>Synthetic Slice 4.15 report:show files resolve to inherited-surface mode without a report-create-smoke exemption.<br>package.json preserves report:create/report-create-smoke, report:remind/report-remind-smoke, report:status/report-status-smoke, and adds report:show/report-show-smoke with dependency sets unchanged.<br>report-create.ts and sanitize.ts avoid report-run/report-show, Telegram, promote, pipeline, LLM, prompt, preflight, process, and network surfaces. |
