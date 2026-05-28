import {
  mkdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  getPipeline,
  IMAGE_STAGE,
  Modality,
  PIPELINES,
} from "../src/pipeline/modality.ts";
import { nextStage } from "../src/pipeline/stages.ts";
import { Stage } from "../src/pipeline/types.ts";

type ScenarioName =
  | "text-pipeline-unchanged"
  | "en-only-skips-zh"
  | "registry-has-image"
  | "unknown-modality-throws"
  | "text-stagedef-unknown-throws";

interface ScenarioOutcome {
  name: ScenarioName;
  status: "PASS" | "FAIL";
  details: string[];
  startedAtIso: string;
  finishedAtIso: string;
}

const SCENARIOS: readonly ScenarioName[] = [
  "text-pipeline-unchanged",
  "en-only-skips-zh",
  "registry-has-image",
  "unknown-modality-throws",
  "text-stagedef-unknown-throws",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = resolve(
  repoRoot,
  ".runs",
  "modality-registry-smoke",
  new Date().toISOString().replaceAll(":", "-"),
);
const docPath = resolve(repoRoot, "docs", "preflight", "modality-registry-smoke.md");

async function main(): Promise<number> {
  mkdirSync(smokeRoot, { recursive: true });
  const outcomes: ScenarioOutcome[] = [];

  try {
    for (const name of SCENARIOS) {
      outcomes.push(runScenario(name));
    }
  } finally {
    writeEvidence(outcomes);
    rmSync(smokeRoot, { recursive: true, force: true });
    removeEmptyDir(resolve(repoRoot, ".runs", "modality-registry-smoke"));
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

function runScenario(name: ScenarioName): ScenarioOutcome {
  const startedAtIso = new Date().toISOString();
  try {
    const details = scenarioImpl(name);
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

function scenarioImpl(name: ScenarioName): string[] {
  switch (name) {
    case "text-pipeline-unchanged":
      return textPipelineUnchanged();
    case "en-only-skips-zh":
      return enOnlySkipsZh();
    case "registry-has-image":
      return registryHasImage();
    case "unknown-modality-throws":
      return unknownModalityThrows();
    case "text-stagedef-unknown-throws":
      return textStageDefUnknownThrows();
  }
}

function textPipelineUnchanged(): string[] {
  const pipeline = getPipeline(Modality.TEXT_REPORT);
  assert(pipeline === PIPELINES[Modality.TEXT_REPORT], "text pipeline should come from registry");
  assert(
    JSON.stringify(pipeline.stageIds) ===
      JSON.stringify([Stage.RESEARCH, Stage.DRAFT_EN, Stage.EDIT_EN, Stage.TRANSLATE_ZH]),
    "text stage ids should match existing report pipeline",
  );
  assert(pipeline.stageDef(Stage.RESEARCH).stage === Stage.RESEARCH, "research StageDef should resolve");
  assert(pipeline.nextStage(Stage.RESEARCH, ["en", "zh"]) === Stage.DRAFT_EN, "text nextStage should delegate");
  assert(
    pipeline.rewindStageForReject("bundle") === Stage.DRAFT_EN,
    "bundle reject should rewind to draft_en",
  );
  assert(
    pipeline.rewindStageForReject("zh") === Stage.TRANSLATE_ZH,
    "zh reject should rewind to translate_zh",
  );
  return ["Text pipeline registry delegates to the existing STAGES and nextStage contract."];
}

function enOnlySkipsZh(): string[] {
  const pipeline = getPipeline(Modality.TEXT_REPORT);
  assert(nextStage(Stage.EDIT_EN, ["en"]) === "awaiting_approval", "baseline nextStage should skip zh");
  assert(
    pipeline.nextStage(Stage.EDIT_EN, ["en"]) === "awaiting_approval",
    "text pipeline should preserve en-only zh skip",
  );
  return ["Text pipeline preserved locales=['en'] translation skip."];
}

function registryHasImage(): string[] {
  const pipeline = getPipeline(Modality.IMAGE);
  assert(
    JSON.stringify(pipeline.stageIds) ===
      JSON.stringify([IMAGE_STAGE.ELABORATE_SPEC, IMAGE_STAGE.GENERATE, IMAGE_STAGE.JUDGE]),
    "image stage ids should be elaborate_spec -> generate -> judge",
  );
  assert(
    pipeline.nextStage(IMAGE_STAGE.ELABORATE_SPEC, []) === IMAGE_STAGE.GENERATE,
    "image elaborate_spec should advance to generate",
  );
  assert(
    pipeline.nextStage(IMAGE_STAGE.GENERATE, []) === IMAGE_STAGE.JUDGE,
    "image generate should advance to judge",
  );
  assert(
    pipeline.nextStage(IMAGE_STAGE.JUDGE, []) === "awaiting_approval",
    "image judge should advance to awaiting_approval",
  );
  assert(
    pipeline.rewindStageForReject("bundle") === IMAGE_STAGE.GENERATE,
    "image reject should rewind to generate",
  );
  assertThrows(
    () => pipeline.stageDef(IMAGE_STAGE.GENERATE),
    "not yet implemented",
    "image stageDef should throw slice-6 sentinel",
  );
  return ["Image registry exposes stage order, transitions, reject rewind, and slice-6 stageDef sentinel."];
}

function unknownModalityThrows(): string[] {
  for (const modality of ["video", "toString", "constructor", "__proto__"]) {
    assertThrows(
      () => getPipeline(modality),
      "unknown modality",
      `unknown modality ${modality} should throw`,
    );
  }
  return ["Unknown modalities, including prototype-key strings, failed closed."];
}

function textStageDefUnknownThrows(): string[] {
  const pipeline = getPipeline(Modality.TEXT_REPORT);
  for (const stageId of ["publish", "toString", "constructor", "__proto__"]) {
    assertThrows(
      () => pipeline.stageDef(stageId),
      "unknown text stage",
      `unknown text stage id ${stageId} should throw`,
    );
  }
  return ["Text stageDef resolver throws on unknown ids, including prototype-key strings."];
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  const lines = [
    "# Modality Registry Smoke",
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
    "## Registry Coverage",
    "",
    "- TEXT_REPORT delegates to the existing report stage registry and `nextStage` behavior.",
    "- IMAGE exposes the Slice 1 stage identifiers and transition/rewind contract without implementing image stage defs.",
    "- Unknown text stage ids and unknown modalities fail closed with thrown errors, including prototype-key strings.",
    "",
  );

  mkdirSync(dirname(docPath), { recursive: true });
  writeFileSync(docPath, `${lines.join("\n")}\n`);
}

function assertThrows(fn: () => unknown, fragment: string, message: string): void {
  try {
    fn();
  } catch (err) {
    assert(formatError(err).includes(fragment), `${message}: ${formatError(err)}`);
    return;
  }
  throw new Error(`${message}: did not throw`);
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
