import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findEventsByJob,
  findJobById,
  insertJob,
  openDb,
  updateJob,
  type DbClient,
} from "../src/db.ts";
import {
  createImageJob,
  runContentImageCreateCli,
} from "../src/bin/content-image-create.ts";
import {
  createImageDbLifecycleHooks,
  parseProviderPlan,
  runContentImageRunCli,
} from "../src/bin/content-image-run.ts";
import { runContentImageShowCli } from "../src/bin/content-image-show.ts";
import {
  createImagePipelineFakes,
  failingVerdict,
  passingVerdict,
} from "../src/lib/image-run-fake-provider.ts";
import { runReportLoop } from "../src/lib/report-loop.ts";
import { notifyPendingApprovals } from "../src/telegram/notifier.ts";
import { IMAGE_MAX_REGEN_ROUNDS, IMAGE_STAGE, Modality } from "../src/pipeline/modality.ts";

type ScenarioName =
  | "create-deterministic"
  | "duplicate-key"
  | "fake-run-awaiting-approval"
  | "show-artifacts"
  | "regen-event-payload"
  | "auto-gate-event-payload"
  | "reject-carry-forward"
  | "resume-no-mutation"
  | "mixed-provider-fail-closed"
  | "google-provider-plan"
  | "static-boundary";

interface ScenarioOutcome {
  name: ScenarioName;
  status: "PASS" | "FAIL";
  details: string[];
  startedAtIso: string;
  finishedAtIso: string;
}

const SCENARIOS: readonly ScenarioName[] = [
  "create-deterministic",
  "duplicate-key",
  "fake-run-awaiting-approval",
  "show-artifacts",
  "regen-event-payload",
  "auto-gate-event-payload",
  "reject-carry-forward",
  "resume-no-mutation",
  "mixed-provider-fail-closed",
  "google-provider-plan",
  "static-boundary",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = resolve(
  repoRoot,
  ".runs",
  "content-image-cli-smoke",
  new Date().toISOString().replaceAll(":", "-"),
);
const docPath = resolve(repoRoot, "docs", "preflight", "content-image-cli-smoke.md");
const implementationAnchor = "0909a7bcddb71b90d430c76de13b629264d4302a";
const implementationRangeEnd = "24fcb93eb5703ca60c4f22bbdf3ff85d074145e2";
const fakeEnv = {
  LLM_PROVIDER: "fake",
  IMAGE_PROVIDER: "fake",
  VISION_JUDGE_PROVIDER: "fake",
};

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
    removeEmptyDir(resolve(repoRoot, ".runs", "content-image-cli-smoke"));
    removeEmptyDir(resolve(repoRoot, ".runs"));
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
  try {
    const details = await scenarioImpl(name, resolve(smokeRoot, name));
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
      details: [formatError(err)],
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
    };
  }
}

async function scenarioImpl(
  name: ScenarioName,
  cwd: string,
): Promise<string[]> {
  mkdirSync(cwd, { recursive: true });
  switch (name) {
    case "create-deterministic":
      return createDeterministic(cwd);
    case "duplicate-key":
      return duplicateKey(cwd);
    case "fake-run-awaiting-approval":
      return fakeRunAwaitingApproval(cwd);
    case "show-artifacts":
      return showArtifacts(cwd);
    case "regen-event-payload":
      return regenEventPayload(cwd);
    case "auto-gate-event-payload":
      return autoGateEventPayload(cwd);
    case "reject-carry-forward":
      return rejectCarryForward(cwd);
    case "resume-no-mutation":
      return resumeNoMutation(cwd);
    case "mixed-provider-fail-closed":
      return mixedProviderFailClosed(cwd);
    case "google-provider-plan":
      return googleProviderPlan();
    case "static-boundary":
      return staticBoundary();
  }
}

async function createDeterministic(cwd: string): Promise<string[]> {
  let stdout = "";
  const code = await runContentImageCreateCli({
    argv: ["--prompt", "Draw a precise governance queue.", "--key", "20270101-010203"],
    cwd,
    now: fixedNow,
    writeStdout: (text) => {
      stdout += text;
    },
  });
  assert(code === 0, `expected exit 0, got ${code}`);
  assert(stdout.trim() === "img-20270101-010203", `unexpected stdout: ${stdout}`);
  assert(
    readFileSync(resolve(cwd, ".runs", "img-20270101-010203", "attempt-1", "request.txt"), "utf8") ===
      "Draw a precise governance queue.\n",
    "request.txt should contain the raw prompt plus newline",
  );
  return [
    "content:image-create produced deterministic img-20270101-010203.",
    "attempt-1/request.txt contains the raw prompt.",
  ];
}

