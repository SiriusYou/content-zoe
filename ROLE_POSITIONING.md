# Role Positioning

## Core Rule

`content-zoe` code is implemented only by **openclaw-healthcare workers**.

The driver lane does **not** bypass the workflow and code directly.

## System Shape

- `openclaw-healthcare`: driver / process / orchestration / validation lane
- `openclaw-healthcare` workers: implementation lane
- `content-zoe`: target product / review / acceptance lane

## Roles

- **openclaw-healthcare Claude**
  - Process steward
  - Owns workflow discipline, stage transitions, memory, and run-log updates

- **openclaw-healthcare Codex**
  - Technical orchestrator
  - Owns technical shaping of specs/plans, worker-facing execution packets, and validation design

- **openclaw-healthcare Workers**
  - Coders
  - Receive the approved request/spec and implement the slice

- **content-zoe Claude**
  - Product steward
  - Reviews whether the slice matches `content-zoe` intent and `PLAN.md`

- **content-zoe Codex**
  - Adversarial target reviewer
  - Reviews implementation quality and drift against the target product

- **Operator**
  - Final approver
  - Owns priorities, approval, and merge decisions

## Cross-Repo Execution Contract

Cross-repo execution is now a proven and bounded mode. This contract defines what openclaw-healthcare workers do when `task.source_repo_path` points outside openclaw-healthcare.

### Worker Runtime Layout

- Worker runs from a task-root cwd, not inside the target-repo worktree.
- Target-repo worktree lives at `<task-root>/target/`, checked out from `task.source_repo_path`.
- Harness state (`STATE.md`, `specs/`, `evaluations/`, harness tools) lives at `<task-root>/.harness-state/` on the openclaw-healthcare side, never inside the target repo.
- Codex CLI invocation includes `--skip-git-repo-check` because task-root is not itself a git repo.
- Agent prompt forbids creating a second worktree, touching target `.git`, or writing outside declared file scope.

### Commit And Merge

- Worker commits only to the target repo's `agent/*` branch.
- Commits contain only declared-file-scope changes, enforced by scope guard at the evaluation boundary.
- Merge-loop resolves the target repo's actual base branch at runtime; it must not assume `master`.
- Target base branch remains untouched until operator approval triggers merge-loop.
- After merge, target base branch contains only intended product or docs changes; harness artifacts never cross over.

### Cleanup

- Cleanup-loop tears down both the target worktree and openclaw-healthcare-side `.harness-state/` on terminal task transitions.
- Orphan-loop and cancellation honor the same dual teardown.

## Cross-Repo Authority Model

A cross-repo task crosses two governance domains. Both must consent before commits land on the target base branch. Gates are sequenced, not parallel.

### Gate 1: openclaw-healthcare-Side Review

Gate 1 reviews engine correctness and always runs first. It proves the branch is mechanically safe, declared-scope clean, and free of harness artifacts before target-side product review begins.

- openclaw-healthcare Claude reviews process discipline, declared-scope adherence, charter alignment, lane integrity, and harness phase completion.
- openclaw-healthcare Codex adversarially reviews engine implementation correctness.
- Operator approves engine-side completion.
- On rejection at Gate 1, the task is routed back through harness re-execute so the worker iterates on the same `agent/*` branch with amended commits, or it is replaced by a fresh worker run with a revised spec. No commits flow to Gate 2 until Gate 1 approves.

Gate 1 classifies edits to bounded-reopen files as:

- accepted bounded deviation: the file was predeclared on the committed PLAN.md/TODOS.md approved-slice line, the path was serialized into the worker packet's mechanical declared-file-scope list, the intake carried matching `bounded_reopen_files` trigger/boundary fields, the worker evidence explains why the trigger fired, and the diff stays inside the boundary;
- retask/re-intake: the file was not predeclared, the path was missing from the mechanical declared-file-scope packet, bounded metadata was missing, the trigger changed materially, or the needed edit is broader than the boundary;
- hold for authority repair: the operator wants to preserve the current branch or commit history, but the authority surfaces are incomplete. The operator MUST amend committed PLAN.md/TODOS.md scope and packet/intake metadata, then rerun Gate 1 before Gate 2 or merge.

