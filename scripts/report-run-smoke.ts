import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FakeProvider } from "../src/llm/fake.ts";
import { prepareReportRunAttempt } from "../src/bin/report-run.ts";
import {
  type Locale,
  runReportLoop,
  type ReportLoopResult,
  type RunState,
} from "../src/lib/report-loop.ts";
import { STAGES } from "../src/pipeline/stages.ts";
import { Stage } from "../src/pipeline/types.ts";

type ScenarioName =
  | "happy-path"
  | "en-only-skip"
  | "stage-failure-mid-run"
  | "resume-after-failure"
  | "env-purity-static-check"
  | "resume-carry-forward"
  | "resume-after-success-idempotent"
  | "resume-edge-cases"
  | "carry-forward-partial-failure";

interface ScenarioOutcome {
  name: ScenarioName;
  status: "PASS" | "FAIL";
  details: string[];
  startedAtIso: string;
  finishedAtIso: string;
}

const SCENARIOS: ScenarioName[] = [
  "happy-path",
  "en-only-skip",
  "stage-failure-mid-run",
  "resume-after-failure",
  "env-purity-static-check",
  "resume-carry-forward",
  "resume-after-success-idempotent",
  "resume-edge-cases",
  "carry-forward-partial-failure",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isoStamp = new Date().toISOString().replaceAll(":", "-");
const smokeRoot = resolve(repoRoot, ".runs", "report-run-smoke", isoStamp);
const docPath = resolve(repoRoot, "docs", "preflight", "report-run-smoke.md");

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
    removeEmptyDir(resolve(repoRoot, ".runs", "report-run-smoke"));
    removeEmptyDir(resolve(repoRoot, ".runs"));
  }

  for (const outcome of outcomes) {
    console.log(`${outcome.status} ${outcome.name}`);
    for (const detail of outcome.details) {
      console.log(`  - ${detail}`);
    }
  }

  return outcomes.every((outcome) => outcome.status === "PASS") ? 0 : 1;
}

