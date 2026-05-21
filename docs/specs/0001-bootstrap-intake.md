# Spec 0001 — Bootstrap intake: report:create inserts a queued job (v2)

**Author:** operator
**Scope:** smallest vertical slice of content-zoe v1 per PLAN.md
**Mode:** DIRECT (no fanout/debate — single-implementer unit)
**Drafted:** 2026-04-23 (from openclaw-healthcare driver session, post-Issue-1C smoke)

> Current runbook note: this historical bootstrap spec predates Slice 4.27.
> Current `report:create` commands must include `--purpose production|validation`;
> the job id remains derived as `<week>-ai-trends` and is then passed to
> `report:run`.

## User story

As operator, I want to run:

```bash
bun run report:create --week 2026-W17 --topic "AI trends"
```

and receive a ULID job-id on stdout. A row appears in `.data/content.db#jobs` with `status='queued'`, `current_stage='research'`, `attempt_number=1`, `locales='en,zh'` (default). A second invocation for the same week without `--force` must refuse; with `--force` it discards the prior job (and its events) and inserts fresh.

`--locales en` is the supported override; `--locales <anything-else>` rejects with `INVALID_LOCALES`.

No LLM. No pipeline. No Telegram. No preflight. Just the intake endpoint.

## Why this slice first

PLAN.md's design risk concentrates in three places this slice exercises:

1. SQLite schema correctness + WAL/busy_timeout/synchronous pragmas (two-process safety).
2. `BEGIN IMMEDIATE` tx shape for attempt-increment race resolution.
3. Topic sanitization + CLI arg parsing conventions.

Everything else (LLMProvider, stage handlers, bot, promote) layers cleanly on top.

## In scope (this slice only)

- `package.json` — `content-zoe`, private, Bun runtime, scripts: `report:create`, `typecheck`, `test`.
- `tsconfig.json` — strict, target ES2022, moduleResolution bundler.
- `.gitignore` — already written; includes `.data/`, `.runs/`, `.env`, `node_modules/`, `reports/.tmp-*/`.
- `.env.example` — `TELEGRAM_BOT_TOKEN=`, `OPERATOR_CHAT_IDS=` (placeholders only).
- `src/types.ts` — full `Job`, `Event`, `Stage`, `RejectType`, `RejectScope`, `Locale` types per PLAN.md §Data model.
- `src/db.ts` — `bun:sqlite` open at `.data/content.db`, apply `PRAGMA journal_mode=WAL; busy_timeout=5000; synchronous=NORMAL` on every open, run the full jobs+events migration idempotently (safe to call multiple times), export typed prepared-statement helpers.
- `src/security/sanitize.ts` — `sanitizeTopic(raw: string): string` strips shell metacharacters (`$(){}\`|&;<>` and their Unicode homoglyphs) + prompt-injection tokens (`ignore previous`, `disregard`, `system:`) case-insensitively. Return type-branded `Sanitized`.
- `src/bin/report-create.ts` — argparse, sanitize, `BEGIN IMMEDIATE` tx → insert-or-abort, print ULID on success, exit 0. Non-zero with specific error code (`WEEK_EXISTS`, `TERMINAL_WEEK_EXISTS`, `INVALID_WEEK_KEY`, `INVALID_LOCALES`) on failure.

## CLI contract

```bash
bun run report:create --week <YYYY-Www> --topic "..." [--locales en,zh|en] [--force]
```

- `--week` is required; regex `/^\d{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$/`.
- `--topic` is required; passed through `sanitizeTopic` before persisting.
- `--locales` is optional; defaults to `en,zh`. Only `en` and `en,zh` accepted.
- `--force` is optional; when present, discards prior non-terminal row for the same `week_key`. Terminal rows are protected (see below).

## `--force` semantics (locked)

On `--force` with an existing non-terminal row for `week_key`:

Inside a single `BEGIN IMMEDIATE` transaction:

1. `DELETE FROM events WHERE job_id = <prior.id>`
2. `DELETE FROM jobs WHERE week_key = <week>`
3. `INSERT INTO jobs ...` new ULID, `attempt_number = 1`, `status='queued'`, `current_stage='research'`.

This is the simplest semantic consistent with PLAN.md's `UNIQUE(week_key)` constraint. Event history is discarded along with the job — rejection history is only meaningful across attempts within a single job, so a forced restart correctly resets both. Terminal rows (`status IN ('published','failed')`) are NOT replaced — v1 refuses `--force` against terminal rows with `TERMINAL_WEEK_EXISTS` (can't overwrite published reports by accident).

## Out of scope (deferred to later slices)

`src/llm/*`, `src/pipeline/*`, `src/telegram/*`, `src/preflight.ts`, `src/bin/{report-run,report-remind,report-status,bot}.ts`, `prompts/*.md`, `docs/SOUL.md`, full `AGENTS.md` content (placeholder OK), doc moves into `docs/planning/`, addendum deletions.