Gate 1 should reject any worker handback that treats an undeclared file as bounded solely because a prior slice or draft discussed similar risk. If the operator intentionally merges without repairing the authority surfaces, record it as a manual charter override outside the bounded-reopen success path, not as an accepted Gate 1 bounded disposition.

Gate 1 review artifacts and Gate dispatch packets follow operating-model implementation hard-out anchor discipline. When a slice has separate approval-label and implementation commits, reviewers distinguish cumulative range from implementation range and name the implementation hard-out anchor. Companion-artifact existence claims follow operating-model artifact searched-scope discipline.

Reviewer eligibility depends on session identity as well as lane role. A session that implemented a slice cannot issue the review verdict for that same slice's Gate 1 or Gate 2 reviewer slot. `Session-distinct` means a different conversation thread / process invocation that did not participate in implementation; a fresh re-invocation of the same actor identity qualifies only if it did not author, integrate, or belong to the implementation context. If a standard reviewer lane is ineligible because it performed implementation work, the slot is filled by an independent replacement reviewer with explicit disclosure in the review artifact and close-out. Methodology diversity does not substitute for implementer/reviewer session separation.

### Gate 2: Target-Side Review

Gate 2 reviews product and content correctness. It runs only after Gate 1 approves.

- For content-zoe, content-zoe Claude reviews against content-zoe spec and plan intent.
- For content-zoe, content-zoe Codex adversarially reviews target output.
- For future targets, charter extension is required before cross-repo execution is permitted.
- Operator approves target-side merge.
- On rejection at Gate 2, operator chooses one of two paths: amend commits on the same `agent/*` branch through a fresh worker iteration scoped to the rejection feedback, or drop the `agent/*` branch entirely and retask with a revised intake. Operator records the choice in the run log.

Cross-repo merge to the target base branch is gated on both Gate 1 and Gate 2 approval. Either gate rejecting halts merge and triggers the rejection flow above. The `agent/*` branch persists during rejection-and-retry cycles to preserve diff history. It is dropped only after successful merge or by explicit operator decision.

## content-zoe Actors: Dual State

content-zoe Claude and content-zoe Codex operate in two states based on repo maturity.

Active state: post-bootstrap — operator-declared 2026-05-28. Predicate satisfied: `package.json` is present; weekly-report bundles have been approved through the content-zoe Telegram approval flow and published under `reports/YYYY-Www-ai-trends/` through `2027-W07`; and the jobs are recorded with `status=published` in the local DB. The Post-Bootstrap role variants below are now operative. The Pre-Bootstrap subsection is retained as historical definition.

### Pre-Bootstrap

Historical pre-bootstrap state (superseded — see Active state above): content-zoe began as a planning workspace with no `package.json`. The authoritative state marker remains this file.

Transition to post-bootstrap state requires an explicit operator declaration recorded as a commit to this file. The recommended predicate is: `package.json` exists, `bun run report:run` has produced at least one published weekly-report bundle under `reports/YYYY-Www-ai-trends/`, and the bundle was approved through content-zoe Telegram approval flow with `status=published` in the local DB. Operator owns the transition decision and may declare earlier or later based on observed reliability.

- content-zoe Claude is spec and plan custodian for what content-zoe will become.
- content-zoe Claude reviews planning docs (`PLAN.md`, `TODOS.md`, addenda) for coherence and design intent.
- content-zoe Codex is adversarial reviewer of plan and spec drafts, not product code.

### Post-Bootstrap

Post-bootstrap state begins only after the explicit operator declaration described above. After that declaration:

- content-zoe Claude is full product steward and reviews implementation against the `PLAN.md` contract.
- content-zoe Codex is full adversarial reviewer of content-zoe code, acceptance criteria, and content-output quality.

