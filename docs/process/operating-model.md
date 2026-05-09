# Operating Model — execution mechanics

**Companion to [`ROLE_POSITIONING.md`](../../ROLE_POSITIONING.md)** (operator-authored charter, canonical). This doc fills in the operational mechanics that the charter doesn't cover: artifact chain, failure lanes, memory ownership split, review budget, and reviewer arbitration. When this doc and `ROLE_POSITIONING.md` disagree, the charter wins.

**Intent**: make the half-autonomous workflow in `~/Desktop/Screenshot 2026-04-17 at 2.53.34 AM.png` operationally executable so a fresh session can pick up mid-flow without re-discovering decisions.

**Core rule reproduced from charter**: content-zoe product code is implemented only by openclaw-healthcare workers. The driver lane does NOT bypass the workflow. There are no Direct or Fallback implementation lanes — those were considered and rejected.

## 1. Repo mutation boundaries

| Repo | Who may mutate | Scope |
|---|---|---|
| `openclaw-healthcare` | oh-healthcare workers only (via Zoe runtime) | engine evolution scoped to cross-repo target support (`source_repo_path` column + propagation). Any other change uses oh-healthcare's own SDD flow. |
| `content-zoe` | oh-healthcare workers only for runtime product code, any `src/` file, schema, migrations, tests under `src/`, command grammar, prompt templates, LLM/provider code, authorization, approval, promotion, publish, and other product behavior. hc-Claude for governance artifacts like this file, and for review-only micro-cycles per § 7 when the diff is limited to non-product test/smoke/evidence/docs/governance-support files. cz-Claude for spec/plan authorship in `docs/specs/` and `docs/plans/`. | never writes into oh-healthcare. |

**Enforced invariants:**
- Content-zoe → oh-healthcare writes are forbidden (per `~/.claude/projects/-Users-youjia-dev-content-zoe/memory/feedback_readonly_reference_repos.md`).
- Driver agents (hc-Claude, cz-Claude, hc-Codex) do NOT edit content-zoe runtime product code directly. All runtime product code lands through workers. Driver-lane direct edits to non-product test/smoke/evidence/docs/governance-support files are permitted only under § 7 review-only micro-cycle eligibility and require dual-lane approval before push.
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

### Implementation hard-out anchor discipline

When a cycle has both an approval-label commit and a later implementation commit, dispatch packets, Gate dispatch packets, and Gate review artifacts MUST name the implementation hard-out anchor.

Use two ranges when both are relevant:

- `cumulative range`: cycle base to fix HEAD, including approval-label authority edits;
- `implementation range`: approval-label commit, worker-intake commit, or other pre-implementation anchor to fix HEAD.

Dispatch and Gate artifacts should name at least:

- cycle base;
- approval-label commit, when one exists;
- implementation hard-out anchor;
- fix HEAD or target implementation commit;
- whether cumulative and implementation ranges differ.

Hard-out checks for runtime/product/package/lockfile/smoke/governance drift are implementation-defect checks against the implementation range unless the dispatch explicitly asks reviewers to review approval-label authority edits.

Approval-label PLAN.md/TODOS.md tracking edits are authority-surface process events only when they are limited to the `[x] (cz-Claude approved YYYY-MM-DD; classification=...) Slice N: ...` approved-slice line and an adjacent operator-recorded classification rationale note. Other PLAN.md/TODOS.md edits in approval-label commits remain subject to hard-out review.

Hard-out anchor language guides reviewer interpretation of which diff range to inspect. Worker-time scope guard mechanics are unchanged: workers continue to fail when they write outside declared file scope, regardless of which commit is the hard-out anchor.

Reviewers MAY still record cumulative-range differences when they matter for close-out or process accounting. If cumulative and implementation ranges disagree, the artifact must say which range carries the finding.

**Origin**: Slice 4.15 Gate 1 hc-Claude LOW on PLAN.md approval-label tracking. The implementation commit respected the PLAN.md hard-out, while the operator-authored approval-label commit added the slice tracking line. The lesson is anchor clarity, not relaxed hard-outs.

### Review artifact write-path discipline

Reviewers SHOULD write review artifacts to the canonical artifact path for their lane, as defined in § 4.

Review artifacts SHOULD include a load-bearing refs table near the top naming the target implementation SHA, base SHA, locked draft SHA, predecessor review SHAs when relevant, and any mirrored artifact paths. Artifact SHA-256 values should be recorded in full when used for cross-session lookup.

