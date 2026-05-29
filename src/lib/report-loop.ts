import {
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type { ImageProvider } from "../llm/image-provider.ts";
import type { LLMProvider } from "../llm/provider.ts";
import {
  VisionJudgeError,
  type VisionJudge,
} from "../llm/vision-judge.ts";
import {
  getPipeline,
  IMAGE_MAX_REGEN_ROUNDS,
  IMAGE_STAGE,
  Modality,
} from "../pipeline/modality.ts";
import { parseImageSpec } from "../pipeline/image/spec.ts";
import { parseJudgeVerdict } from "../pipeline/image/verdict.ts";
import { runStage } from "../pipeline/run-stage.ts";
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
  regenRound?: number;
}

export interface ReportLoopOptions {
  jobId: string;
  locales: readonly Locale[];
  provider: LLMProvider;
  cwd: string;
  runDir: string;
  attemptNumber: number;
  startStage: string;
  modality?: Modality | string;
  imageProvider?: ImageProvider;
  visionJudge?: VisionJudge;
  regenRound?: number;
  startedAt?: string;
  recoveryCleanup?: RecoveryCleanup;
  lifecycle?: Partial<StageLifecycleHooks>;
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
      stage: string;
      stageStatus: Exclude<StageResult["status"], "ok">;
      error: string;
    };

interface FileSystemOps {
  renameSync: typeof renameSync;
  writeFileSync: typeof writeFileSync;
}

export interface StageLifecycleEvent {
  jobId: string;
  attemptNumber: number;
  stage: Stage;
  runDir: string;
}

export interface StageLifecycleHooks {
  onStageEnter: (event: StageLifecycleEvent) => Promise<void> | void;
  onStageComplete: (event: StageLifecycleEvent) => Promise<void> | void;
  onImageRegen?: (event: ImageRegenEvent) => Promise<void> | void;
  onImageAutoGate?: (event: ImageAutoGateEvent) => Promise<void> | void;
}

export interface ImageRegenEvent {
  jobId: string;
  attemptNumber: number;
  stage: string;
  runDir: string;
  regenRound: number;
  fromStage: string;
}

export interface ImageAutoGateEvent {
  jobId: string;
  attemptNumber: number;
  stage: string;
  runDir: string;
  reason: "exhausted" | "safety";
  regenRound: number;
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