## Worker Scope Rules In Cross-Repo

openclaw-healthcare workers committing to content-zoe are the only currently permitted cross-repo direction.

- Pre-bootstrap content-zoe target: only Markdown, planning, docs, or scaffolding files. Code commits to content-zoe require an explicit approved scaffolding-plan slice in `PLAN.md` or `TODOS.md`. The slice must be checked or marked approved by content-zoe Claude with declared file scope listed inline, for example: `[x] (cz-Claude approved 2026-04-XX) Slice 1: bootstrap report runner — file scope: package.json, src/preflight.ts, scripts/report-run.ts`. Workers verify the approved slice exists before writing code; harness scope guard fires if the worker writes code outside the listed file scope.
- Post-bootstrap content-zoe target: code commits are permitted, scoped per spec.
- V2 modality slices are permitted after the committed `PLAN.md` V2 scope-expansion section. hc-workers MAY write content-zoe `src/` code for V2 modality work only when the slice is declared in `PLAN.md` or `TODOS.md`, carries declared file scope, and has the required slice approval: cz-Claude for handler slices, and both cz-Claude plus cz-Codex for framework slices.
- Always: only declared-file-scope changes, never harness artifacts.
- Never edit `~/dev/content-zoe/AGENTS.md` through worker execution. It originated as a thin pointer per `f2f8a6b` but now also carries operator-lane runbook and operator-only execution rules; those are edited by the operator/driver lane, never by hc-workers.
- Never edit `~/dev/content-zoe/ROLE_POSITIONING.md` through worker execution.
- Never edit `~/dev/content-zoe/CLAUDE.md` through worker execution.

Review-only micro-cycles are a narrow driver-lane exception for non-product support changes.

They may create and push content-zoe commits only when operating-model § 7 micro-cycle eligibility is satisfied, both required review lanes approve, and the operator explicitly authorizes the push after review. The target commit must be either:

- an operator-owned local commit; or
- an operator-supervised driver-lane local commit created outside hc-worker execution, with the authoring mode recorded in the dispatch and review artifact.

No hc-worker, worker execution packet, intake snapshot, or bounded-reopen authority is implied by a micro-cycle.

Micro-cycles are unavailable for runtime product code, any `src/` file, database schema or migrations, command grammar, prompt templates, LLM/provider code, authorization semantics, retry/CAS behavior, approval/promotion/publish behavior, or any worker/scope authority surface.

Normative edits to operative governance files are not micro-cycle work. Operative governance files include `ROLE_POSITIONING.md`, `docs/process/operating-model.md`, `PLAN.md` / `TODOS.md` approval or scope lines, `AGENTS.md`, and any future committed file that controls worker authority, operator-only boundaries, reviewer gates, or file-scope rules. Pure typo or formatting edits to such files may use a micro-cycle only when the review artifacts explicitly attest that no normative meaning changed.

Lightweight closure slices are a narrow review-only variant for retiring a previously recorded forward observation or one-cycle-bounded exemption.

They may be used only when the closure target was pre-committed in a prior locked spec or operator-approved close-out. A review artifact can serve as the source only when the operator explicitly accepted that artifact's closure commitment in a subsequent close-out or dispatch packet. The diff must be non-product test/policy/evidence infrastructure only; all runtime and operative governance hard-outs must be zero-diff; and the closure must be structurally proven by review evidence, preferably an in-tree regression or synthetic counterexample.

Lightweight closure slices do not authorize product runtime edits, worker execution, PLAN/TODOS product-slice mutation, or gate reduction. If the closure requires a new behavioral product contract or a runtime file change, use an ordinary slice or charter cycle.

Bounded reopen is a declared-scope subtype, not an exception to declared scope.

A PLAN.md/TODOS.md approved-slice line MAY list a file as:

`<path> (BOUNDED-REOPEN-IF-NEEDED: <short trigger>)`

Example:

`src/bin/report-run.ts (BOUNDED-REOPEN-IF-NEEDED: recovery-carry-forward-only; no CLI/env/schema changes)`

