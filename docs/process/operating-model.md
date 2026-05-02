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
| SLICE DRAFT (artifact) | hc-Claude drafts; cz-Claude reviews (mandatory, all slices); cz-Codex reviews (mandatory for framework slices per charter v3.3, advisory for handler) | Markdown slice draft + matching `.omx/artifacts/claude-slice-N-review-*.md` + (framework only) `.omx/artifacts/codex-slice-N-review-*.md` | `content-zoe/.omx/drafts/slice-N-*.md` (gitignored) |
| ADVERSARIAL REVIEW of plan | cz-Codex primary; hc-Claude + hc-Codex secondary | findings list with severity grades | inline in plan doc revision history |
| PICK SMALLEST MODE | cz-Claude proposes, hc-Claude ratifies, operator approves | explicit "Mode: DIRECT / A / B / C / D / E / R" header in plan | (in plan doc) |
| WORKER IMPLEMENTS | Zoe worker via claim-loop | code changes in worktree off content-zoe branch | oh-healthcare dashboard `/dashboard/runs` |
| REAL-RUNTIME VALIDATION | Zoe review-loop | run emits SHAs, group manifest, acceptance-criteria pass/fail | `/dashboard/runs` + `/dashboard/groups` |
| QUALITY GATE | Zoe review-loop runs `bun run check` in worker's content-zoe worktree | typecheck + lint + test + build exit 0 | review-loop event log |
| HUMAN APPROVAL | operator via Reviews page | approve/reject + optional requiredChanges | `/dashboard/reviews` |
| MERGE + MEMORY UPDATE | Zoe merge-loop commits into content-zoe's branch; hc-Claude writes hc-memory; cz-Claude writes cz-memory | commit SHA in content-zoe + memory index entries both sides | content-zoe git + both memory dirs |

Review artifacts are written to the reviewer's owning repo, not to the implementation repo by default:

- Slice-approval artifacts live in `content-zoe/.omx/artifacts/`.
- Gate 1 artifacts live in `openclaw-healthcare/.omx/artifacts/`.
- Gate 2 artifacts live in `content-zoe/.omx/artifacts/`.
- content-zoe charter or operating-model amendment review artifacts live in `content-zoe/.omx/artifacts/` unless the amendment is explicitly hc-internal.

Mirrors are permitted when useful for cross-session lookup, but mirrored artifacts must be byte-identical and the review relay must cite the canonical path. When an artifact is copied to a secondary path, the SHA-256 must remain unchanged and the close-out should record which path is canonical.

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
| Slice-approval gate | Handler slices: 1 cz-Claude review (sufficient). Framework slices: 1 cz-Claude review + 1 cz-Codex slice-approval review (per charter v3.3, both must be in approve set) | If r1→r4 does not converge to the approve set → re-enter plan-time review for SPEC/PLAN amendment |

Plan-time for content-zoe has already consumed 7 rounds; we are now on the implementation-slice budget for slice 0001 and subsequent slices unless a new spec is drafted.

### Arbitration when reviewers disagree

Resolution order:

1. **Severity + specificity filter** — blocker/high + concrete-with-file-line-evidence wins over lower severity or vibes. Most disagreements collapse here.
2. **Domain authority** — for a remaining tie, the reviewer whose scope (per ROLE_POSITIONING.md) the finding falls into wins: runtime/architecture ↔ hc-Claude; implementation-risk/race-condition ↔ cz-Codex; spec/product-fit ↔ cz-Claude.
3. **Same-domain same-severity** — first-filed finding stands unless the second filer supplies a concrete counter-finding with file:line evidence.
4. **Operator tiebreak** — remaining conflicts escalate to the operator with both findings verbatim, drafter's preferred resolution, 1-line explanation.

No "majority vote" across reviewers — domain authority always wins over headcount.

### Reviewer brief discipline

For adversarial review cycles (slice-approval, plan review, charter amendment), reviewer briefs SHOULD include explicit out-of-scope clauses delineating each reviewer's domain. This prevents review-budget bleed and surfaces early when a reviewer is encroaching on another reviewer's lane.

