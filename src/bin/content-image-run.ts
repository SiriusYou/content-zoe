import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import path, { resolve } from "node:path";

import { CodexCliProvider } from "../llm/codex-cli.ts";
import type { ImageProvider } from "../llm/image-provider.ts";
import { GoogleImageProvider } from "../llm/image-google.ts";
import { OpenAiImageProvider } from "../llm/image-openai.ts";
import type { LLMProvider } from "../llm/provider.ts";
import {
  FallbackImageProvider,
  FallbackVisionJudge,
  type ProviderFallbackLogger,
} from "../llm/provider-fallback.ts";
import type { VisionJudge } from "../llm/vision-judge.ts";
import { GoogleVisionJudge } from "../llm/vision-judge-google.ts";
import { OpenAiVisionJudge } from "../llm/vision-judge-openai.ts";
import {
  type DbClient,
  findJobById,
  insertEvent,
  openDb,
  recordStageComplete,
  recordStageEnter,
  updateJob,
  type Job,
} from "../db.ts";
import { createImagePipelineFakes } from "../lib/image-run-fake-provider.ts";
import {
  parseImageProviderName,
  parseVisionJudgeModel,
  parseVisionJudgeProviderName,
  type ImageProviderName,
  type LLMProviderName,
  type VisionJudgeProviderName,
} from "../lib/runtime-config.ts";
import {
  runReportLoop,
  type ImageAutoGateEvent,
  type ImageRegenEvent,
  type StageLifecycleEvent,
  type StageLifecycleHooks,
} from "../lib/report-loop.ts";
import { IMAGE_STAGE, Modality } from "../pipeline/modality.ts";
import type { Stage } from "../pipeline/types.ts";

export interface ContentImageRunArgs {
  readonly jobId: string;
  readonly resume: boolean;
}

export interface RunContentImageRunCliOptions {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env?: Record<string, string | undefined>;
  readonly writeStdout?: (text: string) => void;
  readonly writeStderr?: (text: string) => void;
}

export interface ImageRunAttempt {
  readonly runDir: string;
  readonly attemptNumber: number;
  readonly startStage: string;
  readonly alreadyComplete: boolean;
}

export class ContentImageRunError extends Error {
  readonly name = "ContentImageRunError";
  readonly code:
    | "INVALID_COMMAND"
    | "IMAGE_RESUME_NOT_IMPLEMENTED"
    | "UNKNOWN_JOB"
    | "WRONG_MODALITY"
    | "STATUS_MISMATCH"
    | "INVALID_STAGE"
    | "PROVIDER_CONFIG_INVALID"
    | "ATTEMPT_PRECONDITION_FAILED";
  override readonly cause?: unknown;

  constructor(
    code: ContentImageRunError["code"],
    message?: string,
    cause?: unknown,
  ) {
    super(message ?? code);
    this.code = code;
    this.cause = cause;
  }
}

interface ProviderBundle {
  provider: LLMProvider;
  imageProvider: ImageProvider;
  visionJudge: VisionJudge;
  mode: "fake" | "real";
}

interface ProviderPlan {
  llmProvider: LLMProviderName;
  imageProvider: ImageProviderName;
  visionJudgeProvider: VisionJudgeProviderName;
  quiesceWindowMs: number;
  imageFallbackProvider?: Extract<ImageProviderName, "openai">;
  visionJudgeFallbackProvider?: Extract<VisionJudgeProviderName, "openai">;
  openAiApiKey?: string;
  googleApiKey?: string;
  imageModel?: string;
  visionJudgeModel?: string;
  imageFallbackModel?: string;
  visionJudgeFallbackModel?: string;
  imageBaseUrl?: string;
  visionBaseUrl?: string;
  imageFallbackBaseUrl?: string;
  visionFallbackBaseUrl?: string;
}