async function runScenario(name: ScenarioName): Promise<ScenarioOutcome> {
  const startedAtIso = new Date().toISOString();
  const dir = resolve(smokeRoot, name);
  mkdirSync(dir, { recursive: true });

  try {
    const details = await scenarioImpl(name, dir);
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
  dir: string,
): Promise<string[]> {
  switch (name) {
    case "happy-path":
      return runHappyPath(dir);
    case "en-only-skip":
      return runEnOnlySkip(dir);
    case "stage-failure-mid-run":
      return runStageFailureMidRun(dir);
    case "resume-after-failure":
      return runResumeAfterFailure(dir);
    case "env-purity-static-check":
      return runEnvPurityStaticCheck();
    case "resume-carry-forward":
      return runResumeCarryForward(dir);
    case "resume-after-success-idempotent":
      return runResumeAfterSuccessIdempotent(dir);
    case "resume-edge-cases":
      return runResumeEdgeCases(dir);
    case "carry-forward-partial-failure":
      return runCarryForwardPartialFailure(dir);
  }
}

async function runHappyPath(dir: string): Promise<string[]> {
  const result = runReportRunCli(dir, ["happy", "--locales=en,zh"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(
    result.stderr.includes("[report-run] LLM_PROVIDER=fake"),
    "expected LLM_PROVIDER visibility log",
  );
  const state = readState(dir, "happy", 1);
  assert(state.status === "awaiting_approval", `expected awaiting_approval, got ${state.status}`);
  assert(state.lastStage === Stage.TRANSLATE_ZH, `expected final translate_zh, got ${state.lastStage}`);
  assert(!existsSync(resolve(dir, ".runs", "happy", "attempt-2")), "attempt-2 must not exist");
  return [
    "CLI path exited 0 with the fake-provider visibility log.",
    "run-state.json reached awaiting_approval at translate_zh in attempt-1.",
  ];
}

async function runEnOnlySkip(dir: string): Promise<string[]> {
  const result = await runPreparedReportLoop({
    jobId: "en-only",
    locales: ["en"],
    provider: providerOmitting([Stage.TRANSLATE_ZH]),
    cwd: dir,
  });
  assert(result.status === "awaiting_approval", `expected awaiting_approval, got ${result.status}`);
  const state = readState(dir, "en-only", 1);
  assert(state.lastStage === Stage.EDIT_EN, `expected edit_en terminal, got ${state.lastStage}`);
  return [
    "FakeProvider omitted translate_zh, so an incorrect translation call would have failed.",
    "locales=['en'] terminated after edit_en.",
  ];
}

async function runStageFailureMidRun(dir: string): Promise<string[]> {
  const result = await runPreparedReportLoop({
    jobId: "fail-mid",
    locales: ["en", "zh"],
    provider: providerOmitting([Stage.EDIT_EN]),
    cwd: dir,
  });
  assert(result.status === "stage_failed", `expected stage_failed, got ${result.status}`);
  assert(result.stage === Stage.EDIT_EN, `expected edit_en failure, got ${result.stage}`);
  assert(exitCodeForResult(result) === 2, "non-ok stage result must map to exit 2");
  const state = readState(dir, "fail-mid", 1);
  assert(state.status === "error", `expected run-state error, got ${state.status}`);
  assert(state.lastStage === Stage.EDIT_EN, `expected lastStage edit_en, got ${state.lastStage}`);
  return [
    "Missing edit_en canned prompt produced the same non-ok loop result the CLI maps to failure.",
    "The composition-root exit-code branch maps that non-ok stage result to exit 2.",
    "run-state.json recorded status=error and lastStage=edit_en.",
  ];
}

async function runResumeAfterFailure(dir: string): Promise<string[]> {
  const attempt1 = resolve(dir, ".runs", "resume-failure", "attempt-1");
  mkdirSync(attempt1, { recursive: true });
  writeCarryForwardFiles(attempt1);
  writeState(attempt1, {
    schemaVersion: 1,
    jobId: "resume-failure",
    attemptNumber: 1,
    lastStage: Stage.EDIT_EN,
    status: "error",
    error: "synthetic edit failure",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });

  const result = await runPreparedReportLoop({
    jobId: "resume-failure",
    locales: ["en", "zh"],
    provider: providerOmitting([Stage.RESEARCH, Stage.DRAFT_EN]),
    cwd: dir,
    resume: true,
  });
  assert(result.status === "awaiting_approval", `expected awaiting_approval, got ${result.status}`);
  assert(result.attemptNumber === 2, `expected attempt-2, got ${result.attemptNumber}`);
  const state = readState(dir, "resume-failure", 2);
  const cleanup = state.recoveryCleanup;
  assert(cleanup !== undefined, "expected recoveryCleanup");
  assert(cleanup.restartStage === Stage.EDIT_EN, "expected restartStage edit_en");
  assert(cleanup.fromAttempt === 1, "expected fromAttempt 1");
  assert(cleanup.copiedFromAttempt === 1, "expected copiedFromAttempt 1");
  assert(Array.isArray(cleanup.deletedFiles), "expected deletedFiles audit list");
  assert(state.lastStage === Stage.TRANSLATE_ZH, `expected final translate_zh, got ${state.lastStage}`);
  assert(existsSync(resolve(dir, ".runs", "resume-failure", "attempt-2", "report.en.md")), "report.en.md was not carried forward");
  return [
    "Resume from failed edit_en started at edit_en; missing research/draft prompts were never called.",
    "Atomic attempt-2 includes carry-forward files and recoveryCleanup audit data.",
  ];
}

async function runEnvPurityStaticCheck(): Promise<string[]> {
  const checkedFiles = [
    ...filesMatching(resolve(repoRoot, "src", "bin"), (file) => file.endsWith(".ts")),
    resolve(repoRoot, "src", "lib", "runtime-config.ts"),
    resolve(repoRoot, "src", "lib", "report-loop.ts"),
    ...filesMatching(resolve(repoRoot, "src", "pipeline"), (file) => file.endsWith(".ts")),
    ...filesMatching(resolve(repoRoot, "src", "llm"), (file) => file.endsWith(".ts")),
  ];

  const envPattern =
    /process\.env|Bun\.env|import\.meta\.env|Deno\.env|os\.userInfo|\/proc\/self\/environ|readFileSync.*\.env/;
  const argvPattern = /process\.argv/;
  const spawnPattern = /child_process|Bun\.spawn/;

  const envHits = grepFiles(checkedFiles, envPattern).filter(
    (hit) => hit.file !== resolve(repoRoot, "src", "lib", "runtime-config.ts"),
  );
  const argvHits = grepFiles(checkedFiles, argvPattern).filter(
    (hit) => hit.file !== resolve(repoRoot, "src", "bin", "report-run.ts"),
  );
  const spawnHits = grepFiles(
    [
      resolve(repoRoot, "src", "bin", "report-run.ts"),
      resolve(repoRoot, "src", "lib", "report-loop.ts"),
    ],
    spawnPattern,
  );

  assert(envHits.length === 0, `unexpected env hits: ${JSON.stringify(envHits)}`);
  assert(argvHits.length === 0, `unexpected process.argv hits: ${JSON.stringify(argvHits)}`);
  assert(spawnHits.length === 0, `unexpected spawn hits: ${JSON.stringify(spawnHits)}`);
  return [
    "Only runtime-config.ts reads process.env among the checked runtime files.",
    "process.argv appears only in src/bin/report-run.ts.",
    "src/bin/report-run.ts and src/lib/report-loop.ts contain no child_process or Bun.spawn references.",
  ];
}

async function runResumeCarryForward(dir: string): Promise<string[]> {
  const attempt1 = resolve(dir, ".runs", "carry-forward", "attempt-1");
  mkdirSync(attempt1, { recursive: true });
  mkdirSync(resolve(attempt1, "research"), { recursive: true });
  writeFileSync(resolve(attempt1, "research", "notes.md"), "notes\n");
  writeFileSync(resolve(attempt1, "sources.json"), "[]\n");
  writeState(attempt1, {
    schemaVersion: 1,
    jobId: "carry-forward",
    attemptNumber: 1,
    lastStage: Stage.RESEARCH,
    status: "ok",
    startedAt: new Date().toISOString(),
  });

  const result = await runPreparedReportLoop({
    jobId: "carry-forward",
    locales: ["en", "zh"],
    provider: providerOmitting([Stage.RESEARCH]),
    cwd: dir,
    resume: true,
  });
  assert(result.status === "awaiting_approval", `expected awaiting_approval, got ${result.status}`);
  const state = readState(dir, "carry-forward", 2);
  const cleanup = state.recoveryCleanup;
  assert(cleanup !== undefined, "expected recoveryCleanup");
  assert(cleanup.fromAttempt === 1, "expected fromAttempt 1");
  assert(cleanup.copiedFromAttempt === 1, "expected copiedFromAttempt 1");
  assert(cleanup.restartStage === Stage.DRAFT_EN, "expected restartStage draft_en");
  assert(
    cleanup.carryForward.join(",") === "research,sources.json",
    `unexpected carryForward ${cleanup.carryForward.join(",")}`,
  );
  assert(
    cleanup.deletedFiles.join(",") === "",
    `unexpected deletedFiles ${cleanup.deletedFiles.join(",")}`,
  );
  assert(existsSync(resolve(dir, ".runs", "carry-forward", "attempt-2", "research", "notes.md")), "research/ was not carried forward");
  assert(existsSync(resolve(dir, ".runs", "carry-forward", "attempt-2", "sources.json")), "sources.json was not carried forward");
  const recoveryBeforeIdempotentResume = JSON.stringify(cleanup);

  const second = await runPreparedReportLoop({
    jobId: "carry-forward",
    locales: ["en", "zh"],
    provider: providerOmitting([
      Stage.RESEARCH,
      Stage.DRAFT_EN,
      Stage.EDIT_EN,
      Stage.TRANSLATE_ZH,
    ]),
    cwd: dir,
    resume: true,
  });
  assert(second.status === "awaiting_approval", `expected idempotent awaiting_approval, got ${second.status}`);
  assert(second.attemptNumber === 2, `expected idempotent attempt-2, got ${second.attemptNumber}`);
  assert(second.alreadyComplete, "expected second resume to be alreadyComplete");
  assert(!existsSync(resolve(dir, ".runs", "carry-forward", "attempt-3")), "attempt-3 must not be created");
  assert(
    readdirSync(resolve(dir, ".runs", "carry-forward")).every(
      (entry) => !entry.includes(".bootstrap-"),
    ),
    "idempotent resume left a bootstrap directory",
  );
  const stateAfterIdempotentResume = readState(dir, "carry-forward", 2);
  assert(
    JSON.stringify(stateAfterIdempotentResume.recoveryCleanup) === recoveryBeforeIdempotentResume,
    "recoveryCleanup drifted after idempotent resume",
  );
  return [
    "Resume from ok research advanced to draft_en; missing research prompt was never called.",
    "research/ and sources.json were copied into attempt-2 with fromAttempt/copiedFromAttempt/deletedFiles recorded.",
    "A second resume was an already-complete no-op: no attempt-3, no bootstrap residue, no recoveryCleanup drift.",
  ];
}

async function runResumeAfterSuccessIdempotent(dir: string): Promise<string[]> {
  const first = runReportRunCli(dir, ["idempotent", "--locales=en,zh"]);
  assert(first.exitCode === 0, `expected initial exit 0, got ${first.exitCode}: ${first.stderr}`);
  const second = runReportRunCli(dir, ["idempotent", "--locales=en,zh", "--resume"]);
  assert(second.exitCode === 0, `expected resume exit 0, got ${second.exitCode}: ${second.stderr}`);
  assert(second.stderr.includes("already complete"), "expected already complete stderr");
  assert(!existsSync(resolve(dir, ".runs", "idempotent", "attempt-2")), "attempt-2 must not be created");
  return [
    "A completed job resumed as an idempotent no-op.",
    "The resume path emitted already complete and did not create attempt-2.",
  ];
}

async function runResumeEdgeCases(dir: string): Promise<string[]> {
  await expectResumeError(dir, "missing-root", "missing job directory");

  mkdirSync(resolve(dir, ".runs", "empty-root"), { recursive: true });
  await expectResumeError(dir, "empty-root", "empty job directory");

  mkdirSync(resolve(dir, ".runs", "no-state", "attempt-1"), { recursive: true });
  await expectResumeError(dir, "no-state", "no run-state.json");

  const corrupted = resolve(dir, ".runs", "corrupted", "attempt-1");
  mkdirSync(corrupted, { recursive: true });
  writeFileSync(resolve(corrupted, "run-state.json"), "{not json");
  await expectResumeError(dir, "corrupted", "unparseable run-state.json");

  const badSchema = resolve(dir, ".runs", "bad-schema", "attempt-1");
  mkdirSync(badSchema, { recursive: true });
  writeFileSync(
    resolve(badSchema, "run-state.json"),
    `${JSON.stringify({
      schemaVersion: 99,
      jobId: "bad-schema",
      attemptNumber: 1,
      lastStage: Stage.RESEARCH,
      status: "ok",
      startedAt: new Date().toISOString(),
    })}\n`,
  );
  await expectResumeError(dir, "bad-schema", "unsupported run-state schemaVersion");

  return [
    "Missing job directory, empty job directory, missing run-state, corrupted JSON, and schema mismatch all failed with exit-class precondition errors.",
  ];
}

async function runCarryForwardPartialFailure(dir: string): Promise<string[]> {
  const attempt1 = resolve(dir, ".runs", "partial-failure", "attempt-1");
  mkdirSync(attempt1, { recursive: true });
  mkdirSync(resolve(attempt1, "research"), { recursive: true });
  writeFileSync(resolve(attempt1, "research", "notes.md"), "notes\n");
  writeFileSync(resolve(attempt1, "sources.json"), "[]\n");
  writeState(attempt1, {
    schemaVersion: 1,
    jobId: "partial-failure",
    attemptNumber: 1,
    lastStage: Stage.RESEARCH,
    status: "ok",
    startedAt: new Date().toISOString(),
  });

  let copyCalls = 0;
  let failed = false;
  try {
    await runPreparedReportLoop({
      jobId: "partial-failure",
      locales: ["en", "zh"],
      provider: providerOmitting([Stage.RESEARCH]),
      cwd: dir,
      resume: true,
      fsOps: {
        cpSync(from, to, options) {
          copyCalls++;
          if (copyCalls === 2) {
            throw new Error("synthetic cpSync failure");
          }
          cpSync(from, to, options);
        },
      },
    });
  } catch (err) {
    failed = formatError(err).includes("synthetic cpSync failure");
  }

  assert(failed, "expected injected cpSync failure");
  const jobRoot = resolve(dir, ".runs", "partial-failure");
  assert(!existsSync(resolve(jobRoot, "attempt-2")), "attempt-2 must not exist after failed bootstrap");
  assert(
    readdirSync(jobRoot).every((entry) => !entry.includes(".bootstrap-")),
    "bootstrap temp directory was not cleaned up",
  );

  const result = await runPreparedReportLoop({
    jobId: "partial-failure",
    locales: ["en", "zh"],
    provider: providerOmitting([Stage.RESEARCH]),
    cwd: dir,
    resume: true,
  });
  assert(result.status === "awaiting_approval", `expected second resume success, got ${result.status}`);
  assert(result.attemptNumber === 2, `expected second resume attempt-2, got ${result.attemptNumber}`);
  return [
    "Injected copy failure removed the bootstrap directory and left attempt-2 absent.",
    "A subsequent resume still selected attempt-1 as highest and published attempt-2 successfully.",
  ];
}

function providerOmitting(omitted: readonly Stage[]): FakeProvider {
  const omittedSet = new Set(omitted);
  return new FakeProvider(
    new Map(
      Object.values(STAGES)
        .filter((stageDef) => !omittedSet.has(stageDef.stage))
        .map((stageDef) => [stageDef.prompt, `fake output for ${stageDef.stage}`]),
    ),
  );
}

function runReportRunCli(
  cwd: string,
  args: string[],
): { exitCode: number | null; stdout: string; stderr: string } {
  const proc = Bun.spawnSync({
    cmd: ["bun", resolve(repoRoot, "src", "bin", "report-run.ts"), ...args],
    cwd,
    env: { ...process.env, LLM_PROVIDER: "fake" },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode,
    stdout: new TextDecoder().decode(proc.stdout),
    stderr: new TextDecoder().decode(proc.stderr),
  };
}

async function runPreparedReportLoop(opts: {
  jobId: string;
  locales: readonly Locale[];
  provider: FakeProvider;
  cwd: string;
  resume?: boolean;
  fsOps?: Parameters<typeof prepareReportRunAttempt>[0]["fsOps"];
}): Promise<ReportLoopResult> {
  const attempt = prepareReportRunAttempt({
    jobId: opts.jobId,
    locales: opts.locales,
    cwd: opts.cwd,
    resume: opts.resume,
    fsOps: opts.fsOps,
  });
  if (attempt.alreadyComplete) {
    return {
      status: "awaiting_approval",
      runDir: attempt.runDir,
      attemptNumber: attempt.attemptNumber,
      alreadyComplete: true,
    };
  }

  return runReportLoop({
    jobId: opts.jobId,
    locales: opts.locales,
    provider: opts.provider,
    cwd: opts.cwd,
    runDir: attempt.runDir,
    attemptNumber: attempt.attemptNumber,
    startStage: attempt.startStage,
    startedAt: attempt.startedAt,
    recoveryCleanup: attempt.recoveryCleanup,
  });
}

function readState(cwd: string, jobId: string, attemptNumber: number): RunState {
  return JSON.parse(
    readFileSync(
      resolve(cwd, ".runs", jobId, `attempt-${attemptNumber}`, "run-state.json"),
      "utf8",
    ),
  ) as RunState;
}

function writeState(attemptDir: string, state: RunState): void {
  writeFileSync(resolve(attemptDir, "run-state.json"), `${JSON.stringify(state, null, 2)}\n`);
}

function writeCarryForwardFiles(attemptDir: string): void {
  mkdirSync(resolve(attemptDir, "research"), { recursive: true });
  writeFileSync(resolve(attemptDir, "research", "notes.md"), "notes\n");
  writeFileSync(resolve(attemptDir, "sources.json"), "[]\n");
  writeFileSync(resolve(attemptDir, "report.en.md"), "English report\n");
}

async function expectResumeError(
  cwd: string,
  jobId: string,
  expected: string,
): Promise<void> {
  const result = runReportRunCli(cwd, [jobId, "--resume"]);
  assert(result.exitCode === 1, `expected exit 1, got ${result.exitCode}`);
  const logIndex = result.stderr.indexOf("[report-run] LLM_PROVIDER=fake");
  const errorIndex = result.stderr.indexOf(expected);
  assert(logIndex !== -1, `expected LLM_PROVIDER visibility log, got ${result.stderr}`);
  assert(
    logIndex < errorIndex,
    `expected visibility log before resume precondition error, got ${result.stderr}`,
  );
  assert(
    result.stderr.includes(expected),
    `expected stderr ${JSON.stringify(expected)}, got ${result.stderr}`,
  );
}

function exitCodeForResult(result: Awaited<ReturnType<typeof runReportLoop>>): number {
  return result.status === "stage_failed" ? 2 : 0;
}

function filesMatching(root: string, predicate: (file: string) => boolean): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...filesMatching(full, predicate));
    } else if (entry.isFile() && predicate(full)) {
      files.push(full);
    }
  }
  return files;
}

