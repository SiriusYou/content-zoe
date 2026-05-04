# Bot Smoke Evidence

- Command: `bun run bot-smoke`
- Started: 2026-05-04T06:06:14.147Z
- Finished: 2026-05-04T06:06:14.223Z
- Scenario root: /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-bot-smoke-2026-05-04T06-06-14.146Z (removed by finally-cleanup)
- Result: 25/25 PASS

## Evidence Ceiling

This smoke exercises deterministic allowlist parsing, injected bot runtime seams, reject command product-row authority, static source boundaries, shared static guardrails, and fake Telegram transports only. It does not call Telegram, launch browser checks, or run operator-only Codex-backed report execution.

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
| bot-command-wiring | PASS | startBotRuntime registered /reject on a fake command transport, opened the configured DB path, replied through the command seam, and left notifier tick orchestration separate. |
| no-approve-or-status-handler | PASS | Changed command surfaces register only /reject and contain no /approve or /status handler placeholders. |
| boundary-static-check | PASS | Stable base/status scope check saw only declared files: docs/preflight/bot-smoke.md, scripts/bot-smoke.ts, src/telegram/bot.ts, src/telegram/commands.ts.<br>Changed runtime sources contain no prompt/LLM/preflight/Codex dependency, report-run execution surface, or process spawn surface.<br>Smoke source contains no Telegram fetch/API network path, and commands.ts does not duplicate notifier orchestration. |
| dependency-boundary-check | PASS | Telegram SDK dependency imports are absent outside bot.ts; notifier.ts and commands.ts remain dependency-free.<br>package.json exposes only the expected bot runtime and bot-smoke command surfaces for this slice. |
| bot-db-path-cwd | PASS | Default DB path resolved to /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-bot-smoke-2026-05-04T06-06-14.146Z/bot-db-path-cwd/runtime-cwd/.data/content.db.<br>Default tick interval remains 10000. |
| no-preflight-codex-survivability | PASS | Bot, allowlist, and command surfaces have no preflight, Codex smoke, LLM, prompt, process-spawn, or report-run execution dependency. |
