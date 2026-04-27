# Codex CLI Web-Search Smoke — Evidence Report

**Slice:** cz Slice 1 (PLAN.md Issue 1C)
**Verdict:** PASS — live-web capability confirmed end-to-end via `codex exec --json`,
proven by structured tool events and a bounded child timeout.
**Run date:** 2026-04-27 (Gate 1 re-execute)
**Worker:** Claude (single coherent task; Codex only as smoke subject)
**Target branch:** `agent/4RArkCB3loKMbQuPntgju` in
`/Users/youjia/.openclaw-worktrees/4RArkCB3loKMbQuPntgju/target` (identity =
`/Users/youjia/dev/content-zoe`).

## 0. Gate 1 fixes applied

This re-execute addresses Gate 1 hc-Codex `REQUEST_CHANGES` against commit
`7cbd337`:

1. **Structured-event proof, not substring matching.** `scripts/codex-smoke.ts`
   no longer counts JSONL lines whose serialized form happens to contain the
   string `"web_search"`. It walks each parsed JSON event and matches only the
   canonical Codex shape `{ type: "item.started" | "item.completed", item: { type:
   "web_search", … } }` (and the `msg`-wrapped variant). The smoke pass
   condition depends on that structured count.
2. **Bounded child timeout.** `codex exec` is now wrapped by a `setTimeout` of
   `CZ_SMOKE_TIMEOUT_MS` (default `180_000`ms). On expiry the runner calls
   `proc.kill("SIGKILL")`, records `timedOut: true` in `summary.json`, prints
   `[codex-smoke] FAIL — codex exec exceeded <ms>ms; child was killed.`, and
   exits 1.

Scope of this re-execute: only `scripts/codex-smoke.ts` and
`docs/preflight/codex-smoke.md`. Governance files (`AGENTS.md`,
`ROLE_POSITIONING.md`, `CLAUDE.md`, `PLAN.md`, `TODOS.md`) are untouched.

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

Captured stream: `.runs/2026-04-27T15-20-40-250Z/transcript.jsonl`
(10 259 bytes, 34 events, all parse as JSON, zero parse errors).

Outer event-type breakdown (counted from `summary.json.transcript.eventTypeCounts`):

| `type` | Count |
|--------|-------|
| `thread.started` | 1 |
| `turn.started` | 1 |
| `turn.completed` | 1 |
| `item.started` | 13 |
| `item.completed` | 18 |

**Item-type breakdown** (counted from `summary.json.transcript.itemTypeCounts` —
i.e. the *nested* `item.type` field, which is the canonical tool identifier):

| `item.type` | Count |
|-------------|-------|
| `web_search` | 14 |
| `command_execution` | 10 |
| `agent_message` | 5 |
| `file_change` | 2 |

**Structured `web_search` events: 14** — paired as `started=7` + `completed=7`,
matching by `item.id`. This count comes from
`summary.json.transcript.webSearchEvents`, computed by walking each parsed
event and matching the canonical Codex tool-call shape, NOT by substring
matching. `agent_message` items are excluded by construction even when their
text mentions web_search in natural language — only items whose canonical
`item.type === "web_search"` are counted.

### Sample structured `web_search` event (transcript line 14, `item.completed`)

```json
{
  "type": "item.completed",
  "item": {
    "id": "ws_08dde9ae68c5cafe0169ef7eff724c8198b1f35e1ae95c30f5",
    "type": "web_search",
    "query": "AI news April 2026 OpenAI Anthropic Google this week April 2026",
    "action": {
      "type": "search",
      "query": "AI news April 2026 OpenAI Anthropic Google this week April 2026",
      "queries": [ "…domain-scoped follow-up queries…" ]
    }
  }
}
```

The `item.type === "web_search"` field is the structured signal the smoke
counts on. The `action.queries` array proves Codex actually invoked its search
tool with multiple, domain-scoped queries — the JSONL is real, not stub data.

## 3. `findings.md` provenance — green path

`findings.md` (2 047 bytes) was written **by Codex** inside the attempt
directory (`-C <attemptDir>` in the spawn args), not by the smoke runner.
Cross-referenced against the transcript:

- The findings name three frontier-model news items dated within
  "April 20-27, 2026", matching the smoke prompt's "this week" scope.
- Each item carries an explicit `Source:` URL (e.g.
  `https://openai.com/index/introducing-gpt-5-5/`), and the URLs' domains line
  up with `site:`-scoped queries observed in `web_search` items earlier in the
  same transcript.
- The file's first line is the "Interpretation: …" note Codex wrote, not a
  template the runner wrote — the runner only writes `summary.json`.

## 4. Pass / fail verdict — green path

**PASS — Codex live-web capability is functional on this host.**

