import type { ImageSpec } from "../pipeline/image/spec.ts";
import type { JudgeVerdict } from "../pipeline/image/verdict.ts";

export type VisionJudgeErrorCode =
  | "timeout"
  | "http"
  | "parse"
  | "safety";

export interface VisionJudgeErrorOptions {
  code: VisionJudgeErrorCode;
  message: string;
  status?: number;
  bodyTail?: string;
  cause?: unknown;
}

export class VisionJudgeError extends Error {
  readonly code: VisionJudgeErrorCode;
  readonly status?: number;
  readonly bodyTail?: string;
  override readonly cause?: unknown;

  constructor(code: VisionJudgeErrorCode, message: string, cause?: unknown);
  constructor(options: VisionJudgeErrorOptions);
  constructor(
    optionsOrCode: VisionJudgeErrorOptions | VisionJudgeErrorCode,
    message?: string,
    cause?: unknown,
  ) {
    const options =
      typeof optionsOrCode === "string"
        ? { code: optionsOrCode, message: message ?? optionsOrCode, cause }
        : optionsOrCode;
    super(options.message);
    this.name = "VisionJudgeError";
    this.code = options.code;
    this.status = options.status;
    this.bodyTail = options.bodyTail;
    this.cause = options.cause;
  }
}

export interface VisionJudge {
  readonly name: string;
  judge(
    imageAbsolutePath: string,
    spec: ImageSpec,
    timeoutMs: number,
  ): Promise<JudgeVerdict>;
}
