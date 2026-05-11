import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
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
} from "../src/db.ts";
import { runReportDeliverLocalCli } from "../src/bin/report-deliver-local.ts";
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
  | "report-deliver-local-missing-db"
  | "report-deliver-local-invalid-missing-job-id"
  | "report-deliver-local-invalid-missing-dest"
  | "report-deliver-local-invalid-dest-equals-form"
  | "report-deliver-local-reverse-flag-order"
  | "report-deliver-local-invalid-absolute-dest"
  | "report-deliver-local-invalid-traversal-dest"
  | "report-deliver-local-protected-destination-roots"
  | "report-deliver-local-destination-equals-source"
  | "report-deliver-local-destination-symlink-escape"
  | "report-deliver-local-unknown-job"
  | "report-deliver-local-job-not-published"
  | "report-deliver-local-missing-promoted-manifest"
  | "report-deliver-local-unparseable-promoted-manifest"
  | "report-deliver-local-old-attempt-authority"
  | "report-deliver-local-mismatched-artifact-dir"
  | "report-deliver-local-mismatched-job-or-attempt"
  | "report-deliver-local-invalid-manifest-shape"
  | "report-deliver-local-unsafe-artifact-dir"
  | "report-deliver-local-unsafe-manifest-file-path"
  | "report-deliver-local-source-symlink-escape"
  | "report-deliver-local-success"
  | "report-deliver-local-idempotent"
  | "report-deliver-local-destination-divergence"
  | "report-deliver-local-source-divergence"
  | "report-deliver-local-partial-copy-cleanup-static"
  | "report-deliver-local-field-safety"
  | "report-deliver-local-read-only-no-mutation"
  | "report-deliver-local-boundary-static-check";

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
  "report-deliver-local-missing-db",
  "report-deliver-local-invalid-missing-job-id",
  "report-deliver-local-invalid-missing-dest",
  "report-deliver-local-invalid-dest-equals-form",
  "report-deliver-local-reverse-flag-order",
  "report-deliver-local-invalid-absolute-dest",
  "report-deliver-local-invalid-traversal-dest",
  "report-deliver-local-protected-destination-roots",
  "report-deliver-local-destination-equals-source",
  "report-deliver-local-destination-symlink-escape",
  "report-deliver-local-unknown-job",
  "report-deliver-local-job-not-published",
  "report-deliver-local-missing-promoted-manifest",
  "report-deliver-local-unparseable-promoted-manifest",
  "report-deliver-local-old-attempt-authority",
  "report-deliver-local-mismatched-artifact-dir",
  "report-deliver-local-mismatched-job-or-attempt",
  "report-deliver-local-invalid-manifest-shape",
  "report-deliver-local-unsafe-artifact-dir",
  "report-deliver-local-unsafe-manifest-file-path",
  "report-deliver-local-source-symlink-escape",
  "report-deliver-local-success",
  "report-deliver-local-idempotent",
  "report-deliver-local-destination-divergence",
  "report-deliver-local-source-divergence",
  "report-deliver-local-partial-copy-cleanup-static",
  "report-deliver-local-field-safety",
  "report-deliver-local-read-only-no-mutation",
  "report-deliver-local-boundary-static-check",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = path.join(
  tmpdir(),
  `cz-report-deliver-local-smoke-${new Date().toISOString().replaceAll(":", "-")}`,
);
const docPath = resolve(repoRoot, "docs", "preflight", "report-deliver-local-smoke.md");
const fixedNow = new Date("2026-05-10T23:59:00.000Z");
const slice418Scope = new Set([
  "src/lib/publish-destination.ts",
  "src/bin/report-deliver-local.ts",
  "scripts/report-deliver-local-smoke.ts",
  "docs/preflight/report-deliver-local-smoke.md",
  "scripts/report-status-smoke.ts",
  "docs/preflight/report-status-smoke.md",
  "scripts/report-list-smoke.ts",
  "docs/preflight/report-list-smoke.md",
  "docs/preflight/report-run-smoke.md",
  "scripts/bot-smoke.ts",
  "docs/preflight/bot-smoke.md",
  "package.json",
]);
const reportDeliverActiveTriggers = new Set([
  "src/lib/publish-destination.ts",
  "src/bin/report-deliver-local.ts",
  "scripts/report-deliver-local-smoke.ts",
  "docs/preflight/report-deliver-local-smoke.md",
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
    case "report-deliver-local-missing-db":
      return missingDb(dir);
    case "report-deliver-local-invalid-missing-job-id":
      return invalidArgs(dir, ["--dest", "outbox"]);
    case "report-deliver-local-invalid-missing-dest":
      return invalidArgs(dir, ["job-1"]);
    case "report-deliver-local-invalid-dest-equals-form":
      return invalidArgs(dir, ["job-1", "--dest=outbox"]);
    case "report-deliver-local-reverse-flag-order":
      return reverseFlagOrder(dir);
    case "report-deliver-local-invalid-absolute-dest":
      return invalidDestination(dir, "INVALID_DESTINATION:", ["deliver-1", "--dest", resolve(dir, "abs")]);
    case "report-deliver-local-invalid-traversal-dest":
      return invalidDestination(dir, "INVALID_DESTINATION:", ["deliver-1", "--dest", "../escape"]);
    case "report-deliver-local-protected-destination-roots":
      return protectedDestinationRoots(dir);
    case "report-deliver-local-destination-equals-source":
      return destinationEqualsSource(dir);
    case "report-deliver-local-destination-symlink-escape":
      return destinationSymlinkEscape(dir);
    case "report-deliver-local-unknown-job":
      return unknownJob(dir);
    case "report-deliver-local-job-not-published":
      return jobNotPublished(dir);
    case "report-deliver-local-missing-promoted-manifest":
      return missingPromotedManifest(dir);
    case "report-deliver-local-unparseable-promoted-manifest":
      return unparseablePromotedManifest(dir);
    case "report-deliver-local-old-attempt-authority":
      return oldAttemptAuthority(dir);
    case "report-deliver-local-mismatched-artifact-dir":
      return mismatchedManifest(dir, { artifact_dir: "reports/wrong" });
    case "report-deliver-local-mismatched-job-or-attempt":
      return mismatchedManifest(dir, { job_id: "other-job", attempt_number: 99 });
    case "report-deliver-local-invalid-manifest-shape":
      return invalidManifestShape(dir);
    case "report-deliver-local-unsafe-artifact-dir":
      return unsafeArtifactDir(dir);
    case "report-deliver-local-unsafe-manifest-file-path":
      return unsafeManifestFilePath(dir);
    case "report-deliver-local-source-symlink-escape":
      return sourceSymlinkEscape(dir);
    case "report-deliver-local-success":
      return successDelivery(dir);
    case "report-deliver-local-idempotent":
      return idempotentDelivery(dir);
    case "report-deliver-local-destination-divergence":
      return destinationDivergence(dir);
    case "report-deliver-local-source-divergence":
      return sourceDivergence(dir);
    case "report-deliver-local-partial-copy-cleanup-static":
      return partialCopyCleanupStatic();
    case "report-deliver-local-field-safety":
      return fieldSafety(dir);
    case "report-deliver-local-read-only-no-mutation":
      return readOnlyNoMutation(dir);
    case "report-deliver-local-boundary-static-check":
      return boundaryStaticCheck();
  }
}

