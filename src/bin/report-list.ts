import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { Database } from "bun:sqlite";

export type ReportListStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "published"
  | "failed"
  | "all";

export interface ReportListArgs {
  readonly status: ReportListStatus;
  readonly limit: number;
}

export interface ReportListJobRow {
  readonly id: string | null;
  readonly week_key: string | null;
  readonly attempt_number: number | null;
  readonly status: string | null;
  readonly current_stage: string | null;
  readonly run_dir: string | null;
  readonly artifact_dir: string | null;
  readonly notified_at: number | null;
  readonly last_notify_error: string | null;
  readonly error: string | null;
  readonly updated_at: number | null;
}

export interface GetReportListOptions {
  readonly cwd: string;
  readonly args: ReportListArgs;
  readonly dbPath?: string;
}

export interface RunReportListCliOptions {
  readonly cwd: string;
  readonly args?: readonly string[];
  readonly dbPath?: string;
  readonly writeStdout?: (text: string) => void;
  readonly writeStderr?: (text: string) => void;
}

export type ReportListResult =
  | { readonly kind: "missing-db" }
  | { readonly kind: "jobs"; readonly rows: readonly ReportListJobRow[] };

export type ReportListErrorCode =
  | "INVALID_COMMAND"
  | "INVALID_STATUS"
  | "INVALID_LIMIT"
  | "DB_READ_FAILED";

export class ReportListError extends Error {
  readonly name = "ReportListError";
  readonly code: ReportListErrorCode;
  override readonly cause?: unknown;

  constructor(code: ReportListErrorCode, detail?: string, cause?: unknown) {
    super(detail === undefined || detail.length === 0 ? code : `${code}: ${detail}`);
    this.code = code;
    this.cause = cause;
  }
}

const allowedStatuses = new Set<ReportListStatus>([
  "queued",
  "running",
  "awaiting_approval",
  "published",
  "failed",
  "all",
]);

const jobListColumns = `
  SELECT
    id,
    week_key,
    attempt_number,
    status,
    current_stage,
    run_dir,
    artifact_dir,
    notified_at,
    last_notify_error,
    error,
    updated_at
  FROM jobs
`;

export function defaultReportListDbPath(cwd: string): string {
  return resolve(cwd, ".data", "content.db");
}

export function parseReportListArgs(args: readonly string[]): ReportListArgs {
  let status: ReportListStatus = "all";
  let limit = 20;
  let sawStatus = false;
  let sawLimit = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--status") {
      if (sawStatus) throw new ReportListError("INVALID_COMMAND");
      const value = args[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("--")) {
        throw new ReportListError("INVALID_COMMAND");
      }
      status = parseStatus(value);
      sawStatus = true;
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      if (sawLimit) throw new ReportListError("INVALID_COMMAND");
      const value = args[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("--")) {
        throw new ReportListError("INVALID_COMMAND");
      }
      limit = parseLimit(value);
      sawLimit = true;
      index += 1;
      continue;
    }

    throw new ReportListError("INVALID_COMMAND");
  }

  return { status, limit };
}

export function getReportList(opts: GetReportListOptions): ReportListResult {
  const dbPath = opts.dbPath ?? defaultReportListDbPath(opts.cwd);
  if (!existsSync(dbPath)) return { kind: "missing-db" };

  let db: Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true });
    const rows = opts.args.status === "all"
      ? db
          .query<ReportListJobRow, [number]>(`
            ${jobListColumns}
            ORDER BY updated_at DESC, id ASC
            LIMIT ?
          `)
          .all(opts.args.limit)
      : db
          .query<ReportListJobRow, [string, number]>(`
            ${jobListColumns}
            WHERE status = ?
            ORDER BY updated_at DESC, id ASC
            LIMIT ?
          `)
          .all(opts.args.status, opts.args.limit);

    return { kind: "jobs", rows };
  } catch (err) {
    throw new ReportListError("DB_READ_FAILED", formatThrown(err), err);
  } finally {
    db?.close();
  }
}