Such a file is declared scope for mechanical file-scope purposes only when it is serialized into the worker execution packet's mechanical declared-file-scope list as a plain repo-relative path or allowed glob. It remains OUT by default for worker intent. The worker may edit it only when the named trigger becomes true and the edit stays inside the stated boundary.

The approved-slice line is the committed authority surface. The execution packet is the mechanical enforcement surface. A `.omx/drafts/*` table may recommend bounded reopen, but it is not binding worker authority unless the PLAN.md/TODOS.md approved-slice line, the cross-repo intake snapshot, and the worker packet's declared-file-scope list all carry the bounded file.

When a bounded trigger fires, the worker should stop and surface before modifying the file if that is still practical. If the trigger is discovered during an edit or while repairing a failing smoke, the worker may complete the smallest bounded edit, but the commit message or handback MUST identify:

- the bounded file;
- the trigger that fired;
- why the edit stayed inside the boundary;
- which smoke, diff, or reviewer evidence proves no adjacent frozen surface was changed.

An undeclared file that merely appears similar to a bounded-reopen case is not accepted as bounded. It requires ordinary retask/re-intake before merge. An unrepaired merge can only be a manual charter override outside the bounded-reopen success path.

## Slice Approval Evidence Requirement

Every `[x] (cz-Claude approved YYYY-MM-DD) Slice N: ...` line committed to PLAN.md or TODOS.md MUST have a matching `.omx/artifacts/claude-slice-N-review-YYYY-MM-DD.md` artifact, authored in a cz-Claude session, recording the substance of the review (scope verification, intent alignment, findings, verdict). The PLAN.md/TODOS.md label is the *index*; the artifact is the *substance*.

**Verdict vocabulary** — the artifact's final verdict line MUST use one of:

- `VERDICT: APPROVE` — slice scope sound, no findings requiring amendment
- `VERDICT: APPROVE-WITH-AMENDMENTS-PENDING` — findings raised, slice not yet ready for hc-worker action
- `VERDICT: APPROVE-WITH-AMENDMENTS-MET` — findings were raised AND the amendments are now applied; slice is ready
- `VERDICT: HOLD` — review incomplete or further investigation required
- `VERDICT: REJECT` — slice scope or intent fundamentally misaligned

**Approval gate** — a slice is "approved" for hc-worker action ONLY if (a) for **handler slices**, the cz-Claude review artifact's latest-suffix final verdict is `VERDICT: APPROVE` or `VERDICT: APPROVE-WITH-AMENDMENTS-MET`; (b) for **framework slices**, BOTH the cz-Claude review artifact's latest-suffix verdict AND the cz-Codex slice-approval review artifact's latest-suffix verdict are in the approve set (`VERDICT: APPROVE` or `VERDICT: APPROVE-WITH-AMENDMENTS-MET`). A PLAN.md/TODOS.md label without all required artifacts present, or with any required artifact whose latest-suffix verdict is `VERDICT: APPROVE-WITH-AMENDMENTS-PENDING`, `VERDICT: HOLD`, or `VERDICT: REJECT`, is NOT a valid approval. hc-workers must not act on it.

**Re-review on amendment** — if a slice is amended after initial review (e.g. operator, hc-codex, cz-Codex slice-approval review, or cz-Claude review addresses findings), the new review artifact uses an incremented suffix: `claude-slice-N-review-YYYY-MM-DD-r2.md`, `-r3.md`, etc. The `YYYY-MM-DD` in the filename is the **original review date** (not the re-review date); the suffix tracks the review iteration. Original artifacts are preserved in the working tree for audit; the **latest-suffix artifact's verdict is the operative one**.

**PLAN.md/TODOS.md label stability on re-review** — when a slice is amended and re-reviewed, the original `[x] (cz-Claude approved YYYY-MM-DD) Slice N: ...` label STAYS UNCHANGED. The label is the index pointing at the slice approval cycle; the operative status comes from the latest-suffix artifact's verdict, not from label toggling. This avoids cascading PLAN.md commits and worker-races between label and artifact state.

