import { readFileSync } from "node:fs";
import path from "node:path";

import type { ImageProvider } from "../../llm/image-provider.ts";
import type { ManifestRule, StageDef } from "../types.ts";
import { parseImageSpec } from "./spec.ts";
import { parseJudgeVerdict } from "./verdict.ts";

export function makeGenerateStage(imageProvider: ImageProvider): StageDef {
  const dimensionRule: Extract<ManifestRule, { kind: "image_dimensions" }> = {
    kind: "image_dimensions",
    path: "image.png",
    width: 1024,
    height: 1024,
  };

  return {
    stage: "generate",
    prompt: "Generate an image from spec.json.",
    timeoutMs: 900_000,
    manifest: {
      rules: [
        { kind: "image_exists", path: "image.png" },
        { kind: "image_format", path: "image.png", formats: ["png"] },
        dimensionRule,
      ],
    },
    run: async (context) => {
      const spec = parseImageSpec(
        JSON.parse(readFileSync(path.resolve(context.runDir, "spec.json"), "utf8")),
      );
      dimensionRule.width = spec.dimensions.w;
      dimensionRule.height = spec.dimensions.h;

      const feedback = readRegenerateFeedback(context.runDir);
      await imageProvider.generate(
        spec,
        path.resolve(context.runDir, "image.png"),
        context.timeoutMs,
        feedback,
      );
    },
  };
}

function readRegenerateFeedback(runDir: string): string | undefined {
  const verdictPath = path.resolve(runDir, "verdict.json");
  try {
    const verdict = parseJudgeVerdict(
      JSON.parse(readFileSync(verdictPath, "utf8")),
    );
    return verdict.overallPass ? undefined : verdict.regenerateFeedback;
  } catch {
    return undefined;
  }
}
