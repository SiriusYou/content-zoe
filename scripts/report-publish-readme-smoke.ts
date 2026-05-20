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
} from "../src/db.ts";
import { runReportPublishReadmeCli } from "../src/bin/report-publish-readme.ts";
import { promoteJob, type PublishManifest } from "../src/promote.ts";
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
  | "report-publish-readme-missing-db"
  | "report-publish-readme-invalid-command"
  | "report-publish-readme-unknown-job"
  | "report-publish-readme-job-not-published"
  | "report-publish-readme-missing-promoted-manifest"
  | "report-publish-readme-invalid-promoted-manifest"
  | "report-publish-readme-source-missing-or-unsafe"
  | "report-publish-readme-promote-composition"
  | "report-publish-readme-append-section"
  | "report-publish-readme-migrates-existing-rows"
  | "report-publish-readme-replace-section"
  | "report-publish-readme-idempotent"
  | "report-publish-readme-multi-row-preservation"
  | "report-publish-readme-malformed-markers"
  | "report-publish-readme-readme-path-safety"
  | "report-publish-readme-field-safety"
  | "report-publish-readme-no-mutation"
  | "report-publish-readme-boundary-static-check";

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

interface FixtureOptions {
  readonly artifactDir: string;
  readonly attemptNumber: number;
  readonly eventPayload: string;
  readonly files: readonly string[];
  readonly jobId: string;
  readonly manifestPatch: Partial<PublishManifest>;
  readonly primaryReportPath: string | null;
  readonly skipEvent: boolean;
  readonly sourcesPath: string | null;
  readonly status: string;
  readonly topic: string;
  readonly translatedReportPath: string | null;
}

const SCENARIOS: readonly ScenarioName[] = [
  "report-publish-readme-missing-db",
  "report-publish-readme-invalid-command",
  "report-publish-readme-unknown-job",
  "report-publish-readme-job-not-published",
  "report-publish-readme-missing-promoted-manifest",
  "report-publish-readme-invalid-promoted-manifest",
  "report-publish-readme-source-missing-or-unsafe",
  "report-publish-readme-promote-composition",
  "report-publish-readme-append-section",
  "report-publish-readme-migrates-existing-rows",
  "report-publish-readme-replace-section",
  "report-publish-readme-idempotent",
  "report-publish-readme-multi-row-preservation",
  "report-publish-readme-malformed-markers",
  "report-publish-readme-readme-path-safety",
  "report-publish-readme-field-safety",
  "report-publish-readme-no-mutation",
  "report-publish-readme-boundary-static-check",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = path.join(
  tmpdir(),
  `cz-report-publish-readme-smoke-${new Date().toISOString().replaceAll(":", "-")}`,
);
const docPath = resolve(repoRoot, "docs", "preflight", "report-publish-readme-smoke.md");
const fixedNow = 1_779_300_000;
const startMarker = "<!-- content-zoe:published-reports:start -->";
const endMarker = "<!-- content-zoe:published-reports:end -->";
const slice424ReadmeScope = new Set([
  "src/bin/report-publish-readme.ts",
  "src/lib/readme-publish-destination.ts",
  "scripts/report-publish-readme-smoke.ts",
  "docs/preflight/report-publish-readme-smoke.md",
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
    case "report-publish-readme-missing-db":
      return missingDb(dir);
    case "report-publish-readme-invalid-command":
      return invalidCommand(dir);
    case "report-publish-readme-unknown-job":
      return unknownJob(dir);
    case "report-publish-readme-job-not-published":
      return jobNotPublished(dir);
    case "report-publish-readme-missing-promoted-manifest":
      return missingPromotedManifest(dir);
    case "report-publish-readme-invalid-promoted-manifest":
      return invalidPromotedManifest(dir);
    case "report-publish-readme-source-missing-or-unsafe":
      return sourceMissingOrUnsafe(dir);
    case "report-publish-readme-promote-composition":
      return promoteComposition(dir);
    case "report-publish-readme-append-section":
      return appendSection(dir);
    case "report-publish-readme-migrates-existing-rows":
      return migratesExistingRows(dir);
    case "report-publish-readme-replace-section":
      return replaceSection(dir);
    case "report-publish-readme-idempotent":
      return idempotent(dir);
    case "report-publish-readme-multi-row-preservation":
      return multiRowPreservation(dir);
    case "report-publish-readme-malformed-markers":
      return malformedMarkers(dir);
    case "report-publish-readme-readme-path-safety":
      return readmePathSafety(dir);
    case "report-publish-readme-field-safety":
      return fieldSafety(dir);
    case "report-publish-readme-no-mutation":
      return noMutation(dir);
    case "report-publish-readme-boundary-static-check":
      return boundaryStaticCheck();
  }
}

async function missingDb(dir: string): Promise<string[]> {
  const result = await runCli(dir, ["missing-db-job"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}`);
  assert(result.stdout === "NO_DATABASE\n", `stdout drifted: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr === "", `stderr drifted: ${JSON.stringify(result.stderr)}`);
  assert(!existsSync(resolve(dir, ".data")), "missing DB path created .data");
  assert(!existsSync(resolve(dir, "README.md")), "missing DB path created README");
  assert(readmeTempFiles(dir).length === 0, "missing DB path created temp README");
  return ["Missing DB exits 0 with exact NO_DATABASE stdout and creates no DB, README, or temp file."];
}

async function invalidCommand(dir: string): Promise<string[]> {
  const cases: readonly (readonly string[])[] = [
    [],
    [""],
    ["   "],
    ["--flag"],
    ["job-1", "extra"],
    ["bad\tjob"],
    ["bad\njob"],
  ];
  for (const args of cases) {
    const result = await runCli(dir, args);
    assertFailurePrefix(result, "INVALID_COMMAND");
  }
  assert(!existsSync(resolve(dir, ".data")), "invalid command created .data");
  assert(!existsSync(resolve(dir, "README.md")), "invalid command created README");
  return ["Invalid arity, blank, flag-looking, and control-character job IDs fail before DB access."];
}

async function unknownJob(dir: string): Promise<string[]> {
  const db = openDb(resolve(dir, ".data", "content.db"));
  try {
    const result = await runCli(dir, ["unknown-job"]);
    assertFailurePrefix(result, "UNKNOWN_JOB: unknown-job");
    assert(!existsSync(resolve(dir, "README.md")), "unknown job created README");
    return ["Unknown job exits 1 with stable UNKNOWN_JOB stderr and no README mutation."];
  } finally {
    db.close();
  }
}

async function jobNotPublished(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, { status: "awaiting_approval" });
  try {
    const result = await runCli(dir, [fixture.jobId]);
    assertFailurePrefix(result, `JOB_NOT_PUBLISHED: ${fixture.jobId}`);
    assert(!existsSync(resolve(dir, "README.md")), "non-published job created README");
    return ["Non-published job exits 1 with stable JOB_NOT_PUBLISHED stderr."];
  } finally {
    fixture.close();
  }
}

