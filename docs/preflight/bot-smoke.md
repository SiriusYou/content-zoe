# Bot Smoke Evidence

- Command: `bun run bot-smoke`
- Started: 2026-05-03T18:12:39.215Z
- Finished: 2026-05-03T18:12:39.229Z
- Scenario root: /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-bot-smoke-2026-05-03T18-12-39.214Z (removed by finally-cleanup)
- Result: 13/13 PASS

## Evidence Ceiling

This smoke exercises deterministic allowlist parsing, injected bot runtime seams, static source boundaries, and fake Telegram transports only. It does not call Telegram, launch browser checks, or run operator-only Codex-backed report execution.

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
| no-command-handlers | PASS | Inspected bot.ts directly and found no command/hears/message handler registrations. |
| boundary-static-check | PASS | Stable base/status scope check saw only declared files: docs/preflight/bot-smoke.md, package.json, scripts/bot-smoke.ts, src/telegram/allowlist.ts, src/telegram/bot.ts.<br>Changed source surfaces contain no prompt/LLM/preflight/Codex dependency, operator report command dependency, DB schema/migration touch, or duplicate notifier mutation logic.<br>Smoke source contains no Telegram fetch/API network path. |
| dependency-boundary-check | PASS | Telegram SDK dependency imports are absent outside bot.ts; notifier.ts remains dependency-free.<br>package.json exposes only the expected bot runtime and bot-smoke command surfaces for this slice. |
| bot-db-path-cwd | PASS | Default DB path resolved to /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-bot-smoke-2026-05-03T18-12-39.214Z/bot-db-path-cwd/runtime-cwd/.data/content.db.<br>Default tick interval remains 10000. |
| no-preflight-codex-survivability | PASS | Bot and allowlist surfaces have no preflight, Codex smoke, LLM, prompt, or operator report command dependency. |
| no-command-placeholder-registrations | PASS | bot.ts contains no approve/reject/status strings and no inert command placeholder wording. |
