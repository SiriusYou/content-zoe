import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findEventsByJob,
  insertEvent,
  insertJob,
  openDb,
  type DbClient,
  type Job,
} from "../src/db.ts";
import {
  formatErrorSummary,
  runReportRemindCli,
} from "../src/bin/report-remind.ts";
import {
  assertCycleScopePolicy,
  assertNoForbiddenPatterns,
  changedFilesForCurrentCycle,
  PROCESS_SPAWN_PATTERNS,
  PROMPT_SURFACE_PATTERNS,
  TELEGRAM_SDK_NETWORK_PATTERNS,
  readRepoSource,
  stripAllowedStaticCheckStrings,
} from "./lib/static-guardrails.ts";

type ScenarioName =
  | "report-remind-missing-db"
  | "report-remind-no-reminders"
  | "report-remind-never-notified"
  | "report-remind-notify-failed"
  | "report-remind-excludes-already-notified"
  | "report-remind-excludes-non-awaiting"
  | "report-remind-output-order-and-format"
  | "report-remind-read-only-no-mutation"
  | "report-remind-malformed-db"
  | "report-remind-boundary-static-check";

interface ScenarioOutcome {
  readonly name: ScenarioName;
  readonly status: "PASS" | "FAIL";
  readonly details: readonly string[];
  readonly startedAtIso: string;
  readonly finishedAtIso: string;
}

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const SCENARIOS: readonly ScenarioName[] = [
  "report-remind-missing-db",
  "report-remind-no-reminders",
  "report-remind-never-notified",
  "report-remind-notify-failed",
  "report-remind-excludes-already-notified",
  "report-remind-excludes-non-awaiting",
  "report-remind-output-order-and-format",
  "report-remind-read-only-no-mutation",
  "report-remind-malformed-db",
  "report-remind-boundary-static-check",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = path.join(
  tmpdir(),
  `cz-report-remind-smoke-${new Date().toISOString().replaceAll(":", "-")}`,
);
const docPath = resolve(repoRoot, "docs", "preflight", "report-remind-smoke.md");
const slice414Scope = new Set([
  "src/bin/report-status.ts",
  "scripts/report-status-smoke.ts",
  "docs/preflight/report-status-smoke.md",
  "package.json",
  "src/bin/report-remind.ts",
  "scripts/report-remind-smoke.ts",
  "docs/preflight/report-remind-smoke.md",
  "scripts/report-create-smoke.ts",
  "docs/preflight/report-create-smoke.md",
  "scripts/bot-smoke.ts",
  "docs/preflight/bot-smoke.md",
]);
const reportRemindActiveTriggers = new Set([
  "src/bin/report-remind.ts",
  "scripts/report-remind-smoke.ts",
  "docs/preflight/report-remind-smoke.md",
]);
const reportRemindActiveFrozenFiles = [
  "bun.lock",
  "bun.lockb",
  "src/bin/report-create.ts",
  "src/bin/report-run.ts",
  "src/security/sanitize.ts",
  "src/promote.ts",
  "src/db.ts",
  "src/preflight.ts",
  "scripts/lib/static-guardrails.ts",
];
const reportRemindActiveFrozenDirectories = [
  "src/telegram/",
  "src/migrations/",
  "src/lib/",
  "src/pipeline/",
  "src/llm/",
  "src/prompts/",
];
const reportRemindInheritedFrozenFiles = [
  "src/bin/report-remind.ts",
  "scripts/report-remind-smoke.ts",
  "docs/preflight/report-remind-smoke.md",
];
const reportRemindInheritedFrozenDirectories = [
  "src/telegram/",
  "src/migrations/",
  "src/llm/",
  "src/prompts/",
];
const reportRemindStaticCheckTokens = [
  "child_process",
  "Bun.spawn",
  "fetch",
  "insertJob",
  "insertEvent",
  "openDb",
  "notifyPendingApprovals",
  "promoteJob",
  "CodexCliProvider",
  "report:run",
  "https://api.telegram.org",
];
const fixedNow = 1_778_000_000;

async function main(): Promise<number> {
  mkdirSync(smokeRoot, { recursive: true });
  const outcomes: ScenarioOutcome[] = [];

  try {
    for (const name of SCENARIOS) {
      outcomes.push(await runScenario(name));
    }
  } finally {
    writeEvidence(outcomes);
    rmSync(smokeRoot, { recursive: true, force: true });
  }

  for (const outcome of outcomes) {
    console.log(`${outcome.status} ${outcome.name}`);
    for (const detail of outcome.details) {
      console.log(`  - ${detail}`);
    }
  }

  return outcomes.every((outcome) => outcome.status === "PASS") ? 0 : 1;
}

async function runScenario(name: ScenarioName): Promise<ScenarioOutcome> {
  const startedAtIso = new Date().toISOString();
  const dir = resolve(smokeRoot, name);
  mkdirSync(dir, { recursive: true });

  try {
    const details = await scenarioImpl(name, dir);
    return {
      name,
      status: "PASS",
      details,
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
    };
  } catch (err) {
    return {
      name,
      status: "FAIL",
      details: [formatThrown(err)],
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
    };
  }
}

async function scenarioImpl(
  name: ScenarioName,
  dir: string,
): Promise<string[]> {
  switch (name) {
    case "report-remind-missing-db":
      return runMissingDb(dir);
    case "report-remind-no-reminders":
      return runNoReminders(dir);
    case "report-remind-never-notified":
      return runNeverNotified(dir);
    case "report-remind-notify-failed":
      return runNotifyFailed(dir);
    case "report-remind-excludes-already-notified":
      return runExcludesAlreadyNotified(dir);
    case "report-remind-excludes-non-awaiting":
      return runExcludesNonAwaiting(dir);
    case "report-remind-output-order-and-format":
      return runOutputOrderAndFormat(dir);
    case "report-remind-read-only-no-mutation":
      return runReadOnlyNoMutation(dir);
    case "report-remind-malformed-db":
      return runMalformedDb(dir);
    case "report-remind-boundary-static-check":
      return runBoundaryStaticCheck();
  }
}

async function runMissingDb(dir: string): Promise<string[]> {
  assert(!existsSync(resolve(dir, ".data")), "scenario unexpectedly started with .data");
  const result = await runCli(dir);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(result.stdout === "NO_DATABASE\n", `missing DB stdout drifted: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr === "", `expected empty stderr, got ${result.stderr}`);
  assert(!existsSync(resolve(dir, ".data")), "missing DB run created .data");

  return [
    "Missing .data/content.db exits 0 with exact NO_DATABASE stdout.",
    "Missing DB path does not create .data, content.db, migrations, or WAL files.",
  ];
}

async function runNoReminders(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "already-done", {
      status: "published",
      notified_at: fixedNow,
      updated_at: fixedNow,
    });
  } finally {
    close();
  }

  const result = await runCli(dir);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(result.stdout === "NO_REMINDERS\n", `no-reminders stdout drifted: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr === "", `expected empty stderr, got ${result.stderr}`);

  return [
    "Existing DB with zero eligible awaiting_approval rows exits 0 with exact NO_REMINDERS stdout.",
  ];
}

async function runNeverNotified(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "never-notified", {
      week_key: "2026-W31",
      notified_at: null,
      last_notify_error: null,
    });
  } finally {
    close();
  }

  const result = await runCli(dir);
  const expected = [
    "REMINDER",
    "job_id=never-notified",
    "week_key=2026-W31",
    "attempt=1",
    "status=awaiting_approval",
    "notify_state=never_notified",
    "notified_at=null",
    "last_notify_error=-",
  ].join("\t") + "\n";
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(result.stdout === expected, `never-notified stdout drifted: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr === "", `expected empty stderr, got ${result.stderr}`);

  return [
    "Awaiting-approval job with notified_at=NULL and no error is listed as never_notified.",
  ];
}

async function runNotifyFailed(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "notify-failed", {
      week_key: "2026-W32",
      notified_at: fixedNow,
      last_notify_error: "Telegram\t429\n retry later",
    });
  } finally {
    close();
  }

  const result = await runCli(dir);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(result.stdout.includes("notify_state=notify_failed"), "notify_failed state missing");
  assert(result.stdout.includes(`notified_at=${fixedNow}`), "notified_at epoch missing");
  assert(
    result.stdout.includes("last_notify_error=Telegram 429 retry later"),
    `sanitized error missing: ${JSON.stringify(result.stdout)}`,
  );
  assert(formatErrorSummary("x".repeat(200)).length === 160, "error summary cap drifted");

  return [
    "Awaiting-approval job with last_notify_error is listed as notify_failed even after notified_at is set.",
    "Error summaries replace CR/LF/TAB with spaces, collapse whitespace, trim, and cap at 160 chars.",
  ];
}

async function runExcludesAlreadyNotified(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "already-notified", {
      week_key: "2026-W33",
      notified_at: fixedNow,
      last_notify_error: null,
    });
  } finally {
    close();
  }

  const result = await runCli(dir);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(result.stdout === "NO_REMINDERS\n", `already-notified stdout drifted: ${JSON.stringify(result.stdout)}`);
  assert(!result.stdout.includes("already-notified"), "already-notified row leaked into reminders");

  return [
    "Awaiting-approval job with notified_at set and no error is excluded.",
  ];
}

async function runExcludesNonAwaiting(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    for (const [index, status] of ["queued", "running", "failed", "published"].entries()) {
      seedJob(db, `non-awaiting-${status}`, {
        week_key: `2026-W${34 + index}`,
        status,
        notified_at: null,
        last_notify_error: "prior failure",
      });
    }
  } finally {
    close();
  }

  const result = await runCli(dir);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(result.stdout === "NO_REMINDERS\n", `non-awaiting stdout drifted: ${JSON.stringify(result.stdout)}`);

  return [
    "Queued, running, failed, and published jobs are excluded even when notify fields would otherwise match.",
  ];
}

async function runOutputOrderAndFormat(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "third", {
      week_key: "2026-W40",
      attempt_number: 2,
      updated_at: 200,
      last_notify_error: "third",
    });
    seedJob(db, "second", {
      week_key: "2026-W39",
      attempt_number: 1,
      updated_at: 200,
      last_notify_error: "second",
    });
    seedJob(db, "first", {
      week_key: "2026-W38",
      attempt_number: 1,
      updated_at: 100,
      notified_at: null,
      last_notify_error: null,
    });
  } finally {
    close();
  }

  const result = await runCli(dir);
  const lines = result.stdout.trimEnd().split("\n");
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(lines.length === 3, `expected 3 reminder rows, got ${lines.length}`);
  assert(lines[0].includes("job_id=first"), `first ordering drifted: ${lines[0]}`);
  assert(lines[1].includes("job_id=second"), `second ordering drifted: ${lines[1]}`);
  assert(lines[2].includes("job_id=third"), `third ordering drifted: ${lines[2]}`);
  for (const line of lines) {
    const parts = line.split("\t");
    assert(parts.length === 8, `row is not 8 tab-delimited fields: ${line}`);
    assert(parts[0] === "REMINDER", `row prefix drifted: ${line}`);
    assert(parts[4] === "status=awaiting_approval", `status field drifted: ${line}`);
  }

  return [
    "Rows are ordered by updated_at ASC, attempt_number ASC, id ASC.",
    "Every row uses the exact eight-field tab-delimited REMINDER format.",
  ];
}

async function runReadOnlyNoMutation(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "read-only", {
      week_key: "2026-W41",
      notified_at: null,
      last_notify_error: null,
    });
    insertEvent(db, {
      job_id: "read-only",
      attempt_number: 1,
      type: "approval_notification_failed",
      payload: JSON.stringify({ error: "previous" }),
      created_at: fixedNow,
    });

    const before = stableDbSnapshot(db);
    const result = await runCli(dir);
    const after = stableDbSnapshot(db);
    assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
    assert(before === after, "report:remind mutated jobs or events");
    assert(findEventsByJob(db, "read-only").length === 1, "event count changed");
    assert(!existsSync(resolve(dir, ".runs")), "report:remind created .runs");
    assert(!existsSync(resolve(dir, "reports")), "report:remind created reports");
    assert(!existsSync(resolve(dir, "attempts")), "report:remind created attempt output");

    return [
      "Jobs and events snapshots are byte-identical before and after report:remind.",
      "No .runs, reports, or attempt output directories are created.",
    ];
  } finally {
    close();
  }
}

async function runMalformedDb(dir: string): Promise<string[]> {
  mkdirSync(resolve(dir, ".data"), { recursive: true });
  writeFileSync(resolve(dir, ".data", "content.db"), "not a sqlite database");

  const result = await runCli(dir);
  assert(result.exitCode !== 0, "malformed DB exited 0");
  assert(result.stdout === "", `malformed DB wrote stdout: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr.startsWith("DB_READ_FAILED:"), `malformed DB stderr drifted: ${result.stderr}`);
  assert(existsSync(resolve(dir, ".data", "content.db")), "malformed DB file was removed");

  return [
    "Malformed existing DB exits non-zero with DB_READ_FAILED on stderr and no stdout.",
    "Malformed DB handling does not remove or recreate the DB file.",
  ];
}

