import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  realpathSync,
  readdirSync,
  statSync,
} from "node:fs";
import path, { resolve } from "node:path";

import { Database } from "bun:sqlite";

export type ContentImageShowArtifact = "request" | "spec" | "image" | "verdict";

export interface ContentImageShowArgs {
  readonly jobId: string;
  readonly artifact: ContentImageShowArtifact;
}

export interface ContentImageShowJobRow {
  readonly id: string;
  readonly modality: string;
  readonly status: string;
  readonly attempt_number: number;
}

export interface RunContentImageShowCliOptions {
  readonly cwd: string;
  readonly args?: readonly string[];
  readonly dbPath?: string;
  readonly writeStdout?: (text: string) => void;
  readonly writeStderr?: (text: string) => void;
}

export class ContentImageShowError extends Error {
  readonly name = "ContentImageShowError";
  readonly code:
    | "INVALID_COMMAND"
    | "INVALID_ARTIFACT"
    | "UNKNOWN_JOB"
    | "WRONG_MODALITY"
    | "NO_DATABASE"
    | "NO_ATTEMPT"
    | "ARTIFACT_MISSING"
    | "UNSAFE_ARTIFACT_PATH"
    | "DB_READ_FAILED";
  override readonly cause?: unknown;

  constructor(
    code: ContentImageShowError["code"],
    message?: string,
    cause?: unknown,
  ) {
    super(message ?? code);
    this.code = code;
    this.cause = cause;
  }
}

const artifacts = new Set<string>(["request", "spec", "image", "verdict"]);
const attemptPattern = /^attempt-(\d+)$/;

export async function runContentImageShowCli(
  opts: RunContentImageShowCliOptions,
): Promise<number> {
  const writeStdout = opts.writeStdout ?? ((text: string) => process.stdout.write(text));
  const writeStderr = opts.writeStderr ?? ((text: string) => process.stderr.write(text));
  try {
    const args = parseContentImageShowArgs(opts.args ?? Bun.argv.slice(2));
    const output = getContentImageShow({
      cwd: opts.cwd,
      dbPath: opts.dbPath,
      args,
    });
    writeStdout(output);
    return 0;
  } catch (err) {
    if (err instanceof ContentImageShowError && err.code === "NO_DATABASE") {
      writeStdout("NO_DATABASE\n");
      return 0;
    }
    writeStderr(`${formatError(err)}\n`);
    return 1;
  }
}

export function parseContentImageShowArgs(
  argv: readonly string[],
): ContentImageShowArgs {
  if (argv.length !== 3 || argv[1] !== "--artifact") {
    throw new ContentImageShowError("INVALID_COMMAND", "INVALID_COMMAND");
  }
  const jobId = argv[0]?.trim();
  const artifact = argv[2]?.trim();
  if (!jobId || jobId.startsWith("-")) {
    throw new ContentImageShowError("INVALID_COMMAND", "INVALID_COMMAND");
  }
  if (!artifact || !artifacts.has(artifact)) {
    throw new ContentImageShowError(
      "INVALID_ARTIFACT",
      `INVALID_ARTIFACT: ${artifact ?? ""}`,
    );
  }
  return { jobId, artifact: artifact as ContentImageShowArtifact };
}

export function getContentImageShow(opts: {
  readonly cwd: string;
  readonly dbPath?: string;
  readonly args: ContentImageShowArgs;
}): string {
  const cwd = realpathSync(opts.cwd);
  const dbPath = opts.dbPath ?? resolve(cwd, ".data", "content.db");
  if (!existsSync(dbPath)) {
    throw new ContentImageShowError("NO_DATABASE", "NO_DATABASE");
  }
  const job = readImageJob(dbPath, opts.args.jobId);
  if (job === null) {
    throw new ContentImageShowError("UNKNOWN_JOB", `UNKNOWN_JOB: ${opts.args.jobId}`);
  }
  if (job.modality !== "image") {
    throw new ContentImageShowError("WRONG_MODALITY", `WRONG_MODALITY: ${opts.args.jobId}`);
  }

  const attemptDir = resolveAttemptDir(cwd, job);
  const artifactPath = resolveArtifactPath(attemptDir, opts.args.artifact);
  if (opts.args.artifact === "image") {
    return formatImageMetadata({
      cwd,
      jobId: job.id,
      artifact: opts.args.artifact,
      imagePath: artifactPath,
    });
  }
  const body = readFileSync(artifactPath, "utf8");
  return formatTextArtifact({
    cwd,
    jobId: job.id,
    artifact: opts.args.artifact,
    artifactPath,
    body,
  });
}

function readImageJob(
  dbPath: string,
  jobId: string,
): ContentImageShowJobRow | null {
  let db: Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true });
    return db
      .query<ContentImageShowJobRow, [string]>(`
        SELECT id, modality, status, attempt_number
        FROM jobs
        WHERE id = ?
      `)
      .get(jobId) ?? null;
  } catch (err) {
    throw new ContentImageShowError(
      "DB_READ_FAILED",
      `DB_READ_FAILED: ${formatThrown(err)}`,
      err,
    );
  } finally {
    db?.close();
  }
}

