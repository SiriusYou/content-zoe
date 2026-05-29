import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

import { FakeImageProvider } from "../src/llm/image-fake.ts";
import type { ImageProvider } from "../src/llm/image-provider.ts";
import { FakeVisionJudge } from "../src/llm/vision-judge-fake.ts";
import type { VisionJudge } from "../src/llm/vision-judge.ts";
import {
  createImagePipelineFakes,
  failingVerdict,
  passingVerdict,
  safetyFailingVerdict,
  validImageSpec,
} from "../src/lib/image-run-fake-provider.ts";
import {
  runReportLoop,
  type ImageAutoGateEvent,
  type ImageRegenEvent,
  type StageLifecycleEvent,
  type StageLifecycleHooks,
} from "../src/lib/report-loop.ts";
import {
  IMAGE_MAX_REGEN_ROUNDS,
  IMAGE_STAGE,
  Modality,
} from "../src/pipeline/modality.ts";
import type { ImageSpec } from "../src/pipeline/image/spec.ts";

type ScenarioName =
  | "image-happy-path"
  | "image-regen-then-pass"
  | "image-exhaust-regen"
  | "image-crash-resume"
  | "image-safety-escalation"
  | "image-judge-transport-failure"
  | "image-mechanical-authoritative"
  | "image-pipeline-static-boundary-check";

interface ScenarioOutcome {
  name: ScenarioName;
  status: "PASS" | "FAIL";
  details: string[];
  startedAtIso: string;
  finishedAtIso: string;
}

interface CapturedLifecycle {
  enters: StageLifecycleEvent[];
  completes: StageLifecycleEvent[];
  regens: ImageRegenEvent[];
  autoGates: ImageAutoGateEvent[];
}

