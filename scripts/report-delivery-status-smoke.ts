import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findEventsByJob,
  findJobById,
  insertEvent,
  insertJob,
  openDb,
  type DbClient,
  type Event,
  type Job,
} from "../src/db.ts";
import { runReportDeliverLocalCli } from "../src/bin/report-deliver-local.ts";
import { runReportDeliveryStatusCli } from "../src/bin/report-delivery-status.ts";
import type { PublishManifest } from "../src/promote.ts";
import {
  assertCycleScopePolicy,
  assertNoForbiddenPatterns,
  changedFilesForCurrentCycle,
  GIT_POST_STEP_PATTERNS,
  PROCESS_SPAWN_PATTERNS,
  PROMPT_SURFACE_PATTERNS,
  readRepoSource,
  TELEGRAM_SDK_NETWORK_PATTERNS,
} from "./lib/static-guardrails.ts";

type ScenarioName =
  | "report-delivery-status-missing-db"
  | "report-delivery-status-invalid-command"
  | "report-delivery-status-reverse-flag-order"
  | "report-delivery-status-invalid-destination"
  | "report-delivery-status-safe-alias-parity"
  | "report-delivery-status-unknown-job"
  | "report-delivery-status-job-not-published"
  | "report-delivery-status-missing-promoted-manifest"
  | "report-delivery-status-invalid-promoted-manifest"
  | "report-delivery-status-source-missing-or-diverged"
  | "report-delivery-status-not-delivered"
  | "report-delivery-status-delivered"
  | "report-delivery-status-diverged"
  | "report-delivery-status-delivered-symlink-escape"
  | "report-delivery-status-field-safety"
  | "report-delivery-status-read-only-no-mutation"
  | "report-delivery-status-boundary-static-check";

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

interface Fixture {
  readonly artifactDir: string;
  readonly db: DbClient;
  readonly jobId: string;
  readonly manifest: PublishManifest;
  readonly sourceRoot: string;
  close(): void;
}

const SCENARIOS: readonly ScenarioName[] = [
  "report-delivery-status-missing-db",
  "report-delivery-status-invalid-command",
  "report-delivery-status-reverse-flag-order",
  "report-delivery-status-invalid-destination",
  "report-delivery-status-safe-alias-parity",
  "report-delivery-status-unknown-job",
  "report-delivery-status-job-not-published",
  "report-delivery-status-missing-promoted-manifest",
  "report-delivery-status-invalid-promoted-manifest",
  "report-delivery-status-source-missing-or-diverged",
  "report-delivery-status-not-delivered",
  "report-delivery-status-delivered",
  "report-delivery-status-diverged",
  "report-delivery-status-delivered-symlink-escape",
  "report-delivery-status-field-safety",
  "report-delivery-status-read-only-no-mutation",
  "report-delivery-status-boundary-static-check",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = path.join(
  tmpdir(),
  `cz-report-delivery-status-smoke-${new Date().toISOString().replaceAll(":", "-")}`,
);
const docPath = resolve(repoRoot, "docs", "preflight", "report-delivery-status-smoke.md");
const fixedNow = 1_779_200_000;
const fixedDeliveredAt = "2026-05-12T19:00:00.000Z";
const slice419Scope = new Set([
  "src/bin/report-delivery-status.ts",
  "scripts/report-delivery-status-smoke.ts",
  "docs/preflight/report-delivery-status-smoke.md",
  "package.json",
  "src/lib/publish-destination.ts",
]);
const reportDeliveryStatusActiveTriggers = new Set([
  "src/bin/report-delivery-status.ts",
  "scripts/report-delivery-status-smoke.ts",
  "docs/preflight/report-delivery-status-smoke.md",
  "package.json",
  "src/lib/publish-destination.ts",
]);

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
    return { name, status: "PASS", details, startedAtIso, finishedAtIso: new Date().toISOString() };
  } catch (err) {
    return {
      name,
      status: "FAIL",
      details: [err instanceof Error ? err.stack ?? err.message : String(err)],
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
    };
  }
}

async function scenarioImpl(name: ScenarioName, dir: string): Promise<string[]> {
  switch (name) {
    case "report-delivery-status-missing-db":
      return missingDb(dir);
    case "report-delivery-status-invalid-command":
      return invalidCommand(dir);
    case "report-delivery-status-reverse-flag-order":
      return reverseFlagOrder(dir);
    case "report-delivery-status-invalid-destination":
      return invalidDestination(dir);
    case "report-delivery-status-safe-alias-parity":
      return safeAliasParity(dir);
    case "report-delivery-status-unknown-job":
      return unknownJob(dir);
    case "report-delivery-status-job-not-published":
      return jobNotPublished(dir);
    case "report-delivery-status-missing-promoted-manifest":
      return missingPromotedManifest(dir);
    case "report-delivery-status-invalid-promoted-manifest":
      return invalidPromotedManifest(dir);
    case "report-delivery-status-source-missing-or-diverged":
      return sourceMissingOrDiverged(dir);
    case "report-delivery-status-not-delivered":
      return notDelivered(dir);
    case "report-delivery-status-delivered":
      return delivered(dir);
    case "report-delivery-status-diverged":
      return diverged(dir);
    case "report-delivery-status-delivered-symlink-escape":
      return deliveredSymlinkEscape(dir);
    case "report-delivery-status-field-safety":
      return fieldSafety(dir);
    case "report-delivery-status-read-only-no-mutation":
      return readOnlyNoMutation(dir);
    case "report-delivery-status-boundary-static-check":
      return boundaryStaticCheck();
  }
}

