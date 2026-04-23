# Operating Model — four-agent workflow for building content-zoe

**Intent**: make the half-autonomous workflow in `~/Desktop/Screenshot 2026-04-17 at 2.53.34 AM.png` operationally executable so a fresh session can pick up mid-flow without re-discovering decisions. Derived from (a) user intent "Zoe of healthcare takes real tasks and evolves with building" (2026-04-23), (b) content-zoe Claude's critique of the prior compressed role-split doc, (c) the Path 1 architectural decision.

## 1. Repos and mutation boundaries (Path 1)

Two repos, distinct ownership, asymmetric mutation rights:

| Repo | Role | Who may mutate | Scope of allowed mutation |
|---|---|---|---|
| `openclaw-healthcare` | runtime engine | hc-lane agents only | **strictly** cross-repo-target feature work (add `source_repo_path` column, propagate through `claim-loop`/`worktree`/`cleanup-loop`/`orphan-loop`/`merge-loop`). Any other oh-healthcare change goes through oh-healthcare's own SDD flow, not this process. |
| `content-zoe` | build target | hc-runtime workers (via engine), hc-Claude (process docs), cz-lane agents (specs, reviews, memory) | product code, specs, plans, docs. Never writes into oh-healthcare. |

**Enforced invariants:**
- Content-zoe → oh-healthcare writes are forbidden (per `~/.claude/projects/-Users-youjia-dev-content-zoe/memory/feedback_readonly_reference_repos.md`).
- Oh-healthcare → content-zoe writes happen **only through the Zoe runtime** (worker worktrees), not via ad-hoc driver-agent Edit/Write. Exception: governance artifacts like this file are OK as direct driver writes.
- Oh-healthcare → oh-healthcare engine-evolution changes are **scoped to cross-repo target support** under this process. Unrelated oh-healthcare changes use oh-healthcare's own ticket/SDD flow.

## 2. Four-agent grid — instantiation

| Agent | Rooted at | Spawned how | Primary role |
|---|---|---|---|
| `hc-Claude` | `/Users/youjia/dev/openclaw-healthcare` | current Claude Code session | process steward · memory curator · engine-evolution driver · plan-compliance reviewer |
| `hc-Codex` | oh-healthcare OR content-zoe (per task) | `codex exec --full-auto` via hc-Claude's Bash tool (mirrors Issue 1C smoke invocation) | implementer for oh-healthcare engine work AND content-zoe scaffolding (pre-Zoe-runtime fallback; retires once engine is cross-repo-capable) |
| `cz-Claude` | `/Users/youjia/dev/content-zoe` | separate Claude Code session user opens manually | spec/plan author · product judgment · final approval reviewer |
| `cz-Codex` | `/Users/youjia/dev/content-zoe` | `codex exec` via cz-Claude's Bash tool | adversarial reviewer of diffs/specs · race/failure-mode hunter |

**Bridging**: hc-Claude and cz-Claude cannot see each other's memory or chat. The user is the bridge — paste-back is how review rounds move between lanes. This is the "half-autonomous" shape: engines and reviewers are automated; the bridging is manual.

## 3. Workflow walk — image boxes mapped to artifacts

| Image box | Lane | Artifact / action | Canonical location |
|---|---|---|---|
| SPEC (artifact) | cz-Claude drafts, cz-Codex + hc-Claude review | Markdown spec | `content-zoe/docs/specs/NNNN-*.md` |
| PLAN (artifact) | cz-Claude drafts, cz-Codex + hc-Claude review | Markdown plan w/ build sequence, acceptance criteria | `content-zoe/docs/plans/NNNN-*.md` |
| ADVERSARIAL REVIEW of plan | cz-Codex primary; hc-Claude + hc-Codex secondary | review rounds captured inline in the plan doc | (in-doc, revision history) |
| PICK SMALLEST MODE | cz-Claude proposes, hc-Claude ratifies | explicit "Mode: DIRECT / A / B / C / D / E / R" header line in plan | (in plan doc) |
| REAL-RUNTIME VALIDATION | Zoe runtime in oh-healthcare | task run emits SHAs, group manifest, acceptance-criteria pass/fail | oh-healthcare dashboard `/dashboard/runs` and `/dashboard/groups` |
| QUALITY GATE | Zoe review-loop runs `bun run check` in worker's content-zoe worktree | typecheck + lint + test + build exit 0 | review-loop event log |
| HUMAN APPROVAL | user via Reviews page | approve/reject decision + optional requiredChanges | oh-healthcare dashboard `/dashboard/reviews` |
| MERGE + MEMORY UPDATE | Zoe merge-loop commits into content-zoe's branch; hc-Claude writes hc-memory; cz-Claude writes cz-memory | commit SHA in content-zoe + memory index entries both sides | content-zoe git + both memory dirs |

