# Operating Model — execution mechanics

**Companion to [`ROLE_POSITIONING.md`](../../ROLE_POSITIONING.md)** (operator-authored charter, canonical). This doc fills in the operational mechanics that the charter doesn't cover: artifact chain, failure lanes, memory ownership split, review budget, and reviewer arbitration. When this doc and `ROLE_POSITIONING.md` disagree, the charter wins.

**Intent**: make the half-autonomous workflow in `~/Desktop/Screenshot 2026-04-17 at 2.53.34 AM.png` operationally executable so a fresh session can pick up mid-flow without re-discovering decisions.

**Core rule reproduced from charter**: content-zoe product code is implemented only by openclaw-healthcare workers. The driver lane does NOT bypass the workflow. There are no Direct or Fallback implementation lanes — those were considered and rejected.

## 1. Repo mutation boundaries

| Repo | Who may mutate | Scope |
|---|---|---|
| `openclaw-healthcare` | oh-healthcare workers only (via Zoe runtime) | engine evolution scoped to cross-repo target support (`source_repo_path` column + propagation). Any other change uses oh-healthcare's own SDD flow. |
| `content-zoe` | oh-healthcare workers only for `src/` / schema / tests / product code. hc-Claude for governance artifacts like this file. cz-Claude for spec/plan authorship in `docs/specs/` and `docs/plans/`. | never writes into oh-healthcare. |

**Enforced invariants:**
- Content-zoe → oh-healthcare writes are forbidden (per `~/.claude/projects/-Users-youjia-dev-content-zoe/memory/feedback_readonly_reference_repos.md`).
- Driver agents (hc-Claude, cz-Claude, hc-Codex) do NOT edit content-zoe product code directly. All product code lands through workers.
- Drivers MAY author specs/plans in `content-zoe/docs/` and governance artifacts in `content-zoe/docs/process/` — these are coordination artifacts, not product code.

## 2. Actor roster

See [`ROLE_POSITIONING.md`](../../ROLE_POSITIONING.md) for the full 6-actor charter. Operational addendum:

- **Workers are Zoe runtime entities**, not ad-hoc codex subprocesses. They are spawned by `src/lib/agents/claim-loop.ts` in response to queued task rows, run in git worktrees created by `src/lib/agents/worktree.ts`, and emit run/event/commit records that feed the REAL-RUNTIME VALIDATION box. A `codex exec` run from hc-Claude's Bash tool is NOT a worker and cannot substitute for one.
- **Until `source_repo_path` ships**, workers default to oh-healthcare as the worktree source. The first engine-evolution slice (adding `source_repo_path`) is natively worker-implementable because it targets oh-healthcare itself — no bootstrap paradox.
- **hc-Codex as Technical Orchestrator** means: drafting execution packets (the binding artifact between PLAN and workers), designing validation criteria, parsing JSONL output for plan-compliance review. NOT writing product code.
- **Chat isolation**: hc-Claude and cz-Claude see different conversation threads. The operator bridges them via paste-back until `/dashboard/reviews` absorbs the role.

## 3. Binding artifact chain

    docs/specs/NNNN-*.md  →  docs/plans/NNNN-*.md  →  Zoe task-group (execution packet)  →  run/group manifest + SHAs (validation report)  →  Reviews page approve/reject (operator decision)

Each arrow captures prior decisions as immutable input to the next step. A worker at IMPLEMENT reads the execution packet, not the chat backlog. A reviewer at APPROVAL reads the validation report + current SHA, not the conversation. This keeps fresh sessions able to execute.

## 4. Workflow walk — image boxes mapped to artifacts

