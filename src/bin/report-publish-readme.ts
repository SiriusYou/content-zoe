import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildReadmePublishEntry,
  publishReadmeDestination,
  ReadmePublishDestinationError,
  type ReadmePublishJobRow,
  type ReadmePublishResult,
} from "../lib/readme-publish-destination.ts";
import type { PublishManifest } from "../promote.ts";

export interface ReportPublishReadmeArgs {
  readonly jobId: string;
}

interface PromotedEventRow {
  readonly job_id: string;
  readonly attempt_number: number;
  readonly payload: string | null;
}

interface SqliteDatabase {
  query<T, Params extends readonly unknown[]>(sql: string): {
    get(...params: Params): T | null;
  };
  close(): void;
}

interface SqliteModule {
  readonly Database: new (path: string, options: { readonly: boolean }) => SqliteDatabase;
}

export interface RunReportPublishReadmeCliOptions {
  readonly cwd: string;
  readonly args?: readonly string[];
  readonly dbPath?: string;
  readonly readmePath?: string;
  readonly writeStdout?: (text: string) => void;
  readonly writeStderr?: (text: string) => void;
}

export type ReportPublishReadmeResult =
  | { readonly kind: "missing-db" }
  | { readonly kind: "published"; readonly jobId: string; readonly publish: ReadmePublishResult };

export type ReportPublishReadmeErrorCode =
  | "INVALID_COMMAND"
  | "UNKNOWN_JOB"
  | "JOB_NOT_PUBLISHED"
  | "PUBLISH_MANIFEST_MISSING"
  | "PUBLISH_MANIFEST_INVALID"
  | "DB_READ_FAILED";

export class ReportPublishReadmeError extends Error {
  readonly name = "ReportPublishReadmeError";
  readonly code: ReportPublishReadmeErrorCode;
  override readonly cause?: unknown;

  constructor(code: ReportPublishReadmeErrorCode, detail?: string, cause?: unknown) {
    super(detail === undefined || detail.length === 0 ? code : `${code}: ${detail}`);
    this.code = code;
    this.cause = cause;
  }
}

export function defaultReportPublishReadmeDbPath(cwd: string): string {
  return resolve(cwd, ".data", "content.db");
}

export function parseReportPublishReadmeArgs(
  args: readonly string[],
): ReportPublishReadmeArgs {
  if (args.length !== 1) {
    throw new ReportPublishReadmeError("INVALID_COMMAND");
  }
  return { jobId: parseJobId(args[0]) };
}

