import {
  existsSync,
  realpathSync,
  readFileSync,
  statSync,
} from "node:fs";
import path, { resolve } from "node:path";

import { Database } from "bun:sqlite";

export type ReportShowArtifact =
  | "approval-summary"
  | "primary-report"
  | "translated-report"
  | "sources";

export interface ReportShowJobRow {
  readonly id: string;
  readonly status: string;
  readonly approval_summary: string | null;
  readonly primary_report_path: string | null;
  readonly translated_report_path: string | null;
  readonly sources_path: string | null;
}

export interface ReportShowArgs {
  readonly jobId: string;
  readonly artifact: ReportShowArtifact;
}

export interface GetReportShowOptions {
  readonly cwd: string;
  readonly args: ReportShowArgs;
  readonly dbPath?: string;
  readonly readTextFile?: (filePath: string) => string;
}

export interface RunReportShowCliOptions {
  readonly cwd: string;
  readonly args?: readonly string[];
  readonly dbPath?: string;
  readonly readTextFile?: (filePath: string) => string;
  readonly writeStdout?: (text: string) => void;
  readonly writeStderr?: (text: string) => void;
}

export type ReportShowResult =
  | { readonly kind: "missing-db" }
  | { readonly kind: "unknown-job"; readonly jobId: string }
  | {
      readonly kind: "artifact";
      readonly artifact: ReportShowArtifact;
      readonly jobId: string;
      readonly source: "db" | "file";
      readonly displayPath: string;
      readonly body: string;
    };

export class ReportShowError extends Error {
  readonly name = "ReportShowError";
  readonly code:
    | "INVALID_COMMAND"
    | "INVALID_ARTIFACT"
    | "NO_ARTIFACT"
    | "ARTIFACT_MISSING"
    | "UNSAFE_ARTIFACT_PATH"
    | "ARTIFACT_READ_FAILED"
    | "DB_READ_FAILED";
  override readonly cause?: unknown;

  constructor(
    code: ReportShowError["code"],
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.code = code;
    this.cause = cause;
  }
}

const artifactKeys = new Set<string>([
  "approval-summary",
  "primary-report",
  "translated-report",
  "sources",
]);

export function defaultReportShowDbPath(cwd: string): string {
  return resolve(cwd, ".data", "content.db");
}

export function parseReportShowArgs(args: readonly string[]): ReportShowArgs {
  if (args.length !== 3 || args[1] !== "--artifact") {
    throw new ReportShowError("INVALID_COMMAND", "INVALID_COMMAND");
  }

  const jobId = args[0]?.trim();
  const artifact = args[2]?.trim();
  if (jobId === undefined || jobId.length === 0 || jobId.startsWith("-")) {
    throw new ReportShowError("INVALID_COMMAND", "INVALID_COMMAND");
  }
  if (artifact === undefined || artifact.length === 0) {
    throw new ReportShowError("INVALID_COMMAND", "INVALID_COMMAND");
  }
  if (!artifactKeys.has(artifact)) {
    throw new ReportShowError(
      "INVALID_ARTIFACT",
      `INVALID_ARTIFACT: ${artifact}`,
    );
  }

  return {
    jobId,
    artifact: artifact as ReportShowArtifact,
  };
}

export function getReportShow(opts: GetReportShowOptions): ReportShowResult {
  const dbPath = opts.dbPath ?? defaultReportShowDbPath(opts.cwd);
  if (!existsSync(dbPath)) return { kind: "missing-db" };

  const row = readJobRow(dbPath, opts.args.jobId);
  if (row === null) return { kind: "unknown-job", jobId: opts.args.jobId };

  return resolveArtifact({
    artifact: opts.args.artifact,
    cwd: opts.cwd,
    jobId: row.id,
    readTextFile: opts.readTextFile,
    row,
  });
}

export async function runReportShowCli(
  opts: RunReportShowCliOptions,
): Promise<number> {
  const writeStdout = opts.writeStdout ?? ((text: string) => process.stdout.write(text));
  const writeStderr = opts.writeStderr ?? ((text: string) => process.stderr.write(text));
  const args = opts.args ?? Bun.argv.slice(2);

  let parsed: ReportShowArgs;
  try {
    parsed = parseReportShowArgs(args);
  } catch (err) {
    writeStderr(`${formatCliError(err)}\n`);
    return 1;
  }

  try {
    const result = getReportShow({
      cwd: opts.cwd,
      args: parsed,
      dbPath: opts.dbPath,
      readTextFile: opts.readTextFile,
    });

    if (result.kind === "missing-db") {
      writeStdout("NO_DATABASE\n");
      return 0;
    }

    if (result.kind === "unknown-job") {
      writeStderr(`UNKNOWN_JOB: ${result.jobId}\n`);
      return 1;
    }

    writeStdout(formatReportShow(result));
    return 0;
  } catch (err) {
    writeStderr(`${formatCliError(err)}\n`);
    return 1;
  }
}

function readJobRow(dbPath: string, jobId: string): ReportShowJobRow | null {
  let db: Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true });
    return db
      .query<ReportShowJobRow, [string]>(`
        SELECT
          id,
          status,
          approval_summary,
          primary_report_path,
          translated_report_path,
          sources_path
        FROM jobs
        WHERE id = ?
      `)
      .get(jobId) ?? null;
  } catch (err) {
    throw new ReportShowError("DB_READ_FAILED", `DB_READ_FAILED: ${formatThrown(err)}`, err);
  } finally {
    db?.close();
  }
}

