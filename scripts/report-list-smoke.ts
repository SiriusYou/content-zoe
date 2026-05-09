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
  insertEvent,
  insertJob,
  openDb,
  type DbClient,
  type Event,
  type Job,
} from "../src/db.ts";
import { runReportListCli } from "../src/bin/report-list.ts";
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
  | "report-list-missing-db"
  | "report-list-empty-db"
  | "report-list-default-all-sort-limit"
  | "report-list-status-filter"
  | "report-list-limit"
  | "report-list-flag-order-reverse"
  | "report-list-invalid-status"
  | "report-list-invalid-limit"
  | "report-list-invalid-command"
  | "report-list-excerpt-format"
  | "report-list-read-only-no-mutation"
  | "report-list-malformed-db"
  | "report-list-boundary-static-check";

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
  "report-list-missing-db",
  "report-list-empty-db",
  "report-list-default-all-sort-limit",
  "report-list-status-filter",
  "report-list-limit",
  "report-list-flag-order-reverse",
  "report-list-invalid-status",
  "report-list-invalid-limit",
  "report-list-invalid-command",
  "report-list-excerpt-format",
  "report-list-read-only-no-mutation",
  "report-list-malformed-db",
  "report-list-boundary-static-check",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = path.join(
  tmpdir(),
  `cz-report-list-smoke-${new Date().toISOString().replaceAll(":", "-")}`,
);
const docPath = resolve(repoRoot, "docs", "preflight", "report-list-smoke.md");
const slice416Scope = new Set([
  "src/bin/report-list.ts",
  "scripts/report-list-smoke.ts",
  "docs/preflight/report-list-smoke.md",
  "package.json",
  "scripts/report-show-smoke.ts",
  "docs/preflight/report-show-smoke.md",
  "scripts/report-status-smoke.ts",
  "docs/preflight/report-status-smoke.md",
  "scripts/report-remind-smoke.ts",
  "docs/preflight/report-remind-smoke.md",
  "scripts/report-create-smoke.ts",
  "docs/preflight/report-create-smoke.md",
  "scripts/bot-smoke.ts",
  "docs/preflight/bot-smoke.md",
]);
const reportListActiveTriggers = new Set([
  "src/bin/report-list.ts",
  "scripts/report-list-smoke.ts",
  "docs/preflight/report-list-smoke.md",
]);
const reportListActiveFrozenFiles = [
  "bun.lock",
  "bun.lockb",
  "src/bin/report-create.ts",
  "src/bin/report-remind.ts",
  "src/bin/report-status.ts",
  "src/bin/report-show.ts",
  "src/bin/report-run.ts",
  "src/security/sanitize.ts",
  "src/promote.ts",
  "src/db.ts",
  "src/preflight.ts",
  "scripts/lib/static-guardrails.ts",
];
const reportListActiveFrozenDirectories = [
  "src/telegram/",
  "src/migrations/",
  "src/lib/",
  "src/pipeline/",
  "src/llm/",
  "src/prompts/",
];
const reportListInheritedFrozenFiles = [
  "src/bin/report-list.ts",
  "scripts/report-list-smoke.ts",
  "docs/preflight/report-list-smoke.md",
];
const reportListInheritedFrozenDirectories = [
  "src/telegram/",
  "src/migrations/",
  "src/llm/",
  "src/prompts/",
];
const reportListStaticCheckTokens = [
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
const slice412ReportCreateFiles = [
  "docs/preflight/report-create-smoke.md",
  "package.json",
  "scripts/report-create-smoke.ts",
  "src/bin/report-create.ts",
  "src/security/sanitize.ts",
];
const slice413ReportRemindFiles = [
  "docs/preflight/report-remind-smoke.md",
  "package.json",
  "scripts/report-remind-smoke.ts",
  "src/bin/report-remind.ts",
];
const slice414ReportStatusFiles = [
  "docs/preflight/report-status-smoke.md",
  "package.json",
  "scripts/report-status-smoke.ts",
  "src/bin/report-status.ts",
];
const slice415ReportShowFiles = [
  "docs/preflight/report-show-smoke.md",
  "package.json",
  "scripts/report-show-smoke.ts",
  "src/bin/report-show.ts",
];
const fixedNow = 1_778_300_000;

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
    case "report-list-missing-db":
      return runMissingDb(dir);
    case "report-list-empty-db":
      return runEmptyDb(dir);
    case "report-list-default-all-sort-limit":
      return runDefaultAllSortLimit(dir);
    case "report-list-status-filter":
      return runStatusFilter(dir);
    case "report-list-limit":
      return runLimit(dir);
    case "report-list-flag-order-reverse":
      return runFlagOrderReverse(dir);
    case "report-list-invalid-status":
      return runInvalidStatus(dir);
    case "report-list-invalid-limit":
      return runInvalidLimit(dir);
    case "report-list-invalid-command":
      return runInvalidCommand(dir);
    case "report-list-excerpt-format":
      return runExcerptFormat(dir);
    case "report-list-read-only-no-mutation":
      return runReadOnlyNoMutation(dir);
    case "report-list-malformed-db":
      return runMalformedDb(dir);
    case "report-list-boundary-static-check":
      return runBoundaryStaticCheck();
  }
}