const RUN_DIR = ".runs";
const imageArtifactsByStartStage: Record<string, readonly string[]> = {
  [IMAGE_STAGE.ELABORATE_SPEC]: ["request.txt"],
  [IMAGE_STAGE.GENERATE]: ["request.txt", "spec.json"],
  [IMAGE_STAGE.JUDGE]: ["request.txt", "spec.json", "image.png"],
};

export async function runContentImageRunCli(
  opts: RunContentImageRunCliOptions,
): Promise<number> {
  const writeStdout = opts.writeStdout ?? ((text: string) => process.stdout.write(text));
  const writeStderr = opts.writeStderr ?? ((text: string) => process.stderr.write(text));

  let args: ContentImageRunArgs;
  try {
    args = parseContentImageRunArgs(opts.argv);
  } catch (err) {
    writeStderr(`${formatError(err)}\n`);
    return 1;
  }

  if (args.resume) {
    writeStderr("IMAGE_RESUME_NOT_IMPLEMENTED\n");
    return 1;
  }

  let db: DbClient | undefined;
  try {
    const cwd = realpathSync(opts.cwd);
    db = openDb(resolve(cwd, ".data", "content.db"));
    const job = findJobById(db, args.jobId);
    if (!job) throw new ContentImageRunError("UNKNOWN_JOB", `UNKNOWN_JOB: ${args.jobId}`);
    if (job.modality !== Modality.IMAGE) {
      throw new ContentImageRunError("WRONG_MODALITY", `WRONG_MODALITY: ${args.jobId}`);
    }
    if (job.status === "awaiting_approval") {
      writeStderr("[content-image-run] already complete: awaiting_approval\n");
      return 0;
    }
    if (job.status !== "queued") {
      throw new ContentImageRunError(
        "STATUS_MISMATCH",
        `STATUS_MISMATCH: expected queued or awaiting_approval, got ${job.status}`,
      );
    }

    const providerPlan = parseProviderPlan(opts.env ?? process.env);
    const attempt = prepareImageRunAttempt({ cwd, job });
    const providers = createProviders(providerPlan, {
      onFallback(event) {
        writeStderr(
          `[content-image-run] provider fallback: ${event.kind} ${event.primary} -> ${event.fallback} after ${event.errorCode}: ${event.message}\n`,
        );
      },
    });

    const result = await runReportLoop({
      jobId: job.id,
      locales: ["en"],
      provider: providers.provider,
      cwd,
      runDir: attempt.runDir,
      attemptNumber: attempt.attemptNumber,
      startStage: attempt.startStage,
      modality: Modality.IMAGE,
      imageProvider: providers.imageProvider,
      visionJudge: providers.visionJudge,
      lifecycle: createImageDbLifecycleHooks({ db, cwd }),
    });

    if (result.status === "stage_failed") {
      writeStderr(
        `[content-image-run] stage failed: ${result.stage} status=${result.stageStatus}: ${result.error}\n`,
      );
      return 2;
    }

    persistImageApprovalSummary({
      db,
      cwd,
      job,
      attemptNumber: result.attemptNumber,
    });
    writeStderr("[content-image-run] complete: awaiting_approval\n");
    writeStdout(`${job.id}\n`);
    return 0;
  } catch (err) {
    writeStderr(`${formatError(err)}\n`);
    return 1;
  } finally {
    db?.close();
  }
}

export function parseContentImageRunArgs(
  argv: readonly string[],
): ContentImageRunArgs {
  let resume = false;
  const positionals: string[] = [];
  for (const arg of argv) {
    if (arg === "--resume") {
      resume = true;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new ContentImageRunError("INVALID_COMMAND", `INVALID_COMMAND: ${arg}`);
    }
    positionals.push(arg);
  }
  if (positionals.length !== 1 || positionals[0].trim().length === 0) {
    throw new ContentImageRunError(
      "INVALID_COMMAND",
      "usage: bun run content:image-run <jobId> [--resume]",
    );
  }
  return { jobId: positionals[0], resume };
}

