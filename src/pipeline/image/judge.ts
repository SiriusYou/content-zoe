import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { VisionJudge } from "../../llm/vision-judge.ts";
import type { StageDef } from "../types.ts";
import { parseImageSpec } from "./spec.ts";

export function makeJudgeStage(visionJudge: VisionJudge): StageDef {
  return {
    stage: "judge",
    prompt: "Judge image.png against spec.json.",
    timeoutMs: 900_000,
    manifest: {
      rules: [
        { kind: "json_parseable", path: "verdict.json" },
        { kind: "judge_verdict_pass", path: "verdict.json" },
      ],
    },
    run: async (context) => {
      const spec = parseImageSpec(
        JSON.parse(readFileSync(path.resolve(context.runDir, "spec.json"), "utf8")),
      );
      const verdict = await visionJudge.judge(
        path.resolve(context.runDir, "image.png"),
        spec,
        context.timeoutMs,
      );
      writeFileSync(
        path.resolve(context.runDir, "verdict.json"),
        `${JSON.stringify(verdict, null, 2)}\n`,
      );
    },
  };
}
