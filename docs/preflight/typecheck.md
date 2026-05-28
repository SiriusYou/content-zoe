# Typecheck Gate Evidence

**Slice:** V2 Slice 0.5a: src typecheck gate; V2 Slice 0.5b: scripts typecheck gate
**Authority:** `PLAN.md` approved-slice labels and approved drafts `slice-v2-0.5a-typecheck-gate-src-v1.1.md` / `slice-v2-0.5b-typecheck-gate-scripts-v1.3.md`
**Generated:** 2026-05-28T14:29:48Z
**Updated:** 2026-05-28 for V2 Slice 0.5b

## Slice 0.5b Scripts Gate

- Slice: V2 Slice 0.5b: scripts typecheck gate.
- Authority: `PLAN.md` approved-slice label and approved draft `slice-v2-0.5b-typecheck-gate-scripts-v1.3.md`.
- Draft SHA-256: `ee34cf8082901b6152efc60389627e1996dd504924cdf54f359c74565c509866`.
- Review artifacts:
  - cz-Claude r3: `claude-slice-v2-0.5b-review-2026-05-28-r3.md`, verdict `APPROVE-WITH-AMENDMENTS-MET`, SHA-256 `b93b0ca6e78b18f5ffa138b48a946b37c4b15fe926cdb7384e8238c70a90b07f`.
  - cz-Codex r2: `codex-slice-v2-0.5b-review-2026-05-28-r2.md`, verdict `APPROVE`, SHA-256 `1df3801fbe9e921791daa52ceaa81863da59ab88abd40cc81fc484a01eb91cff`.

### Gate Configuration Delta

- `tsconfig.json` now includes `scripts/**/*.ts` in addition to `src/**/*.ts`.
- No compiler-option changes were made from Slice 0.5a.
- `src/**` stayed unchanged for this slice.
- `src/preflight.ts` stayed untouched; the typecheck gate remains wired at the package script layer.

### Scripts Baseline And Dispositions

Measured pre-fix `scripts/**` baseline under the pinned Slice 0.5a toolchain:

| Class | Count | Site | Disposition |
|---|---:|---|---|
| `TS2322` | 48 | `scripts/bot-smoke.ts` command reply stubs | Added `captureReply(replies)`, a block-bodied helper that pushes text and returns `void`. Runtime behavior is unchanged because the previous `push()` return value was unused. |
| `TS2741` | 6 | `scripts/bot-smoke.ts` `fetchImpl` stubs | Added `testFetch(handler)`, which returns a typed `typeof fetch` test double and supplies Bun's `preconnect` property. Request/response behavior is unchanged. |
| `TS2367` | 1 | `scripts/bot-smoke.ts` long-poll overlap guard | Preserved the assertion by assigning `requests.length` to a widened `number` before comparing to `2`; the runtime condition and error text remain unchanged. |
| `TS2322` | 4 | `scripts/db-smoke.ts` recovery cleanup payload | Typed the fixture as `RecoveryCleanup` instead of freezing it with `as const`, matching the production payload shape without changing the tested values. |

### Slice 0.5b Verification

- `bun run typecheck`: PASS over `src/**/*.ts` and `scripts/**/*.ts`.
- `bun run db:smoke`: PASS, `11/11`.
- `bun run bot-smoke`: expected inherited static-boundary result, `68/69 PASS`; the sole failing row is `boundary-static-check`. All behavioral and dependency rows pass, including `command-long-poll-malformed-onerror`, `command-long-poll-overlap-guard`, and `dependency-boundary-check`.
- The `boundary-static-check` row is still the pre-existing slice-anchor mismatch and was not retasked by Slice 0.5b.

### Slice 0.5b Anti-Gaming Evidence

- No net-new `@ts-nocheck`, broad `@ts-ignore`, or `any`.
- No `@ts-expect-error` was needed.
- No runtime or production source edits were used to make the scripts gate green.

## Scope Repair

