import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Database } from "bun:sqlite";

import type { RecoveryCleanup as Slice35RecoveryCleanup } from "./lib/report-loop.ts";
import { Stage } from "./pipeline/types.ts";

export type DbClient = Database;
export type RecoveryCleanup = Slice35RecoveryCleanup;

export type DbInitErrorCode =
  | "DB_OPEN_FAILED"
  | "DB_PRAGMA_FAILED"
  | "DB_WAL_VERIFY_FAILED";

export type DbMigrationErrorCode =
  | "MIGRATION_DIR_MISSING"
  | "MIGRATION_FILENAME_INVALID"
  | "MIGRATION_SHA_MISMATCH"
  | "MIGRATION_APPLY_FAILED";

export type DbConstraintSubcode =
  | "SQLITE_CONSTRAINT_UNIQUE"
  | "SQLITE_CONSTRAINT_FOREIGNKEY"
  | "SQLITE_CONSTRAINT_NOTNULL"
  | "SQLITE_CONSTRAINT_CHECK"
  | "SQLITE_CONSTRAINT_PRIMARYKEY"
  | "SQLITE_CONSTRAINT_TRIGGER"
  | "SQLITE_CONSTRAINT_OTHER";

export class DbInitError extends Error {
  readonly name = "DbInitError";
  readonly errorCode: DbInitErrorCode;
  override readonly cause?: unknown;

  constructor(errorCode: DbInitErrorCode, message: string, cause?: unknown) {
    super(message);
    this.errorCode = errorCode;
    this.cause = cause;
  }
}

export class DbMigrationError extends Error {
  readonly name = "DbMigrationError";
  readonly errorCode: DbMigrationErrorCode;
  readonly migration?: string;
  readonly expectedSha?: string;
  readonly actualSha?: string;
  override readonly cause?: unknown;

  constructor(args: {
    errorCode: DbMigrationErrorCode;
    message: string;
    migration?: string;
    expectedSha?: string;
    actualSha?: string;
    cause?: unknown;
  }) {
    super(args.message);
    this.errorCode = args.errorCode;
    this.migration = args.migration;
    this.expectedSha = args.expectedSha;
    this.actualSha = args.actualSha;
    this.cause = args.cause;
  }
}

export class DbConstraintError extends Error {
  readonly name = "DbConstraintError";
  readonly errorCode = "DB_CONSTRAINT";
  readonly subcode: DbConstraintSubcode;
  readonly originalError: Error;
  readonly tableName?: string;
  readonly columnHint?: string;
  override readonly cause?: Error;

  constructor(args: {
    subcode: DbConstraintSubcode;
    message: string;
    originalError: Error;
    tableName?: string;
    columnHint?: string;
  }) {
    super(args.message);
    this.subcode = args.subcode;
    this.originalError = args.originalError;
    this.tableName = args.tableName;
    this.columnHint = args.columnHint;
    this.cause = args.originalError;
  }
}

export class LifecyclePersistenceError extends Error {
  readonly name = "LifecyclePersistenceError";
  readonly errorCode = "LIFECYCLE_PERSISTENCE_FAILED";
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(`LIFECYCLE_PERSISTENCE_FAILED: ${message}`);
    this.cause = cause;
  }
}

