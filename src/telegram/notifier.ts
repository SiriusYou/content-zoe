import {
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";

import {
  casUpdateJob,
  findJobById,
  insertEvent,
  type DbClient,
  type Job,
} from "../db.ts";
import { parseImageSpec, type ImageSpec } from "../pipeline/image/spec.ts";
import {
  parseJudgeVerdict,
  type JudgeVerdict,
} from "../pipeline/image/verdict.ts";

export const NOTIFIER_RETRY_DELAYS_MS = [1000, 5000, 30000] as const;
export const NOTIFY_LIMIT_DEFAULT = 10;

export interface ApprovalNotification {
  jobId: string;
  attemptNumber: number;
  approvalSummary: string;
  text: string;
  imageAbsolutePath?: string;
  caption?: string;
}

export type ApprovalNotificationSender = (
  notification: ApprovalNotification,
) => Promise<void> | void;

export type NotifierClock = () => number;

export type NotifierSleep = (delayMs: number) => Promise<void> | void;

export interface NotifyPendingApprovalsOptions {
  db: DbClient;
  sender: ApprovalNotificationSender;
  now: NotifierClock;
  sleep: NotifierSleep;
  cwd?: string;
  limit?: number;
  retryDelaysMs?: readonly number[];
}

export interface NotifyPendingApprovalsResult {
  selected: number;
  sent: number;
  failed: number;
  malformed: number;
  abandoned: number;
  senderCalls: number;
}

export interface FormatApprovalNotificationInput {
  jobId: string;
  attemptNumber: number;
  approvalSummary: string;
}

const AWAITING_APPROVAL = "awaiting_approval";
const NOTIFIED_EVENT = "notified";
const NOTIFY_FAILED_EVENT = "notify_failed";
const MISSING_SUMMARY_ERROR = "approval_summary is required for approval notification";
const IMAGE_PREVIEW_UNAVAILABLE =
  "IMAGE PREVIEW UNAVAILABLE - inspect locally before approving.";
const PHOTO_CAPTION_LIMIT = 1024;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function formatApprovalNotification(
  input: FormatApprovalNotificationInput,
): string {
  return [
    `Approval needed for job ${input.jobId}`,
    `Attempt: ${input.attemptNumber}`,
    "",
    input.approvalSummary,
    "",
    `Approve: /approve ${input.jobId} ${input.attemptNumber}`,
    `Reject: /reject ${input.jobId} ${input.attemptNumber} <scope>:<type> <reason>`,
  ].join("\n");
}

export async function notifyPendingApprovals(
  options: NotifyPendingApprovalsOptions,
): Promise<NotifyPendingApprovalsResult> {
  const retryDelaysMs = options.retryDelaysMs ?? NOTIFIER_RETRY_DELAYS_MS;
  const limit = normalizeLimit(options.limit ?? NOTIFY_LIMIT_DEFAULT);
  const result: NotifyPendingApprovalsResult = {
    selected: 0,
    sent: 0,
    failed: 0,
    malformed: 0,
    abandoned: 0,
    senderCalls: 0,
  };

  if (limit === 0) {
    return result;
  }

  const jobs = selectPendingApprovalJobs(options.db, limit);
  result.selected = jobs.length;

  for (const job of jobs) {
    const summary = normalizeSummary(job.approval_summary);
    if (summary === null) {
      const recorded = recordNotifyFailure(options.db, {
        job,
        now: options.now,
        errorMessage: MISSING_SUMMARY_ERROR,
      });
      if (recorded) {
        result.failed += 1;
        result.malformed += 1;
      } else {
        result.abandoned += 1;
      }
      continue;
    }

    let notification: ApprovalNotification;
    try {
      notification = buildApprovalNotification(options, job, summary);
    } catch (err) {
      const recorded = recordNotifyFailure(options.db, {
        job,
        now: options.now,
        errorMessage: readableError(err),
      });
      if (recorded) {
        result.failed += 1;
        result.malformed += 1;
      } else {
        result.abandoned += 1;
      }
      continue;
    }

    const outcome = await sendWithRetry(options, job, notification, retryDelaysMs);
    result.senderCalls += outcome.senderCalls;
    if (outcome.status === "sent") {
      result.sent += 1;
    } else if (outcome.status === "failed") {
      result.failed += 1;
    } else {
      result.abandoned += 1;
    }
  }

  return result;
}

function selectPendingApprovalJobs(db: DbClient, limit: number): Job[] {
  return db
    .query<Job, [string, number]>(
      `
        SELECT *
        FROM jobs
        WHERE status = ? AND notified_at IS NULL
        ORDER BY updated_at ASC, id ASC
        LIMIT ?
      `,
    )
    .all(AWAITING_APPROVAL, limit);
}

function buildApprovalNotification(
  options: NotifyPendingApprovalsOptions,
  job: Job,
  summary: string,
): ApprovalNotification {
  if (job.modality !== "image") {
    return {
      jobId: job.id,
      attemptNumber: job.attempt_number,
      approvalSummary: summary,
      text: formatApprovalNotification({
        jobId: job.id,
        attemptNumber: job.attempt_number,
        approvalSummary: summary,
      }),
    };
  }

  const attempt = loadSafeImageAttempt({
    cwd: options.cwd ?? process.cwd(),
    jobId: job.id,
    attemptNumber: job.attempt_number,
    runDir: job.run_dir,
  });
  const caption = formatImageApprovalCaption({
    job,
    spec: attempt.spec,
    verdict: attempt.verdict,
  });

  return {
    jobId: job.id,
    attemptNumber: job.attempt_number,
    approvalSummary: summary,
    text: formatImagePreviewUnavailableText({
      job,
      spec: attempt.spec,
      verdict: attempt.verdict,
    }),
    imageAbsolutePath: attempt.imagePath,
    caption,
  };
}

interface SafeImageAttempt {
  readonly imagePath: string;
  readonly spec: ImageSpec;
  readonly verdict: JudgeVerdict;
}

function loadSafeImageAttempt(args: {
  cwd: string;
  jobId: string;
  attemptNumber: number;
  runDir: string | null;
}): SafeImageAttempt {
  const cwdReal = realpathSync(args.cwd);
  const safeRunRoot = path.resolve(cwdReal, ".runs", args.jobId);
  const runDir = normalizeRunDir(args.runDir, args.jobId);
  const storedRunRoot = path.resolve(cwdReal, runDir);
  const expectedRunRootReal = realpathContained(
    safeRunRoot,
    cwdReal,
    `run root for ${args.jobId}`,
  );
  const storedRunRootReal = realpathContained(
    storedRunRoot,
    expectedRunRootReal,
    `stored run_dir for ${args.jobId}`,
  );

  if (storedRunRootReal !== expectedRunRootReal) {
    throw new Error("image notification run_dir does not match job run root");
  }

  const attemptDir = path.resolve(
    expectedRunRootReal,
    `attempt-${args.attemptNumber}`,
  );
  const attemptDirReal = realpathContained(
    attemptDir,
    expectedRunRootReal,
    `attempt directory for ${args.jobId}`,
  );
  if (attemptDirReal !== attemptDir) {
    throw new Error("image notification attempt directory resolved unexpectedly");
  }

  const imagePath = validateAttemptFile({
    attemptDirReal,
    filename: "image.png",
    jobId: args.jobId,
  });
  const dimensions = parsePngDimensions(imagePath);
  if (dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error("image.png has invalid IHDR dimensions");
  }

  const specPath = validateAttemptFile({
    attemptDirReal,
    filename: "spec.json",
    jobId: args.jobId,
  });
  const verdictPath = validateAttemptFile({
    attemptDirReal,
    filename: "verdict.json",
    jobId: args.jobId,
  });

  return {
    imagePath,
    spec: parseImageSpec(readJsonFile(specPath, "spec.json")),
    verdict: parseJudgeVerdict(readJsonFile(verdictPath, "verdict.json")),
  };
}

function normalizeRunDir(runDir: string | null, jobId: string): string {
  if (runDir === null || runDir.trim().length === 0) {
    throw new Error("image notification run_dir is required");
  }
  if (path.isAbsolute(runDir)) {
    throw new Error("image notification run_dir must be relative");
  }

  const normalized = path.normalize(runDir);
  if (
    normalized !== runDir ||
    normalized === "." ||
    normalized.split(path.sep).includes("..")
  ) {
    throw new Error("image notification run_dir must be normalized and parent-free");
  }

  const expected = path.join(".runs", jobId);
  if (normalized !== expected) {
    throw new Error("image notification run_dir must be rooted under its job");
  }

  return normalized;
}

function validateAttemptFile(args: {
  attemptDirReal: string;
  filename: string;
  jobId: string;
}): string {
  const candidate = path.resolve(args.attemptDirReal, args.filename);
  const lstat = lstatSync(candidate);
  if (lstat.isSymbolicLink()) {
    throw new Error(`${args.filename} must not be a symlink`);
  }
  const stat = statSync(candidate);
  if (!stat.isFile()) {
    throw new Error(`${args.filename} must be a regular file`);
  }
  return realpathContained(
    candidate,
    args.attemptDirReal,
    `${args.filename} for ${args.jobId}`,
  );
}

function realpathContained(
  candidate: string,
  root: string,
  label: string,
): string {
  const candidateReal = realpathSync(candidate);
  if (!isPathContained(candidateReal, root)) {
    throw new Error(`${label} escapes expected run boundary`);
  }
  return candidateReal;
}

function isPathContained(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function parsePngDimensions(imagePath: string): {
  readonly width: number;
  readonly height: number;
} {
  const header = readFileSync(imagePath).subarray(0, 33);
  if (header.length < 33 || !header.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("image.png is not a PNG");
  }
  if (header.readUInt32BE(8) !== 13 || header.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("image.png lacks parseable IHDR dimensions");
  }
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width <= 0 || height <= 0) {
    throw new Error("image.png has invalid IHDR dimensions");
  }
  return { width, height };
}

function readJsonFile(filePath: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new Error(`${label} is not parseable JSON: ${readableError(err)}`);
  }
}

