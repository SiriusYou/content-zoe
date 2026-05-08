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
  type Event,
  type Job,
} from "../src/db.ts";
import {
  formatApprovalSummary,
  formatExcerpt,
  runReportStatusCli,
} from "../src/bin/report-status.ts";
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
  | "report-status-missing-db"
  | "report-status-invalid-command"
  | "report-status-unknown-job"
  | "report-status-known-queued"
  | "report-status-awaiting-approval-summary"
  | "report-status-published-paths"
  | "report-status-published-manifest-authority"
  | "report-status-published-manifest-missing-and-unparseable"
  | "report-status-error-state"
  | "report-status-notify-error"
  | "report-status-read-only-no-mutation"
  | "report-status-malformed-db"
  | "report-status-boundary-static-check";

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
  "report-status-missing-db",
  "report-status-invalid-command",
  "report-status-unknown-job",
  "report-status-known-queued",
  "report-status-awaiting-approval-summary",
  "report-status-published-paths",
  "report-status-published-manifest-authority",
  "report-status-published-manifest-missing-and-unparseable",
  "report-status-error-state",
  "report-status-notify-error",
  "report-status-read-only-no-mutation",
  "report-status-malformed-db",
  "report-status-boundary-static-check",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = path.join(
  tmpdir(),
  `cz-report-status-smoke-${new Date().toISOString().replaceAll(":", "-")}`,
);
const docPath = resolve(repoRoot, "docs", "preflight", "report-status-smoke.md");
const slice414Scope = new Set([
  "src/bin/report-status.ts",
  "scripts/report-status-smoke.ts",
  "docs/preflight/report-status-smoke.md",
  "package.json",
  "scripts/report-remind-smoke.ts",
  "docs/preflight/report-remind-smoke.md",
  "scripts/report-create-smoke.ts",
  "docs/preflight/report-create-smoke.md",
  "scripts/bot-smoke.ts",
  "docs/preflight/bot-smoke.md",
]);
const reportStatusActiveTriggers = new Set([
  "src/bin/report-status.ts",
  "scripts/report-status-smoke.ts",
  "docs/preflight/report-status-smoke.md",
]);
const reportStatusActiveFrozenFiles = [
  "bun.lock",
  "bun.lockb",
  "src/bin/report-create.ts",
  "src/bin/report-remind.ts",
  "src/bin/report-run.ts",
  "src/security/sanitize.ts",
  "src/promote.ts",
  "src/db.ts",
  "src/preflight.ts",
  "scripts/lib/static-guardrails.ts",
];
const reportStatusActiveFrozenDirectories = [
  "src/telegram/",
  "src/migrations/",
  "src/lib/",
  "src/pipeline/",
  "src/llm/",
  "src/prompts/",
];
const reportStatusInheritedFrozenFiles = [
  "src/bin/report-status.ts",
  "scripts/report-status-smoke.ts",
  "docs/preflight/report-status-smoke.md",
];
const reportStatusInheritedFrozenDirectories = [
  "src/telegram/",
  "src/migrations/",
  "src/llm/",
  "src/prompts/",
];
const reportStatusStaticCheckTokens = [
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
const slice413ReportRemindFiles = [
  "docs/preflight/report-remind-smoke.md",
  "package.json",
  "scripts/report-remind-smoke.ts",
  "src/bin/report-remind.ts",
];
const fixedNow = 1_778_100_000;

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
    case "report-status-missing-db":
      return runMissingDb(dir);
    case "report-status-invalid-command":
      return runInvalidCommand(dir);
    case "report-status-unknown-job":
      return runUnknownJob(dir);
    case "report-status-known-queued":
      return runKnownQueued(dir);
    case "report-status-awaiting-approval-summary":
      return runAwaitingApprovalSummary(dir);
    case "report-status-published-paths":
      return runPublishedPaths(dir);
    case "report-status-published-manifest-authority":
      return runPublishedManifestAuthority(dir);
    case "report-status-published-manifest-missing-and-unparseable":
      return runPublishedManifestMissingAndUnparseable(dir);
    case "report-status-error-state":
      return runErrorState(dir);
    case "report-status-notify-error":
      return runNotifyError(dir);
    case "report-status-read-only-no-mutation":
      return runReadOnlyNoMutation(dir);
    case "report-status-malformed-db":
      return runMalformedDb(dir);
    case "report-status-boundary-static-check":
      return runBoundaryStaticCheck();
  }
}