export interface Job {
  id: string;
  week_key: string;
  topic: string;
  locales: "en" | "en,zh";
  modality: JobModality;
  attempt_number: number;
  status: string;
  purpose: JobPurpose | null;
  current_stage: string;
  run_dir: string | null;
  artifact_dir: string | null;
  primary_report_path: string | null;
  translated_report_path: string | null;
  sources_path: string | null;
  approval_summary: string | null;
  as_of: number | null;
  reject_scope: string | null;
  reject_type: string | null;
  reject_reason: string | null;
  notified_at: number | null;
  last_notify_error: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export type JobModality = "text_report" | "image";
export type JobPurpose = "production" | "validation";

export interface Event {
  id: number;
  job_id: string;
  attempt_number: number;
  type: string;
  payload: string | null;
  created_at: number;
}

export type NewJob = Pick<
  Job,
  "id" | "week_key" | "topic" | "status" | "current_stage" | "created_at" | "updated_at"
> &
  Partial<
    Pick<
      Job,
      | "locales"
      | "modality"
      | "attempt_number"
      | "run_dir"
      | "purpose"
      | "artifact_dir"
      | "primary_report_path"
      | "translated_report_path"
      | "sources_path"
      | "approval_summary"
      | "as_of"
      | "reject_scope"
      | "reject_type"
      | "reject_reason"
      | "notified_at"
      | "last_notify_error"
      | "error"
    >
  >;

export type JobPatch = Partial<
  Pick<
    Job,
    | "week_key"
    | "topic"
    | "locales"
    | "modality"
    | "attempt_number"
    | "status"
    | "purpose"
    | "current_stage"
    | "run_dir"
    | "artifact_dir"
    | "primary_report_path"
    | "translated_report_path"
    | "sources_path"
    | "approval_summary"
    | "as_of"
    | "reject_scope"
    | "reject_type"
    | "reject_reason"
    | "notified_at"
    | "last_notify_error"
    | "error"
    | "updated_at"
  >
>;

export interface NewEvent {
  job_id: string;
  attempt_number: number;
  type: string;
  payload?: string | null;
  created_at: number;
}

export interface RecoveryCleanupParams {
  jobId: string;
  attemptNumber: number;
  recoveryCleanup: RecoveryCleanup;
}

export interface ResumeAttemptLifecycleBootstrapParams extends RecoveryCleanupParams {
  expectedPreviousAttemptNumber: number;
  restartStage: Stage;
  runDir: string;
  timestamp?: number;
}

export interface StageLifecycleParams {
  jobId: string;
  attemptNumber: number;
  stage: Stage;
  runDir: string;
  timestamp?: number;
}

export interface OpenDbOptions {
  migrationsDir?: string;
  migrate?: boolean;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export interface RowsAffectedResult {
  rowsAffected: number;
}

export interface CasExpected {
  status: string;
  attemptNumber: number;
}

export interface CasRowsAffectedResult {
  rowsAffected: 0 | 1;
}

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");
const migrationFilenamePattern = /^\d{4}_[a-z0-9_]+\.sql$/;
const jobPatchColumns = [
  "week_key",
  "topic",
  "locales",
  "modality",
  "attempt_number",
  "status",
  "purpose",
  "current_stage",
  "run_dir",
  "artifact_dir",
  "primary_report_path",
  "translated_report_path",
  "sources_path",
  "approval_summary",
  "as_of",
  "reject_scope",
  "reject_type",
  "reject_reason",
  "notified_at",
  "last_notify_error",
  "error",
  "updated_at",
] as const;

export function openDb(dbPath: string, options: OpenDbOptions = {}): Database {
  try {
    const parent = dirname(resolve(dbPath));
    mkdirSync(parent, { recursive: true });
    const db = new Database(dbPath);

    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA synchronous = NORMAL");
    db.exec("PRAGMA foreign_keys = ON");

    const journalMode = pragmaScalar<string>(db, "PRAGMA journal_mode");
    if (String(journalMode).toLowerCase() !== "wal") {
      db.close();
      throw new DbInitError(
        "DB_WAL_VERIFY_FAILED",
        `expected journal_mode=wal, got ${String(journalMode)}`,
      );
    }

    if (options.migrate !== false) {
      runMigrations(db, options.migrationsDir ?? migrationsDir);
    }

    return db;
  } catch (err) {
    if (err instanceof DbInitError || err instanceof DbMigrationError) {
      throw err;
    }
    throw new DbInitError("DB_OPEN_FAILED", "failed to open SQLite database", err);
  }
}

export function runMigrations(db: DbClient, dir = migrationsDir): MigrationResult {
  if (!existsSync(dir)) {
    throw new DbMigrationError({
      errorCode: "MIGRATION_DIR_MISSING",
      message: `migration directory does not exist: ${dir}`,
    });
  }

  const result: MigrationResult = { applied: [], skipped: [] };

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename   TEXT PRIMARY KEY,
      sha256     TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  const filenames = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const filename of filenames) {
    if (!migrationFilenamePattern.test(filename)) {
      throw new DbMigrationError({
        errorCode: "MIGRATION_FILENAME_INVALID",
        message: `invalid migration filename: ${filename}`,
        migration: filename,
      });
    }

    const fullPath = path.join(dir, filename);
    const sql = readFileSync(fullPath, "utf8");
    const sha256 = createHash("sha256").update(sql).digest("hex");

    try {
      db.exec("BEGIN IMMEDIATE");
      const existing = db
        .query<{ sha256: string }, [string]>(
          "SELECT sha256 FROM _migrations WHERE filename = ?",
        )
        .get(filename);

      if (existing) {
        if (existing.sha256 !== sha256) {
          throw new DbMigrationError({
            errorCode: "MIGRATION_SHA_MISMATCH",
            message: `migration SHA mismatch for ${filename}`,
            migration: filename,
            expectedSha: existing.sha256,
            actualSha: sha256,
          });
        }
        db.exec("COMMIT");
        result.skipped.push(filename);
        continue;
      }

      db.exec(sql);
      db.query(
        "INSERT INTO _migrations (filename, sha256, applied_at) VALUES (?, ?, ?)",
      ).run(filename, sha256, Math.floor(Date.now() / 1000));
      db.exec("COMMIT");
      result.applied.push(filename);
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // The original migration error is more useful than a rollback failure.
      }
      if (err instanceof DbMigrationError) {
        throw err;
      }
      throw new DbMigrationError({
        errorCode: "MIGRATION_APPLY_FAILED",
        message: `failed to apply migration ${filename}`,
        migration: filename,
        cause: err,
      });
    }
  }