If an artifact is written to the wrong repo because the reviewer cwd drifted, the operator may reconcile it by copying it to the canonical path only if the byte-identical SHA is preserved. The close-out should record the reconciliation.

Artifact existence and absence claims MUST state the searched repo/path scope, especially when artifacts may live in either `openclaw-healthcare/.omx/artifacts/` or `content-zoe/.omx/artifacts/`.

Metadata-only checks of existence, path, file size, SHA-256, lane, round, and verdict signature are permitted before verdict formation and do not violate lane independence.

The no-body-consultation rule applies to peer or companion-lane artifact bodies before the reviewer commits to an independent verdict. It does not block reading own-lane prior-round artifacts, locked specs/drafts, dispatch packets, source commits, operator-provided fold summaries, or cross-lane artifacts after the reviewer has committed to their verdict for reconciliation or close-out.

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

### Amendment-drafting enforcement-chain trace

When a charter or operating-model amendment introduces a new worker-facing classification, authority surface, scope subtype, or reviewer gate, the draft MUST include an enforcement-chain trace table before r1 review.

The table should cover at least:

- committed authority surface (`PLAN.md`, `TODOS.md`, `ROLE_POSITIONING.md`, or other);
- operator intake field;
- worker execution-packet wording;
- scope-guard or file-scope interpretation;
- worker stop-and-surface behavior;
- Gate 1 disposition;
- Gate 2 disposition when target-side product semantics are affected;
- close-out or memory surface if the rule creates a reusable corpus signal.

Each row must say `extended`, `not extended`, or `deferred`, with one-sentence rationale. A rule that affects worker authority but leaves any authority-chain row implicit should be treated as an r1 review risk.

**Origin**: v3.5 H1/M-r1-1. The proposed bounded-reopen rule was substantively useful but unsafe until the enforcement chain was traced.

### Review execution mode

Review artifacts SHOULD record execution mode near the top when mode affects evidence interpretation:

- `textual/source-read`;
- `behavioral/disposable-archive`;
- `behavioral/live-worktree`;
- `output-only synthesis`;
- `not run / operator-only boundary`;
- other mode with a short reason.

If a tool-enabled review exceeds budget, the operator may accept an output-only synthesis at the canonical artifact path only when it records the target refs, evidence ceiling, omitted checks, and reason the substitution is acceptable. This fallback is not a substitute for required behavioral execution when a gate specifically needs replay evidence; it is a budget/recordkeeping fallback that later lanes may challenge.

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

### Review-only micro-cycles

A review-only micro-cycle is a narrow Phase shape for behaviorally inert refactors that are too important to push without dual-lane review but too small for a full slice cycle.

Eligibility is strict. A micro-cycle may be used only when all are true:

1. the change is behaviorally inert at the product/runtime surface;
2. the cumulative diff touches only non-product test, smoke, evidence, docs, or governance-support files;
3. no `src/` file changes whatsoever;
4. no DB schema, migration, event/status vocabulary, command grammar, prompt template, LLM/provider, authorization, retry/CAS, approval, promotion, publish behavior, worker authority, file-scope rule, operator-only boundary, or reviewer-gate change;
5. no normative edit to operative governance files (`ROLE_POSITIONING.md`, `docs/process/operating-model.md`, `PLAN.md` / `TODOS.md` approval or scope lines, `AGENTS.md`, or future committed authority files), except pure typo/formatting edits whose artifacts explicitly attest no normative effect;
6. the operator records the target SHA, base SHA, declared file scope, implementation authoring mode, and reason a full slice cycle is out of proportion before review starts;
7. two independent review lanes run: one textual/source-read lane and one behavioral/replay lane;
8. both lanes return `VERDICT: APPROVE` or `VERDICT: APPROVE-WITH-AMENDMENTS-MET` before push.

Implementation authority is part of eligibility. The target commit must be created before review as an operator-owned local commit or an explicitly operator-supervised driver-lane local commit. No hc-worker, worker execution packet, intake snapshot, or bounded-reopen authority is implied. If a worker, worker packet, target-side product semantics, or bounded file is needed, use an ordinary slice cycle.

Required dispatch metadata:

- phase number and short subject;
- base SHA and target SHA;
- declared file scope;
- implementation authoring mode (`operator-local` or `operator-supervised-driver`) and actor;
- reason the change is behaviorally inert and a full slice cycle is out of proportion;
- commands or evidence expected from the behavioral lane;
- commands that remain operator-only or out of scope.

