import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
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
  insertJob,
  openDb,
  type DbClient,
  type Event,
} from "../src/db.ts";
import { FakeImageProvider } from "../src/llm/image-fake.ts";
import { handleApproveCommand } from "../src/telegram/commands.ts";
import type { GitCommitPlan, PublishManifest } from "../src/promote.ts";
import type { ImageSpec } from "../src/pipeline/image/spec.ts";
import type { JudgeVerdict } from "../src/pipeline/image/verdict.ts";
import {
  assertCycleScopePolicy,
  changedFilesAgainstBase,
  PROCESS_SPAWN_PATTERNS,
  PROMPT_SURFACE_PATTERNS,
  readRepoSource,
} from "./lib/static-guardrails.ts";

type ScenarioName =
  | "image-approve-publishes-gallery"
  | "image-approve-idempotent"
  | "image-approve-gallery-failure-self-heals"
  | "image-approve-validation-excluded"
  | "image-approve-purpose-fail-closed"
  | "image-approve-source-validation"
  | "image-approve-divergence-refused"
  | "image-gallery-row-sanitizes-prompt"
  | "image-gallery-managed-region-fail-closed"
  | "image-approve-git-failure-nonblocking"
  | "static-boundary";

interface ScenarioOutcome {
  readonly name: ScenarioName;
  readonly status: "PASS" | "FAIL";
  readonly details: readonly string[];
  readonly startedAtIso: string;
  readonly finishedAtIso: string;
}

const SCENARIOS: readonly ScenarioName[] = [
  "image-approve-publishes-gallery",
  "image-approve-idempotent",
  "image-approve-gallery-failure-self-heals",
  "image-approve-validation-excluded",
  "image-approve-purpose-fail-closed",
  "image-approve-source-validation",
  "image-approve-divergence-refused",
  "image-gallery-row-sanitizes-prompt",
  "image-gallery-managed-region-fail-closed",
  "image-approve-git-failure-nonblocking",
  "static-boundary",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = path.join(
  tmpdir(),
  `cz-image-publish-smoke-${new Date().toISOString().replaceAll(":", "-")}`,
);
const docPath = resolve(repoRoot, "docs", "preflight", "image-publish-smoke.md");
const implementationAnchor = "2deb95bfcd865b565fd80fca22b41947cc87b207";
const fixedNow = 1_800_100_000;
const exactImageFiles = ["image.png", "request.txt", "spec.json", "verdict.json"] as const;
const imageGalleryStart = "<!-- content-zoe:image-gallery:start -->";
const imageGalleryEnd = "<!-- content-zoe:image-gallery:end -->";
const reportStart = "<!-- content-zoe:published-reports:start -->";
const reportEnd = "<!-- content-zoe:published-reports:end -->";

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
    for (const detail of outcome.details) console.log(`  - ${detail}`);
  }
  const passed = outcomes.filter((outcome) => outcome.status === "PASS").length;
  console.log(`${passed}/${outcomes.length} PASS`);
  return passed === outcomes.length ? 0 : 1;
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
    case "image-approve-publishes-gallery":
      return imageApprovePublishesGallery(dir);
    case "image-approve-idempotent":
      return imageApproveIdempotent(dir);
    case "image-approve-gallery-failure-self-heals":
      return imageApproveGalleryFailureSelfHeals(dir);
    case "image-approve-validation-excluded":
      return imageApproveValidationExcluded(dir);
    case "image-approve-purpose-fail-closed":
      return imageApprovePurposeFailClosed(dir);
    case "image-approve-source-validation":
      return imageApproveSourceValidation(dir);
    case "image-approve-divergence-refused":
      return imageApproveDivergenceRefused(dir);
    case "image-gallery-row-sanitizes-prompt":
      return imageGalleryRowSanitizesPrompt(dir);
    case "image-gallery-managed-region-fail-closed":
      return imageGalleryManagedRegionFailClosed(dir);
    case "image-approve-git-failure-nonblocking":
      return imageApproveGitFailureNonblocking(dir);
    case "static-boundary":
      return staticBoundary();
  }
}