async function runMissingDb(dir: string): Promise<string[]> {
  assert(!existsSync(resolve(dir, ".data")), "scenario unexpectedly started with .data");
  const result = await runCli(dir, ["missing-job"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(result.stdout === "NO_DATABASE\n", `missing DB stdout drifted: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr === "", `expected empty stderr, got ${result.stderr}`);
  assert(!existsSync(resolve(dir, ".data")), "missing DB run created .data");

  return [
    "Missing .data/content.db exits 0 with exact NO_DATABASE stdout.",
    "Missing DB path does not create .data, content.db, migrations, or WAL files.",
  ];
}

async function runInvalidCommand(dir: string): Promise<string[]> {
  for (const args of [[], ["--db"], ["job-1", "extra"]]) {
    const result = await runCli(dir, args);
    assert(result.exitCode === 1, `invalid args ${args.join(" ")} exited ${result.exitCode}`);
    assert(result.stdout === "", `invalid command wrote stdout: ${JSON.stringify(result.stdout)}`);
    assert(result.stderr === "INVALID_COMMAND\n", `invalid command stderr drifted: ${result.stderr}`);
  }
  assert(!existsSync(resolve(dir, ".data")), "invalid command created .data");

  return [
    "Missing, flag-like, and extra-argument invocations fail with exact INVALID_COMMAND stderr.",
    "Invalid command parsing happens before any DB open or .data creation.",
  ];
}

async function runUnknownJob(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "known-job", { week_key: "2026-W50" });
    const before = stableDbSnapshot(db);
    const result = await runCli(dir, ["unknown-job"]);
    const after = stableDbSnapshot(db);
    assert(result.exitCode === 1, `unknown job exited ${result.exitCode}`);
    assert(result.stdout === "", `unknown job wrote stdout: ${JSON.stringify(result.stdout)}`);
    assert(result.stderr === "UNKNOWN_JOB: unknown-job\n", `unknown job stderr drifted: ${result.stderr}`);
    assert(before === after, "unknown job path mutated DB");
  } finally {
    close();
  }

  return [
    "Existing DB with no matching job exits 1 with exact UNKNOWN_JOB stderr.",
    "Unknown job path leaves jobs and events byte-identical.",
  ];
}

async function runKnownQueued(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "queued-job", {
      week_key: "2026-W51",
      status: "queued",
      current_stage: "research",
      updated_at: 12345,
    });
  } finally {
    close();
  }

  const result = await runCli(dir, ["queued-job"]);
  const expected = [
    "STATUS\tjob_id=queued-job\tweek_key=2026-W51\tstatus=queued\tstage=research\tattempt=1\tupdated_at=12345",
    "PATHS\trun_dir=.runs/queued-job\tartifact_dir=-\tprimary_report=-\ttranslated_report=-\tsources=-",
    "MANIFEST\tpublish_manifest=not_applicable\tfiles=-\taggregate_sha256=-",
    "APPROVAL\tapproval_summary=-\tnotified_at=null\tlast_notify_error=-",
    "ERROR\terror=-",
  ].join("\n") + "\n";
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(result.stdout === expected, `queued stdout drifted: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr === "", `expected empty stderr, got ${result.stderr}`);

  return [
    "Queued job prints the exact five-record STATUS/PATHS/MANIFEST/APPROVAL/ERROR contract.",
  ];
}

async function runAwaitingApprovalSummary(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "awaiting-job", {
      week_key: "2026-W52",
      status: "awaiting_approval",
      current_stage: "awaiting_approval",
      approval_summary: "intro\nEvidence Grade: B\tneeds review\nother",
      notified_at: fixedNow,
      updated_at: fixedNow,
    });
  } finally {
    close();
  }

  const result = await runCli(dir, ["awaiting-job"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(result.stdout.includes("status=awaiting_approval"), "awaiting status missing");
  assert(result.stdout.includes("approval_summary=Evidence Grade: B needs review"), `evidence line missing: ${result.stdout}`);
  assert(result.stdout.includes(`notified_at=${fixedNow}`), "notified_at missing");
  assert(formatApprovalSummary("x".repeat(200)).length === 160, "approval summary cap drifted");

  return [
    "Awaiting-approval status prefers the Evidence Grade line from approval_summary.",
    "Approval summaries collapse whitespace and cap at 160 chars.",
  ];
}

async function runPublishedPaths(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "published-paths", {
      week_key: "2027-W01",
      status: "published",
      current_stage: "published",
      artifact_dir: "reports/2027-W01-ai-trends",
      primary_report_path: "reports/2027-W01-ai-trends/report.en.md",
      translated_report_path: "reports/2027-W01-ai-trends/report.zh.md",
      sources_path: "reports/2027-W01-ai-trends/sources.md",
    });
  } finally {
    close();
  }

  const result = await runCli(dir, ["published-paths"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(result.stdout.includes("artifact_dir=reports/2027-W01-ai-trends"), "artifact_dir missing");
  assert(result.stdout.includes("primary_report=reports/2027-W01-ai-trends/report.en.md"), "primary report missing");
  assert(result.stdout.includes("translated_report=reports/2027-W01-ai-trends/report.zh.md"), "translated report missing");
  assert(result.stdout.includes("sources=reports/2027-W01-ai-trends/sources.md"), "sources path missing");
  assert(result.stdout.includes("MANIFEST\tpublish_manifest=missing\tfiles=-\taggregate_sha256=-"), "missing manifest marker missing");

  return [
    "Published job prints stored artifact/report/source paths from jobs only.",
    "Published job without promoted event exposes publish_manifest=missing.",
  ];
}

async function runPublishedManifestAuthority(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "published-manifest", {
      week_key: "2027-W02",
      status: "published",
      current_stage: "published",
    });
    insertEvent(db, {
      job_id: "published-manifest",
      attempt_number: 1,
      type: "promoted",
      payload: JSON.stringify({
        publish_manifest: {
          files: ["report.en.md", "report.zh.md", "sources.md"],
          aggregate_sha256: "ABCDEF1234567890",
        },
      }),
      created_at: fixedNow,
    });
  } finally {
    close();
  }

  const result = await runCli(dir, ["published-manifest"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(
    result.stdout.includes("MANIFEST\tpublish_manifest=present\tfiles=3\taggregate_sha256=abcdef123456"),
    `manifest authority row missing: ${result.stdout}`,
  );

  return [
    "Published job reads latest promoted event payload and prints present manifest authority.",
    "aggregate_sha256 is first 12 lowercase hex chars from events.payload.publish_manifest.",
  ];
}

async function runPublishedManifestMissingAndUnparseable(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "missing-manifest", {
      week_key: "2027-W03",
      status: "published",
      current_stage: "published",
    });
    seedJob(db, "unparseable-json", {
      week_key: "2027-W04",
      status: "published",
      current_stage: "published",
    });
    insertEvent(db, {
      job_id: "unparseable-json",
      attempt_number: 1,
      type: "promoted",
      payload: "{not json",
      created_at: fixedNow,
    });
    seedJob(db, "malformed-manifest", {
      week_key: "2027-W05",
      status: "published",
      current_stage: "published",
    });
    insertEvent(db, {
      job_id: "malformed-manifest",
      attempt_number: 1,
      type: "promoted",
      payload: JSON.stringify({
        publish_manifest: {
          files: "not-array",
          aggregate_sha256: "abc",
        },
      }),
      created_at: fixedNow,
    });
  } finally {
    close();
  }

  const missing = await runCli(dir, ["missing-manifest"]);
  const unparseableJson = await runCli(dir, ["unparseable-json"]);
  const malformed = await runCli(dir, ["malformed-manifest"]);

  assert(missing.stdout.includes("publish_manifest=missing"), `missing manifest drifted: ${missing.stdout}`);
  assert(unparseableJson.stdout.includes("publish_manifest=unparseable"), `unparseable JSON drifted: ${unparseableJson.stdout}`);
  assert(malformed.stdout.includes("publish_manifest=unparseable"), `malformed manifest drifted: ${malformed.stdout}`);

  return [
    "Published job with no promoted event reports publish_manifest=missing.",
    "Invalid JSON and malformed publish_manifest fields report publish_manifest=unparseable.",
  ];
}