async function missingDb(dir: string): Promise<string[]> {
  const result = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
  assert(result.exitCode === 0, `missing DB exit drifted: ${result.exitCode}`);
  assert(result.stdout === "NO_DATABASE\n", `missing DB stdout drifted: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr === "", `missing DB stderr drifted: ${result.stderr}`);
  assert(!existsSync(resolve(dir, ".data", "content.db")), "CLI created missing DB");
  return ["Missing .data/content.db exits 0 with exact NO_DATABASE stdout and creates no DB."];
}

async function invalidArgs(dir: string, args: readonly string[]): Promise<string[]> {
  const result = await runCli(dir, args);
  assert(result.exitCode === 1, `invalid args exit drifted: ${result.exitCode}`);
  assert(result.stdout === "", `invalid args stdout drifted: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr === "INVALID_COMMAND\n", `invalid args stderr drifted: ${result.stderr}`);
  return [`Invalid command ${JSON.stringify(args)} exits 1 with exact INVALID_COMMAND stderr.`];
}

async function reverseFlagOrder(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    const canonical = await runCli(dir, ["deliver-1", "--dest", "outbox-a"]);
    const reversed = await runCli(dir, ["--dest", "outbox-b", "deliver-1"]);
    assertSuccess(canonical, "delivered");
    assertSuccess(reversed, "delivered");
    assert(existsSync(resolve(dir, "outbox-a", "2026-W47-ai-trends", ".delivery-receipt.json")), "canonical receipt missing");
    assert(existsSync(resolve(dir, "outbox-b", "2026-W47-ai-trends", ".delivery-receipt.json")), "reverse receipt missing");
    return ["Canonical and reverse flag order both deliver successfully to isolated destinations."];
  } finally {
    fixture.close();
  }
}

