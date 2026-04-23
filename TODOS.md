# TODOs — content-zoe

Captured from `/plan-eng-review` on 2026-04-23. These are deferred deliberately, not forgotten.

---

## TODO: Cost / token-budget guardrails per stage

**What:** Per-stage token-output cap and max-turn limit, separate from time-based timeout.

**Why:** A stage could complete in 5 minutes but burn $20 of API spend by recursing into too many web searches. Codex outside-voice review (2026-04-23) flagged: "Timeouts are not budget control. `research=20m` does not stop runaway token spend or excessive search churn."

**Pros:**
- Bounds worst-case cost per run.
- Cheap to add: capture token usage from `codex exec --json` event stream, abort if over threshold; or use `codex` CLI's own `-c max_turns=N` if 0.118.0 supports it.
- Catches a degradation pattern early (Codex deciding to web-search 50 things).

**Cons:**
- Premature limits cause false positives on legitimate deep research weeks.
- Need 3+ real runs before tuning the right ceiling.

**Context:** Defer to v1.1. Add to `codex-cli.ts` once you have observed real per-stage token costs from the first 3 weekly runs. Watch for upstream `codex` CLI adding native budget flags between now and then.

**Depends on / blocked by:** v1 must run cleanly first. Pre-req for any unattended (cron) operation.

---

## TODO: launchd / process supervision for the bot

**What:** macOS launchd plist that auto-restarts `bun run bot` if it dies; logs to `~/Library/Logs/content-zoe-bot.log`.

**Why:** The Telegram bot is the always-on process after Tension 1's split (one-shot `bun run report` + always-on `bun run bot`). Without supervision, the bot dies silently and you only notice when `/approve` produces no response.

**Pros:**
- Auto-recovery from crashes.
- File-backed logs for postmortems.
- ~30-line plist, well-documented pattern.

**Cons:**
- macOS-specific. (Linux equivalent: systemd unit.)
- Adds an installation step.

**Context:** Defer to v1.1 because v1 is going through manual smoke-test phase where you'll be hand-launching anyway. After the first successful weekly run, write the plist.

**Depends on / blocked by:** v1 daemon split + first successful smoke test.

---

## TODO: Multi-channel publisher (X thread, Telegram channel, Notion, blog)

**What:** Move from "promote to local `reports/` dir" to actual publishing via openclaw-market channels.

**Why:** Plan defers this to v1.1; this is the original product north star (content reaches an audience).

**Pros:** Closes the loop on the "content engine" vision.

**Cons:** Brings in openclaw-market Gateway dependency, multi-platform formatting, distribution failure-modes (rate limits, auth).

**Context:** v1 is "approve = local file." v1.1 should add at least one external channel (recommend Telegram personal channel as lowest friction). Don't tackle X thread formatting until v1.2.

**Depends on / blocked by:** OpenClaw Gateway accessibility (Open Question #4 from `implementation_plan.md`).

---

## TODO: Cron / scheduled triggers (Standing Orders)

**What:** Auto-fire weekly job creation per a schedule rather than manual `bun run report`.

**Why:** Once weekly cadence stabilizes, manually creating the job is friction.

**Pros:** True automation.

**Cons:** Requires v1.1 supervision (above) plus cost guardrails (above) — unattended runs amplify both gaps.

**Context:** Block until 6+ successful manual weekly runs. Codex outside voice was right that "until there is real pressure ... this should be a prompt pack, not a service" — cron promotes it from prompt-pack-with-bot to genuine service, and that should be earned by demonstrated weekly value.

**Depends on / blocked by:** Cost guardrails TODO + supervision TODO + 6+ weeks of manual operation history.

---

## TODO: Reorganize planning docs into `docs/planning/`

**What:** Move `task.md`, `implementation_plan.md`, `content_creation_assessment.md`, etc. into `docs/planning/` as the v1 code lands.

**Why:** Keeps the source root clean once `src/`, `package.json`, `README.md` arrive.

**Pros:** Cleaner repo browse experience.

**Cons:** Trivial; not a v1 effort.

**Context:** Do this as part of the first commit that adds `package.json`. Update `CLAUDE.md` references at the same time.

**Depends on / blocked by:** None — bundle with `git init`.