async function missingDb(dir: string): Promise<string[]> {
  const result = await runCli(dir, ["missing-db-job", "--dest", "outbox"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}`);
  assert(result.stdout === "NO_DATABASE\n", `stdout drifted: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr === "", `stderr drifted: ${JSON.stringify(result.stderr)}`);
  assert(!existsSync(resolve(dir, ".data")), "missing DB path created .data");
  assert(!existsSync(resolve(dir, "outbox")), "missing DB path created destination");
  return ["Missing .data/content.db exits 0 with exact NO_DATABASE stdout and creates nothing."];
}

async function invalidCommand(dir: string): Promise<string[]> {
  const cases: readonly (readonly string[])[] = [
    [],
    ["job-1"],
    ["--dest", "outbox"],
    ["job-1", "--dest=outbox"],
    ["job-1", "--dest", "outbox", "extra"],
    ["job-1", "--dest", "outbox", "--dest", "other"],
  ];
  for (const args of cases) {
    const result = await runCli(dir, args);
    assertFailurePrefix(result, "INVALID_COMMAND");
  }
  assert(!existsSync(resolve(dir, ".data")), "invalid command created .data");
  return ["Invalid arity, missing --dest, equals-form, and extra flags fail before DB access."];
}

async function reverseFlagOrder(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    const canonical = await runCli(dir, [fixture.jobId, "--dest", "outbox"]);
    const reverse = await runCli(dir, ["--dest", "outbox", fixture.jobId]);
    assertStatus(canonical, "not_delivered", "missing");
    assertStatus(reverse, "not_delivered", "missing");
    assert(canonical.stdout === reverse.stdout, "canonical and reverse order outputs differ");
    return ["Canonical and reverse flag order produce byte-identical status output."];
  } finally {
    fixture.close();
  }
}

async function invalidDestination(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    mkdirSync(resolve(dir, "..", "outside-escape"), { recursive: true });
    symlinkSync(resolve(dir, "..", "outside-escape"), resolve(dir, "escape-link"));
    mkdirSync(resolve(dir, "reports", "deliveries"), { recursive: true });
    symlinkSync("reports/deliveries", resolve(dir, "out-link"));
    symlinkSync(".", resolve(dir, "root-link"));
    const cases: readonly (readonly [readonly string[], string])[] = [
      [[fixture.jobId, "--dest", resolve(dir, "abs")], "INVALID_DESTINATION:"],
      [[fixture.jobId, "--dest", "../escape"], "INVALID_DESTINATION:"],
      [[fixture.jobId, "--dest", "--flag-looking"], "INVALID_COMMAND"],
      [[fixture.jobId, "--dest", "bad\tpath"], "INVALID_COMMAND"],
      [[fixture.jobId, "--dest", "bad\npath"], "INVALID_COMMAND"],
      [[fixture.jobId, "--dest", ".git"], "INVALID_DESTINATION:"],
      [[fixture.jobId, "--dest", "reports"], "INVALID_DESTINATION:"],
      [[fixture.jobId, "--dest", "src"], "INVALID_DESTINATION:"],
      [[fixture.jobId, "--dest", "escape-link"], "INVALID_DESTINATION:"],
      [[fixture.jobId, "--dest", "out-link"], "INVALID_DESTINATION:"],
      [[fixture.jobId, "--dest", "root-link/reports/deliveries"], "INVALID_DESTINATION:"],
    ];
    const beforeJob = stableJson(findJobById(fixture.db, fixture.jobId));
    const beforeEvents = stableJson(findEventsByJob(fixture.db, fixture.jobId));
    for (const [args, prefix] of cases) {
      const result = await runCli(dir, args);
      assertFailurePrefix(result, prefix);
    }
    assert(stableJson(findJobById(fixture.db, fixture.jobId)) === beforeJob, "job row mutated");
    assert(stableJson(findEventsByJob(fixture.db, fixture.jobId)) === beforeEvents, "events mutated");
    return [
      "Absolute, traversal, flag-looking, control-character, protected-root, and symlink-escape destinations fail without mutation.",
      "Slice 4.18 regressions out-link -> reports/deliveries and root-link -> ./reports/deliveries are rejected.",
    ];
  } finally {
    fixture.close();
  }
}

