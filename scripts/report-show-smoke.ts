import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
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
import { runReportShowCli } from "../src/bin/report-show.ts";
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
  | "report-show-missing-db"
  | "report-show-invalid-command"
  | "report-show-invalid-artifact"
  | "report-show-unknown-job"
  | "report-show-approval-summary"
  | "report-show-primary-report"
  | "report-show-translated-report"
  | "report-show-sources"
  | "report-show-missing-artifact-value"
  | "report-show-missing-artifact-file"
  | "report-show-unsafe-traversal"
  | "report-show-unsafe-absolute-outside"
  | "report-show-unsafe-sibling-prefix"
  | "report-show-unsafe-symlink-outside"
  | "report-show-directory-rejection"
  | "report-show-read-failure"
  | "report-show-newline-bytes"
  | "report-show-read-only-no-mutation"
  | "report-show-malformed-db"
  | "report-show-boundary-static-check";

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
  "report-show-missing-db",
  "report-show-invalid-command",
  "report-show-invalid-artifact",
  "report-show-unknown-job",
  "report-show-approval-summary",
  "report-show-primary-report",
  "report-show-translated-report",
  "report-show-sources",
  "report-show-missing-artifact-value",
  "report-show-missing-artifact-file",
  "report-show-unsafe-traversal",
  "report-show-unsafe-absolute-outside",
  "report-show-unsafe-sibling-prefix",
  "report-show-unsafe-symlink-outside",
  "report-show-directory-rejection",
  "report-show-read-failure",
  "report-show-newline-bytes",
  "report-show-read-only-no-mutation",
  "report-show-malformed-db",
  "report-show-boundary-static-check",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = path.join(
  tmpdir(),
  `cz-report-show-smoke-${new Date().toISOString().replaceAll(":", "-")}`,
);
const docPath = resolve(repoRoot, "docs", "preflight", "report-show-smoke.md");
const slice415Scope = new Set([
  "src/bin/report-show.ts",
  "scripts/report-show-smoke.ts",
  "docs/preflight/report-show-smoke.md",
  "package.json",
  "scripts/report-status-smoke.ts",
  "docs/preflight/report-status-smoke.md",
  "scripts/report-remind-smoke.ts",
  "docs/preflight/report-remind-smoke.md",
  "scripts/report-create-smoke.ts",
  "docs/preflight/report-create-smoke.md",
  "scripts/bot-smoke.ts",
  "docs/preflight/bot-smoke.md",
]);
const reportShowActiveTriggers = new Set([
  "src/bin/report-show.ts",
  "scripts/report-show-smoke.ts",
  "docs/preflight/report-show-smoke.md",
]);
const reportShowActiveFrozenFiles = [
  "bun.lock",
  "bun.lockb",
  "src/bin/report-create.ts",
  "src/bin/report-remind.ts",
  "src/bin/report-status.ts",
  "src/bin/report-run.ts",
  "src/security/sanitize.ts",
  "src/promote.ts",
  "src/db.ts",
  "src/preflight.ts",
  "scripts/lib/static-guardrails.ts",
];
const reportShowActiveFrozenDirectories = [
  "src/telegram/",
  "src/migrations/",
  "src/lib/",
  "src/pipeline/",
  "src/llm/",
  "src/prompts/",
];
const reportShowInheritedFrozenFiles = [
  "src/bin/report-show.ts",
  "scripts/report-show-smoke.ts",
  "docs/preflight/report-show-smoke.md",
];
const reportShowInheritedFrozenDirectories = [
  "src/telegram/",
  "src/migrations/",
  "src/llm/",
  "src/prompts/",
];
const reportShowStaticCheckTokens = [
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
const slice414ReportStatusFiles = [
  "docs/preflight/report-status-smoke.md",
  "package.json",
  "scripts/report-status-smoke.ts",
  "src/bin/report-status.ts",
];
const fixedNow = 1_778_200_000;

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

  const failures = outcomes.filter((outcome) => outcome.status === "FAIL");
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`${failure.name}: ${failure.details.join("; ")}`);
    }
    return 1;
  }

  console.log(`report-show-smoke: ${outcomes.length}/${outcomes.length} PASS`);
  return 0;
}