  return result;
}

export function insertJob(db: DbClient, input: NewJob): Job {
  try {
    db.query(`
      INSERT INTO jobs (
        id, week_key, topic, locales, modality, attempt_number, status, current_stage,
        purpose, run_dir, artifact_dir, primary_report_path, translated_report_path,
        sources_path, approval_summary, as_of, reject_scope, reject_type,
        reject_reason, notified_at, last_notify_error, error, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `).run(
      input.id,
      input.week_key,
      input.topic,
      input.locales ?? "en,zh",
      input.modality ?? "text_report",
      input.attempt_number ?? 1,
      input.status,
      input.current_stage,
      input.purpose ?? null,
      input.run_dir ?? null,
      input.artifact_dir ?? null,
      input.primary_report_path ?? null,
      input.translated_report_path ?? null,
      input.sources_path ?? null,
      input.approval_summary ?? null,
      input.as_of ?? null,
      input.reject_scope ?? null,
      input.reject_type ?? null,
      input.reject_reason ?? null,
      input.notified_at ?? null,
      input.last_notify_error ?? null,
      input.error ?? null,
      input.created_at,
      input.updated_at,
    );
    return getJobOrThrow(db, input.id);
  } catch (err) {
    throw mapConstraintError(err);
  }
}

export function findJobById(db: DbClient, id: string): Job | null {
  return db.query<Job, [string]>("SELECT * FROM jobs WHERE id = ?").get(id) ?? null;
}

export function findJobsByStatus(db: DbClient, status: string): Job[] {
  return db
    .query<Job, [string]>(
      "SELECT * FROM jobs WHERE status = ? ORDER BY attempt_number ASC, updated_at ASC, id ASC",
    )
    .all(status);
}

export function updateJob(
  db: DbClient,
  id: string,
  patch: JobPatch,
): RowsAffectedResult {
  return updateJobWhere(db, "id = ?", [id], patch);
}

export function casUpdateJob(
  db: DbClient,
  id: string,
  expected: CasExpected,
  patch: JobPatch,
): CasRowsAffectedResult {
  const result = updateJobWhere(
    db,
    "id = ? AND status = ? AND attempt_number = ?",
    [id, expected.status, expected.attemptNumber],
    patch,
  );
  return { rowsAffected: result.rowsAffected === 0 ? 0 : 1 };
}

export function insertEvent(db: DbClient, input: NewEvent): Event {
  try {
    const result = db
      .query(
        "INSERT INTO events (job_id, attempt_number, type, payload, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        input.job_id,
        input.attempt_number,
        input.type,
        input.payload ?? null,
        input.created_at,
      );
    return getEventOrThrow(db, Number(result.lastInsertRowid));
  } catch (err) {
    throw mapConstraintError(err);
  }
}