async function safeAliasParity(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    mkdirSync(resolve(dir, "safe-real"), { recursive: true });
    symlinkSync("safe-real", resolve(dir, "safe-link"));
    const delivery = await runDeliverLocalCli(dir, [fixture.jobId, "--dest", "safe-link"]);
    assert(delivery.exitCode === 0, `delivery setup failed: ${delivery.stderr}`);
    const status = await runCli(dir, [fixture.jobId, "--dest", "safe-link"]);
    assertStatus(status, "delivered", "present");
    const delivered = parseRecord(delivery.stdout);
    const inspected = parseRecord(status.stdout);
    assert(
      delivered.delivered_dir === inspected.delivered_dir,
      `status delivered_dir ${inspected.delivered_dir} != deliver-local ${delivered.delivered_dir}`,
    );
    assert(inspected.delivered_dir === "safe-real/2026-W47-ai-trends", `unexpected effective path ${inspected.delivered_dir}`);
    return ["Safe in-repo destination alias reports the same effective delivered_dir as report:deliver-local."];
  } finally {
    fixture.close();
  }
}

async function unknownJob(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    const result = await runCli(dir, ["unknown-job", "--dest", "outbox"]);
    assertFailurePrefix(result, "UNKNOWN_JOB: unknown-job");
    return ["Unknown job exits 1 with stable UNKNOWN_JOB stderr."];
  } finally {
    fixture.close();
  }
}

async function jobNotPublished(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, { status: "running" });
  try {
    const result = await runCli(dir, [fixture.jobId, "--dest", "outbox"]);
    assertFailurePrefix(result, `JOB_NOT_PUBLISHED: ${fixture.jobId}`);
    return ["Non-published job exits 1 with stable JOB_NOT_PUBLISHED stderr."];
  } finally {
    fixture.close();
  }
}

async function missingPromotedManifest(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, { skipEvent: true });
  try {
    const result = await runCli(dir, [fixture.jobId, "--dest", "outbox"]);
    assertFailurePrefix(result, `PUBLISH_MANIFEST_MISSING: ${fixture.jobId}`);
    return ["Published job without promoted event exits 1 with PUBLISH_MANIFEST_MISSING."];
  } finally {
    fixture.close();
  }
}

async function invalidPromotedManifest(dir: string): Promise<string[]> {
  const variants: readonly [string, Partial<FixtureOptions>][] = [
    ["unparseable payload", { eventPayload: "{" }],
    ["wrong job", { manifestPatch: { job_id: "wrong-job" } }],
    ["wrong attempt", { manifestPatch: { attempt_number: 99 } }],
    ["wrong artifact_dir", { manifestPatch: { artifact_dir: "reports/wrong" } }],
    ["unsafe file path", {
      manifestPatch: {
        files: ["../bad"],
        sha256: { "../bad": "a".repeat(64) },
        aggregate_sha256: "a".repeat(64),
      },
    }],
    ["aggregate mismatch", { manifestPatch: { aggregate_sha256: "a".repeat(64) } }],
  ];
  const details: string[] = [];
  for (const [label, opts] of variants) {
    const caseDir = resolve(dir, label.replaceAll(" ", "-"));
    mkdirSync(caseDir, { recursive: true });
    const fixture = createPublishedFixture(caseDir, opts);
    try {
      const result = await runCli(caseDir, [fixture.jobId, "--dest", "outbox"]);
      assertFailurePrefix(result, "PUBLISH_MANIFEST_INVALID:");
      details.push(`${label} failed as PUBLISH_MANIFEST_INVALID.`);
    } finally {
      fixture.close();
    }
  }
  return details;
}

async function sourceMissingOrDiverged(dir: string): Promise<string[]> {
  const missingDir = resolve(dir, "missing-source");
  mkdirSync(missingDir, { recursive: true });
  const missing = createPublishedFixture(missingDir, {});
  try {
    rmSync(missing.sourceRoot, { recursive: true, force: true });
    const result = await runCli(missingDir, [missing.jobId, "--dest", "outbox"]);
    assertFailurePrefix(result, "PUBLISH_SOURCE_MISSING:");
    assert(!existsSync(resolve(missingDir, "outbox")), "missing source created destination");
  } finally {
    missing.close();
  }

  const divergedDir = resolve(dir, "diverged-source");
  mkdirSync(divergedDir, { recursive: true });
  const diverged = createPublishedFixture(divergedDir, {});
  try {
    writeFileSync(resolve(diverged.sourceRoot, "report.en.md"), "tampered source\n", "utf8");
    const result = await runCli(divergedDir, [diverged.jobId, "--dest", "outbox"]);
    assertFailurePrefix(result, "PUBLISH_MANIFEST_INVALID:");
    assert(!existsSync(resolve(divergedDir, "outbox")), "diverged source created destination");
  } finally {
    diverged.close();
  }
  return [
    "Missing source artifact fails with PUBLISH_SOURCE_MISSING before destination status.",
    "Source hash divergence fails with PUBLISH_MANIFEST_INVALID before destination status.",
  ];
}