async function invalidDestination(
  dir: string,
  prefix: string,
  args: readonly string[],
): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    const result = await runCli(dir, args);
    assertFailurePrefix(result, prefix);
    assert(!existsSync(resolve(dir, "outbox")), "invalid destination created outbox");
    return [`Destination ${JSON.stringify(args)} fails with ${prefix} before delivery.`];
  } finally {
    fixture.close();
  }
}

async function protectedDestinationRoots(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    for (const root of [".git", "reports", ".runs", ".data", ".omx", "src", "scripts", "docs", "node_modules"]) {
      const result = await runCli(dir, ["deliver-1", "--dest", root]);
      assertFailurePrefix(result, "INVALID_DESTINATION:");
    }
    return ["All protected destination roots are rejected with INVALID_DESTINATION."];
  } finally {
    fixture.close();
  }
}

async function destinationEqualsSource(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, { artifactDir: "outbox/source" });
  try {
    const result = await runCli(dir, ["deliver-1", "--dest", "outbox/source"]);
    assertFailurePrefix(result, "INVALID_DESTINATION:");
    return ["Destination resolving to the source artifact directory is rejected."];
  } finally {
    fixture.close();
  }
}

async function destinationSymlinkEscape(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    const outside = resolve(smokeRoot, "outside-dest");
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, resolve(dir, "escape-link"));
    const result = await runCli(dir, ["deliver-1", "--dest", "escape-link/outbox"]);
    assertFailurePrefix(result, "INVALID_DESTINATION:");
    return ["Existing destination symlink component escaping repo root is rejected."];
  } finally {
    fixture.close();
  }
}

async function unknownJob(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    const result = await runCli(dir, ["missing-job", "--dest", "outbox"]);
    assertFailurePrefix(result, "UNKNOWN_JOB: missing-job");
    return ["Unknown job fails with stable UNKNOWN_JOB stderr."];
  } finally {
    fixture.close();
  }
}

async function jobNotPublished(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, { status: "awaiting_approval" });
  try {
    const result = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertFailurePrefix(result, "JOB_NOT_PUBLISHED: deliver-1");
    return ["Non-published job fails with stable JOB_NOT_PUBLISHED stderr."];
  } finally {
    fixture.close();
  }
}

async function missingPromotedManifest(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, { skipEvent: true });
  try {
    const result = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertFailurePrefix(result, "PUBLISH_MANIFEST_MISSING:");
    return ["Published job without promoted event fails with manifest-missing error."];
  } finally {
    fixture.close();
  }
}

async function unparseablePromotedManifest(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, { eventPayload: "{not json" });
  try {
    const result = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertFailurePrefix(result, "PUBLISH_MANIFEST_INVALID:");
    return ["Unparseable promoted payload fails with manifest-invalid error."];
  } finally {
    fixture.close();
  }
}

async function oldAttemptAuthority(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, { attemptNumber: 2, eventAttemptNumber: 1 });
  try {
    const result = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertFailurePrefix(result, "PUBLISH_MANIFEST_MISSING:");
    assert(!existsSync(resolve(dir, "outbox")), "old-attempt authority created destination");
    return ["Old-attempt promoted event is not selected as authority and mutates no destination."];
  } finally {
    fixture.close();
  }
}

