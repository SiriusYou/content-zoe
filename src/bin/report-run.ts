import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { CodexCliProvider } from "../llm/codex-cli.ts";
import { FakeProvider } from "../llm/fake.ts";
import type { LLMProvider } from "../llm/provider.ts";
import { findJobById, openDb, recordRecoveryCleanup } from "../db.ts";
import { loadRuntimeConfig } from "../lib/runtime-config.ts";
import {
  type Locale,
  type RecoveryCleanup,
  runReportLoop,
  type RunState,
  type RunStateStatus,
} from "../lib/report-loop.ts";
import { nextStage, STAGES } from "../pipeline/stages.ts";
import { Stage, type ManifestRule } from "../pipeline/types.ts";

interface CliArgs {
  jobId: string;
  locales: Locale[];
  resume: boolean;
}

export interface ReportRunAttempt {
  runDir: string;
  attemptNumber: number;
  startStage: Stage;
  startedAt: string;
  recoveryCleanup?: RecoveryCleanup;
  alreadyComplete: boolean;
}

export interface PrepareReportRunAttemptOptions {
  jobId: string;
  locales: readonly Locale[];
  cwd: string;
  resume?: boolean;
  startStage?: Stage;
  fsOps?: Partial<FileSystemOps>;
}

interface FileSystemOps {
  cpSync: typeof cpSync;
  mkdirSync: typeof mkdirSync;
  renameSync: typeof renameSync;
  rmSync: typeof rmSync;
  writeFileSync: typeof writeFileSync;
}

export interface RecordRecoveryCleanupAuditOptions {
  cwd: string;
  jobId: string;
  attemptNumber: number;
  recoveryCleanup?: RecoveryCleanup;
}

interface AttemptEntry {
  attemptNumber: number;
  dir: string;
}

const RUN_STATE_FILE = "run-state.json";
const ATTEMPT_RE = /^attempt-(\d+)$/;
const defaultFsOps: FileSystemOps = {
  cpSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
};