| Image box | Lane | Artifact / action | Canonical location |
|---|---|---|---|
| SPEC (artifact) | cz-Claude drafts (seeded by operator request through SDD), cz-Codex + hc-Claude review | Markdown spec | `content-zoe/docs/specs/NNNN-*.md` |
| PLAN (artifact) | cz-Claude drafts, cz-Codex + hc-Claude + hc-Codex review | Markdown plan w/ build sequence, acceptance criteria, Mode line | `content-zoe/docs/plans/NNNN-*.md` |
| ADVERSARIAL REVIEW of plan | cz-Codex primary; hc-Claude + hc-Codex secondary | findings list with severity grades | inline in plan doc revision history |
| PICK SMALLEST MODE | cz-Claude proposes, hc-Claude ratifies, operator approves | explicit "Mode: DIRECT / A / B / C / D / E / R" header in plan | (in plan doc) |
| WORKER IMPLEMENTS | Zoe worker via claim-loop | code changes in worktree off content-zoe branch | oh-healthcare dashboard `/dashboard/runs` |
| REAL-RUNTIME VALIDATION | Zoe review-loop | run emits SHAs, group manifest, acceptance-criteria pass/fail | `/dashboard/runs` + `/dashboard/groups` |
| QUALITY GATE | Zoe review-loop runs `bun run check` in worker's content-zoe worktree | typecheck + lint + test + build exit 0 | review-loop event log |
| HUMAN APPROVAL | operator via Reviews page | approve/reject + optional requiredChanges | `/dashboard/reviews` |
| MERGE + MEMORY UPDATE | Zoe merge-loop commits into content-zoe's branch; hc-Claude writes hc-memory; cz-Claude writes cz-memory | commit SHA in content-zoe + memory index entries both sides | content-zoe git + both memory dirs |

Mode glossary (DIRECT / A / B / C / D / E / R) is defined in `PLAN.md`.

## 5. Failure lanes

Rewind targets by failure type:

| Failure at step | Rewind to | Why |
|---|---|---|
| REAL-RUNTIME VALIDATION fails (e.g., an AC unverified) | WORKER IMPLEMENTS (new task attempt) | evidence is runtime-only; doesn't invalidate plan |
| QUALITY GATE fails (typecheck / lint / test / build) | WORKER IMPLEMENTS with failure type injected | tight iteration; plan is still sound |
| HUMAN APPROVAL rejected — implementation-level reason | WORKER IMPLEMENTS | cz-Claude's reject scope annotates which acceptance-criterion failed |
| HUMAN APPROVAL rejected — spec-level reason | PLAN | spec needs amendment; previous plan is obsolete |
| HUMAN APPROVAL rejected — foundation-level reason | SPEC | rare; whole slice is wrong product call |
| cz-Codex adversarial review finds bug pre-approval | WORKER IMPLEMENTS with findings as reject feedback | standard round |

**Retry budget**: max 3 WORKER IMPLEMENTS rewinds per plan before escalating to PLAN review. Prevents infinite cycling on a flawed plan.

**Escalation**: any stage exceeding budget emits a `retry_exhausted` event; operator decides whether to replan or abandon the slice.

## 6. Memory ownership split

| Memory dir | Owns | Doesn't own |
|---|---|---|
| `~/.claude/projects/-Users-youjia-dev-openclaw-healthcare/memory/` (hc-memory) | run-log entries · stage transitions · retry state · engine-evolution decisions · cross-repo-target status · Zoe pattern learnings | product intent · spec-drift history · SOUL-voice decisions |
| `~/.claude/projects/-Users-youjia-dev-content-zoe/memory/` (cz-memory) | product intent · plan-to-impl drift · operator feedback · brand-voice decisions · spec authorship norms | Zoe runtime behavior · oh-healthcare engine state |
| MEMORY.md (both sides) | one-line index into detail files | detail content |

When a decision spans both lanes: write the detail in the OWNING lane's memory, add a cross-reference line in the other lane's MEMORY.md index.

## 7. Review budget per slice

| Stage | Budget | Exception |
|---|---|---|
| Plan-time (new SPEC or PLAN) | 3 adversarial rounds max (cz-Codex + hc-Claude + hc-Codex) | engine-evolution slices (oh-healthcare internal) get full extended review — load-bearing infrastructure |
| Per-implementation-slice | 1 adversarial pass (cz-Codex) + 1 plan-compliance pass (hc-Claude) | if review findings ≥ 2 high-severity OR any spec-violation → re-enter plan-time review |

