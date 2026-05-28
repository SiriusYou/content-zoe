import { resolve } from "node:path";

import {
  DbConstraintError,
  findJobById,
  insertJob,
  openDb,
  type DbClient,
  type Job,
} from "../db.ts";
import { sanitizeTopic, TopicSanitizationError } from "../security/sanitize.ts";

export type ReportCreateLocales = "en" | "en,zh";
export type ReportCreatePurpose = "production" | "validation";

export interface ReportCreateArgs {
  readonly weekKey: string;
  readonly rawTopic: string;
  readonly locales: ReportCreateLocales;
  readonly purpose: ReportCreatePurpose;
}

export interface ReportCreateResult {
  readonly jobId: string;
  readonly weekKey: string;
  readonly topic: string;
}

export interface CreateReportJobOptions {
  readonly cwd: string;
  readonly args: ReportCreateArgs;
  readonly now?: () => number;
}

export interface RunReportCreateCliOptions {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly now?: () => number;
  readonly writeStdout?: (text: string) => void;
  readonly writeStderr?: (text: string) => void;
}

export class ReportCreateError extends Error {
  readonly name = "ReportCreateError";
  readonly code:
    | "INVALID_COMMAND"
    | "INVALID_WEEK"
    | "INVALID_LOCALES"
    | "INVALID_PURPOSE"
    | "UNKNOWN_FLAG"
    | "UNSUPPORTED_FORCE"
    | "WEEK_ALREADY_EXISTS";

  constructor(code: ReportCreateError["code"], message: string = code) {
    super(message);
    this.code = code;
  }
}

const weekKeyPattern = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

export function parseReportCreateArgs(argv: readonly string[]): ReportCreateArgs {
  let weekKey: string | undefined;
  let rawTopic: string | undefined;
  let locales: ReportCreateLocales = "en,zh";
  let purpose: ReportCreatePurpose | undefined;
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--force") {
      throw new ReportCreateError("UNSUPPORTED_FORCE");
    }
    if (arg === "--week") {
      weekKey = readFlagValue(argv, index, "--week");
      index += 1;
      continue;
    }
    if (arg === "--topic") {
      rawTopic = readFlagValue(argv, index, "--topic");
      index += 1;
      continue;
    }
    if (arg === "--locales") {
      locales = parseLocales(readFlagValue(argv, index, "--locales"));
      index += 1;
      continue;
    }
    if (arg === "--purpose") {
      purpose = parsePurpose(readFlagValue(argv, index, "--purpose"));
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new ReportCreateError("UNKNOWN_FLAG", `UNKNOWN_FLAG: ${arg}`);
    }
    positionals.push(arg);
  }

  if (
    weekKey === undefined ||
    rawTopic === undefined ||
    positionals.length > 0
  ) {
    throw new ReportCreateError("INVALID_COMMAND");
  }
  if (purpose === undefined) {
    throw new ReportCreateError("INVALID_PURPOSE", "INVALID_PURPOSE: --purpose required");
  }
  assertWeekKey(weekKey);

  return { weekKey, rawTopic, locales, purpose };
}

export function buildReportJobId(weekKey: string): string {
  assertWeekKey(weekKey);
  return `${weekKey}-ai-trends`;
}

export function createReportJob(opts: CreateReportJobOptions): ReportCreateResult {
  const topic = sanitizeTopic(opts.args.rawTopic).value;
  const jobId = buildReportJobId(opts.args.weekKey);
  const dbPath = resolve(opts.cwd, ".data", "content.db");
  const now = Math.floor(opts.now?.() ?? Date.now() / 1000);
  const db = openDb(dbPath);

  try {
    const existing = findJobByWeekKey(db, opts.args.weekKey);
    if (existing) {
      throw duplicateWeekError(opts.args.weekKey, existing);
    }

    insertJob(db, {
      id: jobId,
      week_key: opts.args.weekKey,
      topic,
      locales: opts.args.locales,
      attempt_number: 1,
      status: "queued",
      purpose: opts.args.purpose,
      current_stage: "research",
      run_dir: `.runs/${jobId}`,
      created_at: now,
      updated_at: now,
    });

    return {
      jobId,
      weekKey: opts.args.weekKey,
      topic,
    };
  } catch (err) {
    if (isUniqueConstraint(err)) {
      const existing = findJobByWeekKey(db, opts.args.weekKey) ?? findJobById(db, jobId);
      throw duplicateWeekError(opts.args.weekKey, existing ?? undefined);
    }
    throw err;
  } finally {
    db.close();
  }
}

export async function runReportCreateCli(
  opts: RunReportCreateCliOptions,
): Promise<number> {
  const writeStdout = opts.writeStdout ?? ((text: string) => process.stdout.write(text));
  const writeStderr = opts.writeStderr ?? ((text: string) => process.stderr.write(text));

  try {
    const args = parseReportCreateArgs(opts.argv);
    const result = createReportJob({ cwd: opts.cwd, args, now: opts.now });
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
  if (value === undefined || value.startsWith("--")) {
    throw new ReportCreateError("INVALID_COMMAND");
  }
  if (value.length === 0) {
    throw new ReportCreateError("INVALID_COMMAND");
  }
  return value;
}

function parseLocales(value: string): ReportCreateLocales {
  if (value === "en" || value === "en,zh") return value;
  throw new ReportCreateError("INVALID_LOCALES", `INVALID_LOCALES: ${value}`);
}

function parsePurpose(value: string): ReportCreatePurpose {
  if (value === "production" || value === "validation") return value;
  throw new ReportCreateError("INVALID_PURPOSE", `INVALID_PURPOSE: ${value}`);
}

function assertWeekKey(weekKey: string): void {
  if (!weekKeyPattern.test(weekKey)) {
    throw new ReportCreateError("INVALID_WEEK", `INVALID_WEEK: ${weekKey}`);
  }
}

function findJobByWeekKey(db: DbClient, weekKey: string): Job | null {
  return db.query<Job, [string]>("SELECT * FROM jobs WHERE week_key = ?").get(weekKey) ?? null;
}

function duplicateWeekError(weekKey: string, existing?: Job): ReportCreateError {
  if (existing) {
    return new ReportCreateError(
      "WEEK_ALREADY_EXISTS",
      `WEEK_ALREADY_EXISTS: ${weekKey} existing_job_id=${existing.id} existing_status=${existing.status}`,
    );
  }
  return new ReportCreateError("WEEK_ALREADY_EXISTS", `WEEK_ALREADY_EXISTS: ${weekKey}`);
}

function isUniqueConstraint(err: unknown): boolean {
  return (
    err instanceof DbConstraintError &&
    err.subcode === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

function formatError(err: unknown): string {
  if (err instanceof TopicSanitizationError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

if (import.meta.main) {
  const code = await runReportCreateCli({
    argv: Bun.argv.slice(2),
    cwd: process.cwd(),
  });
  process.exit(code);
}
