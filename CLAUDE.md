# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A **planning & design workspace** (no code, no package manifest, no tests) for a new project that adapts the `Zoe` orchestration system from `openclaw-healthcare` to a content-creation-and-publishing workflow, using `openclaw-market` as the channel/tooling substrate.

Working language is Chinese + English technical terms. All files here are Markdown.

## Design north star

> Reuse Zoe's proven "plan → orchestrate → execute" three-stage architecture (currently used for code engineering) to drive **content creation** end-to-end, with `openclaw-market` providing the triggers (Cron, Standing Orders, RSS) and distribution channels (X, Telegram, Notion, Discord, Slack, Email, ...).

Three-layer target architecture:

- **Layer 0 — Triggers** (provided by `openclaw-market`): Cron, Standing Orders, RSS/Blogwatcher, Telegram/Webchat commands, webhooks.
- **Layer 1 — Orchestration** (new, borrowed from Zoe): Intake Decision → Content Spec → Pipeline Manager → Worker Loops (research / draft / review / publish).
- **Layer 2 — Execution** (new adapters): `researcher`, `writer`, `editor`, `publisher` Agent Adapters, routed through existing Agent Adapter interface but **skipping git worktree logic**.

## Source-of-truth documents (read these first)

Order matters — read top to bottom for the full picture:

| File | Role |
|---|---|
| `task.md` | Short, authoritative TODO list of 6 components to build. The spec for near-term work. |
| `implementation_plan.md` | Full architectural plan. Maps Zoe components → content equivalents; defines the 5 pipeline stages, proposed file layout under `src/lib/content/...`, and open questions still owed to the user. |
| `content_creation_assessment.md` | Capability matrix of what `openclaw-market` already provides (research tools, generators, channels, automation primitives) and what's missing. Use when deciding whether to build vs. wire existing. |
| `content_lessons_from_openclaw.md` | Seven content-craft patterns lifted from `openclaw-market`'s own docs (semantic frontmatter, SOUL.md persona separation, AI-driven i18n pipeline, etc.). Style/brand input for the Writer/Editor agents. |
| `harness_overlay_assessment.md` | Evaluates `harness-overlay` for ideas. Conclusion: borrow only the **quality-gate protocol** (Content Brief Contract, Evidence Grades A–D, Experiment Ledger, structured review artifacts), not the runtime. |

## Reference repositories (read-only dependencies)

These paths are referenced throughout the planning docs as blueprints — do not modify them from this repo, but read them when implementing:

- `/Users/youjia/dev/openclaw-healthcare` — Zoe runtime. Key files to mirror:
  - `src/lib/intake/decision.ts` — routing decision logic (extend, don't rewrite)
  - `src/lib/specs/decompose.ts` — AI-driven task decomposition (`buildPrompt` pattern is the template)
  - `src/lib/specs/confirm-spec.ts` — spec locking + task materialization
  - `src/lib/task-groups/pipeline.ts` — stage management + stage output I/O
  - `src/lib/task-groups/fanout.ts`, `debate.ts` — multi-agent collaboration modes
  - `UNIFIED_PIPELINE_SPEC.md`, `CLAUDE.md` — architecture references
- `/Users/youjia/dev/openclaw-market` — triggers + channels + style exemplars:
  - `docs/concepts/soul.md` — brand-voice-as-code (feed into writer adapter)
  - `docs/automation/standing-orders.md` — persistent agent authority
  - `docs/.i18n/` — AI-driven multi-locale pipeline (reference for future i18n)

## Planned work — the 6 components in `task.md`

All six components will live in (or extend files in) a future code repository; this planning repo is the spec. Before starting implementation, confirm *where* the code will land — most likely by extending `openclaw-healthcare` rather than creating a standalone repo, because all the reused primitives live there.

1. **Content Intake Router** — extend `decision.ts` with `contentMode` + `DEEP_CONTENT_HINTS` regexes.
2. **Content Pipeline Stages** — add `CONTENT_PIPELINE_STAGES` (research → outline → draft → edit_review → publish) to `pipeline.ts`; new `src/lib/content/content-pipeline.ts`.
3. **Content Adapters** — `researcher`, `writer`, `editor`, `publisher` under `src/lib/content/adapters/`. These implement the existing `AgentAdapter` interface but **bypass git worktree/merge** because artifacts are Markdown, not diffs.
4. **Content Worker Loop** — `src/lib/content/content-reconcile-loop.ts`, registered in `runner-worker.ts`.
5. **Publisher Integration** — `markdown-publisher.ts` first (lowest risk, writes to git); placeholders for X / Telegram / Notion that will later call `openclaw-market` channels via Gateway.
6. **Schema & API** — add `taskKind = "content"` to the Zoe schema and expose it in API routes and the dashboard.

## Unresolved decisions (blockers for implementation)

`implementation_plan.md` flags these as **User Review Required** — do not assume answers:

- **Publisher priority order** — which channels first (X thread / Telegram / Notion / WeChat / personal blog)?
- **Human-in-the-loop mode** — fully automated post-publish, or mandatory `awaiting_review` gate per piece?
- **Storage** — coexist with code tasks under a shared SQLite schema (`taskKind = "content"`) or a separate content DB?
- **Gateway availability** — is an OpenClaw Gateway instance already running that the publisher can dial into?
- **Content language(s)** — Chinese primary? English? Multi-locale via the openclaw-market i18n pattern?

## Quality protocol (borrowed from harness-overlay)

When implementing the Editor/Review stages, use these four patterns from `harness_overlay_assessment.md` — they're the only parts of harness-overlay worth lifting:

1. **Content Brief Contract** — a binary-verifiable criteria list per piece (source diversity, no hallucination, brand-voice match, word count, structure, SEO).
2. **Evidence Grades A–D** — Grade C (AI self-check) alone cannot authorize publish; Grade B (human review) can; Grade A = post-publish engagement data.
3. **Experiment Ledger** — for Debate-mode A/B of writer variants, log `keep/discard/crash` + comparison fields to a JSONL ledger.
4. **Structured Review Report** — Editor Agent emits a per-criterion PASS/FAIL table with evidence, not a free-form verdict.

## Conventions that apply here

- **No build commands exist.** Do not invent `bun run`, `npm test`, etc. — there is no `package.json`. If asked to "run" something, the only correct action is editing these Markdown files.
- **Markdown admonition style** — the existing docs use GitHub `> [!NOTE]`, `> [!IMPORTANT]`, `> [!TIP]`, `> [!WARNING]` blocks. Match this style when editing.
- **File references use `file:///` absolute URLs** when pointing into the sibling repos (see the reference tables at the bottom of each doc). Preserve that format.
- **Architectural tables are the primary artifact** — most documents use side-by-side tables (Zoe component ↔ content equivalent) as the core explanatory device. Favor this format over prose when adding new mappings.

## `.omc/` directory

Contains `oh-my-claudecode` state (`.omc/state/`). Not part of the project design — ignore unless explicitly debugging OMC itself.
