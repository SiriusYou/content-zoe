import {
  casUpdateJob,
  findJobById,
  insertEvent,
  type DbClient,
  type Job,
} from "../db.ts";

export const REJECT_COMMAND = "reject";
export const REJECT_REASON_MAX_CHARS = 500;

export type RejectScope = "en" | "zh" | "bundle";
export type RejectType =
  | "factual_error"
  | "voice_off"
  | "structure"
  | "length_wrong"
  | "translation_off"
  | "other";

export type RejectCommandErrorCode =
  | "INVALID_COMMAND"
  | "INVALID_SCOPE_TYPE_COMBO"
  | "REASON_TOO_LONG"
  | "UNKNOWN_JOB"
  | "STALE_ATTEMPT"
  | "STATUS_MISMATCH"
  | "REJECT_RACE_LOST";

export interface ParsedRejectCommand {
  readonly jobId: string;
  readonly attemptNumber: number;
  readonly scope: RejectScope;
  readonly rejectType: RejectType;
  readonly reason: string | null;
}

export interface ParseRejectCommandSuccess {
  readonly ok: true;
  readonly command: ParsedRejectCommand;
}

export interface ParseRejectCommandFailure {
  readonly ok: false;
  readonly code: Extract<
    RejectCommandErrorCode,
    "INVALID_COMMAND" | "INVALID_SCOPE_TYPE_COMBO" | "REASON_TOO_LONG"
  >;
  readonly jobId?: string;
}

export type ParseRejectCommandResult =
  | ParseRejectCommandSuccess
  | ParseRejectCommandFailure;

export interface RejectCommandDependencies {
  readonly db: DbClient;
  readonly text: string;
  readonly chatId: number;
  readonly operatorChatIds: readonly number[];
  readonly now: () => number;
  readonly reply: (text: string) => Promise<void> | void;
  readonly beforeCas?: (job: Job, command: ParsedRejectCommand) => Promise<void> | void;
}

export interface RejectCommandResult {
  readonly status:
    | "rejected"
    | "error"
    | "unauthorized_audited"
    | "unauthorized_ignored";
  readonly code?: RejectCommandErrorCode;
  readonly replyText?: string;
}

const awaitingApprovalStatus = "awaiting_approval";
const queuedStatus = "queued";
const rejectedEventType = "rejected";
const unauthorizedEventType = "unauthorized";
const rejectCommandPattern = /^\/reject(?:@\w+)?(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+([\s\S]*))?$/;
const positiveIntegerPattern = /^\d+$/;
const rejectScopes = ["en", "zh", "bundle"] as const;
const rejectTypes = [
  "factual_error",
  "voice_off",
  "structure",
  "length_wrong",
  "translation_off",
  "other",
] as const;

const validScopeTypes: Readonly<Record<RejectType, readonly RejectScope[]>> = {
  factual_error: ["en", "bundle"],
  voice_off: ["en", "zh", "bundle"],
  structure: ["en", "zh", "bundle"],
  length_wrong: ["en", "zh", "bundle"],
  translation_off: ["zh"],
  other: ["en", "zh", "bundle"],
};

export function parseRejectCommand(text: string): ParseRejectCommandResult {
  const match = rejectCommandPattern.exec(text.trim());
  if (!match) {
    return { ok: false, code: "INVALID_COMMAND" };
  }

  const [, jobId, attemptToken, scopeTypeToken, rawReason] = match;
  if (jobId === undefined) {
    return { ok: false, code: "INVALID_COMMAND" };
  }

  if (
    attemptToken === undefined ||
    scopeTypeToken === undefined ||
    !positiveIntegerPattern.test(attemptToken)
  ) {
    return { ok: false, code: "INVALID_COMMAND", jobId };
  }

  const attemptNumber = Number(attemptToken);
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1) {
    return { ok: false, code: "INVALID_COMMAND", jobId };
  }

  const [rawScope, rawRejectType, ...extra] = scopeTypeToken.split(":");
  if (
    rawScope === undefined ||
    rawRejectType === undefined ||
    rawScope.length === 0 ||
    rawRejectType.length === 0 ||
    extra.length > 0 ||
    !isRejectScope(rawScope) ||
    !isRejectType(rawRejectType)
  ) {
    return { ok: false, code: "INVALID_COMMAND", jobId };
  }

  if (!isValidRejectScopeType(rawScope, rawRejectType)) {
    return { ok: false, code: "INVALID_SCOPE_TYPE_COMBO", jobId };
  }

  const reason = rawReason?.trim() ?? "";
  if (reason.length > REJECT_REASON_MAX_CHARS) {
    return { ok: false, code: "REASON_TOO_LONG", jobId };
  }

  return {
    ok: true,
    command: {
      jobId,
      attemptNumber,
      scope: rawScope,
      rejectType: rawRejectType,
      reason: reason.length === 0 ? null : reason,
    },
  };
}

export function isValidRejectScopeType(
  scope: RejectScope,
  rejectType: RejectType,
): boolean {
  return validScopeTypes[rejectType].includes(scope);
}