function resolveAttemptDir(cwd: string, job: ContentImageShowJobRow): string {
  const jobRoot = resolve(cwd, ".runs", job.id);
  assertContained(cwd, jobRoot, "job root");
  if (!existsSync(jobRoot)) {
    throw new ContentImageShowError("NO_ATTEMPT", `NO_ATTEMPT: ${job.id}`);
  }
  const preferred = resolve(jobRoot, `attempt-${job.attempt_number}`);
  if (existsSync(preferred)) {
    return assertRegularDir(cwd, preferred);
  }

  const attempts = readdirSync(jobRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const match = attemptPattern.exec(entry.name);
      return match
        ? { attemptNumber: Number(match[1]), dir: resolve(jobRoot, entry.name) }
        : null;
    })
    .filter((entry): entry is { attemptNumber: number; dir: string } => entry !== null)
    .sort((a, b) => a.attemptNumber - b.attemptNumber);
  const latest = attempts.at(-1);
  if (!latest) {
    throw new ContentImageShowError("NO_ATTEMPT", `NO_ATTEMPT: ${job.id}`);
  }
  return assertRegularDir(cwd, latest.dir);
}

function resolveArtifactPath(
  attemptDir: string,
  artifact: ContentImageShowArtifact,
): string {
  const fileName = {
    request: "request.txt",
    spec: "spec.json",
    image: "image.png",
    verdict: "verdict.json",
  }[artifact];
  const candidate = resolve(attemptDir, fileName);
  assertContained(attemptDir, candidate, `${artifact} path`);
  let realCandidate: string;
  try {
    realCandidate = realpathSync(candidate);
  } catch (err) {
    throw new ContentImageShowError(
      "ARTIFACT_MISSING",
      `ARTIFACT_MISSING: ${artifact}`,
      err,
    );
  }
  assertContained(attemptDir, realCandidate, `${artifact} realpath`);
  const stat = statSync(realCandidate);
  if (!stat.isFile()) {
    throw new ContentImageShowError(
      "UNSAFE_ARTIFACT_PATH",
      `UNSAFE_ARTIFACT_PATH: ${artifact}`,
    );
  }
  return realCandidate;
}

function formatTextArtifact(opts: {
  readonly cwd: string;
  readonly jobId: string;
  readonly artifact: ContentImageShowArtifact;
  readonly artifactPath: string;
  readonly body: string;
}): string {
  const body = opts.body.endsWith("\n") ? opts.body : `${opts.body}\n`;
  const bytes = new TextEncoder().encode(body).length;
  return [
    [
      "IMAGE_ARTIFACT",
      `job_id=${opts.jobId}`,
      `artifact=${opts.artifact}`,
      `path=${displayPath(opts.cwd, opts.artifactPath)}`,
      `bytes=${bytes}`,
    ].join("\t"),
    "",
    body,
  ].join("\n");
}

function formatImageMetadata(opts: {
  readonly cwd: string;
  readonly jobId: string;
  readonly artifact: ContentImageShowArtifact;
  readonly imagePath: string;
}): string {
  const bytes = readFileSync(opts.imagePath);
  const dimensions = readPngDimensions(bytes);
  return [
    [
      "IMAGE_ARTIFACT",
      `job_id=${opts.jobId}`,
      `artifact=${opts.artifact}`,
      `path=${displayPath(opts.cwd, opts.imagePath)}`,
      `bytes=${bytes.byteLength}`,
      `sha256=${createHash("sha256").update(bytes).digest("hex")}`,
      `dimensions=${dimensions.width}x${dimensions.height}`,
    ].join("\t"),
    "",
  ].join("\n");
}

function readPngDimensions(bytes: Buffer): { width: number; height: number } {
  if (
    bytes.byteLength < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    throw new ContentImageShowError("ARTIFACT_MISSING", "ARTIFACT_MISSING: image is not PNG");
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function assertRegularDir(cwd: string, dir: string): string {
  const realDir = realpathSync(dir);
  assertContained(cwd, realDir, "attempt dir");
  if (!statSync(realDir).isDirectory()) {
    throw new ContentImageShowError("NO_ATTEMPT", `NO_ATTEMPT: ${dir}`);
  }
  return realDir;
}

function assertContained(root: string, candidate: string, label: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new ContentImageShowError(
    "UNSAFE_ARTIFACT_PATH",
    `UNSAFE_ARTIFACT_PATH: ${label}`,
  );
}

function displayPath(cwd: string, absPath: string): string {
  return path.relative(cwd, absPath).split(path.sep).join("/");
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function formatThrown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

if (import.meta.main) {
  const code = await runContentImageShowCli({
    cwd: process.cwd(),
  });
  process.exit(code);
}