async function runMissingDb(dir: string): Promise<string[]> {
  const result = await runCli(dir, []);
  assert(result.exitCode === 0, `missing DB exit drifted: ${result.exitCode}`);
  assert(result.stdout === "NO_DATABASE\n", `missing DB stdout drifted: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr === "", `missing DB wrote stderr: ${result.stderr}`);
  assert(!existsSync(resolve(dir, ".data")), "report:list created .data for a missing DB");
  return [
    "Missing .data/content.db exits 0 with NO_DATABASE.",
    "No .data directory is created before the read-only DB open path.",
  ];
}

async function runEmptyDb(dir: string): Promise<string[]> {
  const { close } = openScenarioDb(dir);
  try {
    const result = await runCli(dir, []);
    assert(result.exitCode === 0, `empty DB exit drifted: ${result.exitCode}`);
    assert(result.stdout === "NO_JOBS\n", `empty DB stdout drifted: ${JSON.stringify(result.stdout)}`);
    assert(result.stderr === "", `empty DB wrote stderr: ${result.stderr}`);
    return ["Existing empty DB emits NO_JOBS with no stderr."];
  } finally {
    close();
  }
}

async function runDefaultAllSortLimit(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    for (let index = 0; index < 21; index += 1) {
      seedJob(db, `default-${String(index).padStart(2, "0")}`, {
        status: index % 2 === 0 ? "queued" : "published",
        updated_at: fixedNow + index,
      });
    }

    const result = await runCli(dir, []);
    assert(result.exitCode === 0, `default list failed: ${result.stderr}`);
    const lines = outputLines(result.stdout);
    assert(lines.length === 20, `default limit expected 20 rows, got ${lines.length}`);
    assert(lines[0]?.includes("job_id=default-20"), "default list did not sort by updated_at DESC");
    assert(!result.stdout.includes("job_id=default-00"), "default list did not apply limit 20");
    return [
      "Default invocation lists all statuses, applies limit=20, and sorts by updated_at DESC.",
      "The oldest of 21 seeded jobs is excluded by the default limit.",
    ];
  } finally {
    close();
  }
}

async function runStatusFilter(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "filter-queued", { status: "queued" });
    seedJob(db, "filter-awaiting", {
      status: "awaiting_approval",
      current_stage: "awaiting_approval",
      updated_at: fixedNow + 1,
    });
    seedJob(db, "filter-failed", { status: "failed", updated_at: fixedNow + 2 });

    const result = await runCli(dir, ["--status", "awaiting_approval"]);
    assert(result.exitCode === 0, `status filter failed: ${result.stderr}`);
    assert(outputLines(result.stdout).length === 1, "status filter returned more than one row");
    assert(result.stdout.includes("job_id=filter-awaiting"), "status filter omitted awaiting job");
    assert(!result.stdout.includes("filter-queued"), "status filter included queued job");
    assert(!result.stdout.includes("filter-failed"), "status filter included failed job");
    return ["Status filtering returns only jobs with the requested status."];
  } finally {
    close();
  }
}

async function runLimit(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "limit-1", { updated_at: fixedNow });
    seedJob(db, "limit-2", { updated_at: fixedNow + 1 });
    seedJob(db, "limit-3", { updated_at: fixedNow + 2 });

    const result = await runCli(dir, ["--limit", "2"]);
    assert(result.exitCode === 0, `limit failed: ${result.stderr}`);
    const lines = outputLines(result.stdout);
    assert(lines.length === 2, `limit expected 2 rows, got ${lines.length}`);
    assert(lines[0]?.includes("job_id=limit-3"), "limit output first row sort drifted");
    assert(lines[1]?.includes("job_id=limit-2"), "limit output second row sort drifted");
    return ["Explicit --limit 2 constrains row count after sort."];
  } finally {
    close();
  }
}

async function runFlagOrderReverse(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "reverse-1", { status: "queued", updated_at: fixedNow + 1 });
    seedJob(db, "reverse-2", { status: "queued", updated_at: fixedNow + 2 });
    seedJob(db, "reverse-3", { status: "published", updated_at: fixedNow + 3 });

    const canonical = await runCli(dir, ["--status", "queued", "--limit", "1"]);
    const reversed = await runCli(dir, ["--limit", "1", "--status", "queued"]);
    assert(canonical.exitCode === 0, `canonical flag order failed: ${canonical.stderr}`);
    assert(reversed.exitCode === 0, `reversed flag order failed: ${reversed.stderr}`);
    assert(canonical.stdout === reversed.stdout, "flag-order reverse output is not byte-identical");
    assert(canonical.stdout.includes("job_id=reverse-2"), "flag-order reverse selected wrong job");
    return ["Reversed --limit/--status order is byte-identical to canonical order."];
  } finally {
    close();
  }
}

async function runInvalidStatus(dir: string): Promise<string[]> {
  const { close } = openScenarioDb(dir);
  try {
    const result = await runCli(dir, ["--status", "done"]);
    assert(result.exitCode === 1, `invalid status exit drifted: ${result.exitCode}`);
    assert(result.stdout === "", `invalid status wrote stdout: ${JSON.stringify(result.stdout)}`);
    assert(result.stderr === "INVALID_STATUS: done\n", `invalid status stderr drifted: ${result.stderr}`);
    return ["Unknown status token exits 1 with INVALID_STATUS and no stdout."];
  } finally {
    close();
  }
}

async function runInvalidLimit(dir: string): Promise<string[]> {
  const { close } = openScenarioDb(dir);
  try {
    const invalidLimits = ["0", "101", "1.5", "+1", "001", "1x"];
    for (const value of invalidLimits) {
      const result = await runCli(dir, ["--limit", value]);
      assert(result.exitCode === 1, `${value} exit drifted: ${result.exitCode}`);
      assert(result.stdout === "", `${value} wrote stdout: ${JSON.stringify(result.stdout)}`);
      assert(result.stderr === `INVALID_LIMIT: ${value}\n`, `${value} stderr drifted: ${result.stderr}`);
    }
    return [
      "Limit grammar accepts only canonical unsigned base-10 integers from 1 through 100.",
      "Zero, >100, decimal, signed, leading-zero, and suffixed limits are rejected.",
    ];
  } finally {
    close();
  }
}

async function runInvalidCommand(dir: string): Promise<string[]> {
  const { close } = openScenarioDb(dir);
  try {
    const invalidArgv: readonly (readonly string[])[] = [
      ["--status=queued"],
      ["--limit=1"],
      ["--status"],
      ["--limit"],
      ["--status", "queued", "--status", "running"],
      ["--limit", "1", "--limit", "2"],
      ["--unknown"],
    ];
    for (const args of invalidArgv) {
      const result = await runCli(dir, args);
      assert(result.exitCode === 1, `${args.join(" ")} exit drifted: ${result.exitCode}`);
      assert(result.stdout === "", `${args.join(" ")} wrote stdout: ${JSON.stringify(result.stdout)}`);
      assert(result.stderr === "INVALID_COMMAND\n", `${args.join(" ")} stderr drifted: ${result.stderr}`);
    }
    return ["Equals-form flags, missing values, duplicate flags, and unknown flags are INVALID_COMMAND."];
  } finally {
    close();
  }
}

async function runExcerptFormat(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    const longError = `${"x".repeat(180)}\nwith\ttab`;
    seedJob(db, "format-1", {
      status: "failed",
      current_stage: "draft\tstage\nwith whitespace",
      run_dir: ".runs/format-1\twith\npath",
      artifact_dir: "   ",
      notified_at: 1_778_300_123,
      last_notify_error: "notify\tfailed\nwith   spaces",
      error: longError,
    });

    const result = await runCli(dir, ["--status", "failed"]);
    assert(result.exitCode === 0, `format check failed: ${result.stderr}`);
    const lines = outputLines(result.stdout);
    assert(lines.length === 1, `format check emitted extra lines: ${result.stdout}`);
    const columns = lines[0]?.split("\t") ?? [];
    assert(columns.length === 12, `JOB record column count drifted: ${columns.length}`);
    assert(lines[0]?.includes("stage=draft stage with whitespace"), "stage whitespace was not collapsed");
    assert(lines[0]?.includes("run_dir=.runs/format-1 with path"), "run_dir whitespace was not collapsed");
    assert(lines[0]?.includes("artifact_dir=-"), "blank artifact_dir did not degrade to dash");
    assert(lines[0]?.includes("last_notify_error=notify failed with spaces"), "notify error excerpt was not field-safe");
    const errorColumn = columns.find((column) => column.startsWith("error="));
    assert(errorColumn !== undefined, "missing error column");
    assert(errorColumn.length === "error=".length + 160, "error excerpt was not capped at 160 chars");
    return [
      "DB-derived path/excerpt fields collapse tabs/newlines/repeated whitespace into field-safe values.",
      "Blank path-like fields degrade to '-' and long error text is capped at 160 chars.",
    ];
  } finally {
    close();
  }
}

async function runReadOnlyNoMutation(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    const job = seedJob(db, "read-only", { status: "queued" });
    insertEvent(db, {
      job_id: job.id,
      attempt_number: job.attempt_number,
      type: "seeded",
      payload: JSON.stringify({ ok: true }),
      created_at: fixedNow,
    });
    const before = stableDbSnapshot(db);

    const result = await runCli(dir, ["--status", "queued"]);
    assert(result.exitCode === 0, `read-only run failed: ${result.stderr}`);

    const after = stableDbSnapshot(db);
    assert(before === after, "report:list mutated jobs or events");
    assert(!existsSync(resolve(dir, ".runs")), "report:list created .runs");
    assert(!existsSync(resolve(dir, "reports")), "report:list created reports");
    assert(!existsSync(resolve(dir, "attempts")), "report:list created attempt output");
    return [
      "Jobs and events snapshots are byte-identical before and after report:list.",
      "No .runs, reports, or attempt output directories are created.",
    ];
  } finally {
    close();
  }
}

async function runMalformedDb(dir: string): Promise<string[]> {
  mkdirSync(resolve(dir, ".data"), { recursive: true });
  writeFileSync(resolve(dir, ".data", "content.db"), "not a sqlite database");

  const result = await runCli(dir, []);
  assert(result.exitCode === 1, `malformed DB exit drifted: ${result.exitCode}`);
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
    activeTriggerFiles: reportListActiveTriggers,
    activeScope: slice416Scope,
    activeFrozenFiles: reportListActiveFrozenFiles,
    activeFrozenDirectories: reportListActiveFrozenDirectories,
    inheritedFrozenFiles: reportListInheritedFrozenFiles,
    inheritedFrozenDirectories: reportListInheritedFrozenDirectories,
  });
  assert(scopeMode === "active-slice", "report-list smoke should run in active-slice mode for Slice 4.16");

  let activeScopeRejectedOutOfScope = false;
  try {
    assertCycleScopePolicy({
      changed: ["src/bin/report-list.ts", "src/telegram/bot.ts"],
      activeTriggerFiles: reportListActiveTriggers,
      activeScope: slice416Scope,
      activeFrozenFiles: reportListActiveFrozenFiles,
      activeFrozenDirectories: reportListActiveFrozenDirectories,
      inheritedFrozenFiles: reportListInheritedFrozenFiles,
      inheritedFrozenDirectories: reportListInheritedFrozenDirectories,
    });
  } catch (err) {
    activeScopeRejectedOutOfScope = String(err).includes("changed files outside declared scope");
  }
  assert(activeScopeRejectedOutOfScope, "active-slice scope check did not reject Telegram product files");

  for (const [label, files] of [
    ["Slice 4.12 report:create", slice412ReportCreateFiles],
    ["Slice 4.13 report:remind", slice413ReportRemindFiles],
    ["Slice 4.14 report:status", slice414ReportStatusFiles],
    ["Slice 4.15 report:show", slice415ReportShowFiles],
  ] as const) {
    const mode = assertCycleScopePolicy({
      changed: files,
      activeTriggerFiles: reportListActiveTriggers,
      activeScope: slice416Scope,
      inheritedFrozenFiles: reportListInheritedFrozenFiles,
      inheritedFrozenDirectories: reportListInheritedFrozenDirectories,
    });
    assert(mode === "inherited-surface", `${label} files should be inherited for report-list-smoke`);
  }

  const packageJson = JSON.parse(readRepoSource(repoRoot, "package.json")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert(packageJson.scripts?.["report:list"] === "bun src/bin/report-list.ts", "missing report:list script");
  assert(packageJson.scripts?.["report-list-smoke"] === "bun scripts/report-list-smoke.ts", "missing report-list-smoke script");
  assert(packageJson.scripts?.["report:show"] === "bun src/bin/report-show.ts", "report:show script drifted");
  assert(packageJson.scripts?.["report:status"] === "bun src/bin/report-status.ts", "report:status script drifted");
  assert(packageJson.scripts?.["report:remind"] === "bun src/bin/report-remind.ts", "report:remind script drifted");
  assert(packageJson.scripts?.["report:create"] === "bun src/bin/report-create.ts", "report:create script drifted");
  assert(packageJson.dependencies === undefined, "package.json gained dependencies");
  assert(packageJson.devDependencies?.typescript === "^5.6.3", "typescript devDependency drifted");
  assert(packageJson.devDependencies?.["@types/bun"] === "^1.1.13", "@types/bun devDependency drifted");

  const listSource = readRepoSource(repoRoot, "src/bin/report-list.ts");
  assertNoForbiddenPatterns(listSource, [
    ...PROCESS_SPAWN_PATTERNS,
    ...TELEGRAM_SDK_NETWORK_PATTERNS,
    ...PROMPT_SURFACE_PATTERNS,
    [/from\s+["'][^"']*db\.ts["']|openDb|insertJob|insertEvent|updateJob|casUpdateJob|runMigrations|findEventsByJob/, "mutating DB helper import"],
    [/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bCREATE\s+TABLE\b|\bALTER\b|\bDROP\b|\bPRAGMA\b/i, "DB mutation SQL"],
    [/FROM\s+events/i, "events table read"],
    [/from\s+["'][^"']*report-create\.ts["']|from\s+["'][^"']*report-remind\.ts["']|from\s+["'][^"']*report-status\.ts["']|from\s+["'][^"']*report-show\.ts["']|from\s+["'][^"']*report-run\.ts["']/, "other CLI import"],
    [/from\s+["'][^"']*\/telegram\//, "Telegram import"],
    [/from\s+["'][^"']*promote\.ts["']|promoteJob|publish_manifest/, "promote/manifest authority surface"],
    [/from\s+["'][^"']*preflight\.ts["']|CodexCliProvider/, "preflight/Codex import"],
  ], "src/bin/report-list.ts");

  const listAndSmokeSource = `${listSource}\n${readRepoSource(repoRoot, "scripts/report-list-smoke.ts")}`;
  assertNoForbiddenPatterns(stripAllowedStaticCheckStrings(listAndSmokeSource, reportListStaticCheckTokens), [
    [/child_process|Bun\.spawn|\bfetch\s*\(|notifyPendingApprovals|promoteJob|CodexCliProvider/, "forbidden execution surface"],
    [/https:\/\/api\.telegram\.org/, "Telegram API URL"],
  ], "report-list source/smoke outside static-check pattern strings");

  return [
    `Cycle-scope boundary check ran in ${scopeMode} mode and saw changed files: ${changed.join(", ") || "<none>"}.`,
    "Synthetic active-slice scope check rejects out-of-scope Telegram product files.",
    "Synthetic Slice 4.12 report:create, Slice 4.13 report:remind, Slice 4.14 report:status, and Slice 4.15 report:show changed-sets resolve to inherited-surface mode for report-list-smoke.",
    "package.json change is limited to report:list and report-list-smoke additions with dependency sets unchanged.",
    "report-list.ts avoids mutating DB helpers, events reads, other CLI imports, Telegram, promote/manifest authority, preflight/Codex, process, network, LLM, and prompt surfaces.",
  ];
}

async function runCli(dir: string, args: readonly string[]): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runReportListCli({
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
    week_key: patch.week_key ?? `2027-W02-${id}`,
    topic: patch.topic ?? "List topic",
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

function outputLines(stdout: string): string[] {
  return stdout.split("\n").filter((line) => line.length > 0);
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  mkdirSync(dirname(docPath), { recursive: true });
  const lines = [
    "# report-list smoke evidence",
    "",
    "- Command: `bun run report-list-smoke`",
    `- Started: ${outcomes[0]?.startedAtIso ?? new Date().toISOString()}`,
    `- Finished: ${outcomes.at(-1)?.finishedAtIso ?? new Date().toISOString()}`,
    `- Scenario root: ${smokeRoot} (removed by finally-cleanup)`,
    `- Result: ${outcomes.filter((outcome) => outcome.status === "PASS").length}/${outcomes.length} PASS`,
    "",
    "This smoke exercises the read-only `report:list` CLI surface only. It does not run operator-only `bun run report:run`, real Codex report generation, real Telegram network, real git/process execution, notifier sending, publish/promote behavior, manifest authority reads, artifact body reads, events reads, DB migrations beyond scenario setup, or preflight.",
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
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");
}

function formatThrown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

if (import.meta.main) {
  const exitCode = await main();
  process.exit(exitCode);
}