async function missingPromotedManifest(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, { skipEvent: true });
  try {
    const result = await runCli(dir, [fixture.jobId]);
    assertFailurePrefix(result, `PUBLISH_MANIFEST_MISSING: ${fixture.jobId}`);
    assert(!existsSync(resolve(dir, "README.md")), "missing manifest created README");
    return ["Published job without promoted manifest exits 1 with PUBLISH_MANIFEST_MISSING."];
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
    ["missing sha256", { manifestPatch: malformedManifestPatch({ sha256: undefined }) }],
    ["null sha256", { manifestPatch: malformedManifestPatch({ sha256: null }) }],
    ["non-object sha256", { manifestPatch: malformedManifestPatch({ sha256: "not-a-map" }) }],
    ["non-string file entry", { manifestPatch: malformedManifestPatch({ files: [1, "sources.json"] }) }],
    ["invalid file path", {
      manifestPatch: {
        files: ["../bad"],
        sha256: { "../bad": "a".repeat(64) },
        aggregate_sha256: "a".repeat(64),
      },
    }],
    ["aggregate mismatch", { manifestPatch: { aggregate_sha256: "a".repeat(64) } }],
    ["unsafe report path", { primaryReportPath: "../outside.md" }],
    ["report outside artifact-or-attempt roots", { primaryReportPath: "reports/other/report.en.md" }],
    ["report absent from manifest", { primaryReportPath: "reports/2026-W47-ai-trends/missing.md" }],
    ["attempt-local report absent from manifest", {
      primaryReportPath: ".runs/publish-readme-1/attempt-1/missing.md",
    }],
    ["source-material files without manifest", {
      files: ["report.en.md", "sources.json", "source-material/context.md"],
    }],
    ["source-material manifest path mismatch", {
      files: ["report.en.md", "sources.json", "source-material/manifest-v2.json"],
    }],
    ["source-material manifest hash mismatch", {
      manifestPatch: malformedManifestPatch({
        sha256: {
          "report.en.md": "0".repeat(64),
          "sources.json": "0".repeat(64),
          "source-material/context.md": "0".repeat(64),
          "source-material/manifest.json": "0".repeat(64),
          "source-material/operator/facts.md": "0".repeat(64),
        },
        aggregate_sha256: aggregateFor(
          [
            "report.en.md",
            "source-material/context.md",
            "source-material/manifest.json",
            "source-material/operator/facts.md",
            "sources.json",
          ],
          {
            "report.en.md": "0".repeat(64),
            "sources.json": "0".repeat(64),
            "source-material/context.md": "0".repeat(64),
            "source-material/manifest.json": "0".repeat(64),
            "source-material/operator/facts.md": "0".repeat(64),
          },
        ),
      }),
    }],
  ];
  const details: string[] = [];
  for (const [label, opts] of variants) {
    const caseDir = resolve(dir, label.replaceAll(" ", "-"));
    mkdirSync(caseDir, { recursive: true });
    const fixture = createPublishedFixture(caseDir, opts);
    try {
      const result = await runCli(caseDir, [fixture.jobId]);
      assertFailurePrefix(result, "PUBLISH_MANIFEST_INVALID:");
      assert(!existsSync(resolve(caseDir, "README.md")), `${label} created README`);
      assert(readmeTempFiles(caseDir).length === 0, `${label} left temp README`);
      details.push(`${label} failed as PUBLISH_MANIFEST_INVALID before README mutation.`);
    } finally {
      fixture.close();
    }
  }
  return details;
}