export function parseProviderPlan(env: Record<string, string | undefined>): ProviderPlan {
  const llmProvider = parseLlmProvider(env.LLM_PROVIDER);
  const imageProvider = parseImageProviderName(env.IMAGE_PROVIDER);
  const visionJudgeProvider = parseVisionJudgeProviderName(env.VISION_JUDGE_PROVIDER);
  const quiesceWindowMs = parsePositiveInt(env.CZ_LLM_QUIESCE_MS, "CZ_LLM_QUIESCE_MS", 5000);
  if (!imageProvider) {
    throw new ContentImageRunError(
      "PROVIDER_CONFIG_INVALID",
      "PROVIDER_CONFIG_INVALID: IMAGE_PROVIDER is required",
    );
  }
  if (!visionJudgeProvider) {
    throw new ContentImageRunError(
      "PROVIDER_CONFIG_INVALID",
      "PROVIDER_CONFIG_INVALID: VISION_JUDGE_PROVIDER is required",
    );
  }

  const allFake =
    llmProvider === "fake" &&
    imageProvider === "fake" &&
    visionJudgeProvider === "fake";
  const allReal =
    llmProvider === "codex" &&
    imageProvider !== "fake" &&
    visionJudgeProvider !== "fake";
  if (!allFake && !allReal) {
    throw new ContentImageRunError(
      "PROVIDER_CONFIG_INVALID",
      `PROVIDER_CONFIG_INVALID: mixed provider mode llm=${llmProvider} image=${imageProvider} vision=${visionJudgeProvider}`,
    );
  }

  if (allReal) {
    const imageFallbackProvider = parseOpenAiFallbackProvider(
      env.IMAGE_PROVIDER_FALLBACK,
      "IMAGE_PROVIDER_FALLBACK",
    );
    const visionJudgeFallbackProvider = parseOpenAiFallbackProvider(
      env.VISION_JUDGE_PROVIDER_FALLBACK,
      "VISION_JUDGE_PROVIDER_FALLBACK",
    );
    const needsOpenAi =
      imageProvider === "openai" ||
      visionJudgeProvider === "openai" ||
      imageFallbackProvider === "openai" ||
      visionJudgeFallbackProvider === "openai";
    const needsGoogle = imageProvider === "google" || visionJudgeProvider === "google";
    const openAiApiKey = needsOpenAi ? nonEmpty(env.OPENAI_API_KEY, "OPENAI_API_KEY") : undefined;
    const googleApiKey = needsGoogle ? nonEmpty(env.GOOGLE_API_KEY, "GOOGLE_API_KEY") : undefined;
    const visionJudgeModel = parseVisionJudgeModel(env.VISION_JUDGE_MODEL);
    if (!visionJudgeModel) {
      throw new ContentImageRunError(
        "PROVIDER_CONFIG_INVALID",
        "PROVIDER_CONFIG_INVALID: VISION_JUDGE_MODEL is required for real mode",
      );
    }
    if (imageFallbackProvider === "openai" && imageProvider !== "google") {
      throw new ContentImageRunError(
        "PROVIDER_CONFIG_INVALID",
        "PROVIDER_CONFIG_INVALID: IMAGE_PROVIDER_FALLBACK=openai requires IMAGE_PROVIDER=google",
      );
    }
    if (visionJudgeFallbackProvider === "openai" && visionJudgeProvider !== "google") {
      throw new ContentImageRunError(
        "PROVIDER_CONFIG_INVALID",
        "PROVIDER_CONFIG_INVALID: VISION_JUDGE_PROVIDER_FALLBACK=openai requires VISION_JUDGE_PROVIDER=google",
      );
    }
    return {
      llmProvider,
      imageProvider,
      visionJudgeProvider,
      quiesceWindowMs,
      imageFallbackProvider,
      visionJudgeFallbackProvider,
      openAiApiKey,
      googleApiKey,
      imageModel: optionalNonEmpty(env.IMAGE_MODEL),
      visionJudgeModel,
      imageFallbackModel: optionalNonEmpty(env.IMAGE_FALLBACK_MODEL),
      visionJudgeFallbackModel:
        optionalNonEmpty(env.VISION_JUDGE_FALLBACK_MODEL) ?? "gpt-4.1",
      imageBaseUrl:
        imageProvider === "google"
          ? optionalNonEmpty(env.GOOGLE_IMAGE_BASE_URL)
          : optionalNonEmpty(env.OPENAI_IMAGE_BASE_URL),
      visionBaseUrl:
        visionJudgeProvider === "google"
          ? optionalNonEmpty(env.GOOGLE_VISION_BASE_URL)
          : optionalNonEmpty(env.OPENAI_VISION_BASE_URL),
      imageFallbackBaseUrl: optionalNonEmpty(env.OPENAI_IMAGE_BASE_URL),
      visionFallbackBaseUrl: optionalNonEmpty(env.OPENAI_VISION_BASE_URL),
    };
  }

  return {
    llmProvider,
    imageProvider,
    visionJudgeProvider,
    quiesceWindowMs,
  };
}