Required artifacts:

- one textual artifact in the reviewer-owning repo at `.omx/artifacts/claude-phase-<phase>-microreview-YYYY-MM-DD(-rN).md`, unless the dispatch names a different canonical path;
- one behavioral artifact in the reviewer-owning repo at `.omx/artifacts/codex-phase-<phase>-microreview-YYYY-MM-DD(-rN).md`, unless the dispatch names a different canonical path;
- both artifacts must include target/base SHAs, declared scope, implementation authoring mode, review execution mode, verdict line using the standard `VERDICT:` vocabulary, and any commands intentionally not run;
- r2 and later rounds use the same original date with `-r2`, `-r3`, ... suffixes; the latest suffix is operative for that lane;
- byte-identical mirrors into the target repo are permitted but optional; the close-out must cite the canonical path and SHA-256 for each lane.

Allowed outcomes:

- both lanes approve r1: operator may push immediately and close out the micro-cycle;
- either lane returns findings: fold within the micro-cycle, then run an r2 micro-review limited to the fold;
- either lane finds product/runtime behavior or authority-surface change: stop the micro-cycle and reclassify as an ordinary slice or charter cycle.

Micro-cycles do not replace slice approval, Gate 1, or Gate 2 for product work. They are explicitly unavailable for worker-implemented feature slices, normative governance amendments, and any change that needs a locked spec, committed PLAN/TODOS authority, or worker execution packet.

Origin: Phase 4.14 smoke-helper extraction (`8b1aef9..b1a904d`) reviewed by hc-Claude textual lane and hc-Codex behavioral lane, both approving r1, with no runtime product file diff and no `report:run` / real Telegram execution.

### Lightweight closure slices

A lightweight closure slice is a review-only cycle used to retire a previously recorded forward observation, exemption debt, or structurally bounded harness gap.

Eligibility is strict. A lightweight closure slice may be used only when all are true:

1. the closure target was pre-committed in a prior locked spec or operator-approved close-out; review artifacts are sufficient only when the operator explicitly accepted the closure commitment in a subsequent close-out or dispatch packet;
2. the diff is limited to non-product test, smoke, static-policy helper, or evidence-doc files;
3. no product runtime file changes, including no `src/` product surface, package or lockfile, DB schema/migration, command grammar, prompt/LLM, Telegram, notifier, promote, report-run, preflight, authorization, retry/CAS, approval, publish, or operator-only execution surface;
4. all runtime hard-outs named by the prior slice or close-out are zero-diff;
5. no new behavioral product contract is introduced;
6. the closure is structurally proven, preferably by an in-tree smoke row, regression, or synthetic counterexample that exercises the previously failing shape;
7. two independent review lanes run before close-out: one textual/source/governance lane and one behavioral/replay lane;
8. if the change has already been pushed because it is operator-owned closure work, cz-side Gate 2 remains required before memorialization unless the operator records an explicit charter override.

Required dispatch metadata:

- phase number and short subject;
- base SHA and target or fix HEAD;
- declared file scope;
- prior locked spec, operator-approved close-out, or explicitly operator-accepted review artifact that committed the closure target;
- runtime hard-out list or pointer to the prior list;
- structural proof expected from the textual lane;
- replay evidence expected from the behavioral lane;
- commands that remain operator-only or out of scope.

Required artifacts:

- one textual artifact and one behavioral artifact in the reviewer-owning `.omx/artifacts/` tree;
- each artifact must record base/target SHAs, declared scope, closure target, hard-out status, verdict line using the standard `VERDICT:` vocabulary, and commands intentionally not run;
- if an artifact path does not use the legacy `microreview` filename, the dispatch must name the canonical path. The close-out must cite the canonical path and SHA-256 for each lane.

Allowed outcomes:

- both lanes approve r1: operator may close out the closure slice and memorialize the retired observation;
- either lane returns findings: fold within the closure slice or open a micro-fix cycle;
- either lane finds product/runtime behavior change, new behavioral contract, or authority-surface change: stop and reclassify as ordinary slice or charter work.

Lightweight closure slices are not gate reduction. They are scope reduction. The number of lanes remains dual; the replay burden scales with product-behavior delta. Product slices still use ordinary slice approval, Gate 1, and Gate 2.