**cz-Codex involvement** — cz-Codex involvement at the slice-approval gate is governed by slice classification:

- **Handler slices**: cz-Claude review alone is sufficient at the slice-approval gate. cz-Codex slice-approval review (advisory) is permitted but not required. cz-Codex Gate 2 adversarial review remains mandatory at implementation/merge per Cross-repo authority model § Gate 2.
- **Framework slices**: BOTH cz-Claude review AND cz-Codex slice-approval review are mandatory at the slice-approval gate. Both reviewers' latest-suffix final verdicts MUST be in the approve set (`VERDICT: APPROVE` or `VERDICT: APPROVE-WITH-AMENDMENTS-MET`) before the slice is approved for hc-worker action. cz-Codex Gate 2 adversarial review remains mandatory at implementation/merge per Cross-repo authority model § Gate 2.

**Slice classification** — a slice is a **framework slice** if it introduces or modifies any of the following classes of cross-slice consumed contracts:

- (a) TypeScript interfaces, type aliases, exported classes, or functions whose signature is consumed across slice boundaries;
- (b) database schema (tables, columns, indexes, migrations) consumed by other slices;
- (c) event or status vocabularies (enum values, event-type strings, status-token strings) emitted by one slice and consumed by another;
- (d) command grammar — CLI argument structures, subcommand layouts, environment-variable names — consumed by other slices;
- (e) prompt templates, security delimiters, or escaping conventions that downstream slices interpolate into;
- (f) filesystem layout conventions, report directory structures, or artifact-path patterns consumed by other slices;
- (g) workflow, state-machine, lifecycle, retry, recovery, approval, promotion, or authorization semantics — behavioral invariants that downstream slices must honor or remain compatible with (e.g., state transition rules, retry-limit policies, crash-recovery sequencing, atomic-promote requirements, notifier compare-and-set rules, stage-loop behavior, authorization-token rotation policies).

A slice is a **handler slice** if it consumes existing frameworks/contracts without introducing or modifying any of (a)-(g).

The slice draft MUST declare classification at the top of the document on a line of the form `**Slice classification**: framework | handler`. The PLAN.md/TODOS.md approved-slice line MUST also carry the classification, in the form: `[x] (cz-Claude approved YYYY-MM-DD; classification=framework|handler) Slice N: <title> — file scope: <list>`. The PLAN.md/TODOS.md label is the **committed surface** that hc-workers can verify; the slice draft is the operator-internal artifact.

Where classification is ambiguous (e.g., a composition root that wires existing framework without defining new cross-slice contracts), the operator records the classification decision on the approved-slice line at **slice-approval label commit time** (i.e., when the operator commits the cz-Claude-approved label to PLAN.md/TODOS.md). The recorded decision MAY be supplemented by a one-line rationale note immediately below the approved-slice line.

**Classification lifecycle** — once recorded on the approved-slice line in PLAN.md/TODOS.md, the slice classification is sticky for the duration of the slice approval cycle (v1.0 → v1.N folds). If a draft revision introduces or removes a cross-slice contract that would change classification:

- **handler→framework upgrade**: operator MUST update the approved-slice line, MUST open a cz-Codex slice-approval review on the current draft revision before any further hc-worker action, and outstanding cz-Claude findings remain operative.
- **framework→handler downgrade**: operator MUST update the approved-slice line; any outstanding cz-Codex slice-approval findings on the now-handler slice may be retired with operator note recording the rationale, OR honored at operator discretion (downgrade does not invalidate prior findings, only their binding force).

Mid-cycle reclassification is an expected fold mechanism, not a process failure. When the upgrade/downgrade bullets above trigger, prior approvals remain audit evidence; the latest-suffix artifacts for the new classification are operative.