async function imageApprovePublishesGallery(dir: string): Promise<string[]> {
  const fixture = await seedImageFixture(dir, "img-publish-gallery", "production");
  const plans: GitCommitPlan[] = [];
  try {
    writeFileSync(
      resolve(dir, "README.md"),
      `# Test\n\n${reportStart}\n| Week | Topic | Job | Report | Sources | Source Material | Aggregate | Updated |\n|---|---|---|---|---|---|---|---|\n${reportEnd}\n`,
    );
    const result = await approve(dir, fixture.db, fixture.jobId, { plans });
    assert(result.status === "published", `expected published, got ${result.status}`);
    assertImagePublishShape(dir, fixture.db, fixture.jobId);
    const readme = readFileSync(resolve(dir, "README.md"), "utf8");
    assert(readme.includes(imageGalleryStart), "README missing image gallery start marker");
    assert(readme.includes("[image](images/img-publish-gallery/image.png)"), "README missing image link");
    assert(readme.includes("[spec](images/img-publish-gallery/spec.json)"), "README missing spec link");
    assert(readme.includes(reportStart) && readme.includes(reportEnd), "report README region was not preserved");
    assert(plans.length === 1, "expected one git plan");
    assert(planHasPath(plans[0], "images/img-publish-gallery/"), "production plan missing image dir");
    assert(planHasPath(plans[0], "README.md"), "production plan missing README.md");
    return [
      "Image approve published exactly the public four-file bundle under images/<jobId>/.",
      "DB row and promoted event carry a manifest matching published bytes.",
      "README gallery row was inserted without disturbing the report managed region.",
    ];
  } finally {
    fixture.close();
  }
}

async function imageApproveIdempotent(dir: string): Promise<string[]> {
  const fixture = await seedImageFixture(dir, "img-idempotent", "production");
  try {
    await approve(dir, fixture.db, fixture.jobId);
    const readmeBefore = readFileSync(resolve(dir, "README.md"), "utf8");
    const result = await approve(dir, fixture.db, fixture.jobId);
    const readmeAfter = readFileSync(resolve(dir, "README.md"), "utf8");
    assert(result.status === "idempotent", `expected idempotent, got ${result.status}`);
    assert(promotedEvents(fixture.db, fixture.jobId).length === 1, "idempotent approve wrote another promoted event");
    assert(readmeBefore === readmeAfter, "idempotent approve changed README bytes");
    return ["Re-approve trusts the existing promoted manifest and leaves README bytes stable."];
  } finally {
    fixture.close();
  }
}

async function imageApproveGalleryFailureSelfHeals(dir: string): Promise<string[]> {
  const fixture = await seedImageFixture(dir, "img-gallery-self-heal", "production");
  let failGallery = true;
  try {
    const first = await approve(dir, fixture.db, fixture.jobId, {
      hooks: {
        beforeImageGalleryWrite: () => {
          if (failGallery) throw new Error("synthetic gallery failure");
        },
      },
    });
    assert(first.status === "published", "gallery failure rolled back publish");
    assert(first.publishResult?.galleryUpdateFailed !== undefined, "gallery failure not surfaced");
    assert(
      findEventsByJob(fixture.db, fixture.jobId, "image_gallery_update_failed").length === 1,
      "gallery failure event not recorded",
    );
    failGallery = false;
    const second = await approve(dir, fixture.db, fixture.jobId, {
      hooks: { beforeImageGalleryWrite: () => undefined },
    });
    assert(second.status === "idempotent", `expected idempotent self-heal, got ${second.status}`);
    assert(promotedEvents(fixture.db, fixture.jobId).length === 1, "self-heal wrote another promoted event");
    assert(
      readFileSync(resolve(dir, "README.md"), "utf8").includes("[image](images/img-gallery-self-heal/image.png)"),
      "self-heal did not write gallery row",
    );
    return [
      "Post-publish gallery failure records image_gallery_update_failed without rollback.",
      "Re-approve self-heals README without a second promoted event.",
    ];
  } finally {
    fixture.close();
  }
}

async function imageApproveValidationExcluded(dir: string): Promise<string[]> {
  const fixture = await seedImageFixture(dir, "img-validation", "validation");
  const plans: GitCommitPlan[] = [];
  try {
    writeFileSync(
      resolve(dir, "README.md"),
      `# Test\n\n${imageGalleryStart}\n| Created | Prompt | Image | Spec | Aggregate |\n|---|---|---|---|---|\n| 2027-01-01T00:00:00.000Z | stale | [image](images/img-validation/image.png) | [spec](images/img-validation/spec.json) | 000000000000 |\n${imageGalleryEnd}\n`,
    );
    await approve(dir, fixture.db, fixture.jobId, { plans });
    const readme = readFileSync(resolve(dir, "README.md"), "utf8");
    assert(existsSync(resolve(dir, "images", fixture.jobId, "image.png")), "validation image did not publish");
    assert(!readme.includes("img-validation/image.png"), "validation row was not removed");
    assert(plans.length === 1, "expected one validation git plan");
    assert(planHasPath(plans[0], "images/img-validation/"), "validation plan missing image dir");
    assert(!planHasPath(plans[0], "README.md"), "validation plan should not include README.md");
    return ["Validation image artifacts publish, while gallery rows are excluded and stale rows self-heal away."];
  } finally {
    fixture.close();
  }
}

