import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import {
  casUpdateJob,
  findJobById,
  insertEvent,
  type DbClient,
  type Event,
  type Job,
} from "./db.ts";
import {
  buildReadmeImageGalleryEntry,
  publishReadmeImageGallery,
} from "./lib/readme-image-gallery-destination.ts";
import { validateSourcesProvenanceText } from "./lib/sources-provenance.ts";
import { parseImageSpec, type ImageSpec } from "./pipeline/image/spec.ts";
import { parseJudgeVerdict, type JudgeVerdict } from "./pipeline/image/verdict.ts";

export type PromoteErrorCode =
  | "UNKNOWN_JOB"
  | "STALE_ATTEMPT"
  | "STATUS_MISMATCH"
  | "PUBLISH_SOURCE_MISSING"
  | "PUBLISH_ARTIFACT_DIVERGED"
  | "APPROVE_RACE_LOST"
  | "PUBLISH_FAILED";

export interface PublishManifest {
  readonly artifact_dir: string;
  readonly job_id: string;
  readonly attempt_number: number;
  readonly files: readonly string[];
  readonly sha256: Readonly<Record<string, string>>;
  readonly aggregate_sha256: string;
}

export interface GitCommitPlan {
  readonly artifactDir: string;
  readonly commands: readonly (readonly string[])[];
}

export type GitCommitter = (plan: GitCommitPlan) => Promise<void> | void;

export interface PromoteJobOptions {
  readonly db: DbClient;
  readonly cwd: string;
  readonly jobId: string;
  readonly attemptNumber: number;
  readonly now: () => number;
  readonly committer?: GitCommitter;
  readonly hooks?: PromoteJobHooks;
}

export interface PromoteJobHooks {
  readonly afterFinalRename?: (context: PromoteHookContext) => Promise<void> | void;
  readonly beforeDbCas?: (context: PromoteHookContext) => Promise<void> | void;
  readonly afterDbCommit?: (context: PromoteHookContext) => Promise<void> | void;
  readonly beforeImageGalleryWrite?: (context: PromoteHookContext) => Promise<void> | void;
}

export interface PromoteHookContext {
  readonly job: Job;
  readonly artifactDir: string;
  readonly sourceAttemptDir: string;
  readonly finalArtifactDir: string;
  readonly manifest: PublishManifest;
}

export interface PromoteJobResult {
  readonly status: "published" | "idempotent";
  readonly jobId: string;
  readonly attemptNumber: number;
  readonly artifactDir: string;
  readonly manifest: PublishManifest;
  readonly gitCommitFailed?: string;
  readonly cleanupFailed?: string;
  readonly galleryUpdateFailed?: string;
}

export class PromoteError extends Error {
  readonly name = "PromoteError";
  readonly code: PromoteErrorCode;
  readonly jobId?: string;
  override readonly cause?: unknown;

  constructor(code: PromoteErrorCode, message: string, jobId?: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.jobId = jobId;
    this.cause = cause;
  }
}

const awaitingApprovalStatus = "awaiting_approval";
const publishedStatus = "published";
const promotedEventType = "promoted";
const gitCommitFailedEventType = "git_commit_failed";
const cleanupFailedEventType = "cleanup_failed";
const imageGalleryUpdateFailedEventType = "image_gallery_update_failed";
const requiredSourceMissingMessage = "publish source bundle is missing or invalid";
const requiredImageFiles = ["image.png", "request.txt", "spec.json", "verdict.json"] as const;
const sourceMaterialDirName = "source-material";
const sourceMaterialManifestFile = "source-material/manifest.json";
const sourceMaterialContextFile = "source-material/context.md";
const sourceMaterialOperatorDir = "source-material/operator";
const lowercaseSha256Pattern = /^[0-9a-f]{64}$/;

export async function promoteJob(
  options: PromoteJobOptions,
): Promise<PromoteJobResult> {
  const cwd = path.resolve(options.cwd);
  const job = findJobById(options.db, options.jobId);
  if (job === null) {
    throw new PromoteError("UNKNOWN_JOB", `unknown job: ${options.jobId}`, options.jobId);
  }

  if (job.attempt_number !== options.attemptNumber) {
    throw new PromoteError("STALE_ATTEMPT", "approve attempt does not match current job attempt", job.id);
  }

  const artifactDir = publishArtifactDir(job);
  const finalArtifactDir = resolveUnderCwd(cwd, artifactDir);

  if (job.status === publishedStatus) {
    const manifest = requirePublishedManifest(options.db, cwd, job, artifactDir, finalArtifactDir);
    return {
      status: "idempotent",
      jobId: job.id,
      attemptNumber: job.attempt_number,
      artifactDir,
      manifest,
    };
  }

  if (job.status !== awaitingApprovalStatus) {
    removeFinalUnlessPublishedAuthority({
      db: options.db,
      cwd,
      job,
      artifactDir,
      finalArtifactDir,
    });
    throw new PromoteError("STATUS_MISMATCH", "job is not awaiting approval", job.id);
  }

  const sourceAttemptDir = sourceAttemptDirectory(cwd, job, options.attemptNumber);
  const sourceManifest = readSourceManifest(cwd, job, sourceAttemptDir, artifactDir);

  if (existsSync(finalArtifactDir)) {
    return recoverExistingDestination({
      ...options,
      cwd,
      job,
      artifactDir,
      sourceAttemptDir,
      finalArtifactDir,
      sourceManifest,
    });
  }

  return publishFreshDestination({
    ...options,
    cwd,
    job,
    artifactDir,
    sourceAttemptDir,
    finalArtifactDir,
    sourceManifest,
  });
}