**Brief shape**: each reviewer brief MUST contain (a) a "Focus" clause naming what to check, (b) a "Specifically check" clause naming concrete items, and (c) an "Out of scope" clause naming what other reviewers' lanes are. Round-N briefs should narrow further: they verify only that round-(N-1) findings folded cleanly, plus surface any new contradictions introduced by the fold itself.

**Origin**: charter v3.3 cycle (2026-04-28). The cycle's r1 + r2 + r3 reviewer briefs explicitly demonstrated this discipline; cz-Claude r2 forward observation #4 codified it as a future operating-model addition.

### Implementation review source-read discipline

For Gate 1 and Gate 2 implementation reviews, reviewers SHOULD read source from immutable full commit SHAs, not from mutable worktrees or mutable branch refs. Preferred forms:

- `git show <full-commit-sha>:<path>` for source inspection.
- `git diff <base-full-sha>..<target-full-sha> -- <path>` for scoped drift checks.

Branch refs such as `agent/<id>` may be used only to resolve the target commit (`git rev-parse agent/<id>`). Review artifacts must record the resolved SHA, and source citations should use that SHA rather than the branch name.

Working-tree reads are acceptable only for generated evidence files that exist solely in the review checkout, or when the artifact explicitly records why an immutable full-SHA read was not possible.

**Origin**: Slice 3.7 and Slice 4.1/4.2 implementation reviews. Immutable full-SHA reads prevented review drift when worker cleanup, branch advancement, or operator-side worktree state changed after implementation.

### Review artifact write-path discipline

Reviewers SHOULD write review artifacts to the canonical artifact path for their lane, as defined in § 4.

Review artifacts SHOULD include a load-bearing refs table near the top naming the target implementation SHA, base SHA, locked draft SHA, predecessor review SHAs when relevant, and any mirrored artifact paths. Artifact SHA-256 values should be recorded in full when used for cross-session lookup.

If an artifact is written to the wrong repo because the reviewer cwd drifted, the operator may reconcile it by copying it to the canonical path only if the byte-identical SHA is preserved. The close-out should record the reconciliation.

**Origin**: Slice 4.3 hc-Codex Gate 1 artifact routing divergence and reconciliation; Slice 4.4 hc-Codex Gate 1 direct hc-side landing.

### Behavioral verification execution discipline

When a behavioral review re-runs smokes or commands that regenerate evidence files, reviewers SHOULD use a disposable archive checkout of the immutable target commit when feasible:

1. Resolve the target implementation to a full commit SHA.
2. Create a disposable temp directory from `git archive <full-sha>`.
3. Run the behavioral verification commands in that checkout.
4. Discard the checkout after recording command outcomes.

This pairs with immutable source-read discipline: source inspection uses `git show <full-sha>:<path>`; behavioral execution uses a disposable checkout of the same full SHA.

If a command requires operator-only auth, reviewers who are not the operator-authorized execution lane do not run it and record it as not run. Live-worktree execution is allowed only for commands that are otherwise permitted and cannot be reproduced in an archive checkout for an explicitly recorded reason.

Review artifacts should record whether behavioral verification used a disposable archive checkout and should name any commands not run because of operator-only boundaries.

**Origin**: Slice 4.3 cz-Codex Gate 2 disposable archive checkout; Slice 4.4 hc-Codex/Gate 2 behavioral replay reuse.

### Review artifact baseline metric

The current v3.3 steady-state baseline for a completed implementation slice is 8 review artifacts:

- 4 slice-approval artifacts: cz-Claude r1/r2 + cz-Codex r1/r2.
- 2 Gate 1 artifacts: hc-Codex + hc-Claude.
- 2 Gate 2 artifacts: cz-Codex + cz-Claude.

This is a planning metric, not a pass/fail rule. Handler slices may use fewer slice-approval artifacts when charter permits. Extra artifacts are expected when findings require additional folds. Close-out should record deviations from the baseline so future campaign planning uses observed cycle cost rather than intuition.

Close-out should distinguish at least three metrics:

