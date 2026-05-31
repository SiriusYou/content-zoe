# Telegram Bot Operation

## Required Environment

- `TELEGRAM_BOT_TOKEN`: Bot token from BotFather.
- `OPERATOR_CHAT_IDS`: Comma-separated numeric chat ID allowlist.

Do not commit tokens, chat IDs, screenshots containing tokens, or `.env*` files.

## Startup

Run the bot from the repository root:

```bash
bun run bot
```

The runtime opens `.data/content.db`, polls Telegram commands, and checks pending approval notifications on the configured interval.

## Operator Commands

```text
/status <job-id>
/approve <job-id> <attempt>
/reject <job-id> <attempt> <scope>:<type> <reason>
```

For image jobs, use image reject types:

```text
/reject <job-id> <attempt> image:subject_off <reason>
/reject <job-id> <attempt> image:style_off <reason>
/reject <job-id> <attempt> image:composition_off <reason>
/reject <job-id> <attempt> image:safety <reason>
```

## Image Approval Rule

Approve image jobs only after viewing the Telegram image preview. If the bot says `IMAGE PREVIEW UNAVAILABLE - inspect locally before approving.`, inspect the local artifacts first:

```bash
bun run content:image-show <job-id> --artifact image
bun run content:image-show <job-id> --artifact verdict
```

Then approve or reject using the existing Telegram commands.

## Token And Chat ID Notes

Create or inspect the bot token through BotFather in Telegram. To find the operator chat ID, send a message to the bot and inspect the ID using a local, temporary diagnostic method or Telegram's own bot tooling. Keep both values outside git and pass them through the shell environment or an operator-owned secret manager.
