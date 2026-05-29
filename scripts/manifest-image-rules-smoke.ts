import {
  mkdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FakeProvider } from "../src/llm/fake.ts";
import { runStage } from "../src/pipeline/run-stage.ts";
import type {
  ManifestErrorCode,
  ManifestRule,
  StageDef,
} from "../src/pipeline/types.ts";

type ScenarioName =
  | "image-exists-pass"
  | "image-exists-missing"
  | "image-dimensions-pass"
  | "image-dimensions-mismatch"
  | "image-format-bad-magic"
  | "image-format-oversize"
  | "judge-verdict-pass"
  | "judge-verdict-fail"
  | "judge-verdict-missing-overallPass"
  | "judge-verdict-unparseable";

interface ScenarioOutcome {
  name: ScenarioName;
  status: "PASS" | "FAIL";
  details: string[];
  startedAtIso: string;
  finishedAtIso: string;
}

const SCENARIOS: readonly ScenarioName[] = [
  "image-exists-pass",
  "image-exists-missing",
  "image-dimensions-pass",
  "image-dimensions-mismatch",
  "image-format-bad-magic",
  "image-format-oversize",
  "judge-verdict-pass",
  "judge-verdict-fail",
  "judge-verdict-missing-overallPass",
  "judge-verdict-unparseable",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isoStamp = new Date().toISOString().replaceAll(":", "-");
const smokeRoot = resolve(repoRoot, ".runs", "manifest-image-rules-smoke", isoStamp);
const docPath = resolve(repoRoot, "docs", "preflight", "manifest-image-rules-smoke.md");

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
    removeEmptyDir(resolve(repoRoot, ".runs", "manifest-image-rules-smoke"));
    removeEmptyDir(resolve(repoRoot, ".runs"));
  }

  for (const outcome of outcomes) {
    console.log(`${outcome.status} ${outcome.name}`);
    for (const detail of outcome.details) {
      console.log(`  - ${detail}`);
    }
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
    case "image-exists-pass":
      writePng(resolve(runDir, "image.png"), 12, 8);
      await assertOk(runDir, [{ kind: "image_exists", path: "image.png" }]);
      return ["Existing PNG satisfied image_exists."];
    case "image-exists-missing":
      await assertManifestCode(
        runDir,
        [{ kind: "image_exists", path: "missing.png" }],
        "MANIFEST_IMAGE_MISSING",
      );
      return ["Missing image returned MANIFEST_IMAGE_MISSING."];
    case "image-dimensions-pass":
      writePng(resolve(runDir, "image.png"), 640, 480);
      await assertOk(runDir, [
        { kind: "image_dimensions", path: "image.png", width: 640, height: 480 },
      ]);
      return ["PNG IHDR dimensions matched 640x480."];
    case "image-dimensions-mismatch":
      writePng(resolve(runDir, "image.png"), 640, 480);
      await assertManifestCode(
        runDir,
        [{ kind: "image_dimensions", path: "image.png", width: 641, height: 480 }],
        "MANIFEST_IMAGE_DIMENSIONS",
      );
      return ["PNG IHDR mismatch returned MANIFEST_IMAGE_DIMENSIONS."];
    case "image-format-bad-magic":
      writeFileSync(resolve(runDir, "image.png"), "not a png\n");
      await assertManifestCode(
        runDir,
        [{ kind: "image_format", path: "image.png", formats: ["png"] }],
        "MANIFEST_IMAGE_FORMAT",
      );
      return ["Bad magic bytes returned MANIFEST_IMAGE_FORMAT."];
    case "image-format-oversize":
      writePng(resolve(runDir, "image.png"), 1, 1, 64);
      await assertManifestCode(
        runDir,
        [{ kind: "image_format", path: "image.png", formats: ["png"], maxBytes: 40 }],
        "MANIFEST_IMAGE_FORMAT",
        "maxBytes",
      );
      return ["Valid PNG over maxBytes returned MANIFEST_IMAGE_FORMAT with oversize detail."];
    case "judge-verdict-pass":
      writeFileSync(
        resolve(runDir, "verdict.json"),
        JSON.stringify({
          overallPass: true,
          criteria: [
            {
              id: "subject-visible",
              pass: true,
              rationale: "subject is visible",
            },
          ],
        }) + "\n",
      );
      await assertOk(runDir, [{ kind: "judge_verdict_pass", path: "verdict.json" }]);
      return ["Judge verdict passed only with a valid full JudgeVerdict and overallPass strictly true."];
    case "judge-verdict-fail":
      writeFileSync(resolve(runDir, "verdict.json"), '{"overallPass":false}\n');
      await assertManifestCode(
        runDir,
        [{ kind: "judge_verdict_pass", path: "verdict.json" }],
        "MANIFEST_JUDGE_FAILED",
      );
      return ["overallPass false returned MANIFEST_JUDGE_FAILED."];
    case "judge-verdict-missing-overallPass":
      writeFileSync(resolve(runDir, "verdict.json"), '{"score":1}\n');
      await assertManifestCode(
        runDir,
        [{ kind: "judge_verdict_pass", path: "verdict.json" }],
        "MANIFEST_JUDGE_FAILED",
      );
      return ["Missing overallPass returned MANIFEST_JUDGE_FAILED."];
    case "judge-verdict-unparseable":
      writeFileSync(resolve(runDir, "verdict.json"), "{ nope\n");
      await assertManifestCode(
        runDir,
        [{ kind: "judge_verdict_pass", path: "verdict.json" }],
        "MANIFEST_JSON_UNPARSEABLE",
      );
      return ["Unparseable judge JSON reused MANIFEST_JSON_UNPARSEABLE."];
  }
}