export async function promoteImageJob(
  options: PromoteJobOptions,
): Promise<PromoteJobResult> {
  const cwd = path.resolve(options.cwd);
  const job = findJobById(options.db, options.jobId);
  if (job === null) {
    throw new PromoteError("UNKNOWN_JOB", `unknown job: ${options.jobId}`, options.jobId);
  }
  if (job.attempt_number !== options.attemptNumber) {
    throw new PromoteError("STALE_ATTEMPT", "approve attempt does not match current job attempt", job.id);
  }
  if (job.modality !== "image") {
    throw new PromoteError("PUBLISH_FAILED", "promoteImageJob requires image modality", job.id);
  }

  const artifactDir = imagePublishArtifactDir(job);
  const finalArtifactDir = resolveUnderCwd(cwd, artifactDir);

  if (job.status === publishedStatus) {
    const manifest = requirePublishedManifest(options.db, cwd, job, artifactDir, finalArtifactDir);
    const galleryUpdateFailed = await reconcileImageGalleryBestEffort({
      db: options.db,
      cwd,
      job,
      artifactDir,
      sourceAttemptDir: "",
      finalArtifactDir,
      manifest,
      now: options.now,
      hooks: options.hooks,
    });
    const gitCommitFailed = await runBestEffortGitCommit(
      {
        db: options.db,
        job,
        artifactDir,
        now: options.now,
        committer: options.committer,
      },
      manifest,
      buildImageGitCommitPlan(job, artifactDir),
    );
    return {
      status: "idempotent",
      jobId: job.id,
      attemptNumber: job.attempt_number,
      artifactDir,
      manifest,
      galleryUpdateFailed,
      gitCommitFailed,
    };
  }

  if (job.status !== awaitingApprovalStatus) {
    removeFinalUnlessPublishedAuthority({
      db: options.db,
      cwd,
      job,
      artifactDir,
      finalArtifactDir,
    });
    throw new PromoteError("STATUS_MISMATCH", "job is not awaiting approval", job.id);
  }

  assertSupportedImagePurpose(job);
  const sourceAttemptDir = sourceAttemptDirectory(cwd, job, options.attemptNumber);
  const sourceManifest = readImageSourceManifest(cwd, job, sourceAttemptDir, artifactDir);

  if (existsSync(finalArtifactDir)) {
    const finalManifest = manifestFromDirectory(
      cwd,
      finalArtifactDir,
      artifactDir,
      job.id,
      job.attempt_number,
    );
    assertManifestEquivalent(sourceManifest, finalManifest);
    return commitImagePublishedState(
      {
        ...options,
        cwd,
        job,
        artifactDir,
        sourceAttemptDir,
        finalArtifactDir,
      },
      finalManifest,
      true,
    );
  }

  return publishFreshImageDestination({
    ...options,
    cwd,
    job,
    artifactDir,
    sourceAttemptDir,
    finalArtifactDir,
    sourceManifest,
  });
}

export function buildGitCommitPlan(artifactDir: string, weekKey: string): GitCommitPlan {
  return {
    artifactDir,
    commands: [
      ["git", "add", "--", `${artifactDir}/`],
      ["git", "commit", "-m", `[content-zoe] publish ${weekKey}`, "--", `${artifactDir}/`],
    ],
  };
}

function publishArtifactDir(job: Job): string {
  return `reports/${job.week_key}-ai-trends`;
}

function imagePublishArtifactDir(job: Job): string {
  return `images/${job.id}`;
}

function buildImageGitCommitPlan(job: Job, artifactDir: string): GitCommitPlan {
  const commands: (readonly string[])[] = [["git", "add", "--", `${artifactDir}/`]];
  if (job.purpose === "production") {
    commands[0] = ["git", "add", "--", `${artifactDir}/`, "README.md"];
    commands.push([
      "git",
      "commit",
      "-m",
      `[content-zoe] publish image ${job.id}`,
      "--",
      `${artifactDir}/`,
      "README.md",
    ]);
  } else {
    commands.push([
      "git",
      "commit",
      "-m",
      `[content-zoe] publish image ${job.id}`,
      "--",
      `${artifactDir}/`,
    ]);
  }
  return { artifactDir, commands };
}

function sourceAttemptDirectory(
  cwd: string,
  job: Job,
  attemptNumber: number,
): string {
  const canonical = `.runs/${job.id}/attempt-${attemptNumber}`;
  const fromRunDir = job.run_dir?.trim();
  if (fromRunDir && fromRunDir.length > 0) {
    const runRoot = resolveUnderCwd(cwd, fromRunDir);
    const candidate = path.resolve(runRoot, `attempt-${attemptNumber}`);
    assertPathInsideCwd(cwd, candidate);
    return candidate;
  }
  return resolveUnderCwd(cwd, canonical);
}

function readSourceManifest(
  cwd: string,
  job: Job,
  sourceAttemptDir: string,
  artifactDir: string,
): PublishManifest {
  try {
    assertPathInsideCwd(cwd, sourceAttemptDir);
    const stat = statSync(sourceAttemptDir);
    if (!stat.isDirectory()) {
      throw new Error("attempt source is not a directory");
    }

    assertRequiredFile(cwd, sourceAttemptDir, "report.en.md");
    if (job.locales === "en,zh") {
      assertRequiredFile(cwd, sourceAttemptDir, "report.zh.md");
    }
    const sourcesPath = assertRequiredFile(cwd, sourceAttemptDir, "sources.json");
    const sourcesText = readFileSync(sourcesPath, "utf8");
    JSON.parse(sourcesText);
    const sourcesValidation = validateSourcesProvenanceText(sourcesText, "sources.json");
    if (!sourcesValidation.ok) {
      throw new Error(sourcesValidation.message ?? "sources.json provenance is invalid", {
        cause: sourcesValidation.cause,
      });
    }

    const researchDir = resolveUnderDirectory(cwd, sourceAttemptDir, "research");
    if (!statSync(researchDir).isDirectory()) {
      throw new Error("research is not a directory");
    }
    if (listFilesRecursive(cwd, researchDir).length === 0) {
      throw new Error("research directory is empty");
    }

    validateSourceMaterialManifest(cwd, job, sourceAttemptDir);

    const files = bundleFilesForSource(cwd, sourceAttemptDir);
    return manifestFromFiles({
      cwd,
      rootDir: sourceAttemptDir,
      artifactDir,
      jobId: job.id,
      attemptNumber: job.attempt_number,
      files,
    });
  } catch (err) {
    if (err instanceof PromoteError) {
      throw err;
    }
    throw new PromoteError(
      "PUBLISH_SOURCE_MISSING",
      requiredSourceMissingMessage,
      job.id,
      err,
    );
  }
}