export function prepareImageRunAttempt(opts: {
  readonly cwd: string;
  readonly job: Job;
}): ImageRunAttempt {
  const cwd = realpathSync(opts.cwd);
  const jobRoot = resolve(cwd, RUN_DIR, opts.job.id);
  assertInsideRoot(jobRoot, cwd, "job root");
  const attemptDir = resolve(jobRoot, `attempt-${opts.job.attempt_number}`);
  assertInsideRoot(attemptDir, cwd, "attempt dir");
  validateImageStartStage(opts.job.current_stage);
  mkdirSync(attemptDir, { recursive: true });

  const requiredFiles = imageArtifactsByStartStage[opts.job.current_stage];
  if (!requiredFiles) {
    throw new ContentImageRunError(
      "INVALID_STAGE",
      `INVALID_STAGE: ${opts.job.current_stage}`,
    );
  }
  if (opts.job.current_stage !== IMAGE_STAGE.ELABORATE_SPEC) {
    carryForwardImageArtifacts({
      cwd,
      jobRoot,
      attemptDir,
      attemptNumber: opts.job.attempt_number,
      files: requiredFiles,
    });
  }
  assertRequiredFiles(attemptDir, requiredFiles);

  return {
    runDir: realpathSync(attemptDir),
    attemptNumber: opts.job.attempt_number,
    startStage: opts.job.current_stage,
    alreadyComplete: false,
  };
}