**cz-Codex slice-approval artifact format** — cz-Codex review at the slice-approval gate produces an artifact at `.omx/artifacts/codex-slice-N-review-YYYY-MM-DD.md`, with the same suffix convention as cz-Claude artifacts: `-r2`, `-r3`, ... for re-reviews; the original review date stays in the filename, the suffix tracks iteration; the latest-suffix verdict is operative for that reviewer's lane. cz-Claude and cz-Codex artifact suffix counters are **independent** — cz-Claude r1→rM and cz-Codex r1→rN do not need to lockstep. Each reviewer's latest-suffix verdict applies to that reviewer's lane only.

The artifact's final verdict line MUST use one of: `VERDICT: APPROVE`, `VERDICT: APPROVE-WITH-AMENDMENTS-PENDING`, `VERDICT: APPROVE-WITH-AMENDMENTS-MET`, `VERDICT: HOLD`, `VERDICT: REJECT`. Bare verdict tokens without the `VERDICT:` prefix are not conformant. Findings raised by cz-Codex follow the same fold-and-re-review cycle as cz-Claude findings (per § "Re-review on amendment").

**Reviewer arbitration at slice-approval** — when cz-Claude and cz-Codex disagree on a finding at the slice-approval gate, resolution follows operating-model § 7 ("Arbitration when reviewers disagree"). Concretely: severity + specificity filter → domain authority (product-fit ↔ cz-Claude; implementation-risk and cross-slice-contract correctness ↔ cz-Codex) → first-filer for same-domain same-severity → operator tiebreak.