function readImageSourceManifest(
  cwd: string,
  job: Job,
  sourceAttemptDir: string,
  artifactDir: string,
): PublishManifest {
  try {
    assertPathInsideCwd(cwd, sourceAttemptDir);
    const stat = statSync(sourceAttemptDir);
    if (!stat.isDirectory()) {
      throw new Error("attempt source is not a directory");
    }

    const requestPath = assertRegularImageSourceFile(cwd, sourceAttemptDir, "request.txt");
    const specPath = assertRegularImageSourceFile(cwd, sourceAttemptDir, "spec.json");
    const imagePath = assertRegularImageSourceFile(cwd, sourceAttemptDir, "image.png");
    const verdictPath = assertRegularImageSourceFile(cwd, sourceAttemptDir, "verdict.json");

    const requestText = readFileSync(requestPath, "utf8");
    if (requestText.trim().length === 0) {
      throw new Error("request.txt must not be empty");
    }

    const spec = parseImageSpec(JSON.parse(readFileSync(specPath, "utf8")));
    const verdict = parseJudgeVerdict(JSON.parse(readFileSync(verdictPath, "utf8")));
    validateImageVerdict(spec, verdict);
    validateImagePngDimensions(imagePath, spec);

    return manifestFromFiles({
      cwd,
      rootDir: sourceAttemptDir,
      artifactDir,
      jobId: job.id,
      attemptNumber: job.attempt_number,
      files: requiredImageFiles,
    });
  } catch (err) {
    if (err instanceof PromoteError) {
      throw err;
    }
    throw new PromoteError(
      "PUBLISH_SOURCE_MISSING",
      requiredSourceMissingMessage,
      job.id,
      err,
    );
  }
}

async function publishFreshImageDestination(options: {
  readonly db: DbClient;
  readonly cwd: string;
  readonly job: Job;
  readonly artifactDir: string;
  readonly sourceAttemptDir: string;
  readonly finalArtifactDir: string;
  readonly sourceManifest: PublishManifest;
  readonly now: () => number;
  readonly committer?: GitCommitter;
  readonly hooks?: PromoteJobHooks;
}): Promise<PromoteJobResult> {
  const stagingDir = imageStagingDirectory(options.cwd, options.job, options.now());
  let renamedFinal = false;
  try {
    stageBundle(options.cwd, options.sourceAttemptDir, stagingDir, options.sourceManifest.files);
    fsyncTreeBestEffort(stagingDir);
    fsyncDirectoryBestEffort(path.dirname(stagingDir));
    renameSync(stagingDir, options.finalArtifactDir);
    renamedFinal = true;

    const finalManifest = manifestFromDirectory(
      options.cwd,
      options.finalArtifactDir,
      options.artifactDir,
      options.job.id,
      options.job.attempt_number,
    );
    assertManifestEquivalent(options.sourceManifest, finalManifest);

    const context = hookContext(options, finalManifest);
    await options.hooks?.afterFinalRename?.(context);
    return commitImagePublishedState(options, finalManifest, true);
  } catch (err) {
    if (!renamedFinal) {
      removePathBestEffort(stagingDir);
    }
    if (err instanceof PromoteError) {
      throw err;
    }
    throw new PromoteError("PUBLISH_FAILED", "publish failed", options.job.id, err);
  }
}

async function publishFreshDestination(options: {
  readonly db: DbClient;
  readonly cwd: string;
  readonly job: Job;
  readonly artifactDir: string;
  readonly sourceAttemptDir: string;
  readonly finalArtifactDir: string;
  readonly sourceManifest: PublishManifest;
  readonly now: () => number;
  readonly committer?: GitCommitter;
  readonly hooks?: PromoteJobHooks;
}): Promise<PromoteJobResult> {
  const stagingDir = stagingDirectory(options.cwd, options.job, options.now());
  let renamedFinal = false;
  try {
    stageBundle(options.cwd, options.sourceAttemptDir, stagingDir, options.sourceManifest.files);
    fsyncTreeBestEffort(stagingDir);
    fsyncDirectoryBestEffort(path.dirname(stagingDir));
    renameSync(stagingDir, options.finalArtifactDir);
    renamedFinal = true;

    const finalManifest = manifestFromDirectory(
      options.cwd,
      options.finalArtifactDir,
      options.artifactDir,
      options.job.id,
      options.job.attempt_number,
    );
    assertManifestEquivalent(options.sourceManifest, finalManifest);

    const context = hookContext(options, finalManifest);
    await options.hooks?.afterFinalRename?.(context);
    const result = await commitPublishedState(options, finalManifest, true);
    await options.hooks?.afterDbCommit?.(context);
    return result;
  } catch (err) {
    if (!renamedFinal) {
      removePathBestEffort(stagingDir);
    }
    if (err instanceof PromoteError) {
      throw err;
    }
    throw new PromoteError("PUBLISH_FAILED", "publish failed", options.job.id, err);
  }
}