async function imageApprovePurposeFailClosed(dir: string): Promise<string[]> {
  for (const [jobId, purpose] of [
    ["img-null-purpose", null],
    ["img-invalid-purpose", "draft"],
  ] as const) {
    const caseDir = resolve(dir, jobId);
    const fixture = await seedImageFixture(caseDir, jobId, "production");
    try {
      if (purpose !== null) fixture.db.exec("PRAGMA ignore_check_constraints = ON");
      fixture.db.query("UPDATE jobs SET purpose = ? WHERE id = ?").run(purpose, jobId);
      if (purpose !== null) fixture.db.exec("PRAGMA ignore_check_constraints = OFF");
      const result = await approve(caseDir, fixture.db, jobId);
      assert(result.status === "error", `${jobId} did not fail closed`);
      assert(!existsSync(resolve(caseDir, "images")), `${jobId} wrote image artifacts`);
      assert(findJobById(fixture.db, jobId)?.status === "awaiting_approval", `${jobId} published unexpectedly`);
      assert(promotedEvents(fixture.db, jobId).length === 0, `${jobId} wrote promoted event`);
    } finally {
      fixture.close();
    }
  }
  return ["Current image job purpose must be production or validation before publish mutates anything."];
}

async function imageApproveSourceValidation(dir: string): Promise<string[]> {
  const cases: readonly [string, (attemptDir: string) => void | Promise<void>][] = [
    ["missing-image", (attemptDir) => rmSync(resolve(attemptDir, "image.png"))],
    ["symlink-spec", (attemptDir) => {
      rmSync(resolve(attemptDir, "spec.json"));
      symlinkSync("request.txt", resolve(attemptDir, "spec.json"));
    }],
    ["invalid-spec-shape", (attemptDir) => writeFileSync(resolve(attemptDir, "spec.json"), "{}\n")],
    ["invalid-verdict-shape", (attemptDir) => writeFileSync(resolve(attemptDir, "verdict.json"), "{}\n")],
    ["criterion-mismatch", (attemptDir) => {
      const verdict = baseVerdict();
      verdict.criteria[0] = { ...verdict.criteria[0], id: "wrong-id" };
      writeJson(resolve(attemptDir, "verdict.json"), verdict);
    }],
    ["failed-verdict", (attemptDir) => writeJson(resolve(attemptDir, "verdict.json"), failingVerdict())],
    ["non-png", (attemptDir) => writeFileSync(resolve(attemptDir, "image.png"), "not a png")],
    ["dimension-mismatch", async (attemptDir) => {
      const spec = baseSpec({ w: 1536, h: 1024 });
      writeJson(resolve(attemptDir, "spec.json"), spec);
      await new FakeImageProvider().generate(baseSpec(), resolve(attemptDir, "image.png"), 900_000);
    }],
  ];

  for (const [name, mutate] of cases) {
    const jobId = `img-source-${name}`;
    const caseDir = resolve(dir, name);
    const fixture = await seedImageFixture(caseDir, jobId, "production");
    try {
      await mutate(resolve(caseDir, ".runs", jobId, "attempt-1"));
      const result = await approve(caseDir, fixture.db, jobId);
      assert(result.status === "error", `${name} did not fail`);
      assert(findJobById(fixture.db, jobId)?.status === "awaiting_approval", `${name} mutated DB status`);
      assert(promotedEvents(fixture.db, jobId).length === 0, `${name} wrote promoted event`);
      assert(!existsSync(resolve(caseDir, "README.md")), `${name} mutated README`);
      assert(existsSync(resolve(caseDir, ".runs", jobId, "attempt-1")), `${name} removed source attempt`);
    } finally {
      fixture.close();
    }
  }
  return ["Image source validation rejects missing/symlinked/malformed/mismatched/failed inputs before mutation."];
}

