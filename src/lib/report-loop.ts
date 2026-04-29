import { realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
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
  fromAttempt: number;
  copiedFromAttempt: number;
  deletedFiles: string[];
  restartStage: Stage;
  carryForward: string[];
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
  runDir: string;
  attemptNumber: number;
  startStage: Stage;
  startedAt?: string;
  recoveryCleanup?: RecoveryCleanup;
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
  renameSync: typeof renameSync;
  writeFileSync: typeof writeFileSync;
}

const RUN_STATE_FILE = "run-state.json";
const defaultFsOps: FileSystemOps = {
  renameSync,
  writeFileSync,
};

export async function runReportLoop(
  opts: ReportLoopOptions,
): Promise<ReportLoopResult> {
  const fsOps = { ...defaultFsOps, ...opts.fsOps };
  const cwd = realpathSync(opts.cwd);
  const runDir = realpathSync(opts.runDir);
  assertInsideCwd(runDir, cwd);
  assertRealpathInsideCwd(runDir, cwd);

  const startedAt = opts.startedAt ?? new Date().toISOString();
  let current: Stage | TerminalStage = opts.startStage;
  while (current !== "awaiting_approval") {
    const runningState: RunState = {
      schemaVersion: 1,
      jobId: opts.jobId,
      attemptNumber: opts.attemptNumber,
      lastStage: current,
      status: "running",
      startedAt,
      recoveryCleanup: opts.recoveryCleanup,
    };
    writeRunState(runDir, runningState, fsOps);

    const result = await runStage(STAGES[current], opts.provider, {
      runDir,
      cwd,
    });

    if (result.status !== "ok") {
      writeRunState(
        runDir,
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
        runDir,
        attemptNumber: opts.attemptNumber,
        stage: current,
        stageStatus: result.status,
        error: formatStageError(result),
      };
    }

    const following = nextStage(current, opts.locales);
    if (following === "awaiting_approval") {
      writeRunState(
        runDir,
        {
          ...runningState,
          status: "awaiting_approval",
          finishedAt: new Date().toISOString(),
        },
        fsOps,
      );
      return {
        status: "awaiting_approval",
        runDir,
        attemptNumber: opts.attemptNumber,
        alreadyComplete: false,
      };
    }

    writeRunState(
      runDir,
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

function formatStageError(result: Exclude<StageResult, { status: "ok" }>): string {
  return result.error.message;
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