async function recoverExistingDestination(options: {
  readonly db: DbClient;
  readonly cwd: string;
  readonly job: Job;
  readonly artifactDir: string;
  readonly sourceAttemptDir: string;
  readonly finalArtifactDir: string;
  readonly sourceManifest: PublishManifest;
  readonly now: () => number;
  readonly committer?: GitCommitter;
  readonly hooks?: PromoteJobHooks;
}): Promise<PromoteJobResult> {
  const finalManifest = manifestFromDirectory(
    options.cwd,
    options.finalArtifactDir,
    options.artifactDir,
    options.job.id,
    options.job.attempt_number,
  );
  assertManifestEquivalent(options.sourceManifest, finalManifest);
  return commitPublishedState(options, finalManifest, true);
}

async function commitImagePublishedState(
  options: {
    readonly db: DbClient;
    readonly cwd: string;
    readonly job: Job;
    readonly artifactDir: string;
    readonly sourceAttemptDir: string;
    readonly finalArtifactDir: string;
    readonly now: () => number;
    readonly committer?: GitCommitter;
    readonly hooks?: PromoteJobHooks;
  },
  manifest: PublishManifest,
  cleanupFinalOnCasLoss: boolean,
): Promise<PromoteJobResult> {
  const context = hookContext(options, manifest);
  await options.hooks?.beforeDbCas?.(context);

  let transactionOpen = false;
  try {
    options.db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    const timestamp = options.now();
    const updated = casUpdateJob(
      options.db,
      options.job.id,
      {
        status: awaitingApprovalStatus,
        attemptNumber: options.job.attempt_number,
      },
      {
        status: publishedStatus,
        artifact_dir: options.artifactDir,
        updated_at: timestamp,
        error: null,
      },
    );

    if (updated.rowsAffected !== 1) {
      options.db.exec("ROLLBACK");
      transactionOpen = false;
      if (cleanupFinalOnCasLoss) {
        removeFinalUnlessPublishedAuthority({
          db: options.db,
          cwd: options.cwd,
          job: options.job,
          artifactDir: options.artifactDir,
          finalArtifactDir: options.finalArtifactDir,
        });
      }
      throw classifyApproveRaceLoss(options.db, options.job);
    }

    const existingPromoted = latestPromotedEvent(
      options.db,
      options.job.id,
      options.job.attempt_number,
    );
    if (existingPromoted === null) {
      insertEvent(options.db, {
        job_id: options.job.id,
        attempt_number: options.job.attempt_number,
        type: promotedEventType,
        payload: JSON.stringify({
          artifact_dir: options.artifactDir,
          publish_manifest: manifest,
        }),
        created_at: timestamp,
      });
    } else {
      const existingManifest = parsePromotedManifest(existingPromoted);
      if (!manifestsEqual(existingManifest, manifest)) {
        throw new PromoteError(
          "PUBLISH_ARTIFACT_DIVERGED",
          "existing promoted event manifest differs from destination",
          options.job.id,
        );
      }
    }

    options.db.exec("COMMIT");
    transactionOpen = false;
  } catch (err) {
    if (transactionOpen) {
      try {
        options.db.exec("ROLLBACK");
      } catch {
        // Preserve the original publish failure.
      }
    }
    if (err instanceof PromoteError) {
      throw err;
    }
    throw new PromoteError("PUBLISH_FAILED", "DB publish transaction failed", options.job.id, err);
  }

  await options.hooks?.afterDbCommit?.(context);
  const galleryUpdateFailed = await reconcileImageGalleryBestEffort({
    ...options,
    manifest,
  });

  let cleanupFailed: string | undefined;
  try {
    rmSync(options.sourceAttemptDir, { recursive: true, force: false });
  } catch (err) {
    cleanupFailed = formatError(err);
    try {
      insertEvent(options.db, {
        job_id: options.job.id,
        attempt_number: options.job.attempt_number,
        type: cleanupFailedEventType,
        payload: JSON.stringify({
          artifact_dir: options.artifactDir,
          publish_manifest: manifest,
          error: cleanupFailed,
        }),
        created_at: options.now(),
      });
    } catch (eventErr) {
      cleanupFailed = `${cleanupFailed}; cleanup_failed event write failed: ${formatError(eventErr)}`;
    }
  }

  const gitCommitFailed = await runBestEffortGitCommit(
    options,
    manifest,
    buildImageGitCommitPlan(options.job, options.artifactDir),
  );

  return {
    status: "published",
    jobId: options.job.id,
    attemptNumber: options.job.attempt_number,
    artifactDir: options.artifactDir,
    manifest,
    cleanupFailed,
    galleryUpdateFailed,
    gitCommitFailed,
  };
}

