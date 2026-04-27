# Codex CLI Web-Search Smoke — Evidence Report

**Slice:** cz Slice 1 (PLAN.md Issue 1C)
**Verdict:** PASS — live-web capability confirmed end-to-end via `codex exec --json`.
**Run date:** 2026-04-27
**Worker:** Claude (single coherent task; Codex only as smoke subject)
**Target branch:** `agent/4RArkCB3loKMbQuPntgju` in
`/Users/youjia/.openclaw-worktrees/4RArkCB3loKMbQuPntgju/target` (identity =
`/Users/youjia/dev/content-zoe`).

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
(`item.started` / `item.completed`, `item.type === "web_search"`,
`action.queries`) is not yet a stable wire contract. The pin should be
re-validated by re-running this smoke whenever `codex-cli` is upgraded.

> **Operator action (not part of this slice):** record this pin in
> `AGENTS.md`. `src/preflight.ts` deliberately does *not* write that file.

## 2. JSONL transcript summary

Captured stream: `.runs/2026-04-27T14-38-57-932Z/transcript.jsonl` (8 863
bytes, 32 events, all parse as JSON).

Event-type breakdown (from `transcript.jsonl`):

| `type` | Count |
|--------|-------|
| `thread.started` | 1 |
| `turn.started` | 1 |
| `turn.completed` | 1 |
| `item.started` | 12 |
| `item.completed` | 17 |

`web_search`-bearing events: **12** (six `item.started` + six matching
`item.completed`, paired by `item.id`). The smoke runner counts every JSONL
line whose serialized form contains `web_search`; these were structured tool
items, not coincidental string matches.

### Sample `web_search` event (transcript line 14)

```json
{
  "type": "item.completed",
  "item": {
    "id": "ws_052e44cdcdb55c760169ef7546572881919f595024ac2e84b8",
    "type": "web_search",
    "query": "AI news April 2026 OpenAI Google Anthropic April 20 2026 27 2026",
    "action": {
      "type": "search",
      "query": "AI news April 2026 OpenAI Google Anthropic April 20 2026 27 2026",
      "queries": [
        "AI news April 2026 OpenAI Google Anthropic April 20 2026 27 2026",
        "site:openai.com April 2026 OpenAI news",
        "site:blog.google/technology/ai/ April 2026 AI announcement",
        "site:anthropic.com/news April 2026 Anthropic news"
      ]
    }
  }
}
```

This proves Codex actually called its `web_search` tool with multiple,
domain-scoped queries during the smoke — the JSONL is real, not stub data.

## 3. `findings.md` provenance

`findings.md` (1 386 bytes) was written **by Codex** inside the attempt
directory (`-C <attemptDir>` in the spawn args), not by the smoke runner.
Cross-referenced against the transcript:

- The findings name three sources whose domains match the
  `site:openai.com`, `site:blog.google/...`, `site:anthropic.com/news`
  queries seen on transcript lines 14, 16, 18 (etc.).
- The published-date range stated in the findings ("April 20-27, 2026")
  matches the temporal scope of the smoke prompt ("3 notable AI news items
  from this week").
- Every news item in `findings.md` carries a `Source:` URL — i.e. Codex
  emitted the file *after* the web_search round-trips, not before.

## 4. Pass / fail verdict

**PASS — Codex live-web capability is functional on this host.**

| Check | Observed |
|-------|----------|
| `codex --version` callable | ✅ `codex-cli 0.125.0` |
| `bun run preflight` green path | ✅ exit 0, prints version |
| `bun run preflight` red path (PATH stripped of codex) | ✅ exit 1, message: `codex CLI is missing or unreachable on PATH` |
| Preflight memoization (3 calls in one process) | ✅ exactly 1 underlying `codex --version` spawn observed |
| Preflight side-effect ban (no `AGENTS.md` write, no other writes) | ✅ `git status` unchanged after preflight |
| `bun run codex-smoke` exit code | ✅ 0 |
| Attempt isolation (`.runs/<id>/`) | ✅ no `findings.md` or `*.jsonl` at repo root |
| Real JSONL transcript | ✅ 32 events, all parse, 12 `web_search`-bearing |
| `findings.md` produced via web_search | ✅ 1 386 bytes, sourced from Codex search queries |
| `.runs/` not committed | ✅ already gitignored at `.gitignore:3` |

## 5. Recommendation for the future `src/llm/codex-cli.ts` slice

**Stay Codex-only for the research-stage prompt tools, but make a Codex
outage non-fatal for non-research code paths.**

Justification:

1. **Capability is sufficient.** Codex emitted six well-scoped web searches
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
   break is not "Codex is down" but "Codex 0.126 renamed `item.type ===
   'web_search'`." That risk is mitigated by re-running this smoke on every
   codex-cli upgrade (which the AGENTS.md pin enforces), not by adding a
   second search backend.
4. **Defer adapter complexity.** If a future product reason emerges (cost
   ceiling, geo-blocking, parallel sourcing), revisit the decision then.
   Pulling Tavily/Exa/Firecrawl in *now* would expand the dependency
   surface for zero observed benefit.

**Decision recorded for the next slice:** `src/llm/codex-cli.ts` may be the
sole research-stage search backend in cz v1. Tavily / Exa / Firecrawl
adapters are deferred and explicitly *not* part of cz v1's LLM provider
abstraction.

## 6. Reproduction

From the target content-zoe worktree
(`/Users/youjia/.openclaw-worktrees/4RArkCB3loKMbQuPntgju/target`):

```bash
bun --version          # 1.3.4
bun run preflight      # green path: exits 0, prints codex-cli 0.125.0
PATH=/Users/youjia/.bun/bin:/usr/bin:/bin bun run preflight
                       # red path: exits 1 with explicit error
bun run codex-smoke    # creates .runs/<ISO-stamp>/, runs Codex live, asserts findings.md + ≥1 web_search event
```

Each `bun run codex-smoke` invocation creates a fresh attempt directory
and writes `transcript.jsonl`, `stderr.log`, `findings.md`, and
`summary.json` under it. None of those files are committed; `.runs/` is
already gitignored.