async function runScenario(name: ScenarioName): Promise<ScenarioOutcome> {
  const startedAtIso = new Date().toISOString();
  try {
    const details = await scenarioDetails(name);
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
      details: [err instanceof Error ? err.message : String(err)],
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
    };
  }
}

async function scenarioDetails(name: ScenarioName): Promise<string[]> {
  switch (name) {
    case "report-show-missing-db":
      return checkMissingDb();
    case "report-show-invalid-command":
      return checkInvalidCommand();
    case "report-show-invalid-artifact":
      return checkInvalidArtifact();
    case "report-show-unknown-job":
      return checkUnknownJob();
    case "report-show-approval-summary":
      return checkApprovalSummary();
    case "report-show-primary-report":
      return checkFileArtifact("primary-report", "primary_report_path", "reports/en.md", "Primary body\n");
    case "report-show-translated-report":
      return checkFileArtifact("translated-report", "translated_report_path", "reports/zh.md", "Translated body\n");
    case "report-show-sources":
      return checkFileArtifact("sources", "sources_path", "research/sources.json", "{\"sources\":[]}\n");
    case "report-show-missing-artifact-value":
      return checkMissingArtifactValue();
    case "report-show-missing-artifact-file":
      return checkMissingArtifactFile();
    case "report-show-unsafe-traversal":
      return checkUnsafePath("../outside.md", "UNSAFE_ARTIFACT_PATH: primary-report ../outside.md");
    case "report-show-unsafe-absolute-outside":
      return checkAbsoluteOutsidePath();
    case "report-show-unsafe-sibling-prefix":
      return checkSiblingPrefixPath();
    case "report-show-unsafe-symlink-outside":
      return checkSymlinkOutsidePath();
    case "report-show-directory-rejection":
      return checkDirectoryRejection();
    case "report-show-read-failure":
      return checkReadFailure();
    case "report-show-newline-bytes":
      return checkNewlineBytes();
    case "report-show-read-only-no-mutation":
      return checkReadOnlyNoMutation();
    case "report-show-malformed-db":
      return checkMalformedDb();
    case "report-show-boundary-static-check":
      return runBoundaryStaticCheck();
  }
}