async function notDelivered(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    const missingRoot = await runCli(dir, [fixture.jobId, "--dest", "outbox"]);
    assertStatus(missingRoot, "not_delivered", "missing");
    assert(!existsSync(resolve(dir, "outbox")), "missing destination root was created");
    mkdirSync(resolve(dir, "empty-dest"), { recursive: true });
    const missingBundle = await runCli(dir, [fixture.jobId, "--dest", "empty-dest"]);
    assertStatus(missingBundle, "not_delivered", "missing");
    assert(!existsSync(resolve(dir, "empty-dest", "2026-W47-ai-trends")), "missing bundle was created");
    return ["Missing destination root and missing delivered bundle report not_delivered without mkdir."];
  } finally {
    fixture.close();
  }
}

async function delivered(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    writeDeliveredBundle(dir, fixture, {});
    const result = await runCli(dir, [fixture.jobId, "--dest", "outbox"]);
    assertStatus(result, "delivered", "present");
    const record = parseRecord(result.stdout);
    assert(record.delivered_at === fixedDeliveredAt, `delivered_at drifted: ${record.delivered_at}`);
    return ["Matching receipt and delivered files report delivered with receipt=present and delivered_at."];
  } finally {
    fixture.close();
  }
}

async function diverged(dir: string): Promise<string[]> {
  const variants: readonly [string, (caseDir: string, fixture: Fixture) => void, string][] = [
    ["missing-receipt", (caseDir, fixture) => writeDeliveredBundle(caseDir, fixture, { writeReceipt: false }), "missing"],
    ["invalid-receipt", (caseDir, fixture) => {
      const deliveredDir = writeDeliveredBundle(caseDir, fixture, {}).deliveredDir;
      writeFileSync(resolve(deliveredDir, ".delivery-receipt.json"), "{", "utf8");
    }, "invalid"],
    ["mismatched-receipt", (caseDir, fixture) => {
      writeDeliveredBundle(caseDir, fixture, { receiptPatch: { aggregate_sha256: "a".repeat(64) } });
    }, "mismatch"],
    ["missing-file", (caseDir, fixture) => {
      const deliveredDir = writeDeliveredBundle(caseDir, fixture, {}).deliveredDir;
      rmSync(resolve(deliveredDir, "report.en.md"), { force: true });
    }, "mismatch"],
    ["hash-diverged-file", (caseDir, fixture) => {
      const deliveredDir = writeDeliveredBundle(caseDir, fixture, {}).deliveredDir;
      writeFileSync(resolve(deliveredDir, "report.en.md"), "tampered delivery\n", "utf8");
    }, "mismatch"],
  ];
  const details: string[] = [];
  for (const [label, mutate, receipt] of variants) {
    const caseDir = resolve(dir, label);
    mkdirSync(caseDir, { recursive: true });
    const fixture = createPublishedFixture(caseDir, {});
    try {
      mutate(caseDir, fixture);
      const before = treeSnapshot(resolve(caseDir, "outbox"));
      const result = await runCli(caseDir, [fixture.jobId, "--dest", "outbox"]);
      assertStatus(result, "diverged", receipt);
      assert(treeSnapshot(resolve(caseDir, "outbox")) === before, `${label} destination mutated`);
      details.push(`${label} reports diverged with receipt=${receipt}.`);
    } finally {
      fixture.close();
    }
  }
  return details;
}

async function deliveredSymlinkEscape(dir: string): Promise<string[]> {
  const finalSymlinkDir = resolve(dir, "final-symlink");
  mkdirSync(finalSymlinkDir, { recursive: true });
  const finalFixture = createPublishedFixture(finalSymlinkDir, {});
  try {
    const deliveredDir = writeDeliveredBundle(finalSymlinkDir, finalFixture, {}).deliveredDir;
    const outside = resolve(finalSymlinkDir, "outside.txt");
    writeFileSync(outside, "outside target\n", "utf8");
    rmSync(resolve(deliveredDir, "report.en.md"), { force: true });
    symlinkSync(outside, resolve(deliveredDir, "report.en.md"));
    const before = shaFile(outside);
    const result = await runCli(finalSymlinkDir, [finalFixture.jobId, "--dest", "outbox"]);
    assertStatus(result, "diverged", "mismatch");
    assert(shaFile(outside) === before, "outside symlink target mutated");
  } finally {
    finalFixture.close();
  }

  const componentSymlinkDir = resolve(dir, "component-symlink");
  mkdirSync(componentSymlinkDir, { recursive: true });
  const componentFixture = createPublishedFixture(componentSymlinkDir, {
    files: ["nested/report.en.md", "sources.json"],
  });
  try {
    const deliveredDir = writeDeliveredBundle(componentSymlinkDir, componentFixture, {}).deliveredDir;
    const outsideDir = resolve(componentSymlinkDir, "outside-dir");
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(resolve(outsideDir, "report.en.md"), "outside nested\n", "utf8");
    rmSync(resolve(deliveredDir, "nested"), { recursive: true, force: true });
    symlinkSync(outsideDir, resolve(deliveredDir, "nested"));
    const before = shaFile(resolve(outsideDir, "report.en.md"));
    const result = await runCli(componentSymlinkDir, [componentFixture.jobId, "--dest", "outbox"]);
    assertStatus(result, "diverged", "mismatch");
    assert(shaFile(resolve(outsideDir, "report.en.md")) === before, "outside component target mutated");
  } finally {
    componentFixture.close();
  }

  return [
    "Symlink file at a manifest-listed path reports diverged/mismatch.",
    "Symlink directory component escaping the bundle reports diverged/mismatch without mutating outside target.",
  ];
}