async function assertOk(
  runDir: string,
  rules: readonly ManifestRule[],
): Promise<void> {
  const result = await runStage(
    stageDef(rules),
    new FakeProvider(new Map([["image manifest smoke", "ok"]])),
    { runDir, cwd: repoRoot },
  );
  assert(result.status === "ok", `expected ok, got ${result.status}`);
}

async function assertManifestCode(
  runDir: string,
  rules: readonly ManifestRule[],
  code: ManifestErrorCode,
  messageFragment?: string,
): Promise<void> {
  const result = await runStage(
    stageDef(rules),
    new FakeProvider(new Map([["image manifest smoke", "ok"]])),
    { runDir, cwd: repoRoot },
  );
  assert(result.status === "manifest_invalid", `expected manifest_invalid, got ${result.status}`);
  assert(
    result.error.errorCode === code,
    `expected ${code}, got ${result.error.errorCode}`,
  );
  if (messageFragment) {
    assert(
      result.error.message.includes(messageFragment),
      `expected message to include ${messageFragment}, got ${result.error.message}`,
    );
  }
}

function stageDef(rules: readonly ManifestRule[]): StageDef {
  return {
    stage: "image-test",
    prompt: "image manifest smoke",
    timeoutMs: 1_000,
    manifest: { rules: [...rules] },
  };
}

function writePng(filePath: string, width: number, height: number, padBytes = 0): void {
  const bytes = Buffer.alloc(33 + padBytes);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 2;
  bytes[26] = 0;
  bytes[27] = 0;
  bytes[28] = 0;
  writeFileSync(filePath, bytes);
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  const lines = [
    "# Manifest Image Rules Smoke",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Scenario | Status | Details |",
    "| --- | --- | --- |",
  ];

  for (const outcome of outcomes) {
    lines.push(
      `| ${outcome.name} | ${outcome.status} | ${outcome.details.map(escapeCell).join("<br>")} |`,
    );
  }

  lines.push(
    "",
    "## Type-Consumer Audit",
    "",
    "- Audit command: `rg -n \"StageDef\\\\.stage|stageDef\\\\.stage|Set<Stage>|ReadonlySet<Stage>|Record<Stage|: Stage|Stage\\\\[\\\\]|<Stage>\" src`.",
    "- `StageDef.stage`, `StagePromptContext.stage`, and `StageResult.stage` are widened to `string` for modality-neutral stages.",
    "- `src/lib/report-run-fake-provider.ts` widens its internal enabled-stage set to `ReadonlySet<string>`; `omitStages` remains text-only.",
    "- `src/pipeline/run-stage.ts` returns the widened `stageDef.stage` value without narrowing it back to `Stage`.",
    "- Existing report-loop, db, bin, and text-stage `Stage` consumers remain text-pipeline-owned and do not accept arbitrary image stage ids.",
    "- No other audited consumer required widening for Slice 1 because the existing report runner still indexes `STAGES[current]` from a text-only `Stage` value.",
    "",
  );

  mkdirSync(dirname(docPath), { recursive: true });
  writeFileSync(docPath, `${lines.join("\n")}\n`);
}

function removeEmptyDir(dir: string): void {
  try {
    rmdirSync(dir);
  } catch {
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function escapeCell(input: string): string {
  return input.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

const exitCode = await main();
process.exit(exitCode);