async function commitPublishedState(
  options: {
    readonly db: DbClient;
    readonly cwd: string;
    readonly job: Job;
    readonly artifactDir: string;
    readonly sourceAttemptDir: string;
    readonly finalArtifactDir: string;
    readonly now: () => number;
    readonly committer?: GitCommitter;
    readonly hooks?: PromoteJobHooks;
  },
  manifest: PublishManifest,
  cleanupFinalOnCasLoss: boolean,
): Promise<PromoteJobResult> {
  const context = hookContext(options, manifest);
  await options.hooks?.beforeDbCas?.(context);

  let transactionOpen = false;
  try {
    options.db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    const timestamp = options.now();
    const updated = casUpdateJob(
      options.db,
      options.job.id,
      {
        status: awaitingApprovalStatus,
        attemptNumber: options.job.attempt_number,
      },
      {
        status: publishedStatus,
        artifact_dir: options.artifactDir,
        updated_at: timestamp,
        error: null,
      },
    );

    if (updated.rowsAffected !== 1) {
      options.db.exec("ROLLBACK");
      transactionOpen = false;
      if (cleanupFinalOnCasLoss) {
        removeFinalUnlessPublishedAuthority({
          db: options.db,
          cwd: options.cwd,
          job: options.job,
          artifactDir: options.artifactDir,
          finalArtifactDir: options.finalArtifactDir,
        });
      }
      throw classifyApproveRaceLoss(options.db, options.job);
    }

    const existingPromoted = latestPromotedEvent(
      options.db,
      options.job.id,
      options.job.attempt_number,
    );
    if (existingPromoted === null) {
      insertEvent(options.db, {
        job_id: options.job.id,
        attempt_number: options.job.attempt_number,
        type: promotedEventType,
        payload: JSON.stringify({
          artifact_dir: options.artifactDir,
          publish_manifest: manifest,
        }),
        created_at: timestamp,
      });
    } else {
      const existingManifest = parsePromotedManifest(existingPromoted);
      if (!manifestsEqual(existingManifest, manifest)) {
        throw new PromoteError(
          "PUBLISH_ARTIFACT_DIVERGED",
          "existing promoted event manifest differs from destination",
          options.job.id,
        );
      }
    }

    options.db.exec("COMMIT");
    transactionOpen = false;
  } catch (err) {
    if (transactionOpen) {
      try {
        options.db.exec("ROLLBACK");
      } catch {
        // Preserve the original publish failure.
      }
    }
    if (err instanceof PromoteError) {
      throw err;
    }
    throw new PromoteError("PUBLISH_FAILED", "DB publish transaction failed", options.job.id, err);
  }

  let cleanupFailed: string | undefined;
  try {
    rmSync(options.sourceAttemptDir, { recursive: true, force: false });
  } catch (err) {
    cleanupFailed = formatError(err);
    try {
      insertEvent(options.db, {
        job_id: options.job.id,
        attempt_number: options.job.attempt_number,
        type: cleanupFailedEventType,
        payload: JSON.stringify({
          artifact_dir: options.artifactDir,
          publish_manifest: manifest,
          error: cleanupFailed,
        }),
        created_at: options.now(),
      });
    } catch (eventErr) {
      cleanupFailed = `${cleanupFailed}; cleanup_failed event write failed: ${formatError(eventErr)}`;
    }
  }

  const gitCommitFailed = await runBestEffortGitCommit(options, manifest);

  return {
    status: "published",
    jobId: options.job.id,
    attemptNumber: options.job.attempt_number,
    artifactDir: options.artifactDir,
    manifest,
    cleanupFailed,
    gitCommitFailed,
  };
}

function requirePublishedManifest(
  db: DbClient,
  cwd: string,
  job: Job,
  artifactDir: string,
  finalArtifactDir: string,
): PublishManifest {
  const event = latestPromotedEvent(db, job.id, job.attempt_number);
  if (event === null || job.artifact_dir !== artifactDir) {
    throw new PromoteError(
      "PUBLISH_ARTIFACT_DIVERGED",
      "published job is missing authoritative promoted manifest",
      job.id,
    );
  }
  const manifest = parsePromotedManifest(event);
  if (manifest.artifact_dir !== artifactDir) {
    throw new PromoteError(
      "PUBLISH_ARTIFACT_DIVERGED",
      "promoted manifest artifact_dir differs from job artifact_dir",
      job.id,
    );
  }
  const actualManifest = manifestFromDirectory(
    cwd,
    finalArtifactDir,
    artifactDir,
    job.id,
    job.attempt_number,
  );
  if (!manifestsEqual(manifest, actualManifest)) {
    throw new PromoteError(
      "PUBLISH_ARTIFACT_DIVERGED",
      "published artifact directory differs from promoted manifest",
      job.id,
    );
  }
  return manifest;
}

function removeFinalUnlessPublishedAuthority(options: {
  readonly db: DbClient;
  readonly cwd: string;
  readonly job: Job;
  readonly artifactDir: string;
  readonly finalArtifactDir: string;
}): void {
  if (
    hasPublishedAuthority(
      options.db,
      options.cwd,
      options.job,
      options.artifactDir,
      options.finalArtifactDir,
    )
  ) {
    return;
  }
  removePathBestEffort(options.finalArtifactDir);
}

function hasPublishedAuthority(
  db: DbClient,
  cwd: string,
  job: Job,
  artifactDir: string,
  finalArtifactDir: string,
): boolean {
  const current = findJobById(db, job.id);
  if (
    current === null ||
    current.status !== publishedStatus ||
    current.attempt_number !== job.attempt_number ||
    current.artifact_dir !== artifactDir
  ) {
    return false;
  }

  const event = latestPromotedEvent(db, job.id, job.attempt_number);
  if (event === null) {
    return false;
  }

  try {
    const manifest = parsePromotedManifest(event);
    if (
      manifest.artifact_dir !== artifactDir ||
      manifest.job_id !== job.id ||
      manifest.attempt_number !== job.attempt_number
    ) {
      return false;
    }
    const actualManifest = manifestFromDirectory(
      cwd,
      finalArtifactDir,
      artifactDir,
      job.id,
      job.attempt_number,
    );
    return manifestsEqual(manifest, actualManifest);
  } catch {
    return false;
  }
}

function latestPromotedEvent(
  db: DbClient,
  jobId: string,
  attemptNumber: number,
): Event | null {
  return (
    db
      .query<Event, [string, number, string]>(
        "SELECT * FROM events WHERE job_id = ? AND attempt_number = ? AND type = ? ORDER BY id DESC LIMIT 1",
      )
      .get(jobId, attemptNumber, promotedEventType) ?? null
  );
}

function parsePromotedManifest(event: Event): PublishManifest {
  try {
    const payload = JSON.parse(event.payload ?? "{}") as {
      publish_manifest?: PublishManifest;
    };
    if (!payload.publish_manifest) {
      throw new Error("missing publish_manifest");
    }
    return payload.publish_manifest;
  } catch (err) {
    throw new PromoteError(
      "PUBLISH_ARTIFACT_DIVERGED",
      "promoted event payload is not a valid publish manifest",
      event.job_id,
      err,
    );
  }
}

