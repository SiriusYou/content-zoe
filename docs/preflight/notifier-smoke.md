# Notifier Smoke Evidence

- Command: `bun run notifier-smoke`
- Started: 2026-05-22T03:23:18.270Z
- Finished: 2026-05-22T03:23:18.337Z
- Scenario root: /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-notifier-smoke-2026-05-22T03-23-18.268Z (removed by finally-cleanup)
- Result: 10/10 PASS
- Default notification limit: 10

## Evidence Ceiling

This smoke exercises only the local deterministic notifier module with injected fake senders, clocks, and sleeps. It does not instantiate a Telegram client, call Telegram, run real Codex report execution, or verify browser behavior.

## Scenario Results

| Scenario | Result | Evidence |
|---|---:|---|
| eligible-row-success | PASS | Awaiting-approval row with stored summary sent once.<br>CAS success set notified_at, cleared last_notify_error, and inserted one notified event. |
| ineligible-rows-skipped | PASS | queued, failed, published, and already-notified rows were not selected.<br>No eligible row case produced zero sends, zero events, and no notify-field mutation. |
| retry-then-success | PASS | First send failed, second send succeeded.<br>Sender calls were exactly 2, sleep sequence was [1000], and one notified event was written. |
| reject-during-backoff-abandons | PASS | The row was changed out of awaiting_approval during backoff.<br>Notifier re-read before retry, abandoned silently, sent no stale retry, wrote no events, and left notify fields unchanged. |
| final-failure-records-error | PASS | Sender failed the initial call plus all three retries.<br>Sender calls were exactly 4, sleep sequence was [1000,5000,30000], last_notify_error persisted, and one notify_failed event was written. |
| missing-summary-no-send | PASS | Null and whitespace-only approval summaries were treated as malformed eligible rows.<br>No sender call was made; each row persisted last_notify_error and one notify_failed event. |
| limit-bounds-batch | PASS | Five eligible rows with explicit limit=2 selected and attempted only two notifications.<br>Default limit remains 10; explicit smaller limit bounded the batch. |
| message-contract-static-check | PASS | formatApprovalNotification includes job id, attempt number, stored summary body, /approve, and structured /reject scope:type grammar. |
| boundary-static-check | PASS | Inspected src/telegram/notifier.ts directly for env/argv/spawn/Telegram/LLM/prompt/report-read guardrails.<br>Confirmed package.json adds only the deterministic notifier-smoke command surface expected by this slice. |
| constant-export-static-check | PASS | Imported NOTIFIER_RETRY_DELAYS_MS as exactly [1000,5000,30000].<br>Imported NOTIFY_LIMIT_DEFAULT=10 and observed default batch selection bounded to 10 of 12 eligible rows. |