async function imageApproveDivergenceRefused(dir: string): Promise<string[]> {
  const fixture = await seedImageFixture(dir, "img-divergence", "production");
  try {
    const divergent = resolve(dir, "images", fixture.jobId);
    mkdirSync(divergent, { recursive: true });
    writeFileSync(resolve(divergent, "image.png"), "divergent");
    writeFileSync(resolve(divergent, "request.txt"), "divergent");
    writeFileSync(resolve(divergent, "spec.json"), "{}");
    writeFileSync(resolve(divergent, "verdict.json"), "{}");
    const result = await approve(dir, fixture.db, fixture.jobId);
    assert(result.status === "error", "divergence did not fail");
    assert(result.code === "PUBLISH_ARTIFACT_DIVERGED", `wrong code: ${result.code}`);
    assert(findJobById(fixture.db, fixture.jobId)?.status === "awaiting_approval", "divergence published DB");
    assert(!existsSync(resolve(dir, "README.md")), "divergence mutated README");
    return ["Existing divergent image destination is refused before DB or README mutation."];
  } finally {
    fixture.close();
  }
}

async function imageGalleryRowSanitizesPrompt(dir: string): Promise<string[]> {
  const hostilePrompt = "A | prompt with [links](nope)\nsecond\tline \\" + " x".repeat(150);
  const fixture = await seedImageFixture(dir, "img-sanitize", "production", { prompt: hostilePrompt });
  try {
    await approve(dir, fixture.db, fixture.jobId);
    const readme = readFileSync(resolve(dir, "README.md"), "utf8");
    assert(readme.includes("\\|"), "prompt pipe was not escaped");
    assert(readme.includes("\\["), "prompt bracket was not escaped");
    assert(readme.includes("..."), "prompt was not truncated");
    const managed = readme.slice(readme.indexOf(imageGalleryStart), readme.indexOf(imageGalleryEnd));
    const rows = managed.split("\n").filter((line) => line.startsWith("|"));
    assert(rows.length === 3, `expected header, separator, one row; got ${rows.length}`);
    assert(!rows[2].includes("\nsecond"), "prompt newline leaked into table row");
    return ["Prompt cell sanitization escapes markdown delimiters and truncates long text deterministically."];
  } finally {
    fixture.close();
  }
}

async function imageGalleryManagedRegionFailClosed(dir: string): Promise<string[]> {
  const fixtures = [
    ["duplicate-marker", `${imageGalleryStart}\n${imageGalleryStart}\n${imageGalleryEnd}\n`],
    ["reversed-marker", `${imageGalleryEnd}\n${imageGalleryStart}\n`],
    ["malformed-row", `${imageGalleryStart}\n| bad |\n${imageGalleryEnd}\n`],
    [
      "unsafe-link",
      `${imageGalleryStart}\n| Created | Prompt | Image | Spec | Aggregate |\n|---|---|---|---|---|\n| 2027-01-01T00:00:00.000Z | x | [image](../x/image.png) | [spec](images/img-region/spec.json) | 000000000000 |\n${imageGalleryEnd}\n`,
    ],
  ] as const;
  for (const [name, readme] of fixtures) {
    const caseDir = resolve(dir, name);
    const fixture = await seedImageFixture(caseDir, `img-region-${name}`, "production");
    try {
      writeFileSync(resolve(caseDir, "README.md"), readme);
      const before = readFileSync(resolve(caseDir, "README.md"), "utf8");
      const result = await approve(caseDir, fixture.db, fixture.jobId);
      assert(result.status === "published", `${name} rolled back DB publish`);
      assert(result.publishResult?.galleryUpdateFailed !== undefined, `${name} did not surface gallery failure`);
      assert(readFileSync(resolve(caseDir, "README.md"), "utf8") === before, `${name} mutated malformed README`);
    } finally {
      fixture.close();
    }
  }
  return ["Malformed gallery regions fail closed for README mutation while preserving the authoritative DB publish."];
}

async function imageApproveGitFailureNonblocking(dir: string): Promise<string[]> {
  const fixture = await seedImageFixture(dir, "img-git-failure", "production");
  try {
    const result = await approve(dir, fixture.db, fixture.jobId, {
      committer: () => {
        throw new Error("synthetic git failure");
      },
    });
    assert(result.status === "published", "git failure rolled back publish");
    assert(result.publishResult?.gitCommitFailed !== undefined, "git failure not surfaced");
    assert(findEventsByJob(fixture.db, fixture.jobId, "git_commit_failed").length === 1, "git failure event missing");
    return ["Git post-step failure records git_commit_failed and leaves the image published."];
  } finally {
    fixture.close();
  }
}