async function reconcileImageGalleryBestEffort(options: {
  readonly db: DbClient;
  readonly cwd: string;
  readonly job: Job;
  readonly artifactDir: string;
  readonly sourceAttemptDir: string;
  readonly finalArtifactDir: string;
  readonly manifest: PublishManifest;
  readonly now: () => number;
  readonly hooks?: PromoteJobHooks;
}): Promise<string | undefined> {
  try {
    assertSupportedImagePurpose(options.job);
    const current = findJobById(options.db, options.job.id);
    if (current === null) {
      throw new Error("published image job disappeared before gallery reconcile");
    }
    assertSupportedImagePurpose(current);
    await options.hooks?.beforeImageGalleryWrite?.(hookContext(options, options.manifest));
    const entry = buildReadmeImageGalleryEntry({
      cwd: options.cwd,
      job: current,
      manifest: options.manifest,
    });
    publishReadmeImageGallery({
      cwd: options.cwd,
      entry,
      purpose: current.purpose,
      jobPurposes: imageJobPurposeMap(options.db),
    });
    return undefined;
  } catch (err) {
    const diagnostic = formatError(err);
    try {
      insertEvent(options.db, {
        job_id: options.job.id,
        attempt_number: options.job.attempt_number,
        type: imageGalleryUpdateFailedEventType,
        payload: JSON.stringify({
          job_id: options.job.id,
          attempt_number: options.job.attempt_number,
          artifact_dir: options.artifactDir,
          error: diagnostic,
        }),
        created_at: options.now(),
      });
    } catch (eventErr) {
      return `${diagnostic}; image_gallery_update_failed event write failed: ${formatError(eventErr)}`;
    }
    return diagnostic;
  }
}

function imageJobPurposeMap(db: DbClient): Map<string, string | null> {
  const rows = db
    .query<Pick<Job, "id" | "purpose">, []>("SELECT id, purpose FROM jobs WHERE modality = 'image'")
    .all();
  return new Map(rows.map((row) => [row.id, row.purpose]));
}

async function runBestEffortGitCommit(
  options: {
    readonly db: DbClient;
    readonly job: Job;
    readonly artifactDir: string;
    readonly now: () => number;
    readonly committer?: GitCommitter;
  },
  manifest: PublishManifest,
  plan = buildGitCommitPlan(options.artifactDir, options.job.week_key),
): Promise<string | undefined> {
  if (options.committer === undefined) {
    return undefined;
  }

  try {
    await options.committer(plan);
    return undefined;
  } catch (err) {
    const diagnostic = formatError(err);
    insertEvent(options.db, {
      job_id: options.job.id,
      attempt_number: options.job.attempt_number,
      type: gitCommitFailedEventType,
      payload: JSON.stringify({
        artifact_dir: options.artifactDir,
        publish_manifest: manifest,
        error: diagnostic,
        plan,
      }),
      created_at: options.now(),
    });
    return diagnostic;
  }
}

function classifyApproveRaceLoss(db: DbClient, job: Job): PromoteError {
  const current = findJobById(db, job.id);
  if (current === null) {
    return new PromoteError("APPROVE_RACE_LOST", "approve race lost", job.id);
  }
  if (current.attempt_number !== job.attempt_number) {
    return new PromoteError("STALE_ATTEMPT", "approve attempt became stale", job.id);
  }
  if (current.status !== awaitingApprovalStatus) {
    return new PromoteError("STATUS_MISMATCH", "job status changed before approve commit", job.id);
  }
  return new PromoteError("APPROVE_RACE_LOST", "approve race lost", job.id);
}

function assertSupportedImagePurpose(job: Job): asserts job is Job & { purpose: "production" | "validation" } {
  if (job.purpose !== "production" && job.purpose !== "validation") {
    throw new PromoteError("PUBLISH_SOURCE_MISSING", "image job purpose must be production or validation", job.id);
  }
}

function assertRegularImageSourceFile(cwd: string, sourceAttemptDir: string, relativePath: string): string {
  const filePath = resolveUnderDirectory(cwd, sourceAttemptDir, relativePath);
  const fileStat = lstatSync(filePath);
  if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
    throw new Error(`required image source is not a regular file: ${relativePath}`);
  }
  return filePath;
}

function validateImageVerdict(spec: ImageSpec, verdict: JudgeVerdict): void {
  const expectedIds = spec.acceptanceCriteria.map((criterion) => criterion.id);
  const actualIds = verdict.criteria.map((criterion) => criterion.id);
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
    throw new Error("verdict criterion ids do not match spec acceptance criteria");
  }
  if (!verdict.overallPass) {
    throw new Error("judge verdict did not pass");
  }
}

function validateImagePngDimensions(imagePath: string, spec: ImageSpec): void {
  const header = readFileSync(imagePath).subarray(0, 24);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (header.length < 24 || !header.subarray(0, 8).equals(signature)) {
    throw new Error("image.png is not a PNG");
  }
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width !== spec.dimensions.w || height !== spec.dimensions.h) {
    throw new Error("image.png dimensions do not match spec.json");
  }
}

