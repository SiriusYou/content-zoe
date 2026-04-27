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

A cross-repo task crosses two governance domains. Both must consent before commits land on the target base branch.

### openclaw-healthcare-Side Review

- openclaw-healthcare Claude reviews process discipline, declared-scope adherence, charter alignment, and lane integrity.
- openclaw-healthcare Codex adversarially reviews engine implementation correctness.
- Operator approves engine-side completion.

### Target-Side Review

- For content-zoe, content-zoe Claude reviews against content-zoe spec and plan intent.
- For content-zoe, content-zoe Codex adversarially reviews target output.
- For future targets, charter extension is required before cross-repo execution is permitted.
- Operator approves target-side merge.

Operator approval at both gates is required for cross-repo merge. Either side rejecting routes the task back to the worker through standard SDD flow.

## content-zoe Actors: Dual State

content-zoe Claude and content-zoe Codex operate in two states based on repo maturity.

### Pre-Bootstrap

Current state: content-zoe is a planning workspace and has no `package.json`.

- content-zoe Claude is spec and plan custodian for what content-zoe will become.
- content-zoe Claude reviews planning docs (`PLAN.md`, `TODOS.md`, addenda) for coherence and design intent.
- content-zoe Codex is adversarial reviewer of plan and spec drafts, not product code.

### Post-Bootstrap

Post-bootstrap state begins when `~/dev/content-zoe/package.json` exists and `bun run report:run` produces a working artifact.

- content-zoe Claude is full product steward and reviews implementation against the `PLAN.md` contract.
- content-zoe Codex is full adversarial reviewer of content-zoe code, acceptance criteria, and content-output quality.

## Worker Scope Rules In Cross-Repo

openclaw-healthcare workers committing to content-zoe are the only currently permitted cross-repo direction.

- Pre-bootstrap content-zoe target: only Markdown, planning, docs, or scaffolding files. No code commits to content-zoe unless content-zoe Claude has approved a scaffolding plan slice.
- Post-bootstrap content-zoe target: code commits are permitted, scoped per spec.
- Always: only declared-file-scope changes, never harness artifacts.
- Never edit `~/dev/content-zoe/AGENTS.md`; it is a thin pointer per `f2f8a6b`.
- Never edit `~/dev/content-zoe/ROLE_POSITIONING.md` through worker execution.
- Never edit `~/dev/content-zoe/CLAUDE.md` through worker execution.

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