async function mismatchedManifest(
  dir: string,
  patch: Partial<PublishManifest>,
): Promise<string[]> {
  const fixture = createPublishedFixture(dir, { manifestPatch: patch });
  try {
    const result = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertFailurePrefix(result, "PUBLISH_MANIFEST_INVALID:");
    assert(!existsSync(resolve(dir, "outbox")), "mismatched manifest created destination");
    return ["Promoted manifest row mismatch fails before destination mutation."];
  } finally {
    fixture.close();
  }
}

async function invalidManifestShape(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {
    manifestPatch: { files: [], sha256: {}, aggregate_sha256: "abc" } as unknown as Partial<PublishManifest>,
  });
  try {
    const result = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertFailurePrefix(result, "PUBLISH_MANIFEST_INVALID:");
    assert(!existsSync(resolve(dir, "outbox")), "invalid manifest shape created destination");
    return ["Invalid manifest shape fails before destination mutation."];
  } finally {
    fixture.close();
  }
}

async function unsafeArtifactDir(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, { artifactDir: "../escape-artifact" });
  try {
    const result = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertFailurePrefix(result, "PUBLISH_MANIFEST_INVALID:");
    assert(!existsSync(resolve(dir, "outbox")), "unsafe artifact_dir created destination");
    return ["Unsafe jobs.artifact_dir fails before destination mutation."];
  } finally {
    fixture.close();
  }
}

async function unsafeManifestFilePath(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {
    manifestFilePatch: "../escape.md",
    manifestHashOverrides: { "../escape.md": shaText("unsafe\n") },
  });
  try {
    const result = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertFailurePrefix(result, "PUBLISH_MANIFEST_INVALID:");
    assert(!existsSync(resolve(dir, "outbox")), "unsafe manifest file path created destination");
    return ["Unsafe manifest file path fails before destination mutation."];
  } finally {
    fixture.close();
  }
}

async function sourceSymlinkEscape(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, { skipEvent: true });
  try {
    const outside = resolve(smokeRoot, "outside-source.md");
    writeFileSync(outside, "outside\n", "utf8");
    const sourceLink = resolve(fixture.sourceRoot, "linked.md");
    symlinkSync(outside, sourceLink);
    const manifest = manifestFor({
      artifactDir: fixture.artifactDir,
      attemptNumber: 1,
      files: ["linked.md"],
      jobId: fixture.jobId,
      sourceRoot: fixture.sourceRoot,
      hashOverrides: { "linked.md": shaText("outside\n") },
    });
    insertPromotedEvent(fixture.db, fixture.jobId, 1, manifest);
    const result = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertFailurePrefix(result, "PUBLISH_MANIFEST_INVALID:");
    assert(!existsSync(resolve(dir, "outbox")), "source symlink escape created destination");
    return ["Source symlink file is rejected before destination mutation."];
  } finally {
    fixture.close();
  }
}

async function successDelivery(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    const result = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertSuccess(result, "delivered");
    const receipt = readReceipt(resolve(dir, "outbox", "2026-W47-ai-trends", ".delivery-receipt.json"));
    assert(receipt.job_id === "deliver-1", "receipt job_id drifted");
    assert(receipt.aggregate_sha256 === fixture.manifest.aggregate_sha256, "receipt aggregate drifted");
    assert(existsSync(resolve(dir, "outbox", "2026-W47-ai-trends", "report.en.md")), "delivered report missing");
    assert(!existsSync(resolve(dir, "outbox", "2026-W47-ai-trends", "extra.md")), "unmanifested file copied");
    return ["Successful delivery copies manifest files only and writes deterministic receipt."];
  } finally {
    fixture.close();
  }
}

async function idempotentDelivery(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    const first = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertSuccess(first, "delivered");
    const receiptPath = resolve(dir, "outbox", "2026-W47-ai-trends", ".delivery-receipt.json");
    const before = readFileSync(receiptPath, "utf8");
    const second = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertSuccess(second, "idempotent");
    assert(readFileSync(receiptPath, "utf8") === before, "idempotent delivery rewrote receipt");
    return ["Repeated delivery is idempotent and leaves the original receipt unchanged."];
  } finally {
    fixture.close();
  }
}

