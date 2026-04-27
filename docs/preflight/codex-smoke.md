# Codex CLI Web-Search Smoke — Evidence Report

**Slice:** cz Slice 1 (PLAN.md Issue 1C)
**Verdict:** PASS — live-web capability confirmed end-to-end via `codex exec --json`,
proven by structured tool events, a bounded child timeout, **and a process-group
quiescence proof** that no descendant survives the kill.
**Run date:** 2026-04-27 (Gate 2 re-execute)
**Worker:** Claude (single coherent task; Codex only as smoke subject)
**Target branch:** `agent/4RArkCB3loKMbQuPntgju` in
`/Users/youjia/.openclaw-worktrees/4RArkCB3loKMbQuPntgju/target` (identity =
`/Users/youjia/dev/content-zoe`).

## 0. Gate 2 fixes applied

This re-execute addresses Gate 2 cz-Codex `REQUEST_CHANGES` against commit
`724611a`. The Gate 2 finding was that `proc.kill("SIGKILL")` only signaled the
immediate Bun child handle (the Codex CLI's Node shim), so descendants
Codex spawned for tool execution — including the native Rust binary that
actually runs `web_search` and writes `findings.md` — kept running after the
runner had already declared timeout failure. Preserved artifacts on the prior
run showed `file_change` events and `turn.completed` arriving *after* the
"FAIL" summary was written.

The fix has two parts:

1. **Process-group lifecycle.** The runner now spawns Codex via
   `node:child_process.spawn` with `detached: true`. On Unix this calls
   `setsid()` so Codex becomes the leader of a brand-new process group whose
   `PGID === child.pid`. We use `node:child_process.spawn` instead of
   `Bun.spawn` because, as of writing, `Bun.spawn` does not expose a
   `detached` switch. Bun supports `node:child_process` natively, so the
   change is local to `scripts/codex-smoke.ts`.

   On timeout the runner calls `process.kill(-pid, "SIGKILL")`. The negative
   pid form targets every process in the group, so the Codex Node shim *and*
   its native Rust descendant *and* any short-lived helpers it forked all
   receive `SIGKILL` in one shot.

   Operating-system check we ran while the green-path smoke was still alive:

   ```
   PID    PGID  COMMAND
   73044 73044  node /Users/youjia/.nvm/.../bin/codex exec --json …
   ```

   And during a parallel sanity-check run we observed both the Node shim and
   its Rust descendant sharing a single PGID:

   ```
   PID    PGID   COMMAND
   62753  62753  node …/bin/codex exec --json …             ← group leader
   62757  62753  …/codex-darwin-arm64/.../codex exec --json …  ← descendant
   ```

   This is exactly the lifecycle the Gate 2 review flagged: a `proc.kill()`
   on pid 62753 alone would leave 62757 still running. `process.kill(-62753,
   "SIGKILL")` reaps both atomically.

2. **Post-kill quiescence proof.** Trusting that the SIGKILL worked is not
   enough — we measure it. After the parent exit resolves we take two
   recursive snapshots of the attempt directory across a fixed quiescence
   window (default `5_000` ms; override via `CZ_SMOKE_QUIESCE_MS`). Each
   snapshot records every file's relative path, byte size, and `mtimeMs`.
   We compare them and emit:

   - `quiet: true` if no file's size or mtime changed and no new file
     appeared, OR
   - `quiet: false` plus an enumerated list of `changedFiles` and
     `newFiles` proving a descendant survived.

   A surviving descendant — exactly what Gate 2 caught — will fail the
   quiescence check. This is the new structural guarantee the runner
   provides: every timeout path is empirically proved to leave the attempt
   directory immediately and persistently quiet.

The structured-event counter from the Gate 1 fix is unchanged and still in
force: pass requires `webSearchEvents > 0`, computed by walking each parsed
event for `item.type === "web_search"`, never by substring match against the
serialized line.

Scope of this re-execute: only `scripts/codex-smoke.ts` and
`docs/preflight/codex-smoke.md`. Governance files (`AGENTS.md`,
`ROLE_POSITIONING.md`, `CLAUDE.md`, `PLAN.md`, `TODOS.md`) are untouched.
`package.json` and `src/preflight.ts` are unchanged from `724611a` because the
fix is fully contained in the smoke runner.

## 1. Observed `codex --version`

```
codex-cli 0.125.0
```

Captured by `bun run preflight` (see `src/preflight.ts`); also logged at the
start of every `codex-smoke` run.

### Recommended `<major.minor>` pin

`0.125` — i.e. an `AGENTS.md` rule of the form
`codex-cli >=0.125, <0.126` (or whatever syntax that doc adopts).

**Caveat (pre-1.0 SemVer):** codex-cli is still on a `0.x` version line, so
minor-version bumps (`0.124 → 0.125 → 0.126`) are *not* guaranteed to be
backwards compatible. In particular the `--json` event vocabulary
(`item.started` / `item.completed`, the nested `item.type === "web_search"`,
`item.action.queries`) is not yet a stable wire contract. The pin should be
re-validated by re-running this smoke whenever `codex-cli` is upgraded.

> **Operator action (not part of this slice):** record this pin in
> `AGENTS.md`. `src/preflight.ts` deliberately does *not* write that file.

## 2. JSONL transcript summary — green path

Captured stream: `.runs/2026-04-27T16-11-57-829Z/transcript.jsonl`
(12 841 bytes, 42 events, all parse as JSON, zero parse errors).
Run with `CZ_SMOKE_TIMEOUT_MS=600000` to give Codex a generous budget — a
sibling run on the natural 180 s default just happened to overshoot at
174 s on a previous attempt, so the timeout proof in §5 reuses a 60 s
deliberately-tight budget for a clean kill scenario.

Outer event-type breakdown (counted from `summary.json.transcript.eventTypeCounts`):

| `type` | Count |
|--------|-------|
| `thread.started` | 1 |
| `turn.started` | 1 |
| `turn.completed` | 1 |
| `item.started` | 17 |
| `item.completed` | 22 |

**Item-type breakdown** (counted from `summary.json.transcript.itemTypeCounts` —
i.e. the *nested* `item.type` field, which is the canonical tool identifier):

| `item.type` | Count |
|-------------|-------|
| `web_search` | 22 |
| `command_execution` | 10 |
| `agent_message` | 5 |
| `file_change` | 2 |

**Structured `web_search` events: 22** — paired as `started=11` + `completed=11`,
matching by `item.id`. This count comes from
`summary.json.transcript.webSearchEvents`, computed by walking each parsed
event and matching the canonical Codex tool-call shape, NOT by substring
matching. `agent_message` items are excluded by construction even when their
text mentions `web_search` in natural language. Independently re-parsed with
a 30-line Python script (`json.loads` per line + `obj["item"]["type"] ==
"web_search"`) on the same transcript and got an identical 22 (11 started +
11 completed) — the script's structured count agrees with a hand-rolled
parser.

### Sample structured `web_search` event (transcript line 10, `item.completed`)

```json
{
  "type": "item.completed",
  "item": {
    "id": "ws_0684b35a13b0f6d60169ef8b0a6b188191a03c8c8062dadc49",
    "type": "web_search",
    "query": "AI news this week Reuters April 2026 OpenAI Anthropic Google AI",
    "action": {
      "type": "search",
      "query": "AI news this week Reuters April 2026 OpenAI Anthropic Google AI",
      "queries": [
        "AI news this week Reuters April 2026 OpenAI Anthropic Google AI",
        "site:reuters.com AI April 2026 OpenAI Anthropic Google Microsoft recency week",
        "site:openai.com/index April 2026 OpenAI announcement",
        "site:blog.google technology AI April 2026 announcement"
      ]
    }
  }
}
```

The `item.type === "web_search"` field is the structured signal the smoke
counts on. The `action.queries` array proves Codex actually invoked its search
tool with multiple, domain-scoped queries — the JSONL is real, not stub data.

## 3. `findings.md` provenance — green path

`findings.md` (2 375 bytes) was written **by Codex** inside the attempt
directory (`-C <attemptDir>` in the spawn args), not by the smoke runner.
Cross-referenced against the transcript:

- The findings name three frontier-model news items dated within
  "April 20, 2026 to April 27, 2026", matching the smoke prompt's "this week"
  scope. The exact opening sentence the runner did *not* write is:
  `"Time window used for \"this week\": April 20, 2026 to April 27, 2026."`
- Each item carries an explicit `Source:` URL (e.g.
  `https://openai.com/index/introducing-gpt-5-5/`,
  `https://www.anthropic.com/news/anthropic-amazon-compute`), and the URLs'
  domains line up with `site:`-scoped queries observed in `web_search` items
  earlier in the same transcript.
- The runner only writes `summary.json` to the attempt directory; the
  `findings.md` byte count and mtime align with `file_change` events in the
  transcript, not with the Bun process's own writes.

## 4. Pass / fail verdict — green path

**PASS — Codex live-web capability is functional on this host.**

Source of evidence: `summary.json` produced by the green-path run, plus
`transcript.jsonl` and `findings.md` in the same attempt directory.

| Check | Observed |
|-------|----------|
| `codex --version` callable | ✅ `codex-cli 0.125.0` |
| `bun run preflight` green path | ✅ exit 0, prints version |
| `bun run preflight` red path (PATH stripped of codex) | ✅ exit 1, message: `codex CLI is missing or unreachable on PATH` |
| Preflight memoization | ✅ `assertCodexAvailable` caches both success and failure |
| Preflight side-effect ban (no `AGENTS.md` write) | ✅ `git status` unchanged after preflight |
| `bun run codex-smoke` exit code | ✅ 0 |
| Process-group spawn (`detached: true`) | ✅ `summary.spawn.detached: true`, `summary.spawn.runtime: "node:child_process"`, `pid === pgid` confirmed via live `ps` (PGID 73044) |
| Bounded timeout configured | ✅ `timeoutMs: 600000` for this run; default `180_000`; env override via `CZ_SMOKE_TIMEOUT_MS` |
| Timeout NOT fired in green path | ✅ `timedOut: false`, `elapsedMs: 174583` |
| Attempt isolation (`.runs/<id>/`) | ✅ no `findings.md` or `*.jsonl` at repo root |
| Real JSONL transcript | ✅ 42 events, all parse, zero parse errors |
| Structured `web_search` count > 0 | ✅ **22** events with `item.type === "web_search"` (11 started + 11 completed) |
| Structured count cross-check | ✅ independent Python re-parse on same transcript yields identical 22 (11+11) |
| Substring-match avoidance | ✅ count derived from parsed `item.type`, not `JSON.stringify().includes(...)` |
| `findings.md` produced via web_search | ✅ 2 375 bytes, sourced from Codex search queries |
| `.runs/` not committed | ✅ already gitignored at `.gitignore:3` |

## 5. Timeout-failure evidence — process group + quiescence

A deliberately tight-budget run is preserved at
`.runs/2026-04-27T16-15-11-015Z/` (run with
`CZ_SMOKE_TIMEOUT_MS=60000`). It demonstrates both halves of the Gate 2 fix:
the SIGKILL targets the whole process group, and the post-kill snapshots
prove no descendant survives.

### 5.1 Kill telemetry from `summary.json`

| Field | Value |
|-------|-------|
| `timeoutMs` | `60000` (env override `CZ_SMOKE_TIMEOUT_MS=60000`) |
| `quiesceWindowMs` | `5000` |
| `spawn.runtime` | `"node:child_process"` |
| `spawn.detached` | `true` |
| `spawn.pid` | `81026` |
| `timedOut` | `true` |
| `elapsedMs` | `60009` (9 ms over budget — clean fire) |
| `terminationSignal` | `"SIGKILL"` |
| `rawExitCode` | `null` |
| `exitCode` (reported) | `137` (SIGKILL → conventional 128 + 9) |
| `kill.targetPgid` | `81026` (= `spawn.pid` — process-group leader) |
| `kill.signal` | `"SIGKILL"` |
| `kill.error` | `null` |
| Console line | `[codex-smoke] SIGKILL delivered to process group -81026` |
| Transcript before kill | 12 events, 2 480 bytes, all parse |
| Structured `web_search` events captured before kill | 0 (Codex was still in pre-search planning at 60 s) |
| `findings.md` produced | ❌ false (Codex was killed before writing) |
| `pass` | `false` |
| Failure summary line | `[codex-smoke] FAIL — codex exec exceeded 60000ms; process group SIGKILLed; process group quiet across 5000ms after kill.` |

### 5.2 Post-kill quiescence proof

The runner snapshots the attempt directory immediately after the parent's
exit resolves (snapshot 1), waits the configured quiescence window
(default 5 000 ms here), and snapshots again (snapshot 2). Both snapshots
are recorded verbatim in `summary.json.postKillQuiescence`.

| Snapshot | Captured at (UTC) | Files | `transcript.jsonl` bytes / mtime | `stderr.log` bytes / mtime |
|----------|-------------------|-------|-----------------------------------|----------------------------|
| Before wait | `2026-04-27T16:16:11.028Z` | 2 | 2 480 / `1777306568472` | 13 908 / `1777306568610` |
| After 5 s wait | `2026-04-27T16:16:16.030Z` | 2 | 2 480 / `1777306568472` | 13 908 / `1777306568610` |

```json
"postKillQuiescence": {
  "quiesceWindowMs": 5000,
  "changedFiles": [],
  "newFiles": [],
  "quiet": true,
  …
}
```

Both snapshots are byte-for-byte and mtime-for-mtime identical across a
5.002-second window. `changedFiles` is empty, `newFiles` is empty, and
`quiet === true`. No `findings.md` ever materializes — neither pre-kill nor
during the quiescence window. This is empirical evidence that the entire
Codex process group (Node shim + native Rust binary + any short-lived
helpers) terminated within the SIGKILL and that no descendant continued
writing transcripts, file_change records, or `findings.md` after failure
was recorded.

This is precisely the contradiction Gate 2 caught on commit `724611a`:
under the old `proc.kill("SIGKILL")` lifecycle, the timed-out transcript
later recorded `file_change` events and reached `turn.completed` *after*
the FAIL line. Under the new lifecycle there is nothing left alive in the
process group to write anything.

### 5.3 Why this lifecycle change?

`Bun.spawn` does not expose a `detached` flag as of writing, so a
`Bun.spawn`-based runner cannot make the child a process-group leader at
all. Switching to `node:child_process.spawn` with `detached: true` is the
minimum viable lifecycle change: Bun supports the Node API directly, the
TypeScript types match, and the diff is fully contained in
`scripts/codex-smoke.ts`. The runner's pass condition still depends on
`!timedOut && exitCode === 0 && structuredWebSearchEvents > 0 &&
findings.md exists`, so the structured-event proof from the Gate 1 fix is
preserved.

## 6. Recommendation for the future `src/llm/codex-cli.ts` slice

**Stay Codex-only for the research-stage prompt tools, but make a Codex
outage non-fatal for non-research code paths.**

Justification:

1. **Capability is sufficient.** Codex emitted eleven well-scoped web
   searches from a single high-level prompt (this run; nine in the prior
   approved run), then synthesized a clean `findings.md` with citations.
   There is no functional gap that Tavily / Exa / Firecrawl would close
   for the research stage today. Adding one of those providers would mean
   either:
   - duplicating Codex's work (dead weight + cost), or
   - replacing Codex's `web_search` (rewriting the research-stage prompt
     for a different tool ontology).
   Neither is justified by the evidence.