Plan-time for content-zoe has already consumed 7 rounds; we are now on the implementation-slice budget for slice 0001 and subsequent slices unless a new spec is drafted.

### Arbitration when reviewers disagree

Resolution order:

1. **Severity + specificity filter** — blocker/high + concrete-with-file-line-evidence wins over lower severity or vibes. Most disagreements collapse here.
2. **Domain authority** — for a remaining tie, the reviewer whose scope (per ROLE_POSITIONING.md) the finding falls into wins: runtime/architecture ↔ hc-Claude; implementation-risk/race-condition ↔ cz-Codex; spec/product-fit ↔ cz-Claude.
3. **Same-domain same-severity** — first-filed finding stands unless the second filer supplies a concrete counter-finding with file:line evidence.
4. **Operator tiebreak** — remaining conflicts escalate to the operator with both findings verbatim, drafter's preferred resolution, 1-line explanation.

No "majority vote" across reviewers — domain authority always wins over headcount.

## 8. One-line summary

See `ROLE_POSITIONING.md` § "One-Line Summary". Reproduced here as a guard against drift: oh-healthcare thinks, organizes, dispatches, and validates. oh-healthcare workers code. content-zoe judges whether the result is the right product.

## 9. Compounding-forward patterns

Patterns surfaced across Slice 1 + Slice 2 + Slice 3 cycles (cz-Claude r1→rN + hc-codex Gate 1 + cz-Codex Gate 2 + cz-Codex advisory). Each reached the operator's "3+ exercised → fold to operating-model" threshold during Slice 3's r3 + r4 reviews. Memorialized here so Slice 3.5+ and Slice 4+ cycles inherit canonical references instead of re-deriving from slice-history archaeology.

### 9.1 Function-name citation pattern

**Rule**: code comments and slice-draft AC text cite related code by **function name**, never by `file:line-number`. Line numbers drift under refactor; function names stay stable.

**Data points**: Slice 1 r1 origin (cz-Codex caught wrong line range citation) → Slice 2 v1.1 spec (M1 fold) → Slice 2 production code (`codex-cli.ts:76`/`:115`/`:333-336`) → Slice 3 spec A8.1+A9.1.

**How to apply**: when authoring code comments OR slice ACs that reference related code, name the function/symbol you're citing (e.g. `snapshotAttemptDir`, `compareSnapshots`, `assertCodexAvailable`). If multiple functions share scope, name all of them. Avoid `<file>:<line-range>` citations — they go stale on the next refactor.

### 9.2 Changelog-table-at-draft-top convention

**Rule**: every slice draft v1.0 → v1.N revision adds a top-of-doc changelog table with one row per finding folded. Three columns: finding, fold action, where-it-lands. Old changelogs stay below the new one — the doc accumulates a stacked review history.

**Data points**: Slice 2 v1.1 origin → Slice 2 v1.2 → Slice 3 v1.1 → Slice 3 v1.2 → Slice 3 v1.3 (3-deep stack). Pattern survived 5 fold cycles.

**How to apply**: when folding any review (cz-Claude rN, hc-codex Gate 1 rN, cz-Codex advisory), prepend the doc with `## v(N-1) → vN changelog (folding <reviewer> <round>)` containing a markdown table. Each row is one finding. Reviewers reference the changelog FIRST when checking a fold landed correctly. Never delete prior changelog sections — they become the audit trail.

### 9.3 Latent-contradiction class

**Rule**: codifying a general invariant in a slice draft surfaces inherited contradictions across upstream surfaces (PLAN.md, prior slice ACs, charter language). Treat such contradictions as load-bearing review findings, not housekeeping.