function formatImageApprovalCaption(input: {
  job: Job;
  spec: ImageSpec;
  verdict: JudgeVerdict;
}): string {
  const passed = input.verdict.criteria.filter((criterion) => criterion.pass).length;
  const total = input.verdict.criteria.length;
  const tail = [
    `Verdict: ${input.verdict.overallPass ? "PASS" : "FAIL"}`,
    `Criteria: ${passed}/${total} pass`,
    `Approve: /approve ${input.job.id} ${input.job.attempt_number}`,
    `Reject: /reject ${input.job.id} ${input.job.attempt_number} image:<subject_off|style_off|composition_off|safety> <reason>`,
  ].join("\n");
  return truncatePrefixPreservingTail(`Subject: ${input.spec.subject}`, tail);
}

function formatImagePreviewUnavailableText(input: {
  job: Job;
  spec: ImageSpec;
  verdict: JudgeVerdict;
}): string {
  const passed = input.verdict.criteria.filter((criterion) => criterion.pass).length;
  const total = input.verdict.criteria.length;
  return [
    IMAGE_PREVIEW_UNAVAILABLE,
    `Job: ${input.job.id}`,
    `Attempt: ${input.job.attempt_number}`,
    `Subject: ${input.spec.subject}`,
    `Verdict: ${input.verdict.overallPass ? "PASS" : "FAIL"}`,
    `Criteria: ${passed}/${total} pass`,
    "",
    `Inspect image: bun run content:image-show ${input.job.id} --artifact image`,
    `Inspect verdict: bun run content:image-show ${input.job.id} --artifact verdict`,
    `Approve: /approve ${input.job.id} ${input.job.attempt_number}`,
    `Reject: /reject ${input.job.id} ${input.job.attempt_number} image:<subject_off|style_off|composition_off|safety> <reason>`,
  ].join("\n");
}

