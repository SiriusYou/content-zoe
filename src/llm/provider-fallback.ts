import {
  ImageProviderError,
  type ImageProvider,
} from "./image-provider.ts";
import {
  VisionJudgeError,
  type VisionJudge,
} from "./vision-judge.ts";
import type { ImageSpec } from "../pipeline/image/spec.ts";
import type { JudgeVerdict } from "../pipeline/image/verdict.ts";

export type ProviderFallbackKind = "image" | "vision";

export interface ProviderFallbackEvent {
  readonly kind: ProviderFallbackKind;
  readonly primary: string;
  readonly fallback: string;
  readonly errorCode: string;
  readonly message: string;
}

export type ProviderFallbackLogger = (event: ProviderFallbackEvent) => void;

export class FallbackImageProvider implements ImageProvider {
  readonly name: string;

  constructor(
    private readonly primary: ImageProvider,
    private readonly fallback: ImageProvider,
    private readonly onFallback: ProviderFallbackLogger,
  ) {
    this.name = `${primary.name}->${fallback.name}`;
  }

  async generate(
    spec: ImageSpec,
    absolutePath: string,
    timeoutMs: number,
    feedback?: string,
  ): Promise<void> {
    try {
      await this.primary.generate(spec, absolutePath, timeoutMs, feedback);
    } catch (err) {
      if (err instanceof ImageProviderError && err.code === "safety") {
        throw err;
      }
      const normalized = normalizeProviderError(err);
      this.onFallback({
        kind: "image",
        primary: this.primary.name,
        fallback: this.fallback.name,
        errorCode: normalized.code,
        message: normalized.message,
      });
      await this.fallback.generate(spec, absolutePath, timeoutMs, feedback);
    }
  }
}

export class FallbackVisionJudge implements VisionJudge {
  readonly name: string;

  constructor(
    private readonly primary: VisionJudge,
    private readonly fallback: VisionJudge,
    private readonly onFallback: ProviderFallbackLogger,
  ) {
    this.name = `${primary.name}->${fallback.name}`;
  }

  async judge(
    imageAbsolutePath: string,
    spec: ImageSpec,
    timeoutMs: number,
  ): Promise<JudgeVerdict> {
    try {
      return await this.primary.judge(imageAbsolutePath, spec, timeoutMs);
    } catch (err) {
      if (err instanceof VisionJudgeError && err.code === "safety") {
        throw err;
      }
      const normalized = normalizeProviderError(err);
      this.onFallback({
        kind: "vision",
        primary: this.primary.name,
        fallback: this.fallback.name,
        errorCode: normalized.code,
        message: normalized.message,
      });
      return this.fallback.judge(imageAbsolutePath, spec, timeoutMs);
    }
  }
}

function normalizeProviderError(err: unknown): { code: string; message: string } {
  if (err instanceof ImageProviderError || err instanceof VisionJudgeError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof Error) {
    return { code: err.name || "Error", message: err.message };
  }
  return { code: "unknown", message: String(err) };
}