async function destinationDivergence(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    const first = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertSuccess(first, "delivered");
    writeFileSync(resolve(dir, "outbox", "2026-W47-ai-trends", "report.en.md"), "tampered\n", "utf8");
    const second = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertFailurePrefix(second, "DELIVERY_ARTIFACT_DIVERGED:");
    assert(readFileSync(resolve(dir, "outbox", "2026-W47-ai-trends", "report.en.md"), "utf8") === "tampered\n", "diverged destination was overwritten");
    return ["Diverged destination fails and is not overwritten."];
  } finally {
    fixture.close();
  }
}

async function sourceDivergence(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    writeFileSync(resolve(fixture.sourceRoot, "report.en.md"), "tampered source\n", "utf8");
    const result = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertFailurePrefix(result, "PUBLISH_MANIFEST_INVALID:");
    assert(!existsSync(resolve(dir, "outbox")), "source divergence created destination");
    return ["Source hash divergence fails before destination mutation."];
  } finally {
    fixture.close();
  }
}

function partialCopyCleanupStatic(): string[] {
  const source = readRepoSource(repoRoot, "src/lib/publish-destination.ts");
  assert(source.includes("cleanupTempDir(tempDir);"), "missing temp cleanup call");
  assert(source.includes("renameSync(tempDir, deliveredDir);"), "missing final atomic rename");
  assert(source.includes(".delivery-tmp-"), "missing stable temp directory prefix");
  assert(source.indexOf("verifyDeliveredBundle(tempDir") < source.indexOf("renameSync(tempDir, deliveredDir);"), "temp bundle is not verified before rename");
  return [
    "Static cleanup proof: temp bundle is verified before final rename, failures call cleanupTempDir, and retained temp naming uses .delivery-tmp- prefix.",
  ];
}

async function fieldSafety(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, { artifactDir: "reports/2026-W47-ai-trends" });
  try {
    const result = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertSuccess(result, "delivered");
    const line = result.stdout.trimEnd();
    assert(!/[\r\n]/.test(line), "success line contains newline inside record");
    const fields = line.split("\t");
    assert(fields.length === 8, `expected 8 tab fields, got ${fields.length}`);
    assert(fields.every((field) => !/[\r\n]/.test(field)), "field contains raw newline");
    return ["Success output is a single tab-delimited DELIVERY record with field-safe values."];
  } finally {
    fixture.close();
  }
}

async function readOnlyNoMutation(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    const beforeJob = stableJson(findJobById(fixture.db, fixture.jobId));
    const beforeEvents = stableJson(findEventsByJob(fixture.db, fixture.jobId));
    const beforeSource = shaFile(resolve(fixture.sourceRoot, "report.en.md"));
    const result = await runCli(dir, ["deliver-1", "--dest", "outbox"]);
    assertSuccess(result, "delivered");
    assert(stableJson(findJobById(fixture.db, fixture.jobId)) === beforeJob, "job row mutated");
    assert(stableJson(findEventsByJob(fixture.db, fixture.jobId)) === beforeEvents, "events mutated");
    assert(shaFile(resolve(fixture.sourceRoot, "report.en.md")) === beforeSource, "source file mutated");
    assert(!existsSync(resolve(dir, ".runs")), ".runs path was created");
    return ["Delivery leaves job row, events table, source bundle, and .runs absent/unchanged."];
  } finally {
    fixture.close();
  }
}