async function sourceMissingOrUnsafe(dir: string): Promise<string[]> {
  const variants: readonly [string, (caseDir: string, fixture: Fixture) => void, string][] = [
    ["missing-artifact-dir", (_caseDir, fixture) => rmSync(fixture.sourceRoot, { recursive: true, force: true }), "PUBLISH_SOURCE_MISSING:"],
    ["missing-manifest-file", (_caseDir, fixture) => rmSync(resolve(fixture.sourceRoot, "report.en.md"), { force: true }), "PUBLISH_SOURCE_MISSING:"],
    ["missing-report-field-file", (_caseDir, fixture) => rmSync(resolve(fixture.sourceRoot, "report.en.md"), { force: true }), "PUBLISH_SOURCE_MISSING:"],
    ["traversal-manifest-path", () => undefined, "PUBLISH_MANIFEST_INVALID:"],
    ["final-file-symlink", (caseDir, fixture) => {
      const outside = resolve(caseDir, "outside.md");
      writeFileSync(outside, "outside\n", "utf8");
      rmSync(resolve(fixture.sourceRoot, "report.en.md"), { force: true });
      symlinkSync(outside, resolve(fixture.sourceRoot, "report.en.md"));
    }, "PUBLISH_MANIFEST_INVALID:"],
    ["component-symlink", (caseDir, fixture) => {
      rmSync(resolve(fixture.sourceRoot, "nested"), { recursive: true, force: true });
      const outside = resolve(caseDir, "outside-nested");
      mkdirSync(outside, { recursive: true });
      writeFileSync(resolve(outside, "report.en.md"), "outside nested\n", "utf8");
      symlinkSync(outside, resolve(fixture.sourceRoot, "nested"));
    }, "PUBLISH_MANIFEST_INVALID:"],
    ["non-file-manifest-path", (_caseDir, fixture) => rmSync(resolve(fixture.sourceRoot, "report.en.md"), { force: true }), "PUBLISH_SOURCE_MISSING:"],
  ];
  const details: string[] = [];
  for (const [label, mutate, prefix] of variants) {
    const caseDir = resolve(dir, label);
    mkdirSync(caseDir, { recursive: true });
    const opts: Partial<FixtureOptions> =
      label === "traversal-manifest-path"
        ? {
            manifestPatch: {
              files: ["../bad"],
              sha256: { "../bad": "a".repeat(64) },
              aggregate_sha256: "a".repeat(64),
            },
          }
        : label === "component-symlink"
          ? {
              files: ["nested/report.en.md", "sources.json"],
              primaryReportPath: "reports/2026-W47-ai-trends/nested/report.en.md",
            }
          : {};
    const fixture = createPublishedFixture(caseDir, opts);
    try {
      if (label === "non-file-manifest-path") {
        rmSync(resolve(fixture.sourceRoot, "report.en.md"), { force: true });
        mkdirSync(resolve(fixture.sourceRoot, "report.en.md"), { recursive: true });
      } else {
        mutate(caseDir, fixture);
      }
      const result = await runCli(caseDir, [fixture.jobId]);
      assertFailurePrefix(result, prefix);
      assert(!existsSync(resolve(caseDir, "README.md")), `${label} created README`);
      assert(readmeTempFiles(caseDir).length === 0, `${label} left temp README`);
      details.push(`${label} failed before README mutation with ${prefix}`);
    } finally {
      fixture.close();
    }
  }
  return details;
}

async function promoteComposition(dir: string): Promise<string[]> {
  const db = openDb(resolve(dir, ".data", "content.db"));
  const jobId = "2026-W52-ai-trends";
  const weekKey = "2026-W52";
  const attemptNumber = 1;
  const runDir = `.runs/${jobId}`;
  const attemptRoot = `${runDir}/attempt-${attemptNumber}`;
  const artifactDir = `reports/${weekKey}-ai-trends`;
  try {
    insertJob(db, {
      id: jobId,
      week_key: weekKey,
      topic: "AI trends composition",
      locales: "en,zh",
      attempt_number: attemptNumber,
      status: "awaiting_approval",
      current_stage: "approval",
      run_dir: runDir,
      artifact_dir: null,
      primary_report_path: `${attemptRoot}/report.en.md`,
      translated_report_path: `${attemptRoot}/report.zh.md`,
      sources_path: `${attemptRoot}/sources.json`,
      approval_summary: "approve manifest-authority composition",
      created_at: fixedNow,
      updated_at: fixedNow,
    });
    writePromoteAttemptBundle(dir, {
      attemptNumber,
      jobId,
      weekKey,
    });

    let now = fixedNow + 10;
    const promoted = await promoteJob({
      db,
      cwd: dir,
      jobId,
      attemptNumber,
      now: () => now++,
    });
    assert(promoted.status === "published", "real promote did not publish composition fixture");
    assert(promoted.artifactDir === artifactDir, "promote artifact_dir drifted");

    const job = findJobById(db, jobId);
    assert(job !== null, "published job row missing");
    assert(job.status === "published", "job row was not published");
    assert(job.artifact_dir === artifactDir, "job artifact_dir was not committed");
    assert(job.primary_report_path === `${attemptRoot}/report.en.md`, "primary report metadata was not preserved as attempt-local");
    assert(job.translated_report_path === `${attemptRoot}/report.zh.md`, "translated report metadata was not preserved as attempt-local");
    assert(job.sources_path === `${attemptRoot}/sources.json`, "sources metadata was not preserved as attempt-local");

    const promotedEvents = findEventsByJob(db, jobId, "promoted");
    assert(promotedEvents.length === 1, "real promote did not write exactly one promoted event");
    const manifest = promotedManifestFromPayload(promotedEvents[0]?.payload);
    assert(manifest.artifact_dir === artifactDir, "promoted manifest artifact_dir drifted");
    assert(manifest.files.includes("report.zh.md"), "promoted manifest missing translated report");
    assert(manifest.files.includes("sources.json"), "promoted manifest missing sources");
    assert(manifest.files.includes("source-material/manifest.json"), "promoted manifest missing source-material manifest");
    assertManifestHashes(dir, manifest);

    const first = await runCli(dir, [jobId]);
    assertSuccess(first, "published");
    const firstRecord = parseRecord(first.stdout);
    assert(firstRecord.report === `${artifactDir}/report.zh.md`, `README report link was not manifest-backed translated report: ${firstRecord.report}`);
    assert(firstRecord.sources === `${artifactDir}/sources.json`, `README sources link was not manifest-backed: ${firstRecord.sources}`);
    const before = readFileSync(resolve(dir, "README.md"), "utf8");
    const row = before.split("\n").find((line) => line.includes(`| ${weekKey} |`) && line.includes(`| ${jobId} |`));
    assert(row !== undefined, "README managed row missing promoted composition job");
    assert(splitUnescapedPipes(row).length === 10, `composition row is not 8-column: ${row}`);
    assert(
      row.includes(`[${artifactDir}/report.zh.md](${artifactDir}/report.zh.md)`),
      "README row did not link manifest-backed translated report",
    );
    assert(
      row.includes(`[${artifactDir}/sources.json](${artifactDir}/sources.json)`),
      "README row did not link manifest-backed sources",
    );
    assert(
      row.includes(`[${artifactDir}/source-material/manifest.json](${artifactDir}/source-material/manifest.json)`),
      "README row did not link manifest-backed source-material manifest",
    );

    const second = await runCli(dir, [jobId]);
    assertSuccess(second, "idempotent");
    assert(readFileSync(resolve(dir, "README.md"), "utf8") === before, "composition publish was not idempotent");

    return [
      "Real promote output preserved .runs/... job-row report/source metadata while committing a published row and promoted manifest.",
      "report:publish-readme normalized attempt-local hints to manifest-relative tails and emitted 8-column manifest-backed report, sources, and source-material links.",
      "Promoted manifest hashes matched final bundle bytes and the second README publish was byte-idempotent, closing unit-fixtures-passing-while-cross-cli-composition-fails at N=1.",
    ];
  } finally {
    db.close();
  }
}