export async function runReportListCli(
  opts: RunReportListCliOptions,
): Promise<number> {
  const writeStdout = opts.writeStdout ?? ((text: string) => process.stdout.write(text));
  const writeStderr = opts.writeStderr ?? ((text: string) => process.stderr.write(text));
  const args = opts.args ?? Bun.argv.slice(2);

  let parsed: ReportListArgs;
  try {
    parsed = parseReportListArgs(args);
  } catch (err) {
    writeStderr(`${formatCliError(err)}\n`);
    return 1;
  }

  try {
    const result = getReportList({ cwd: opts.cwd, args: parsed, dbPath: opts.dbPath });
    if (result.kind === "missing-db") {
      writeStdout("NO_DATABASE\n");
      return 0;
    }

    if (result.rows.length === 0) {
      writeStdout("NO_JOBS\n");
      return 0;
    }

    writeStdout(formatReportList(result.rows));
    return 0;
  } catch (err) {
    writeStderr(`${formatCliError(err)}\n`);
    return 1;
  }
}

export function formatReportList(rows: readonly ReportListJobRow[]): string {
  return rows.map(formatJobRecord).join("\n") + "\n";
}

function parseStatus(value: string): ReportListStatus {
  if (allowedStatuses.has(value as ReportListStatus)) {
    return value as ReportListStatus;
  }
  throw new ReportListError("INVALID_STATUS", value);
}

function parseLimit(value: string): number {
  if (!/^(?:[1-9][0-9]?|100)$/.test(value)) {
    throw new ReportListError("INVALID_LIMIT", value);
  }
  return Number(value);
}

function formatJobRecord(row: ReportListJobRow): string {
  const attempt = requiredInteger(row.attempt_number, "attempt_number");
  const updatedAt = requiredInteger(row.updated_at, "updated_at");
  return [
    "JOB",
    `job_id=${requiredField(row.id, "id")}`,
    `week_key=${requiredField(row.week_key, "week_key")}`,
    `status=${requiredField(row.status, "status")}`,
    `stage=${requiredField(row.current_stage, "current_stage")}`,
    `attempt=${attempt}`,
    `updated_at=${updatedAt}`,
    `run_dir=${formatPathValue(row.run_dir)}`,
    `artifact_dir=${formatPathValue(row.artifact_dir)}`,
    `notified_at=${nullableInteger(row.notified_at, "notified_at")}`,
    `last_notify_error=${formatExcerpt(row.last_notify_error)}`,
    `error=${formatExcerpt(row.error)}`,
  ].join("\t");
}

function requiredField(value: string | null | undefined, fieldName: string): string {
  if (value === null || value === undefined) {
    throw new ReportListError("DB_READ_FAILED", `empty ${fieldName}`);
  }
  const summary = collapseWhitespace(value);
  if (summary.length === 0) {
    throw new ReportListError("DB_READ_FAILED", `empty ${fieldName}`);
  }
  return summary;
}

function requiredInteger(value: number | null | undefined, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ReportListError("DB_READ_FAILED", `invalid ${fieldName}`);
  }
  return value;
}

function nullableInteger(value: number | null | undefined, fieldName: string): number | "null" {
  if (value === null || value === undefined) return "null";
  return requiredInteger(value, fieldName);
}

function formatPathValue(value: string | null): string {
  if (value === null) return "-";
  const summary = collapseWhitespace(value);
  return summary.length === 0 ? "-" : summary;
}

function formatExcerpt(value: string | null): string {
  if (value === null) return "-";
  const summary = collapseWhitespace(value);
  if (summary.length === 0) return "-";
  return summary.length > 160 ? summary.slice(0, 160) : summary;
}

function collapseWhitespace(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function formatCliError(err: unknown): string {
  if (err instanceof ReportListError) return err.message;
  return `DB_READ_FAILED: ${formatThrown(err)}`;
}

function formatThrown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

if (import.meta.main) {
  const exitCode = await runReportListCli({
    cwd: process.cwd(),
  });
  process.exit(exitCode);
}