function runBoundaryStaticCheck(): string[] {
  const changed = changedFilesForCurrentCycle(repoRoot);
  const scopeMode = assertCycleScopePolicy({
    changed,
    activeTriggerFiles: reportRemindActiveTriggers,
    activeScope: slice414Scope,
    activeFrozenFiles: reportRemindActiveFrozenFiles,
    activeFrozenDirectories: reportRemindActiveFrozenDirectories,
    inheritedFrozenFiles: reportRemindInheritedFrozenFiles,
    inheritedFrozenDirectories: reportRemindInheritedFrozenDirectories,
  });
  assert(scopeMode === "active-slice", "report-remind smoke should run in active-slice mode for Slice 4.14");

  let activeScopeRejectedOutOfScope = false;
  try {
    assertCycleScopePolicy({
      changed: ["scripts/report-remind-smoke.ts", "src/telegram/bot.ts"],
      activeTriggerFiles: reportRemindActiveTriggers,
      activeScope: slice414Scope,
      activeFrozenFiles: reportRemindActiveFrozenFiles,
      activeFrozenDirectories: reportRemindActiveFrozenDirectories,
      inheritedFrozenFiles: reportRemindInheritedFrozenFiles,
      inheritedFrozenDirectories: reportRemindInheritedFrozenDirectories,
    });
  } catch (err) {
    activeScopeRejectedOutOfScope = String(err).includes("changed files outside declared scope");
  }
  assert(activeScopeRejectedOutOfScope, "active-slice scope check did not reject Telegram product files");

  const reportCreateFiles = [
    "docs/preflight/report-create-smoke.md",
    "package.json",
    "scripts/report-create-smoke.ts",
    "src/bin/report-create.ts",
    "src/security/sanitize.ts",
  ];
  const reportCreateMode = assertCycleScopePolicy({
    changed: reportCreateFiles,
    activeTriggerFiles: reportRemindActiveTriggers,
    activeScope: slice414Scope,
    inheritedFrozenFiles: reportRemindInheritedFrozenFiles,
    inheritedFrozenDirectories: reportRemindInheritedFrozenDirectories,
  });
  assert(reportCreateMode === "inherited-surface", "report-create files should be inherited for report-remind-smoke");

  const reportStatusFiles = [
    "docs/preflight/report-status-smoke.md",
    "package.json",
    "scripts/report-status-smoke.ts",
    "src/bin/report-status.ts",
  ];
  const reportStatusMode = assertCycleScopePolicy({
    changed: reportStatusFiles,
    activeTriggerFiles: reportRemindActiveTriggers,
    activeScope: slice414Scope,
    inheritedFrozenFiles: reportRemindInheritedFrozenFiles,
    inheritedFrozenDirectories: reportRemindInheritedFrozenDirectories,
  });
  assert(reportStatusMode === "inherited-surface", "Slice 4.14 report:status files should be inherited for report-remind-smoke");

  const packageJson = JSON.parse(readRepoSource(repoRoot, "package.json")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert(packageJson.scripts?.["report:remind"] === "bun src/bin/report-remind.ts", "missing report:remind script");
  assert(packageJson.scripts?.["report-remind-smoke"] === "bun scripts/report-remind-smoke.ts", "missing report-remind-smoke script");
  assert(packageJson.scripts?.["report:status"] === "bun src/bin/report-status.ts", "missing report:status script");
  assert(packageJson.scripts?.["report-status-smoke"] === "bun scripts/report-status-smoke.ts", "missing report-status-smoke script");
  assert(packageJson.scripts?.["report:create"] === "bun src/bin/report-create.ts", "report:create script drifted");
  assert(packageJson.dependencies === undefined, "package.json gained dependencies");
  assert(packageJson.devDependencies?.typescript === "^5.6.3", "typescript devDependency drifted");
  assert(packageJson.devDependencies?.["@types/bun"] === "^1.1.13", "@types/bun devDependency drifted");

  const remindSource = readRepoSource(repoRoot, "src/bin/report-remind.ts");
  assertNoForbiddenPatterns(remindSource, [
    ...PROCESS_SPAWN_PATTERNS,
    ...TELEGRAM_SDK_NETWORK_PATTERNS,
    ...PROMPT_SURFACE_PATTERNS,
    [/from\s+["'][^"']*db\.ts["']|openDb|insertJob|updateJob|insertEvent|runMigrations/, "mutating DB helper import"],
    [/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bCREATE\s+TABLE\b|\bPRAGMA\b/i, "DB mutation SQL"],
    [/from\s+["'][^"']*report-create\.ts["']|from\s+["'][^"']*report-run\.ts["']|from\s+["'][^"']*report-status\.ts["']/, "other CLI import"],
    [/from\s+["'][^"']*\/telegram\//, "Telegram import"],
    [/from\s+["'][^"']*promote\.ts["']|promoteJob/, "promote import"],
    [/from\s+["'][^"']*preflight\.ts["']|CodexCliProvider/, "preflight/Codex import"],
  ], "src/bin/report-remind.ts");

  const remindAndSmokeSource = `${remindSource}\n${readRepoSource(repoRoot, "scripts/report-remind-smoke.ts")}`;
  assertNoForbiddenPatterns(stripAllowedStaticCheckStrings(remindAndSmokeSource, reportRemindStaticCheckTokens), [
    [/child_process|Bun\.spawn|\bfetch\s*\(|notifyPendingApprovals|promoteJob|CodexCliProvider/, "forbidden execution surface"],
    [/https:\/\/api\.telegram\.org/, "Telegram API URL"],
  ], "report-remind source/smoke outside static-check pattern strings");

  return [
    `Cycle-scope boundary check ran in ${scopeMode} mode and saw changed files: ${changed.join(", ") || "<none>"}.`,
    "Synthetic active-slice scope check rejects out-of-scope Telegram product files.",
    "Synthetic report-create changed-set resolves to inherited-surface mode for report-remind-smoke.",
    "Synthetic Slice 4.14 report:status changed-set resolves to inherited-surface mode for report-remind-smoke.",
    "package.json change is limited to report:remind/report-status smoke scripts with dependency sets unchanged.",
    "report-remind.ts avoids mutating DB helpers, report-create/report-run/report-status imports, Telegram, promote, preflight/Codex, process, network, LLM, and prompt surfaces.",
  ];
}

async function runCli(dir: string): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runReportRemindCli({
    cwd: dir,
    writeStdout: (text) => {
      stdout += text;
    },
    writeStderr: (text) => {
      stderr += text;
    },
  });
  return { exitCode, stdout, stderr };
}

function openScenarioDb(dir: string): { db: DbClient; close: () => void } {
  const db = openDb(resolve(dir, ".data", "content.db"));
  return {
    db,
    close: () => db.close(),
  };
}

function seedJob(
  db: DbClient,
  id: string,
  patch: Partial<Job> = {},
): Job {
  return insertJob(db, {
    id,
    week_key: patch.week_key ?? "2026-W30",
    topic: patch.topic ?? "Reminder topic",
    locales: patch.locales ?? "en,zh",
    attempt_number: patch.attempt_number ?? 1,
    status: patch.status ?? "awaiting_approval",
    current_stage: patch.current_stage ?? "awaiting_approval",
    run_dir: patch.run_dir ?? `.runs/${id}`,
    artifact_dir: patch.artifact_dir ?? null,
    primary_report_path: patch.primary_report_path ?? null,
    translated_report_path: patch.translated_report_path ?? null,
    sources_path: patch.sources_path ?? null,
    approval_summary: patch.approval_summary ?? null,
    as_of: patch.as_of ?? null,
    reject_scope: patch.reject_scope ?? null,
    reject_type: patch.reject_type ?? null,
    reject_reason: patch.reject_reason ?? null,
    notified_at: patch.notified_at ?? null,
    last_notify_error: patch.last_notify_error ?? null,
    error: patch.error ?? null,
    created_at: patch.created_at ?? fixedNow,
    updated_at: patch.updated_at ?? fixedNow,
  });
}

function stableDbSnapshot(db: DbClient): string {
  const jobs = db.query<Job, []>("SELECT * FROM jobs ORDER BY id ASC").all();
  const events = db.query("SELECT * FROM events ORDER BY id ASC").all();
  return JSON.stringify({ jobs, events });
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  mkdirSync(dirname(docPath), { recursive: true });
  const lines = [
    "# report-remind smoke evidence",
    "",
    "- Command: `bun run report-remind-smoke`",
    `- Started: ${outcomes[0]?.startedAtIso ?? new Date().toISOString()}`,
    `- Finished: ${outcomes.at(-1)?.finishedAtIso ?? new Date().toISOString()}`,
    `- Scenario root: ${smokeRoot} (removed by finally-cleanup)`,
    `- Result: ${outcomes.filter((outcome) => outcome.status === "PASS").length}/${outcomes.length} PASS`,
    "",
    "This smoke exercises the read-only `report:remind` CLI surface only. It does not run operator-only `bun run report:run`, real Codex report generation, real Telegram network, real git/process execution, notifier sending, publish/promote behavior, DB migrations beyond scenario setup, or preflight.",
    "",
    "| Scenario | Status | Evidence |",
    "|---|---:|---|",
    ...outcomes.map(
      (outcome) =>
        `| ${outcome.name} | ${outcome.status} | ${outcome.details.map(escapeTableCell).join("<br>")} |`,
    ),
    "",
  ];
  writeFileSync(docPath, lines.join("\n"));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function formatThrown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

const exitCode = await main();
process.exit(exitCode);