async function runErrorState(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "failed-job", {
      week_key: "2027-W06",
      status: "failed",
      current_stage: "translate_zh",
      error: "stage\tfailed\nwith detail",
    });
  } finally {
    close();
  }

  const result = await runCli(dir, ["failed-job"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(result.stdout.includes("ERROR\terror=stage failed with detail"), `error row drifted: ${result.stdout}`);

  return [
    "Failed job prints collapsed terminal error detail in the ERROR row.",
  ];
}

async function runNotifyError(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "notify-error", {
      week_key: "2027-W07",
      status: "awaiting_approval",
      current_stage: "awaiting_approval",
      notified_at: fixedNow,
      last_notify_error: "Telegram\t429\nretry later",
    });
  } finally {
    close();
  }

  const result = await runCli(dir, ["notify-error"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(result.stdout.includes("last_notify_error=Telegram 429 retry later"), `notify error missing: ${result.stdout}`);
  assert(formatExcerpt("x".repeat(200)).length === 160, "error excerpt cap drifted");

  return [
    "Notification error is collapsed and capped in APPROVAL last_notify_error.",
  ];
}

async function runReadOnlyNoMutation(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "read-only-status", {
      week_key: "2027-W08",
      status: "published",
      current_stage: "published",
    });
    insertEvent(db, {
      job_id: "read-only-status",
      attempt_number: 1,
      type: "promoted",
      payload: JSON.stringify({
        publish_manifest: {
          files: ["report.en.md"],
          aggregate_sha256: "1234567890abcdef",
        },
      }),
      created_at: fixedNow,
    });

    const before = stableDbSnapshot(db);
    const result = await runCli(dir, ["read-only-status"]);
    const after = stableDbSnapshot(db);
    assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
    assert(before === after, "report:status mutated jobs or events");
    assert(findEventsByJob(db, "read-only-status").length === 1, "event count changed");
    assert(!existsSync(resolve(dir, ".runs")), "report:status created .runs");
    assert(!existsSync(resolve(dir, "reports")), "report:status created reports");
    assert(!existsSync(resolve(dir, "attempts")), "report:status created attempt output");

    return [
      "Jobs and events snapshots are byte-identical before and after report:status.",
      "No .runs, reports, or attempt output directories are created.",
    ];
  } finally {
    close();
  }
}

