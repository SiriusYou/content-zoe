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
  return new ReportRunFakeProvider(
    new Map(
      Object.values(STAGES)
        .filter((stageDef) => !omitted.has(stageDef.stage))
        .map((stageDef) => [stageDef.prompt, `fake output for ${stageDef.stage}`]),
    ),
    !omitted.has(Stage.RESEARCH),
  );
}

class ReportRunFakeProvider extends FakeProvider {
  constructor(
    responses: Map<string, string>,
    private readonly researchArtifactsEnabled: boolean,
  ) {
    super(responses);
  }

  override async runPrompt(
    prompt: string,
    cwd: string,
    timeoutMs: number,
  ): Promise<string> {
    if (this.researchArtifactsEnabled && prompt === STAGES[Stage.RESEARCH].prompt) {
      writeResearchArtifacts(cwd);
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