- artifact count versus the 8-artifact implementation-slice baseline;
- r1-clean status: whether slice-approval r1 found zero findings;
- Gate-clean status: whether Gate 1 and Gate 2 cleared first round after slice-approval folds.

r1-clean and Gate-clean measure different things. r1-clean is a draft-quality signal; Gate-clean is an implementation-quality signal after accepted folds.

**Origin**: Slice 4.1 and Slice 4.2 both closed at the 8-artifact baseline despite different classification pressure.

## 8. One-line summary

See `ROLE_POSITIONING.md` § "One-Line Summary". Reproduced here as a guard against drift: oh-healthcare thinks, organizes, dispatches, and validates. oh-healthcare workers code. content-zoe judges whether the result is the right product.

## 9. Compounding-forward patterns

Patterns surfaced across Slice 1 + Slice 2 + Slice 3 cycles (cz-Claude r1→rN + hc-codex Gate 1 + cz-Codex Gate 2 + cz-Codex advisory) and later Slice 3.5-4.2 governance cycles. Each promoted pattern reached its stated threshold or was self-applying in a charter cycle. Memorialized here so later slice cycles inherit canonical references instead of re-deriving from slice-history archaeology.

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

**Audit checklist** (added 2026-04-28 from charter v3.3 cycle, where v1.0's audit missed a singular-grammar surface that v1.1's re-audit caught):

1. When the amendment introduces a NEW invariant (e.g., "no env reads under X", "all paths inside Y"), grep for the invariant's keywords across all upstream surfaces (PLAN.md, prior slice drafts, charter sections).
2. When the amendment introduces MULTIPLICITY where there was singularity (e.g., dual artifacts where there was one, multiple reviewer streams where there was one), grep the entire charter for singular grammar ("the matching artifact", "the verdict") that needs updating to plural or conditional grammar.
3. Don't assume prior approvals carry forward — codifying a stricter rule re-litigates earlier acceptances. Surface those re-litigations explicitly in the latent-contradiction audit table.

This converts § 9.3 from a post-hoc explanation pattern into a checkable verification step at draft time.

### 9.4 Forward observations as revalidated inheritance inputs

**Rule**: each slice's "Forward observations" section is a structured inheritance input to later slices, not a binding contract by itself. The next slice touching the same surface MUST revalidate each relevant forward observation against canonical sources before acting on it.

Forward observations have four valid dispositions:

1. **Folded** — the next slice turns the observation into acceptance criteria, OUT scope, or implementation constraints.
2. **Rejected** — the next slice explicitly rejects the observation with canonical-source evidence.
3. **Carried forward** — the next slice records that the observation remains relevant but is outside current scope.
4. **Retired** — the next slice records that the observation no longer applies because the target surface changed.

Silent inheritance is invalid: a slice that touches the relevant surface should not ignore an upstream forward observation without one of the four dispositions above.

**Data points**: Slice 2 r2 L-r2-1 origin (operator-tunable params via constructor) → Slice 3 inherited as OUT scope. Slice 3.7 rejected the inherited "extend JobContext" note after canonical-source revalidation and preserved handler classification. Slice 4.2 accepted the Slice 4.1/4.2 Path B inheritance only after reviewers hardened it through the `StageDef.buildPrompt?` fold.

**How to apply**: when drafting slice N+1, read slice N's forward observations as inputs. For every observation touching N+1's file scope, add a short disposition in the draft or close-out: Folded, Rejected, Carried forward, or Retired. Rejections and retirements should cite canonical source by function/symbol name (see § 9.1) or immutable full commit SHA, not mutable line numbers.

### 9.5 Smoke-regeneration audit preservation

**Rule**: when a smoke runner records evidence by writing the entire outcome matrix to disk, re-running the smoke OVERWRITES prior outcomes — losing the audit trail of failed-then-fixed scenarios. Preserve prior outcomes as separate matrix rows + scenario blocks; never overwrite.

