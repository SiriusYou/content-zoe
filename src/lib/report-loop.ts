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

import type { LLMProvider } from "../llm/provider.ts";
import { runStage } from "../pipeline/run-stage.ts";
import { nextStage, STAGES, type TerminalStage } from "../pipeline/stages.ts";
import { Stage, type StageResult } from "../pipeline/types.ts";

export type Locale = "en" | "zh";
export type RunStateStatus =
  | "running"
  | "ok"
  | "error"
  | "manifest_invalid"
  | "awaiting_approval";

export interface RecoveryCleanup {
  sourceAttemptNumber: number;
  restartStage: Stage;
  carryForward: string[];
  deletedFailedStageOutputs: string[];
}

export interface RunState {
  schemaVersion: 1;
  jobId: string;
  attemptNumber: number;
  lastStage: Stage;
  status: RunStateStatus;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  recoveryCleanup?: RecoveryCleanup;
}

export interface ReportLoopOptions {
  jobId: string;
  locales: readonly Locale[];
  provider: LLMProvider;
  cwd: string;
  resume?: boolean;
  startStage?: Stage;
  fsOps?: Partial<FileSystemOps>;
}

export type ReportLoopResult =
  | {
      status: "awaiting_approval";
      runDir: string;
      attemptNumber: number;
      alreadyComplete: boolean;
    }
  | {
      status: "stage_failed";
      runDir: string;
      attemptNumber: number;
      stage: Stage;
      stageStatus: Exclude<StageResult["status"], "ok">;
      error: string;
    };

interface FileSystemOps {
  cpSync: typeof cpSync;
  mkdirSync: typeof mkdirSync;
  renameSync: typeof renameSync;
  rmSync: typeof rmSync;
  writeFileSync: typeof writeFileSync;
}

interface AttemptEntry {
  attemptNumber: number;
  dir: string;
}

interface ResumePlan {
  runDir: string;
  attemptNumber: number;
  startStage: Stage | TerminalStage;
  startedAt: string;
  recoveryCleanup?: RecoveryCleanup;
  alreadyComplete: boolean;
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

export async function runReportLoop(
  opts: ReportLoopOptions,
): Promise<ReportLoopResult> {
  const fsOps = { ...defaultFsOps, ...opts.fsOps };
  const cwd = realpathSync(opts.cwd);
  const jobRoot = path.resolve(cwd, ".runs", opts.jobId);
  assertInsideCwd(jobRoot, cwd);

  const plan = opts.resume
    ? prepareResumeAttempt(opts, cwd, jobRoot, fsOps)
    : prepareFreshAttempt(opts, cwd, jobRoot, fsOps);

  if (plan.alreadyComplete) {
    return {
      status: "awaiting_approval",
      runDir: plan.runDir,
      attemptNumber: plan.attemptNumber,
      alreadyComplete: true,
    };
  }

  let current: Stage | TerminalStage = plan.startStage;
  while (current !== "awaiting_approval") {
    const runningState: RunState = {
      schemaVersion: 1,
      jobId: opts.jobId,
      attemptNumber: plan.attemptNumber,
      lastStage: current,
      status: "running",
      startedAt: plan.startedAt,
      recoveryCleanup: plan.recoveryCleanup,
    };
    writeRunState(plan.runDir, runningState, fsOps);

    const result = await runStage(STAGES[current], opts.provider, {
      runDir: plan.runDir,
      cwd,
    });

    if (result.status !== "ok") {
      writeRunState(
        plan.runDir,
        {
          ...runningState,
          status: result.status,
          error: formatStageError(result),
          finishedAt: new Date().toISOString(),
        },
        fsOps,
      );
      return {
        status: "stage_failed",
        runDir: plan.runDir,
        attemptNumber: plan.attemptNumber,
        stage: current,
        stageStatus: result.status,
        error: formatStageError(result),
      };
    }

    const following = nextStage(current, opts.locales);
    if (following === "awaiting_approval") {
      writeRunState(
        plan.runDir,
        {
          ...runningState,
          status: "awaiting_approval",
          finishedAt: new Date().toISOString(),
        },
        fsOps,
      );
      return {
        status: "awaiting_approval",
        runDir: plan.runDir,
        attemptNumber: plan.attemptNumber,
        alreadyComplete: false,
      };
    }

    writeRunState(
      plan.runDir,
      {
        ...runningState,
        status: "ok",
      },
      fsOps,
    );
    current = following;
  }

  throw new Error("unreachable report loop terminal state");
}

function prepareFreshAttempt(
  opts: ReportLoopOptions,
  cwd: string,
  jobRoot: string,
  fsOps: FileSystemOps,
): ResumePlan {
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

function prepareResumeAttempt(
  opts: ReportLoopOptions,
  cwd: string,
  jobRoot: string,
  fsOps: FileSystemOps,
): ResumePlan {
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
      startStage: "awaiting_approval",
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
      startStage: "awaiting_approval",
      startedAt: validated.startedAt,
      alreadyComplete: true,
    };
  }

  const attemptNumber = prior.attemptNumber + 1;
  const finalDir = path.resolve(jobRoot, `attempt-${attemptNumber}`);
  const bootstrapDir = path.resolve(
    jobRoot,
    `attempt-${attemptNumber}.bootstrap-${process.pid}`,
  );
  assertInsideCwd(finalDir, cwd);
  assertInsideCwd(bootstrapDir, cwd);

  const carryForward = carryForwardPathsForStartStage(restartStage);
  const deletedFailedStageOutputs =
    validated.status === "ok" ? [] : failedStageOutputPaths(validated.lastStage);
  const recoveryCleanup: RecoveryCleanup = {
    sourceAttemptNumber: prior.attemptNumber,
    restartStage,
    carryForward,
    deletedFailedStageOutputs,
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
    for (const relPath of deletedFailedStageOutputs) {
      fsOps.rmSync(path.resolve(bootstrapDir, relPath), {
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

function failedStageOutputPaths(_stage: Stage): string[] {
  return [];
}

function formatStageError(result: Exclude<StageResult, { status: "ok" }>): string {
  return result.error.message;
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
