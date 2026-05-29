import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path, { resolve } from "node:path";

import {
  DbConstraintError,
  findJobById,
  insertJob,
  openDb,
  type DbClient,
  type Job,
} from "../db.ts";
import { Modality } from "../pipeline/modality.ts";
import { sanitizeTopic, TopicSanitizationError } from "../security/sanitize.ts";

export interface ContentImageCreateArgs {
  readonly prompt: string;
  readonly key?: string;
}

export interface ContentImageCreateResult {
  readonly jobId: string;
  readonly key: string;
  readonly requestPath: string;
}

export interface CreateImageJobOptions {
  readonly cwd: string;
  readonly args: ContentImageCreateArgs;
  readonly now?: () => Date;
}

export interface RunContentImageCreateCliOptions {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly now?: () => Date;
  readonly writeStdout?: (text: string) => void;
  readonly writeStderr?: (text: string) => void;
}

export class ContentImageCreateError extends Error {
  readonly name = "ContentImageCreateError";
  readonly code:
    | "INVALID_COMMAND"
    | "INVALID_PROMPT"
    | "INVALID_KEY"
    | "KEY_ALREADY_EXISTS";

  constructor(code: ContentImageCreateError["code"], message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

const maxPromptChars = 2000;
const keyPattern = /^[a-z0-9][a-z0-9-]{2,79}$/;

export function parseContentImageCreateArgs(
  argv: readonly string[],
): ContentImageCreateArgs {
  let prompt: string | undefined;
  let key: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--prompt") {
      prompt = readFlagValue(argv, index, "--prompt");
      index += 1;
      continue;
    }
    if (arg === "--key") {
      key = readFlagValue(argv, index, "--key");
      index += 1;
      continue;
    }
    throw new ContentImageCreateError("INVALID_COMMAND", `INVALID_COMMAND: ${arg}`);
  }

  if (prompt === undefined) {
    throw new ContentImageCreateError("INVALID_COMMAND");
  }
  validatePrompt(prompt);
  if (key !== undefined) validateKey(key);
  return { prompt, key };
}

export function buildImageKey(now: Date): string {
  const iso = now.toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`;
}

export function buildImageJobId(key: string): string {
  validateKey(key);
  return `img-${key}`;
}

export function createImageJob(opts: CreateImageJobOptions): ContentImageCreateResult {
  const key = opts.args.key ?? buildImageKey(opts.now?.() ?? new Date());
  validateKey(key);
  const jobId = buildImageJobId(key);
  const topic = sanitizeTopic(opts.args.prompt.slice(0, 120)).value;
  const cwd = path.resolve(opts.cwd);
  const dbPath = resolve(cwd, ".data", "content.db");
  const requestDir = resolve(cwd, ".runs", jobId, "attempt-1");
  const requestPath = resolve(requestDir, "request.txt");
  assertInsideRoot(requestDir, cwd, "request directory");
  assertInsideRoot(requestPath, requestDir, "request path");

  const db = openDb(dbPath);
  try {
    const existing = findJobById(db, jobId) ?? findJobByWeekKey(db, jobId);
    if (existing) {
      throw duplicateKeyError(key, existing);
    }
    if (existsSync(requestPath)) {
      throw new ContentImageCreateError(
        "KEY_ALREADY_EXISTS",
        `KEY_ALREADY_EXISTS: ${key}`,
      );
    }

    mkdirSync(requestDir, { recursive: true });
    writeFileSync(requestPath, `${opts.args.prompt}\n`);
    const now = Math.floor((opts.now?.() ?? new Date()).getTime() / 1000);
    insertJob(db, {
      id: jobId,
      week_key: jobId,
      topic,
      locales: "en",
      modality: Modality.IMAGE,
      attempt_number: 1,
      status: "queued",
      purpose: "production",
      current_stage: "elaborate_spec",
      run_dir: `.runs/${jobId}`,
      created_at: now,
      updated_at: now,
    });
    return {
      jobId,
      key,
      requestPath: displayPath(cwd, requestPath),
    };
  } catch (err) {
    if (isUniqueConstraint(err)) {
      const existing = findJobById(db, jobId) ?? findJobByWeekKey(db, jobId);
      throw duplicateKeyError(key, existing ?? undefined);
    }
    throw err;
  } finally {
    db.close();
  }
}

export async function runContentImageCreateCli(
  opts: RunContentImageCreateCliOptions,
): Promise<number> {
  const writeStdout = opts.writeStdout ?? ((text: string) => process.stdout.write(text));
  const writeStderr = opts.writeStderr ?? ((text: string) => process.stderr.write(text));
  try {
    const args = parseContentImageCreateArgs(opts.argv);
    const result = createImageJob({
      cwd: opts.cwd,
      args,
      now: opts.now,
    });
    writeStdout(`${result.jobId}\n`);
    return 0;
  } catch (err) {
    writeStderr(`${formatError(err)}\n`);
    return 1;
  }
}

function readFlagValue(
  argv: readonly string[],
  index: number,
  flag: string,
): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--") || value.length === 0) {
    throw new ContentImageCreateError("INVALID_COMMAND", `INVALID_COMMAND: ${flag}`);
  }
  return value;
}

function validatePrompt(prompt: string): void {
  if (prompt.trim().length === 0) {
    throw new ContentImageCreateError("INVALID_PROMPT", "INVALID_PROMPT: empty");
  }
  if (prompt.length > maxPromptChars) {
    throw new ContentImageCreateError("INVALID_PROMPT", "INVALID_PROMPT: too_long");
  }
}

function validateKey(key: string): void {
  if (key.startsWith("img-") || !keyPattern.test(key)) {
    throw new ContentImageCreateError("INVALID_KEY", `INVALID_KEY: ${key}`);
  }
}

function findJobByWeekKey(db: DbClient, weekKey: string): Job | null {
  return db.query<Job, [string]>("SELECT * FROM jobs WHERE week_key = ?").get(weekKey) ?? null;
}

function duplicateKeyError(key: string, existing?: Job): ContentImageCreateError {
  if (existing) {
    return new ContentImageCreateError(
      "KEY_ALREADY_EXISTS",
      `KEY_ALREADY_EXISTS: ${key} existing_job_id=${existing.id} existing_status=${existing.status}`,
    );
  }
  return new ContentImageCreateError("KEY_ALREADY_EXISTS", `KEY_ALREADY_EXISTS: ${key}`);
}

function isUniqueConstraint(err: unknown): boolean {
  return err instanceof DbConstraintError && err.subcode === "SQLITE_CONSTRAINT_UNIQUE";
}

function assertInsideRoot(candidate: string, root: string, label: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new ContentImageCreateError(
    "INVALID_KEY",
    `unsafe ${label}: ${candidate}`,
  );
}

function displayPath(cwd: string, absPath: string): string {
  return path.relative(cwd, absPath).split(path.sep).join("/");
}

function formatError(err: unknown): string {
  if (err instanceof TopicSanitizationError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

if (import.meta.main) {
  const code = await runContentImageCreateCli({
    argv: Bun.argv.slice(2),
    cwd: process.cwd(),
  });
  process.exit(code);
}
