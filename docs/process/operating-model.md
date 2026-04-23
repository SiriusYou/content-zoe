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

## Out of scope for this doc

- 6-actor charter → `ROLE_POSITIONING.md`.
- `source_repo_path` schema/propagation design → forthcoming oh-healthcare internal SDD spec.
- Per-slice acceptance-criterion conventions → each spec in `docs/specs/` is self-contained.
- Brand voice rules → `content-zoe/docs/SOUL.md` (not yet written).
- Bot allowlist + preflight policy → `content-zoe/AGENTS.md` (stubbed, filled at scaffolding commit per PLAN.md).
