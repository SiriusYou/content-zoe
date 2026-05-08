import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { Database } from "bun:sqlite";

export interface ReportReminderRow {
  readonly id: string;
  readonly week_key: string;
  readonly attempt_number: number;
  readonly status: "awaiting_approval";
  readonly notified_at: number | null;
  readonly last_notify_error: string | null;
  readonly updated_at: number;
}

export interface ListReportRemindersOptions {
  readonly cwd: string;
  readonly dbPath?: string;
}

export interface RunReportRemindCliOptions {
  readonly cwd: string;
  readonly dbPath?: string;
  readonly writeStdout?: (text: string) => void;
  readonly writeStderr?: (text: string) => void;
}

export type ReportRemindersResult =
  | { readonly kind: "missing-db" }
  | { readonly kind: "rows"; readonly rows: readonly ReportReminderRow[] };

export class ReportRemindError extends Error {
  readonly name = "ReportRemindError";
  readonly code = "DB_READ_FAILED";
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

export function defaultReportRemindDbPath(cwd: string): string {
  return resolve(cwd, ".data", "content.db");
}

export function listReportReminders(
  opts: ListReportRemindersOptions,
): ReportRemindersResult {
  const dbPath = opts.dbPath ?? defaultReportRemindDbPath(opts.cwd);
  if (!existsSync(dbPath)) return { kind: "missing-db" };

  let db: Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true });
    const rows = db
      .query<ReportReminderRow, []>(`
        SELECT
          id,
          week_key,
          attempt_number,
          status,
          notified_at,
          last_notify_error,
          updated_at
        FROM jobs
        WHERE status = 'awaiting_approval'
          AND (notified_at IS NULL OR last_notify_error IS NOT NULL)
        ORDER BY updated_at ASC, attempt_number ASC, id ASC
      `)
      .all();
    return { kind: "rows", rows };
  } catch (err) {
    throw new ReportRemindError(`DB_READ_FAILED: ${formatThrown(err)}`, err);
  } finally {
    db?.close();
  }
}

export async function runReportRemindCli(
  opts: RunReportRemindCliOptions,
): Promise<number> {
  const writeStdout = opts.writeStdout ?? ((text: string) => process.stdout.write(text));
  const writeStderr = opts.writeStderr ?? ((text: string) => process.stderr.write(text));

  try {
    const result = listReportReminders(opts);
    if (result.kind === "missing-db") {
      writeStdout("NO_DATABASE\n");
      return 0;
    }

    writeStdout(formatReportReminders(result.rows));
    return 0;
  } catch (err) {
    writeStderr(`${formatCliError(err)}\n`);
    return 1;
  }
}

export function formatReportReminders(
  rows: readonly ReportReminderRow[],
): string {
  if (rows.length === 0) return "NO_REMINDERS\n";
  return `${rows.map(formatReportReminderRow).join("\n")}\n`;
}

export function formatReportReminderRow(row: ReportReminderRow): string {
  return [
    "REMINDER",
    `job_id=${row.id}`,
    `week_key=${row.week_key}`,
    `attempt=${row.attempt_number}`,
    "status=awaiting_approval",
    `notify_state=${notifyState(row)}`,
    `notified_at=${row.notified_at ?? "null"}`,
    `last_notify_error=${formatErrorSummary(row.last_notify_error)}`,
  ].join("\t");
}

export function formatErrorSummary(value: string | null): string {
  if (value === null) return "-";
  const summary = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (summary.length === 0) return "-";
  return summary.length > 160 ? summary.slice(0, 160) : summary;
}

function notifyState(row: ReportReminderRow): "never_notified" | "notify_failed" {
  return row.last_notify_error === null ? "never_notified" : "notify_failed";
}

function formatCliError(err: unknown): string {
  if (err instanceof ReportRemindError) return err.message;
  return `DB_READ_FAILED: ${formatThrown(err)}`;
}

function formatThrown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

if (import.meta.main) {
  const exitCode = await runReportRemindCli({
    cwd: process.cwd(),
  });
  process.exit(exitCode);
}