function staticBoundary(): string[] {
  const changed = changedFilesAgainstBase(repoRoot, implementationAnchor).filter(
    (file) =>
      !file.startsWith("reports/2026-W22-ai-trends/") &&
      !file.startsWith("reports/2026-W23-ai-trends/"),
  );
  const activeScope = new Set([
    "src/promote.ts",
    "src/lib/readme-image-gallery-destination.ts",
    "src/telegram/commands.ts",
    "scripts/image-publish-smoke.ts",
    "docs/preflight/image-publish-smoke.md",
    "scripts/bot-smoke.ts",
    "docs/preflight/bot-smoke.md",
    "package.json",
  ]);
  const mode = assertCycleScopePolicy({
    changed,
    activeTriggerFiles: activeScope,
    activeScope,
    activeFrozenFiles: [
      "src/db.ts",
      "src/bin/content-image-create.ts",
      "src/bin/content-image-run.ts",
      "src/bin/content-image-show.ts",
      "src/bin/report-run.ts",
      "src/lib/report-loop.ts",
      "src/lib/runtime-config.ts",
    ],
    activeFrozenDirectories: ["src/migrations/", "src/pipeline/", "src/llm/", "reports/"],
  });
  const promoteSource = readRepoSource(repoRoot, "src/promote.ts");
  assertNoRealProviderOrReportRunSurface(promoteSource, "src/promote.ts");
  return [`Static boundary ran in ${mode} mode over changed files: ${changed.join(", ") || "<none>"}.`];
}

async function seedImageFixture(
  cwd: string,
  jobId: string,
  purpose: "production" | "validation",
  options: { readonly prompt?: string } = {},
): Promise<{ db: DbClient; jobId: string; close: () => void }> {
  mkdirSync(cwd, { recursive: true });
  const db = openDb(resolve(cwd, ".data", "content.db"));
  insertJob(db, {
    id: jobId,
    week_key: "2027-W08",
    topic: "Image publish smoke",
    locales: "en",
    modality: "image",
    attempt_number: 1,
    status: "awaiting_approval",
    current_stage: "judge",
    purpose,
    created_at: fixedNow,
    updated_at: fixedNow,
  });
  await writeImageAttempt(cwd, jobId, options.prompt ?? "Draw a precise healthcare AI handoff card.");
  return { db, jobId, close: () => db.close() };
}

async function writeImageAttempt(
  cwd: string,
  jobId: string,
  prompt: string,
  spec = baseSpec(),
): Promise<void> {
  const attemptDir = resolve(cwd, ".runs", jobId, "attempt-1");
  mkdirSync(attemptDir, { recursive: true });
  writeFileSync(resolve(attemptDir, "request.txt"), `${prompt}\n`);
  writeJson(resolve(attemptDir, "spec.json"), spec);
  await new FakeImageProvider().generate(spec, resolve(attemptDir, "image.png"), 900_000);
  writeJson(resolve(attemptDir, "verdict.json"), baseVerdict(spec));
  writeFileSync(resolve(attemptDir, "run-state.json"), "{}\n");
}

async function approve(
  cwd: string,
  db: DbClient,
  jobId: string,
  options: {
    readonly plans?: GitCommitPlan[];
    readonly hooks?: Parameters<typeof handleApproveCommand>[0]["publishHooks"];
    readonly committer?: (plan: GitCommitPlan) => Promise<void> | void;
  } = {},
) {
  const replies: string[] = [];
  return handleApproveCommand({
    db,
    text: `/approve ${jobId} 1`,
    chatId: 123,
    operatorChatIds: [123],
    cwd,
    now: () => fixedNow + 1,
    reply: (text) => {
      replies.push(text);
    },
    publishHooks: options.hooks,
    committer: options.committer ?? ((plan) => {
      options.plans?.push(plan);
    }),
  });
}

