import {
  casUpdateJob,
  findJobById,
  insertEvent,
  type DbClient,
  type Job,
} from "../db.ts";

export const NOTIFIER_RETRY_DELAYS_MS = [1000, 5000, 30000] as const;
export const NOTIFY_LIMIT_DEFAULT = 10;

export interface ApprovalNotification {
  jobId: string;
  attemptNumber: number;
  approvalSummary: string;
  text: string;
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

    const notification: ApprovalNotification = {
      jobId: job.id,
      attemptNumber: job.attempt_number,
      approvalSummary: summary,
      text: formatApprovalNotification({
        jobId: job.id,
        attemptNumber: job.attempt_number,
        approvalSummary: summary,
      }),
    };

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
