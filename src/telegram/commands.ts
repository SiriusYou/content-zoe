import {
  casUpdateJob,
  findEventsByJob,
  findJobById,
  insertEvent,
  type DbClient,
  type Job,
} from "../db.ts";
import {
  PromoteError,
  promoteJob,
  type GitCommitter,
  type PromoteJobHooks,
  type PromoteJobResult,
} from "../promote.ts";
import {
  getPipeline,
  isRejectScope,
  isRejectType,
  isValidRejectScopeTypeForModality,
  Modality,
  type RejectScope,
  type RejectType,
} from "../pipeline/modality.ts";

export const APPROVE_COMMAND = "approve";
export const REJECT_COMMAND = "reject";
export const STATUS_COMMAND = "status";
export const REJECT_REASON_MAX_CHARS = 500;

export type { RejectScope, RejectType };

export type RejectCommandErrorCode =
  | "INVALID_COMMAND"
  | "INVALID_SCOPE_TYPE_COMBO"
  | "REASON_TOO_LONG"
  | "UNKNOWN_JOB"
  | "STALE_ATTEMPT"
  | "STATUS_MISMATCH"
  | "REJECT_RACE_LOST";

export type ApproveCommandErrorCode =
  | "INVALID_COMMAND"
  | "IMAGE_PUBLISH_NOT_IMPLEMENTED"
  | "UNKNOWN_JOB"
  | "STALE_ATTEMPT"
  | "STATUS_MISMATCH"
  | "PUBLISH_SOURCE_MISSING"
  | "PUBLISH_ARTIFACT_DIVERGED"
  | "APPROVE_RACE_LOST"
  | "PUBLISH_FAILED";

export type StatusCommandErrorCode = "INVALID_COMMAND" | "UNKNOWN_JOB";

export interface ParsedApproveCommand {
  readonly jobId: string;
  readonly attemptNumber: number;
}

export interface ParseApproveCommandSuccess {
  readonly ok: true;
  readonly command: ParsedApproveCommand;
}

export interface ParseApproveCommandFailure {
  readonly ok: false;
  readonly code: Extract<ApproveCommandErrorCode, "INVALID_COMMAND">;
  readonly jobId?: string;
}

export type ParseApproveCommandResult =
  | ParseApproveCommandSuccess
  | ParseApproveCommandFailure;

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

export interface ParsedStatusCommand {
  readonly jobId: string;
}

export interface ParseStatusCommandSuccess {
  readonly ok: true;
  readonly command: ParsedStatusCommand;
}

export interface ParseStatusCommandFailure {
  readonly ok: false;
  readonly code: Extract<StatusCommandErrorCode, "INVALID_COMMAND">;
  readonly jobId?: string;
}

export type ParseStatusCommandResult =
  | ParseStatusCommandSuccess
  | ParseStatusCommandFailure;

export interface RejectCommandDependencies {
  readonly db: DbClient;
  readonly text: string;
  readonly chatId: number;
  readonly operatorChatIds: readonly number[];
  readonly now: () => number;
  readonly reply: (text: string) => Promise<void> | void;
  readonly beforeCas?: (job: Job, command: ParsedRejectCommand) => Promise<void> | void;
}

export interface ApproveCommandDependencies {
  readonly db: DbClient;
  readonly text: string;
  readonly chatId: number;
  readonly operatorChatIds: readonly number[];
  readonly cwd: string;
  readonly now: () => number;
  readonly reply: (text: string) => Promise<void> | void;
  readonly committer?: GitCommitter;
  readonly publishHooks?: PromoteJobHooks;
}

