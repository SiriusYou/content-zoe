import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LLMProviderError,
  type LLMProvider,
} from "../src/llm/provider.ts";
import { runStage } from "../src/pipeline/run-stage.ts";
import type {
  ManifestErrorCode,
  ManifestRule,
  StageDef,
  StageRunContext,
} from "../src/pipeline/types.ts";

type ScenarioName =
  | "seam-run-handler-executes-without-provider"
  | "seam-canonical-run-dir-and-timeout"
  | "seam-manifest-validates-run-output"
  | "seam-run-branch-bypasses-build-prompt"
  | "seam-manifest-throw-normalizes-to-error"
  | "seam-run-handler-throw-maps-to-error"
  | "seam-non-run-stage-without-provider-errors"
  | "seam-text-stage-unchanged"
  | "executor-seam-static-boundary-check"
  | "executor-seam-no-image-imports";

interface ScenarioOutcome {
  name: ScenarioName;
  status: "PASS" | "FAIL";
  details: string[];
  startedAtIso: string;
  finishedAtIso: string;
}

const SCENARIOS: readonly ScenarioName[] = [
  "seam-run-handler-executes-without-provider",
  "seam-canonical-run-dir-and-timeout",
  "seam-manifest-validates-run-output",
  "seam-run-branch-bypasses-build-prompt",
  "seam-manifest-throw-normalizes-to-error",
  "seam-run-handler-throw-maps-to-error",
  "seam-non-run-stage-without-provider-errors",
  "seam-text-stage-unchanged",
  "executor-seam-static-boundary-check",
  "executor-seam-no-image-imports",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = resolve(
  repoRoot,
  ".runs",
  "executor-seam-smoke",
  new Date().toISOString().replaceAll(":", "-"),
);
const docPath = resolve(repoRoot, "docs", "preflight", "executor-seam-smoke.md");

class RecordingProvider implements LLMProvider {
  readonly name = "recording";
  readonly calls: Array<{ prompt: string; cwd: string; timeoutMs: number }> = [];

  constructor(private readonly responses: Map<string, string>) {}

  async runPrompt(
    prompt: string,
    cwd: string,
    timeoutMs: number,
  ): Promise<string> {
    this.calls.push({ prompt, cwd, timeoutMs });
    const response = this.responses.get(prompt);
    if (response === undefined) {
      throw new LLMProviderError({
        kind: "parse",
        message: `recording provider has no response for prompt: ${prompt}`,
      });
    }
    return response;
  }
}

async function main(): Promise<number> {
  mkdirSync(smokeRoot, { recursive: true });
  const outcomes: ScenarioOutcome[] = [];

  try {
    for (const name of SCENARIOS) {
      outcomes.push(await runScenario(name));
    }
  } finally {
    writeEvidence(outcomes);
    rmSync(smokeRoot, { recursive: true, force: true });
    removeEmptyDir(resolve(repoRoot, ".runs", "executor-seam-smoke"));
    removeEmptyDir(resolve(repoRoot, ".runs"));
  }

  for (const outcome of outcomes) {
    console.log(`${outcome.status} ${outcome.name}`);
    for (const detail of outcome.details) console.log(`  - ${detail}`);
  }

  const passed = outcomes.filter((outcome) => outcome.status === "PASS").length;
  console.log(`${passed}/${outcomes.length} PASS`);
  return passed === outcomes.length ? 0 : 1;
}

async function runScenario(name: ScenarioName): Promise<ScenarioOutcome> {
  const startedAtIso = new Date().toISOString();
  const runDir = resolve(smokeRoot, name);
  mkdirSync(runDir, { recursive: true });

  try {
    const details = await scenarioImpl(name, runDir);
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

async function scenarioImpl(
  name: ScenarioName,
  runDir: string,
): Promise<string[]> {
  switch (name) {
    case "seam-run-handler-executes-without-provider":
      return seamRunHandlerExecutesWithoutProvider(runDir);
    case "seam-canonical-run-dir-and-timeout":
      return seamCanonicalRunDirAndTimeout(runDir);
    case "seam-manifest-validates-run-output":
      return seamManifestValidatesRunOutput(runDir);
    case "seam-run-branch-bypasses-build-prompt":
      return seamRunBranchBypassesBuildPrompt(runDir);
    case "seam-manifest-throw-normalizes-to-error":
      return seamManifestThrowNormalizesToError(runDir);
    case "seam-run-handler-throw-maps-to-error":
      return seamRunHandlerThrowMapsToError(runDir);
    case "seam-non-run-stage-without-provider-errors":
      return seamNonRunStageWithoutProviderErrors(runDir);
    case "seam-text-stage-unchanged":
      return seamTextStageUnchanged(runDir);
    case "executor-seam-static-boundary-check":
      return executorSeamStaticBoundaryCheck();
    case "executor-seam-no-image-imports":
      return executorSeamNoImageImports();
  }
}

async function seamRunHandlerExecutesWithoutProvider(
  runDir: string,
): Promise<string[]> {
  let ran = false;
  const result = await runStage(
    stageDef([{ kind: "file_non_empty", path: "artifact.txt" }], {
      run: async (context) => {
        ran = true;
        writeFileSync(resolve(context.runDir, "artifact.txt"), "handler output\n");
      },
    }),
    undefined,
    { runDir, cwd: repoRoot },
  );

  assert(result.status === "ok", `expected ok, got ${result.status}`);
  assert(ran, "run handler should execute");
  assert(result.output === "", `expected empty output, got ${result.output}`);
  return [
    "Run handler executed without an LLMProvider.",
    "Shared manifest validation accepted the handler-written artifact.",
    "Successful run-handler result returned output=\"\".",
  ];
}

async function seamCanonicalRunDirAndTimeout(runDir: string): Promise<string[]> {
  const actualRunDir = resolve(runDir, "actual");
  const linkRunDir = resolve(runDir, "link");
  mkdirSync(actualRunDir, { recursive: true });
  symlinkSync(actualRunDir, linkRunDir, "dir");

  const expectedCanonical = realpathSync(actualRunDir);
  let captured: StageRunContext | undefined;
  const timeoutMs = 12_345;
  const result = await runStage(
    stageDef([{ kind: "file_non_empty", path: "canonical.txt" }], {
      timeoutMs,
      run: async (context) => {
        captured = context;
        writeFileSync(resolve(context.runDir, "canonical.txt"), "canonical\n");
      },
    }),
    undefined,
    { runDir: linkRunDir, cwd: repoRoot },
  );

  assert(result.status === "ok", `expected ok, got ${result.status}`);
  assert(captured !== undefined, "expected captured context");
  assert(captured.runDir === expectedCanonical, `expected canonical runDir ${expectedCanonical}, got ${captured.runDir}`);
  assert(captured.cwd === repoRoot, `expected cwd ${repoRoot}, got ${captured.cwd}`);
  assert(captured.timeoutMs === timeoutMs, `expected timeout ${timeoutMs}, got ${captured.timeoutMs}`);
  assert(existsSync(resolve(expectedCanonical, "canonical.txt")), "handler should write through canonical runDir");
  assert(result.runDir === expectedCanonical, "result should report canonical runDir");
  assert(result.output === "", `expected empty output, got ${result.output}`);
  return [
    "Symlinked jobContext.runDir was resolved before handler execution.",
    "StageDef.timeoutMs reached the handler unchanged.",
    "Handler-written bytes validated from the canonical path.",
  ];
}

async function seamManifestValidatesRunOutput(
  runDir: string,
): Promise<string[]> {
  const passResult = await runStage(
    stageDef([
      { kind: "file_exists", path: "exists.txt" },
      { kind: "file_non_empty", path: "exists.txt" },
    ], {
      run: async (context) => {
        writeFileSync(resolve(context.runDir, "exists.txt"), "exists\n");
      },
    }),
    undefined,
    { runDir, cwd: repoRoot },
  );
  assert(passResult.status === "ok", `expected ok, got ${passResult.status}`);

  const missRunDir = resolve(runDir, "missing-output");
  mkdirSync(missRunDir, { recursive: true });
  const failResult = await runStage(
    stageDef([{ kind: "file_non_empty", path: "missing.txt" }], {
      run: async () => {},
    }),
    undefined,
    { runDir: missRunDir, cwd: repoRoot },
  );
  assertManifestCode(failResult, "MANIFEST_FILE_MISSING");
  return [
    "Run-handler output passed file_exists + file_non_empty rules.",
    "A handler that wrote nothing failed through the same manifest_invalid path.",
  ];
}

async function seamRunBranchBypassesBuildPrompt(runDir: string): Promise<string[]> {
  const result = await runStage(
    stageDef([{ kind: "file_non_empty", path: "prompt-free.txt" }], {
      buildPrompt: () => {
        throw new Error("buildPrompt should not run");
      },
      run: async (context) => {
        writeFileSync(resolve(context.runDir, "prompt-free.txt"), "ok\n");
      },
    }),
    undefined,
    { runDir, cwd: repoRoot },
  );

  assert(result.status === "ok", `expected ok, got ${result.status}`);
  return ["Run-handler branch succeeded even though buildPrompt would throw."];
}

async function seamManifestThrowNormalizesToError(
  runDir: string,
): Promise<string[]> {
  const textRunDir = resolve(runDir, "text");
  const handlerRunDir = resolve(runDir, "handler");
  mkdirSync(textRunDir, { recursive: true });
  mkdirSync(handlerRunDir, { recursive: true });
  symlinkSync("loop.md", resolve(textRunDir, "loop.md"));
  symlinkSync("loop.md", resolve(handlerRunDir, "loop.md"));

  const rules: ManifestRule[] = [{ kind: "files_match_glob", glob: "*.md" }];
  const textResult = await runStage(
    stageDef(rules, { prompt: "text manifest throw" }),
    new RecordingProvider(new Map([["text manifest throw", "ok"]])),
    { runDir: textRunDir, cwd: repoRoot },
  );
  assertInternalSpawnError(textResult, "runStage internal:");

  const handlerResult = await runStage(
    stageDef(rules, { run: async () => {} }),
    undefined,
    { runDir: handlerRunDir, cwd: repoRoot },
  );
  assertInternalSpawnError(handlerResult, "runStage internal:");
  return [
    "Text stage manifest-validator throw normalized to StageResult.error.",
    "Run-handler manifest-validator throw normalized to the same StageResult.error shape.",
  ];
}

async function seamRunHandlerThrowMapsToError(
  runDir: string,
): Promise<string[]> {
  const plainResult = await runStage(
    stageDef([], {
      run: async () => {
        throw new Error("plain handler failure");
      },
    }),
    undefined,
    { runDir, cwd: repoRoot },
  );
  assertInternalSpawnError(plainResult, "runStage internal: plain handler failure");

  const providerError = new LLMProviderError({
    kind: "timeout",
    message: "handler-owned timeout",
    lifecycle: "soft-only",
    transcriptDir: runDir,
    quiescence: syntheticQuiescence(),
  });
  const providerResult = await runStage(
    stageDef([], {
      run: async () => {
        throw providerError;
      },
    }),
    undefined,
    { runDir, cwd: repoRoot },
  );
  assert(providerResult.status === "error", `expected error, got ${providerResult.status}`);
  assert(providerResult.error === providerError, "LLMProviderError thrown by handler should be preserved");
  return [
    "Plain handler throw normalized to LLMProviderError(kind=spawn).",
    "Handler-thrown LLMProviderError was preserved unchanged.",
  ];
}

async function seamNonRunStageWithoutProviderErrors(
  runDir: string,
): Promise<string[]> {
  const result = await runStage(
    stageDef([], { prompt: "needs provider" }),
    undefined,
    { runDir, cwd: repoRoot },
  );

  assertInternalSpawnError(result, "runStage internal: LLMProvider required for non-run stage");
  return ["A non-run stage without provider returned StageResult.error without throwing."];
}

async function seamTextStageUnchanged(runDir: string): Promise<string[]> {
  const provider = new RecordingProvider(new Map([["text prompt", "text output"]]));
  writeFileSync(resolve(runDir, "text.txt"), "text\n");
  const result = await runStage(
    stageDef([{ kind: "file_non_empty", path: "text.txt" }], {
      prompt: "text prompt",
      timeoutMs: 777,
    }),
    provider,
    { runDir, cwd: repoRoot },
  );

  assert(result.status === "ok", `expected ok, got ${result.status}`);
  assert(result.output === "text output", `expected provider output, got ${result.output}`);
  assert(provider.calls.length === 1, "provider should be called once");
  assert(provider.calls[0].prompt === "text prompt", "provider prompt should match");
  assert(provider.calls[0].cwd === realpathSync(runDir), "provider cwd should be canonical runDir");
  assert(provider.calls[0].timeoutMs === 777, "provider timeout should match StageDef.timeoutMs");
  return ["Text stage still routed through provider.runPrompt and returned provider output."];
}

function executorSeamStaticBoundaryCheck(): string[] {
  const base = implementationBase();
  const packageDiff = execFileSync("git", [
    "diff",
    "--unified=0",
    base,
    "--",
    "package.json",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert(
    packageDiff.includes(
      '"executor-seam-smoke": "bun scripts/executor-seam-smoke.ts"',
    ),
    "package diff should add the executor-seam-smoke script",
  );
  assert(
    !packageDiff.includes('+"dependencies"') &&
      !packageDiff.includes('+"devDependencies"') &&
      !packageDiff.includes('+"optionalDependencies"') &&
      !packageDiff.includes('+"peerDependencies"'),
    "package diff must not add dependency maps",
  );

  const changed = changedFiles(base, Boolean(process.env.SLICE_IMPLEMENTATION_BASE));
  const allowed = new Set([
    "src/pipeline/types.ts",
    "src/pipeline/run-stage.ts",
    "scripts/executor-seam-smoke.ts",
    "docs/preflight/executor-seam-smoke.md",
    "package.json",
  ]);
  for (const file of changed) {
    assert(allowed.has(file), `out-of-scope file changed in implementation range: ${file}`);
  }

  return [`Static boundary checks passed against implementation base ${base}.`];
}

function executorSeamNoImageImports(): string[] {
  const scanned = [
    "src/pipeline/types.ts",
    "src/pipeline/run-stage.ts",
  ];
  const forbidden = [
    "src/pipeline/image",
    "../pipeline/image",
    "./image/",
    "ImageProvider",
    "VisionJudge",
    "parseJudgeVerdict",
    "image-openai",
    "image-fake",
    "vision-judge",
  ];

  for (const file of scanned) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    for (const token of forbidden) {
      assert(!source.includes(token), `${file} must not reference ${token}`);
    }
  }

  return [
    "types.ts and run-stage.ts contain no image-provider or vision-judge imports/references.",
  ];
}

function stageDef(
  rules: readonly ManifestRule[],
  options: {
    prompt?: string;
    buildPrompt?: StageDef["buildPrompt"];
    run?: StageDef["run"];
    timeoutMs?: number;
  } = {},
): StageDef {
  return {
    stage: "executor_seam",
    prompt: options.prompt ?? "executor seam prompt",
    buildPrompt: options.buildPrompt,
    run: options.run,
    timeoutMs: options.timeoutMs ?? 1_000,
    manifest: { rules: [...rules] },
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertManifestCode(
  result: Awaited<ReturnType<typeof runStage>>,
  code: ManifestErrorCode,
): void {
  assert(
    result.status === "manifest_invalid",
    `expected manifest_invalid, got ${result.status}`,
  );
  assert(
    result.error.errorCode === code,
    `expected ${code}, got ${result.error.errorCode}`,
  );
}

function assertInternalSpawnError(
  result: Awaited<ReturnType<typeof runStage>>,
  messagePrefix: string,
): void {
  assert(result.status === "error", `expected error, got ${result.status}`);
  assert(result.error.kind === "spawn", `expected spawn, got ${result.error.kind}`);
  assert(
    result.error.message.startsWith(messagePrefix),
    `expected message prefix ${messagePrefix}, got ${result.error.message}`,
  );
}

function syntheticQuiescence() {
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

function changedFiles(base: string, includeUntracked: boolean): string[] {
  const files = new Set(
    execFileSync("git", ["diff", "--name-only", base], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean),
  );
  if (!includeUntracked) return [...files].sort();

  const statusLines = execFileSync("git", [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);

  for (const line of statusLines) {
    const pathPart = line.slice(3);
    const renamePath = pathPart.includes(" -> ")
      ? pathPart.split(" -> ").at(-1)
      : pathPart;
    if (renamePath) files.add(renamePath);
  }

  return [...files].sort();
}

function implementationBase(): string {
  if (process.env.SLICE_IMPLEMENTATION_BASE) {
    return process.env.SLICE_IMPLEMENTATION_BASE;
  }
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    const mergeBase = execFileSync("git", ["merge-base", "main", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    return mergeBase === head ? "HEAD^" : mergeBase;
  } catch {
    return "HEAD^";
  }
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  const generatedAtIso = new Date().toISOString();
  const allPassed = outcomes.every((outcome) => outcome.status === "PASS");
  const lines = [
    "# Executor Seam Smoke - Evidence Report",
    "",
    "**Slice:** V2 Slice 6a executor seam",
    `**Generated:** ${generatedAtIso}`,
    "**Provider scope:** Generic run-handler + fake text provider only; no real provider execution performed.",
    `**Evidence ceiling:** ${allPassed ? "Executor seam smoke passed" : "Executor seam smoke failed"}.`,
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
      "- Command: `bun run executor-seam-smoke`",
      `- Status: ${outcome.status}`,
      `- Started: ${outcome.startedAtIso}`,
      `- Finished: ${outcome.finishedAtIso}`,
      ...outcome.details.map((detail) => `- Evidence: ${detail}`),
      "",
    );
  }

  lines.push(
    "## Error-Mapping Contract",
    "",
    "- Run-handler success returns the existing `StageResult.ok` shape with `output: \"\"`.",
    "- Plain run-handler throws normalize to `StageResult.error` with `LLMProviderError(kind=\"spawn\")` and a `runStage internal:` prefix.",
    "- Handler-thrown `LLMProviderError` values are preserved unchanged.",
    "- Manifest validator throws normalize to the same `StageResult.error` shape on text and run-handler branches.",
    "",
    "## Scope Notes",
    "",
    "- The static boundary check uses `SLICE_IMPLEMENTATION_BASE` when provided, so pre-merge and post-merge verification inspect the approval-label-commit range.",
    "- `image-provider-fake-smoke` and `vision-judge-fake-smoke` are intentionally not invoked by this Slice 6a smoke because their static boundary checks are prior-slice-local.",
  );

  writeFileSync(docPath, `${lines.join("\n")}\n`);
}

function removeEmptyDir(dir: string): void {
  try {
    rmdirSync(dir);
  } catch {
  }
}

function formatError(err: unknown): string {
  if (err instanceof LLMProviderError) {
    return `LLMProviderError(kind=${err.kind}): ${err.message}`;
  }
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

const exitCode = await main();
if (exitCode !== 0) process.exit(exitCode);
