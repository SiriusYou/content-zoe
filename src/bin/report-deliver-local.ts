import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  LocalFolderPublishDestination,
  PublishDestinationError,
  type DeliveryResult,
} from "../lib/publish-destination.ts";
import type { PublishManifest } from "../promote.ts";

export interface ReportDeliverLocalArgs {
  readonly jobId: string;
  readonly destinationRoot: string;
}

export interface PublishedJobRow {
  readonly id: string;
  readonly attempt_number: number;
  readonly status: string;
  readonly artifact_dir: string | null;
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

export interface RunReportDeliverLocalCliOptions {
  readonly cwd: string;
  readonly args?: readonly string[];
  readonly dbPath?: string;
  readonly now?: () => Date;
  readonly writeStdout?: (text: string) => void;
  readonly writeStderr?: (text: string) => void;
}

export type ReportDeliverLocalResult =
  | { readonly kind: "missing-db" }
  | { readonly kind: "delivered"; readonly delivery: DeliveryResult };

export type ReportDeliverLocalErrorCode =
  | "INVALID_COMMAND"
  | "UNKNOWN_JOB"
  | "JOB_NOT_PUBLISHED"
  | "PUBLISH_MANIFEST_MISSING"
  | "PUBLISH_MANIFEST_INVALID"
  | "DB_READ_FAILED";

export class ReportDeliverLocalError extends Error {
  readonly name = "ReportDeliverLocalError";
  readonly code: ReportDeliverLocalErrorCode;
  override readonly cause?: unknown;