Origin: Phase 4.21 retired Slice 4.12's bot-smoke source-pinning debt by extracting cycle-scope policy into `scripts/lib/static-guardrails.ts`. The commit changed five smoke/helper/evidence files, no product runtime files, and passed hc + cz dual-lane review with 0H/0M/0L.

Clean-cycle streaks are evidence, not authorization.

Even when a corpus pattern reaches N=3 or higher for clean r1 / zero-blocking outcomes, do not reduce required lanes or gates unless a future charter amendment explicitly codifies that reduction and explains the residual-risk tradeoff. v3.8 preserves lane discipline. It only lets review burden scale to product-behavior delta inside an otherwise dual-lane process.

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

Cross-confirmed findings should be classified by fold shape:

- `merged-fold`: both lanes identify the same class at the same anchor or line range; one fold row normally closes both.
- `sibling-fold`: both lanes identify the same class on the same upstream surface but at adjacent or different anchors; the fold may need sibling rows under one parent finding class.
- `complementary-fold`: both lanes identify the same class from different anchors or lens angles; the fold should close the shared contract gap and preserve both evidence paths in the matrix.
- `lock-step-multi-pair`: multiple independent cross-confirmed pairs fire in the same cycle; each pair should get its own fold row unless one structural change truly closes all pairs.

Severity arbitration remains governed by § 7. Same-severity pairs stay at that severity unless independent escalation criteria apply. Different-severity pairs use the higher severity when they are the same finding class.

The r2 review should verify joint closure for every cross-confirmed pair. A fold that is textually closed in one lane but still behaviorally open in the other has not structurally closed.

**Data points**:

- Slice 4.1: textual and behavioral lanes both identified the research manifest gap; Path W resolved it structurally with canonical `research/brief.md` using existing `file_non_empty`.
- Slice 4.2: textual and behavioral lanes both identified static research self-wrapping as non-equivalent to trusted runtime wrapping; Path B resolved it structurally with `StageDef.buildPrompt?` and runtime prompt construction.
- Slice 4.3 under operative v3.4: textual LOW + behavioral MEDIUM both identified sentinel smoke coverage gap; severity arbitration resolved to MEDIUM and v1.1 folded structurally by adding `<<<OPERATOR_FEEDBACK>>>` coverage.
- Slice 4.4 under operative v3.4: textual LOW + behavioral MEDIUM both identified advisory-directive prompt coverage gap; severity arbitration resolved to MEDIUM and v1.1 folded structurally by adding directive constants, A6 mapping rows, and prompt-boundary smoke assertions.
- Charter v3.5: cz-Claude M-r1-1 + cz-Codex H1 cross-confirmed the bounded-reopen authority-chain gap; severity arbitrated to HIGH and folded structurally by Path B deferral.
- Slice 4.5 slice approval: M+M same-severity sibling-fold on inherited PLAN.md column semantics (`jobs.approval_summary` and `jobs.run_dir`).
- Slice 4.6 slice approval: two M+M cross-confirmed pairs in one cycle, retry-count semantics and A6 boundary static sweep.
- Slice 4.5 Gate 1: four MEDIUM lock-step pairs jointly closed at r2.
- Slice 4.6 Gate 1: boundary static-check regex coverage jointly closed at r2.

**How to apply**: if both lanes flag the same class, the fold matrix should mark it `cross-confirmed`, name the fold shape, and state the r2 joint-closure check. The drafter may still choose a smaller fold than either reviewer proposed, but the fold should close the underlying equivalence gap rather than merely promise future discipline.

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
- Slice 4.5 Gate 1 found a plain-`git diff` static check vacuity after commit. Slice 4.6 preemptively folded that lesson by reading `src/telegram/notifier.ts` directly.
- Slice 4.5 and Slice 4.6 showed that contract constants (`APPROVAL_SUMMARY_MAX_CHARS`, retry delays, notifier limits, marker strings) need smoke calibration when they encode product behavior.
- Slice 4.6 Gate 1 showed that boundary regex coverage belongs to the spec-declared negative invariant list, not to reviewer memory.

Static guardrail smokes must be non-vacuous. A smoke that checks absence or presence of source patterns MUST inspect committed source files directly or inspect a stable explicit `base..HEAD` diff. Plain `git diff` in a clean committed checkout is not sufficient because it can pass after commit without inspecting the target surface.

When an acceptance criterion binds a constant value, limit, marker string, retry sequence, or exported directive, the draft should prefer a three-anchor contract:

1. spec text names the value or invariant;
2. implementation exports or centralizes the value where practical;
3. smoke imports the value or asserts exact source/runtime identity.