async function duplicateKey(cwd: string): Promise<string[]> {
  createImageJob({
    cwd,
    args: { prompt: "First prompt", key: "dupe-key" },
    now: fixedNow,
  });
  let stderr = "";
  const code = await runContentImageCreateCli({
    argv: ["--prompt", "Second prompt", "--key", "dupe-key"],
    cwd,
    now: fixedNow,
    writeStderr: (text) => {
      stderr += text;
    },
  });
  assert(code === 1, `expected duplicate exit 1, got ${code}`);
  assert(stderr.includes("KEY_ALREADY_EXISTS"), `expected KEY_ALREADY_EXISTS, got ${stderr}`);
  return ["duplicate image key fails as KEY_ALREADY_EXISTS."];
}

async function fakeRunAwaitingApproval(cwd: string): Promise<string[]> {
  const jobId = createJob(cwd, "approval-flow", "Approval flow image");
  const run = await runImageCli(cwd, jobId);
  assert(run.code === 0, `expected run exit 0, got ${run.code}: ${run.stderr}`);
  const db = openDb(resolve(cwd, ".data", "content.db"));
  try {
    const job = findJobById(db, jobId);
    assert(job !== null, "job should exist");
    assert(job.status === "awaiting_approval", `expected awaiting_approval, got ${job.status}`);
    assert(job.approval_summary !== null && job.approval_summary.includes("content:image-show"), "approval_summary should contain show commands");
    assert(job.primary_report_path === null, "primary_report_path must stay null");
    assert(job.translated_report_path === null, "translated_report_path must stay null");
    assert(job.sources_path === null, "sources_path must stay null");
    const notifyResult = await notifyPendingApprovals({
      db,
      sender: () => undefined,
      now: () => 1_800_000_000,
      sleep: () => undefined,
    });
    assert(notifyResult.malformed === 0, "image approval summary should not be malformed");
    assert(notifyResult.sent === 1, "image approval should be notifier-sendable");
  } finally {
    db.close();
  }
  return [
    "fake content:image-run reached awaiting_approval.",
    "approval_summary is non-empty and notifier-compatible.",
    "report-specific artifact columns stayed null.",
  ];
}

async function showArtifacts(cwd: string): Promise<string[]> {
  const jobId = createJob(cwd, "show-flow", "Show flow image");
  await runImageCli(cwd, jobId);
  const request = await show(cwd, jobId, "request");
  const spec = await show(cwd, jobId, "spec");
  const verdict = await show(cwd, jobId, "verdict");
  const image = await show(cwd, jobId, "image");
  assert(request.stdout.includes("IMAGE_ARTIFACT"), "request output should be formatted");
  assert(spec.stdout.includes("spec.json"), "spec output should name spec.json");
  assert(verdict.stdout.includes("overallPass"), "verdict output should contain verdict JSON");
  assert(image.stdout.includes("sha256="), "image output should include sha256");
  assert(image.stdout.includes("dimensions=1024x1024"), "image output should include dimensions");
  assert(!image.stdout.includes("PNG\r\n"), "image output must not dump PNG bytes");
  return [
    "content:image-show prints request/spec/verdict text.",
    "image artifact prints metadata with sha256 and dimensions, not binary bytes.",
  ];
}

async function regenEventPayload(cwd: string): Promise<string[]> {
  const jobId = "img-regen-event";
  const runDir = seedDirectImageJob(cwd, jobId);
  const db = openDb(resolve(cwd, ".data", "content.db"));
  try {
    const fakes = createImagePipelineFakes({
      verdicts: [failingVerdict("tighten composition"), passingVerdict()],
    });
    const result = await runReportLoop({
      jobId,
      locales: ["en"],
      provider: fakes.provider,
      cwd,
      runDir,
      attemptNumber: 1,
      startStage: IMAGE_STAGE.ELABORATE_SPEC,
      modality: Modality.IMAGE,
      imageProvider: fakes.imageProvider,
      visionJudge: fakes.visionJudge,
      lifecycle: createImageDbLifecycleHooks({ db, cwd }),
    });
    assert(result.status === "awaiting_approval", `expected awaiting_approval, got ${result.status}`);
    const events = findEventsByJob(db, jobId, "image_regen");
    assert(events.length === 1, `expected one image_regen, got ${events.length}`);
    assert(
      events[0].payload === JSON.stringify({ regenRound: 1, fromStage: "generate" }),
      `unexpected image_regen payload: ${events[0].payload}`,
    );
  } finally {
    db.close();
  }
  return ["image_regen persisted exact payload keys { regenRound, fromStage }."];
}

