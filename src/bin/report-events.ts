import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

type Database = import("bun:sqlite").Database;
type SqliteModule = typeof import("bun:sqlite");

export interface ReportEventsArgs {
  readonly jobId: string;
  readonly attempt: number | null;
  readonly type: string | null;
  readonly limit: number | null;
}

export interface ReportEventDbRow {
  readonly id: unknown;
  readonly attempt_number: unknown;
  readonly type: unknown;
  readonly payload: unknown;
  readonly created_at: unknown;
}

export interface ReportEventOutputRow {
  readonly eventId: number;
  readonly attemptNumber: number;
  readonly type: string;
  readonly createdAtIso: string;
  readonly payloadSha256: string;
  readonly payloadSummary: string;
}

export interface GetReportEventsOptions {
  readonly cwd: string;
  readonly args: ReportEventsArgs;
  readonly dbPath?: string;
}

export interface RunReportEventsCliOptions {
  readonly cwd: string;
  readonly args?: readonly string[];
  readonly dbPath?: string;
  readonly writeStdout?: (text: string) => void;
  readonly writeStderr?: (text: string) => void;
}

export type ReportEventsResult =
  | { readonly kind: "missing-db" }
  | { readonly kind: "unknown-job"; readonly jobId: string }
  | {
      readonly kind: "events";
      readonly args: ReportEventsArgs;
      readonly rows: readonly ReportEventOutputRow[];
    };

export type ReportEventsErrorCode =
  | "INVALID_COMMAND"
  | "EVENTS_READ_FAILED"
  | "DB_READ_FAILED";

export class ReportEventsError extends Error {
  readonly name = "ReportEventsError";
  readonly code: ReportEventsErrorCode;
  override readonly cause?: unknown;

  constructor(code: ReportEventsErrorCode, detail: string, cause?: unknown) {
    super(`${code}: ${detail}`);
    this.code = code;
    this.cause = cause;
  }
}

const eventTypeTokenPattern = /^[A-Za-z][A-Za-z0-9_:-]{0,63}$/;
const positiveIntegerPattern = /^(?:[1-9][0-9]*)$/;

export function defaultReportEventsDbPath(cwd: string): string {
  return resolve(cwd, ".data", "content.db");
}

export function parseReportEventsArgs(args: readonly string[]): ReportEventsArgs {
  let jobId: string | null = null;
  let attempt: number | null = null;
  let type: string | null = null;
  let limit: number | null = null;
  let sawAttempt = false;
  let sawType = false;
  let sawLimit = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      throw new ReportEventsError("INVALID_COMMAND", "missing argument");
    }

    if (arg === "--attempt") {
      if (sawAttempt) throw new ReportEventsError("INVALID_COMMAND", "duplicate --attempt");
      const value = args[index + 1];
      if (value === undefined) {
        throw new ReportEventsError("INVALID_COMMAND", "missing --attempt value");
      }
      attempt = parsePositiveSafeInteger(value, "attempt-number");
      sawAttempt = true;
      index += 1;
      continue;
    }

    if (arg === "--type") {
      if (sawType) throw new ReportEventsError("INVALID_COMMAND", "duplicate --type");
      const value = args[index + 1];
      if (value === undefined || !eventTypeTokenPattern.test(value)) {
        throw new ReportEventsError("INVALID_COMMAND", "invalid --type value");
      }
      type = value;
      sawType = true;
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      if (sawLimit) throw new ReportEventsError("INVALID_COMMAND", "duplicate --limit");
      const value = args[index + 1];
      if (value === undefined) {
        throw new ReportEventsError("INVALID_COMMAND", "missing --limit value");
      }
      limit = parseLimit(value);
      sawLimit = true;
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new ReportEventsError("INVALID_COMMAND", `unknown flag ${arg}`);
    }

    if (jobId !== null) {
      throw new ReportEventsError("INVALID_COMMAND", "exactly one job id is required");
    }
    jobId = parseJobId(arg);
  }

  if (jobId === null) {
    throw new ReportEventsError("INVALID_COMMAND", "exactly one job id is required");
  }

  return { jobId, attempt, type, limit };
}