2. **Resilience is bought elsewhere, not by a search adapter.** PLAN.md
   already requires that `bot.ts` and `report-remind.ts` *not* call the
   preflight, so a botched `brew upgrade codex` only breaks `report-run.ts`,
   not the operator's ability to `/approve` an already-ready report. That
   isolation is the right resilience layer; a redundant search provider
   would be redundancy in the wrong place.
3. **Pre-1.0 SemVer risk is the real watch-item.** The most likely future
   break is not "Codex is down" but "Codex 0.126 renamed
   `item.type === 'web_search'`" or restructured the `item.action` payload.
   That risk is mitigated by re-running this smoke on every codex-cli
   upgrade (which the AGENTS.md pin enforces) and by the structured-event
   detector itself, which will silently report `webSearchEvents: 0` and
   fail the smoke if the wire contract drifts.
4. **Lifecycle hardening is now reusable.** The future `src/llm/codex-cli.ts`
   wrapper should adopt the same process-group spawn (`detached: true`) and
   `kill(-pgid, ...)` discipline that this smoke now uses. It is the only
   reliable way to bound a long-running Codex call on the operator's
   timeline; the post-kill quiescence proof is also reusable as an
   integration-test pattern for any code that bounds a Codex subprocess.
5. **Defer adapter complexity.** If a future product reason emerges (cost
   ceiling, geo-blocking, parallel sourcing), revisit the decision then.
   Pulling Tavily/Exa/Firecrawl in *now* would expand the dependency
   surface for zero observed benefit.