export async function getReportPublishReadme(
  opts: {
    readonly cwd: string;
    readonly args: ReportPublishReadmeArgs;
    readonly dbPath?: string;
    readonly readmePath?: string;
  },
): Promise<ReportPublishReadmeResult> {
  const dbPath = opts.dbPath ?? defaultReportPublishReadmeDbPath(opts.cwd);
  if (!existsSync(dbPath)) return { kind: "missing-db" };

  let job: ReadmePublishJobRow;
  let event: PromotedEventRow | null | undefined;
  let db: SqliteDatabase | undefined;
  try {
    db = await openReadonlyDatabase(dbPath);
    const row = db
      .query<ReadmePublishJobRow, [string]>(`
        SELECT
          id,
          week_key,
          topic,
          attempt_number,
          status,
          artifact_dir,
          primary_report_path,
          translated_report_path,
          sources_path,
          approval_summary,
          updated_at
        FROM jobs
        WHERE id = ?
      `)
      .get(opts.args.jobId);

    if (row === null || row === undefined) {
      throw new ReportPublishReadmeError("UNKNOWN_JOB", opts.args.jobId);
    }
    job = row;
    if (job.status !== "published") {
      throw new ReportPublishReadmeError("JOB_NOT_PUBLISHED", job.id);
    }
    if (job.artifact_dir === null || job.artifact_dir.trim().length === 0) {
      throw new ReportPublishReadmeError(
        "PUBLISH_MANIFEST_INVALID",
        "published job missing artifact_dir",
      );
    }

    event = db
      .query<PromotedEventRow, [string, number]>(`
        SELECT job_id, attempt_number, payload
        FROM events
        WHERE job_id = ? AND attempt_number = ? AND type = 'promoted'
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(job.id, job.attempt_number);
  } catch (err) {
    if (err instanceof ReportPublishReadmeError) throw err;
    throw new ReportPublishReadmeError("DB_READ_FAILED", formatThrown(err), err);
  } finally {
    db?.close();
  }

  const manifest = readPromotedManifest(job, event);
  const entry = buildReadmePublishEntry({
    cwd: opts.cwd,
    job,
    manifest,
  });
  return {
    kind: "published",
    jobId: job.id,
    publish: publishReadmeDestination({
      cwd: opts.cwd,
      entry,
      readmePath: opts.readmePath,
    }),
  };
}

export async function runReportPublishReadmeCli(
  opts: RunReportPublishReadmeCliOptions,
): Promise<number> {
  const writeStdout = opts.writeStdout ?? ((text: string) => process.stdout.write(text));
  const writeStderr = opts.writeStderr ?? ((text: string) => process.stderr.write(text));
  const args = opts.args ?? Bun.argv.slice(2);

  let parsed: ReportPublishReadmeArgs;
  try {
    parsed = parseReportPublishReadmeArgs(args);
  } catch (err) {
    writeStderr(`${formatCliError(err)}\n`);
    return 1;
  }

  try {
    const result = await getReportPublishReadme({
      cwd: opts.cwd,
      args: parsed,
      dbPath: opts.dbPath,
      readmePath: opts.readmePath,
    });
    if (result.kind === "missing-db") {
      writeStdout("NO_DATABASE\n");
      return 0;
    }
    writeStdout(formatReadmePublish(result.jobId, result.publish));
    return 0;
  } catch (err) {
    writeStderr(`${formatCliError(err)}\n`);
    return 1;
  }
}

function readPromotedManifest(
  job: ReadmePublishJobRow,
  event: PromotedEventRow | null | undefined,
): PublishManifest {
  if (event === null || event === undefined || event.payload === null) {
    throw new ReportPublishReadmeError("PUBLISH_MANIFEST_MISSING", job.id);
  }
  if (event.job_id !== job.id || event.attempt_number !== job.attempt_number) {
    throw new ReportPublishReadmeError("PUBLISH_MANIFEST_INVALID", "event row mismatch");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.payload);
  } catch (err) {
    throw new ReportPublishReadmeError("PUBLISH_MANIFEST_INVALID", "unparseable payload", err);
  }

  const payload = readObject(parsed);
  const manifest = readObject(payload?.publish_manifest);
  if (manifest === null) {
    throw new ReportPublishReadmeError("PUBLISH_MANIFEST_MISSING", job.id);
  }

  if (
    manifest.job_id !== job.id ||
    manifest.attempt_number !== job.attempt_number ||
    manifest.artifact_dir !== job.artifact_dir
  ) {
    throw new ReportPublishReadmeError("PUBLISH_MANIFEST_INVALID", "manifest row mismatch");
  }

  return manifest as unknown as PublishManifest;
}

function formatReadmePublish(jobId: string, publish: ReadmePublishResult): string {
  return [
    "README_PUBLISH",
    `job_id=${formatField(jobId)}`,
    `status=${publish.status}`,
    `readme=${publish.readmePath}`,
    `report=${formatField(publish.reportPath)}`,
    `sources=${formatField(publish.sourcesPath)}`,
    `aggregate_sha256=${publish.aggregateSha256.slice(0, 12).toLowerCase()}`,
    `entries=${publish.entries}`,
  ].join("\t") + "\n";
}

function parseJobId(value: string | undefined): string {
  if (
    value === undefined ||
    value.trim().length === 0 ||
    value.trim().startsWith("-") ||
    /[\r\n\t]/.test(value)
  ) {
    throw new ReportPublishReadmeError("INVALID_COMMAND");
  }
  return value.trim();
}

function formatCliError(err: unknown): string {
  if (err instanceof ReportPublishReadmeError) return err.message;
  if (err instanceof ReadmePublishDestinationError) return err.message;
  return `DB_READ_FAILED: ${formatThrown(err)}`;
}

function formatField(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

async function openReadonlyDatabase(dbPath: string): Promise<SqliteDatabase> {
  const moduleName = "bun" + ":sqlite";
  const sqlite = await import(moduleName) as SqliteModule;
  return new sqlite.Database(dbPath, { readonly: true });
}

function formatThrown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

if (import.meta.main) {
  const exitCode = await runReportPublishReadmeCli({
    cwd: process.cwd(),
  });
  process.exit(exitCode);
}