function boundaryStaticCheck(): string[] {
  const changed = changedFilesForCurrentCycle(repoRoot);
  const scopeMode = assertCycleScopePolicy({
    changed,
    activeTriggerFiles: reportDeliverActiveTriggers,
    activeScope: slice418Scope,
    activeFrozenFiles: [
      "PLAN.md",
      "src/promote.ts",
      "src/bin/report-run.ts",
      "src/lib/report-loop.ts",
      "scripts/lib/static-guardrails.ts",
      "bun.lock",
      "bun.lockb",
    ],
    activeFrozenDirectories: [
      "src/telegram/",
      "src/migrations/",
      "src/pipeline/",
      "src/llm/",
      "src/prompts/",
    ],
  });
  assert(scopeMode === "active-slice", "report-deliver-local smoke should run in active-slice mode for Slice 4.18");

  const packageJson = JSON.parse(readRepoSource(repoRoot, "package.json")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert(packageJson.scripts?.["report:deliver-local"] === "bun src/bin/report-deliver-local.ts", "missing report:deliver-local script");
  assert(packageJson.scripts?.["report-deliver-local-smoke"] === "bun scripts/report-deliver-local-smoke.ts", "missing report-deliver-local-smoke script");
  assert(packageJson.dependencies === undefined, "package.json gained dependencies");
  assert(packageJson.devDependencies?.typescript === "^5.6.3", "typescript devDependency drifted");
  assert(packageJson.devDependencies?.["@types/bun"] === "^1.1.13", "@types/bun devDependency drifted");

  const implementation = [
    readRepoSource(repoRoot, "src/bin/report-deliver-local.ts"),
    readRepoSource(repoRoot, "src/lib/publish-destination.ts"),
  ].join("\n");
  assertNoForbiddenPatterns(implementation, [
    ...PROCESS_SPAWN_PATTERNS,
    ...TELEGRAM_SDK_NETWORK_PATTERNS,
    ...PROMPT_SURFACE_PATTERNS,
    ...GIT_POST_STEP_PATTERNS,
    [/\bfetch\s*\(|https?:\/\//, "network surface"],
    [/\bpromoteJob\b|\bbuildGitCommitPlan\b/, "promote mutation helper"],
    [/from\s+["'][^"']*report-run\.ts["']|from\s+["'][^"']*report-loop\.ts["']|from\s+["'][^"']*pipeline\//, "report-run/stage surface"],
    [/\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b|\bCREATE\s+TABLE\b|\bALTER\s+TABLE\b|\bDROP\s+TABLE\b/i, "DB mutation SQL"],
  ], "report-deliver-local implementation");

  return [
    `Cycle-scope boundary check ran in ${scopeMode} mode and saw changed files: ${changed.join(", ") || "<none>"}.`,
    "package.json adds only report:deliver-local and report-deliver-local-smoke scripts with dependency sets unchanged.",
    "Implementation contains no network, Telegram, prompt/LLM, git post-step, promote mutation, report-run/stage, migration, or DB mutation surface.",
  ];
}

async function runCli(dir: string, args: readonly string[]): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runReportDeliverLocalCli({
    cwd: dir,
    args,
    now: () => fixedNow,
    writeStdout: (text) => {
      stdout += text;
    },
    writeStderr: (text) => {
      stderr += text;
    },
  });
  return { exitCode, stdout, stderr };
}

function createPublishedFixture(
  dir: string,
  opts: {
    readonly artifactDir?: string;
    readonly attemptNumber?: number;
    readonly eventAttemptNumber?: number;
    readonly eventPayload?: string;
    readonly manifestFilePatch?: string;
    readonly manifestHashOverrides?: Readonly<Record<string, string>>;
    readonly manifestPatch?: Partial<PublishManifest>;
    readonly skipEvent?: boolean;
    readonly status?: string;
  },
): Fixture {
  const db = openDb(resolve(dir, ".data", "content.db"));
  const jobId = "deliver-1";
  const attemptNumber = opts.attemptNumber ?? 1;
  const artifactDir = opts.artifactDir ?? "reports/2026-W47-ai-trends";
  const sourceRoot = resolve(dir, artifactDir);
  mkdirSync(sourceRoot, { recursive: true });
  writeFileSync(resolve(sourceRoot, "report.en.md"), "English report\n", "utf8");
  writeFileSync(resolve(sourceRoot, "sources.json"), "{\"sources\":[]}\n", "utf8");
  mkdirSync(resolve(sourceRoot, "research"), { recursive: true });
  writeFileSync(resolve(sourceRoot, "research", "note.json"), "{\"ok\":true}\n", "utf8");
  writeFileSync(resolve(sourceRoot, "extra.md"), "should not copy\n", "utf8");

  const files = opts.manifestFilePatch === undefined
    ? ["report.en.md", "research/note.json", "sources.json"]
    : [opts.manifestFilePatch];
  const manifest = {
    ...manifestFor({
      artifactDir,
      attemptNumber,
      files,
      hashOverrides: opts.manifestHashOverrides,
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
    current_stage: "approval",
    artifact_dir: artifactDir,
    primary_report_path: `${artifactDir}/report.en.md`,
    sources_path: `${artifactDir}/sources.json`,
    created_at: 1_778_300_000,
    updated_at: 1_778_300_100,
  });

  if (!opts.skipEvent) {
    const eventAttemptNumber = opts.eventAttemptNumber ?? attemptNumber;
    const payload = opts.eventPayload ?? JSON.stringify({ publish_manifest: manifest });
    insertEvent(db, {
      job_id: jobId,
      attempt_number: eventAttemptNumber,
      type: "promoted",
      payload,
      created_at: 1_778_300_200,
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

function insertPromotedEvent(
  db: DbClient,
  jobId: string,
  attemptNumber: number,
  manifest: PublishManifest,
): void {
  insertEvent(db, {
    job_id: jobId,
    attempt_number: attemptNumber,
    type: "promoted",
    payload: JSON.stringify({ publish_manifest: manifest }),
    created_at: 1_778_300_300,
  });
}

function manifestFor(opts: {
  readonly artifactDir: string;
  readonly attemptNumber: number;
  readonly files: readonly string[];
  readonly hashOverrides?: Readonly<Record<string, string>>;
  readonly jobId: string;
  readonly sourceRoot: string;
}): PublishManifest {
  const files = [...opts.files].sort();
  const sha256: Record<string, string> = {};
  for (const file of files) {
    sha256[file] = opts.hashOverrides?.[file] ?? shaFile(resolve(opts.sourceRoot, file));
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

function assertSuccess(result: CliResult, status: "delivered" | "idempotent"): void {
  assert(result.exitCode === 0, `expected success, got exit ${result.exitCode} stderr=${result.stderr}`);
  assert(result.stderr === "", `success wrote stderr: ${result.stderr}`);
  assert(result.stdout.startsWith(`DELIVERY\t`), `success stdout missing DELIVERY record: ${result.stdout}`);
  assert(result.stdout.includes(`status=${status}`), `success stdout status drifted: ${result.stdout}`);
  assert(result.stdout.endsWith("\n"), "success stdout missing trailing newline");
}

function assertFailurePrefix(result: CliResult, prefix: string): void {
  assert(result.exitCode === 1, `expected failure exit 1, got ${result.exitCode}`);
  assert(result.stdout === "", `failure wrote stdout: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr.startsWith(prefix), `stderr ${JSON.stringify(result.stderr)} did not start with ${prefix}`);
}

function readReceipt(filePath: string): {
  readonly aggregate_sha256: string;
  readonly job_id: string;
} {
  return JSON.parse(readFileSync(filePath, "utf8")) as {
    readonly aggregate_sha256: string;
    readonly job_id: string;
  };
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  const passed = outcomes.filter((outcome) => outcome.status === "PASS").length;
  const lines = [
    "# report-deliver-local smoke",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Result: ${passed}/${outcomes.length} PASS`,
    "",
    "| Scenario | Status | Details |",
    "|---|---:|---|",
    ...outcomes.map((outcome) =>
      `| ${outcome.name} | ${outcome.status} | ${outcome.details.map(escapeTable).join("<br>")} |`
    ),
  ];
  writeFileSync(docPath, `${lines.join("\n")}\n`, "utf8");
}

function shaFile(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function shaText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function aggregateFor(
  files: readonly string[],
  sha256: Readonly<Record<string, string>>,
): string {
  return createHash("sha256")
    .update(JSON.stringify(files.map((file) => [file, sha256[file]])))
    .digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

if (import.meta.main) {
  process.exit(await main());
}