Source of evidence: `summary.json` produced by the green-path run, plus
`transcript.jsonl` and `findings.md` in the same attempt directory.

| Check | Observed |
|-------|----------|
| `codex --version` callable | ✅ `codex-cli 0.125.0` |
| `bun run preflight` green path | ✅ exit 0, prints version |
| `bun run preflight` red path (PATH stripped of codex) | ✅ exit 1, message: `codex CLI is missing or unreachable on PATH` |
| Preflight memoization | ✅ assertCodexAvailable caches both success and failure |
| Preflight side-effect ban (no `AGENTS.md` write) | ✅ `git status` unchanged after preflight |
| `bun run codex-smoke` exit code | ✅ 0 |
| Bounded timeout configured | ✅ `timeoutMs: 180000` (default), env override via `CZ_SMOKE_TIMEOUT_MS` |
| Timeout NOT fired in green path | ✅ `timedOut: false`, `elapsedMs: 129268` |
| Attempt isolation (`.runs/<id>/`) | ✅ no `findings.md` or `*.jsonl` at repo root |
| Real JSONL transcript | ✅ 34 events, all parse, zero parse errors |
| Structured `web_search` count > 0 | ✅ **14** events with `item.type === "web_search"` (7 started + 7 completed) |
| Substring-match avoidance | ✅ count derived from parsed `item.type`, not `JSON.stringify().includes(...)` |
| `findings.md` produced via web_search | ✅ 2 047 bytes, sourced from Codex search queries |
| `.runs/` not committed | ✅ already gitignored at `.gitignore:3` |

## 5. Timeout-failure evidence — second run

To prove the bounded-timeout fix is not theoretical, a deliberately tight
budget run is preserved at `.runs/2026-04-27T15-18-22-646Z/`:

| Field | Value |
|-------|-------|
| `timeoutMs` | `90000` (env override `CZ_SMOKE_TIMEOUT_MS=90000`) |
| `timedOut` | `true` |
| `elapsedMs` | `90007` |
| `exitCode` | `137` (SIGKILL) |
| Transcript bytes | 3 780 |
| Structured `web_search` events captured before kill | 5 (started=3, completed=2 — third query was in flight) |
| `findings.md` produced | ❌ false (Codex was killed before writing) |
| `pass` | `false` |
| Console line | `[codex-smoke] FAIL — codex exec exceeded 90000ms; child was killed.` |

This run demonstrates:

1. The `setTimeout` fires at the configured budget (delta = 7ms over 90 000ms).
2. The runner calls `proc.kill("SIGKILL")` and the child terminates with exit
   code 137 (matches SIGKILL conventionally reported as `128 + 9`).
3. `summary.json` records `timedOut: true` and a clear failure summary line is
   printed to stderr.
4. The structured `web_search` counter still works on partial transcripts —
   the count of 5 (`3 + 2`) is consistent with mid-flight kill before the third
   query's `item.completed` arrived.

The default 180 s budget was chosen because the green-path run on this host
took ~129 s; 90 s is permissive enough to bound clearly-stuck behavior but too
tight for a successful real-world run, which is why the operator-facing default
was raised. Operators can still pin to 90 s for stricter CI use via
`CZ_SMOKE_TIMEOUT_MS=90000 bun run codex-smoke`.

## 6. Recommendation for the future `src/llm/codex-cli.ts` slice

**Stay Codex-only for the research-stage prompt tools, but make a Codex
outage non-fatal for non-research code paths.**

Justification:

1. **Capability is sufficient.** Codex emitted seven well-scoped web searches
   from a single high-level prompt, then synthesized a clean
   `findings.md` with citations. There is no functional gap that
   Tavily / Exa / Firecrawl would close for the research stage today. Adding
   one of those providers would mean either:
   - duplicating Codex's work (dead weight + cost), or
   - replacing Codex's web_search (rewriting the research-stage prompt for
     a different tool ontology).
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
   That risk is mitigated by re-running this smoke on every codex-cli upgrade
   (which the AGENTS.md pin enforces) and by the structured-event detector
   itself, which will silently report `webSearchEvents: 0` and fail the smoke
   if the wire contract drifts.
4. **Defer adapter complexity.** If a future product reason emerges (cost
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
bun run codex-smoke    # default 180 000 ms timeout; PASS on a healthy host
CZ_SMOKE_TIMEOUT_MS=90000 bun run codex-smoke
                       # tight budget: forces timeout to demonstrate kill path
```

Each `bun run codex-smoke` invocation creates a fresh attempt directory under
`.runs/<ISO-stamp>/` and writes `transcript.jsonl`, `stderr.log`,
`findings.md`, and `summary.json` under it. None of those files are committed;
`.runs/` is already gitignored.