function createProviders(
  plan: ProviderPlan,
  opts: { readonly onFallback?: ProviderFallbackLogger } = {},
): ProviderBundle {
  if (
    plan.llmProvider === "fake" &&
    plan.imageProvider === "fake" &&
    plan.visionJudgeProvider === "fake"
  ) {
    return { ...createImagePipelineFakes(), mode: "fake" };
  }

  if (
    plan.llmProvider === "codex" &&
    plan.imageProvider === "openai" &&
    plan.visionJudgeProvider === "openai" &&
    plan.openAiApiKey &&
    plan.visionJudgeModel
  ) {
    return {
      provider: new CodexCliProvider({ quiesceWindowMs: plan.quiesceWindowMs }),
      imageProvider: new OpenAiImageProvider({
        apiKey: plan.openAiApiKey,
        model: plan.imageModel,
        baseUrl: plan.imageBaseUrl,
      }),
      visionJudge: new OpenAiVisionJudge({
        apiKey: plan.openAiApiKey,
        model: plan.visionJudgeModel,
        baseUrl: plan.visionBaseUrl,
      }),
      mode: "real",
    };
  }

  if (
    plan.llmProvider === "codex" &&
    plan.imageProvider !== "fake" &&
    plan.visionJudgeProvider !== "fake"
  ) {
    const fallbackLogger = opts.onFallback ?? (() => undefined);
    let imageProvider = createRealImageProvider({
      provider: plan.imageProvider,
      apiKey: providerApiKey(plan.imageProvider, plan),
      model: plan.imageModel,
      baseUrl: plan.imageBaseUrl,
    });
    let visionJudge = createRealVisionJudge({
      provider: plan.visionJudgeProvider,
      apiKey: providerApiKey(plan.visionJudgeProvider, plan),
      model: plan.visionJudgeModel,
      baseUrl: plan.visionBaseUrl,
    });

    if (plan.imageFallbackProvider === "openai") {
      imageProvider = new FallbackImageProvider(
        imageProvider,
        createRealImageProvider({
          provider: "openai",
          apiKey: nonEmptyPlan(plan.openAiApiKey, "OPENAI_API_KEY"),
          model: plan.imageFallbackModel,
          baseUrl: plan.imageFallbackBaseUrl,
        }),
        fallbackLogger,
      );
    }
    if (plan.visionJudgeFallbackProvider === "openai") {
      visionJudge = new FallbackVisionJudge(
        visionJudge,
        createRealVisionJudge({
          provider: "openai",
          apiKey: nonEmptyPlan(plan.openAiApiKey, "OPENAI_API_KEY"),
          model: plan.visionJudgeFallbackModel,
          baseUrl: plan.visionFallbackBaseUrl,
        }),
        fallbackLogger,
      );
    }

    return {
      provider: new CodexCliProvider({ quiesceWindowMs: plan.quiesceWindowMs }),
      imageProvider,
      visionJudge,
      mode: "real",
    };
  }

  throw new ContentImageRunError(
    "PROVIDER_CONFIG_INVALID",
    "PROVIDER_CONFIG_INVALID: provider plan could not be constructed",
  );
}

function createRealImageProvider(input: {
  readonly provider: Extract<ImageProviderName, "openai" | "google">;
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
}): ImageProvider {
  if (input.provider === "openai") {
    return new OpenAiImageProvider({
      apiKey: input.apiKey,
      model: input.model,
      baseUrl: input.baseUrl,
    });
  }
  return new GoogleImageProvider({
    apiKey: input.apiKey,
    model: input.model,
    baseUrl: input.baseUrl,
  });
}

function createRealVisionJudge(input: {
  readonly provider: Extract<VisionJudgeProviderName, "openai" | "google">;
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
}): VisionJudge {
  const model = nonEmptyPlan(input.model, "VISION_JUDGE_MODEL");
  if (input.provider === "openai") {
    return new OpenAiVisionJudge({
      apiKey: input.apiKey,
      model,
      baseUrl: input.baseUrl,
    });
  }
  return new GoogleVisionJudge({
    apiKey: input.apiKey,
    model,
    baseUrl: input.baseUrl,
  });
}

function providerApiKey(
  provider: Extract<ImageProviderName | VisionJudgeProviderName, "openai" | "google">,
  plan: ProviderPlan,
): string {
  return provider === "openai"
    ? nonEmptyPlan(plan.openAiApiKey, "OPENAI_API_KEY")
    : nonEmptyPlan(plan.googleApiKey, "GOOGLE_API_KEY");
}

export function createImageDbLifecycleHooks(params: {
  readonly db: DbClient;
  readonly cwd: string;
}): StageLifecycleHooks {
  return {
    onStageEnter(event) {
      recordStageEnter(params.db, {
        jobId: event.jobId,
        attemptNumber: event.attemptNumber,
        stage: event.stage as Stage,
        runDir: displayPath(params.cwd, event.runDir),
      });
    },
    onStageComplete(event) {
      recordStageComplete(params.db, {
        jobId: event.jobId,
        attemptNumber: event.attemptNumber,
        stage: event.stage as Stage,
        runDir: displayPath(params.cwd, event.runDir),
      });
    },
    onImageRegen(event) {
      insertImageEvent(params.db, event, "image_regen", {
        regenRound: event.regenRound,
        fromStage: event.fromStage,
      });
    },
    onImageAutoGate(event) {
      insertImageEvent(params.db, event, "did_not_pass_auto_gate", {
        reason: event.reason,
        regenRound: event.regenRound,
      });
    },
  };
}

