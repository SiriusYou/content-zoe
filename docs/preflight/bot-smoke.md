# Bot Smoke Evidence

- Command: `bun run bot-smoke`
- Started: 2026-05-08T16:15:38.084Z
- Finished: 2026-05-08T16:15:38.266Z
- Scenario root: /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-bot-smoke-2026-05-08T16-15-38.083Z (removed by finally-cleanup)
- Result: 60/60 PASS

## Evidence Ceiling

This smoke exercises deterministic allowlist parsing, injected bot runtime seams, Telegram command handlers, static source boundaries, shared static guardrails, and fake Telegram transports only. It does not call Telegram, launch browser checks, or run operator-only Codex-backed report execution.

## Scenario Results

| Scenario | Result | Evidence |
|---|---:|---|
| allowlist-valid-dedupe | PASS | Whitespace was trimmed, duplicate IDs were removed, first-seen order was preserved, and negative IDs remained authorized. |
| allowlist-fail-closed | PASS | Missing, empty, malformed, non-integer, mixed-validity, and unsafe-integer values all produced a closed allowlist. |
| bot-config-fail-closed | PASS | Missing/empty token and missing/malformed allowlist config returned specific closed failures.<br>Runtime start rejected invalid config before timer, DB, sender, or network work. |
| tick-calls-notifier | PASS | Tick opened the injected DB path, called injected notifyPendingApprovals once, passed sender/clock/sleep seams, and closed the DB. |
| overlap-guard | PASS | While one notifier execution was in flight, a concurrent tick returned skipped without opening another notifier run.<br>After the first tick released, a later tick ran normally. |
| open-db-failure-releases-guard | PASS | A thrown openDb failure surfaced to the caller and released the overlap guard.<br>The next tick opened the DB again, ran the notifier, and closed the successful DB handle. |
| telegram-sender-adapter | PASS | Adapter sent notification.text unchanged to every configured chat ID.<br>A failed chat send caused the adapter to throw, preserving notifier retry authority. |
| reject-command-parse | PASS | Canonical /reject parsed deterministically, trimmed reason text, and produced the exact operator guidance reply.<br>Malformed, unsafe, unknown, extra-colon, and overlong-reason variants were rejected while preserving parseable job IDs. |
| reject-scope-type-matrix | PASS | All 18 RejectScope x RejectType combinations matched the PLAN matrix. |
| reject-success-requeues | PASS | Allowed /reject updated the existing job row to queued attempt+1, rewound to draft_en, stored reject fields, and cleared stale notification/summary/error fields.<br>Exactly one rejected event was written for the old attempt and the reply matched the PLAN literal. |
| reject-zh-rewinds-translate | PASS | zh-only translation rejection rewound to translate_zh and en/bundle rewind helper remains draft_en. |
| reject-invalid-combo | PASS | Invalid scope/type combinations return a visible code with job ID and leave product state untouched. |
| reject-stale-attempt | PASS | Mismatched attempts return STALE_ATTEMPT, include the job ID, and write no events. |
| reject-status-mismatch | PASS | Non-awaiting jobs return STATUS_MISMATCH, include the job ID, and write no events. |
| reject-duplicate-prevention | PASS | A repeated identical reject writes one rejected event total and the second command sees the updated row. |
| reject-race-lost-after-read | PASS | An injected interleaving after initial read and before CAS produced a visible stale/status/race reply with no losing rejected event or partial mutation.<br>Source assertion confirms the reject mutation path has an explicit BEGIN IMMEDIATE/COMMIT/ROLLBACK transaction boundary. |
| reject-unauthorized-known-job | PASS | Unauthorized parseable known-job command wrote one unauthorized audit event, sent no reply, and left job state unchanged. |
| reject-unauthorized-unknown-job | PASS | Unauthorized unknown-job command sent no reply and wrote no fake-job audit event. |
| reject-allowlisted-malformed-visible | PASS | Allowlisted malformed command received a visible INVALID_COMMAND reply with job ID when parseable, and bare INVALID_COMMAND when no job ID was parseable.<br>Malformed allowlisted commands wrote no unauthorized audit event. |
| approve-command-parse | PASS | Canonical /approve and bot-mentioned /approve parsed job ID plus positive safe-integer attempt.<br>Missing, malformed, zero/negative, unsafe, and extra-token variants were rejected. |
| approve-malformed-jobid-preserved | PASS | Malformed /approve variants preserve a recoverable job ID in parser results and visible replies.<br>Bare /approve returns INVALID_COMMAND without inventing a job ID or writing an event. |
| approve-unauthorized-known-job | PASS | Unauthorized parseable known-job approve wrote one unauthorized event, sent no reply, and performed no filesystem or job mutation. |
| approve-unauthorized-unknown-job | PASS | Unauthorized unknown-job approve sent no reply, wrote no event, and created no reports directory. |
| approve-unknown-job-visible | PASS | Allowlisted unknown-job approve returned UNKNOWN_JOB with job ID and did not mutate DB/filesystem state. |
| approve-stale-attempt | PASS | Mismatched approve attempts return STALE_ATTEMPT, include the job ID, and leave source/files/events untouched. |
| approve-status-mismatch | PASS | Non-awaiting approve returns STATUS_MISMATCH and leaves DB/filesystem state untouched. |
| approve-source-validation | PASS | Missing English, Chinese, sources.json, and research bundle artifacts each return PUBLISH_SOURCE_MISSING.<br>Failed source validation writes no events, preserves awaiting_approval, and keeps source attempts for forensics. |
| approve-success-publishes-bundle | PASS | Allowed approve staged and atomically published reports, research, and sources into reports/2026-W47-ai-trends.<br>DB row is published with preserved report metadata and exactly one promoted event carrying the authoritative publish_manifest.<br>Only the approved attempt was cleaned up and fake git received a path-bounded plan. |
| approve-idempotent-repromote | PASS | Repeated approve after .runs cleanup succeeded by comparing reports/ against promoted publish_manifest.<br>The no-op re-promote wrote no duplicate promoted event. |
| approve-rename-before-db-recovery | PASS | A simulated crash after final rename left reports/ present but DB unmodified and source preserved.<br>Retry recovered by checksum and completed the DB publish with one promoted event. |
| approve-rename-succeeded-cas-lost | PASS | When final rename succeeded but DB CAS lost to a status change, approve returned a visible error.<br>The just-renamed final directory was removed, no promoted event was written, and source remained for forensics. |
| approve-existing-destination-cas-lost | PASS | Pre-retry status drift after a rename crash removed the unauthoritative final reports dir, wrote no promoted event, and preserved source.<br>Retry-time CAS drift during existing-destination recovery also removed the final reports dir and preserved source for forensics. |
| approve-checksum-divergence-refused | PASS | Preexisting divergent destination checksums were refused with PUBLISH_ARTIFACT_DIVERGED and no DB/source mutation. |
| approve-duplicate-prevention | PASS | A repeated identical approve after publication is idempotent and leaves exactly one promoted event. |
| approve-race-lost-after-read | PASS | An injected interleaving before DB CAS returned STALE_ATTEMPT with no promoted event or orphan reports directory. |
| approve-runs-cleanup | PASS | Successful approve deleted only the current approved attempt directory and preserved another attempt.<br>A failed approve preserved its source attempt for forensics. |
| approve-cleanup-failure-visible | PASS | Injected source cleanup failure was non-blocking: job stayed published and promoted event remained authoritative.<br>The approve reply and cleanup_failed event both exposed cleanup diagnostics. |
| approve-git-commit-failure-nonblocking | PASS | Fake git committer failure was non-blocking: job stayed published and promoted event remained authoritative.<br>A git_commit_failed event captured diagnostics and fake plan assertions proved path-bounded argv semantics. |
| status-command-parse | PASS | Canonical /status and bot-mentioned /status parsed a single job ID.<br>Extra-token malformed status preserved the parseable job ID while bare /status exposed no fake job ID. |
| status-malformed-jobid-preserved | PASS | Allowlisted malformed /status with a recoverable job token returned INVALID_COMMAND with that job ID.<br>Malformed allowlisted status wrote no unauthorized audit event. |
| status-bare-invalid-no-fake-jobid | PASS | Bare /status returned INVALID_COMMAND without a colon or invented job ID.<br>Bare allowlisted status wrote no unauthorized audit event. |
| status-known-job-summary | PASS | Allowlisted known-job status returned deterministic DB-backed job, status, attempt, stage, week, and summary fields.<br>Known-job status wrote no events. |
| status-unknown-job-visible | PASS | Allowlisted unknown-job status returned UNKNOWN_JOB with job ID and wrote no event. |
| status-unauthorized-known-job | PASS | Unauthorized parseable known-job status wrote one unauthorized event, sent no reply, and left the job row unchanged. |
| status-unauthorized-unknown-job | PASS | Unauthorized unknown-job status sent no reply and wrote no fake-job audit event. |
| status-read-only-no-mutation | PASS | Allowlisted known-job status left the full job row, event count, and filesystem sentinel unchanged. |
| status-published-manifest-authority | PASS | Published status summarized artifact_dir plus DB-event publish_manifest file count and first-12 aggregate digest.<br>Source assertions confirm status handling does not inspect .runs or call promoteJob. |
| status-failed-job-error-visible | PASS | Failed-job status includes failed state and a bounded DB-backed error excerpt. |
| status-last-notify-error-visible | PASS | Status includes a bounded last_notify_error excerpt when the DB row carries one. |
| status-approval-summary-visible | PASS | Awaiting-approval status prefers the first Evidence Grade warning line as the bounded summary excerpt. |
| command-long-poll-timeout | PASS | Default command polling issued getUpdates with timeout=30 and no offset on the immediate request.<br>Telegram request timeout remains distinct from the local command poll interval and notifier tick interval. |
| command-long-poll-offset | PASS | After update_id=41, the next getUpdates request used offset=42.<br>The long-poll timeout stayed present on the offset request. |
| command-long-poll-malformed-onerror | PASS | Malformed Telegram getUpdates payload surfaced through the injected onError seam. |
| command-long-poll-overlap-guard | PASS | A scheduled callback during an in-flight long poll did not issue a second getUpdates request.<br>After the pending long poll settled, a later scheduled callback issued the next request normally. |
| command-long-poll-stop-clears-future-polls | PASS | stop() cleared the local command poll interval and prevented later fake-timer triggers from polling.<br>Calling stop() before start or after an already-stopped transport remained safe. |
| bot-command-wiring | PASS | startBotRuntime registered /approve, /reject, and /status on a fake command transport, opened the configured DB path per command, replied through the command seam, and left notifier tick orchestration separate.<br>/status summarized a configured DB job without writing events or calling notifyPendingApprovals. |
| boundary-static-check | PASS | Cycle-scope boundary check ran in active-slice mode and saw changed files: docs/preflight/report-create-smoke.md, docs/preflight/report-remind-smoke.md, docs/preflight/report-status-smoke.md, package.json, scripts/bot-smoke.ts, scripts/report-create-smoke.ts, scripts/report-remind-smoke.ts, scripts/report-status-smoke.ts, docs/preflight/report-show-smoke.md, scripts/report-show-smoke.ts, src/bin/report-show.ts.<br>Synthetic Slice 4.12 report:create files resolve to inherited-surface mode without a bot-smoke exemption.<br>Synthetic Slice 4.13 report:remind files resolve to inherited-surface mode without a bot-smoke exemption.<br>Synthetic Slice 4.14 report:status files resolve to inherited-surface mode without a bot-smoke exemption.<br>Synthetic Slice 4.15 report:show files resolve to inherited-surface mode without a bot-smoke exemption.<br>Synthetic active-slice scope check rejects out-of-scope prompt product files.<br>Changed runtime sources contain no prompt/LLM/preflight/Codex dependency, report-run execution surface, or broad process spawn surface.<br>commands.ts and product support surfaces stayed out of scope; bot.ts contains no abort plumbing.<br>Smoke source contains no Telegram fetch/API network path, commands.ts does not duplicate notifier orchestration, and status handling does not call promoteJob or inspect .runs. |
| dependency-boundary-check | PASS | Telegram SDK/network concept-class checks are shared and absent from notifier.ts, commands.ts, and promote.ts.<br>commands.ts does not add Telegram network or new publish/process surfaces for /status, and package.json exposes only the expected bot runtime and bot-smoke command surfaces. |
| bot-db-path-cwd | PASS | Default DB path resolved to /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-bot-smoke-2026-05-08T16-15-38.083Z/bot-db-path-cwd/runtime-cwd/.data/content.db.<br>Default tick interval remains 10000. |
| no-preflight-codex-survivability | PASS | Changed bot, allowlist, and command surfaces have no preflight, Codex smoke, LLM, prompt, process-spawn, or report-run execution dependency. |