export async function getReportEvents(opts: GetReportEventsOptions): Promise<ReportEventsResult> {
  const dbPath = opts.dbPath ?? defaultReportEventsDbPath(opts.cwd);
  if (!existsSync(dbPath)) return { kind: "missing-db" };

  let db: Database | undefined;
  try {
    db = await openReadonlyDatabase(dbPath);
    const job = db
      .query<{ readonly id: string }, [string]>("SELECT id FROM jobs WHERE id = ?")
      .get(opts.args.jobId);

    if (job === null || job === undefined) {
      return { kind: "unknown-job", jobId: opts.args.jobId };
    }

    const rows = readEventRows(db, opts.args).map(formatEventRow);
    return { kind: "events", args: opts.args, rows };
  } catch (err) {
    if (err instanceof ReportEventsError) throw err;
    throw new ReportEventsError("DB_READ_FAILED", formatThrown(err), err);
  } finally {
    db?.close();
  }
}

export async function runReportEventsCli(
  opts: RunReportEventsCliOptions,
): Promise<number> {
  const writeStdout = opts.writeStdout ?? ((text: string) => process.stdout.write(text));
  const writeStderr = opts.writeStderr ?? ((text: string) => process.stderr.write(text));
  const rawArgs = opts.args ?? Bun.argv.slice(2);

  let parsed: ReportEventsArgs;
  try {
    parsed = parseReportEventsArgs(rawArgs);
  } catch (err) {
    writeStderr(`${formatCliError(err)}\n`);
    return 1;
  }

  try {
    const result = await getReportEvents({ cwd: opts.cwd, args: parsed, dbPath: opts.dbPath });
    if (result.kind === "missing-db") {
      writeStdout("NO_DATABASE\n");
      return 0;
    }

    if (result.kind === "unknown-job") {
      writeStderr(`UNKNOWN_JOB: ${result.jobId}\n`);
      return 1;
    }

    writeStdout(formatReportEvents(result.args, result.rows));
    return 0;
  } catch (err) {
    writeStderr(`${formatCliError(err)}\n`);
    return 1;
  }
}

export function formatReportEvents(
  args: ReportEventsArgs,
  rows: readonly ReportEventOutputRow[],
): string {
  return [
    [
      "EVENTS",
      `job_id=${args.jobId}`,
      `count=${rows.length}`,
      `attempt=${args.attempt ?? "all"}`,
      `type=${args.type ?? "all"}`,
      `limit=${args.limit ?? "all"}`,
    ].join("\t"),
    ...rows.map(formatEventOutputRow),
  ].join("\n") + "\n";
}

function readEventRows(db: Database, args: ReportEventsArgs): ReportEventDbRow[] {
  const where: string[] = ["job_id = ?"];
  const params: Array<string | number> = [args.jobId];

  if (args.attempt !== null) {
    where.push("attempt_number = ?");
    params.push(args.attempt);
  }

  if (args.type !== null) {
    where.push("type = ?");
    params.push(args.type);
  }

  const whereSql = where.join(" AND ");
  if (args.limit !== null) {
    return db
      .query<ReportEventDbRow, Array<string | number>>(`
        SELECT id, attempt_number, type, payload, created_at
        FROM (
          SELECT id, attempt_number, type, payload, created_at
          FROM events
          WHERE ${whereSql}
          ORDER BY events.id DESC
          LIMIT ?
        ) AS selected_events
        ORDER BY selected_events.id ASC
      `)
      .all(...params, args.limit);
  }

  return db
    .query<ReportEventDbRow, Array<string | number>>(`
      SELECT id, attempt_number, type, payload, created_at
      FROM events
      WHERE ${whereSql}
      ORDER BY events.id ASC
    `)
    .all(...params);
}

async function openReadonlyDatabase(dbPath: string): Promise<Database> {
  const sqliteModuleName = "bun:sqlite";
  const { Database } = await import(sqliteModuleName) as SqliteModule;
  return new Database(dbPath, { readonly: true });
}

function formatEventRow(row: ReportEventDbRow): ReportEventOutputRow {
  const eventId = positiveDbInteger(row.id, "event id");
  const attemptNumber = positiveDbInteger(row.attempt_number, "attempt_number");
  const type = formatEventType(row.type);
  const createdAtIso = formatCreatedAt(row.created_at);
  const payload = formatPayload(row.payload);
  return {
    eventId,
    attemptNumber,
    type,
    createdAtIso,
    payloadSha256: payload.sha256,
    payloadSummary: payload.summary,
  };
}