async function runMalformedDb(dir: string): Promise<string[]> {
  mkdirSync(resolve(dir, ".data"), { recursive: true });
  writeFileSync(resolve(dir, ".data", "content.db"), "not a sqlite database");

  const result = await runCli(dir, ["any-job"]);
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
    activeTriggerFiles: reportStatusActiveTriggers,
    activeScope: slice414Scope,
    activeFrozenFiles: reportStatusActiveFrozenFiles,
    activeFrozenDirectories: reportStatusActiveFrozenDirectories,
    inheritedFrozenFiles: reportStatusInheritedFrozenFiles,
    inheritedFrozenDirectories: reportStatusInheritedFrozenDirectories,
  });
  assert(scopeMode === "active-slice", "report-status smoke should run in active-slice mode for Slice 4.14");

  let activeScopeRejectedOutOfScope = false;
  try {
    assertCycleScopePolicy({
      changed: ["scripts/report-status-smoke.ts", "src/telegram/bot.ts"],
      activeTriggerFiles: reportStatusActiveTriggers,
      activeScope: slice414Scope,
      activeFrozenFiles: reportStatusActiveFrozenFiles,
      activeFrozenDirectories: reportStatusActiveFrozenDirectories,
      inheritedFrozenFiles: reportStatusInheritedFrozenFiles,
      inheritedFrozenDirectories: reportStatusInheritedFrozenDirectories,
    });
  } catch (err) {
    activeScopeRejectedOutOfScope = String(err).includes("changed files outside declared scope");
  }
  assert(activeScopeRejectedOutOfScope, "active-slice scope check did not reject Telegram product files");

  const slice413Mode = assertCycleScopePolicy({
    changed: slice413ReportRemindFiles,
    activeTriggerFiles: reportStatusActiveTriggers,
    activeScope: slice414Scope,
    inheritedFrozenFiles: reportStatusInheritedFrozenFiles,
    inheritedFrozenDirectories: reportStatusInheritedFrozenDirectories,
  });
  assert(slice413Mode === "inherited-surface", "Slice 4.13 report:remind files should be inherited for report-status-smoke");

  const packageJson = JSON.parse(readRepoSource(repoRoot, "package.json")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert(packageJson.scripts?.["report:status"] === "bun src/bin/report-status.ts", "missing report:status script");
  assert(packageJson.scripts?.["report-status-smoke"] === "bun scripts/report-status-smoke.ts", "missing report-status-smoke script");
  assert(packageJson.scripts?.["report:remind"] === "bun src/bin/report-remind.ts", "report:remind script drifted");
  assert(packageJson.scripts?.["report:create"] === "bun src/bin/report-create.ts", "report:create script drifted");
  assert(packageJson.dependencies === undefined, "package.json gained dependencies");
  assert(packageJson.devDependencies?.typescript === "^5.6.3", "typescript devDependency drifted");
  assert(packageJson.devDependencies?.["@types/bun"] === "^1.1.13", "@types/bun devDependency drifted");

  const statusSource = readRepoSource(repoRoot, "src/bin/report-status.ts");
  assertNoForbiddenPatterns(statusSource, [
    ...PROCESS_SPAWN_PATTERNS,
    ...TELEGRAM_SDK_NETWORK_PATTERNS,
    ...PROMPT_SURFACE_PATTERNS,
    [/from\s+["'][^"']*db\.ts["']|openDb|insertJob|insertEvent|updateJob|casUpdateJob|runMigrations/, "mutating DB helper import"],
    [/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bCREATE\s+TABLE\b|\bALTER\b|\bDROP\b|\bPRAGMA\b/i, "DB mutation SQL"],
    [/from\s+["'][^"']*report-create\.ts["']|from\s+["'][^"']*report-remind\.ts["']|from\s+["'][^"']*report-run\.ts["']/, "other CLI import"],
    [/from\s+["'][^"']*\/telegram\//, "Telegram import"],
    [/from\s+["'][^"']*promote\.ts["']|promoteJob/, "promote import"],
    [/from\s+["'][^"']*preflight\.ts["']|CodexCliProvider/, "preflight/Codex import"],
  ], "src/bin/report-status.ts");

  const statusAndSmokeSource = `${statusSource}\n${readRepoSource(repoRoot, "scripts/report-status-smoke.ts")}`;
  assertNoForbiddenPatterns(stripAllowedStaticCheckStrings(statusAndSmokeSource, reportStatusStaticCheckTokens), [
    [/child_process|Bun\.spawn|\bfetch\s*\(|notifyPendingApprovals|promoteJob|CodexCliProvider/, "forbidden execution surface"],
    [/https:\/\/api\.telegram\.org/, "Telegram API URL"],
  ], "report-status source/smoke outside static-check pattern strings");

  return [
    `Cycle-scope boundary check ran in ${scopeMode} mode and saw changed files: ${changed.join(", ") || "<none>"}.`,
    "Synthetic active-slice scope check rejects out-of-scope Telegram product files.",
    "Synthetic Slice 4.13 report:remind changed-set resolves to inherited-surface mode for report-status-smoke.",
    "package.json change is limited to report:status and report-status-smoke scripts with dependency sets unchanged.",
    "report-status.ts avoids mutating DB helpers, other CLI imports, Telegram, promote, preflight/Codex, process, network, LLM, and prompt surfaces.",
  ];
}

async function runCli(dir: string, args: readonly string[]): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runReportStatusCli({
    cwd: dir,
    args,
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
    week_key: patch.week_key ?? "2027-W00",
    topic: patch.topic ?? "Status topic",
    locales: patch.locales ?? "en,zh",
    attempt_number: patch.attempt_number ?? 1,
    status: patch.status ?? "queued",
    current_stage: patch.current_stage ?? "research",
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
  const events = db.query<Event, []>("SELECT * FROM events ORDER BY id ASC").all();
  return JSON.stringify({ jobs, events });
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  mkdirSync(dirname(docPath), { recursive: true });
  const lines = [
    "# report-status smoke evidence",
    "",
    "- Command: `bun run report-status-smoke`",
    `- Started: ${outcomes[0]?.startedAtIso ?? new Date().toISOString()}`,
    `- Finished: ${outcomes.at(-1)?.finishedAtIso ?? new Date().toISOString()}`,
    `- Scenario root: ${smokeRoot} (removed by finally-cleanup)`,
    `- Result: ${outcomes.filter((outcome) => outcome.status === "PASS").length}/${outcomes.length} PASS`,
    "",
    "This smoke exercises the read-only `report:status` CLI surface only. It does not run operator-only `bun run report:run`, real Codex report generation, real Telegram network, real git/process execution, notifier sending, publish/promote behavior, DB migrations beyond scenario setup, or preflight.",
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