function insertImageEvent(
  db: DbClient,
  event: ImageRegenEvent | ImageAutoGateEvent | StageLifecycleEvent,
  type: string,
  payload: Record<string, unknown>,
): void {
  insertEvent(db, {
    job_id: event.jobId,
    attempt_number: event.attemptNumber,
    type,
    payload: JSON.stringify(payload),
    created_at: Math.floor(Date.now() / 1000),
  });
}

export function persistImageApprovalSummary(opts: {
  readonly db: DbClient;
  readonly cwd: string;
  readonly job: Job;
  readonly attemptNumber: number;
}): void {
  const summary = composeImageApprovalSummary({
    jobId: opts.job.id,
    attemptNumber: opts.attemptNumber,
    topic: opts.job.topic,
  });
  const updated = updateJob(opts.db, opts.job.id, {
    status: "awaiting_approval",
    current_stage: IMAGE_STAGE.JUDGE,
    attempt_number: opts.attemptNumber,
    run_dir: `.runs/${opts.job.id}`,
    artifact_dir: null,
    primary_report_path: null,
    translated_report_path: null,
    sources_path: null,
    approval_summary: summary,
    error: null,
    last_notify_error: null,
    notified_at: null,
    updated_at: Math.floor(Date.now() / 1000),
  });
  if (updated.rowsAffected !== 1) {
    throw new ContentImageRunError(
      "ATTEMPT_PRECONDITION_FAILED",
      `ATTEMPT_PRECONDITION_FAILED: approval persistence updated ${updated.rowsAffected} rows`,
    );
  }
}

export function composeImageApprovalSummary(input: {
  readonly jobId: string;
  readonly attemptNumber: number;
  readonly topic: string;
}): string {
  return [
    `Image job awaiting approval: ${input.jobId}`,
    `Attempt: ${input.attemptNumber}`,
    `Prompt: ${input.topic}`,
    "",
    "Inspect artifacts:",
    `bun run content:image-show ${input.jobId} --artifact request`,
    `bun run content:image-show ${input.jobId} --artifact spec`,
    `bun run content:image-show ${input.jobId} --artifact image`,
    `bun run content:image-show ${input.jobId} --artifact verdict`,
    "",
    "Image publish/approve is deferred to Slice 8; reject with /reject if the image needs regeneration.",
  ].join("\n");
}

function carryForwardImageArtifacts(params: {
  readonly cwd: string;
  readonly jobRoot: string;
  readonly attemptDir: string;
  readonly attemptNumber: number;
  readonly files: readonly string[];
}): void {
  const priorAttempt = latestPriorAttempt(params.jobRoot, params.attemptNumber);
  if (!priorAttempt) {
    throw new ContentImageRunError(
      "ATTEMPT_PRECONDITION_FAILED",
      `ATTEMPT_PRECONDITION_FAILED: no prior attempt before ${params.attemptNumber}`,
    );
  }
  for (const file of params.files) {
    const from = resolve(priorAttempt.dir, file);
    const to = resolve(params.attemptDir, file);
    assertInsideRoot(from, params.cwd, "carry source");
    assertInsideRoot(to, params.attemptDir, "carry destination");
    assertRegularFile(from, `missing carry-forward file: ${file}`);
    mkdirSync(path.dirname(to), { recursive: true });
    cpSync(from, to, { force: true });
  }
}