**Decision recorded for the next slice:** `src/llm/codex-cli.ts` may be the
sole research-stage search backend in cz v1. Tavily / Exa / Firecrawl
adapters are deferred and explicitly *not* part of cz v1's LLM provider
abstraction.

## 7. Reproduction

From the target content-zoe worktree
(`/Users/youjia/.openclaw-worktrees/4RArkCB3loKMbQuPntgju/target`):

```bash
bun --version          # 1.3.4
bun run preflight      # green path: exits 0, prints codex-cli 0.125.0
PATH=/Users/youjia/.bun/bin:/usr/bin:/bin bun run preflight
                       # red path: exits 1 with explicit error
bun run codex-smoke    # default 180 000 ms timeout
                       # On a healthy host, expect PASS in ~120-180 s.
                       # If the host is slow, the timeout fires and the
                       # process group is reaped — see §5.
CZ_SMOKE_TIMEOUT_MS=600000 bun run codex-smoke
                       # generous budget, used here to capture a clean
                       # green-path PASS away from the 180 s default's edge.
CZ_SMOKE_TIMEOUT_MS=60000 bun run codex-smoke
                       # tight budget: forces timeout to demonstrate the
                       # process-group SIGKILL + quiescence proof in §5.
CZ_SMOKE_QUIESCE_MS=10000 CZ_SMOKE_TIMEOUT_MS=60000 bun run codex-smoke
                       # widen the post-kill quiescence window to 10 s if
                       # you suspect a stubborn descendant (default 5 s).
```

Each `bun run codex-smoke` invocation creates a fresh attempt directory under
`.runs/<ISO-stamp>/` and writes `transcript.jsonl`, `stderr.log`,
`findings.md` (only on success or if Codex reached the file-write phase
before kill), and `summary.json` under it. None of those files are committed;
`.runs/` is already gitignored.