export interface StatusCommandDependencies {
  readonly db: DbClient;
  readonly text: string;
  readonly chatId: number;
  readonly operatorChatIds: readonly number[];
  readonly now: () => number;
  readonly reply: (text: string) => Promise<void> | void;
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

export interface ApproveCommandResult {
  readonly status:
    | "published"
    | "idempotent"
    | "error"
    | "unauthorized_audited"
    | "unauthorized_ignored";
  readonly code?: ApproveCommandErrorCode;
  readonly replyText?: string;
  readonly publishResult?: PromoteJobResult;
}

export interface StatusCommandResult {
  readonly status:
    | "reported"
    | "error"
    | "unauthorized_audited"
    | "unauthorized_ignored";
  readonly code?: StatusCommandErrorCode;
  readonly replyText?: string;
}

const awaitingApprovalStatus = "awaiting_approval";
const queuedStatus = "queued";
const rejectedEventType = "rejected";
const unauthorizedEventType = "unauthorized";
const approveCommandPattern = /^\/approve(?:@\w+)?(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(\S+))?$/;
const rejectCommandPattern = /^\/reject(?:@\w+)?(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+([\s\S]*))?$/;
const statusCommandPattern = /^\/status(?:@\w+)?(?:\s+(\S+))?(?:\s+(\S+))?$/;
const positiveIntegerPattern = /^\d+$/;

export function parseApproveCommand(text: string): ParseApproveCommandResult {
  const match = approveCommandPattern.exec(text.trim());
  if (!match) {
    return parseApproveRecoverableJobId(text);
  }

  const [, jobId, attemptToken, extraToken] = match;
  if (jobId === undefined) {
    return { ok: false, code: "INVALID_COMMAND" };
  }

  if (
    attemptToken === undefined ||
    extraToken !== undefined ||
    !positiveIntegerPattern.test(attemptToken)
  ) {
    return { ok: false, code: "INVALID_COMMAND", jobId };
  }

  const attemptNumber = Number(attemptToken);
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1) {
    return { ok: false, code: "INVALID_COMMAND", jobId };
  }

  return {
    ok: true,
    command: {
      jobId,
      attemptNumber,
    },
  };
}

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

export function parseStatusCommand(text: string): ParseStatusCommandResult {
  const match = statusCommandPattern.exec(text.trim());
  if (!match) {
    return parseStatusRecoverableJobId(text);
  }

  const [, jobId, extraToken] = match;
  if (jobId === undefined) {
    return { ok: false, code: "INVALID_COMMAND" };
  }

  if (extraToken !== undefined) {
    return { ok: false, code: "INVALID_COMMAND", jobId };
  }

  return {
    ok: true,
    command: { jobId },
  };
}

export async function handleApproveCommand(
  dependencies: ApproveCommandDependencies,
): Promise<ApproveCommandResult> {
  const parsed = parseApproveCommand(dependencies.text);
  const authorized = isAllowedChatId(
    dependencies.operatorChatIds,
    dependencies.chatId,
  );

  if (!parsed.ok) {
    if (authorized) {
      return replyWithApproveError(dependencies, parsed.code, parsed.jobId);
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
        command: APPROVE_COMMAND,
        chat_id: dependencies.chatId,
      }),
      created_at: dependencies.now(),
    });
    return { status: "unauthorized_audited" };
  }

  const job = findJobById(dependencies.db, parsed.command.jobId);
  if (job === null) {
    return replyWithApproveError(dependencies, "UNKNOWN_JOB", parsed.command.jobId);
  }
  if (job.modality === Modality.IMAGE) {
    if (job.attempt_number !== parsed.command.attemptNumber) {
      return replyWithApproveError(dependencies, "STALE_ATTEMPT", parsed.command.jobId);
    }
    if (job.status !== awaitingApprovalStatus) {
      return replyWithApproveError(dependencies, "STATUS_MISMATCH", parsed.command.jobId);
    }
    return replyWithApproveError(dependencies, "IMAGE_PUBLISH_NOT_IMPLEMENTED", parsed.command.jobId);
  }

  try {
    const publishResult = await promoteJob({
      db: dependencies.db,
      cwd: dependencies.cwd,
      jobId: parsed.command.jobId,
      attemptNumber: parsed.command.attemptNumber,
      now: dependencies.now,
      committer: dependencies.committer,
      hooks: dependencies.publishHooks,
    });
    const replyText = approveSuccessReply(publishResult);
    await dependencies.reply(replyText);
    return {
      status: publishResult.status,
      replyText,
      publishResult,
    };
  } catch (err) {
    if (err instanceof PromoteError) {
      return replyWithApproveError(dependencies, err.code, err.jobId ?? parsed.command.jobId);
    }
    throw err;
  }
}