## 4. Failure lanes — what happens when a box rejects

Rewind targets by failure type:

| Failure at step | Rewind to | Why |
|---|---|---|
| REAL-RUNTIME VALIDATION fails (e.g., an AC unverified) | IMPLEMENT (new task attempt) | evidence is runtime-only; doesn't invalidate plan |
| QUALITY GATE fails (typecheck / lint / test / build) | IMPLEMENT with specific failure type injected into fix-prompt | tight iteration; plan is still sound |
| HUMAN APPROVAL rejected — implementation-level reason | IMPLEMENT | cz-Claude's reject scope annotates which acceptance-criterion failed |
| HUMAN APPROVAL rejected — spec-level reason | PLAN | spec needs amendment; previous plan is obsolete |
| HUMAN APPROVAL rejected — foundation-level reason | SPEC | rare; whole slice is wrong product call |
| cz-Codex adversarial review finds bug | IMPLEMENT with findings as reject feedback | standard round |

**Retry budget**: max 3 IMPLEMENT rewinds per plan before escalating to PLAN review. Prevents infinite cycling on a flawed plan.

**Escalation**: any stage exceeding budget emits a `retry_exhausted` event; user decides whether to replan or abandon the slice.

## 5. Memory ownership split

| Memory dir | Owns | Doesn't own |
|---|---|---|
| `~/.claude/projects/-Users-youjia-dev-openclaw-healthcare/memory/` (hc-memory) | run-log entries · stage transitions · retry state · engine-evolution decisions · cross-repo-target status · Zoe pattern learnings | product intent · spec-drift history · SOUL-voice decisions |
| `~/.claude/projects/-Users-youjia-dev-content-zoe/memory/` (cz-memory) | product intent · plan-to-impl drift · user feedback · brand-voice decisions · spec authorship norms | Zoe runtime behavior · oh-healthcare engine state |
| MEMORY.md (both sides) | one-line index into detail files | detail content |

When a decision spans both lanes: write the detail in the OWNING lane's memory, add a cross-reference line in the other lane's MEMORY.md index.

## 6. Review budget per slice

| Stage | Budget | Exception |
|---|---|---|
| Plan-time (new SPEC or PLAN) | 3 adversarial rounds max (cz-Codex + hc-Claude + hc-Codex or reviewer panel) | engine-evolution slices (oh-healthcare changes for cross-repo) get full extended review — load-bearing infrastructure |
| Per-implementation-slice | 1 adversarial pass (cz-Codex) + 1 plan-compliance pass (hc-Claude) | if review findings ≥ 2 high-severity OR any spec-violation → re-enter plan-time review |

Plan-time for content-zoe has already consumed 7 rounds; we are now on the implementation-slice budget for slice 0001 and subsequent slices unless a new spec is drafted.

## 7. One-line summary

**hc-lane** owns runtime orchestration + engine self-evolution (cross-repo feature only) + run-log memory. **cz-lane** owns spec authorship + product judgment + adversarial code review + product memory. The user bridges chat-isolated lanes manually via paste-back.

## Out of scope for this doc (deferred elsewhere)

- Specific `source_repo_path` schema/propagation change design → next oh-healthcare SDD spec.
- Per-slice acceptance-criterion conventions → each spec in `docs/specs/` is self-contained.
- Brand voice rules → `content-zoe/docs/SOUL.md` (not yet written).
- Bot allowlist + preflight policy → `content-zoe/AGENTS.md` (stubbed, filled at scaffolding commit per PLAN.md).
