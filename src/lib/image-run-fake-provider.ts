import { writeFileSync } from "node:fs";
import path from "node:path";

import { FakeImageProvider } from "../llm/image-fake.ts";
import type { LLMProvider } from "../llm/provider.ts";
import { FakeVisionJudge } from "../llm/vision-judge-fake.ts";
import type { ImageSpec } from "../pipeline/image/spec.ts";
import type { JudgeVerdict } from "../pipeline/image/verdict.ts";

export class ImageRunFakeTextProvider implements LLMProvider {
  readonly name = "fake-image-text";
  readonly calls: Array<{ prompt: string; cwd: string; timeoutMs: number }> = [];

  constructor(private readonly spec: ImageSpec = validImageSpec()) {}

  async runPrompt(prompt: string, cwd: string, timeoutMs: number): Promise<string> {
    this.calls.push({ prompt, cwd, timeoutMs });
    writeFileSync(
      path.resolve(cwd, "spec.json"),
      `${JSON.stringify(this.spec, null, 2)}\n`,
    );
    return "fake image spec written";
  }
}

export function createImagePipelineFakes(options: {
  spec?: ImageSpec;
  verdicts?: JudgeVerdict[];
  imageProvider?: FakeImageProvider;
  visionJudge?: FakeVisionJudge;
} = {}): {
  provider: ImageRunFakeTextProvider;
  imageProvider: FakeImageProvider;
  visionJudge: FakeVisionJudge;
} {
  return {
    provider: new ImageRunFakeTextProvider(options.spec ?? validImageSpec()),
    imageProvider: options.imageProvider ?? new FakeImageProvider(),
    visionJudge:
      options.visionJudge ??
      new FakeVisionJudge({ verdicts: options.verdicts ?? [passingVerdict()] }),
  };
}

export function validImageSpec(overrides: Partial<ImageSpec> = {}): ImageSpec {
  return {
    promptOriginal: "Create a precise operational healthcare AI governance image.",
    subject: "an AI governance review queue",
    style: "clean editorial illustration",
    composition: "centered review board with visible owner, date, and risk lanes",
    palette: ["white", "blue", "green"],
    dimensions: { w: 1024, h: 1024 },
    negativeConstraints: ["no patient names", "no hospital logo"],
    safetyProfile: "synthetic non-clinical operational scene",
    acceptanceCriteria: [
      {
        id: "mechanical-size",
        description: "The PNG must use the requested dimensions.",
        tier: "mechanical",
      },
      {
        id: "subject-visible",
        description: "The review queue must be the dominant subject.",
        tier: "judged",
      },
      {
        id: "safety-no-patient-data",
        description: "Safety: no patient-identifying information is visible.",
        tier: "judged",
      },
    ],
    ...overrides,
  };
}

export function passingVerdict(): JudgeVerdict {
  return {
    overallPass: true,
    criteria: [
      { id: "mechanical-size", pass: true, rationale: "PNG dimensions match." },
      { id: "subject-visible", pass: true, rationale: "Queue is clear." },
      { id: "safety-no-patient-data", pass: true, rationale: "No PHI." },
    ],
  };
}

export function failingVerdict(feedback = "Make the review queue clearer."): JudgeVerdict {
  return {
    overallPass: false,
    regenerateFeedback: feedback,
    criteria: [
      { id: "mechanical-size", pass: true, rationale: "PNG dimensions match." },
      { id: "subject-visible", pass: false, rationale: "Queue is not clear." },
      { id: "safety-no-patient-data", pass: true, rationale: "No PHI." },
    ],
  };
}

export function safetyFailingVerdict(): JudgeVerdict {
  return {
    overallPass: false,
    regenerateFeedback: "Remove patient-identifying details.",
    criteria: [
      { id: "mechanical-size", pass: true, rationale: "PNG dimensions match." },
      { id: "subject-visible", pass: true, rationale: "Queue is clear." },
      { id: "safety-no-patient-data", pass: false, rationale: "PHI-like data visible." },
    ],
  };
}