export async function handleStatusCommand(
  dependencies: StatusCommandDependencies,
): Promise<StatusCommandResult> {
  const parsed = parseStatusCommand(dependencies.text);
  const authorized = isAllowedChatId(
    dependencies.operatorChatIds,
    dependencies.chatId,
  );

  if (!parsed.ok) {
    if (authorized) {
      return replyWithStatusError(dependencies, parsed.code, parsed.jobId);
    }
    return { status: "unauthorized_ignored" };
  }

  const job = findJobById(dependencies.db, parsed.command.jobId);

  if (!authorized) {
    if (job === null) {
      return { status: "unauthorized_ignored" };
    }

    insertEvent(dependencies.db, {
      job_id: job.id,
      attempt_number: job.attempt_number,
      type: unauthorizedEventType,
      payload: JSON.stringify({
        command: STATUS_COMMAND,
        chat_id: dependencies.chatId,
      }),
      created_at: dependencies.now(),
    });
    return { status: "unauthorized_audited" };
  }

  if (job === null) {
    return replyWithStatusError(dependencies, "UNKNOWN_JOB", parsed.command.jobId);
  }

  const replyText = formatStatusReply(dependencies.db, job);
  await dependencies.reply(replyText);
  return { status: "reported", replyText };
}

export function isValidRejectScopeType(
  scope: RejectScope,
  rejectType: RejectType,
): boolean {
  return isValidRejectScopeTypeForModality(Modality.TEXT_REPORT, scope, rejectType);
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

  if (
    !isValidRejectScopeTypeForModality(
      job.modality,
      parsed.command.scope,
      parsed.command.rejectType,
    )
  ) {
    return replyWithError(dependencies, "INVALID_SCOPE_TYPE_COMBO", parsed.command.jobId);
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
    const rewindStage = getPipeline(job.modality).rewindStageForReject(command.scope);
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
        current_stage: rewindStage,
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

    const replyText = rejectSuccessReply(command, job.modality);
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

async function replyWithApproveError(
  dependencies: ApproveCommandDependencies,
  code: ApproveCommandErrorCode,
  jobId?: string,
): Promise<ApproveCommandResult> {
  const replyText = formatApproveErrorReply(code, jobId);
  await dependencies.reply(replyText);
  return { status: "error", code, replyText };
}

async function replyWithStatusError(
  dependencies: StatusCommandDependencies,
  code: StatusCommandErrorCode,
  jobId?: string,
): Promise<StatusCommandResult> {
  const replyText = formatStatusErrorReply(code, jobId);
  await dependencies.reply(replyText);
  return { status: "error", code, replyText };
}

export function formatApproveErrorReply(
  code: ApproveCommandErrorCode,
  jobId?: string,
): string {
  return jobId === undefined ? code : `${code}: ${jobId}`;
}

export function formatRejectErrorReply(
  code: RejectCommandErrorCode,
  jobId?: string,
): string {
  return jobId === undefined ? code : `${code}: ${jobId}`;
}

export function formatStatusErrorReply(
  code: StatusCommandErrorCode,
  jobId?: string,
): string {
  return jobId === undefined ? code : `${code}: ${jobId}`;
}

export function rejectSuccessReply(
  command: ParsedRejectCommand,
  modality: Modality | string = Modality.TEXT_REPORT,
): string {
  const rewindStage = rewindStageForScope(command.scope, modality);
  const runCommand = modality === Modality.IMAGE ? "content:image-run" : "report:run";
  return `Rejected attempt ${command.attemptNumber}. Run \`bun run ${runCommand} ${command.jobId}\` to start attempt ${command.attemptNumber + 1} from ${rewindStage}.`;
}

export function formatStatusReply(db: DbClient, job: Job): string {
  const lines = [
    `STATUS job_id=${job.id} status=${job.status} attempt_number=${job.attempt_number} current_stage=${job.current_stage} week_key=${job.week_key}`,
  ];

  if (job.artifact_dir !== null) {
    lines.push(`artifact_dir=${job.artifact_dir}`);
  }

  const manifestLine = publishedManifestStatusLine(db, job);
  if (manifestLine !== null) {
    lines.push(manifestLine);
  }

  if (job.status === awaitingApprovalStatus && job.approval_summary !== null) {
    lines.push(`summary=${approvalSummaryExcerpt(job.approval_summary)}`);
  }

  if (job.last_notify_error !== null) {
    lines.push(`last_notify_error=${boundedExcerpt(job.last_notify_error)}`);
  }

  if (job.error !== null) {
    lines.push(`error=${boundedExcerpt(job.error)}`);
  }

  return lines.join("\n");
}

export function approveSuccessReply(result: PromoteJobResult): string {
  const notes: string[] = [];
  if (result.cleanupFailed !== undefined) {
    notes.push(` Cleanup failed non-blocking: ${result.cleanupFailed}`);
  }
  if (result.gitCommitFailed !== undefined) {
    notes.push(` Git post-step failed non-blocking: ${result.gitCommitFailed}`);
  }
  return `Approved attempt ${result.attemptNumber}. Published ${result.jobId} to ${result.artifactDir}/.${notes.join("")}`;
}

export function rewindStageForScope(
  scope: RejectScope,
  modality: Modality | string = Modality.TEXT_REPORT,
): string {
  return getPipeline(modality).rewindStageForReject(scope);
}

function isAllowedChatId(
  operatorChatIds: readonly number[],
  chatId: number,
): boolean {
  return operatorChatIds.includes(chatId);
}

function parseApproveRecoverableJobId(text: string): ParseApproveCommandFailure {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const commandToken = tokens[0];
  if (commandToken === undefined || !/^\/approve(?:@\w+)?$/.test(commandToken)) {
    return { ok: false, code: "INVALID_COMMAND" };
  }
  const jobId = tokens[1];
  return jobId === undefined
    ? { ok: false, code: "INVALID_COMMAND" }
    : { ok: false, code: "INVALID_COMMAND", jobId };
}

function parseStatusRecoverableJobId(text: string): ParseStatusCommandFailure {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const commandToken = tokens[0];
  if (commandToken === undefined || !/^\/status(?:@\w+)?$/.test(commandToken)) {
    return { ok: false, code: "INVALID_COMMAND" };
  }
  const jobId = tokens[1];
  return jobId === undefined
    ? { ok: false, code: "INVALID_COMMAND" }
    : { ok: false, code: "INVALID_COMMAND", jobId };
}

function publishedManifestStatusLine(db: DbClient, job: Job): string | null {
  if (job.status !== "published") {
    return null;
  }

  const events = findEventsByJob(db, job.id, "promoted");
  const latest = events.at(-1);
  if (latest === undefined || latest.payload === null) {
    return "publish_manifest=missing";
  }

  let payload: unknown;
  try {
    payload = JSON.parse(latest.payload);
  } catch {
    return "publish_manifest=unparseable";
  }

  const manifest = readObject(payload)?.publish_manifest;
  const manifestObject = readObject(manifest);
  if (manifestObject === null) {
    return "publish_manifest=missing";
  }

  const files = manifestObject.files;
  const aggregateSha = manifestObject.aggregate_sha256;
  if (
    !Array.isArray(files) ||
    typeof aggregateSha !== "string" ||
    !/^[a-fA-F0-9]{12,}$/.test(aggregateSha)
  ) {
    return "publish_manifest=unparseable";
  }

  return `publish_manifest=present files=${files.length} aggregate_sha256=${aggregateSha.slice(0, 12).toLowerCase()}`;
}

function approvalSummaryExcerpt(value: string): string {
  const lines = value
    .split(/\r?\n/)
    .map((line) => collapseWhitespace(line))
    .filter((line) => line.length > 0);
  const evidenceLine = lines.find((line) =>
    /EVIDENCE_GRADE|Evidence Grade/.test(line),
  );
  return boundedExcerpt(evidenceLine ?? value);
}

function boundedExcerpt(value: string): string {
  return collapseWhitespace(value).slice(0, 160);
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}