async function autoGateEventPayload(cwd: string): Promise<string[]> {
  const jobId = "img-auto-gate";
  const runDir = seedDirectImageJob(cwd, jobId);
  const db = openDb(resolve(cwd, ".data", "content.db"));
  try {
    const fakes = createImagePipelineFakes({
      verdicts: Array.from({ length: IMAGE_MAX_REGEN_ROUNDS + 1 }, (_, index) =>
        failingVerdict(`round ${index + 1}`),
      ),
    });
    const result = await runReportLoop({
      jobId,
      locales: ["en"],
      provider: fakes.provider,
      cwd,
      runDir,
      attemptNumber: 1,
      startStage: IMAGE_STAGE.ELABORATE_SPEC,
      modality: Modality.IMAGE,
      imageProvider: fakes.imageProvider,
      visionJudge: fakes.visionJudge,
      lifecycle: createImageDbLifecycleHooks({ db, cwd }),
    });
    assert(result.status === "awaiting_approval", `expected awaiting_approval, got ${result.status}`);
    const events = findEventsByJob(db, jobId, "did_not_pass_auto_gate");
    assert(events.length === 1, `expected one auto-gate event, got ${events.length}`);
    assert(
      events[0].payload === JSON.stringify({ reason: "exhausted", regenRound: IMAGE_MAX_REGEN_ROUNDS }),
      `unexpected auto-gate payload: ${events[0].payload}`,
    );
  } finally {
    db.close();
  }
  return ["did_not_pass_auto_gate persisted exact payload keys { reason, regenRound }."];
}

async function rejectCarryForward(cwd: string): Promise<string[]> {
  const jobId = createJob(cwd, "carry-forward", "Carry forward image");
  await runImageCli(cwd, jobId);
  const db = openDb(resolve(cwd, ".data", "content.db"));
  try {
    updateJob(db, jobId, {
      status: "queued",
      attempt_number: 2,
      current_stage: IMAGE_STAGE.GENERATE,
      reject_scope: "image",
      reject_type: "subject_off",
      reject_reason: "subject too vague",
      approval_summary: null,
      notified_at: null,
      updated_at: 1_800_000_001,
    });
  } finally {
    db.close();
  }
  const run = await runImageCli(cwd, jobId);
  assert(run.code === 0, `expected run exit 0, got ${run.code}: ${run.stderr}`);
  assert(existsSync(resolve(cwd, ".runs", jobId, "attempt-2", "request.txt")), "attempt-2 request should be carried");
  assert(existsSync(resolve(cwd, ".runs", jobId, "attempt-2", "spec.json")), "attempt-2 spec should be carried");
  assert(existsSync(resolve(cwd, ".runs", jobId, "attempt-2", "image.png")), "attempt-2 image should be regenerated");
  return ["rejected image attempt carried request/spec forward before starting at generate."];
}

async function resumeNoMutation(cwd: string): Promise<string[]> {
  const jobId = createJob(cwd, "resume-stub", "Resume stub image");
  const before = snapshotJob(cwd, jobId);
  const attemptsBefore = listAttempts(cwd, jobId).join(",");
  const run = await runContentImageRunCli({
    argv: [jobId, "--resume"],
    cwd,
    env: fakeEnv,
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  });
  assert(run === 1, `expected resume stub exit 1, got ${run}`);
  assert(snapshotJob(cwd, jobId) === before, "resume stub must not mutate DB job");
  assert(listAttempts(cwd, jobId).join(",") === attemptsBefore, "resume stub must not create attempts");
  assert(!existsSync(resolve(cwd, ".runs", jobId, "attempt-1", "spec.json")), "resume stub must not construct providers or run stages");
  return ["--resume returns IMAGE_RESUME_NOT_IMPLEMENTED with no DB, attempt, or provider side effects."];
}

