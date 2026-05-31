# Telegram Image Approval Smoke Evidence

- Command: `bun run telegram-image-approval-smoke`
- Generated: 2026-05-31T05:19:44.202Z
- Result: 9/9 PASS
- Evidence ceiling: hermetic smoke/static evidence only; no live Telegram client observation.

| Scenario | Status | Details |
| --- | --- | --- |
| image-send-photo-success | PASS | Safe image job sent one Telegram photo attachment.<br>Caption included verdict, 3/3 criteria count, and approve/reject command hints. |
| text-regression-send-message | PASS | Text report awaiting approval still used sendMessage.<br>Message matched the exact formatApprovalNotification output. |
| send-photo-unavailable-fallback | PASS | SendPhoto-less transport used a warning sendMessage fallback.<br>Fallback told the operator to inspect local image and verdict artifacts before approving. |
| oversize-photo-send-document | PASS | Validated oversize PNG still passed notifier artifact gates.<br>HTTP transport selected sendDocument locally instead of blind text fallback. |
| unsafe-run-dir-zero-send | PASS | Absolute, parent-traversal, sibling, and mismatched run_dir cases failed closed.<br>Each case recorded notify_failed with zero sender calls and no notified event. |
| unsafe-image-zero-send | PASS | Symlink, directory, missing image, non-PNG, and bad-IHDR image cases failed closed.<br>Unsafe image cases made zero sender calls and recorded only notify_failed. |
| bad-metadata-zero-send | PASS | Missing and unparseable spec.json/verdict.json cases failed closed.<br>Metadata failures made zero sender calls and recorded no notified events. |
| caption-truncation-preserves-commands | PASS | Long caption truncated deterministically to 1024 chars.<br>Approve/reject command hints, verdict, and criteria count survived truncation. |
| bot-transport-send-photo-static | PASS | Static check found additive sendPhoto/sendDocument transport support and cwd notifier wiring.<br>src/telegram/commands.ts contains no image-upload transport changes. |

## External Execution

- No real Telegram network call was made; HTTP behavior used an injected fake fetch.
- No real bot token, chat id, image provider, vision judge, or `content:image-run` execution was used.
- Temporary DB and `.runs` artifacts were created under the OS temp directory and removed in a `finally` path.