**Data points**: Slice 2 r2 M-r2-1 (env-clean rule surfaced inherited `selectProvider` factory contradiction) → Slice 3 r1 M-r1-1 (PLAN.md lines 99+201 stale post-Slice-2) → Slice 3 r2 M-r2-1 (symlink edge case latent in v1.1 boundary rule) → Slice 3 cz-Codex advisory M-adv-1 (`runStage` output ownership contradicts Slice 2 LLMProvider contract) → Slice 3 cz-Codex advisory M-adv-3 (env purity rule too narrow per the codified intent).

**How to apply**: when a slice draft introduces a generalized invariant (e.g. "no env reads under X", "all paths inside Y"), explicitly audit upstream surfaces for contradictions. Don't assume prior approvals carry forward — codifying a stricter rule re-litigates earlier acceptances. Reviewers should grep for the new invariant's keywords across PLAN.md + prior slice drafts + charter to catch latent contradictions before implementation.

### 9.4 Forward observations as inheritance contracts

**Rule**: each slice's "Forward observations" section becomes the next slice's structural constraints. Forward observations are NOT speculative wishes — they are binding inheritance contracts that the next slice's ACs MUST honor.

**Data points**: Slice 2 r2 L-r2-1 origin (operator-tunable params via constructor) → Slice 3 v1.0 inherited (OUT scope #1+#2+#3) → Slice 3 v1.1 expanded (Forward observations #1-#4) → Slice 3 v1.3 (Forward observations #5-#7 from cz-Claude r2/r3 + cz-Codex advisory) → Slice 3.5+ inheritance pending.

**How to apply**: every slice draft's "Forward observations" section is a structured handoff. When drafting slice N+1, read slice N's forward observations as MANDATORY constraints — they go into N+1's OUT clauses (what N+1 won't do because slice N said "later"), or N+1's ACs (what N+1 MUST do because slice N said "the next consumer must"), or N+1's design surface (open questions slice N flagged). When reviewing slice N+1, verify each of slice N's forward observations is either folded into N+1 OR explicitly carried forward (not silently dropped).

### 9.5 Smoke-regeneration audit preservation

**Rule**: when a smoke runner records evidence by writing the entire outcome matrix to disk, re-running the smoke OVERWRITES prior outcomes — losing the audit trail of failed-then-fixed scenarios. Preserve prior outcomes as separate matrix rows + scenario blocks; never overwrite.

**Data points**: Slice 2 hc-codex Gate 1 M1 fold preserved worker-context FAIL row (in `9578d95`) → Slice 2 parser fold smoke regeneration overwrote that FAIL row (in `d9e38a1`) → Slice 2 hc-Claude M-fold-1 caught the regression and restored the FAIL row (in `0a08b91`).

**How to apply**: smoke runners should either (a) implement append-only mode for the outcome matrix, OR (b) the operator manually preserves prior rows when regenerating. When a worker-context FAIL is followed by an operator-context PASS, the matrix should show BOTH rows with distinct scenario names + execution-context lines. When a parser fold regenerates evidence, prior rows from earlier folds STAY in the matrix as audit history. Reviewers checking a smoke regeneration MUST verify that prior FAIL rows weren't silently overwritten.

## Out of scope for this doc

- 6-actor charter → `ROLE_POSITIONING.md`.
- `source_repo_path` schema/propagation design → forthcoming oh-healthcare internal SDD spec.
- Per-slice acceptance-criterion conventions → each spec in `docs/specs/` is self-contained.
- Brand voice rules → `content-zoe/docs/SOUL.md` (not yet written).
- Bot allowlist + preflight policy → `content-zoe/AGENTS.md` (stubbed, filled at scaffolding commit per PLAN.md).
- Patterns at threshold but deferred from § 9 (held back per hc-codex's "only patterns Slice 3 implementation will actually use" filter): #4 Optional consistency strengthening, #9 Constrained-alternative-due-to-prior-slice-freeze, #10 Cross-lane finding amplification (emerging). Will fold once a Slice 4+ cycle exercises them.
