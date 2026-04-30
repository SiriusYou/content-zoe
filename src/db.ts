import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Database } from "bun:sqlite";

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
  | "DUPLICATE_JOB_ID"
  | "DUPLICATE_WEEK_KEY"
  | "DUPLICATE_RECOVERY_CLEANUP"
  | "FK_JOB_NOT_FOUND"
  | "INVALID_LOCALES"
  | "CHECK_FAILED"
  | "UNIQUE_FAILED"
  | "CONSTRAINT_FAILED";

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
  override readonly cause?: unknown;

  constructor(args: {
    errorCode: DbMigrationErrorCode;
    message: string;
    migration?: string;
    cause?: unknown;
  }) {
    super(args.message);
    this.errorCode = args.errorCode;
    this.migration = args.migration;
    this.cause = args.cause;
  }
}

export class DbConstraintError extends Error {
  readonly name = "DbConstraintError";
  readonly errorCode = "DB_CONSTRAINT";
  readonly subcode: DbConstraintSubcode;
  override readonly cause?: unknown;

  constructor(subcode: DbConstraintSubcode, message: string, cause?: unknown) {
    super(message);
    this.subcode = subcode;
    this.cause = cause;
  }
}

export interface Job {
  id: string;
  week_key: string;
  topic: string;
  locales: "en" | "en,zh";
  attempt_number: number;
  status: string;
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
      | "attempt_number"
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
    >
  >;

export type JobPatch = Partial<
  Pick<
    Job,
    | "week_key"
    | "topic"
    | "locales"
    | "attempt_number"
    | "status"
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

export interface RecoveryCleanupAudit {
  job_id: string;
  attempt_number: number;
  payload: string;
  created_at: number;
}

export interface OpenDbOptions {
  migrationsDir?: string;
  migrate?: boolean;
}

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");
const migrationFilenamePattern = /^\d{4}_[a-z0-9_]+\.sql$/;
const jobPatchColumns = [
  "week_key",
  "topic",
  "locales",
  "attempt_number",
  "status",
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

export function runMigrations(db: Database, dir = migrationsDir): void {
  if (!existsSync(dir)) {
    throw new DbMigrationError({
      errorCode: "MIGRATION_DIR_MISSING",
      message: `migration directory does not exist: ${dir}`,
    });
  }

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
          });
        }
        db.exec("COMMIT");
        continue;
      }

      db.exec(sql);
      db.query(
        "INSERT INTO _migrations (filename, sha256, applied_at) VALUES (?, ?, ?)",
      ).run(filename, sha256, Math.floor(Date.now() / 1000));
      db.exec("COMMIT");
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
}