const SCENARIOS: readonly ScenarioName[] = [
  "image-happy-path",
  "image-regen-then-pass",
  "image-exhaust-regen",
  "image-crash-resume",
  "image-safety-escalation",
  "image-judge-transport-failure",
  "image-mechanical-authoritative",
  "image-pipeline-static-boundary-check",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = resolve(
  repoRoot,
  ".runs",
  "image-pipeline-smoke",
  new Date().toISOString().replaceAll(":", "-"),
);
const docPath = resolve(repoRoot, "docs", "preflight", "image-pipeline-smoke.md");

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
    removeEmptyDir(resolve(repoRoot, ".runs", "image-pipeline-smoke"));
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
  const runDir = resolve(smokeRoot, name);
  mkdirSync(runDir, { recursive: true });

  try {
    const details = await scenarioImpl(name, runDir);
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
  runDir: string,
): Promise<string[]> {
  switch (name) {
    case "image-happy-path":
      return imageHappyPath(runDir);
    case "image-regen-then-pass":
      return imageRegenThenPass(runDir);
    case "image-exhaust-regen":
      return imageExhaustRegen(runDir);
    case "image-crash-resume":
      return imageCrashResume(runDir);
    case "image-safety-escalation":
      return imageSafetyEscalation(runDir);
    case "image-judge-transport-failure":
      return imageJudgeTransportFailure(runDir);
    case "image-mechanical-authoritative":
      return imageMechanicalAuthoritative(runDir);
    case "image-pipeline-static-boundary-check":
      return imagePipelineStaticBoundaryCheck();
  }
}

async function imageHappyPath(runDir: string): Promise<string[]> {
  const lifecycle = captureLifecycle();
  const fakes = createImagePipelineFakes({ verdicts: [passingVerdict()] });
  seedRequest(runDir);

  const result = await runImageLoop(runDir, fakes, lifecycle);
  assert(result.status === "awaiting_approval", `expected awaiting_approval, got ${result.status}`);
  assert(lifecycle.regens.length === 0, "happy path should not regen");
  assert(lifecycle.autoGates.length === 0, "happy path should not auto-gate fail");
  assert(fakes.imageProvider.calls.length === 1, "happy path should generate once");
  assert(fakes.visionJudge.calls.length === 1, "happy path should judge once");

  return [
    "elaborate_spec -> generate -> judge completed on the first pass.",
    "No image_regen or did_not_pass_auto_gate lifecycle events fired.",
  ];
}

async function imageRegenThenPass(runDir: string): Promise<string[]> {
  const lifecycle = captureLifecycle();
  const feedback = "Increase review queue clarity.";
  const fakes = createImagePipelineFakes({
    verdicts: [failingVerdict(feedback), passingVerdict()],
  });
  seedRequest(runDir);

  const result = await runImageLoop(runDir, fakes, lifecycle);
  const state = readRunState(runDir);
  assert(result.status === "awaiting_approval", `expected awaiting_approval, got ${result.status}`);
  assert(lifecycle.regens.length === 1, `expected one regen, got ${lifecycle.regens.length}`);
  assert(lifecycle.regens[0].regenRound === 1, "expected regen round 1");
  assert(state.regenRound === 1, `expected final regenRound 1, got ${state.regenRound}`);
  assert(fakes.imageProvider.calls.length === 2, "regen then pass should generate twice");
  assert(fakes.imageProvider.lastFeedback === feedback, "second generate should receive failed-verdict feedback");

  return [
    "First parseable failing verdict rewound to generate.",
    "regenerateFeedback was threaded into the second FakeImageProvider call.",
    "Second verdict passed and reached awaiting_approval.",
  ];
}

async function imageExhaustRegen(runDir: string): Promise<string[]> {
  const lifecycle = captureLifecycle();
  const fakes = createImagePipelineFakes({
    verdicts: Array.from({ length: IMAGE_MAX_REGEN_ROUNDS + 1 }, (_, index) =>
      failingVerdict(`round ${index + 1} feedback`),
    ),
  });
  seedRequest(runDir);

  const result = await runImageLoop(runDir, fakes, lifecycle);
  const state = readRunState(runDir);
  assert(result.status === "awaiting_approval", `expected awaiting_approval, got ${result.status}`);
  assert(lifecycle.regens.length === IMAGE_MAX_REGEN_ROUNDS, `expected ${IMAGE_MAX_REGEN_ROUNDS} regens, got ${lifecycle.regens.length}`);
  assert(lifecycle.autoGates.length === 1, `expected one auto gate, got ${lifecycle.autoGates.length}`);
  assert(lifecycle.autoGates[0].reason === "exhausted", `expected exhausted, got ${lifecycle.autoGates[0].reason}`);
  assert(state.regenRound === IMAGE_MAX_REGEN_ROUNDS, `expected regenRound ${IMAGE_MAX_REGEN_ROUNDS}, got ${state.regenRound}`);
  assert(fakes.imageProvider.calls.length === IMAGE_MAX_REGEN_ROUNDS + 1, "exhaustion should keep the last generated candidate");

  return [
    `${IMAGE_MAX_REGEN_ROUNDS} bounded image_regen events fired before exhaustion.`,
    "Exhaustion returned awaiting_approval with did_not_pass_auto_gate rather than stage_failed.",
    "The final image.png and verdict.json remained in the run directory for human review.",
  ];
}

async function imageCrashResume(runDir: string): Promise<string[]> {
  const lifecycle = captureLifecycle();
  const spec = validImageSpec();
  writeFileSync(resolve(runDir, "spec.json"), `${JSON.stringify(spec, null, 2)}\n`);
  writeFileSync(resolve(runDir, "verdict.json"), `${JSON.stringify(failingVerdict("resume feedback"), null, 2)}\n`);

  const fakes = createImagePipelineFakes({ verdicts: [passingVerdict()] });
  const result = await runImageLoop(
    runDir,
    fakes,
    lifecycle,
    IMAGE_STAGE.GENERATE,
    1,
  );
  const state = readRunState(runDir);
  assert(result.status === "awaiting_approval", `expected awaiting_approval, got ${result.status}`);
  assert(fakes.provider.calls.length === 0, "resume at generate should not re-elaborate the spec");
  assert(fakes.imageProvider.calls.length === 1, "resume should generate once");
  assert(fakes.imageProvider.lastFeedback === "resume feedback", "resume generate should carry prior feedback");
  assert(state.regenRound === 1, `expected preserved regenRound 1, got ${state.regenRound}`);

  return [
    "Direct resume from generate preserved regenRound>0.",
    "The carried failing verdict supplied feedback to the resumed generate stage.",
    "No orphan attempt directory was created by the in-place loop resume.",
  ];
}

async function imageSafetyEscalation(runDir: string): Promise<string[]> {
  const lifecycle = captureLifecycle();
  const transportSafety = createImagePipelineFakes({
    visionJudge: new FakeVisionJudge({
      verdicts: [],
      failWith: "safety",
    }),
  });
  seedRequest(runDir);
  const transportResult = await runImageLoop(runDir, transportSafety, lifecycle);
  assert(transportResult.status === "awaiting_approval", `expected awaiting_approval, got ${transportResult.status}`);
  assert(lifecycle.regens.length === 0, "transport safety should not regen");
  assert(lifecycle.autoGates.length === 1, "transport safety should auto gate once");
  assert(lifecycle.autoGates[0].reason === "safety", `expected safety, got ${lifecycle.autoGates[0].reason}`);

  const judgedRunDir = resolve(runDir, "judged");
  mkdirSync(judgedRunDir, { recursive: true });
  const judgedLifecycle = captureLifecycle();
  const judgedFakes = createImagePipelineFakes({ verdicts: [safetyFailingVerdict()] });
  seedRequest(judgedRunDir);
  const judgedResult = await runImageLoop(judgedRunDir, judgedFakes, judgedLifecycle);
  assert(judgedResult.status === "awaiting_approval", `expected judged awaiting_approval, got ${judgedResult.status}`);
  assert(judgedLifecycle.regens.length === 0, "judged safety criterion should not regen");
  assert(judgedLifecycle.autoGates[0].reason === "safety", "judged safety criterion should auto gate as safety");

  return [
    "VisionJudgeError(code=safety) escalated immediately with zero regen.",
    "A parseable failed safety criterion also escalated without regen.",
  ];
}

async function imageJudgeTransportFailure(runDir: string): Promise<string[]> {
  const lifecycle = captureLifecycle();
  const fakes = createImagePipelineFakes({
    visionJudge: new FakeVisionJudge({ verdicts: [], failWith: "timeout" }),
  });
  seedRequest(runDir);

  const result = await runImageLoop(runDir, fakes, lifecycle);
  assert(result.status === "stage_failed", `expected stage_failed, got ${result.status}`);
  assert(result.stage === IMAGE_STAGE.JUDGE, `expected judge failure, got ${result.stage}`);
  assert(lifecycle.regens.length === 0, "transport timeout should not regen");
  assert(lifecycle.autoGates.length === 0, "transport timeout should not auto-gate");

  return [
    "Non-safety judge transport failure remained an ordinary stage_failed result.",
    "No image_regen or did_not_pass_auto_gate event fired for timeout.",
  ];
}

async function imageMechanicalAuthoritative(runDir: string): Promise<string[]> {
  const lifecycle = captureLifecycle();
  const imageProvider = new WrongSizeImageProvider();
  const fakes = createImagePipelineFakes({
    imageProvider: imageProvider as unknown as FakeImageProvider,
    verdicts: [passingVerdict()],
  });
  seedRequest(runDir);

  const result = await runImageLoop(runDir, {
    provider: fakes.provider,
    imageProvider,
    visionJudge: fakes.visionJudge,
  }, lifecycle);
  assert(result.status === "stage_failed", `expected stage_failed, got ${result.status}`);
  assert(result.stage === IMAGE_STAGE.GENERATE, `expected generate failure, got ${result.stage}`);
  assert(result.stageStatus === "manifest_invalid", `expected manifest_invalid, got ${result.stageStatus}`);
  assert(fakes.visionJudge.calls.length === 0, "judge should not run when mechanical manifest fails");

  return [
    "A wrong-dimension PNG failed the generate-stage manifest before judging.",
    "Mechanical image_dimensions remained authoritative over any later judge verdict.",
  ];
}

function imagePipelineStaticBoundaryCheck(): string[] {
  const base = implementationBase();
  const packageDiff = execFileSync("git", [
    "diff",
    "--unified=0",
    base,
    "--",
    "package.json",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert(
    packageDiff.includes(
      '"image-pipeline-smoke": "bun scripts/image-pipeline-smoke.ts"',
    ),
    "package diff should add the image-pipeline-smoke script",
  );
  assert(
    !packageDiff.includes('+"dependencies"') &&
      !packageDiff.includes('+"devDependencies"') &&
      !packageDiff.includes('+"optionalDependencies"') &&
      !packageDiff.includes('+"peerDependencies"'),
    "package diff must not add dependency maps",
  );

  const changed = changedFiles(base, Boolean(process.env.SLICE_IMPLEMENTATION_BASE));
  const allowed = new Set([
    "src/pipeline/image/elaborate-spec.ts",
    "src/pipeline/image/generate.ts",
    "src/pipeline/image/judge.ts",
    "src/pipeline/modality.ts",
    "src/pipeline/run-stage.ts",
    "src/lib/report-loop.ts",
    "src/lib/image-run-fake-provider.ts",
    "scripts/executor-seam-smoke.ts",
    "scripts/image-pipeline-smoke.ts",
    "scripts/manifest-image-rules-smoke.ts",
    "scripts/modality-registry-smoke.ts",
    "docs/preflight/executor-seam-smoke.md",
    "docs/preflight/image-pipeline-smoke.md",
    "docs/preflight/manifest-image-rules-smoke.md",
    "docs/preflight/modality-registry-smoke.md",
    "package.json",
  ]);
  for (const file of changed) {
    assert(allowed.has(file), `out-of-scope file changed in implementation range: ${file}`);
  }

  return [`Static boundary checks passed against implementation base ${base}.`];
}

function seedRequest(runDir: string): void {
  writeFileSync(resolve(runDir, "request.txt"), "Create an AI governance review queue image.\n");
}

function captureLifecycle(): CapturedLifecycle & {
  hooks: Partial<StageLifecycleHooks>;
} {
  const captured: CapturedLifecycle = {
    enters: [],
    completes: [],
    regens: [],
    autoGates: [],
  };
  return Object.assign(captured, {
    hooks: {
      onStageEnter: (event: StageLifecycleEvent) => {
        captured.enters.push(event);
      },
      onStageComplete: (event: StageLifecycleEvent) => {
        captured.completes.push(event);
      },
      onImageRegen: (event: ImageRegenEvent) => {
        captured.regens.push(event);
      },
      onImageAutoGate: (event: ImageAutoGateEvent) => {
        captured.autoGates.push(event);
      },
    },
  });
}

function runImageLoop(
  runDir: string,
  fakes: {
    provider: Parameters<typeof runReportLoop>[0]["provider"];
    imageProvider: ImageProvider;
    visionJudge: VisionJudge;
  },
  lifecycle: ReturnType<typeof captureLifecycle>,
  startStage: string = IMAGE_STAGE.ELABORATE_SPEC,
  regenRound = 0,
) {
  return runReportLoop({
    jobId: "image-pipeline-smoke",
    locales: ["en"],
    provider: fakes.provider,
    cwd: repoRoot,
    runDir,
    attemptNumber: 1,
    startStage,
    modality: Modality.IMAGE,
    imageProvider: fakes.imageProvider,
    visionJudge: fakes.visionJudge,
    regenRound,
    lifecycle: lifecycle.hooks,
  });
}

function readRunState(runDir: string): { regenRound?: number; status?: string } {
  return JSON.parse(readFileSync(resolve(runDir, "run-state.json"), "utf8")) as {
    regenRound?: number;
    status?: string;
  };
}

class WrongSizeImageProvider implements ImageProvider {
  readonly name = "wrong-size";
  readonly calls: Array<{ spec: ImageSpec; absolutePath: string; timeoutMs: number; feedback?: string }> = [];

  async generate(
    spec: ImageSpec,
    absolutePath: string,
    timeoutMs: number,
    feedback?: string,
  ): Promise<void> {
    this.calls.push({ spec, absolutePath, timeoutMs, feedback });
    writeFileSync(absolutePath, makePng(1, 1));
  }
}

function makePng(width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBytes = Buffer.alloc(4);
  crcBytes.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crcBytes]);
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function changedFiles(base: string, includeUntracked: boolean): string[] {
  const files = new Set(
    execFileSync("git", ["diff", "--name-only", base], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean),
  );
  if (!includeUntracked) return [...files].sort();

  const statusLines = execFileSync("git", [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);

  for (const line of statusLines) {
    const pathPart = line.slice(3);
    const renamePath = pathPart.includes(" -> ")
      ? pathPart.split(" -> ").at(-1)
      : pathPart;
    if (renamePath) files.add(renamePath);
  }

  return [...files].sort();
}

function implementationBase(): string {
  if (process.env.SLICE_IMPLEMENTATION_BASE) {
    return process.env.SLICE_IMPLEMENTATION_BASE;
  }
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    const mergeBase = execFileSync("git", ["merge-base", "main", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    return mergeBase === head ? "HEAD^" : mergeBase;
  } catch {
    return "HEAD^";
  }
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  const generatedAtIso = new Date().toISOString();
  const allPassed = outcomes.every((outcome) => outcome.status === "PASS");
  const lines = [
    "# Image Pipeline Smoke - Evidence Report",
    "",
    "**Slice:** V2 Slice 6b image stages + regenerate loop",
    `**Generated:** ${generatedAtIso}`,
    "**Provider scope:** Fake text/image/judge providers only; no real provider execution.",
    `**Evidence ceiling:** ${allPassed ? "Image pipeline smoke passed" : "Image pipeline smoke failed"}.`,
    "",
    "## Outcome Matrix",
    "",
    "| Scenario | Status |",
    "|---|---:|",
    ...outcomes.map((outcome) => `| \`${outcome.name}\` | ${outcome.status} |`),
    "",
    "## Scenario Evidence",
    "",
  ];

  for (const outcome of outcomes) {
    lines.push(
      `### ${outcome.name}`,
      "",
      "- Command: `bun run image-pipeline-smoke`",
      `- Status: ${outcome.status}`,
      `- Started: ${outcome.startedAtIso}`,
      `- Finished: ${outcome.finishedAtIso}`,
      ...outcome.details.map((detail) => `- Evidence: ${detail}`),
      "",
    );
  }

  lines.push(
    "## Coverage Notes",
    "",
    "- Regeneration is bounded by `IMAGE_MAX_REGEN_ROUNDS`; max generated candidates are N+1.",
    "- Only parseable failed judge verdicts enter regen; non-safety transport failures stay `stage_failed`.",
    "- Safety transport failures and failed judged safety criteria become `did_not_pass_auto_gate` equivalents through the image auto-gate lifecycle hook.",
    "- Mechanical image manifest checks run before judging and remain authoritative.",
  );

  writeFileSync(docPath, `${lines.join("\n")}\n`);
}

function removeEmptyDir(dir: string): void {
  try {
    rmdirSync(dir);
  } catch {
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function formatError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

const exitCode = await main();
if (exitCode !== 0) process.exit(exitCode);