- Operator authority repair commit: `888ed99` (`[content-zoe] repair V2 Slice 0.5a typecheck scope`)
- Measured repair recorded on `content-zoe/main`: the actual `TS1484` files are `src/llm/codex-cli.ts` and `src/llm/fake.ts`.
- Approved repair boundary: those two files are limited to `import type` changes only; `LLMProviderError` remains a runtime import.

## Gate Configuration

- `package.json` exposes `typecheck` as `tsc --noEmit`.
- `tsconfig.json` is scoped to `src/**/*.ts` only for Slice 0.5a, with `"noEmit": true`, `"strict": true`, `"moduleResolution": "bundler"`, `"module": "esnext"`, `"target": "esnext"`, `"types": ["bun"]`, `"skipLibCheck": true`, `"verbatimModuleSyntax": true`, and `"allowImportingTsExtensions": true`.
- Exact reproducibility pins:
  - `typescript`: `5.9.3`
  - `@types/bun`: `1.3.14`
- Both pins are exact in `package.json` and committed in `bun.lock`; no caret ranges remain.
- `scripts/**` stays deferred to Slice 0.5b, and `src/preflight.ts` remains untouched per the approved boundary.

## Existing Smoke Coverage

- Slice 0.5a did not edit `scripts/**`; the existing smoke evidence remains the runtime authority for this gate note.
- `bun run run-stage-smoke`: PASS.
- `bun run draft-en-stage-smoke`: PASS.
- `bun run research-stage-smoke`: PASS.
- `bun run preflight`: PASS.
- `bun run report-create-smoke`: runtime rows PASS, but `report-create-boundary-static-check` FAILS because the inherited Slice 4.27 active-scope guard rejects the Slice 0.5a changed set (`bun.lock`, `package.json`, `tsconfig.json`, `src/lib/report-loop.ts`, `src/llm/*`, `docs/preflight/typecheck.md`). Classify this as an expected inherited boundary-row mismatch, not a runtime regression.
- `LLM_PROVIDER=fake bun run report-run-smoke`: runtime rows PASS through `report-run-source-carry-forward`, but `report-run-boundary-static-check` FAILS because it is hardcoded to the Slice 4.29 anchor/scope and rejects this infra-slice changed set. Classify this as an expected inherited boundary-row mismatch, not a runtime regression.
- `scripts/**` were not edited because they are explicitly OUT for Slice 0.5a.

## TS 5.9.3 Baseline

- Command: `bun run typecheck`
- Result before repair: FAIL
- Measured `src/**` baseline under `typescript@5.9.3`: 14 errors total
  - `7x TS2345` in `src/bin/report-create.ts`
  - `1x TS2367` in `src/lib/report-loop.ts:101`
  - `6x TS1484` in `src/llm/codex-cli.ts` and `src/llm/fake.ts`
- The baseline below matches the approved Slice 0.5a contract and was revalidated against an isolated pre-fix snapshot using the pinned `tsconfig.json` and lockfile.