For every runtime-observable prompt directive, either:

1. export it as a named constant and assert it by exact-string or structural smoke coverage; or
2. explicitly mark it as real-run-only / FakeProvider-infeasible in the draft.

The smoke does not need to prove the LLM obeys the directive under FakeProvider. It only needs to prove the directive is materialized into the prompt. Real output quality remains later calibration/eval.

When a MUST clause has a negative branch ("if not X, MUST NOT Y", "zero rows affected MUST NOT insert event", "no real network call"), the negative branch is a runtime-observable clause and should receive its own smoke row or explicit infeasibility note. Covering only the positive branch is incomplete when the negative branch prevents product-state corruption.

For boundary/static checks, every spec-declared negative invariant should have a corresponding static assertion row. Reviewers should accept functionally equivalent regex or parser variants when they cover the same realistic regression vector; the fold ask need not force exact regex spelling.

Drafts that include static guardrail rows should include:

| Directive / Contract | Where Defined | Smoke Assertion | If Not Smokeable, Why |
|---|---|---|---|

Use this table for prompt directives, static guardrails, constants, and negative invariants whenever the slice introduces or modifies runtime-observable acceptance criteria.

**How to apply**: before dispatching slice-approval, sweep the draft's acceptance criteria for runtime-observable MUST/SHOULD clauses. For each, add a smoke mapping row or an explicit infeasibility note. If one instance of a clause class is mapped, sweep for all other instances of the same class before dispatch.

Static guardrail helper extraction is allowed and encouraged when multiple smokes enforce the same conceptual forbidden surface.

Extraction must be coverage-preserving or coverage-raising:

1. each old inline pattern's realistic regression vector remains covered;
2. if patterns differ across smokes, the shared catalog should normalize to the strongest defensible coverage rather than the weakest common subset;
3. false-positive reduction is acceptable only when real regression vectors remain covered;
4. the review should explicitly check for regex narrowing on import aliases, path aliases, alternate import grammar, and runtime-specific spellings;
5. helper labels may become more specific, but any external consumer of label strings must be identified before the label changes.

Shared static catalogs should separate concept classes. For example:

- prompt-producing surface (`buildPrompt`, `.runPrompt(`, prompt-file imports, sentinel delimiters);
- LLM provider imports;
- process-spawn surfaces (`node:child_process`, `child_process`, `Bun.spawn`, `spawnSync`, `execFile`, `execSync`);
- real-network surfaces (`api.telegram.org`, raw `fetch` to Telegram, real SDK constructors);
- operator-only command surfaces (`report:run`).

Stable feature guardrails and volatile per-cycle scope guards should be separate when practical:

- stable feature guard: checks the permanent invariant for a product surface, such as "bot runtime has no command handlers yet" or "notifier has no Telegram SDK import";
- per-cycle scope guard: checks that the current cycle touched only the declared files relative to a stated base SHA.

Do not hide a per-cycle base SHA and declared scope inside a long-lived feature smoke unless the cycle intentionally owns updating those values. If a feature smoke must carry per-cycle scope temporarily, the close-out should record whether a dedicated cycle-scope smoke or reusable helper is warranted.

Origin: Phase 4.14 extracted `scripts/lib/static-guardrails.ts` after repeated boundary-static-check omissions across Slice 4.6 and Slice 4.7. The extraction preserved smoke counts while centralizing prompt/process/Telegram guardrails and widening process-spawn coverage.

Long-lived smokes must separate current-cycle scope validation from inherited product-surface validation.

When a smoke is reused across slices, it SHOULD use a cycle-scope policy with two conceptual modes:

- `active-slice`: the current changed files intersect the smoke's active trigger surface, so the smoke enforces the current slice's declared scope strictly and verifies frozen files/directories stayed untouched;
- `inherited-surface`: the current changed files do not touch the smoke's active trigger surface, so unrelated slice files are allowed while the smoke's owned product surfaces remain frozen.

Equivalent implementations are acceptable. The rule is semantic, not tied to a specific helper name. A helper such as `assertCycleScopePolicy` is preferred when multiple smokes need the same policy.

Cycle-scope policies should declare:

1. the changed files under review;
2. active trigger files;
3. active declared scope;
4. active frozen files and directories;
5. inherited frozen files and directories.

Smokes that adopt active/inherited policy SHOULD include bidirectional proof when feasible:

- an inherited-mode synthetic or fixture input showing that a prior unrelated slice would no longer need a one-off exemption;
- an active-mode synthetic or fixture input showing that out-of-scope files are still rejected when the smoke owns the current slice.

Do not encode a stale `targetBase` and declared scope directly in a long-lived feature smoke when a cycle-scope helper or equivalent active/inherited policy is available. If a one-off exemption is temporarily needed, the approving spec or close-out must bind a follow-on closure slice or explicitly accept permanent residual risk.

Origin: Phase 4.21 extracted cycle-scope policy after Slice 4.12 required a one-cycle bot-smoke exemption. `bot-smoke` proved Slice 4.12-style report-create files resolve as inherited-surface; `report-create-smoke` proved active mode still rejects out-of-scope Telegram files.

### 9.11 Pre-relay fold compression and fold-to-layer discipline

**Rule**: for framework, framework-conservative, borderline, high-surface handler, or charter-amendment cycles, the operator SHOULD use a pre-relay fold pass before formal dispatch when a planning lane is available.

Pre-relay fold compression is advisory, not a replacement for formal review. It exists to remove obvious scope/accounting contradictions before they consume reviewer rounds and to synthesize a fold matrix after r1 findings arrive.

When used after r1, the pre-relay fold matrix SHOULD identify:

1. each finding or cross-confirmed finding class;
2. severity arbitration when lanes disagree;
3. § 9.8 fold shape, when cross-confirmed;
4. the smallest proposed fold mechanism;
5. the layer where the gap actually lives: spec text, implementation runtime, smoke coverage, evidence docs, reviewer execution mode, or operator process;
6. which draft or implementation section should change;
7. which risks r2 should check.

Folds should land at the layer where the gap exists. If a finding is a smoke-coverage gap and runtime behavior is already correct, prefer a smoke/evidence fold over runtime churn. If a finding is a runtime/spec mismatch, documentation-only folds are insufficient unless the matrix records why runtime change is infeasible or out of proportion.

Close-out should record a compression metric: r1 finding count -> unique fold entries -> fold cycles -> r2 residual finding count. Use all four fields when the data is known. If an older close-out recorded only the prior three-part metric, later summaries may backfill the missing fold-entry count with an explicit reconstruction note. This is a process-quality metric, not a gate.

**Data points**:

- Slice 4.4 slice approval: `4 -> 1 -> 1 -> 0`.
- Charter v3.5: `8 -> 1 -> 1 -> 0`.
- Slice 4.5 slice approval: `6 -> 1 -> 1 -> 0`.
- Slice 4.5 Gate 1: `9 -> 5 -> 1 -> 0`.
- Slice 4.6 slice approval: `5 -> 5 -> 1 -> 0`.
- Slice 4.6 Gate 1: `3 -> 1 -> 1 -> 0`.
- Slice 4.7 Gate 1: `4 -> 4 -> 1 -> 0` (hc-Claude 3 findings + hc-Codex 1 finding; one atomic intra-scope fold; both lanes r2 clean).
- Phase 4.14 review-only micro-cycle: `1 -> 1 -> 0 -> 0` (one LOW non-blocking forward observation carried as a disposition entry; no fold cycle and no r2 required); r1 dual-lane approve.

For micro-cycles, record carried forward observations as disposition entries when they are reviewed and accepted rather than silently excluded from the metric. A LOW finding explicitly carried as a forward observation is not an r2 residual if the approving reviewer labels it non-blocking and the operator accepts that disposition in close-out.

Review-only/refactor and lightweight closure cycles may use a binding-text compression metric when there is no full slice-approval draft:

`binding text -> r1 findings -> implementation fix cycles -> final`

Fields:

- `binding text`: prior locked spec line, operator-approved close-out commitment, or explicitly operator-accepted review artifact reference that authorized the closure/refactor target;
- `r1 findings`: total blocking findings from the first dual-lane review round of the closure/refactor cycle;
- `implementation fix cycles`: number of follow-on fix cycles required after r1;
- `final`: final blocking finding count and whether the original binding text was satisfied, retired, or reclassified.

This metric is for closure/refactor cycles only. Product slices keep the ordinary `r1 finding count -> unique fold entries -> fold cycles -> r2 residual finding count` metric.

Data point:

- Phase 4.21 lightweight closure: `Slice 4.12 v1.3 F6 binding -> 0H/0M/0L hc r1 + 0H/0M/0L cz Gate 2 -> 0 implementation fix cycles -> FO5 structurally closed`.