function getEvent(db: DbClient, id: number): Event | null {
  return db.query<Event, [number]>("SELECT * FROM events WHERE id = ?").get(id) ?? null;
}

export function findEventsByJob(
  db: DbClient,
  jobId: string,
  type?: string,
): Event[] {
  if (type === undefined) {
    return db
      .query<Event, [string]>(
        "SELECT * FROM events WHERE job_id = ? ORDER BY id ASC",
      )
      .all(jobId);
  }

  return db
    .query<Event, [string, string]>(
      "SELECT * FROM events WHERE job_id = ? AND type = ? ORDER BY id ASC",
    )
    .all(jobId, type);
}

export function recordRecoveryCleanup(
  db: DbClient,
  params: RecoveryCleanupParams,
): Event {
  const payload = JSON.stringify(params.recoveryCleanup);
  try {
    return insertEvent(db, {
      job_id: params.jobId,
      attempt_number: params.attemptNumber,
      type: "recovery_cleanup",
      payload,
      created_at: Math.floor(Date.now() / 1000),
    });
  } catch (err) {
    if (
      err instanceof DbConstraintError &&
      err.subcode === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      const existing = db
        .query<Event, [string, number]>(
          "SELECT * FROM events WHERE job_id = ? AND attempt_number = ? AND type = 'recovery_cleanup'",
        )
        .get(params.jobId, params.attemptNumber);
      if (existing) {
        if (existing.payload !== payload) {
          throw new LifecyclePersistenceError(
            `divergent recovery_cleanup for resume bootstrap: job_id=${JSON.stringify(
              params.jobId,
            )} attempt_number=${params.attemptNumber}`,
          );
        }
        return existing;
      }
    }
    throw err;
  }
}

export function bootstrapResumeAttemptLifecycle(
  db: DbClient,
  params: ResumeAttemptLifecycleBootstrapParams,
): Event {
  const timestamp = params.timestamp ?? unixNow();
  validateResumeAttemptBootstrapParams(params);

  return runLifecycleTransaction(db, () => {
    const existingJob = findJobById(db, params.jobId);
    if (!existingJob) {
      throw new LifecyclePersistenceError(
        `resume bootstrap missing jobs row: job_id=${JSON.stringify(params.jobId)}`,
      );
    }

    const cleanupEvent = recordRecoveryCleanup(db, {
      jobId: params.jobId,
      attemptNumber: params.attemptNumber,
      recoveryCleanup: params.recoveryCleanup,
    });

    if (existingJob.attempt_number === params.attemptNumber) {
      if (
        existingJob.status !== "running" ||
        existingJob.current_stage !== params.restartStage ||
        existingJob.run_dir !== params.runDir
      ) {
        throw new LifecyclePersistenceError(
          `resume bootstrap found inconsistent active jobs row: job_id=${JSON.stringify(
            params.jobId,
          )} attempt_number=${params.attemptNumber}`,
        );
      }
      return cleanupEvent;
    }

    if (existingJob.attempt_number !== params.expectedPreviousAttemptNumber) {
      throw new LifecyclePersistenceError(
        `resume bootstrap stale attempt guard missed: job_id=${JSON.stringify(
          params.jobId,
        )} expected_previous_attempt=${params.expectedPreviousAttemptNumber} attempt_number=${params.attemptNumber} actual_attempt=${existingJob.attempt_number}`,
      );
    }

    const updated = updateJobWhere(
      db,
      "id = ? AND attempt_number = ?",
      [params.jobId, params.expectedPreviousAttemptNumber],
      {
        attempt_number: params.attemptNumber,
        status: "running",
        current_stage: params.restartStage,
        run_dir: params.runDir,
        error: null,
        updated_at: timestamp,
      },
    );
    assertLifecycleGuard(
      updated.rowsAffected,
      {
        jobId: params.jobId,
        attemptNumber: params.attemptNumber,
        stage: params.restartStage,
        runDir: params.runDir,
        timestamp,
      },
      `resume bootstrap guard missed for ${params.restartStage}`,
    );

    return cleanupEvent;
  });
}