| # | Diagnostic | Site | Baseline cause | Disposition |
|---|---|---|---|---|
| 1 | `TS2345` | `src/bin/report-create.ts:95:51` | Template-string message `` `UNKNOWN_FLAG: ${arg}` `` was not assignable to the constructor's inferred literal-union `message` parameter. | Type-only, behavior-preserving fix: annotate `ReportCreateError` as `constructor(code, message: string = code)`. |
| 2 | `TS2345` | `src/bin/report-create.ts:108:52` | String message `"INVALID_PURPOSE: --purpose required"` was not assignable to the constructor's inferred literal-union `message` parameter. | Same fix as #1; no call-site or runtime behavior change. |
| 3 | `TS2345` | `src/bin/report-create.ts:197:50` | Template-string message `` `INVALID_LOCALES: ${value}` `` was not assignable to the constructor's inferred literal-union `message` parameter. | Same fix as #1; preserves runtime error text. |
| 4 | `TS2345` | `src/bin/report-create.ts:202:50` | Template-string message `` `INVALID_PURPOSE: ${value}` `` was not assignable to the constructor's inferred literal-union `message` parameter. | Same fix as #1; preserves runtime error text. |
| 5 | `TS2345` | `src/bin/report-create.ts:207:49` | Template-string message `` `INVALID_WEEK: ${weekKey}` `` was not assignable to the constructor's inferred literal-union `message` parameter. | Same fix as #1; preserves runtime error text. |
| 6 | `TS2345` | `src/bin/report-create.ts:219:7` | Template-string message `` `WEEK_ALREADY_EXISTS: ${weekKey} existing_job_id=${existing.id} existing_status=${existing.status}` `` was not assignable to the constructor's inferred literal-union `message` parameter. | Same fix as #1; preserves runtime error text. |
| 7 | `TS2345` | `src/bin/report-create.ts:222:55` | Template-string message `` `WEEK_ALREADY_EXISTS: ${weekKey}` `` was not assignable to the constructor's inferred literal-union `message` parameter. | Same fix as #1; preserves runtime error text. |
| 8 | `TS2367` | `src/lib/report-loop.ts:101:10` | Loop-head comparison treated `current` as `Stage \| TerminalStage`, but the live path had no overlap with `"awaiting_approval"` at that point. | Type-only, behavior-preserving fix: narrow `current` to `Stage`, drop the dead `TerminalStage` import, and use the existing post-`nextStage()` `following === "awaiting_approval"` branch as the terminal return. |
| 9 | `TS1484` | `src/llm/codex-cli.ts:13:3` | `LLMProvider` was imported as a value under `"verbatimModuleSyntax": true`. | Move `LLMProvider` into `import type { ... }` and keep runtime behavior unchanged. |
| 10 | `TS1484` | `src/llm/codex-cli.ts:15:3` | `QuiescenceProof` was imported as a value under `"verbatimModuleSyntax": true`. | Move `QuiescenceProof` into `import type { ... }`; no runtime change. |
| 11 | `TS1484` | `src/llm/codex-cli.ts:16:3` | `Snapshot` was imported as a value under `"verbatimModuleSyntax": true`. | Move `Snapshot` into `import type { ... }`; no runtime change. |
| 12 | `TS1484` | `src/llm/codex-cli.ts:17:3` | `SnapshotEntry` was imported as a value under `"verbatimModuleSyntax": true`. | Move `SnapshotEntry` into `import type { ... }`; no runtime change. |
| 13 | `TS1484` | `src/llm/codex-cli.ts:18:3` | `TimeoutLifecycle` was imported as a value under `"verbatimModuleSyntax": true`. | Move `TimeoutLifecycle` into `import type { ... }`; no runtime change. |
| 14 | `TS1484` | `src/llm/fake.ts:1:10` | `LLMProvider` was imported as a value under `"verbatimModuleSyntax": true`. | Split the import into `import { LLMProviderError }` plus `import type { LLMProvider }`; runtime import behavior stays intact. |

## `report-loop.ts:101` Classification And Handoff

- Classification: type-only / behavior-preserving. `nextStage(current, opts.locales)` already determines the terminal transition; `current` does not need a `TerminalStage` value at the top of the loop.
- Landed repair: `current` is now typed as `Stage`, the dead `TerminalStage` import is removed, and the existing `following === "awaiting_approval"` branch remains the only terminal exit path.
- Slice 1 handoff: preserve this narrower `report-loop.ts` typing when reconciling `StageDef.stage`; Slice 1 should not re-widen the loop-head variable to `string` or `TerminalStage`.

## Anti-Gaming Evidence

- Diff-scan command over the implementation range:
  - `git diff --unified=0 HEAD^ HEAD -- src package.json tsconfig.json | rg -n '@ts-(nocheck|ignore|expect-error)|\\bany\\b'`
- Result: no matches.
- Net-new suppressions introduced by Slice 0.5a: none.
- `report-loop.ts:101` was fixed directly; no `@ts-expect-error` was needed.
- `LLMProviderError` remains a runtime import in `src/llm/codex-cli.ts` and `src/llm/fake.ts`; only type-position imports were converted to `import type`.

## Final Verification

- Command: `bun run typecheck`
- Result after repair: PASS
- No provider/runtime behavior changed; the slice remains limited to exact toolchain pins, `src/**` type-only repairs, and this evidence note.