async function appendSection(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    writeFileSync(resolve(dir, "README.md"), "# Existing README\n", "utf8");
    const result = await runCli(dir, [fixture.jobId]);
    assertSuccess(result, "published");
    assert(
      /^README_PUBLISH\tjob_id=publish-readme-1\tstatus=published\treadme=README\.md\treport=reports\/2026-W47-ai-trends\/report\.en\.md\tsources=reports\/2026-W47-ai-trends\/sources\.json\taggregate_sha256=[0-9a-f]{12}\tentries=1\n$/.test(result.stdout),
      `stdout shape drifted: ${JSON.stringify(result.stdout)}`,
    );
    const readme = readFileSync(resolve(dir, "README.md"), "utf8");
    assert(readme.includes("## Published Reports"), "heading missing");
    assert(readme.includes(startMarker) && readme.includes(endMarker), "markers missing");
    assert(
      readme.includes("| Week | Topic | Job | Report | Sources | Source Material | Aggregate | Updated |"),
      "8-column header missing",
    );
    assert(readme.includes("| 2026-W47 | AI trends | publish-readme-1 |"), "published row missing");
    assert(
      readme.includes("[reports/2026-W47-ai-trends/source-material/manifest.json](reports/2026-W47-ai-trends/source-material/manifest.json)"),
      "source-material manifest link missing",
    );
    return ["README without markers gets heading, managed 8-column section, one source-material manifest-backed row, and byte-exact stdout shape."];
  } finally {
    fixture.close();
  }
}

async function migratesExistingRows(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    writeFileSync(
      resolve(dir, "README.md"),
      [
        "Intro",
        startMarker,
        "| Week | Topic | Job | Report | Sources | Aggregate | Updated |",
        "|---|---|---|---|---|---|---|",
        "| 2025-W01 | Historical item | old-job | [reports/old/report.en.md](reports/old/report.en.md) | [reports/old/sources.json](reports/old/sources.json) | abcdefabcdef | 2025-01-01T00:00:00.000Z |",
        endMarker,
        "",
      ].join("\n"),
      "utf8",
    );
    const result = await runCli(dir, [fixture.jobId]);
    assertSuccess(result, "published");
    const readme = readFileSync(resolve(dir, "README.md"), "utf8");
    assert(readme.includes("| Week | Topic | Job | Report | Sources | Source Material | Aggregate | Updated |"), "8-column header missing");
    assert(
      readme.includes("| 2025-W01 | Historical item | old-job | [reports/old/report.en.md](reports/old/report.en.md) | [reports/old/sources.json](reports/old/sources.json) | - | abcdefabcdef | 2025-01-01T00:00:00.000Z |"),
      "7-column historical row was not deterministically migrated with empty source material",
    );
    return ["Existing 7-column managed rows are deterministically migrated to 8 columns with an empty source-material cell."];
  } finally {
    fixture.close();
  }
}

async function replaceSection(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    writeFileSync(
      resolve(dir, "README.md"),
      `before\n${startMarker}\nold managed bytes\n${endMarker}\nafter\n`,
      "utf8",
    );
    const result = await runCli(dir, [fixture.jobId]);
    assertSuccess(result, "published");
    const readme = readFileSync(resolve(dir, "README.md"), "utf8");
    assert(readme.startsWith("before\n"), "prefix not preserved");
    assert(readme.endsWith("after\n"), "suffix not preserved");
    assert(!readme.includes("old managed bytes"), "old managed section survived");
    assert(readme.includes("publish-readme-1"), "new row missing");
    return ["Existing managed section is replaced while content before/after markers is preserved."];
  } finally {
    fixture.close();
  }
}

async function idempotent(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    const first = await runCli(dir, [fixture.jobId]);
    assertSuccess(first, "published");
    const before = readFileSync(resolve(dir, "README.md"), "utf8");
    const second = await runCli(dir, [fixture.jobId]);
    assertSuccess(second, "idempotent");
    const after = readFileSync(resolve(dir, "README.md"), "utf8");
    assert(after === before, "idempotent publish changed README bytes");
    return ["Repeated publish returns status=idempotent and leaves README bytes unchanged."];
  } finally {
    fixture.close();
  }
}