export async function handleRejectCommand(
  dependencies: RejectCommandDependencies,
): Promise<RejectCommandResult> {
  const parsed = parseRejectCommand(dependencies.text);
  const authorized = isAllowedChatId(
    dependencies.operatorChatIds,
    dependencies.chatId,
  );

  if (!parsed.ok) {
    if (authorized) {
      return replyWithError(dependencies, parsed.code, parsed.jobId);
    }
    return { status: "unauthorized_ignored" };
  }

  if (!authorized) {
    const job = findJobById(dependencies.db, parsed.command.jobId);
    if (job === null) {
      return { status: "unauthorized_ignored" };
    }

    insertEvent(dependencies.db, {
      job_id: job.id,
      attempt_number: job.attempt_number,
      type: unauthorizedEventType,
      payload: JSON.stringify({
        command: REJECT_COMMAND,
        chat_id: dependencies.chatId,
      }),
      created_at: dependencies.now(),
    });
    return { status: "unauthorized_audited" };
  }

  const job = findJobById(dependencies.db, parsed.command.jobId);
  if (job === null) {
    return replyWithError(dependencies, "UNKNOWN_JOB", parsed.command.jobId);
  }

  const preconditionError = rejectPreconditionError(job, parsed.command);
  if (preconditionError !== null) {
    return replyWithError(dependencies, preconditionError, parsed.command.jobId);
  }

  await dependencies.beforeCas?.(job, parsed.command);

  return rejectWithTransaction(dependencies, job, parsed.command);
}

async function rejectWithTransaction(
  dependencies: RejectCommandDependencies,
  job: Job,
  command: ParsedRejectCommand,
): Promise<RejectCommandResult> {
  let transactionOpen = false;
  try {
    dependencies.db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;

    const timestamp = dependencies.now();
    insertEvent(dependencies.db, {
      job_id: command.jobId,
      attempt_number: command.attemptNumber,
      type: rejectedEventType,
      payload: JSON.stringify({
        scope: command.scope,
        type: command.rejectType,
        reason: command.reason,
      }),
      created_at: timestamp,
    });

    const updated = casUpdateJob(
      dependencies.db,
      command.jobId,
      {
        status: awaitingApprovalStatus,
        attemptNumber: command.attemptNumber,
      },
      {
        attempt_number: command.attemptNumber + 1,
        status: queuedStatus,
        current_stage: rewindStageForScope(command.scope),
        reject_scope: command.scope,
        reject_type: command.rejectType,
        reject_reason: command.reason,
        notified_at: null,
        last_notify_error: null,
        approval_summary: null,
        error: null,
        updated_at: timestamp,
      },
    );

    if (updated.rowsAffected !== 1) {
      dependencies.db.exec("ROLLBACK");
      transactionOpen = false;
      const code = classifyRaceLoss(dependencies.db, command);
      return replyWithError(dependencies, code, command.jobId);
    }

    dependencies.db.exec("COMMIT");
    transactionOpen = false;

    const replyText = rejectSuccessReply(command);
    await dependencies.reply(replyText);
    return { status: "rejected", replyText };
  } catch (err) {
    if (transactionOpen) {
      try {
        dependencies.db.exec("ROLLBACK");
      } catch {
        // Preserve the original command failure.
      }
    }
    throw err;
  }
}

function rejectPreconditionError(
  job: Job,
  command: ParsedRejectCommand,
): RejectCommandErrorCode | null {
  if (job.attempt_number !== command.attemptNumber) {
    return "STALE_ATTEMPT";
  }
  if (job.status !== awaitingApprovalStatus) {
    return "STATUS_MISMATCH";
  }
  return null;
}

function classifyRaceLoss(
  db: DbClient,
  command: ParsedRejectCommand,
): RejectCommandErrorCode {
  const current = findJobById(db, command.jobId);
  if (current === null) {
    return "REJECT_RACE_LOST";
  }
  const preconditionError = rejectPreconditionError(current, command);
  if (preconditionError !== null) {
    return preconditionError;
  }
  return "REJECT_RACE_LOST";
}

async function replyWithError(
  dependencies: RejectCommandDependencies,
  code: RejectCommandErrorCode,
  jobId?: string,
): Promise<RejectCommandResult> {
  const replyText = formatRejectErrorReply(code, jobId);
  await dependencies.reply(replyText);
  return { status: "error", code, replyText };
}

export function formatRejectErrorReply(
  code: RejectCommandErrorCode,
  jobId?: string,
): string {
  return jobId === undefined ? code : `${code}: ${jobId}`;
}

export function rejectSuccessReply(command: ParsedRejectCommand): string {
  return `Rejected attempt ${command.attemptNumber}. Run \`bun run report:run ${command.jobId}\` to start attempt ${command.attemptNumber + 1} from ${rewindStageForScope(command.scope)}.`;
}

export function rewindStageForScope(scope: RejectScope): "draft_en" | "translate_zh" {
  return scope === "zh" ? "translate_zh" : "draft_en";
}

function isAllowedChatId(
  operatorChatIds: readonly number[],
  chatId: number,
): boolean {
  return operatorChatIds.includes(chatId);
}

function isRejectScope(value: string): value is RejectScope {
  return (rejectScopes as readonly string[]).includes(value);
}

function isRejectType(value: string): value is RejectType {
  return (rejectTypes as readonly string[]).includes(value);
}
