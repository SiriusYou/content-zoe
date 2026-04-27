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

### Pre-Bootstrap

Current state: content-zoe is a planning workspace and has no `package.json`. The authoritative state marker is this file.

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
- Always: only declared-file-scope changes, never harness artifacts.
- Never edit `~/dev/content-zoe/AGENTS.md`; it is a thin pointer per `f2f8a6b`.
- Never edit `~/dev/content-zoe/ROLE_POSITIONING.md` through worker execution.
- Never edit `~/dev/content-zoe/CLAUDE.md` through worker execution.

## Slice Approval Evidence Requirement

Every `[x] (cz-Claude approved YYYY-MM-DD) Slice N: ...` line committed to PLAN.md or TODOS.md MUST have a matching `.omx/artifacts/claude-slice-N-review-YYYY-MM-DD.md` artifact, authored in a cz-Claude session, recording the substance of the review (scope verification, intent alignment, findings, verdict). The PLAN.md/TODOS.md label is the *index*; the artifact is the *substance*.

**Verdict vocabulary** — the artifact's final verdict line MUST use one of:

- `VERDICT: APPROVE` — slice scope sound, no findings requiring amendment
- `VERDICT: APPROVE-WITH-AMENDMENTS-PENDING` — findings raised, slice not yet ready for hc-worker action
- `VERDICT: APPROVE-WITH-AMENDMENTS-MET` — findings were raised AND the amendments are now applied; slice is ready
- `VERDICT: HOLD` — review incomplete or further investigation required
- `VERDICT: REJECT` — slice scope or intent fundamentally misaligned

**Approval gate** — a slice is "approved" for hc-worker action ONLY if the matching artifact's final verdict is `APPROVE` or `APPROVE-WITH-AMENDMENTS-MET`. A PLAN.md/TODOS.md label without a matching artifact, or with an artifact whose verdict is `APPROVE-WITH-AMENDMENTS-PENDING`, `HOLD`, or `REJECT`, is NOT a valid approval. hc-workers must not act on it.

**Re-review on amendment** — if a slice is amended after initial review (e.g. operator or hc-codex addresses findings), the new review artifact uses an incremented suffix: `claude-slice-N-review-YYYY-MM-DD-r2.md`, `-r3.md`, etc. The `YYYY-MM-DD` in the filename is the **original review date** (not the re-review date); the suffix tracks the review iteration. Original artifacts are preserved in the working tree for audit; the **latest-suffix artifact's verdict is the operative one**.

**PLAN.md/TODOS.md label stability on re-review** — when a slice is amended and re-reviewed, the original `[x] (cz-Claude approved YYYY-MM-DD) Slice N: ...` label STAYS UNCHANGED. The label is the index pointing at the slice approval cycle; the operative status comes from the latest-suffix artifact's verdict, not from label toggling. This avoids cascading PLAN.md commits and worker-races between label and artifact state.

**cz-Codex involvement** — cz-Claude review alone is sufficient at the slice-approval gate. cz-Codex adversarial review is mandatory at implementation/merge gates (per Cross-repo authority model § Gate 2), not at slice-approval.

**Cross-repo intake snapshot** — because `.omx/` is gitignored and hc-workers operate from a checked-out target worktree at `<task-root>/target/` (not the operator's original working tree), each cross-repo intake referencing a slice approval MUST include the following fields in the intake body:

- `slice_artifact_path`: path to the cz-Claude review artifact. MUST match the pattern `.omx/artifacts/claude-slice-N-review-YYYY-MM-DD(-rN)?.md`. **For re-reviewed slices, the path MUST point to the latest-suffix artifact** (e.g. `-r3.md` if r3 is the latest). An intake referencing an older-suffix artifact for an amended slice is invalid, even if that older artifact has an approving verdict.
- `slice_artifact_verdict`: the verbatim final verdict line (e.g. `VERDICT: APPROVE`)
- `slice_artifact_sha256`: the artifact file's SHA-256 at intake-submission time

If any of these fields is absent, the verdict is not in the approve set, the recorded SHA is missing from the submitted intake's approval snapshot, the path doesn't match the required pattern, or the path doesn't reference the latest-suffix artifact for the slice, the intake is invalid and the slice is not approved. Invalid intakes route through the **Gate 1 rejection flow** defined in the Cross-repo authority model — the worker is not started, the operator is notified of the specific invalidation reason, and the operator must resubmit with corrected snapshot fields.

The snapshot is an operator attestation captured at submission time; workers validate the intake fields, while reviewers can audit the hash against the operator's original cz checkout when needed. This snapshot is what makes the slice-approval gate auditable downstream of the operator's submission, since workers cannot see `.omx/` artifacts directly.

Slice approval artifacts remain gitignored (per cz `.gitignore` for `.omx/`) — they live alongside the repo state for permanence within the working tree. Long-term archival of artifacts is operator policy and out of charter scope.

## Multi-Repo Composition

The full hc-driven content system involves three repos:

- **openclaw-healthcare**: engineering engine, source of hc-workers, host of SDD lane and harness/swarm.
- **content-zoe**: target of hc-worker commits; will become a Bun and TypeScript standalone weekly-report worker per content-zoe `PLAN.md`.
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