export function recordStageEnter(
  db: DbClient,
  params: StageLifecycleParams,
): Event {
  const timestamp = params.timestamp ?? unixNow();
  return runLifecycleTransaction(db, () => {
    const updated = updateJobWhere(
      db,
      "id = ? AND attempt_number = ?",
      [params.jobId, params.attemptNumber],
      {
        status: "running",
        current_stage: params.stage,
        updated_at: timestamp,
      },
    );
    assertLifecycleGuard(
      updated.rowsAffected,
      params,
      `stage_enter guard missed for ${params.stage}`,
    );
    return insertEvent(db, {
      job_id: params.jobId,
      attempt_number: params.attemptNumber,
      type: "stage_enter",
      payload: JSON.stringify({
        stage: params.stage,
        run_dir: params.runDir,
      }),
      created_at: timestamp,
    });
  });
}

export function recordStageComplete(
  db: DbClient,
  params: StageLifecycleParams,
): Event {
  const timestamp = params.timestamp ?? unixNow();
  return runLifecycleTransaction(db, () => {
    assertCurrentAttempt(db, params, `stage_complete guard missed for ${params.stage}`);
    return insertEvent(db, {
      job_id: params.jobId,
      attempt_number: params.attemptNumber,
      type: "stage_complete",
      payload: JSON.stringify({
        stage: params.stage,
        run_dir: params.runDir,
        status: "ok",
      }),
      created_at: timestamp,
    });
  });
}

export function recordResearchStageComplete(
  db: DbClient,
  params: StageLifecycleParams,
): Event {
  if (params.stage !== Stage.RESEARCH) {
    throw new LifecyclePersistenceError(
      `recordResearchStageComplete received non-research stage ${params.stage}`,
    );
  }

  const timestamp = params.timestamp ?? unixNow();
  return runLifecycleTransaction(db, () => {
    const updated = updateJobWhere(
      db,
      "id = ? AND attempt_number = ?",
      [params.jobId, params.attemptNumber],
      {
        as_of: timestamp,
        updated_at: timestamp,
      },
    );
    assertLifecycleGuard(
      updated.rowsAffected,
      params,
      `research stage_complete guard missed for ${params.stage}`,
    );
    return insertEvent(db, {
      job_id: params.jobId,
      attempt_number: params.attemptNumber,
      type: "stage_complete",
      payload: JSON.stringify({
        stage: params.stage,
        run_dir: params.runDir,
        status: "ok",
      }),
      created_at: timestamp,
    });
  });
}

function runLifecycleTransaction<T>(db: DbClient, fn: () => T): T {
  try {
    db.exec("BEGIN IMMEDIATE");
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Preserve the lifecycle persistence error over rollback cleanup noise.
    }
    if (err instanceof LifecyclePersistenceError) {
      throw err;
    }
    throw new LifecyclePersistenceError("lifecycle transaction failed", err);
  }
}

function assertCurrentAttempt(
  db: DbClient,
  params: StageLifecycleParams,
  message: string,
): void {
  const row = db
    .query<{ id: string }, [string, number]>(
      "SELECT id FROM jobs WHERE id = ? AND attempt_number = ?",
    )
    .get(params.jobId, params.attemptNumber);
  assertLifecycleGuard(row ? 1 : 0, params, message);
}

function assertLifecycleGuard(
  rowsAffected: number,
  params: StageLifecycleParams,
  message: string,
): void {
  if (rowsAffected === 1) return;
  throw new LifecyclePersistenceError(
    `${message}: job_id=${JSON.stringify(params.jobId)} attempt_number=${params.attemptNumber}`,
  );
}