function latestPriorAttempt(
  jobRoot: string,
  attemptNumber: number,
): { attemptNumber: number; dir: string } | undefined {
  if (!existsSync(jobRoot)) return undefined;
  const attempts = readdirSync(jobRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const match = /^attempt-(\d+)$/.exec(entry.name);
      return match
        ? { attemptNumber: Number(match[1]), dir: resolve(jobRoot, entry.name) }
        : null;
    })
    .filter((entry): entry is { attemptNumber: number; dir: string } => entry !== null)
    .filter((entry) => entry.attemptNumber < attemptNumber)
    .sort((a, b) => a.attemptNumber - b.attemptNumber);
  return attempts.at(-1);
}

function assertRequiredFiles(attemptDir: string, files: readonly string[]): void {
  for (const file of files) {
    assertRegularFile(resolve(attemptDir, file), `missing required file: ${file}`);
  }
}

function assertRegularFile(filePath: string, message: string): void {
  try {
    const stat = statSync(filePath);
    if (stat.isFile()) return;
  } catch {
    // Normalize all missing/unreadable file errors to the precondition code below.
  }
  throw new ContentImageRunError("ATTEMPT_PRECONDITION_FAILED", message);
}

function validateImageStartStage(stage: string): void {
  if (
    stage === IMAGE_STAGE.ELABORATE_SPEC ||
    stage === IMAGE_STAGE.GENERATE ||
    stage === IMAGE_STAGE.JUDGE
  ) {
    return;
  }
  throw new ContentImageRunError("INVALID_STAGE", `INVALID_STAGE: ${stage}`);
}

function parseLlmProvider(value: string | undefined): LLMProviderName {
  const normalized = value ?? "fake";
  if (normalized === "fake" || normalized === "codex") return normalized;
  throw new ContentImageRunError(
    "PROVIDER_CONFIG_INVALID",
    `PROVIDER_CONFIG_INVALID: invalid LLM_PROVIDER ${JSON.stringify(value)}`,
  );
}

function parsePositiveInt(
  value: string | undefined,
  name: string,
  defaultValue: number,
): number {
  if (value === undefined) return defaultValue;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new ContentImageRunError(
      "PROVIDER_CONFIG_INVALID",
      `PROVIDER_CONFIG_INVALID: invalid ${name}`,
    );
  }
  return Number(value);
}

function nonEmpty(value: string | undefined, name: string): string {
  const normalized = optionalNonEmpty(value);
  if (normalized) return normalized;
  throw new ContentImageRunError(
    "PROVIDER_CONFIG_INVALID",
    `PROVIDER_CONFIG_INVALID: ${name} is required`,
  );
}

function nonEmptyPlan(value: string | undefined, name: string): string {
  if (value !== undefined && value.trim().length > 0) return value.trim();
  throw new ContentImageRunError(
    "PROVIDER_CONFIG_INVALID",
    `PROVIDER_CONFIG_INVALID: ${name} is required`,
  );
}

function parseOpenAiFallbackProvider(
  value: string | undefined,
  name: string,
): Extract<ImageProviderName, "openai"> | undefined {
  if (value === undefined || value.trim().length === 0) return undefined;
  if (value === "openai") return value;
  throw new ContentImageRunError(
    "PROVIDER_CONFIG_INVALID",
    `PROVIDER_CONFIG_INVALID: invalid ${name}: expected "openai", got ${JSON.stringify(value)}`,
  );
}

function optionalNonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function assertInsideRoot(candidate: string, root: string, label: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new ContentImageRunError(
    "ATTEMPT_PRECONDITION_FAILED",
    `ATTEMPT_PRECONDITION_FAILED: unsafe ${label}`,
  );
}

function displayPath(cwd: string, absPath: string): string {
  return path.relative(cwd, absPath).split(path.sep).join("/");
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

if (import.meta.main) {
  const code = await runContentImageRunCli({
    argv: Bun.argv.slice(2),
    cwd: process.cwd(),
  });
  process.exit(code);
}