async function fieldSafety(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, { jobId: "field safe job" });
  try {
    writeDeliveredBundle(dir, fixture, { deliveredAt: "2026-05-12T19:00:00Z\tbad\nline" });
    const result = await runCli(dir, [fixture.jobId, "--dest", "outbox"]);
    assertStatus(result, "delivered", "present");
    const line = result.stdout.trimEnd();
    assert(!/[\r\n]/.test(line), "status record contains embedded newline");
    const fields = line.split("\t");
    assert(fields.length === 10, `expected 10 tab fields, got ${fields.length}`);
    assert(fields.every((field) => !/[\r\n]/.test(field)), "field contains raw newline");
    assert(result.stdout.includes("job_id=field safe job"), "job id formatting drifted");
    assert(result.stdout.includes("delivered_at=2026-05-12T19:00:00Z bad line"), "delivered_at not field-safe");
    return ["Tabs/newlines in receipt-derived fields are collapsed without injecting record separators."];
  } finally {
    fixture.close();
  }
}

async function readOnlyNoMutation(dir: string): Promise<string[]> {
  const deliveredDir = resolve(dir, "delivered-case");
  mkdirSync(deliveredDir, { recursive: true });
  const deliveredFixture = createPublishedFixture(deliveredDir, {});
  try {
    writeDeliveredBundle(deliveredDir, deliveredFixture, {});
    await assertReadOnlyProbe(deliveredDir, deliveredFixture, "outbox", "delivered");
  } finally {
    deliveredFixture.close();
  }

  const notDeliveredDir = resolve(dir, "not-delivered-case");
  mkdirSync(notDeliveredDir, { recursive: true });
  const notDeliveredFixture = createPublishedFixture(notDeliveredDir, {});
  try {
    await assertReadOnlyProbe(notDeliveredDir, notDeliveredFixture, "outbox", "not_delivered");
  } finally {
    notDeliveredFixture.close();
  }

  const divergedDir = resolve(dir, "diverged-case");
  mkdirSync(divergedDir, { recursive: true });
  const divergedFixture = createPublishedFixture(divergedDir, {});
  try {
    writeDeliveredBundle(divergedDir, divergedFixture, { writeReceipt: false });
    await assertReadOnlyProbe(divergedDir, divergedFixture, "outbox", "diverged");
  } finally {
    divergedFixture.close();
  }

  return [
    "Delivered, not_delivered, and diverged probes leave jobs/events byte-identical.",
    "Source and destination tree snapshots remain unchanged across status inspection.",
  ];
}