function truncatePrefixPreservingTail(prefix: string, tail: string): string {
  if (tail.length + 1 > PHOTO_CAPTION_LIMIT) {
    throw new Error("image approval command hints exceed Telegram caption limit");
  }

  const full = `${prefix}\n${tail}`;
  if (full.length <= PHOTO_CAPTION_LIMIT) {
    return full;
  }

  const ellipsis = "...";
  const maxPrefixLength = PHOTO_CAPTION_LIMIT - tail.length - 1;
  const truncatedPrefix =
    maxPrefixLength <= ellipsis.length
      ? prefix.slice(0, maxPrefixLength)
      : `${prefix.slice(0, maxPrefixLength - ellipsis.length)}${ellipsis}`;
  return `${truncatedPrefix}\n${tail}`;
}

async function sendWithRetry(
  options: NotifyPendingApprovalsOptions,
  job: Job,
  notification: ApprovalNotification,
  retryDelaysMs: readonly number[],
): Promise<{ status: "sent" | "failed" | "abandoned"; senderCalls: number }> {
  let lastError: unknown;
  let senderCalls = 0;

  for (let attemptIndex = 0; attemptIndex <= retryDelaysMs.length; attemptIndex += 1) {
    try {
      senderCalls += 1;
      await options.sender(notification);

      const recorded = recordNotified(options.db, job, options.now);
      return {
        status: recorded ? "sent" : "abandoned",
        senderCalls,
      };
    } catch (err) {
      lastError = err;
    }

    const retryDelay = retryDelaysMs[attemptIndex];
    if (retryDelay === undefined) {
      break;
    }

    await options.sleep(retryDelay);
    if (!isStillAwaitingSameAttempt(options.db, job)) {
      return { status: "abandoned", senderCalls };
    }
  }

  const recorded = recordNotifyFailure(options.db, {
    job,
    now: options.now,
    errorMessage: readableError(lastError),
  });
  return {
    status: recorded ? "failed" : "abandoned",
    senderCalls,
  };
}