**How to apply**: pre-relay analysis should identify likely reviewer flags, not pre-decide them. Formal reviewers remain free to raise different severities. Divergence between pre-relay severity and in-cycle severity is expected because pre-relay is fold-design assistance, not a gate.

### 9.12 BOUNDED-REOPEN-IF-NEEDED authority chain

`BOUNDED-REOPEN-IF-NEEDED` is a declared-scope subtype for files that are normally OUT for a slice but may need a narrow edit if a named implementation-time condition fires.

It is not an exception to declared scope.

A bounded reopen is valid only when all of the following are true:

1. the file is listed on the committed PLAN.md/TODOS.md approved-slice line or adjacent committed scope note using `BOUNDED-REOPEN-IF-NEEDED`;
2. the declaration names a trigger and boundary;
3. the cross-repo intake snapshot carries matching `bounded_reopen_files` fields;
4. the same path is serialized into the worker execution packet's mechanical declared-file-scope list (`tasks.declaredFileScope` or equivalent) as a plain repo-relative path/glob;
5. the worker handback or commit evidence states whether the trigger fired;
6. if the file changed, Gate 1 verifies committed scope, packet scope, trigger metadata, boundary, and minimality.

Example approved-slice shape:

`[x] (cz-Claude approved YYYY-MM-DD; cz-Codex approved YYYY-MM-DD; classification=framework) Slice N: title — file scope: src/new.ts, scripts/new-smoke.ts, src/bin/report-run.ts (BOUNDED-REOPEN-IF-NEEDED: recovery-carry-forward-only; no CLI/env/schema changes)`

Required intake fields when any bounded file exists:

```yaml
declared_file_scope_packet:
  - src/new.ts
  - scripts/new-smoke.ts
  - src/bin/report-run.ts
bounded_reopen_files:
  - path: src/bin/report-run.ts
    trigger: recovery-carry-forward-only
    boundary: no CLI/env/schema changes; preserve existing report loop contract
    source_line: PLAN.md Slice N approved-slice line
```

Worker behavior:

- Treat bounded files as OUT unless the trigger fires.
- Stop and surface before first edit when practical.
- If discovered during an edit or smoke repair, complete only the smallest bounded change and mark the handback `BOUNDED-REOPEN-USED`.
- Do not broaden the boundary without retask/re-intake and rerun Gate 1 after the authority surfaces are repaired.

Gate 1 behavior:

- Accept as bounded only when committed scope, packet declared-file-scope, intake metadata, trigger evidence, and minimality all match.
- Retask/re-intake when a needed edit is not predeclared, missing from packet declared-file-scope, missing bounded metadata, or exceeds the boundary.
- Hold for authority repair when the operator wants to preserve branch history: amend committed scope and packet/intake metadata, then rerun Gate 1 before Gate 2 or merge.
- Treat undeclared "looks bounded" edits as ordinary scope violations. An unrepaired merge is a manual charter override outside the bounded-reopen success path.

Draft-only status:

- `.omx/drafts/*` may use `BOUNDED-REOPEN-IF-NEEDED` as planning language, but draft-only declarations do not authorize worker edits because `.omx/` is gitignored and workers operate from a checked-out target worktree.
- A draft that includes bounded reopen should also specify how the committed PLAN.md/TODOS.md line and intake snapshot will carry it.

**Origin**: Slice 4.1 + Slice 4.3 impl-time bounded `src/bin/report-run.ts` reopen, Slice 4.4 draft-time predeclaration, v3.5 H1/M-r1-1 Path B deferral, and Slice 4.5/4.6 deferral preservation.

### 9.13 Cross-slice learning tags and corpus-to-structural-fix loop

When a finding class recurs across slices or gates, review artifacts SHOULD add a compact learning tag block:

| Field | Value |
|---|---|
| finding_class | short class name |
| source_slice | slice or phase where observed |
| residual_risk | low / medium / high |
| promotion_candidate | yes / no / maybe |

Optional extra fields may include `escalation_evidence`, `related_slice`, or `suggested_structural_fix` when the recurrence points to a specific helper, rule, or workflow change.

Learning tags are not findings by themselves. They are corpus-index entries that help close-outs decide whether an observation has crossed from local fix to structural pattern.

Promotion criteria:

- one high-severity recurrence with the same class and surface; or
- two medium/low recurrences across distinct slices or gates; or
- one recurrence plus a successful structural fix that has shipped, been reviewed, and eliminated the omission vector.