async function multiRowPreservation(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {});
  try {
    writeFileSync(
      resolve(dir, "README.md"),
      [
        "Intro",
        startMarker,
        "| Week | Topic | Job | Report | Sources | Source Material | Aggregate | Updated |",
        "|---|---|---|---|---|---|---|---|",
        "| 2027-W01 | Future item | old-job | [reports/old/report.en.md](reports/old/report.en.md) | - | - | abcdefabcdef | 2027-01-01T00:00:00.000Z |",
        endMarker,
        "",
      ].join("\n"),
      "utf8",
    );
    const first = await runCli(dir, [fixture.jobId]);
    assertSuccess(first, "published");
    const second = await runCli(dir, [fixture.jobId]);
    assertSuccess(second, "idempotent");
    const readme = readFileSync(resolve(dir, "README.md"), "utf8");
    assert(countOccurrences(readme, "publish-readme-1") === 1, "current job duplicated");
    assert(countOccurrences(readme, "old-job") === 1, "unrelated historical row was not preserved");
    assert(readme.indexOf("2027-W01") < readme.indexOf("2026-W47"), "week sort order drifted");
    return ["Unrelated historical row is preserved, current row updates without duplication, and rows sort by week desc/job asc."];
  } finally {
    fixture.close();
  }
}

async function malformedMarkers(dir: string): Promise<string[]> {
  const cases: readonly [string, string][] = [
    ["duplicate-start", `${startMarker}\n${startMarker}\n${endMarker}\n`],
    ["missing-end", `${startMarker}\n`],
    ["missing-start", `${endMarker}\n`],
    ["reversed", `${endMarker}\n${startMarker}\n`],
  ];
  const details: string[] = [];
  for (const [label, content] of cases) {
    const caseDir = resolve(dir, label);
    mkdirSync(caseDir, { recursive: true });
    const fixture = createPublishedFixture(caseDir, {});
    try {
      writeFileSync(resolve(caseDir, "README.md"), content, "utf8");
      const before = readFileSync(resolve(caseDir, "README.md"), "utf8");
      const result = await runCli(caseDir, [fixture.jobId]);
      assertFailurePrefix(result, "README_DESTINATION_INVALID:");
      assert(readFileSync(resolve(caseDir, "README.md"), "utf8") === before, `${label} mutated README`);
      assert(readmeTempFiles(caseDir).length === 0, `${label} left temp README`);
      details.push(`${label} failed with README_DESTINATION_INVALID and no mutation.`);
    } finally {
      fixture.close();
    }
  }
  return details;
}

async function readmePathSafety(dir: string): Promise<string[]> {
  const symlinkDir = resolve(dir, "readme-symlink");
  mkdirSync(symlinkDir, { recursive: true });
  const symlinkFixture = createPublishedFixture(symlinkDir, {});
  try {
    writeFileSync(resolve(symlinkDir, "target.md"), "target\n", "utf8");
    symlinkSync("target.md", resolve(symlinkDir, "README.md"));
    const result = await runCli(symlinkDir, [symlinkFixture.jobId]);
    assertFailurePrefix(result, "README_DESTINATION_INVALID:");
  } finally {
    symlinkFixture.close();
  }

  const directoryDir = resolve(dir, "readme-directory");
  mkdirSync(directoryDir, { recursive: true });
  const directoryFixture = createPublishedFixture(directoryDir, {});
  try {
    mkdirSync(resolve(directoryDir, "README.md"));
    const result = await runCli(directoryDir, [directoryFixture.jobId]);
    assertFailurePrefix(result, "README_DESTINATION_INVALID:");
  } finally {
    directoryFixture.close();
  }

  const componentDir = resolve(dir, "component-escape");
  mkdirSync(componentDir, { recursive: true });
  const componentFixture = createPublishedFixture(componentDir, {});
  try {
    const outside = resolve(dir, "outside-readme");
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, resolve(componentDir, "link-out"));
    const result = await runCli(componentDir, [componentFixture.jobId], "link-out/README.md");
    assertFailurePrefix(result, "README_DESTINATION_INVALID:");
    assert(!existsSync(resolve(outside, "README.md")), "escape target README was written");
  } finally {
    componentFixture.close();
  }
  return ["README symlink, README directory, and escaping symlink directory component fail before write."];
}

async function fieldSafety(dir: string): Promise<string[]> {
  const fixture = createPublishedFixture(dir, {
    topic: "AI | trends\twith\n[bad](evil)",
  });
  try {
    writeFileSync(
      resolve(dir, "README.md"),
        [
          startMarker,
        "| Week | Topic | Job | Report | Sources | Source Material | Aggregate | Updated |",
        "|---|---|---|---|---|---|---|---|",
        "| 2025-W01 | hostile | hostile-job | [x](https://evil.example/a|b) | [x](../escape.md) | [x](../escape-source-material.json) | abcdefabcdef | now |",
        endMarker,
        "",
      ].join("\n"),
      "utf8",
    );
    const result = await runCli(dir, [fixture.jobId]);
    assertSuccess(result, "published");
    const readme = readFileSync(resolve(dir, "README.md"), "utf8");
    assert(!readme.includes("https://evil.example"), "hostile link survived");
    assert(!readme.includes("../escape.md"), "traversal link survived");
    assert(!readme.includes("a|b"), "raw hostile pipe survived");
    assert(readme.includes("AI \\| trends with \\[bad\\]\\(evil\\)"), "current topic was not escaped");
    for (const row of readme.split("\n").filter((line) => line.startsWith("| 2026-W47"))) {
      assert(splitUnescapedPipes(row).length === 10, `current row column count drifted: ${row}`);
    }
    return ["Current fields are escaped and a hostile pre-existing managed row is dropped/normalized, not preserved raw."];
  } finally {
    fixture.close();
  }
}