function parseArgs(argv: readonly string[]): CliArgs {
  let locales: Locale[] = ["en", "zh"];
  let resume = false;
  const positionals: string[] = [];

  for (const arg of argv) {
    if (arg === "--resume") {
      resume = true;
    } else if (arg.startsWith("--locales=")) {
      locales = parseLocales(arg.slice("--locales=".length));
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  if (positionals.length !== 1 || positionals[0].length === 0) {
    throw new Error("usage: bun run report:run <jobId> [--locales=en|en,zh] [--resume]");
  }

  return {
    jobId: positionals[0],
    locales,
    resume,
  };
}

function parseLocales(value: string): Locale[] {
  if (value === "en") return ["en"];
  if (value === "en,zh") return ["en", "zh"];
  throw new Error(`invalid --locales value: ${JSON.stringify(value)}`);
}

export function prepareReportRunAttempt(
  opts: PrepareReportRunAttemptOptions,
): ReportRunAttempt {
  const fsOps = { ...defaultFsOps, ...opts.fsOps };
  const cwd = realpathSync(opts.cwd);
  const jobRoot = path.resolve(cwd, ".runs", opts.jobId);
  assertInsideCwd(jobRoot, cwd);

  return opts.resume
    ? prepareResumeAttempt(opts, cwd, jobRoot, fsOps)
    : prepareFreshAttempt(opts, cwd, jobRoot, fsOps);
}

async function main(): Promise<number> {
  let config;
  try {
    config = loadRuntimeConfig();
  } catch (err) {
    console.error(formatError(err));
    return 1;
  }

  if (config.llmProvider === "fake") {
    console.error("[report-run] LLM_PROVIDER=fake (canned outputs; no real LLM)");
  } else {
    console.error(
      `[report-run] LLM_PROVIDER=codex (quiesceWindowMs=${config.quiesceWindowMs})`,
    );
  }

  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(formatError(err));
    return 1;
  }

  let attempt: ReportRunAttempt;
  try {
    attempt = prepareReportRunAttempt({
      jobId: args.jobId,
      locales: args.locales,
      cwd: config.cwd,
      resume: args.resume,
    });
    recordRecoveryCleanupAudit({
      cwd: config.cwd,
      jobId: args.jobId,
      attemptNumber: attempt.attemptNumber,
      recoveryCleanup: attempt.recoveryCleanup,
    });
  } catch (err) {
    console.error(formatError(err));
    return 1;
  }

  if (attempt.alreadyComplete) {
    console.error("[report-run] already complete: awaiting_approval");
    return 0;
  }

  const provider: LLMProvider =
    config.llmProvider === "fake"
      ? new FakeProvider(
          new Map(
            Object.values(STAGES).map((stageDef) => [
              stageDef.prompt,
              `fake output for ${stageDef.stage}`,
            ]),
          ),
        )
      : new CodexCliProvider({ quiesceWindowMs: config.quiesceWindowMs });

  try {
    const result = await runReportLoop({
      jobId: args.jobId,
      locales: args.locales,
      provider,
      cwd: config.cwd,
      runDir: attempt.runDir,
      attemptNumber: attempt.attemptNumber,
      startStage: attempt.startStage,
      startedAt: attempt.startedAt,
      recoveryCleanup: attempt.recoveryCleanup,
    });

    if (result.status === "stage_failed") {
      console.error(
        `[report-run] stage failed: ${result.stage} status=${result.stageStatus}: ${result.error}`,
      );
      return 2;
    }

    if (result.alreadyComplete) {
      console.error("[report-run] already complete: awaiting_approval");
    } else {
      console.error("[report-run] complete: awaiting_approval");
    }
    return 0;
  } catch (err) {
    console.error(formatError(err));
    return 1;
  }
}

function prepareFreshAttempt(
  opts: PrepareReportRunAttemptOptions,
  cwd: string,
  jobRoot: string,
  fsOps: FileSystemOps,
): ReportRunAttempt {
  const attempts = scanAttempts(jobRoot);
  const attemptNumber = nextAttemptNumber(attempts);
  const runDir = path.resolve(jobRoot, `attempt-${attemptNumber}`);
  assertInsideCwd(runDir, cwd);
  fsOps.mkdirSync(runDir, { recursive: true });
  assertRealpathInsideCwd(runDir, cwd);

  const startStage = opts.startStage ?? Stage.RESEARCH;
  const startedAt = new Date().toISOString();
  writeRunState(
    runDir,
    {
      schemaVersion: 1,
      jobId: opts.jobId,
      attemptNumber,
      lastStage: startStage,
      status: "running",
      startedAt,
    },
    fsOps,
  );

  return {
    runDir: realpathSync(runDir),
    attemptNumber,
    startStage,
    startedAt,
    alreadyComplete: false,
  };
}

export function recordRecoveryCleanupAudit(
  opts: RecordRecoveryCleanupAuditOptions,
): void {
  if (!opts.recoveryCleanup) return;

  const db = openDb(path.resolve(opts.cwd, ".data", "content.db"));
  try {
    const job = findJobById(db, opts.jobId);
    if (!job) {
      throw new Error(
        `recovery audit requires a DB jobs row for job id ${JSON.stringify(
          opts.jobId,
        )} before recovery cleanup can be recorded`,
      );
    }
    recordRecoveryCleanup(db, {
      jobId: opts.jobId,
      attemptNumber: opts.attemptNumber,
      recoveryCleanup: opts.recoveryCleanup,
    });
  } finally {
    db.close();
  }
}

function prepareResumeAttempt(
  opts: PrepareReportRunAttemptOptions,
  cwd: string,
  jobRoot: string,
  fsOps: FileSystemOps,
): ReportRunAttempt {
  if (!existsSync(jobRoot)) {
    throw new Error(`resume precondition failed: missing job directory: ${jobRoot}`);
  }

  const attempts = scanAttempts(jobRoot);
  if (attempts.length === 0) {
    throw new Error(`resume precondition failed: empty job directory: ${jobRoot}`);
  }

  const prior = attempts.at(-1);
  if (!prior) {
    throw new Error(`resume precondition failed: empty job directory: ${jobRoot}`);
  }

  const priorStatePath = path.resolve(prior.dir, RUN_STATE_FILE);
  if (!existsSync(priorStatePath)) {
    throw new Error(`resume precondition failed: no run-state.json: ${prior.dir}`);
  }

  const priorState = readRunState(priorStatePath);
  if (priorState.schemaVersion !== 1) {
    throw new Error(
      `resume precondition failed: unsupported run-state schemaVersion: ${String(
        priorState.schemaVersion,
      )}`,
    );
  }

  const validated = validateRunState(priorState, opts.jobId);
  if (validated.status === "awaiting_approval") {
    return {
      runDir: realpathSync(prior.dir),
      attemptNumber: validated.attemptNumber,
      startStage: validated.lastStage,
      startedAt: validated.startedAt,
      alreadyComplete: true,
    };
  }

  const restartStage =
    validated.status === "ok"
      ? nextStage(validated.lastStage, opts.locales)
      : validated.lastStage;
  if (restartStage === "awaiting_approval") {
    return {
      runDir: realpathSync(prior.dir),
      attemptNumber: validated.attemptNumber,
      startStage: validated.lastStage,
      startedAt: validated.startedAt,
      alreadyComplete: true,
    };
  }

  return publishResumeBootstrap({
    opts,
    cwd,
    jobRoot,
    prior,
    priorState: validated,
    restartStage,
    fsOps,
  });
}

function publishResumeBootstrap(params: {
  opts: PrepareReportRunAttemptOptions;
  cwd: string;
  jobRoot: string;
  prior: AttemptEntry;
  priorState: RunState;
  restartStage: Stage;
  fsOps: FileSystemOps;
}): ReportRunAttempt {
  const { opts, cwd, jobRoot, prior, priorState, restartStage, fsOps } = params;
  const attemptNumber = prior.attemptNumber + 1;
  const finalDir = path.resolve(jobRoot, `attempt-${attemptNumber}`);
  const bootstrapDir = path.resolve(
    jobRoot,
    `attempt-${attemptNumber}.bootstrap-${process.pid}`,
  );
  assertInsideCwd(finalDir, cwd);
  assertInsideCwd(bootstrapDir, cwd);

  const carryForward = carryForwardPathsForStartStage(restartStage);
  const deletedFiles =
    priorState.status === "ok" ? [] : failedStageOutputPaths(priorState.lastStage);
  const recoveryCleanup: RecoveryCleanup = {
    fromAttempt: prior.attemptNumber,
    copiedFromAttempt: prior.attemptNumber,
    deletedFiles,
    restartStage,
    carryForward,
  };
  const startedAt = new Date().toISOString();

  try {
    fsOps.mkdirSync(bootstrapDir, { recursive: false });
    for (const relPath of carryForward) {
      const from = path.resolve(prior.dir, relPath);
      const to = path.resolve(bootstrapDir, relPath);
      assertInsideCwd(to, cwd);
      fsOps.mkdirSync(path.dirname(to), { recursive: true });
      fsOps.cpSync(from, to, { recursive: true, force: true });
    }
    for (const relPath of deletedFiles) {
      const target = path.resolve(bootstrapDir, relPath);
      assertInsideCwd(target, cwd);
      fsOps.rmSync(target, {
        recursive: true,
        force: true,
      });
    }
    writeRunState(
      bootstrapDir,
      {
        schemaVersion: 1,
        jobId: opts.jobId,
        attemptNumber,
        lastStage: restartStage,
        status: "running",
        startedAt,
        recoveryCleanup,
      },
      fsOps,
    );
    fsOps.renameSync(bootstrapDir, finalDir);
  } catch (err) {
    try {
      fsOps.rmSync(bootstrapDir, { recursive: true, force: true });
    } catch {
    }
    throw err;
  }

  assertRealpathInsideCwd(finalDir, cwd);
  return {
    runDir: realpathSync(finalDir),
    attemptNumber,
    startStage: restartStage,
    startedAt,
    recoveryCleanup,
    alreadyComplete: false,
  };
}

function scanAttempts(jobRoot: string): AttemptEntry[] {
  if (!existsSync(jobRoot)) return [];
  const attempts: AttemptEntry[] = [];
  for (const entry of readdirSync(jobRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const match = ATTEMPT_RE.exec(entry.name);
    if (!match) continue;
    attempts.push({
      attemptNumber: Number(match[1]),
      dir: path.resolve(jobRoot, entry.name),
    });
  }
  attempts.sort((a, b) => a.attemptNumber - b.attemptNumber);
  return attempts;
}

function nextAttemptNumber(attempts: readonly AttemptEntry[]): number {
  return Math.max(0, ...attempts.map((attempt) => attempt.attemptNumber)) + 1;
}

function readRunState(runStatePath: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(runStatePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("run-state root is not an object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`resume precondition failed: unparseable run-state.json: ${runStatePath}`);
    }
    throw err;
  }
}

function validateRunState(raw: Record<string, unknown>, jobId: string): RunState {
  const schemaVersion = raw.schemaVersion;
  if (schemaVersion !== 1) {
    throw new Error(
      `resume precondition failed: unsupported run-state schemaVersion: ${String(
        schemaVersion,
      )}`,
    );
  }
  if (raw.jobId !== jobId) {
    throw new Error(`resume precondition failed: run-state jobId mismatch`);
  }
  if (!Number.isInteger(raw.attemptNumber) || Number(raw.attemptNumber) < 1) {
    throw new Error(`resume precondition failed: invalid attemptNumber`);
  }
  if (!isStage(raw.lastStage)) {
    throw new Error(`resume precondition failed: invalid lastStage`);
  }
  if (!isRunStateStatus(raw.status)) {
    throw new Error(`resume precondition failed: invalid status`);
  }
  if (typeof raw.startedAt !== "string" || raw.startedAt.length === 0) {
    throw new Error(`resume precondition failed: invalid startedAt`);
  }

  return raw as unknown as RunState;
}

function writeRunState(
  runDir: string,
  state: RunState,
  fsOps: FileSystemOps,
): void {
  const runStatePath = path.resolve(runDir, RUN_STATE_FILE);
  const tmpPath = path.resolve(
    runDir,
    `.run-state.tmp-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`,
  );
  fsOps.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`);
  fsOps.renameSync(tmpPath, runStatePath);
}

function carryForwardPathsForStartStage(stage: Stage): string[] {
  switch (stage) {
    case Stage.RESEARCH:
      return [];
    case Stage.DRAFT_EN:
      return ["research", "sources.json"];
    case Stage.EDIT_EN:
      return ["research", "sources.json", "report.en.md"];
    case Stage.TRANSLATE_ZH:
      return ["research", "sources.json", "report.en.md"];
  }
}

function failedStageOutputPaths(stage: Stage): string[] {
  const seen = new Set<string>();
  for (const rule of STAGES[stage].manifest.rules) {
    const relPath = manifestRulePath(rule);
    if (relPath) seen.add(relPath);
  }
  return [...seen];
}

function manifestRulePath(rule: ManifestRule): string | undefined {
  if ("path" in rule) return rule.path;
  if ("glob" in rule) return rule.glob;
  return undefined;
}

function isStage(value: unknown): value is Stage {
  return Object.values(Stage).includes(value as Stage);
}

function isRunStateStatus(value: unknown): value is RunStateStatus {
  return (
    value === "running" ||
    value === "ok" ||
    value === "error" ||
    value === "manifest_invalid" ||
    value === "awaiting_approval"
  );
}

function assertRealpathInsideCwd(candidate: string, cwd: string): void {
  const realCandidate = realpathSync(candidate);
  const stat = statSync(realCandidate);
  if (!stat.isDirectory()) {
    throw new Error(`runDir is not a directory: ${candidate}`);
  }
  assertInsideCwd(realCandidate, cwd);
}

function assertInsideCwd(candidate: string, cwd: string): void {
  const relative = path.relative(cwd, path.resolve(candidate));
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`runDir escapes cwd: runDir=${path.resolve(candidate)} cwd=${cwd}`);
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

if (import.meta.main) {
  const code = await main();
  process.exit(code);
}