When a learning tag is promoted, the next close-out should choose one disposition:

1. Fold now as a micro-cycle when the fix is behaviorally inert, non-product, and outside operative governance authority surfaces.
2. Fold now as a charter or operating-model amendment when the fix changes normative governance, reviewer gates, worker authority, operator-only boundaries, or committed file-scope rules.
3. Fold into the next product slice when the fix naturally belongs to that slice's declared scope.
4. Carry forward with an explicit threshold if more evidence is needed.
5. Reject or retire with canonical-source evidence.

N=3 recurrence is evidence for shape-convergence review, not automatic code consolidation.

Before extracting a helper from recurrent tags, the dispatch or review artifact should classify the observed call sites as one of:

- same abstraction: helper extraction is eligible if scope, ownership, and review coverage are also appropriate;
- similar but separate: carry the pattern forward without consolidation;
- coincidental recurrence: retire or narrow the helper candidate.

This applies both before and after N=3. A count threshold can authorize a closer look; it does not by itself authorize helper extraction, product changes, worker-authority changes, or gate reduction.

This ceiling discipline does not relax the existing helper-promotion bridge. Pre-N=3 helper extraction remains admissible only when the full bridge admissibility test is met: a specific `promotion_candidate: yes` learning tag or equivalent, independent structural reason in the later slice, coverage-preserving or coverage-raising implementation under § 9.10, no product/authority broadening, and appropriate dual-lane review. N=3 recurrence alone authorizes only shape-convergence review and does not substitute for any bridge admissibility criterion.

Origin: Slice 4.7 Gate 1 introduced Cross-Slice Learning Tags for `boundary-static-check`; Phase 4.13 close-out promoted the recurrence; Phase 4.14 implemented a shared static guardrail helper within hours. This is the first canonical corpus-to-structural-fix loop: the corpus did not merely describe a pattern, it directly caused a structural refactor.

Learning tags can authorize helper extraction before N=3 call sites when the tag is specific and the next structural fix naturally owns the helper.

Early helper promotion is admissible only when all are true:

1. a prior review or close-out emitted a learning tag naming the helper class or concrete helper candidate;
2. the tag records `promotion_candidate: yes` or an equivalent explicit promotion note;
3. the later slice has independent structural reason to touch the same helper/policy surface;
4. the helper extraction is coverage-preserving or coverage-raising under § 9.10;
5. review artifacts verify no product behavior or authority surface was broadened by the extraction;
6. close-out records why promotion before N=3 call sites is justified and whether future call-site growth is expected.

This bridge is not a license for speculative abstraction. A generic "might be useful later" observation is insufficient. The tag must point to a concrete recurring mechanism, and the implementation must ship cleanly under the appropriate dual-lane review.

Origin: Slice 4.12 emitted `helper-extraction-candidate-stripAllowedStaticCheckStrings` after report-create-smoke introduced a self-referential static-check token stripping idiom. Phase 4.21 promoted the helper into `scripts/lib/static-guardrails.ts` while already touching that module for cycle-scope extraction; all four review lanes approved 0H/0M/0L.

## Out of scope for this doc

- 6-actor charter → `ROLE_POSITIONING.md`.
- `source_repo_path` schema/propagation design → forthcoming oh-healthcare internal SDD spec.
- Per-slice acceptance-criterion conventions → each spec in `docs/specs/` is self-contained.
- Brand voice rules → `content-zoe/docs/SOUL.md` (not yet written).
- Bot allowlist + preflight policy → `content-zoe/AGENTS.md` (stubbed, filled at scaffolding commit per PLAN.md).
- Patterns at threshold but deferred from § 9 (will fold once a future cycle exercises each):
  - From Slice 3 cycle: #4 Optional consistency strengthening, #9 Constrained-alternative-due-to-prior-slice-freeze, #10 Cross-lane finding amplification (emerging) — held back per hc-codex's "only patterns Slice 3 implementation will actually use" filter.
  - From charter v3.3 cycle (2026-04-28): Path B charter-vs-engine decoupling (registered as sub-pattern in § 9.6 above); bonus strengthening clauses as fold-quality signal; verbiage-drift-on-binding-force-flip (cz-Claude r1 M-r1-1 origin); lifecycle-clause-for-slice-draft-top-declarations (cz-Claude r1 M-r1-3 origin). Each held below recurrence threshold (N=1) until a second cycle exercises it.