function recordNotified(
  db: DbClient,
  job: Job,
  now: NotifierClock,
): boolean {
  const timestamp = now();
  const updated = casUpdateJob(
    db,
    job.id,
    { status: AWAITING_APPROVAL, attemptNumber: job.attempt_number },
    {
      notified_at: timestamp,
      last_notify_error: null,
      updated_at: timestamp,
    },
  );

  if (updated.rowsAffected !== 1) {
    return false;
  }

  insertEvent(db, {
    job_id: job.id,
    attempt_number: job.attempt_number,
    type: NOTIFIED_EVENT,
    payload: JSON.stringify({ notified_at: timestamp }),
    created_at: timestamp,
  });
  return true;
}

function recordNotifyFailure(
  db: DbClient,
  args: {
    job: Job;
    now: NotifierClock;
    errorMessage: string;
  },
): boolean {
  const timestamp = args.now();
  const updated = casUpdateJob(
    db,
    args.job.id,
    { status: AWAITING_APPROVAL, attemptNumber: args.job.attempt_number },
    {
      last_notify_error: args.errorMessage,
      updated_at: timestamp,
    },
  );

  if (updated.rowsAffected !== 1) {
    return false;
  }

  insertEvent(db, {
    job_id: args.job.id,
    attempt_number: args.job.attempt_number,
    type: NOTIFY_FAILED_EVENT,
    payload: JSON.stringify({ error: args.errorMessage }),
    created_at: timestamp,
  });
  return true;
}

function isStillAwaitingSameAttempt(db: DbClient, job: Job): boolean {
  const current = findJobById(db, job.id);
  return (
    current !== null &&
    current.status === AWAITING_APPROVAL &&
    current.attempt_number === job.attempt_number
  );
}

function normalizeSummary(summary: string | null): string | null {
  if (summary === null) {
    return null;
  }
  const trimmed = summary.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return 0;
  }
  return Math.floor(limit);
}

function readableError(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message.trim();
  }
  return String(err);
}