async function checkMissingDb(): Promise<string[]> {
  const dir = scenarioDir("missing-db");
  const result = await runCli(dir, ["job-1", "--artifact", "approval-summary"]);
  assert(result.exitCode === 0, `missing DB exit code drifted: ${result.exitCode}`);
  assert(result.stdout === "NO_DATABASE\n", `missing DB stdout drifted: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr === "", `missing DB stderr drifted: ${JSON.stringify(result.stderr)}`);
  assert(!existsSync(resolve(dir, ".data")), "missing DB path created .data directory");
  return [
    "Missing DB exits 0 with NO_DATABASE.",
    "Missing DB path does not create .data or content.db.",
  ];
}

async function checkInvalidCommand(): Promise<string[]> {
  const dir = scenarioDir("invalid-command");
  const result = await runCli(dir, ["job-1"]);
  assert(result.exitCode === 1, `invalid command exit drifted: ${result.exitCode}`);
  assert(result.stdout === "", "invalid command wrote stdout");
  assert(result.stderr === "INVALID_COMMAND\n", `invalid command stderr drifted: ${result.stderr}`);
  return ["Invalid grammar exits 1 with INVALID_COMMAND and no stdout."];
}

async function checkInvalidArtifact(): Promise<string[]> {
  const dir = scenarioDir("invalid-artifact");
  const result = await runCli(dir, ["job-1", "--artifact", "manifest"]);
  assert(result.exitCode === 1, `invalid artifact exit drifted: ${result.exitCode}`);
  assert(result.stdout === "", "invalid artifact wrote stdout");
  assert(result.stderr === "INVALID_ARTIFACT: manifest\n", `invalid artifact stderr drifted: ${result.stderr}`);
  return ["Invalid artifact key exits 1 with INVALID_ARTIFACT and no stdout."];
}

async function checkUnknownJob(): Promise<string[]> {
  const dir = scenarioDir("unknown-job");
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "known-job");
  } finally {
    close();
  }
  const result = await runCli(dir, ["missing-job", "--artifact", "approval-summary"]);
  assert(result.exitCode === 1, `unknown job exit drifted: ${result.exitCode}`);
  assert(result.stdout === "", "unknown job wrote stdout");
  assert(result.stderr === "UNKNOWN_JOB: missing-job\n", `unknown job stderr drifted: ${result.stderr}`);
  return ["Existing DB with unknown job exits 1 with UNKNOWN_JOB and no stdout."];
}

async function checkApprovalSummary(): Promise<string[]> {
  const dir = scenarioDir("approval-summary");
  const body = "Evidence Grade: B\nNeeds operator review.\n";
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "approval-job", { approval_summary: body });
  } finally {
    close();
  }
  const result = await runCli(dir, ["approval-job", "--artifact", "approval-summary"]);
  assert(result.exitCode === 0, `approval-summary exit drifted: ${result.exitCode}`);
  assert(result.stderr === "", `approval-summary stderr drifted: ${result.stderr}`);
  assert(result.stdout === expectedOutput("approval-job", "approval-summary", "db", "-", body), "approval-summary stdout drifted");
  return ["approval-summary is emitted from DB text with source=db and path=-."];
}

async function checkFileArtifact(
  artifact: "primary-report" | "translated-report" | "sources",
  column: "primary_report_path" | "translated_report_path" | "sources_path",
  filePath: string,
  body: string,
): Promise<string[]> {
  const dir = scenarioDir(artifact);
  writeScenarioFile(dir, filePath, body);
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, `${artifact}-job`, { [column]: filePath });
  } finally {
    close();
  }
  const result = await runCli(dir, [`${artifact}-job`, "--artifact", artifact]);
  assert(result.exitCode === 0, `${artifact} exit drifted: ${result.exitCode}`);
  assert(result.stderr === "", `${artifact} stderr drifted: ${result.stderr}`);
  assert(result.stdout === expectedOutput(`${artifact}-job`, artifact, "file", filePath, body), `${artifact} stdout drifted`);
  return [`${artifact} is emitted from a repo-contained file path with deterministic header and body.`];
}

async function checkMissingArtifactValue(): Promise<string[]> {
  const dir = scenarioDir("missing-artifact-value");
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "missing-artifact-value-job", { approval_summary: "   \n\t" });
  } finally {
    close();
  }
  const result = await runCli(dir, ["missing-artifact-value-job", "--artifact", "approval-summary"]);
  assert(result.exitCode === 1, `missing artifact value exit drifted: ${result.exitCode}`);
  assert(result.stdout === "", "missing artifact value wrote stdout");
  assert(result.stderr === "NO_ARTIFACT: approval-summary\n", `missing artifact value stderr drifted: ${result.stderr}`);
  return ["Blank DB-backed approval summary exits 1 with NO_ARTIFACT."];
}

async function checkMissingArtifactFile(): Promise<string[]> {
  const dir = scenarioDir("missing-artifact-file");
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "missing-artifact-file-job", { primary_report_path: "reports/missing.md" });
  } finally {
    close();
  }
  const result = await runCli(dir, ["missing-artifact-file-job", "--artifact", "primary-report"]);
  assert(result.exitCode === 1, `missing artifact file exit drifted: ${result.exitCode}`);
  assert(result.stdout === "", "missing artifact file wrote stdout");
  assert(result.stderr === "ARTIFACT_MISSING: primary-report reports/missing.md\n", `missing artifact file stderr drifted: ${result.stderr}`);
  return ["Missing repo-contained artifact file exits 1 with ARTIFACT_MISSING."];
}

async function checkUnsafePath(rawPath: string, expectedPrefix: string): Promise<string[]> {
  const dir = scenarioDir(`unsafe-${rawPath.replaceAll("/", "-")}`);
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "unsafe-job", { primary_report_path: rawPath });
  } finally {
    close();
  }
  const result = await runCli(dir, ["unsafe-job", "--artifact", "primary-report"]);
  assertUnsafeResult(result, expectedPrefix);
  return [`Unsafe path ${rawPath} is rejected before artifact read.`];
}

async function checkAbsoluteOutsidePath(): Promise<string[]> {
  const dir = scenarioDir("absolute-outside");
  const outside = path.join(smokeRoot, "absolute-outside.md");
  writeFileSync(outside, "outside\n");
  return checkUnsafePath(outside, `UNSAFE_ARTIFACT_PATH: primary-report ${outside}`);
}

async function checkSiblingPrefixPath(): Promise<string[]> {
  const dir = scenarioDir("repo");
  const sibling = path.join(dirname(dir), `${path.basename(dir)}-other`, "secret.md");
  writeScenarioFile(dirname(sibling), basename(sibling), "sibling\n");
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "sibling-prefix-job", { primary_report_path: sibling });
  } finally {
    close();
  }
  const result = await runCli(dir, ["sibling-prefix-job", "--artifact", "primary-report"]);
  assertUnsafeResult(result, `UNSAFE_ARTIFACT_PATH: primary-report ${sibling}`);
  return ["Sibling-prefix absolute path is rejected with path-relative containment, not string prefix."];
}

async function checkSymlinkOutsidePath(): Promise<string[]> {
  const dir = scenarioDir("symlink-outside");
  const outside = path.join(smokeRoot, "outside", "secret.md");
  writeScenarioFile(dirname(outside), basename(outside), "outside secret\n");
  const link = path.join(dir, "reports", "linked.md");
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(outside, link);
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "symlink-job", { primary_report_path: "reports/linked.md" });
  } finally {
    close();
  }
  const result = await runCli(dir, ["symlink-job", "--artifact", "primary-report"]);
  assertUnsafeResult(result, "UNSAFE_ARTIFACT_PATH: primary-report reports/linked.md");
  return ["Symlink-to-outside artifact path is rejected after realpath containment check."];
}

async function checkDirectoryRejection(): Promise<string[]> {
  const dir = scenarioDir("directory-rejection");
  mkdirSync(path.join(dir, "reports", "folder"), { recursive: true });
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "directory-job", { primary_report_path: "reports/folder" });
  } finally {
    close();
  }
  const result = await runCli(dir, ["directory-job", "--artifact", "primary-report"]);
  assertUnsafeResult(result, "UNSAFE_ARTIFACT_PATH: primary-report reports/folder");
  return ["Directory artifact path is rejected as unsafe/non-file."];
}

async function checkReadFailure(): Promise<string[]> {
  const dir = scenarioDir("read-failure");
  writeScenarioFile(dir, "reports/en.md", "will throw\n");
  const { db, close } = openScenarioDb(dir);
  let before: string;
  try {
    seedJob(db, "read-failure-job", { primary_report_path: "reports/en.md" });
    insertEvent(db, {
      job_id: "read-failure-job",
      attempt_number: 1,
      type: "fixture",
      payload: "{}",
      created_at: fixedNow,
    });
    before = stableDbSnapshot(db);
  } finally {
    close();
  }

  const result = await runCli(dir, ["read-failure-job", "--artifact", "primary-report"], {
    readTextFile: () => {
      throw new Error("forced read failure");
    },
  });
  assert(result.exitCode === 1, `read failure exit drifted: ${result.exitCode}`);
  assert(result.stdout === "", "read failure wrote stdout");
  assert(result.stderr.startsWith("ARTIFACT_READ_FAILED:"), `read failure stderr drifted: ${result.stderr}`);

  const { db: afterDb, close: closeAfter } = openScenarioDb(dir);
  try {
    assert(stableDbSnapshot(afterDb) === before, "read failure mutated jobs/events");
  } finally {
    closeAfter();
  }
  return ["Injected file-read failure exits with ARTIFACT_READ_FAILED and leaves jobs/events unchanged."];
}

async function checkNewlineBytes(): Promise<string[]> {
  const dir = scenarioDir("newline-bytes");
  const body = "No trailing newline";
  writeScenarioFile(dir, "reports/no-newline.md", body);
  const { db, close } = openScenarioDb(dir);
  try {
    seedJob(db, "newline-job", { primary_report_path: "reports/no-newline.md" });
  } finally {
    close();
  }
  const result = await runCli(dir, ["newline-job", "--artifact", "primary-report"]);
  const emittedBody = `${body}\n`;
  const expected = expectedOutput("newline-job", "primary-report", "file", "reports/no-newline.md", body);
  assert(result.exitCode === 0, `newline bytes exit drifted: ${result.exitCode}`);
  assert(result.stdout === expected, `newline bytes stdout drifted: ${JSON.stringify(result.stdout)}`);
  assert(result.stdout.includes(`bytes=${new TextEncoder().encode(emittedBody).length}`), "bytes count does not match normalized emitted body");
  return ["Body without trailing newline gets exactly one newline and bytes= counts the emitted body."];
}

async function checkReadOnlyNoMutation(): Promise<string[]> {
  const dir = scenarioDir("read-only-no-mutation");
  writeScenarioFile(dir, "reports/en.md", "Primary\n");
  const { db, close } = openScenarioDb(dir);
  let before: string;
  try {
    seedJob(db, "readonly-job", {
      approval_summary: "Evidence Grade: A\n",
      primary_report_path: "reports/en.md",
    });
    insertEvent(db, {
      job_id: "readonly-job",
      attempt_number: 1,
      type: "fixture",
      payload: "{\"ok\":true}",
      created_at: fixedNow,
    });
    before = stableDbSnapshot(db);
  } finally {
    close();
  }

  const success = await runCli(dir, ["readonly-job", "--artifact", "primary-report"]);
  assert(success.exitCode === 0, "read-only success path failed");
  const failure = await runCli(dir, ["readonly-job", "--artifact", "sources"]);
  assert(failure.exitCode === 1, "read-only failure path did not fail as expected");

  const { db: afterDb, close: closeAfter } = openScenarioDb(dir);
  try {
    assert(stableDbSnapshot(afterDb) === before, "success/failure report:show calls mutated jobs/events");
  } finally {
    closeAfter();
  }
  return ["Representative success and failure calls leave jobs/events byte-identical."];
}

async function checkMalformedDb(): Promise<string[]> {
  const dir = scenarioDir("malformed-db");
  const dbPath = resolve(dir, ".data", "content.db");
  mkdirSync(dirname(dbPath), { recursive: true });
  writeFileSync(dbPath, "not sqlite");
  const result = await runCli(dir, ["job-1", "--artifact", "approval-summary"]);
  assert(result.exitCode === 1, `malformed DB exit drifted: ${result.exitCode}`);
  assert(result.stdout === "", `malformed DB wrote stdout: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr.startsWith("DB_READ_FAILED:"), `malformed DB stderr drifted: ${result.stderr}`);
  assert(existsSync(dbPath), "malformed DB file was removed");
  return ["Malformed existing DB exits non-zero with DB_READ_FAILED and no stdout."];
}