  constructor(code: ReportDeliverLocalErrorCode, detail?: string, cause?: unknown) {
    super(detail === undefined || detail.length === 0 ? code : `${code}: ${detail}`);
    this.code = code;
    this.cause = cause;
  }
}

export function defaultReportDeliverLocalDbPath(cwd: string): string {
  return resolve(cwd, ".data", "content.db");
}

export function parseReportDeliverLocalArgs(
  args: readonly string[],
): ReportDeliverLocalArgs {
  if (args.length !== 3 || args.some((arg) => arg.startsWith("--dest="))) {
    throw new ReportDeliverLocalError("INVALID_COMMAND");
  }

  if (args[1] === "--dest") {
    return {
      jobId: parseJobId(args[0]),
      destinationRoot: parseDestination(args[2]),
    };
  }

  if (args[0] === "--dest") {
    return {
      jobId: parseJobId(args[2]),
      destinationRoot: parseDestination(args[1]),
    };
  }

  throw new ReportDeliverLocalError("INVALID_COMMAND");
}

export async function getReportDeliverLocal(
  opts: {
    readonly cwd: string;
    readonly args: ReportDeliverLocalArgs;
    readonly dbPath?: string;
    readonly now?: () => Date;
  },
): Promise<ReportDeliverLocalResult> {
  const dbPath = opts.dbPath ?? defaultReportDeliverLocalDbPath(opts.cwd);
  if (!existsSync(dbPath)) return { kind: "missing-db" };

  let db: SqliteDatabase | undefined;
  try {
    db = await openReadonlyDatabase(dbPath);
    const job = db
      .query<PublishedJobRow, [string]>(`
        SELECT id, attempt_number, status, artifact_dir
        FROM jobs
        WHERE id = ?
      `)
      .get(opts.args.jobId);

    if (job === null || job === undefined) {
      throw new ReportDeliverLocalError("UNKNOWN_JOB", opts.args.jobId);
    }
    if (job.status !== "published") {
      throw new ReportDeliverLocalError("JOB_NOT_PUBLISHED", job.id);
    }
    if (job.artifact_dir === null || job.artifact_dir.trim().length === 0) {
      throw new ReportDeliverLocalError(
        "PUBLISH_MANIFEST_INVALID",
        "published job missing artifact_dir",
      );
    }

    const event = db
      .query<PromotedEventRow, [string, number]>(`
        SELECT job_id, attempt_number, payload
        FROM events
        WHERE job_id = ? AND attempt_number = ? AND type = 'promoted'
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(job.id, job.attempt_number);

    const manifest = readPromotedManifest(job, event);
    const destination = new LocalFolderPublishDestination();
    return {
      kind: "delivered",
      delivery: destination.deliver({
        cwd: opts.cwd,
        destinationRoot: opts.args.destinationRoot,
        manifest,
        now: opts.now,
      }),
    };
  } catch (err) {
    if (err instanceof ReportDeliverLocalError || err instanceof PublishDestinationError) {
      throw err;
    }
    throw new ReportDeliverLocalError("DB_READ_FAILED", formatThrown(err), err);
  } finally {
    db?.close();
  }
}

export async function runReportDeliverLocalCli(
  opts: RunReportDeliverLocalCliOptions,
): Promise<number> {
  const writeStdout = opts.writeStdout ?? ((text: string) => process.stdout.write(text));
  const writeStderr = opts.writeStderr ?? ((text: string) => process.stderr.write(text));
  const args = opts.args ?? Bun.argv.slice(2);

  let parsed: ReportDeliverLocalArgs;
  try {
    parsed = parseReportDeliverLocalArgs(args);
  } catch (err) {
    writeStderr(`${formatCliError(err)}\n`);
    return 1;
  }

  try {
    const result = await getReportDeliverLocal({
      cwd: opts.cwd,
      args: parsed,
      dbPath: opts.dbPath,
      now: opts.now,
    });
    if (result.kind === "missing-db") {
      writeStdout("NO_DATABASE\n");
      return 0;
    }
    writeStdout(formatDelivery(result.delivery));
    return 0;
  } catch (err) {
    writeStderr(`${formatCliError(err)}\n`);
    return 1;
  }
}

function readPromotedManifest(
  job: PublishedJobRow,
  event: PromotedEventRow | null | undefined,
): PublishManifest {
  if (event === null || event === undefined || event.payload === null) {
    throw new ReportDeliverLocalError("PUBLISH_MANIFEST_MISSING", job.id);
  }
  if (event.job_id !== job.id || event.attempt_number !== job.attempt_number) {
    throw new ReportDeliverLocalError("PUBLISH_MANIFEST_INVALID", "event row mismatch");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.payload);
  } catch (err) {
    throw new ReportDeliverLocalError("PUBLISH_MANIFEST_INVALID", "unparseable payload", err);
  }

  const payload = readObject(parsed);
  const manifest = readObject(payload?.publish_manifest);
  if (manifest === null) {
    throw new ReportDeliverLocalError("PUBLISH_MANIFEST_MISSING", job.id);
  }

  if (
    manifest.job_id !== job.id ||
    manifest.attempt_number !== job.attempt_number ||
    manifest.artifact_dir !== job.artifact_dir
  ) {
    throw new ReportDeliverLocalError("PUBLISH_MANIFEST_INVALID", "manifest row mismatch");
  }

  return manifest as unknown as PublishManifest;
}

function formatDelivery(delivery: DeliveryResult): string {
  return [
    "DELIVERY",
    `job_id=${formatField(delivery.jobId)}`,
    `status=${delivery.status}`,
    `destination=${delivery.destinationKind}`,
    `artifact_dir=${formatField(delivery.artifactDir)}`,
    `delivered_dir=${formatField(delivery.deliveredDir)}`,
    `files=${delivery.files}`,
    `aggregate_sha256=${delivery.aggregateSha256.slice(0, 12).toLowerCase()}`,
  ].join("\t") + "\n";
}

function parseJobId(value: string | undefined): string {
  if (
    value === undefined ||
    value.trim().length === 0 ||
    value.startsWith("-") ||
    /[\r\n\t]/.test(value)
  ) {
    throw new ReportDeliverLocalError("INVALID_COMMAND");
  }
  return value.trim();
}

function parseDestination(value: string | undefined): string {
  if (
    value === undefined ||
    value.trim().length === 0 ||
    value.trim().startsWith("-") ||
    /[\r\n\t]/.test(value)
  ) {
    throw new ReportDeliverLocalError("INVALID_COMMAND");
  }
  return value.trim();
}

function formatCliError(err: unknown): string {
  if (err instanceof ReportDeliverLocalError) return err.message;
  if (err instanceof PublishDestinationError) return err.message;
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
  const exitCode = await runReportDeliverLocalCli({
    cwd: process.cwd(),
  });
  process.exit(exitCode);
}