function validateResumeAttemptBootstrapParams(
  params: ResumeAttemptLifecycleBootstrapParams,
): void {
  if (!Number.isInteger(params.expectedPreviousAttemptNumber) || params.expectedPreviousAttemptNumber < 1) {
    throw new LifecyclePersistenceError(
      `resume bootstrap invalid previous attempt: job_id=${JSON.stringify(params.jobId)}`,
    );
  }
  if (!Number.isInteger(params.attemptNumber) || params.attemptNumber < 2) {
    throw new LifecyclePersistenceError(
      `resume bootstrap invalid attempt: job_id=${JSON.stringify(params.jobId)}`,
    );
  }
  if (params.attemptNumber !== params.expectedPreviousAttemptNumber + 1) {
    throw new LifecyclePersistenceError(
      `resume bootstrap non-sequential attempt: job_id=${JSON.stringify(
        params.jobId,
      )} expected_previous_attempt=${params.expectedPreviousAttemptNumber} attempt_number=${params.attemptNumber}`,
    );
  }
  if (
    params.recoveryCleanup.fromAttempt !== params.expectedPreviousAttemptNumber ||
    params.recoveryCleanup.copiedFromAttempt !== params.expectedPreviousAttemptNumber ||
    params.recoveryCleanup.restartStage !== params.restartStage
  ) {
    throw new LifecyclePersistenceError(
      `resume bootstrap recovery_cleanup mismatch: job_id=${JSON.stringify(
        params.jobId,
      )} attempt_number=${params.attemptNumber}`,
    );
  }
}

function updateJobWhere(
  db: DbClient,
  whereSql: string,
  whereValues: (string | number)[],
  patch: JobPatch,
): RowsAffectedResult {
  const entries = Object.entries(patch).filter(([key]) =>
    jobPatchColumns.includes(key as (typeof jobPatchColumns)[number]),
  );
  if (entries.length === 0) {
    return { rowsAffected: 0 };
  }

  const setSql = entries.map(([key]) => `${key} = ?`).join(", ");
  const values = entries.map(([, value]) => value ?? null);

  try {
    const result = db.query(`UPDATE jobs SET ${setSql} WHERE ${whereSql}`).run(
      ...values,
      ...whereValues,
    );
    return { rowsAffected: result.changes };
  } catch (err) {
    throw mapConstraintError(err);
  }
}

function getJobOrThrow(db: DbClient, id: string): Job {
  const job = findJobById(db, id);
  if (!job) {
    throw new Error(`job not found after write: ${id}`);
  }
  return job;
}

function getEventOrThrow(db: DbClient, id: number): Event {
  const event = getEvent(db, id);
  if (!event) {
    throw new Error(`event not found after write: ${id}`);
  }
  return event;
}

function pragmaScalar<T>(db: DbClient, sql: string): T {
  const row = db.query<Record<string, T>, []>(sql).get();
  if (!row) {
    throw new DbInitError("DB_PRAGMA_FAILED", `pragma returned no rows: ${sql}`);
  }
  return Object.values(row)[0] as T;
}

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

function mapConstraintError(err: unknown): never {
  if (!isSqliteConstraint(err)) {
    throw err;
  }

  const originalError = err instanceof Error ? err : new Error(String(err));
  const message = originalError.message;
  const { tableName, columnHint } = inferConstraintTarget(message);
  throw new DbConstraintError({
    subcode: sqliteConstraintSubcode(originalError),
    message,
    originalError,
    tableName,
    columnHint,
  });
}

function isSqliteConstraint(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const code = (err as Error & { code?: string }).code;
  return code?.startsWith("SQLITE_CONSTRAINT") === true || err.message.includes("constraint");
}

function sqliteConstraintSubcode(err: Error): DbConstraintSubcode {
  const code = (err as Error & { code?: string }).code;
  switch (code) {
    case "SQLITE_CONSTRAINT_UNIQUE":
    case "SQLITE_CONSTRAINT_FOREIGNKEY":
    case "SQLITE_CONSTRAINT_NOTNULL":
    case "SQLITE_CONSTRAINT_CHECK":
    case "SQLITE_CONSTRAINT_PRIMARYKEY":
    case "SQLITE_CONSTRAINT_TRIGGER":
      return code;
    default:
      return "SQLITE_CONSTRAINT_OTHER";
  }
}

function inferConstraintTarget(message: string): {
  tableName?: string;
  columnHint?: string;
} {
  const tableColumn = message.match(/constraint failed: ([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/);
  if (tableColumn) {
    return { tableName: tableColumn[1], columnHint: tableColumn[2] };
  }
  if (message.includes("locales")) {
    return { tableName: "jobs", columnHint: "locales" };
  }
  if (message.includes("modality")) {
    return { tableName: "jobs", columnHint: "modality" };
  }
  return {};
}