**Data points**: Slice 2 hc-codex Gate 1 M1 fold preserved worker-context FAIL row (in `9578d95`) → Slice 2 parser fold smoke regeneration overwrote that FAIL row (in `d9e38a1`) → Slice 2 hc-Claude M-fold-1 caught the regression and restored the FAIL row (in `0a08b91`).

**How to apply**: smoke runners should either (a) implement append-only mode for the outcome matrix, OR (b) the operator manually preserves prior rows when regenerating. When a worker-context FAIL is followed by an operator-context PASS, the matrix should show BOTH rows with distinct scenario names + execution-context lines. When a parser fold regenerates evidence, prior rows from earlier folds STAY in the matrix as audit history. Reviewers checking a smoke regeneration MUST verify that prior FAIL rows weren't silently overwritten.

### 9.6 Self-applying amendment cycle pattern

**Rule**: when a charter or operating-model amendment introduces a new review structure, governance gate, or classification, the amendment cycle itself should run the amendment's draft under the proposed rules. This validates that the new structure is operationally workable, catches gaps that the abstract proposal cannot surface, and provides one documented data point of the new structure's effectiveness on a real (and structurally relevant) artifact.

**Data points**: charter v3.3 cycle (2026-04-28) — amendment promoted cz-Codex slice-approval review to mandatory for framework slices. The amendment cycle itself ran the v3.3 amendment draft through cz-Codex slice-approval review (advisory under v3.2 at draft-time, treated as if mandatory). cz-Codex caught two structural classifier gaps that cz-Claude's process-coherence review structurally couldn't: (r1) classifier needed non-TS contract classes (DB schema, event vocab, command grammar, prompts/delimiters, fs layout); (r2) classifier needed behavioral-invariant contract classes (workflow, state machine, retry, recovery, approval, promotion, authorization). Validates evidence base #2 of v3.3 by self-application.

**How to apply**: when drafting an amendment that introduces a new review structure, identify whether the amendment itself qualifies under that structure (e.g., a charter amendment introducing framework-slice mandatory review applies to itself if the amendment introduces new cross-slice contract surfaces). If yes, run the amendment through the proposed structure as part of the cycle. The first cycle's outcome is a category-defining data point even though it's a single instance — it is not a recurrence-threshold candidate but a structure-defining instance.

**Sub-pattern: Path B charter-vs-engine decoupling** (deferred for now; first observed in v3.3 cycle hc-codex r1 H1 fold). When an amendment introduces fields that the existing engine cannot mechanically enforce, two paths: (A) block amendment merge on engine slice landing; (B) soften charter to operator-attestation-and-audit, defer mechanical enforcement to follow-on engine slice. Path B is preferable when charter is policy and engine is enforcement, because coupling them creates an ordering loop. Track for promotion to its own subsection once a second amendment cycle exercises the same pattern.

### 9.7 Methodology diversity between review lanes

**Rule**: review lanes employing different methodologies — textual conformance review and behavioral verification — catch different finding classes. The dual-lane protocol's coverage depends on methodological diversity, not reviewer count alone.

At gates that require two lanes, the gate SHOULD preserve methodology diversity:

- one textual stream: AC/prose/source inspection, product-fit checks, fold-traceability;
- one behavioral stream: smoke execution, CLI permutations, runtime probes, archive-checkout reproduction.

Do not homogenize lanes by requiring every reviewer to perform both methods. Homogenization erases the diagnostic signal that dual-lane review was designed to provide.

Each review artifact MUST tag finding methodology with `[method: textual]`, `[method: behavioral]`, or `[method: hybrid]`. Each artifact SHOULD include a short methodology summary naming the concrete checks performed.

**Data points**: Slice 3.5 showed zero finding overlap across textual and behavioral lanes. Slice 3.6 added severity-divergent cross-confirmation where textual and behavioral lanes both found recovery/idempotence risk through different evidence. Slice 3.7 exercised both methodologies on a handler-slice DB recovery-audit wiring without producing divergence findings, demonstrating that methodology coverage is sustainable across slice classifications. Slice 4.1 and Slice 4.2 added cross-methodology confirmations where different methods independently found the same contract gap.