**Cross-repo intake snapshot** — because `.omx/` is gitignored and hc-workers operate from a checked-out target worktree at `<task-root>/target/` (not the operator's original working tree), each cross-repo intake referencing a slice approval MUST include the following fields in the intake body:

For ALL slices (framework or handler):

- `slice_classification`: `framework` or `handler`. MUST match the classification declared on the PLAN.md/TODOS.md approved-slice line at the operator's cz checkout HEAD at intake-submission time. Workers MAY verify by `grep`-style match against PLAN.md/TODOS.md at HEAD.
- `slice_artifact_path`: path to the cz-Claude review artifact. MUST match the pattern `.omx/artifacts/claude-slice-N-review-YYYY-MM-DD(-rN)?.md`. **For re-reviewed slices, the path MUST point to the latest-suffix artifact** (e.g. `-r3.md` if r3 is the latest). An intake referencing an older-suffix artifact for an amended slice is invalid, even if that older artifact has an approving verdict.
- `slice_artifact_verdict`: the verbatim final verdict line from the cz-Claude artifact (e.g. `VERDICT: APPROVE-WITH-AMENDMENTS-MET`). MUST be in the approve set.
- `slice_artifact_sha256`: the cz-Claude artifact file's SHA-256 at intake-submission time.
- `declared_file_scope_packet`: the repo-relative file/glob list that will be serialized into the worker execution packet's mechanical declared-file-scope field (`tasks.declaredFileScope` or equivalent). When the PLAN.md/TODOS.md approved-slice line includes any `BOUNDED-REOPEN-IF-NEEDED` entry, each bounded path MUST also appear here as a plain path/glob so current scope guards can enforce file membership.
- `bounded_reopen_files`: required when the PLAN.md/TODOS.md approved-slice line includes any `BOUNDED-REOPEN-IF-NEEDED` entry; otherwise omitted or `none`. Each bounded row MUST include `path`, `trigger`, `boundary`, and `source_line` (the PLAN.md/TODOS.md approved-slice line or adjacent note). Each row's `path` MUST also appear in `declared_file_scope_packet`. The intake snapshot MUST match the committed approved-slice line at intake-submission HEAD.

For framework slices ONLY (additional required fields):

- `codex_review_path`: path to the cz-Codex slice-approval artifact. MUST match the pattern `.omx/artifacts/codex-slice-N-review-YYYY-MM-DD(-rN)?.md`. For re-reviewed slices, MUST point to the latest-suffix artifact.
- `codex_review_verdict`: the verbatim final verdict line from the cz-Codex artifact. MUST be in the approve set.
- `codex_review_sha256`: the cz-Codex artifact file's SHA-256 at intake-submission time.

**Enforcement** — these intake-snapshot fields are **operator attestations** captured at submission time. The operator MUST not submit an intake unless all required fields are present, all verdicts are in the approve set, all SHAs are accurate as of submission, all paths reference latest-suffix artifacts, and `slice_classification` matches the PLAN.md/TODOS.md approved-slice line. For bounded reopen, the operator also verifies that every bounded file named in the intake appears on the committed PLAN.md/TODOS.md approved-slice line, appears as a plain path/glob in the packet's mechanical declared-file-scope list, and appears in `bounded_reopen_files` with matching trigger/boundary metadata. No uncommitted draft-only bounded declaration may be used as worker authority. A submission that violates any of these constraints is invalid as a matter of charter; the slice is not approved.

**Mechanical enforcement** of these constraints — i.e., automated rejection of malformed intakes by the openclaw-healthcare intake-submit pipeline — is **deferred to a follow-on hc engine slice**. Until that engine slice lands, validation is operator-attestation-and-audit only: reviewers and the operator can audit intake snapshots against the corresponding cz checkout post-submission, and any violation surfaces in the run log for retroactive correction. For bounded reopen, Gate 1 reviewers audit the intake snapshot, the committed PLAN.md/TODOS.md line, the serialized declared-file-scope packet, and the worker diff. Once the engine slice ships, malformed intakes route through the **Gate 1 rejection flow** defined in the Cross-repo authority model — the worker is not started, the operator is notified of the specific invalidation reason, and the operator must resubmit with corrected snapshot fields.

For framework slices, both reviewer artifacts are operator attestations captured at submission time; reviewers can audit either hash against the operator's original cz checkout when needed.

Slice approval artifacts remain gitignored (per cz `.gitignore` for `.omx/`) — they live alongside the repo state for permanence within the working tree. Long-term archival of artifacts is operator policy and out of charter scope.

## Multi-Repo Composition

The full hc-driven content system involves three repos:

- **openclaw-healthcare**: engineering engine, source of hc-workers, host of SDD lane and harness/swarm.
- **content-zoe**: target of hc-worker commits; is a Bun and TypeScript standalone weekly-report worker for V1 and a multi-modal content kernel for V2 per content-zoe `PLAN.md`.
- **openclaw-market**: provides content-zoe Layer 0 triggers such as Cron, Standing Orders, RSS, Telegram, and Webchat. It is read-only reference from content-zoe and is not a cross-repo commit target under the current charter.

Adding new cross-repo targets requires charter extension.

## Memory Transfer

- openclaw-healthcare session memory captures cross-repo lessons today and remains the canonical hc-side learning store.
- content-zoe session memory will exist post-bootstrap; pre-bootstrap, content-zoe Claude operates from hc context with content-zoe docs as source of truth.
- Post-bootstrap memory bootstrap: cross-repo lessons that affect content-zoe behavior must be copied to content-zoe-side memory at first content-zoe session activation. Operator owns this transfer.

## Operational Reference

- `openclaw-healthcare:docs/runbooks/compounding-loop-workflow-repair.md` is the canonical runbook for systematic swarm/harness failures.
- Cross-repo specs must reference the target's actual base branch. content-zoe uses `main`; openclaw-healthcare uses `master`.
- Failure-mode learnings remain in hc-side memory and should be checked before drafting cross-repo intakes.

## Workflow

`SPEC -> PLAN -> ADVERSARIAL REVIEW -> PICK SMALLEST MODE -> WORKER IMPLEMENTS -> REAL-RUNTIME VALIDATION -> QUALITY GATE -> HUMAN APPROVAL -> MERGE + MEMORY`

## One-Line Summary

`openclaw-healthcare` thinks, organizes, dispatches, and validates.  
`openclaw-healthcare` workers code.  
`content-zoe` judges whether the result is the right product.