function stageBundle(
  cwd: string,
  sourceAttemptDir: string,
  stagingDir: string,
  files: readonly string[],
): void {
  mkdirSync(stagingDir, { recursive: false });
  for (const file of files) {
    const source = resolveUnderDirectory(cwd, sourceAttemptDir, file);
    const target = resolveUnderDirectory(cwd, stagingDir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
}

function bundleFilesForSource(cwd: string, sourceAttemptDir: string): string[] {
  const files = ["report.en.md"];
  if (existsSync(resolveUnderDirectory(cwd, sourceAttemptDir, "report.zh.md"))) {
    files.push("report.zh.md");
  }
  files.push("sources.json");
  for (const file of listFilesRecursive(cwd, resolveUnderDirectory(cwd, sourceAttemptDir, "research"))) {
    files.push(`research/${file}`);
  }
  const sourceMaterialDir = resolveUnderDirectory(cwd, sourceAttemptDir, sourceMaterialDirName);
  if (existsSync(sourceMaterialDir)) {
    for (const file of listFilesRecursive(cwd, sourceMaterialDir)) {
      files.push(`${sourceMaterialDirName}/${file}`);
    }
  }
  return files.sort();
}

function validateSourceMaterialManifest(
  cwd: string,
  job: Job,
  sourceAttemptDir: string,
): void {
  const sourceMaterialDir = resolveUnderDirectory(cwd, sourceAttemptDir, sourceMaterialDirName);
  if (!existsSync(sourceMaterialDir)) {
    return;
  }

  const sourceMaterialStat = lstatSync(sourceMaterialDir);
  if (sourceMaterialStat.isSymbolicLink() || !sourceMaterialStat.isDirectory()) {
    throw new Error("source-material is not a directory");
  }

  const manifestPath = assertRegularSourceMaterialFile(
    cwd,
    sourceAttemptDir,
    sourceMaterialManifestFile,
    sourceMaterialDirName,
  );
  const manifest = readSourceMaterialManifestJson(manifestPath);

  if (manifest.schemaVersion !== 1) {
    throw new Error("source-material manifest schemaVersion mismatch");
  }
  if (manifest.kind !== "research_source_material") {
    throw new Error("source-material manifest kind mismatch");
  }
  if (
    manifest.jobId !== job.id ||
    manifest.weekKey !== job.week_key ||
    manifest.attemptNumber !== job.attempt_number
  ) {
    throw new Error("source-material manifest identity mismatch");
  }

  if (typeof manifest.contextPath !== "string") {
    throw new Error("source-material manifest contextPath missing");
  }
  assertRegularSourceMaterialFile(cwd, sourceAttemptDir, manifest.contextPath, sourceMaterialDirName);
  assertRegularSourceMaterialFile(cwd, sourceAttemptDir, sourceMaterialContextFile, sourceMaterialDirName);

  const operatorSource = readPlainRecord(
    manifest.operatorSource,
    "source-material manifest operatorSource missing",
  );
  if (typeof operatorSource.present !== "boolean") {
    throw new Error("source-material manifest operatorSource.present invalid");
  }
  if (!Array.isArray(operatorSource.entries)) {
    throw new Error("source-material manifest operatorSource.entries invalid");
  }
  for (const entryPath of operatorSource.entries) {
    if (typeof entryPath !== "string") {
      throw new Error("source-material manifest operatorSource.entries invalid");
    }
    assertRegularSourceMaterialFile(cwd, sourceAttemptDir, entryPath, sourceMaterialOperatorDir);
  }

  if (!Array.isArray(manifest.entries)) {
    throw new Error("source-material manifest entries invalid");
  }
  for (const entry of manifest.entries) {
    const record = readPlainRecord(entry, "source-material manifest entry invalid");
    if (record.kind !== "operator_source") {
      continue;
    }
    if (typeof record.localPath !== "string") {
      throw new Error("source-material manifest operator_source localPath invalid");
    }
    if (typeof record.sha256 !== "string" || !lowercaseSha256Pattern.test(record.sha256)) {
      throw new Error("source-material manifest operator_source sha256 invalid");
    }
    const filePath = assertRegularSourceMaterialFile(
      cwd,
      sourceAttemptDir,
      record.localPath,
      sourceMaterialOperatorDir,
    );
    const actualSha = createHash("sha256").update(readFileSync(filePath)).digest("hex");
    if (actualSha !== record.sha256) {
      throw new Error("source-material manifest operator_source sha256 mismatch");
    }
  }
}

function readSourceMaterialManifestJson(manifestPath: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  return readPlainRecord(parsed, "source-material manifest invalid");
}

function readPlainRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function assertRegularSourceMaterialFile(
  cwd: string,
  sourceAttemptDir: string,
  relativePath: string,
  requiredRoot: string,
): string {
  if (!isSafeBundleRelativePath(relativePath) || !isPathInsidePosix(requiredRoot, relativePath)) {
    throw new Error(`unsafe source-material path: ${relativePath}`);
  }
  const filePath = resolveUnderDirectory(cwd, sourceAttemptDir, relativePath);
  const fileStat = lstatSync(filePath);
  if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
    throw new Error(`source-material file is not a regular file: ${relativePath}`);
  }
  return filePath;
}

function isSafeBundleRelativePath(value: string): boolean {
  if (
    value.length === 0 ||
    path.posix.isAbsolute(value) ||
    value.includes("\\") ||
    value.includes("://") ||
    /[\r\n\t]/.test(value)
  ) {
    return false;
  }
  const segments = value.split("/");
  return !segments.some((segment) => segment.length === 0 || segment === "." || segment === "..");
}

function isPathInsidePosix(root: string, candidate: string): boolean {
  const relative = path.posix.relative(root, candidate);
  return relative !== "" && !relative.startsWith("../") && relative !== "..";
}

function manifestFromDirectory(
  cwd: string,
  rootDir: string,
  artifactDir: string,
  jobId: string,
  attemptNumber: number,
): PublishManifest {
  return manifestFromFiles({
    cwd,
    rootDir,
    artifactDir,
    jobId,
    attemptNumber,
    files: listFilesRecursive(cwd, rootDir),
  });
}

function manifestFromFiles(params: {
  readonly cwd: string;
  readonly rootDir: string;
  readonly artifactDir: string;
  readonly jobId: string;
  readonly attemptNumber: number;
  readonly files: readonly string[];
}): PublishManifest {
  const files = [...params.files].sort();
  const sha256: Record<string, string> = {};
  for (const file of files) {
    const filePath = resolveUnderDirectory(params.cwd, params.rootDir, file);
    sha256[file] = createHash("sha256").update(readFileSync(filePath)).digest("hex");
  }
  const aggregateInput = JSON.stringify(files.map((file) => [file, sha256[file]]));
  return {
    artifact_dir: params.artifactDir,
    job_id: params.jobId,
    attempt_number: params.attemptNumber,
    files,
    sha256,
    aggregate_sha256: createHash("sha256").update(aggregateInput).digest("hex"),
  };
}

function assertManifestEquivalent(expected: PublishManifest, actual: PublishManifest): void {
  if (!manifestsEqual(expected, actual)) {
    throw new PromoteError(
      "PUBLISH_ARTIFACT_DIVERGED",
      "publish artifact checksum diverged",
      expected.job_id,
    );
  }
}

function manifestsEqual(a: PublishManifest, b: PublishManifest): boolean {
  return (
    a.artifact_dir === b.artifact_dir &&
    a.job_id === b.job_id &&
    a.attempt_number === b.attempt_number &&
    a.aggregate_sha256 === b.aggregate_sha256 &&
    JSON.stringify(a.files) === JSON.stringify(b.files) &&
    JSON.stringify(a.sha256) === JSON.stringify(b.sha256)
  );
}

function assertRequiredFile(cwd: string, rootDir: string, relativePath: string): string {
  const filePath = resolveUnderDirectory(cwd, rootDir, relativePath);
  if (!statSync(filePath).isFile()) {
    throw new Error(`required file is not a file: ${relativePath}`);
  }
  return filePath;
}

function listFilesRecursive(cwd: string, rootDir: string): string[] {
  assertPathInsideCwd(cwd, rootDir);
  const result: string[] = [];
  const walk = (currentDir: string, prefix: string): void => {
    for (const entry of readdirSync(currentDir).sort()) {
      const fullPath = path.resolve(currentDir, entry);
      assertPathInsideCwd(cwd, fullPath);
      const stat = lstatSync(fullPath);
      const relative = prefix.length === 0 ? entry : `${prefix}/${entry}`;
      if (stat.isDirectory()) {
        walk(fullPath, relative);
      } else if (stat.isFile()) {
        result.push(relative);
      }
    }
  };
  walk(rootDir, "");
  return result.sort();
}

function stagingDirectory(cwd: string, job: Job, now: number): string {
  const reportsDir = resolveUnderCwd(cwd, "reports");
  mkdirSync(reportsDir, { recursive: true });
  for (let index = 0; index < 100; index += 1) {
    const candidate = path.resolve(
      reportsDir,
      `.publish-${job.id}-attempt-${job.attempt_number}-${now}-${index}`,
    );
    assertPathInsideCwd(cwd, candidate);
    if (!existsSync(candidate)) {
      return candidate;
    }
  }
  throw new PromoteError("PUBLISH_FAILED", "could not allocate publish staging directory", job.id);
}

function imageStagingDirectory(cwd: string, job: Job, now: number): string {
  const imagesDir = resolveUnderCwd(cwd, "images");
  mkdirSync(imagesDir, { recursive: true });
  for (let index = 0; index < 100; index += 1) {
    const candidate = path.resolve(
      imagesDir,
      `.publish-${job.id}-attempt-${job.attempt_number}-${now}-${index}`,
    );
    assertPathInsideCwd(cwd, candidate);
    if (!existsSync(candidate)) {
      return candidate;
    }
  }
  throw new PromoteError("PUBLISH_FAILED", "could not allocate image publish staging directory", job.id);
}

function fsyncTreeBestEffort(rootDir: string): void {
  const walk = (currentDir: string): void => {
    for (const entry of readdirSync(currentDir)) {
      const fullPath = path.resolve(currentDir, entry);
      const stat = lstatSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
        fsyncDirectoryBestEffort(fullPath);
      } else if (stat.isFile()) {
        fsyncFileBestEffort(fullPath);
      }
    }
  };
  walk(rootDir);
  fsyncDirectoryBestEffort(rootDir);
}