**Promotion update in v3.4**: the N=5 threshold from v3.3 is now met across five distinct slices: 3.5, 3.6, 3.7, 4.1, and 4.2. The v3.4 rule is gate-level methodology coverage: when a gate requires two lanes, preserve at least one textual stream and one behavioral stream.

### 9.8 Cross-methodology convergence fold trigger

**Rule**: when textual and behavioral lanes independently identify the same finding class in the same gate or review round, treat the issue as real and fold structurally by default.

"Structurally" means the fold changes the contract or implementation mechanism so the runtime/spec equivalence gap closes. Documentation-only, time-box, or discipline-only folds are allowed only when the draft records why a structural fold is infeasible or out of proportion.

**Data points**:

- Slice 4.1: textual and behavioral lanes both identified the research manifest gap; Path W resolved it structurally with canonical `research/brief.md` using existing `file_non_empty`.
- Slice 4.2: textual and behavioral lanes both identified static research self-wrapping as non-equivalent to trusted runtime wrapping; Path B resolved it structurally with `StageDef.buildPrompt?` and runtime prompt construction.
- Slice 4.3 under operative v3.4: textual LOW + behavioral MEDIUM both identified sentinel smoke coverage gap; severity arbitration resolved to MEDIUM and v1.1 folded structurally by adding `<<<OPERATOR_FEEDBACK>>>` coverage.
- Slice 4.4 under operative v3.4: textual LOW + behavioral MEDIUM both identified advisory-directive prompt coverage gap; severity arbitration resolved to MEDIUM and v1.1 folded structurally by adding directive constants, A6 mapping rows, and prompt-boundary smoke assertions.

**How to apply**: if both lanes flag the same class, the fold matrix should mark it `cross-confirmed`. The drafter may still choose a smaller fold than either reviewer proposed, but the fold should close the underlying equivalence gap rather than merely promise future discipline.

### 9.9 Fold-design pass

**Rule**: when reviewers converge on a problem but the narrowest correct mechanism is unclear, run a fold-design pass before drafting the next revision. Fold-design is not a new standing reviewer lane; it is a focused mechanism-selection step.

Fold-design asks:

1. What is the smallest structural change that closes the finding?
2. Can an existing rule kind, helper, or framework seam satisfy the contract without expanding framework surface?
3. If framework expansion is necessary, which files become IN scope and which prior freezes are intentionally reopened?
4. Does the fold change slice classification?

**Data point**: Slice 4.1 Path W. Review lanes agreed the manifest gap existed, but the surgical mechanism was not "collection-level glob" or "new `requireNonEmpty` rule"; it was a canonical-entry-point file rule (`research/brief.md`) using existing framework.

**How to apply**: the next draft's changelog should identify the chosen fold mechanism and, where relevant, name rejected alternatives in one sentence. This gives r2 reviewers enough context to verify mechanism choice without re-running the entire design debate.

### 9.10 Contract-anchored smoke assertions

**Rule**: when a fold introduces a binding runtime-observable clause to close a review finding, the next draft MUST either:

1. add or update a smoke assertion that checks the clause; OR
2. record why a smoke assertion is infeasible or out of proportion for that slice.

For binding runtime-observable clauses that are not introduced to close a review finding, the slice SHOULD add or update a smoke assertion when feasible.

At draft time, any slice that claims contract-anchored smoke coverage or introduces/modifies runtime-observable acceptance criteria MUST include an explicit runtime-observable clause sweep. The sweep enumerates each acceptance-criterion clause whose satisfaction is observable at runtime, prompt-construction time, filesystem state, manifest state, event/log state, or CLI output. Each enumerated clause gets one of:

- a required smoke assertion;
- a prompt-level or static-identity assertion when downstream model behavior is infeasible to validate under fake providers;
- an infeasibility or out-of-proportion note.

Two clauses are "of the same class" when they share verification feasibility and structural origin. For example, Slice 4.4's length-ratio guidance, Markdown structure preservation, and Evidence Grade warning preservation were one advisory-directive class: all three originated in A3, all three were prompt-level instructions, and all three had downstream behavior that FakeProvider could not validate. Mapping one instance required sweeping the other two before dispatch.

