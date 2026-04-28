import {
  mkdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FakeProvider } from "../src/llm/fake.ts";
import {
  LLMProviderError,
  type QuiescenceProof,
} from "../src/llm/provider.ts";
import { runStage } from "../src/pipeline/run-stage.ts";
import { nextStage } from "../src/pipeline/stages.ts";
import {
  Stage,
  type ManifestRule,
  type StageDef,
} from "../src/pipeline/types.ts";

type ScenarioName =
  | "success"
  | "manifest-invalid"
  | "provider-error"
  | "timeout"
  | "transition-coverage"
  | "manifest-path-outside-rundir"
  | "manifest-symlink-escape"
  | "manifest-glob-escape"
  | "manifest-glob-mixed-safe-and-escape"
  | "manifest-glob-min-count-zero"
  | "manifest-glob-broken-symlink";

interface ScenarioOutcome {
  name: ScenarioName;
  status: "PASS" | "FAIL";
  details: string[];
  startedAtIso: string;
  finishedAtIso: string;
}

const SCENARIOS: ScenarioName[] = [
  "success",
  "manifest-invalid",
  "provider-error",
  "timeout",
  "transition-coverage",
  "manifest-path-outside-rundir",
  "manifest-symlink-escape",
  "manifest-glob-escape",
  "manifest-glob-mixed-safe-and-escape",
  "manifest-glob-min-count-zero",
  "manifest-glob-broken-symlink",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isoStamp = new Date().toISOString().replaceAll(":", "-");
const smokeRoot = resolve(repoRoot, ".runs", "run-stage-smoke", isoStamp);
const docPath = resolve(repoRoot, "docs", "preflight", "run-stage-smoke.md");

class CountingFakeProvider extends FakeProvider {
  calls = 0;

  override async runPrompt(
    prompt: string,
    cwd: string,
    timeoutMs: number,
  ): Promise<string> {
    this.calls++;
    return super.runPrompt(prompt, cwd, timeoutMs);
  }
}

class DelayedFakeProvider extends FakeProvider {
  constructor(
    responses: Map<string, string>,
    private readonly delayMs: number,
  ) {
    super(responses);
  }

  override async runPrompt(
    prompt: string,
    cwd: string,
    timeoutMs: number,
  ): Promise<string> {
    if (this.delayMs > timeoutMs) {
      await sleep(timeoutMs + 1);
      throw new LLMProviderError({
        kind: "timeout",
        message: `fake provider timed out after ${timeoutMs}ms`,
        lifecycle: "soft-only",
        transcriptDir: cwd,
        quiescence: syntheticQuiescence(),
      });
    }

    await sleep(this.delayMs);
    return super.runPrompt(prompt, cwd, timeoutMs);
  }
}

class ThrowingFakeProvider extends FakeProvider {
  override async runPrompt(): Promise<string> {
    throw "synthetic non-provider throw";
  }
}

function stageDef(
  prompt: string,
  rules: ManifestRule[],
  timeoutMs = 1_000,
): StageDef {
  return {
    stage: Stage.RESEARCH,
    prompt,
    timeoutMs,
    manifest: { rules },
  };
}

async function runSuccess(base: string): Promise<string[]> {
  const runDir = makeRunDir(base);
  writeFileSync(resolve(runDir, "ready.md"), "ready\n");
  const result = await runStage(
    stageDef("success prompt", [{ kind: "file_non_empty", path: "ready.md" }]),
    new FakeProvider(new Map([["success prompt", "canned response"]])),
    { runDir },
  );

  assert(result.status === "ok", `expected ok, got ${result.status}`);
  assert(result.output === "canned response", "expected canned provider output");
  assert(!("transcriptPath" in result), "success result must not expose transcriptPath");
  assert(statSync(result.runDir).isDirectory(), "result runDir should be canonical directory");
  return [
    "Pre-staged non-empty file satisfied the manifest.",
    "FakeProvider returned canned text and no transcriptPath was present on success.",
  ];
}

async function runManifestInvalid(base: string): Promise<string[]> {
  const runDir = makeRunDir(base);
  writeFileSync(resolve(runDir, "empty.md"), "");
  const result = await runStage(
    stageDef("manifest invalid prompt", [
      { kind: "file_non_empty", path: "empty.md" },
    ]),
    new FakeProvider(new Map([["manifest invalid prompt", "ok"]])),
    { runDir },
  );

  assert(result.status === "manifest_invalid", `expected manifest_invalid, got ${result.status}`);
  assert(
    result.error.errorCode === "MANIFEST_FILE_EMPTY",
    `expected MANIFEST_FILE_EMPTY, got ${result.error.errorCode}`,
  );
  return [
    "Pre-staged empty file failed a file_non_empty rule.",
    "The first manifest error was MANIFEST_FILE_EMPTY.",
  ];
}

async function runProviderError(base: string): Promise<string[]> {
  const runDir = makeRunDir(base);
  const result = await runStage(
    stageDef("missing canned prompt", []),
    new FakeProvider(new Map()),
    { runDir },
  );

  assert(result.status === "error", `expected error, got ${result.status}`);
  assert(result.error.kind === "parse", `expected parse, got ${result.error.kind}`);

  const normalized = await runStage(
    stageDef("throw prompt", []),
    new ThrowingFakeProvider(new Map()),
    { runDir },
  );
  assert(normalized.status === "error", `expected normalized error, got ${normalized.status}`);
  assert(
    normalized.error.kind === "spawn" &&
      normalized.error.message.startsWith("runStage internal:"),
    "expected non-provider throw to normalize as internal spawn error",
  );

  return [
    "Missing canned response surfaced FakeProvider's LLMProviderError(kind=parse).",
    "A non-LLMProviderError throw normalized to LLMProviderError(kind=spawn) with runStage internal prefix.",
  ];
}

async function runTimeout(base: string): Promise<string[]> {
  const runDir = makeRunDir(base);
  const result = await runStage(
    stageDef("slow prompt", [], 5),
    new DelayedFakeProvider(new Map([["slow prompt", "late"]]), 20),
    { runDir },
  );

  assert(result.status === "error", `expected error, got ${result.status}`);
  assert(result.error.kind === "timeout", `expected timeout, got ${result.error.kind}`);
  return [
    "DelayedFakeProvider used constructor-injected delay greater than the stage timeout.",
    "runStage returned the provider's LLMProviderError(kind=timeout).",
  ];
}

async function runTransitionCoverage(_base: string): Promise<string[]> {
  assert(nextStage(Stage.RESEARCH, ["en", "zh"]) === Stage.DRAFT_EN, "research should advance to draft_en");
  assert(nextStage(Stage.DRAFT_EN, ["en", "zh"]) === Stage.EDIT_EN, "draft_en should advance to edit_en");
  assert(nextStage(Stage.EDIT_EN, ["en", "zh"]) === Stage.TRANSLATE_ZH, "edit_en should advance to translate_zh when zh is present");
  assert(nextStage(Stage.TRANSLATE_ZH, ["en", "zh"]) === "awaiting_approval", "translate_zh should advance to awaiting_approval");
  assert(nextStage(Stage.EDIT_EN, ["en"]) === "awaiting_approval", "locales=['en'] should skip translate_zh");

  let invalidStageFailed = false;
  try {
    nextStage("publish", ["en"]);
  } catch {
    invalidStageFailed = true;
  }
  assert(invalidStageFailed, "invalid current stage should throw");

  return [
    "Covered research -> draft_en -> edit_en -> translate_zh -> awaiting_approval.",
    "Covered locales=['en'] translation skip and invalid-current-stage error.",
  ];
}

async function runManifestPathOutsideRunDir(base: string): Promise<string[]> {
  const runDir = makeRunDir(base);
  const outside = resolve(base, "outside.md");
  writeFileSync(outside, "outside\n");

  const dotDotResult = await runStage(
    stageDef("dotdot prompt", [{ kind: "file_exists", path: "../outside.md" }]),
    new FakeProvider(new Map([["dotdot prompt", "ok"]])),
    { runDir },
  );
  assertManifestCode(dotDotResult, "MANIFEST_PATH_OUTSIDE_RUNDIR");

  const absoluteResult = await runStage(
    stageDef("absolute prompt", [{ kind: "file_exists", path: outside }]),
    new FakeProvider(new Map([["absolute prompt", "ok"]])),
    { runDir },
  );
  assertManifestCode(absoluteResult, "MANIFEST_PATH_OUTSIDE_RUNDIR");

  const missingProvider = new CountingFakeProvider(new Map([["missing", "ok"]]));
  const missingResult = await runStage(stageDef("missing", []), missingProvider, {
    runDir: resolve(base, "missing-run-dir"),
  });
  assertInternalInvalidRunDir(missingResult);
  assert(missingProvider.calls === 0, "missing runDir should fail before provider call");

  const fileRunDir = resolve(base, "run-dir-as-file");
  writeFileSync(fileRunDir, "not a directory\n");
  const fileProvider = new CountingFakeProvider(new Map([["file", "ok"]]));
  const fileResult = await runStage(stageDef("file", []), fileProvider, {
    runDir: fileRunDir,
  });
  assertInternalInvalidRunDir(fileResult);
  assert(fileProvider.calls === 0, "file runDir should fail before provider call");

  const cwd = resolve(base, "cwd");
  const escaped = resolve(base, "escaped-target");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(escaped, { recursive: true });
  const symlinkRunDir = resolve(cwd, "run");
  symlinkSync(escaped, symlinkRunDir, "dir");
  const symlinkProvider = new CountingFakeProvider(new Map([["symlink", "ok"]]));
  const symlinkResult = await runStage(stageDef("symlink", []), symlinkProvider, {
    runDir: symlinkRunDir,
    cwd,
  });
  assertInternalInvalidRunDir(symlinkResult);
  assert(symlinkProvider.calls === 0, "escaping runDir symlink should fail before provider call");

  return [
    "Path rules rejected both ../outside.md and an absolute outside path.",
    "Missing runDir, runDir-as-file, and runDir symlink escaping cwd all failed pre-provider.",
  ];
}

async function runManifestSymlinkEscape(base: string): Promise<string[]> {
  const runDir = makeRunDir(base);
  symlinkSync("/etc/passwd", resolve(runDir, "sneaky.md"));
  const result = await runStage(
    stageDef("symlink escape prompt", [
      { kind: "file_exists", path: "sneaky.md" },
    ]),
    new FakeProvider(new Map([["symlink escape prompt", "ok"]])),
    { runDir },
  );

  assertManifestCode(result, "MANIFEST_PATH_OUTSIDE_RUNDIR");
  return [
    "Path rule realpath checked runDir/sneaky.md.",
    "Symlink target outside runDir produced MANIFEST_PATH_OUTSIDE_RUNDIR.",
  ];
}

async function runManifestGlobEscape(base: string): Promise<string[]> {
  const runDir = makeRunDir(base);

  const absoluteResult = await runStage(
    stageDef("absolute glob prompt", [
      { kind: "files_match_glob", glob: "/tmp/*.md" },
    ]),
    new FakeProvider(new Map([["absolute glob prompt", "ok"]])),
    { runDir },
  );
  assertManifestCode(absoluteResult, "MANIFEST_PATH_OUTSIDE_RUNDIR");

  const dotDotResult = await runStage(
    stageDef("dotdot glob prompt", [
      { kind: "files_match_glob", glob: "../*.md" },
    ]),
    new FakeProvider(new Map([["dotdot glob prompt", "ok"]])),
    { runDir },
  );
  assertManifestCode(dotDotResult, "MANIFEST_PATH_OUTSIDE_RUNDIR");

  symlinkSync("/etc/passwd", resolve(runDir, "leak.md"));
  const symlinkResult = await runStage(
    stageDef("glob symlink prompt", [
      { kind: "files_match_glob", glob: "*.md" },
    ]),
    new FakeProvider(new Map([["glob symlink prompt", "ok"]])),
    { runDir },
  );
  assertManifestCode(symlinkResult, "MANIFEST_PATH_OUTSIDE_RUNDIR");

  return [
    "Glob rules rejected absolute and parent-segment patterns before matching.",
    "A glob match whose symlink target escaped runDir produced MANIFEST_PATH_OUTSIDE_RUNDIR.",
  ];
}

async function runManifestGlobMixedSafeAndEscape(base: string): Promise<string[]> {
  const runDir = makeRunDir(base);
  writeFileSync(resolve(runDir, "a-safe.md"), "safe\n");
  writeFileSync(resolve(runDir, "b-safe.md"), "safe\n");
  symlinkSync("/etc/passwd", resolve(runDir, "z-escape.md"));

  const result = await runStage(
    stageDef("glob mixed prompt", [
      { kind: "files_match_glob", glob: "*.md", minCount: 2 },
    ]),
    new FakeProvider(new Map([["glob mixed prompt", "ok"]])),
    { runDir },
  );

  assertManifestCode(result, "MANIFEST_PATH_OUTSIDE_RUNDIR");
  return [
    "Glob had two safe matches plus one symlink escape.",
    "Boundary validation examined all matches before count success and rejected the escape.",
  ];
}

async function runManifestGlobMinCountZero(base: string): Promise<string[]> {
  const runDir = makeRunDir(base);
  const result = await runStage(
    stageDef("glob min zero prompt", [
      { kind: "files_match_glob", glob: "*.missing", minCount: 0 },
    ]),
    new FakeProvider(new Map([["glob min zero prompt", "ok"]])),
    { runDir },
  );

  assert(result.status === "ok", `expected ok, got ${result.status}`);
  return [
    "Explicit minCount=0 with zero matches succeeded.",
    "Default minCount remains 1 when minCount is omitted.",
  ];
}

async function runManifestGlobBrokenSymlink(base: string): Promise<string[]> {
  const runDir = makeRunDir(base);
  symlinkSync(resolve(runDir, "missing-target.md"), resolve(runDir, "broken.md"));
  const result = await runStage(
    stageDef("glob broken symlink prompt", [
      { kind: "files_match_glob", glob: "*.md" },
    ]),
    new FakeProvider(new Map([["glob broken symlink prompt", "ok"]])),
    { runDir },
  );

  assertManifestCode(result, "MANIFEST_FILE_MISSING");
  return [
    "Glob matched a broken symlink whose target did not exist.",
    "ENOENT from realpath resolution was classified as MANIFEST_FILE_MISSING.",
  ];
}

async function runScenario(name: ScenarioName): Promise<ScenarioOutcome> {
  const startedAtIso = new Date().toISOString();
  const scenarioRoot = resolve(smokeRoot, name);
  mkdirSync(scenarioRoot, { recursive: true });

  try {
    const details = await scenarioRunner(name)(scenarioRoot);
    return {
      name,
      status: "PASS",
      details,
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
    };
  } catch (err) {
    return {
      name,
      status: "FAIL",
      details: [formatError(err)],
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
    };
  }
}

function scenarioRunner(
  name: ScenarioName,
): (base: string) => Promise<string[]> {
  switch (name) {
    case "success":
      return runSuccess;
    case "manifest-invalid":
      return runManifestInvalid;
    case "provider-error":
      return runProviderError;
    case "timeout":
      return runTimeout;
    case "transition-coverage":
      return runTransitionCoverage;
    case "manifest-path-outside-rundir":
      return runManifestPathOutsideRunDir;
    case "manifest-symlink-escape":
      return runManifestSymlinkEscape;
    case "manifest-glob-escape":
      return runManifestGlobEscape;
    case "manifest-glob-mixed-safe-and-escape":
      return runManifestGlobMixedSafeAndEscape;
    case "manifest-glob-min-count-zero":
      return runManifestGlobMinCountZero;
    case "manifest-glob-broken-symlink":
      return runManifestGlobBrokenSymlink;
  }
}

function makeRunDir(base: string): string {
  const runDir = resolve(base, "run");
  mkdirSync(runDir, { recursive: true });
  return runDir;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertManifestCode(
  result: Awaited<ReturnType<typeof runStage>>,
  errorCode: string,
): void {
  assert(
    result.status === "manifest_invalid",
    `expected manifest_invalid, got ${result.status}`,
  );
  assert(
    result.error.errorCode === errorCode,
    `expected ${errorCode}, got ${result.error.errorCode}`,
  );
}

function assertInternalInvalidRunDir(
  result: Awaited<ReturnType<typeof runStage>>,
): void {
  assert(result.status === "error", `expected error, got ${result.status}`);
  assert(result.error.kind === "spawn", `expected spawn, got ${result.error.kind}`);
  assert(
    result.error.message.startsWith("runStage internal: invalid runDir:"),
    `unexpected message: ${result.error.message}`,
  );
}

function syntheticQuiescence(): QuiescenceProof {
  const capturedAtMs = Date.now();
  const snapshot = {
    capturedAtMs,
    capturedAtIso: new Date(capturedAtMs).toISOString(),
    files: [],
  };
  return {
    quiesceWindowMs: 0,
    before: snapshot,
    after: snapshot,
    changedFiles: [],
    newFiles: [],
    quiet: true,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function formatError(err: unknown): string {
  if (err instanceof LLMProviderError) {
    return `LLMProviderError(kind=${err.kind}): ${err.message}`;
  }
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

function renderReport(outcomes: ScenarioOutcome[]): string {
  const generatedAtIso = new Date().toISOString();
  const allPassed = outcomes.every((outcome) => outcome.status === "PASS");
  const lines = [
    "# Run Stage Smoke - Evidence Report",
    "",
    "**Slice:** cz Slice 3 (Phase 4.2) pipeline framework",
    `**Generated:** ${generatedAtIso}`,
    "**Provider scope:** FakeProvider-only; no real Codex execution performed.",
    `**Evidence ceiling:** ${allPassed ? "FakeProvider-only framework smoke approval" : "FakeProvider-only framework smoke failed"}.`,
    "",
    "## Outcome Matrix",
    "",
    "| Scenario | Status |",
    "|---|---:|",
    ...outcomes.map((outcome) => `| \`${outcome.name}\` | ${outcome.status} |`),
    "",
    "## Scenario Evidence",
    "",
  ];

  for (const outcome of outcomes) {
    lines.push(
      `### ${outcome.name}`,
      "",
      "- Command: `bun run run-stage-smoke`",
      `- Status: ${outcome.status}`,
      `- Started: ${outcome.startedAtIso}`,
      `- Finished: ${outcome.finishedAtIso}`,
      ...outcome.details.map((detail) => `- Evidence: ${detail}`),
      "",
    );
  }

  lines.push(
    "## Scope Notes",
    "",
    "- Smoke setup used per-invocation, per-scenario directories under `.runs/run-stage-smoke/<iso-stamp>/<scenario-id>/`.",
    "- The smoke runner removes its temporary invocation root in a `finally` cleanup.",
    "- Manifest policy is the contract: empty provider output is not implicitly rejected unless a manifest rule fails.",
    "- `runStage internal:` is an operational classifier prefix only; downstream code must inspect `LLMProviderError` object properties.",
  );

  return `${lines.join("\n")}\n`;
}

async function main(): Promise<number> {
  mkdirSync(smokeRoot, { recursive: true });
  let outcomes: ScenarioOutcome[] = [];
  try {
    outcomes = [];
    for (const scenario of SCENARIOS) {
      outcomes.push(await runScenario(scenario));
    }
    writeFileSync(docPath, renderReport(outcomes));
  } finally {
    rmSync(smokeRoot, { recursive: true, force: true });
  }

  for (const outcome of outcomes) {
    console.log(`${outcome.status} ${outcome.name}`);
    for (const detail of outcome.details) console.log(`  - ${detail}`);
  }

  return outcomes.every((outcome) => outcome.status === "PASS") ? 0 : 1;
}

const exitCode = await main();
if (exitCode !== 0) {
  process.exit(exitCode);
}