function fsyncFileBestEffort(filePath: string): void {
  let fd: number | undefined;
  try {
    fd = openSync(filePath, "r");
    fsyncSync(fd);
  } catch {
    // Some filesystems in smoke environments do not support fsync; publish remains best effort.
  } finally {
    if (fd !== undefined) {
      closeSync(fd);
    }
  }
}

function fsyncDirectoryBestEffort(dirPath: string): void {
  let fd: number | undefined;
  try {
    fd = openSync(dirPath, "r");
    fsyncSync(fd);
  } catch {
    // Directory fsync is not supported on every platform.
  } finally {
    if (fd !== undefined) {
      closeSync(fd);
    }
  }
}

function hookContext(
  options: {
    readonly job: Job;
    readonly artifactDir: string;
    readonly sourceAttemptDir: string;
    readonly finalArtifactDir: string;
  },
  manifest: PublishManifest,
): PromoteHookContext {
  return {
    job: options.job,
    artifactDir: options.artifactDir,
    sourceAttemptDir: options.sourceAttemptDir,
    finalArtifactDir: options.finalArtifactDir,
    manifest,
  };
}

function resolveUnderCwd(cwd: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new PromoteError("PUBLISH_FAILED", "absolute paths are not allowed");
  }
  const resolved = path.resolve(cwd, relativePath);
  assertPathInsideCwd(cwd, resolved);
  return resolved;
}

function resolveUnderDirectory(cwd: string, rootDir: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new PromoteError("PUBLISH_FAILED", "absolute bundle paths are not allowed");
  }
  const resolved = path.resolve(rootDir, relativePath);
  assertPathInsideCwd(cwd, resolved);
  if (!isInside(rootDir, resolved)) {
    throw new PromoteError("PUBLISH_FAILED", "bundle path escapes its root directory");
  }
  return resolved;
}

function assertPathInsideCwd(cwd: string, candidate: string): void {
  if (!isInside(cwd, candidate)) {
    throw new PromoteError("PUBLISH_FAILED", "path escapes cwd boundary");
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function removePathBestEffort(target: string): void {
  try {
    rmSync(target, { recursive: true, force: true });
  } catch {
    // A later approve retry will detect divergence or recover from the remaining directory.
  }
}

function formatError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