async function noMutation(dir: string): Promise<string[]> {
  const successFixture = createPublishedFixture(resolve(dir, "success"), {});
  try {
    await assertNoMutationProbe(resolve(dir, "success"), successFixture, "published");
    await assertNoMutationProbe(resolve(dir, "success"), successFixture, "idempotent");
  } finally {
    successFixture.close();
  }

  const failureDir = resolve(dir, "failure");
  mkdirSync(failureDir, { recursive: true });
  const failureFixture = createPublishedFixture(failureDir, { manifestPatch: { aggregate_sha256: "a".repeat(64) } });
  try {
    const beforeJob = stableJson(findJobById(failureFixture.db, failureFixture.jobId));
    const beforeEvents = stableJson(findEventsByJob(failureFixture.db, failureFixture.jobId));
    const beforeSource = treeSnapshot(failureFixture.sourceRoot);
    const result = await runCli(failureDir, [failureFixture.jobId]);
    assertFailurePrefix(result, "PUBLISH_MANIFEST_INVALID:");
    assert(stableJson(findJobById(failureFixture.db, failureFixture.jobId)) === beforeJob, "failure job row mutated");
    assert(stableJson(findEventsByJob(failureFixture.db, failureFixture.jobId)) === beforeEvents, "failure events mutated");
    assert(treeSnapshot(failureFixture.sourceRoot) === beforeSource, "failure source tree mutated");
    assert(readmeTempFiles(failureDir).length === 0, "failure left temp README");
  } finally {
    failureFixture.close();
  }
  return [
    "Success and idempotent paths leave jobs/events and source trees byte-identical.",
    "Failure path leaves jobs/events/source tree unchanged and leaves no temp README files.",
  ];
}