## Acceptance criteria (binary)

### Runtime behavior

1. `bun install && bun x tsc --noEmit && bun run test` all exit 0.
2. Fresh DB: `bun run report:create --week 2026-W17 --topic "AI trends"` prints a 26-char ULID and exits 0.
3. Row check: `sqlite3 .data/content.db "SELECT week_key, topic, status, current_stage, attempt_number, locales FROM jobs WHERE week_key='2026-W17'"` returns exactly `2026-W17|AI trends|queued|research|1|en,zh`.
4. Pragma check: `sqlite3 .data/content.db "PRAGMA journal_mode; PRAGMA busy_timeout; PRAGMA synchronous;"` returns `wal|5000|1`.
5. Duplicate refusal (non-terminal): re-running AC-2 exits non-zero with stdout/stderr containing `WEEK_EXISTS`; no new row written (`SELECT COUNT(*)` remains 1).
6. Forced reset (non-terminal): `bun run report:create --week 2026-W17 --topic "revised" --force` exits 0, new ULID printed on stdout differs from AC-2's ULID, `SELECT COUNT(*) FROM jobs WHERE week_key='2026-W17'` returns 1, `SELECT topic FROM jobs WHERE week_key='2026-W17'` returns `revised`, `SELECT COUNT(*) FROM events WHERE job_id=<AC-2's ULID>` returns 0.
7. Forced reset (terminal) — refused: manually `UPDATE jobs SET status='published' WHERE week_key='2026-W17'`, then `bun run report:create --week 2026-W17 --topic "x" --force` exits non-zero with `TERMINAL_WEEK_EXISTS`; row unchanged.
8. Locale override: `bun run report:create --week 2026-W18 --topic "..." --locales en` succeeds; stored `locales='en'`.
9. Invalid locales: `bun run report:create --week 2026-W19 --topic "..." --locales en,fr` exits non-zero with `INVALID_LOCALES`; no row written.
10. Invalid week: `bun run report:create --week "not-a-week" --topic "..."` exits non-zero with `INVALID_WEEK_KEY`; no row written.
11. Sanitization: `bun run report:create --week 2026-W20 --topic '$(rm -rf ~)'` succeeds, exits 0; stored topic contains no `$`, `(`, `)`, no control characters; exact sanitized form fixed in a test snapshot.

### Schema shape

12. `sqlite3 .data/content.db ".schema jobs"` output contains, in order: `id TEXT PRIMARY KEY`, `week_key TEXT NOT NULL UNIQUE`, `locales TEXT NOT NULL DEFAULT 'en,zh'`, `attempt_number INTEGER NOT NULL DEFAULT 1`, `CHECK (locales IN ('en', 'en,zh'))`.
13. `sqlite3 .data/content.db ".schema events"` output contains `FOREIGN KEY(job_id) REFERENCES jobs(id)`.
14. `sqlite3 .data/content.db "INSERT INTO jobs (id, week_key, topic, locales, status, current_stage, created_at, updated_at) VALUES ('x', '2026-W99', 't', 'en,fr', 'queued', 'research', 0, 0)"` fails with a CHECK-constraint error (validates CHECK is actually installed).

### Adversarial race

15. Two concurrent `bun run report:create` invocations for the same fresh week_key — exactly one succeeds (prints ULID, exits 0), the other exits non-zero with `WEEK_EXISTS`, no partial row-without-events or events-without-row state. Test forces the race via `Promise.all` + shared setup in the same bun process.

## Review gates

- **Plan-compliance review** (driver Claude in openclaw-healthcare): schema matches PLAN.md lines 110-148 exactly, including CHECK constraint, FK, indices.
- **Repo-standards review** (content-zoe claude + codex): argparse idiom, error-code taxonomy, type-branding for sanitized strings, test style, file layout.
- **Adversarial review** (content-zoe codex): focus on AC-15 (the race). Verify `BEGIN IMMEDIATE` actually prevents two concurrent inserts both succeeding; verify the losing process sees a recoverable error, not a crash; verify no half-written state on the losing side.

## Out-of-scope reviews deferred

Codex subprocess lifecycle (no LLM). Telegram handler wiring (no bot). Promote atomicity (no publish).

## Done definition

All 15 acceptance criteria pass locally + one approved review from each of the three gates. First feat commit message:

```
feat: bootstrap intake with jobs/events schema and report:create CLI

- package.json + tsconfig + .gitignore + .env.example
- src/db.ts with WAL+busy_timeout+NORMAL pragmas
- src/types.ts with Job/Event/Stage/RejectType/RejectScope/Locale
- src/security/sanitize.ts with sanitizeTopic
- src/bin/report-create.ts with BEGIN IMMEDIATE insert + --force cascade

Implements slice 0001 of PLAN.md.
Schema shape matches PLAN.md lines 110-148.
```