export function createJob(db: Database, input: NewJob): Job {
  try {
    db.query(`
      INSERT INTO jobs (
        id, week_key, topic, locales, attempt_number, status, current_stage,
        run_dir, artifact_dir, primary_report_path, translated_report_path,
        sources_path, approval_summary, as_of, reject_scope, reject_type,
        reject_reason, notified_at, last_notify_error, error, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `).run(
      input.id,
      input.week_key,
      input.topic,
      input.locales ?? "en,zh",
      input.attempt_number ?? 1,
      input.status,
      input.current_stage,
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

export function getJob(db: Database, id: string): Job | null {
  return db.query<Job, [string]>("SELECT * FROM jobs WHERE id = ?").get(id) ?? null;
}

export function getJobByWeekKey(db: Database, weekKey: string): Job | null {
  return db
    .query<Job, [string]>("SELECT * FROM jobs WHERE week_key = ?")
    .get(weekKey) ?? null;
}

export function updateJob(db: Database, id: string, patch: JobPatch): number {
  return updateJobWhere(db, "id = ?", [id], patch);
}

export function casUpdateJob(
  db: Database,
  id: string,
  expectedUpdatedAt: number,
  patch: JobPatch,
): number {
  return updateJobWhere(db, "id = ? AND updated_at = ?", [id, expectedUpdatedAt], patch);
}

export function appendEvent(db: Database, input: NewEvent): Event {
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
    throw mapConstraintError(err, input.type);
  }
}

export function getEvent(db: Database, id: number): Event | null {
  return db.query<Event, [number]>("SELECT * FROM events WHERE id = ?").get(id) ?? null;
}

export function listEventsForJob(db: Database, jobId: string): Event[] {
  return db
    .query<Event, [string]>(
      "SELECT * FROM events WHERE job_id = ? ORDER BY id ASC",
    )
    .all(jobId);
}

export function recordRecoveryCleanup(
  db: Database,
  audit: RecoveryCleanupAudit,
): Event {
  try {
    return appendEvent(db, {
      job_id: audit.job_id,
      attempt_number: audit.attempt_number,
      type: "recovery_cleanup",
      payload: audit.payload,
      created_at: audit.created_at,
    });
  } catch (err) {
    if (
      err instanceof DbConstraintError &&
      err.subcode === "DUPLICATE_RECOVERY_CLEANUP"
    ) {
      const existing = db
        .query<Event, [string, number]>(
          "SELECT * FROM events WHERE job_id = ? AND attempt_number = ? AND type = 'recovery_cleanup'",
        )
        .get(audit.job_id, audit.attempt_number);
      if (existing) {
        return existing;
      }
    }
    throw err;
  }
}

function updateJobWhere(
  db: Database,
  whereSql: string,
  whereValues: (string | number)[],
  patch: JobPatch,
): number {
  const entries = Object.entries(patch).filter(([key]) =>
    jobPatchColumns.includes(key as (typeof jobPatchColumns)[number]),
  );
  if (entries.length === 0) {
    return 0;
  }

  const setSql = entries.map(([key]) => `${key} = ?`).join(", ");
  const values = entries.map(([, value]) => value ?? null);

  try {
    const result = db.query(`UPDATE jobs SET ${setSql} WHERE ${whereSql}`).run(
      ...values,
      ...whereValues,
    );
    return result.changes;
  } catch (err) {
    throw mapConstraintError(err);
  }
}

function getJobOrThrow(db: Database, id: string): Job {
  const job = getJob(db, id);
  if (!job) {
    throw new Error(`job not found after write: ${id}`);
  }
  return job;
}

function getEventOrThrow(db: Database, id: number): Event {
  const event = getEvent(db, id);
  if (!event) {
    throw new Error(`event not found after write: ${id}`);
  }
  return event;
}

function pragmaScalar<T>(db: Database, sql: string): T {
  const row = db.query<Record<string, T>, []>(sql).get();
  if (!row) {
    throw new DbInitError("DB_PRAGMA_FAILED", `pragma returned no rows: ${sql}`);
  }
  return Object.values(row)[0] as T;
}

function mapConstraintError(err: unknown, eventType?: string): never {
  if (!isSqliteConstraint(err)) {
    throw err;
  }

  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("FOREIGN KEY")) {
    throw new DbConstraintError("FK_JOB_NOT_FOUND", message, err);
  }
  if (message.includes("jobs.id")) {
    throw new DbConstraintError("DUPLICATE_JOB_ID", message, err);
  }
  if (message.includes("jobs.week_key")) {
    throw new DbConstraintError("DUPLICATE_WEEK_KEY", message, err);
  }
  if (eventType === "recovery_cleanup" && message.includes("UNIQUE")) {
    throw new DbConstraintError("DUPLICATE_RECOVERY_CLEANUP", message, err);
  }
  if (message.includes("jobs.locales") || message.includes("CHECK")) {
    throw new DbConstraintError("INVALID_LOCALES", message, err);
  }
  if (message.includes("UNIQUE")) {
    throw new DbConstraintError("UNIQUE_FAILED", message, err);
  }
  throw new DbConstraintError("CONSTRAINT_FAILED", message, err);
}

function isSqliteConstraint(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const code = (err as Error & { code?: string }).code;
  return code === "SQLITE_CONSTRAINT" || err.message.includes("constraint");
}