  const modality = opts.modality ?? Modality.TEXT_REPORT;
  const pipeline = getPipeline(modality);
  let regenRound = opts.regenRound ?? 0;
  const startedAt = opts.startedAt ?? new Date().toISOString();
  let current = opts.startStage;
  for (;;) {
    const runningState: RunState = {
      schemaVersion: 1,
      jobId: opts.jobId,
      attemptNumber: opts.attemptNumber,
      lastStage: current as Stage,
      status: "running",
      startedAt,
      recoveryCleanup: opts.recoveryCleanup,
      regenRound: modality === Modality.IMAGE ? regenRound : undefined,
    };
    writeRunState(runDir, runningState, fsOps);

    await opts.lifecycle?.onStageEnter?.({
      jobId: opts.jobId,
      attemptNumber: opts.attemptNumber,
      stage: current as Stage,
      runDir,
    });

    const stageDef = pipeline.stageDef(current, {
      imageProvider: opts.imageProvider,
      visionJudge: opts.visionJudge,
    });
    const result = await runStage(stageDef, opts.provider, {
      runDir,
      cwd,
    });

    if (result.status !== "ok") {
      if (modality === Modality.IMAGE && current === IMAGE_STAGE.JUDGE) {
        const imageTransition = await handleImageJudgeNonOk({
          result,
          runningState,
          fsOps,
          runDir,
          opts,
          regenRound,
        });
        if (imageTransition.kind === "regen") {
          regenRound = imageTransition.regenRound;
          current = IMAGE_STAGE.GENERATE;
          continue;
        }
        if (imageTransition.kind === "awaiting_approval") {
          return {
            status: "awaiting_approval",
            runDir,
            attemptNumber: opts.attemptNumber,
            alreadyComplete: false,
          };
        }
      }

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

    await opts.lifecycle?.onStageComplete?.({
      jobId: opts.jobId,
      attemptNumber: opts.attemptNumber,
      stage: current as Stage,
      runDir,
    });

    const following = pipeline.nextStage(current, opts.locales);
    if (following === "awaiting_approval") {
      writeRunState(
        runDir,
        {
          ...runningState,
          status: "awaiting_approval",
          finishedAt: new Date().toISOString(),
          regenRound: modality === Modality.IMAGE ? regenRound : undefined,
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
        regenRound: modality === Modality.IMAGE ? regenRound : undefined,
      },
      fsOps,
    );
    current = following;
  }

  throw new Error("unreachable report loop terminal state");
}

async function handleImageJudgeNonOk(params: {
  result: Exclude<StageResult, { status: "ok" }>;
  runningState: RunState;
  fsOps: FileSystemOps;
  runDir: string;
  opts: ReportLoopOptions;
  regenRound: number;
}): Promise<
  | { kind: "none" }
  | { kind: "regen"; regenRound: number }
  | { kind: "awaiting_approval" }
> {
  const safetyError =
    params.result.status === "error" &&
    params.result.error.cause instanceof VisionJudgeError &&
    params.result.error.cause.code === "safety";
  if (safetyError) {
    await recordImageAutoGate(params, "safety");
    return { kind: "awaiting_approval" };
  }

  if (
    params.result.status !== "manifest_invalid" ||
    params.result.error.errorCode !== "MANIFEST_JUDGE_FAILED"
  ) {
    return { kind: "none" };
  }

  const failingVerdict = readFailingJudgeVerdict(params.runDir);
  if (!failingVerdict) return { kind: "none" };

  if (isSafetyCriterionFailure(params.runDir, failingVerdict)) {
    await recordImageAutoGate(params, "safety");
    return { kind: "awaiting_approval" };
  }

  if (params.regenRound >= IMAGE_MAX_REGEN_ROUNDS) {
    await recordImageAutoGate(params, "exhausted");
    return { kind: "awaiting_approval" };
  }

  const nextRound = params.regenRound + 1;
  await params.opts.lifecycle?.onImageRegen?.({
    jobId: params.opts.jobId,
    attemptNumber: params.opts.attemptNumber,
    stage: IMAGE_STAGE.JUDGE,
    runDir: params.runDir,
    regenRound: nextRound,
    fromStage: IMAGE_STAGE.GENERATE,
  });
  writeRunState(
    params.runDir,
    {
      ...params.runningState,
      status: "ok",
      lastStage: IMAGE_STAGE.GENERATE as Stage,
      regenRound: nextRound,
    },
    params.fsOps,
  );
  return { kind: "regen", regenRound: nextRound };
}

async function recordImageAutoGate(
  params: {
    runningState: RunState;
    fsOps: FileSystemOps;
    runDir: string;
    opts: ReportLoopOptions;
    regenRound: number;
  },
  reason: ImageAutoGateEvent["reason"],
): Promise<void> {
  await params.opts.lifecycle?.onImageAutoGate?.({
    jobId: params.opts.jobId,
    attemptNumber: params.opts.attemptNumber,
    stage: IMAGE_STAGE.JUDGE,
    runDir: params.runDir,
    reason,
    regenRound: params.regenRound,
  });
  writeRunState(
    params.runDir,
    {
      ...params.runningState,
      status: "awaiting_approval",
      finishedAt: new Date().toISOString(),
      regenRound: params.regenRound,
    },
    params.fsOps,
  );
}

function readFailingJudgeVerdict(
  runDir: string,
): ReturnType<typeof parseJudgeVerdict> | undefined {
  try {
    const verdict = parseJudgeVerdict(
      JSON.parse(readFileSync(path.resolve(runDir, "verdict.json"), "utf8")),
    );
    return verdict.overallPass ? undefined : verdict;
  } catch {
    return undefined;
  }
}

function isSafetyCriterionFailure(
  runDir: string,
  verdict: ReturnType<typeof parseJudgeVerdict>,
): boolean {
  try {
    const spec = parseImageSpec(
      JSON.parse(readFileSync(path.resolve(runDir, "spec.json"), "utf8")),
    );
    const safetyIds = new Set(
      spec.acceptanceCriteria
        .filter((criterion) => {
          const haystack = `${criterion.id} ${criterion.description}`.toLowerCase();
          return criterion.tier === "judged" && haystack.includes("safety");
        })
        .map((criterion) => criterion.id),
    );
    return verdict.criteria.some(
      (criterion) => safetyIds.has(criterion.id) && !criterion.pass,
    );
  } catch {
    return false;
  }
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
