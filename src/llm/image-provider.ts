import type { ImageSpec } from "../pipeline/image/spec.ts";

export type ImageProviderErrorCode =
  | "spawn"
  | "timeout"
  | "http"
  | "parse"
  | "safety";

export interface ImageProviderErrorOptions {
  code: ImageProviderErrorCode;
  message: string;
  status?: number;
  bodyTail?: string;
  cause?: unknown;
}

export class ImageProviderError extends Error {
  readonly code: ImageProviderErrorCode;
  readonly status?: number;
  readonly bodyTail?: string;
  override readonly cause?: unknown;

  constructor(code: ImageProviderErrorCode, message: string, cause?: unknown);
  constructor(options: ImageProviderErrorOptions);
  constructor(
    optionsOrCode: ImageProviderErrorOptions | ImageProviderErrorCode,
    message?: string,
    cause?: unknown,
  ) {
    const options =
      typeof optionsOrCode === "string"
        ? { code: optionsOrCode, message: message ?? optionsOrCode, cause }
        : optionsOrCode;
    super(options.message);
    this.name = "ImageProviderError";
    this.code = options.code;
    this.status = options.status;
    this.bodyTail = options.bodyTail;
    this.cause = options.cause;
  }
}

export interface ImageProvider {
  readonly name: string;
  generate(
    spec: ImageSpec,
    absolutePath: string,
    timeoutMs: number,
    feedback?: string,
  ): Promise<void>;
}