function formatEventOutputRow(row: ReportEventOutputRow): string {
  return [
    "EVENT",
    `event_id=${row.eventId}`,
    `attempt_number=${row.attemptNumber}`,
    `type=${row.type}`,
    `created_at=${row.createdAtIso}`,
    `payload_sha256=${row.payloadSha256}`,
    `payload_summary=${row.payloadSummary}`,
  ].join("\t");
}

function parseJobId(value: string): string {
  if (
    value.length === 0 ||
    value !== value.trim() ||
    value.startsWith("-") ||
    /[\s\r\n\t]/.test(value) ||
    value.includes("/") ||
    value.includes("\\") ||
    value === "." ||
    value === ".."
  ) {
    throw new ReportEventsError("INVALID_COMMAND", "invalid job id");
  }
  return value;
}

function parsePositiveSafeInteger(value: string, label: string): number {
  if (
    value.length === 0 ||
    value !== value.trim() ||
    !positiveIntegerPattern.test(value)
  ) {
    throw new ReportEventsError("INVALID_COMMAND", `invalid ${label}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ReportEventsError("INVALID_COMMAND", `invalid ${label}`);
  }
  return parsed;
}

function parseLimit(value: string): number {
  const parsed = parsePositiveSafeInteger(value, "limit");
  if (parsed > 200) {
    throw new ReportEventsError("INVALID_COMMAND", "invalid limit");
  }
  return parsed;
}

function positiveDbInteger(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new ReportEventsError("EVENTS_READ_FAILED", `invalid ${label}`);
  }
  return value;
}

function formatEventType(value: unknown): string {
  if (typeof value !== "string") {
    throw new ReportEventsError("EVENTS_READ_FAILED", "invalid event type");
  }
  const formatted = fieldSafeScalar(value, 80);
  if (formatted.length === 0) {
    throw new ReportEventsError("EVENTS_READ_FAILED", "invalid event type");
  }
  return formatted;
}

function formatCreatedAt(value: unknown): string {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value)
  ) {
    throw new ReportEventsError("EVENTS_READ_FAILED", "invalid created_at");
  }

  try {
    return new Date(value * 1000).toISOString();
  } catch (err) {
    throw new ReportEventsError("EVENTS_READ_FAILED", "invalid created_at", err);
  }
}

function formatPayload(payload: unknown): {
  readonly sha256: string;
  readonly summary: string;
} {
  if (payload === null || payload === undefined) {
    return { sha256: "-", summary: "-" };
  }

  if (typeof payload !== "string") {
    const bytes = payload instanceof Uint8Array
      ? payload
      : new TextEncoder().encode(String(payload));
    return {
      sha256: createHash("sha256").update(bytes).digest("hex").slice(0, 12),
      summary: "<invalid-json>",
    };
  }

  const sha256 = createHash("sha256").update(payload).digest("hex").slice(0, 12);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { sha256, summary: "<invalid-json>" };
  }

  return { sha256, summary: summarizeParsedPayload(parsed) };
}

function summarizeParsedPayload(parsed: unknown): string {
  if (Array.isArray(parsed)) return "<array>";
  if (parsed === null || typeof parsed !== "object") {
    return "<json-scalar>";
  }

  const record = parsed as Record<string, unknown>;
  const parts = Object.keys(record)
    .sort()
    .slice(0, 6)
    .map((key) => {
      const safeKey = payloadFieldSafeScalar(key, 40) || "<empty-key>";
      return `${safeKey}=${summarizePayloadValue(record[key])}`;
    });

  const summary = parts.length === 0 ? "<object>" : parts.join(",");
  return payloadFieldSafeScalar(summary, 200) || "<object>";
}

function summarizePayloadValue(value: unknown): string {
  if (Array.isArray(value)) return "<array>";
  if (value !== null && typeof value === "object") return "<object>";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return payloadFieldSafeScalar(String(value), 80);
  }
  return payloadFieldSafeScalar(String(value), 80);
}

function fieldSafeScalar(value: string, maxLength: number): string {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function payloadFieldSafeScalar(value: string, maxLength: number): string {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[|[\]()`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function formatCliError(err: unknown): string {
  if (err instanceof ReportEventsError) return err.message;
  return `DB_READ_FAILED: ${formatThrown(err)}`;
}

function formatThrown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

if (import.meta.main) {
  const exitCode = await runReportEventsCli({
    cwd: process.cwd(),
  });
  process.exit(exitCode);
}
