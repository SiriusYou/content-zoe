import path from "node:path";

import type { ImageSpec } from "../pipeline/image/spec.ts";
import type { JudgeVerdict } from "../pipeline/image/verdict.ts";
import {
  VisionJudgeError,
  type VisionJudge,
  type VisionJudgeErrorCode,
} from "./vision-judge.ts";

export interface FakeVisionJudgeCall {
  imageAbsolutePath: string;
  spec: ImageSpec;
  timeoutMs: number;
}

export interface FakeVisionJudgeOptions {
  verdicts: JudgeVerdict[];
  failWith?: VisionJudgeErrorCode;
}

export class FakeVisionJudge implements VisionJudge {
  readonly name = "fake-vision-judge";
  readonly calls: FakeVisionJudgeCall[] = [];

  private readonly verdicts: JudgeVerdict[];
  private readonly failWith?: VisionJudgeErrorCode;

  constructor(options: FakeVisionJudgeOptions) {
    this.verdicts = options.verdicts.map(cloneVerdict);
    this.failWith = options.failWith;
  }

  async judge(
    imageAbsolutePath: string,
    spec: ImageSpec,
    timeoutMs: number,
  ): Promise<JudgeVerdict> {
    this.calls.push({ imageAbsolutePath, spec, timeoutMs });

    if (!path.isAbsolute(imageAbsolutePath)) {
      throw new VisionJudgeError({
        code: "parse",
        message: `image path must be absolute: ${imageAbsolutePath}`,
      });
    }

    if (this.failWith) {
      throw new VisionJudgeError(
        this.failWith,
        `synthetic fake vision judge failure: ${this.failWith}`,
      );
    }

    const verdict = this.verdicts.shift();
    if (!verdict) {
      throw new VisionJudgeError({
        code: "parse",
        message: "fake vision judge verdict queue exhausted",
      });
    }

    return cloneVerdict(verdict);
  }
}

function cloneVerdict(verdict: JudgeVerdict): JudgeVerdict {
  return JSON.parse(JSON.stringify(verdict)) as JudgeVerdict;
}
