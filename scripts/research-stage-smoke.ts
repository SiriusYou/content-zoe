import {
  mkdirSync,
  readFileSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FakeProvider } from "../src/llm/fake.ts";
import type { LLMProvider } from "../src/llm/provider.ts";
import { createReportRunFakeProvider } from "../src/lib/report-run-fake-provider.ts";
import { runStage } from "../src/pipeline/run-stage.ts";
import { STAGES } from "../src/pipeline/stages.ts";
import { Stage, type ManifestErrorCode } from "../src/pipeline/types.ts";

type ScenarioName =
  | "research-success"
  | "missing-research-brief"
  | "empty-research-brief"
  | "empty-sources-json"
  | "path-boundary-inherited";

interface ScenarioOutcome {
  name: ScenarioName;
  status: "PASS" | "FAIL";
  details: string[];
  startedAtIso: string;
  finishedAtIso: string;
}

const SCENARIOS: ScenarioName[] = [
  "research-success",
  "missing-research-brief",
  "empty-research-brief",
  "empty-sources-json",
  "path-boundary-inherited",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isoStamp = new Date().toISOString().replaceAll(":", "-");
const smokeRoot = resolve(repoRoot, ".runs", "research-stage-smoke", isoStamp);
const docPath = resolve(repoRoot, "docs", "preflight", "research-stage-smoke.md");

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
    removeEmptyDir(resolve(repoRoot, ".runs", "research-stage-smoke"));
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
    case "research-success":
      return runResearchSuccess(runDir);
    case "missing-research-brief":
      return runMissingResearchBrief(runDir);
    case "empty-research-brief":
      return runEmptyResearchBrief(runDir);
    case "empty-sources-json":
      return runEmptySourcesJson(runDir);
    case "path-boundary-inherited":
      return runPathBoundaryInherited(runDir);
  }
}

async function runResearchSuccess(runDir: string): Promise<string[]> {
  const result = await runStage(
    STAGES[Stage.RESEARCH],
    createReportRunFakeProvider(),
    { runDir, cwd: repoRoot },
  );

  assert(result.status === "ok", `expected ok, got ${result.status}`);
  const brief = readFileSync(resolve(runDir, "research", "brief.md"), "utf8");
  assert(brief.trim().length > 0, "expected non-empty research/brief.md");
  const sources = JSON.parse(readFileSync(resolve(runDir, "sources.json"), "utf8"));
  assert(Array.isArray(sources), "expected sources.json to parse as JSON array");
  return [
    "Shared fake-artifact helper wrote non-empty research/brief.md.",
    "Shared fake-artifact helper wrote parseable JSON array sources.json.",
  ];
}

async function runMissingResearchBrief(runDir: string): Promise<string[]> {
  const result = await runStage(
    STAGES[Stage.RESEARCH],
    new WritingProvider(() => {
      writeFileSync(resolve(runDir, "sources.json"), "[]\n");
    }),
    { runDir, cwd: repoRoot },
  );

  assertManifestCode(result, "MANIFEST_FILE_MISSING");
  return [
    "Provider wrote only sources.json.",
    "The concrete research manifest failed with MANIFEST_FILE_MISSING.",
  ];
}

async function runEmptyResearchBrief(runDir: string): Promise<string[]> {
  const result = await runStage(
    STAGES[Stage.RESEARCH],
    new WritingProvider(() => {
      mkdirSync(resolve(runDir, "research"), { recursive: true });
      writeFileSync(resolve(runDir, "research", "brief.md"), "");
      writeFileSync(resolve(runDir, "sources.json"), "[]\n");
    }),
    { runDir, cwd: repoRoot },
  );

  assertManifestCode(result, "MANIFEST_FILE_EMPTY");
  return [
    "Provider wrote a zero-byte research/brief.md and valid sources.json.",
    "The concrete research manifest failed with MANIFEST_FILE_EMPTY.",
  ];
}

async function runEmptySourcesJson(runDir: string): Promise<string[]> {
  const result = await runStage(
    STAGES[Stage.RESEARCH],
    new WritingProvider(() => {
      mkdirSync(resolve(runDir, "research"), { recursive: true });
      writeFileSync(resolve(runDir, "research", "brief.md"), "brief\n");
      writeFileSync(resolve(runDir, "sources.json"), "");
    }),
    { runDir, cwd: repoRoot },
  );

  assertManifestCode(result, "MANIFEST_JSON_UNPARSEABLE");
  return [
    "Provider wrote non-empty research/brief.md and empty sources.json.",
    "The concrete research manifest failed with MANIFEST_JSON_UNPARSEABLE.",
  ];
}

async function runPathBoundaryInherited(runDir: string): Promise<string[]> {
  const outside = resolve(smokeRoot, "outside-brief.md");
  writeFileSync(outside, "outside\n");
  mkdirSync(resolve(runDir, "research"), { recursive: true });
  symlinkSync(outside, resolve(runDir, "research", "brief.md"));
  writeFileSync(resolve(runDir, "sources.json"), "[]\n");

  const result = await runStage(
    STAGES[Stage.RESEARCH],
    new FakeProvider(new Map([[STAGES[Stage.RESEARCH].prompt, "ok"]])),
    { runDir, cwd: repoRoot },
  );

  assertManifestCode(result, "MANIFEST_PATH_OUTSIDE_RUNDIR");
  return [
    "research/brief.md was a symlink to a file outside the run directory.",
    "The concrete research manifest inherited runStage boundary validation.",
  ];
}

class WritingProvider implements LLMProvider {
  readonly name = "research-stage-smoke-writer";

  constructor(private readonly writeArtifacts: () => void) {}

  async runPrompt(): Promise<string> {
    this.writeArtifacts();
    return "ok";
  }
}

function assertManifestCode(
  result: Awaited<ReturnType<typeof runStage>>,
  expected: ManifestErrorCode,
): void {
  assert(result.status === "manifest_invalid", `expected manifest_invalid, got ${result.status}`);
  assert(
    result.error.errorCode === expected,
    `expected ${expected}, got ${result.error.errorCode}`,
  );
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  const lines = [
    "# research-stage smoke evidence",
    "",
    `- Command: \`bun run research-stage-smoke\``,
    `- Started: ${outcomes[0]?.startedAtIso ?? new Date().toISOString()}`,
    `- Finished: ${outcomes.at(-1)?.finishedAtIso ?? new Date().toISOString()}`,
    `- Scenario root: ${smokeRoot} (removed by finally-cleanup)`,
    "",
    "| Scenario | Result | Evidence |",
    "|---|---:|---|",
    ...outcomes.map(
      (outcome) =>
        `| ${outcome.name} | ${outcome.status} | ${outcome.details
          .map((detail) => detail.replaceAll("|", "\\|"))
          .join("<br>")} |`,
    ),
  ];
  writeFileSync(docPath, `${lines.join("\n")}\n`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function removeEmptyDir(dir: string): void {
  try {
    rmdirSync(dir);
  } catch {
  }
}

if (import.meta.main) {
  const code = await main();
  process.exit(code);
}
