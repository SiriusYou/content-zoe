import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { Database } from "bun:sqlite";

export interface ReportStatusJobRow {
  readonly id: string;
  readonly week_key: string;
  readonly attempt_number: number;
  readonly status: string;
  readonly current_stage: string;
  readonly run_dir: string | null;
  readonly artifact_dir: string | null;
  readonly primary_report_path: string | null;
  readonly translated_report_path: string | null;
  readonly sources_path: string | null;
  readonly approval_summary: string | null;
  readonly notified_at: number | null;
  readonly last_notify_error: string | null;
  readonly error: string | null;
  readonly updated_at: number;
}

export interface PromotedEventPayloadRow {
  readonly payload: string | null;
}

export interface GetReportStatusOptions {
  readonly cwd: string;
  readonly jobId: string;
  readonly dbPath?: string;
}

export interface RunReportStatusCliOptions {
  readonly cwd: string;
  readonly args?: readonly string[];
  readonly dbPath?: string;
  readonly writeStdout?: (text: string) => void;
  readonly writeStderr?: (text: string) => void;
}

export type PublishManifestAuthority =
  | { readonly state: "not_applicable" }
  | { readonly state: "missing" }
  | { readonly state: "unparseable" }
  | {
      readonly state: "present";
      readonly files: number;
      readonly aggregateSha256: string;
    };

export type ReportStatusResult =
  | { readonly kind: "missing-db" }
  | { readonly kind: "unknown-job"; readonly jobId: string }
  | {
      readonly kind: "job";
      readonly row: ReportStatusJobRow;
      readonly manifest: PublishManifestAuthority;
    };

export class ReportStatusError extends Error {
  readonly name = "ReportStatusError";
  readonly code = "DB_READ_FAILED";
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

export function defaultReportStatusDbPath(cwd: string): string {
  return resolve(cwd, ".data", "content.db");
}

export function getReportStatus(
  opts: GetReportStatusOptions,
): ReportStatusResult {
  const dbPath = opts.dbPath ?? defaultReportStatusDbPath(opts.cwd);
  if (!existsSync(dbPath)) return { kind: "missing-db" };

  let db: Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true });
    const row = db
      .query<ReportStatusJobRow, [string]>(`
        SELECT
          id,
          week_key,
          attempt_number,
          status,
          current_stage,
          run_dir,
          artifact_dir,
          primary_report_path,
          translated_report_path,
          sources_path,
          approval_summary,
          notified_at,
          last_notify_error,
          error,
          updated_at
        FROM jobs
        WHERE id = ?
      `)
      .get(opts.jobId);

    if (row === null || row === undefined) {
      return { kind: "unknown-job", jobId: opts.jobId };
    }

    const promotedPayload = row.status === "published"
      ? db
          .query<PromotedEventPayloadRow, [string]>(`
            SELECT payload
            FROM events
            WHERE job_id = ? AND type = 'promoted'
            ORDER BY id DESC
            LIMIT 1
          `)
          .get(row.id)?.payload ?? null
      : null;

    return {
      kind: "job",
      row,
      manifest: readPromotedManifestAuthority(row.status, promotedPayload),
    };
  } catch (err) {
    throw new ReportStatusError(`DB_READ_FAILED: ${formatThrown(err)}`, err);
  } finally {
    db?.close();
  }
}

export async function runReportStatusCli(
  opts: RunReportStatusCliOptions,
): Promise<number> {
  const writeStdout = opts.writeStdout ?? ((text: string) => process.stdout.write(text));
  const writeStderr = opts.writeStderr ?? ((text: string) => process.stderr.write(text));
  const args = opts.args ?? Bun.argv.slice(2);
  const jobId = parseJobIdArg(args);

  if (jobId === null) {
    writeStderr("INVALID_COMMAND\n");
    return 1;
  }

  try {
    const result = getReportStatus({ cwd: opts.cwd, dbPath: opts.dbPath, jobId });
    if (result.kind === "missing-db") {
      writeStdout("NO_DATABASE\n");
      return 0;
    }

    if (result.kind === "unknown-job") {
      writeStderr(`UNKNOWN_JOB: ${result.jobId}\n`);
      return 1;
    }

    writeStdout(formatReportStatus(result.row, result.manifest));
    return 0;
  } catch (err) {
    writeStderr(`${formatCliError(err)}\n`);
    return 1;
  }
}