function assertImagePublishShape(cwd: string, db: DbClient, jobId: string): void {
  const job = findJobById(db, jobId);
  assert(job !== null, "job missing");
  assert(job.status === "published", `expected published, got ${job.status}`);
  assert(job.artifact_dir === `images/${jobId}`, `unexpected artifact_dir: ${job.artifact_dir}`);
  const files = readdirSync(resolve(cwd, "images", jobId)).sort();
  assert(JSON.stringify(files) === JSON.stringify(exactImageFiles), `unexpected image files: ${files.join(",")}`);
  const events = promotedEvents(db, jobId);
  assert(events.length === 1, `expected one promoted event, got ${events.length}`);
  const manifest = promotedManifest(events[0]);
  assert(JSON.stringify(manifest.files) === JSON.stringify(exactImageFiles), "manifest file set is not exact");
  assert(manifest.aggregate_sha256 === aggregateForManifest(cwd, manifest), "manifest aggregate mismatch");
}

function baseSpec(dimensions = { w: 1024, h: 1024 }): ImageSpec {
  return {
    promptOriginal: "Draw a precise healthcare AI handoff card.",
    subject: "A healthcare AI governance handoff note",
    style: "clean editorial illustration",
    composition: "single centered document with visible checklist",
    palette: ["blue", "white", "green"],
    dimensions,
    negativeConstraints: ["no logos", "no real patient faces"],
    safetyProfile: "standard",
    acceptanceCriteria: [
      { id: "subject-visible", description: "The handoff note is visually dominant.", tier: "judged" },
      { id: "safe-healthcare", description: "The image avoids unsafe medical advice.", tier: "judged" },
    ],
  };
}

function baseVerdict(spec = baseSpec()): JudgeVerdict {
  return {
    overallPass: true,
    criteria: spec.acceptanceCriteria.map((criterion) => ({
      id: criterion.id,
      pass: true,
      rationale: "ok",
    })),
  };
}

function failingVerdict(): JudgeVerdict {
  return {
    overallPass: false,
    criteria: [
      { id: "subject-visible", pass: false, rationale: "missing" },
      { id: "safe-healthcare", pass: true, rationale: "safe" },
    ],
    regenerateFeedback: "make the subject visible",
  };
}

function promotedEvents(db: DbClient, jobId: string): Event[] {
  return findEventsByJob(db, jobId, "promoted");
}

function promotedManifest(event: Event): PublishManifest {
  const payload = JSON.parse(event.payload ?? "{}") as { publish_manifest?: PublishManifest };
  assert(payload.publish_manifest !== undefined, "promoted payload missing manifest");
  return payload.publish_manifest;
}

function aggregateForManifest(cwd: string, manifest: PublishManifest): string {
  const root = resolve(cwd, manifest.artifact_dir);
  const sha256: Record<string, string> = {};
  for (const file of manifest.files) {
    sha256[file] = createHash("sha256").update(readFileSync(resolve(root, file))).digest("hex");
  }
  return createHash("sha256")
    .update(JSON.stringify(manifest.files.map((file) => [file, sha256[file]])))
    .digest("hex");
}

function planHasPath(plan: GitCommitPlan, value: string): boolean {
  return plan.commands.some((command) => command.includes(value));
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function assertNoRealProviderOrReportRunSurface(source: string, subject: string): void {
  const stripped = source
    .replaceAll("src/llm/image-fake.ts", "STATIC_ALLOWED")
    .replaceAll("src/pipeline/image/spec.ts", "STATIC_ALLOWED")
    .replaceAll("src/pipeline/image/verdict.ts", "STATIC_ALLOWED");
  for (const [pattern, label] of [...PROMPT_SURFACE_PATTERNS, ...PROCESS_SPAWN_PATTERNS]) {
    assert(!pattern.test(stripped), `${subject} contains forbidden ${label}`);
  }
  assert(!/report:run|src\/bin\/report-run|content:image-run/.test(stripped), `${subject} touched operator run surface`);
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  mkdirSync(dirname(docPath), { recursive: true });
  const passed = outcomes.filter((outcome) => outcome.status === "PASS").length;
  const lines = [
    "# image-publish-smoke",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Result: ${passed}/${outcomes.length} PASS`,
    "",
    "| Scenario | Status | Details |",
    "|---|---|---|",
    ...outcomes.map((outcome) =>
      `| ${outcome.name} | ${outcome.status} | ${outcome.details.map(escapeTableCell).join("<br>")} |`,
    ),
    "",
  ];
  writeFileSync(docPath, lines.join("\n"));
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, "<br>").slice(0, 500);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const exitCode = await main();
process.exit(exitCode);