function boundaryStaticCheck(): string[] {
  const changed = changedFilesForCurrentCycle(repoRoot);
  const scopeMode = assertCycleScopePolicy({
    changed,
    activeTriggerFiles: reportDeliveryStatusActiveTriggers,
    activeScope: slice419Scope,
    activeFrozenFiles: [
      "PLAN.md",
      "src/bin/report-deliver-local.ts",
      "src/bin/report-create.ts",
      "src/bin/report-remind.ts",
      "src/bin/report-status.ts",
      "src/bin/report-show.ts",
      "src/bin/report-list.ts",
      "src/bin/report-run.ts",
      "src/promote.ts",
      "src/db.ts",
      "src/lib/report-loop.ts",
      "src/lib/report-run-fake-provider.ts",
      "scripts/lib/static-guardrails.ts",
      "bun.lock",
      "bun.lockb",
    ],
    activeFrozenDirectories: [
      "src/pipeline/",
      "src/telegram/",
      "src/migrations/",
      "src/llm/",
      "src/prompts/",
      ".omx/memory-edit/",
    ],
  });
  assert(scopeMode === "active-slice", "report-delivery-status smoke should run in active-slice mode");

  const packageJson = JSON.parse(readRepoSource(repoRoot, "package.json")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert(packageJson.scripts?.["report:delivery-status"] === "bun src/bin/report-delivery-status.ts", "missing report:delivery-status script");
  assert(packageJson.scripts?.["report-delivery-status-smoke"] === "bun scripts/report-delivery-status-smoke.ts", "missing report-delivery-status-smoke script");
  assert(packageJson.dependencies === undefined, "package.json gained dependencies");
  assert(packageJson.devDependencies?.typescript === "^5.6.3", "typescript devDependency drifted");
  assert(packageJson.devDependencies?.["@types/bun"] === "^1.1.13", "@types/bun devDependency drifted");

  const cliSource = readRepoSource(repoRoot, "src/bin/report-delivery-status.ts");
  assertNoForbiddenPatterns(cliSource, [
    ...PROCESS_SPAWN_PATTERNS,
    ...TELEGRAM_SDK_NETWORK_PATTERNS,
    ...PROMPT_SURFACE_PATTERNS,
    ...GIT_POST_STEP_PATTERNS,
    [/\bfetch\s*\(|https?:\/\//, "network surface"],
    [/\bopenDb\b|\brunMigrations\b|\binsertJob\b|\binsertEvent\b|\bupdateJob\b|\bcasUpdateJob\b/, "mutating DB helper"],
    [/\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b|\bCREATE\s+TABLE\b|\bALTER\s+TABLE\b|\bDROP\s+TABLE\b|\bPRAGMA\b/i, "DB mutation SQL"],
    [/from\s+["'][^"']*report-create\.ts["']|from\s+["'][^"']*report-remind\.ts["']|from\s+["'][^"']*report-status\.ts["']|from\s+["'][^"']*report-show\.ts["']|from\s+["'][^"']*report-list\.ts["']|from\s+["'][^"']*report-run\.ts["']|from\s+["'][^"']*report-deliver-local\.ts["']/, "other CLI import"],
    [/from\s+["'][^"']*\/telegram\//, "Telegram import"],
    [/\bpromoteJob\b|\bbuildGitCommitPlan\b/, "promote mutation helper"],
    [/from\s+["'][^"']*preflight\.ts["']|CodexCliProvider/, "preflight/Codex import"],
  ], "src/bin/report-delivery-status.ts");

  const destinationSource = readRepoSource(repoRoot, "src/lib/publish-destination.ts");
  const inspectPath = [
    extractFunctionBlock(destinationSource, "inspectLocalFolderDelivery"),
    extractFunctionBlock(destinationSource, "verifyInspectedDeliveredBundle"),
    extractFunctionBlock(destinationSource, "assertNoDeliveredSymlinkComponents"),
  ].join("\n");
  assertNoForbiddenPatterns(inspectPath, [
    [/\.deliver\s*\(|\bcopyBundle\s*\(|\bbuildReceipt\s*\(|\ballocateTempDir\s*\(|\bcleanupTempDir\s*\(/, "write-capable delivery helper call"],
    [/\bwriteFileSync\s*\(|\bmkdirSync\s*\(|\bcopyFileSync\s*\(|\brenameSync\s*\(|\brmSync\s*\(/, "filesystem mutation call"],
    [/\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b|\bCREATE\s+TABLE\b|\bALTER\s+TABLE\b|\bDROP\s+TABLE\b/i, "DB mutation SQL"],
    ...PROCESS_SPAWN_PATTERNS,
    ...TELEGRAM_SDK_NETWORK_PATTERNS,
    ...PROMPT_SURFACE_PATTERNS,
    ...GIT_POST_STEP_PATTERNS,
  ], "publish-destination read-only inspection path");
  assert(destinationSource.includes("class LocalFolderPublishDestination"), "inherited delivery class missing");
  assert(destinationSource.includes("deliver(input: PublishDestinationInput): DeliveryResult"), "inherited deliver surface missing");

  let syntheticOutOfScopeRejected = false;
  try {
    assertCycleScopePolicy({
      changed: ["src/bin/report-delivery-status.ts", "src/telegram/bot.ts"],
      activeTriggerFiles: reportDeliveryStatusActiveTriggers,
      activeScope: slice419Scope,
    });
  } catch (err) {
    syntheticOutOfScopeRejected = String(err).includes("changed files outside declared scope");
  }
  assert(syntheticOutOfScopeRejected, "synthetic out-of-scope product file was not rejected");

  return [
    `Cycle-scope boundary check ran in ${scopeMode} mode and saw changed files: ${changed.join(", ") || "<none>"}.`,
    "Synthetic active-slice scope check rejects out-of-scope Telegram product files.",
    "report-delivery-status.ts has no mutating DB helpers, DB write SQL, other CLI imports, network, Telegram, prompt/LLM, process, git, or preflight/Codex surface.",
    "New publish-destination inspection helper path contains no deliver/copy/temp/receipt-write/rm/rename calls while inherited Slice 4.18 delivery code remains recognized as pre-existing.",
  ];
}

async function assertReadOnlyProbe(
  dir: string,
  fixture: Fixture,
  destinationRoot: string,
  expectedStatus: string,
): Promise<void> {
  const beforeJob = stableJson(findJobById(fixture.db, fixture.jobId));
  const beforeEvents = stableJson(findEventsByJob(fixture.db, fixture.jobId));
  const beforeSource = treeSnapshot(fixture.sourceRoot);
  const beforeDestination = treeSnapshot(resolve(dir, destinationRoot));
  const result = await runCli(dir, [fixture.jobId, "--dest", destinationRoot]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(result.stdout.includes(`status=${expectedStatus}`), `status drifted: ${result.stdout}`);
  assert(stableJson(findJobById(fixture.db, fixture.jobId)) === beforeJob, "job row mutated");
  assert(stableJson(findEventsByJob(fixture.db, fixture.jobId)) === beforeEvents, "events mutated");
  assert(treeSnapshot(fixture.sourceRoot) === beforeSource, "source tree mutated");
  assert(treeSnapshot(resolve(dir, destinationRoot)) === beforeDestination, "destination tree mutated");
  assert(!existsSync(resolve(dir, ".runs")), ".runs path was created");
}

async function runCli(dir: string, args: readonly string[]): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runReportDeliveryStatusCli({
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

async function runDeliverLocalCli(dir: string, args: readonly string[]): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runReportDeliverLocalCli({
    cwd: dir,
    args,
    now: () => new Date(fixedDeliveredAt),
    writeStdout: (text) => {
      stdout += text;
    },
    writeStderr: (text) => {
      stderr += text;
    },
  });
  return { exitCode, stdout, stderr };
}

interface FixtureOptions {
  readonly artifactDir: string;
  readonly attemptNumber: number;
  readonly eventPayload: string;
  readonly files: readonly string[];
  readonly jobId: string;
  readonly manifestPatch: Partial<PublishManifest>;
  readonly skipEvent: boolean;
  readonly status: string;
}

function createPublishedFixture(
  dir: string,
  opts: Partial<FixtureOptions>,
): Fixture {
  const db = openDb(resolve(dir, ".data", "content.db"));
  const jobId = opts.jobId ?? "delivery-status-1";
  const attemptNumber = opts.attemptNumber ?? 1;
  const artifactDir = opts.artifactDir ?? "reports/2026-W47-ai-trends";
  const sourceRoot = resolve(dir, artifactDir);
  const files = opts.files ?? ["report.en.md", "research/note.json", "sources.json"];
  for (const file of files) {
    const sourceFile = resolve(sourceRoot, file);
    mkdirSync(dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, `content for ${file}\n`, "utf8");
  }
  writeFileSync(resolve(sourceRoot, "extra.md"), "not in manifest\n", "utf8");

  const manifest = {
    ...manifestFor({
      artifactDir,
      attemptNumber,
      files,
      jobId,
      sourceRoot,
    }),
    ...opts.manifestPatch,
  } as PublishManifest;

  insertJob(db, {
    id: jobId,
    week_key: "2026-W47",
    topic: "AI trends",
    attempt_number: attemptNumber,
    status: opts.status ?? "published",
    current_stage: opts.status === "running" ? "draft_en" : "published",
    artifact_dir: artifactDir,
    primary_report_path: `${artifactDir}/report.en.md`,
    sources_path: `${artifactDir}/sources.json`,
    created_at: fixedNow,
    updated_at: fixedNow + 1,
  });

  if (opts.skipEvent !== true) {
    insertEvent(db, {
      job_id: jobId,
      attempt_number: attemptNumber,
      type: "promoted",
      payload: opts.eventPayload ?? JSON.stringify({ publish_manifest: manifest }),
      created_at: fixedNow + 2,
    });
  }

  return {
    artifactDir,
    db,
    jobId,
    manifest,
    sourceRoot,
    close: () => db.close(),
  };
}

function writeDeliveredBundle(
  dir: string,
  fixture: Fixture,
  opts: {
    readonly deliveredAt?: string;
    readonly destinationRoot?: string;
    readonly receiptPatch?: Partial<Record<string, unknown>>;
    readonly writeReceipt?: boolean;
  },
): { readonly deliveredDir: string } {
  const destinationRoot = opts.destinationRoot ?? "outbox";
  const deliveredDir = resolve(dir, destinationRoot, path.basename(fixture.artifactDir));
  mkdirSync(deliveredDir, { recursive: true });
  for (const file of fixture.manifest.files) {
    const sourceFile = resolve(fixture.sourceRoot, file);
    const deliveredFile = resolve(deliveredDir, file);
    mkdirSync(dirname(deliveredFile), { recursive: true });
    writeFileSync(deliveredFile, readFileSync(sourceFile));
  }
  if (opts.writeReceipt !== false) {
    const receipt = {
      schema_version: 1,
      destination_kind: "local_folder",
      job_id: fixture.manifest.job_id,
      attempt_number: fixture.manifest.attempt_number,
      source_artifact_dir: fixture.manifest.artifact_dir,
      delivered_artifact_dir: toPosixRelative(dir, deliveredDir),
      files: fixture.manifest.files,
      sha256: fixture.manifest.sha256,
      aggregate_sha256: fixture.manifest.aggregate_sha256,
      delivered_at: opts.deliveredAt ?? fixedDeliveredAt,
      ...opts.receiptPatch,
    };
    writeFileSync(
      resolve(deliveredDir, ".delivery-receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
      "utf8",
    );
  }
  return { deliveredDir };
}

function manifestFor(opts: {
  readonly artifactDir: string;
  readonly attemptNumber: number;
  readonly files: readonly string[];
  readonly jobId: string;
  readonly sourceRoot: string;
}): PublishManifest {
  const files = [...opts.files].sort();
  const sha256: Record<string, string> = {};
  for (const file of files) {
    sha256[file] = shaFile(resolve(opts.sourceRoot, file));
  }
  return {
    artifact_dir: opts.artifactDir,
    job_id: opts.jobId,
    attempt_number: opts.attemptNumber,
    files,
    sha256,
    aggregate_sha256: aggregateFor(files, sha256),
  };
}

function assertStatus(
  result: CliResult,
  status: string,
  receipt: string,
): void {
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(result.stderr === "", `success wrote stderr: ${result.stderr}`);
  assert(result.stdout.endsWith("\n"), "success stdout missing trailing newline");
  const record = parseRecord(result.stdout);
  assert(record.__label === "DELIVERY_STATUS", `record label drifted: ${record.__label}`);
  assert(record.status === status, `status ${record.status} != ${status}`);
  assert(record.destination === "local_folder", `destination drifted: ${record.destination}`);
  assert(record.files !== undefined && /^[0-9]+$/.test(record.files), `files field invalid: ${record.files}`);
  assert(record.aggregate_sha256 !== undefined && /^[a-f0-9]{12}$/.test(record.aggregate_sha256), `aggregate field invalid: ${record.aggregate_sha256}`);
  assert(record.receipt === receipt, `receipt ${record.receipt} != ${receipt}`);
}

function assertFailurePrefix(result: CliResult, prefix: string): void {
  assert(result.exitCode === 1, `expected failure exit 1, got ${result.exitCode}`);
  assert(result.stdout === "", `failure wrote stdout: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr.startsWith(prefix), `stderr ${JSON.stringify(result.stderr)} did not start with ${prefix}`);
}

function parseRecord(stdout: string): Record<string, string> {
  const line = stdout.trimEnd();
  const fields = line.split("\t");
  const record: Record<string, string> = { __label: fields[0] ?? "" };
  for (const field of fields.slice(1)) {
    const index = field.indexOf("=");
    if (index === -1) continue;
    record[field.slice(0, index)] = field.slice(index + 1);
  }
  return record;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function treeSnapshot(root: string): string {
  if (!existsSync(root)) return "<missing>";
  const rows: string[] = [];
  const walk = (current: string, relative: string): void => {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      rows.push(`${relative}:symlink:${readlinkSync(current)}`);
      return;
    }
    if (stat.isDirectory()) {
      rows.push(`${relative}:dir`);
      for (const entry of readdirSync(current).sort()) {
        walk(resolve(current, entry), relative.length === 0 ? entry : `${relative}/${entry}`);
      }
      return;
    }
    rows.push(`${relative}:file:${shaFile(current)}`);
  };
  walk(root, "");
  return rows.join("\n");
}

function extractFunctionBlock(source: string, functionName: string): string {
  const index = source.indexOf(`function ${functionName}`);
  assert(index >= 0, `missing function ${functionName}`);
  const open = source.indexOf("{", index);
  assert(open >= 0, `missing function body ${functionName}`);
  let depth = 0;
  for (let cursor = open; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(index, cursor + 1);
    }
  }
  throw new Error(`unterminated function ${functionName}`);
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  mkdirSync(dirname(docPath), { recursive: true });
  const passed = outcomes.filter((outcome) => outcome.status === "PASS").length;
  const lines = [
    "# report-delivery-status smoke evidence",
    "",
    "- Command: `bun run report-delivery-status-smoke`",
    `- Started: ${outcomes[0]?.startedAtIso ?? new Date().toISOString()}`,
    `- Finished: ${outcomes.at(-1)?.finishedAtIso ?? new Date().toISOString()}`,
    `- Scenario root: ${smokeRoot} (removed by finally-cleanup)`,
    `- Result: ${passed}/${outcomes.length} PASS`,
    "",
    "This smoke exercises the read-only `report:delivery-status` CLI surface only. It does not run operator-only `bun run report:run`, real Codex report generation, real Telegram network, real git/process execution, notifier sending, publish/promote mutation, DB migrations beyond scenario setup, or preflight.",
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

function shaFile(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function aggregateFor(
  files: readonly string[],
  sha256: Readonly<Record<string, string>>,
): string {
  return createHash("sha256")
    .update(JSON.stringify(files.map((file) => [file, sha256[file]])))
    .digest("hex");
}

function toPosixRelative(root: string, target: string): string {
  return path.relative(root, target).replaceAll(path.sep, "/");
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const exitCode = await main();
process.exit(exitCode);