function boundaryStaticCheck(): string[] {
  const changed = changedFilesForCurrentCycle(repoRoot);
  const readmeChanged = changed.filter((file) => slice424ReadmeScope.has(file));
  const scopeMode = assertCycleScopePolicy({
    changed: readmeChanged,
    activeTriggerFiles: slice424ReadmeScope,
    activeScope: slice424ReadmeScope,
    activeFrozenFiles: [
      "README.md",
      "PLAN.md",
      "src/lib/publish-destination.ts",
      "src/bin/report-deliver-local.ts",
      "src/bin/report-delivery-status.ts",
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
      "AGENTS.md",
      "ROLE_POSITIONING.md",
      "TODOS.md",
      "docs/process/operating-model.md",
    ],
    activeFrozenDirectories: [
      "src/pipeline/",
      "src/telegram/",
      "src/migrations/",
      "src/llm/",
      "src/prompts/",
      "src/preflight.ts",
      ".omx/memory-edit/",
    ],
  });
  assert(scopeMode === "active-slice", "report-publish-readme smoke should run in active-slice mode");

  const packageJson = JSON.parse(readRepoSource(repoRoot, "package.json")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert(packageJson.scripts?.["report:publish-readme"] === "bun src/bin/report-publish-readme.ts", "missing report:publish-readme script");
  assert(packageJson.scripts?.["report-publish-readme-smoke"] === "bun scripts/report-publish-readme-smoke.ts", "missing report-publish-readme-smoke script");
  assert(packageJson.dependencies === undefined, "package.json gained dependencies");
  assert(packageJson.devDependencies?.typescript === "^5.6.3", "typescript devDependency drifted");
  assert(packageJson.devDependencies?.["@types/bun"] === "^1.1.13", "@types/bun devDependency drifted");

  const cliSource = readRepoSource(repoRoot, "src/bin/report-publish-readme.ts");
  assertNoForbiddenPatterns(cliSource, [
    ...PROCESS_SPAWN_PATTERNS,
    ...TELEGRAM_SDK_NETWORK_PATTERNS,
    ...PROMPT_SURFACE_PATTERNS,
    ...GIT_POST_STEP_PATTERNS,
    [/\bfetch\s*\(|https?:\/\//, "network surface"],
    [/\bopenDb\b|\brunMigrations\b|\binsertJob\b|\binsertEvent\b|\bupdateJob\b|\bcasUpdateJob\b/, "mutating DB helper"],
    [/\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b|\bCREATE\s+TABLE\b|\bALTER\s+TABLE\b|\bDROP\s+TABLE\b|\bPRAGMA\b/i, "DB mutation SQL"],
    [/from\s+["'][^"']*report-create\.ts["']|from\s+["'][^"']*report-remind\.ts["']|from\s+["'][^"']*report-status\.ts["']|from\s+["'][^"']*report-show\.ts["']|from\s+["'][^"']*report-list\.ts["']|from\s+["'][^"']*report-run\.ts["']|from\s+["'][^"']*report-deliver-local\.ts["']|from\s+["'][^"']*report-delivery-status\.ts["']/, "other CLI import"],
    [/from\s+["'][^"']*\/telegram\//, "Telegram import"],
    [/\bpromoteJob\b|\bbuildGitCommitPlan\b/, "promote mutation helper"],
    [/from\s+["'][^"']*preflight\.ts["']|CodexCliProvider/, "preflight/Codex import"],
  ], "src/bin/report-publish-readme.ts");

  const destinationSource = readRepoSource(repoRoot, "src/lib/readme-publish-destination.ts");
  assertNoForbiddenPatterns(destinationSource, [
    ...PROCESS_SPAWN_PATTERNS,
    ...TELEGRAM_SDK_NETWORK_PATTERNS,
    ...PROMPT_SURFACE_PATTERNS,
    ...GIT_POST_STEP_PATTERNS,
    [/\bfetch\s*\(|https?:\/\//, "network surface"],
    [/\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b|\bCREATE\s+TABLE\b|\bALTER\s+TABLE\b|\bDROP\s+TABLE\b|\bPRAGMA\b/i, "DB mutation SQL"],
    [/from\s+["'][^"']*\/telegram\//, "Telegram import"],
    [/\bLocalFolderPublishDestination\b|\.delivery-receipt\.json|copyBundle|buildReceipt/, "local-delivery write/receipt surface"],
    [/\bpromoteJob\b|\bbuildGitCommitPlan\b/, "promote mutation helper"],
  ], "src/lib/readme-publish-destination.ts");

  let syntheticOutOfScopeRejected = false;
  try {
    assertCycleScopePolicy({
      changed: ["src/bin/report-publish-readme.ts", "README.md"],
      activeTriggerFiles: slice424ReadmeScope,
      activeScope: slice424ReadmeScope,
    });
  } catch (err) {
    syntheticOutOfScopeRejected = String(err).includes("changed files outside declared scope");
  }
  assert(syntheticOutOfScopeRejected, "synthetic README implementation diff was not rejected");

  return [
    `README boundary check ran in ${scopeMode} mode over changed README-publish files: ${readmeChanged.join(", ") || "<none>"}.`,
    `Full cycle changed files were observed separately for the authoritative bot-smoke boundary: ${changed.join(", ") || "<none>"}.`,
    "Synthetic active-slice scope check rejects a real README.md implementation diff.",
    "report-publish-readme.ts has no mutating DB helpers, DB write SQL, other CLI imports, network, Telegram, prompt/LLM, process, git, or preflight/Codex surface.",
    "readme-publish-destination.ts has no DB write SQL, network, Telegram, prompt/LLM, git post-step, or local-delivery receipt/write surface.",
  ];
}

async function assertNoMutationProbe(
  dir: string,
  fixture: Fixture,
  expectedStatus: "published" | "idempotent",
): Promise<void> {
  const beforeJob = stableJson(findJobById(fixture.db, fixture.jobId));
  const beforeEvents = stableJson(findEventsByJob(fixture.db, fixture.jobId));
  const beforeSource = treeSnapshot(fixture.sourceRoot);
  const result = await runCli(dir, [fixture.jobId]);
  assertSuccess(result, expectedStatus);
  assert(stableJson(findJobById(fixture.db, fixture.jobId)) === beforeJob, "job row mutated");
  assert(stableJson(findEventsByJob(fixture.db, fixture.jobId)) === beforeEvents, "events mutated");
  assert(treeSnapshot(fixture.sourceRoot) === beforeSource, "source tree mutated");
  assert(readmeTempFiles(dir).length === 0, "temp README files left behind");
}

async function runCli(
  dir: string,
  args: readonly string[],
  readmePath?: string,
): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runReportPublishReadmeCli({
    cwd: dir,
    args,
    readmePath,
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
  opts: Partial<FixtureOptions>,
): Fixture {
  const db = openDb(resolve(dir, ".data", "content.db"));
  const jobId = opts.jobId ?? "publish-readme-1";
  const attemptNumber = opts.attemptNumber ?? 1;
  const artifactDir = opts.artifactDir ?? "reports/2026-W47-ai-trends";
  const sourceRoot = resolve(dir, artifactDir);
  const files = opts.files ?? [
    "report.en.md",
    "sources.json",
    "source-material/context.md",
    "source-material/manifest.json",
    "source-material/operator/facts.md",
  ];
  for (const file of files) {
    const sourceFile = resolve(sourceRoot, file);
    mkdirSync(dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, `content for ${file}\n`, "utf8");
  }

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
    topic: opts.topic ?? "AI trends",
    attempt_number: attemptNumber,
    status: opts.status ?? "published",
    current_stage: opts.status === "awaiting_approval" ? "edit_en" : "published",
    artifact_dir: artifactDir,
    primary_report_path: opts.primaryReportPath === undefined
      ? `${artifactDir}/report.en.md`
      : opts.primaryReportPath,
    translated_report_path: opts.translatedReportPath ?? null,
    sources_path: opts.sourcesPath === undefined ? `${artifactDir}/sources.json` : opts.sourcesPath,
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

function promotedManifestFromPayload(payload: string | null | undefined): PublishManifest {
  assert(payload !== null && payload !== undefined, "promoted event payload missing");
  const parsed = JSON.parse(payload) as { publish_manifest?: PublishManifest };
  assert(parsed.publish_manifest !== undefined, "promoted event payload missing publish_manifest");
  return parsed.publish_manifest;
}

function assertManifestHashes(cwd: string, manifest: PublishManifest): void {
  for (const file of manifest.files) {
    const actual = shaFile(resolve(cwd, manifest.artifact_dir, file));
    assert(manifest.sha256[file] === actual, `manifest hash mismatch for ${file}`);
  }
  assert(
    aggregateFor(manifest.files, manifest.sha256) === manifest.aggregate_sha256,
    "manifest aggregate digest mismatch",
  );
}

function writePromoteAttemptBundle(
  cwd: string,
  opts: {
    readonly attemptNumber: number;
    readonly jobId: string;
    readonly weekKey: string;
  },
): void {
  const attemptDir = resolve(cwd, ".runs", opts.jobId, `attempt-${opts.attemptNumber}`);
  mkdirSync(attemptDir, { recursive: true });
  writeFileSync(
    resolve(attemptDir, "report.en.md"),
    `# Report EN\n\nSynthetic en report for ${opts.jobId} attempt ${opts.attemptNumber}.\n`,
    "utf8",
  );
  writeFileSync(
    resolve(attemptDir, "report.zh.md"),
    `# Report ZH\n\nSynthetic zh report for ${opts.jobId} attempt ${opts.attemptNumber}.\n`,
    "utf8",
  );
  writeFileSync(
    resolve(attemptDir, "sources.json"),
    `${JSON.stringify([{ title: "Local source", jobId: opts.jobId, attemptNumber: opts.attemptNumber }])}\n`,
    "utf8",
  );
  mkdirSync(resolve(attemptDir, "research"), { recursive: true });
  writeFileSync(resolve(attemptDir, "research", "brief.md"), `Brief for ${opts.jobId}\n`, "utf8");
  writeFileSync(resolve(attemptDir, "research", "notes.md"), `Notes for ${opts.jobId}\n`, "utf8");
  writePromoteSourceMaterialBundle(attemptDir, opts);
}

function writePromoteSourceMaterialBundle(
  attemptDir: string,
  opts: {
    readonly attemptNumber: number;
    readonly jobId: string;
    readonly weekKey: string;
  },
): void {
  const sourceMaterialDir = resolve(attemptDir, "source-material");
  const operatorDir = resolve(sourceMaterialDir, "operator");
  mkdirSync(operatorDir, { recursive: true });

  const operatorLocalPath = "source-material/operator/facts.md";
  const operatorContent = `Operator fact for ${opts.jobId} attempt ${opts.attemptNumber}.\n`;
  writeFileSync(resolve(operatorDir, "facts.md"), operatorContent, "utf8");

  const contextLocalPath = "source-material/context.md";
  const context = [
    `job_id: ${opts.jobId}`,
    `week_key: ${opts.weekKey}`,
    `attempt_number: ${opts.attemptNumber}`,
    "",
    "Operator fact: README publish composition smoke copied source material.",
    "",
  ].join("\n");
  writeFileSync(resolve(sourceMaterialDir, "context.md"), context, "utf8");

  const manifest = {
    schemaVersion: 1,
    kind: "research_source_material",
    jobId: opts.jobId,
    weekKey: opts.weekKey,
    topic: "AI trends composition",
    locales: ["en", "zh"],
    attemptNumber: opts.attemptNumber,
    generatedAt: "2026-05-19T00:00:00.000Z",
    sourceMaterialDir: "source-material",
    contextPath: contextLocalPath,
    operatorSource: {
      present: true,
      rootPath: `.data/source-material/${opts.jobId}`,
      totalByteCount: Buffer.byteLength(operatorContent, "utf8"),
      entries: [operatorLocalPath],
    },
    entries: [
      {
        id: "generated-job-context",
        kind: "generated_job_context",
        localPath: contextLocalPath,
        byteCount: Buffer.byteLength(context, "utf8"),
        sha256: shaText(context),
      },
      {
        id: "operator:facts.md",
        kind: "operator_source",
        sourcePath: `.data/source-material/${opts.jobId}/facts.md`,
        localPath: operatorLocalPath,
        byteCount: Buffer.byteLength(operatorContent, "utf8"),
        sha256: shaText(operatorContent),
      },
    ],
  };
  writeFileSync(
    resolve(sourceMaterialDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

function assertSuccess(result: CliResult, status: "published" | "idempotent"): void {
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(result.stderr === "", `success wrote stderr: ${result.stderr}`);
  assert(result.stdout.endsWith("\n"), "success stdout missing trailing newline");
  const record = parseRecord(result.stdout);
  assert(record.__label === "README_PUBLISH", `record label drifted: ${record.__label}`);
  assert(record.status === status, `status ${record.status} != ${status}`);
  assert(record.readme === "README.md", `readme field drifted: ${record.readme}`);
  assert(record.aggregate_sha256 !== undefined && /^[a-f0-9]{12}$/.test(record.aggregate_sha256), `aggregate field invalid: ${record.aggregate_sha256}`);
  assert(record.entries !== undefined && /^[0-9]+$/.test(record.entries), `entries field invalid: ${record.entries}`);
  assert(result.stdout.split("\n").length === 2, "stdout contains extra newline");
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

function readmeTempFiles(dir: string): string[] {
  return readdirSync(dir).filter((entry) => entry.startsWith(".README.md.tmp-")).sort();
}

function splitUnescapedPipes(row: string): string[] {
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    if (char === "|" && row[index - 1] !== "\\") {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  mkdirSync(dirname(docPath), { recursive: true });
  const passed = outcomes.filter((outcome) => outcome.status === "PASS").length;
  const lines = [
    "# report-publish-readme smoke evidence",
    "",
    "- Command: `bun run report-publish-readme-smoke`",
    `- Started: ${outcomes[0]?.startedAtIso ?? new Date().toISOString()}`,
    `- Finished: ${outcomes.at(-1)?.finishedAtIso ?? new Date().toISOString()}`,
    `- Scenario root: ${smokeRoot} (removed by finally-cleanup)`,
    `- Result: ${passed}/${outcomes.length} PASS`,
    "",
    "This smoke exercises the `report:publish-readme` README destination only. It does not run operator-only `bun run report:run`, real Codex report generation, real Telegram network, real git/process execution, Gateway/Market/Notion/X delivery, DB migrations beyond scenario setup, or preflight.",
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

function malformedManifestPatch(value: Record<string, unknown>): Partial<PublishManifest> {
  return value as unknown as Partial<PublishManifest>;
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const exitCode = await main();
process.exit(exitCode);