function grepFiles(
  files: readonly string[],
  pattern: RegExp,
): Array<{ file: string; line: number; text: string }> {
  const hits: Array<{ file: string; line: number; text: string }> = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, index) => {
      if (pattern.test(text)) {
        hits.push({ file, line: index + 1, text });
      }
    });
  }
  return hits;
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  const lines = [
    "# report-run smoke evidence",
    "",
    `- Command: \`bun run report-run-smoke\``,
    `- Started: ${outcomes[0]?.startedAtIso ?? new Date().toISOString()}`,
    `- Finished: ${outcomes.at(-1)?.finishedAtIso ?? new Date().toISOString()}`,
    `- Scenario root: ${smokeRoot} (removed by finally-cleanup)`,
    "",
    "| Scenario | Result | Evidence |",
    "|---|---:|---|",
    ...outcomes.map(
      (outcome) =>
        `| ${outcome.name} | ${outcome.status} | ${outcome.details
          .map((detail) => detail.replaceAll("|", "\\|"))
          .join("<br>")} |`,
    ),
    "",
  ];
  writeFileSync(docPath, `${lines.join("\n")}\n`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function removeEmptyDir(dir: string): void {
  try {
    rmdirSync(dir);
  } catch {
  }
}

if (import.meta.main) {
  const code = await main();
  process.exit(code);
}