async function mixedProviderFailClosed(cwd: string): Promise<string[]> {
  const jobId = createJob(cwd, "mixed-provider", "Mixed provider image");
  const run = await runContentImageRunCli({
    argv: [jobId],
    cwd,
    env: {
      LLM_PROVIDER: "fake",
      IMAGE_PROVIDER: "openai",
      VISION_JUDGE_PROVIDER: "fake",
    },
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  });
  assert(run === 1, `expected mixed-provider exit 1, got ${run}`);
  assertThrows(
    () =>
      parseProviderPlan({
        LLM_PROVIDER: "fake",
        IMAGE_PROVIDER: "openai",
        VISION_JUDGE_PROVIDER: "fake",
      }),
    "mixed provider mode should be rejected by parser",
  );
  assert(!existsSync(resolve(cwd, ".runs", jobId, "attempt-1", "spec.json")), "mixed mode must fail before stage execution");
  return ["mixed fake/real provider mode fails before provider construction or stage execution."];
}

function googleProviderPlan(): string[] {
  const plan = parseProviderPlan({
    LLM_PROVIDER: "codex",
    IMAGE_PROVIDER: "google",
    VISION_JUDGE_PROVIDER: "google",
    IMAGE_PROVIDER_FALLBACK: "openai",
    VISION_JUDGE_PROVIDER_FALLBACK: "openai",
    GOOGLE_API_KEY: "google-key",
    OPENAI_API_KEY: "openai-key",
    IMAGE_MODEL: "nano-banana-2",
    VISION_JUDGE_MODEL: "gemini3.1-pro",
  }) as {
    imageProvider: string;
    visionJudgeProvider: string;
    imageFallbackProvider?: string;
    visionJudgeFallbackProvider?: string;
    imageModel?: string;
    visionJudgeModel?: string;
  };

  assert(plan.imageProvider === "google", "image provider should parse as google");
  assert(plan.visionJudgeProvider === "google", "vision judge provider should parse as google");
  assert(plan.imageFallbackProvider === "openai", "image fallback should parse as openai");
  assert(plan.visionJudgeFallbackProvider === "openai", "vision fallback should parse as openai");
  assert(plan.imageModel === "nano-banana-2", "image model should preserve operator value");
  assert(plan.visionJudgeModel === "gemini3.1-pro", "judge model should preserve operator value");

  assertThrowsProviderConfig(() =>
    parseProviderPlan({
      LLM_PROVIDER: "codex",
      IMAGE_PROVIDER: "google",
      VISION_JUDGE_PROVIDER: "google",
      IMAGE_PROVIDER_FALLBACK: "fake",
      GOOGLE_API_KEY: "google-key",
      VISION_JUDGE_MODEL: "gemini3.1-pro",
    }),
  );
  return ["Google primary plus explicit OpenAI fallback parses, while non-OpenAI fallback fails closed."];
}

function staticBoundary(): string[] {
  const tracked = splitGitLines(git(["diff", "--name-only", `${implementationAnchor}..${implementationRangeEnd}`, "--"]));
  const untracked = splitGitLines(git(["ls-files", "--others", "--exclude-standard"]));
  const preExistingUntrackedReportFiles = untracked.filter(isPreExistingUntrackedReportFile);
  const touched = [...new Set(tracked)].sort();
  const allowed = new Set([
    "package.json",
    "src/bin/content-image-create.ts",
    "src/bin/content-image-run.ts",
    "src/bin/content-image-show.ts",
    "src/lib/runtime-config.ts",
    "src/bin/content-image-run.ts",
    "scripts/content-image-cli-smoke.ts",
    "docs/preflight/content-image-cli-smoke.md",
    "scripts/bot-smoke.ts",
    "docs/preflight/bot-smoke.md",
    "docs/preflight/image-pipeline-smoke.md",
    "scripts/report-run-smoke.ts",
    "docs/preflight/report-run-smoke.md",
  ]);
  const unexpected = touched.filter((file) => !allowed.has(file));
  assert(unexpected.length === 0, `unexpected files in Slice 7b diff: ${unexpected.join(", ")}`);
  assert(
    untracked
      .filter((file) => file.startsWith("reports/"))
      .every(isPreExistingUntrackedReportFile),
    "unexpected untracked report files outside pre-existing W22/W23",
  );
  assert(!touched.includes("src/bin/report-run.ts"), "report-run.ts must remain untouched");
  assert(!touched.includes("src/promote.ts"), "promote.ts must remain untouched");
  return [
    `frozen diff from ${implementationAnchor.slice(0, 7)}..${implementationRangeEnd.slice(0, 7)} only touches declared Slice 7b files.`,
    `working-tree boundary saw ${untracked.length} untracked files and explicitly verified only the pre-existing W22/W23 report dirs are untracked reports.`,
    "No real provider smoke or Slice 8 publish files are part of the diff.",
  ];
}

function splitGitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isPreExistingUntrackedReportFile(file: string): boolean {
  return (
    file.startsWith("reports/2026-W22-ai-trends/") ||
    file.startsWith("reports/2026-W23-ai-trends/")
  );
}

function assertThrowsProviderConfig(fn: () => unknown): void {
  try {
    fn();
  } catch (err) {
    assert(
      err instanceof Error && err.message.includes("PROVIDER_CONFIG_INVALID"),
      `expected PROVIDER_CONFIG_INVALID, got ${formatError(err)}`,
    );
    return;
  }
  throw new Error("expected provider config failure");
}

function createJob(cwd: string, key: string, prompt: string): string {
  return createImageJob({
    cwd,
    args: { prompt, key },
    now: fixedNow,
  }).jobId;
}

async function runImageCli(cwd: string, jobId: string): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  let stdout = "";
  let stderr = "";
  const code = await runContentImageRunCli({
    argv: [jobId],
    cwd,
    env: fakeEnv,
    writeStdout: (text) => {
      stdout += text;
    },
    writeStderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

async function show(
  cwd: string,
  jobId: string,
  artifact: "request" | "spec" | "image" | "verdict",
): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await runContentImageShowCli({
    cwd,
    args: [jobId, "--artifact", artifact],
    writeStdout: (text) => {
      stdout += text;
    },
    writeStderr: (text) => {
      stderr += text;
    },
  });
  assert(code === 0, `show ${artifact} failed: ${stderr}`);
  return { code, stdout, stderr };
}

function seedDirectImageJob(cwd: string, jobId: string): string {
  const runDir = resolve(cwd, ".runs", jobId, "attempt-1");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(resolve(runDir, "request.txt"), "Direct loop request\n");
  const db = openDb(resolve(cwd, ".data", "content.db"));
  try {
    insertJob(db, {
      id: jobId,
      week_key: jobId,
      topic: "Direct loop image",
      locales: "en",
      modality: Modality.IMAGE,
      attempt_number: 1,
      status: "queued",
      purpose: "validation",
      current_stage: IMAGE_STAGE.ELABORATE_SPEC,
      run_dir: `.runs/${jobId}`,
      created_at: 1_800_000_000,
      updated_at: 1_800_000_000,
    });
  } finally {
    db.close();
  }
  return runDir;
}

function snapshotJob(cwd: string, jobId: string): string {
  const db = openDb(resolve(cwd, ".data", "content.db"));
  try {
    return JSON.stringify(findJobById(db, jobId));
  } finally {
    db.close();
  }
}

function listAttempts(cwd: string, jobId: string): string[] {
  const jobRoot = resolve(cwd, ".runs", jobId);
  if (!existsSync(jobRoot)) return [];
  return readdirSync(jobRoot)
    .filter((entry) => /^attempt-\d+$/.test(entry))
    .sort();
}

function fixedNow(): Date {
  return new Date("2027-01-01T01:02:03Z");
}

function git(args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  mkdirSync(dirname(docPath), { recursive: true });
  const passed = outcomes.filter((outcome) => outcome.status === "PASS").length;
  const rows = outcomes
    .map((outcome) => {
      const details = outcome.details.map((detail) => detail.replace(/\|/g, "\\|")).join("<br>");
      return `| ${outcome.name} | ${outcome.status} | ${details} |`;
    })
    .join("\n");
  writeFileSync(
    docPath,
    `# content-image-cli-smoke

Generated: ${new Date().toISOString()}

Result: ${passed}/${outcomes.length} PASS

| Scenario | Status | Details |
|---|---:|---|
${rows}
`,
  );
}

function removeEmptyDir(dir: string): void {
  try {
    if (existsSync(dir) && readdirSync(dir).length === 0) {
      rmSync(dir, { recursive: false });
    }
  } catch {
    // Best-effort cleanup only; smoke outcome is recorded before cleanup.
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(fn: () => unknown, message: string): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

if (import.meta.main) {
  process.exit(await main());
}