function runBoundaryStaticCheck(): string[] {
  const changed = changedFilesForCurrentCycle(repoRoot);
  const scopeMode = assertCycleScopePolicy({
    changed,
    activeTriggerFiles: reportShowActiveTriggers,
    activeScope: slice415Scope,
    activeFrozenFiles: reportShowActiveFrozenFiles,
    activeFrozenDirectories: reportShowActiveFrozenDirectories,
    inheritedFrozenFiles: reportShowInheritedFrozenFiles,
    inheritedFrozenDirectories: reportShowInheritedFrozenDirectories,
  });
  assert(scopeMode === "active-slice", "report-show smoke should run in active-slice mode for Slice 4.15");

  let activeScopeRejectedOutOfScope = false;
  try {
    assertCycleScopePolicy({
      changed: ["scripts/report-show-smoke.ts", "src/telegram/bot.ts"],
      activeTriggerFiles: reportShowActiveTriggers,
      activeScope: slice415Scope,
      activeFrozenFiles: reportShowActiveFrozenFiles,
      activeFrozenDirectories: reportShowActiveFrozenDirectories,
      inheritedFrozenFiles: reportShowInheritedFrozenFiles,
      inheritedFrozenDirectories: reportShowInheritedFrozenDirectories,
    });
  } catch (err) {
    activeScopeRejectedOutOfScope = String(err).includes("changed files outside declared scope");
  }
  assert(activeScopeRejectedOutOfScope, "active-slice scope check did not reject Telegram product files");

  const slice414Mode = assertCycleScopePolicy({
    changed: slice414ReportStatusFiles,
    activeTriggerFiles: reportShowActiveTriggers,
    activeScope: slice415Scope,
    inheritedFrozenFiles: reportShowInheritedFrozenFiles,
    inheritedFrozenDirectories: reportShowInheritedFrozenDirectories,
  });
  assert(slice414Mode === "inherited-surface", "Slice 4.14 report:status files should be inherited for report-show-smoke");

  const packageJson = JSON.parse(readRepoSource(repoRoot, "package.json")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert(packageJson.scripts?.["report:show"] === "bun src/bin/report-show.ts", "missing report:show script");
  assert(packageJson.scripts?.["report-show-smoke"] === "bun scripts/report-show-smoke.ts", "missing report-show-smoke script");
  assert(packageJson.scripts?.["report:status"] === "bun src/bin/report-status.ts", "report:status script drifted");
  assert(packageJson.scripts?.["report:remind"] === "bun src/bin/report-remind.ts", "report:remind script drifted");
  assert(packageJson.scripts?.["report:create"] === "bun src/bin/report-create.ts", "report:create script drifted");
  assert(packageJson.dependencies === undefined, "package.json gained dependencies");
  assert(packageJson.devDependencies?.typescript === "^5.6.3", "typescript devDependency drifted");
  assert(packageJson.devDependencies?.["@types/bun"] === "^1.1.13", "@types/bun devDependency drifted");

  const showSource = readRepoSource(repoRoot, "src/bin/report-show.ts");
  assertNoForbiddenPatterns(showSource, [
    ...PROCESS_SPAWN_PATTERNS,
    ...TELEGRAM_SDK_NETWORK_PATTERNS,
    ...PROMPT_SURFACE_PATTERNS,
    [/from\s+["'][^"']*db\.ts["']|openDb|insertJob|insertEvent|updateJob|casUpdateJob|runMigrations|findEventsByJob/, "mutating DB helper import"],
    [/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bCREATE\s+TABLE\b|\bALTER\b|\bDROP\b|\bPRAGMA\b/i, "DB mutation SQL"],
    [/FROM\s+events/i, "events table read"],
    [/from\s+["'][^"']*report-create\.ts["']|from\s+["'][^"']*report-remind\.ts["']|from\s+["'][^"']*report-status\.ts["']|from\s+["'][^"']*report-run\.ts["']/, "other CLI import"],
    [/from\s+["'][^"']*\/telegram\//, "Telegram import"],
    [/from\s+["'][^"']*promote\.ts["']|promoteJob|publish_manifest/, "promote/manifest authority surface"],
    [/from\s+["'][^"']*preflight\.ts["']|CodexCliProvider/, "preflight/Codex import"],
  ], "src/bin/report-show.ts");

  const showAndSmokeSource = `${showSource}\n${readRepoSource(repoRoot, "scripts/report-show-smoke.ts")}`;
  assertNoForbiddenPatterns(stripAllowedStaticCheckStrings(showAndSmokeSource, reportShowStaticCheckTokens), [
    [/child_process|Bun\.spawn|\bfetch\s*\(|notifyPendingApprovals|promoteJob|CodexCliProvider/, "forbidden execution surface"],
    [/https:\/\/api\.telegram\.org/, "Telegram API URL"],
  ], "report-show source/smoke outside static-check pattern strings");

  return [
    `Cycle-scope boundary check ran in ${scopeMode} mode and saw changed files: ${changed.join(", ") || "<none>"}.`,
    "Synthetic active-slice scope check rejects out-of-scope Telegram product files.",
    "Synthetic Slice 4.14 report:status changed-set resolves to inherited-surface mode for report-show-smoke.",
    "package.json change is limited to report:show and report-show-smoke scripts with dependency sets unchanged.",
    "report-show.ts avoids mutating DB helpers, events reads, other CLI imports, Telegram, promote/manifest authority, preflight/Codex, process, network, LLM, and prompt surfaces.",
  ];
}

async function runCli(
  dir: string,
  args: readonly string[],
  opts: { readonly readTextFile?: (filePath: string) => string } = {},
): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runReportShowCli({
    cwd: dir,
    args,
    readTextFile: opts.readTextFile,
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
    week_key: patch.week_key ?? "2027-W01",
    topic: patch.topic ?? "Show topic",
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

function scenarioDir(name: string): string {
  const dir = path.join(smokeRoot, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeScenarioFile(root: string, relativePath: string, contents: string): void {
  const filePath = path.join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function expectedOutput(
  jobId: string,
  artifact: string,
  source: "db" | "file",
  displayPath: string,
  body: string,
): string {
  const emittedBody = body.endsWith("\n") ? body : `${body}\n`;
  const bytes = new TextEncoder().encode(emittedBody).length;
  return [
    [
      "ARTIFACT",
      `job_id=${jobId}`,
      `artifact=${artifact}`,
      `source=${source}`,
      `path=${displayPath}`,
      `bytes=${bytes}`,
    ].join("\t"),
    "",
    emittedBody,
  ].join("\n");
}

function assertUnsafeResult(result: CliResult, expectedPrefix: string): void {
  assert(result.exitCode === 1, `unsafe path exit drifted: ${result.exitCode}`);
  assert(result.stdout === "", `unsafe path wrote stdout: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr === `${expectedPrefix}\n`, `unsafe path stderr drifted: ${result.stderr}`);
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  mkdirSync(dirname(docPath), { recursive: true });
  const lines = [
    "# report-show smoke evidence",
    "",
    "- Command: `bun run report-show-smoke`",
    `- Started: ${outcomes[0]?.startedAtIso ?? new Date().toISOString()}`,
    `- Finished: ${outcomes.at(-1)?.finishedAtIso ?? new Date().toISOString()}`,
    `- Scenario root: ${smokeRoot} (removed by finally-cleanup)`,
    `- Result: ${outcomes.filter((outcome) => outcome.status === "PASS").length}/${outcomes.length} PASS`,
    "",
    "This smoke exercises the read-only `report:show` CLI surface only. It does not run operator-only `bun run report:run`, real Codex report generation, real Telegram network, real git/process execution, notifier sending, publish/promote behavior, manifest authority reads, DB migrations beyond scenario setup, or preflight.",
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

function basename(value: string): string {
  return path.basename(value);
}

const exitCode = await main();
process.exit(exitCode);