The contract should be pinned in three places when practical: the draft text, implementation, and smoke evidence. For prompt clauses, a robust implementation is often: spec text -> exported directive/prefix constant -> smoke imports the same constant and asserts prompt inclusion or prefix identity.

**Data points**:

- Slice 4.2 Polish-1 required `buildDraftEnPrompt` output to start with the exact `DRAFT_EN_PROMPT` prefix. The implementation enforced the prefix and `draft-en-stage-smoke` asserted it.
- Slice 4.3 folded sentinel coverage structurally by requiring smoke coverage for all four sentinels, including `<<<OPERATOR_FEEDBACK>>>`.
- Slice 4.4 v1.0 attempted draft-time mapping but missed Markdown and Evidence Grade advisory directives; v1.1 closed the gap by adding prompt-level assertions and an infeasibility note for downstream LLM-output quality under FakeProvider.
- Slice 4.4's two-file stage asserted input preservation by checking `report.en.md` remained byte-identical while `report.zh.md` was produced.

**How to apply**: before dispatching slice-approval, sweep the draft's acceptance criteria for runtime-observable MUST/SHOULD clauses. For each, add a smoke mapping row or an explicit infeasibility note. If one instance of a clause class is mapped, sweep for all other instances of the same class before dispatch.

### 9.11 Pre-relay fold compression

**Rule**: for framework, framework-conservative, borderline, or high-surface handler slices, the operator SHOULD use a pre-relay fold pass before formal slice-approval dispatch when a planning lane is available.

Pre-relay fold compression is advisory, not a replacement for formal review. It exists to remove obvious scope/accounting contradictions before they consume reviewer rounds and to synthesize a fold matrix after r1 findings arrive.

When used after r1, the pre-relay fold matrix SHOULD identify:

1. each finding or cross-confirmed finding class;
2. severity arbitration when lanes disagree;
3. whether § 9.8 structural fold default fires;
4. the smallest proposed fold mechanism;
5. which draft section should change;
6. which risks the r2 review should check.

Close-out should record a compression metric: r1 finding count -> number of draft fold cycles -> r2 residual finding count. This is a process-quality metric, not a gate.

**Data points**: Slice 4.1 and Slice 4.2 used pre-relay analysis to compress classification and seam-location issues before formal approval. Slice 4.4 used post-r1 pre-relay fold compression: 4 r1 findings -> one v1.1 fold cycle -> both r2 lanes 0/0/0.

**How to apply**: pre-relay analysis should identify likely reviewer flags, not pre-decide them. Formal reviewers remain free to raise different severities. Divergence between pre-relay severity and in-cycle severity is expected because pre-relay is fold-design assistance, not a gate.

## Out of scope for this doc

- 6-actor charter → `ROLE_POSITIONING.md`.
- `source_repo_path` schema/propagation design → forthcoming oh-healthcare internal SDD spec.
- Per-slice acceptance-criterion conventions → each spec in `docs/specs/` is self-contained.
- Brand voice rules → `content-zoe/docs/SOUL.md` (not yet written).
- Bot allowlist + preflight policy → `content-zoe/AGENTS.md` (stubbed, filled at scaffolding commit per PLAN.md).
- Patterns at threshold but deferred from § 9 (will fold once a future cycle exercises each):
  - From Slice 3 cycle: #4 Optional consistency strengthening, #9 Constrained-alternative-due-to-prior-slice-freeze, #10 Cross-lane finding amplification (emerging) — held back per hc-codex's "only patterns Slice 3 implementation will actually use" filter.
  - From charter v3.3 cycle (2026-04-28): Path B charter-vs-engine decoupling (registered as sub-pattern in § 9.6 above); bonus strengthening clauses as fold-quality signal; verbiage-drift-on-binding-force-flip (cz-Claude r1 M-r1-1 origin); lifecycle-clause-for-slice-draft-top-declarations (cz-Claude r1 M-r1-3 origin). Each held below recurrence threshold (N=1) until a second cycle exercises it.