function resolveArtifact(opts: {
  readonly artifact: ReportShowArtifact;
  readonly cwd: string;
  readonly jobId: string;
  readonly readTextFile?: (filePath: string) => string;
  readonly row: ReportShowJobRow;
}): ReportShowResult {
  if (opts.artifact === "approval-summary") {
    const body = opts.row.approval_summary;
    if (body === null || body.trim().length === 0) {
      throw new ReportShowError("NO_ARTIFACT", "NO_ARTIFACT: approval-summary");
    }
    return {
      kind: "artifact",
      artifact: opts.artifact,
      jobId: opts.jobId,
      source: "db",
      displayPath: "-",
      body,
    };
  }

  const rawPath = pathForArtifact(opts.row, opts.artifact);
  const displayPath = collapseWhitespace(rawPath);
  if (displayPath.length === 0) {
    throw new ReportShowError("NO_ARTIFACT", `NO_ARTIFACT: ${opts.artifact}`);
  }

  const readPath = validateArtifactPath({
    artifact: opts.artifact,
    cwd: opts.cwd,
    displayPath,
  });

  let body: string;
  try {
    body = opts.readTextFile?.(readPath) ?? readFileSync(readPath, "utf8");
  } catch (err) {
    throw new ReportShowError(
      "ARTIFACT_READ_FAILED",
      `ARTIFACT_READ_FAILED: ${formatThrown(err)}`,
      err,
    );
  }

  return {
    kind: "artifact",
    artifact: opts.artifact,
    jobId: opts.jobId,
    source: "file",
    displayPath,
    body,
  };
}

function pathForArtifact(
  row: ReportShowJobRow,
  artifact: Exclude<ReportShowArtifact, "approval-summary">,
): string | null {
  switch (artifact) {
    case "primary-report":
      return row.primary_report_path;
    case "translated-report":
      return row.translated_report_path;
    case "sources":
      return row.sources_path;
  }
}

function validateArtifactPath(opts: {
  readonly artifact: ReportShowArtifact;
  readonly cwd: string;
  readonly displayPath: string;
}): string {
  const realCwd = realpathSync(opts.cwd);
  const candidate = path.isAbsolute(opts.displayPath)
    ? resolve(opts.displayPath)
    : resolve(realCwd, opts.displayPath);

  if (!isContainedPath(realCwd, candidate)) {
    throw unsafeArtifactPath(opts.artifact, opts.displayPath);
  }

  let realCandidate: string;
  try {
    realCandidate = realpathSync(candidate);
  } catch (err) {
    if (isMissingPathError(err)) {
      throw new ReportShowError(
        "ARTIFACT_MISSING",
        `ARTIFACT_MISSING: ${opts.artifact} ${opts.displayPath}`,
        err,
      );
    }
    throw new ReportShowError(
      "ARTIFACT_READ_FAILED",
      `ARTIFACT_READ_FAILED: ${formatThrown(err)}`,
      err,
    );
  }

  if (!isContainedPath(realCwd, realCandidate)) {
    throw unsafeArtifactPath(opts.artifact, opts.displayPath);
  }

  let stat;
  try {
    stat = statSync(realCandidate);
  } catch (err) {
    throw new ReportShowError(
      "ARTIFACT_READ_FAILED",
      `ARTIFACT_READ_FAILED: ${formatThrown(err)}`,
      err,
    );
  }

  if (!stat.isFile()) {
    throw unsafeArtifactPath(opts.artifact, opts.displayPath);
  }

  return realCandidate;
}

function isContainedPath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (
    relative.length > 0 &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

function unsafeArtifactPath(
  artifact: ReportShowArtifact,
  displayPath: string,
): ReportShowError {
  return new ReportShowError(
    "UNSAFE_ARTIFACT_PATH",
    `UNSAFE_ARTIFACT_PATH: ${artifact} ${displayPath}`,
  );
}

export function formatReportShow(result: Extract<ReportShowResult, { kind: "artifact" }>): string {
  const body = normalizeBody(result.body);
  const bytes = new TextEncoder().encode(body).length;
  return [
    [
      "ARTIFACT",
      `job_id=${result.jobId}`,
      `artifact=${result.artifact}`,
      `source=${result.source}`,
      `path=${result.displayPath}`,
      `bytes=${bytes}`,
    ].join("\t"),
    "",
    body,
  ].join("\n");
}

function normalizeBody(body: string): string {
  return body.endsWith("\n") ? body : `${body}\n`;
}

function collapseWhitespace(value: string | null): string {
  if (value === null) return "";
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function isMissingPathError(err: unknown): boolean {
  return typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT";
}

function formatCliError(err: unknown): string {
  if (err instanceof ReportShowError) return err.message;
  return `DB_READ_FAILED: ${formatThrown(err)}`;
}

function formatThrown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

if (import.meta.main) {
  const exitCode = await runReportShowCli({
    cwd: process.cwd(),
  });
  process.exit(exitCode);
}