export function parseJobIdArg(args: readonly string[]): string | null {
  if (args.length !== 1) return null;
  const jobId = args[0]?.trim();
  if (jobId === undefined || jobId.length === 0 || jobId.startsWith("-")) {
    return null;
  }
  return jobId;
}

export function formatReportStatus(
  row: ReportStatusJobRow,
  manifest: PublishManifestAuthority,
): string {
  return [
    [
      "STATUS",
      `job_id=${row.id}`,
      `week_key=${row.week_key}`,
      `status=${row.status}`,
      `stage=${row.current_stage}`,
      `attempt=${row.attempt_number}`,
      `updated_at=${row.updated_at}`,
    ].join("\t"),
    [
      "PATHS",
      `run_dir=${formatPathValue(row.run_dir)}`,
      `artifact_dir=${formatPathValue(row.artifact_dir)}`,
      `primary_report=${formatPathValue(row.primary_report_path)}`,
      `translated_report=${formatPathValue(row.translated_report_path)}`,
      `sources=${formatPathValue(row.sources_path)}`,
    ].join("\t"),
    formatManifestRecord(manifest),
    [
      "APPROVAL",
      `approval_summary=${formatApprovalSummary(row.approval_summary)}`,
      `notified_at=${row.notified_at ?? "null"}`,
      `last_notify_error=${formatExcerpt(row.last_notify_error)}`,
    ].join("\t"),
    [
      "ERROR",
      `error=${formatExcerpt(row.error)}`,
    ].join("\t"),
  ].join("\n") + "\n";
}

export function readPromotedManifestAuthority(
  status: string,
  payload: string | null,
): PublishManifestAuthority {
  if (status !== "published") return { state: "not_applicable" };
  if (payload === null) return { state: "missing" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { state: "unparseable" };
  }

  const manifest = readObject(readObject(parsed)?.publish_manifest);
  if (manifest === null) return { state: "missing" };

  const files = manifest.files;
  const aggregateSha = manifest.aggregate_sha256;
  if (
    !Array.isArray(files) ||
    typeof aggregateSha !== "string" ||
    !/^[a-fA-F0-9]{12,}$/.test(aggregateSha)
  ) {
    return { state: "unparseable" };
  }

  return {
    state: "present",
    files: files.length,
    aggregateSha256: aggregateSha.slice(0, 12).toLowerCase(),
  };
}

function formatManifestRecord(manifest: PublishManifestAuthority): string {
  if (manifest.state !== "present") {
    return [
      "MANIFEST",
      `publish_manifest=${manifest.state}`,
      "files=-",
      "aggregate_sha256=-",
    ].join("\t");
  }

  return [
    "MANIFEST",
    "publish_manifest=present",
    `files=${manifest.files}`,
    `aggregate_sha256=${manifest.aggregateSha256}`,
  ].join("\t");
}

export function formatApprovalSummary(value: string | null): string {
  if (value === null) return "-";
  const lines = value
    .split(/\r?\n/)
    .map((line) => collapseWhitespace(line))
    .filter((line) => line.length > 0);
  const evidenceLine = lines.find((line) =>
    /EVIDENCE_GRADE|Evidence Grade/.test(line),
  );
  return formatExcerpt(evidenceLine ?? value);
}

export function formatExcerpt(value: string | null): string {
  if (value === null) return "-";
  const summary = collapseWhitespace(value);
  if (summary.length === 0) return "-";
  return summary.length > 160 ? summary.slice(0, 160) : summary;
}

function formatPathValue(value: string | null): string {
  if (value === null) return "-";
  const summary = collapseWhitespace(value);
  return summary.length === 0 ? "-" : summary;
}

function collapseWhitespace(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function formatCliError(err: unknown): string {
  if (err instanceof ReportStatusError) return err.message;
  return `DB_READ_FAILED: ${formatThrown(err)}`;
}

function formatThrown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

if (import.meta.main) {
  const exitCode = await runReportStatusCli({
    cwd: process.cwd(),
  });
  process.exit(exitCode);
}
