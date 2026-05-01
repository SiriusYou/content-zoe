import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { FakeProvider } from "../llm/fake.ts";
import { STAGES } from "../pipeline/stages.ts";
import { Stage } from "../pipeline/types.ts";

export interface ReportRunFakeProviderOptions {
  omitStages?: readonly Stage[];
}

export function createReportRunFakeProvider(
  options: ReportRunFakeProviderOptions = {},
): FakeProvider {
  const omitted = new Set(options.omitStages ?? []);
  const enabledStages = new Set(
    Object.values(Stage).filter((stage) => !omitted.has(stage)),
  );
  return new ReportRunFakeProvider(
    new Map(
      Object.values(STAGES)
        .filter((stageDef) => enabledStages.has(stageDef.stage))
        .map((stageDef) => [stageDef.prompt, `fake output for ${stageDef.stage}`]),
    ),
    enabledStages,
  );
}

class ReportRunFakeProvider extends FakeProvider {
  constructor(
    responses: Map<string, string>,
    private readonly enabledStages: ReadonlySet<Stage>,
  ) {
    super(responses);
  }

  override async runPrompt(
    prompt: string,
    cwd: string,
    timeoutMs: number,
  ): Promise<string> {
    if (
      this.enabledStages.has(Stage.RESEARCH) &&
      prompt === STAGES[Stage.RESEARCH].prompt
    ) {
      writeResearchArtifacts(cwd);
    }

    if (
      this.enabledStages.has(Stage.DRAFT_EN) &&
      prompt.startsWith(STAGES[Stage.DRAFT_EN].prompt)
    ) {
      writeDraftArtifacts(cwd);
      return `fake output for ${Stage.DRAFT_EN}`;
    }

    if (
      this.enabledStages.has(Stage.EDIT_EN) &&
      prompt.startsWith(STAGES[Stage.EDIT_EN].prompt)
    ) {
      writeEditArtifacts(cwd);
      return `fake output for ${Stage.EDIT_EN}`;
    }

    return super.runPrompt(prompt, cwd, timeoutMs);
  }
}

function writeResearchArtifacts(runDir: string): void {
  mkdirSync(path.resolve(runDir, "research"), { recursive: true });
  writeFileSync(
    path.resolve(runDir, "research", "brief.md"),
    "# Research Brief\n\nSynthetic fake-provider research brief for report-run smoke coverage.\n",
  );
  writeFileSync(
    path.resolve(runDir, "sources.json"),
    `${JSON.stringify([
      {
        title: "Fake provider local fixture",
        type: "synthetic",
      },
    ])}\n`,
  );
}

function writeDraftArtifacts(runDir: string): void {
  writeFileSync(
    path.resolve(runDir, "report.en.md"),
    "# English Report\n\nSynthetic fake-provider English draft for report-run smoke coverage.\n",
  );
}

function writeEditArtifacts(runDir: string): void {
  writeFileSync(
    path.resolve(runDir, "report.en.md"),
    [
      "# English Report",
      "",
      "Synthetic fake-provider edited English report for report-run smoke coverage.",
      "",
      "<!-- EVIDENCE_GRADE_WARN: Synthetic fake-provider warning marker for edit_en smoke coverage. -->",
      "",
    ].join("\n"),
  );
}
