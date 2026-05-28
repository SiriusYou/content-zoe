import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ImageSpec } from "../pipeline/image/spec.ts";
import {
  ImageProviderError,
  type ImageProvider,
} from "./image-provider.ts";

export interface OpenAiImageResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText?: string;
  text(): Promise<string>;
}

export type OpenAiImageFetch = (
  url: string,
  init: RequestInit,
) => Promise<OpenAiImageResponse>;

export interface OpenAiImageProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: OpenAiImageFetch;
}

interface OpenAIImagePayload {
  data?: Array<{
    b64_json?: unknown;
  }>;
}

const DEFAULT_MODEL = "gpt-image-1";
const DEFAULT_BASE_URL = "https://api.openai.com/v1/images/generations";
const bodyTailMaxChars = 500;

export class OpenAiImageProvider implements ImageProvider {
  readonly name = "openai-image";

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: OpenAiImageFetch;

  constructor(options: OpenAiImageProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl =
      options.fetchImpl ??
      ((url, init) => fetch(url, init) as Promise<OpenAiImageResponse>);
  }

  async generate(
    spec: ImageSpec,
    absolutePath: string,
    timeoutMs: number,
    feedback?: string,
  ): Promise<void> {
    if (!path.isAbsolute(absolutePath)) {
      throw new ImageProviderError({
        code: "parse",
        message: `image output path must be absolute: ${absolutePath}`,
      });
    }

    const response = await this.requestImage(spec, timeoutMs, feedback);
    const b64 = parseImageB64(response);
    const bytes = decodeBase64(b64);

    try {
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      const tempPath = `${absolutePath}.tmp`;
      writeFileSync(tempPath, bytes);
      renameSync(tempPath, absolutePath);
    } catch (err) {
      rmSync(`${absolutePath}.tmp`, { force: true });
      throw new ImageProviderError({
        code: "parse",
        message: `failed to write image output: ${formatThrown(err)}`,
        cause: err,
      });
    }
  }

  private async requestImage(
    spec: ImageSpec,
    timeoutMs: number,
    feedback?: string,
  ): Promise<string> {
    const controller = new AbortController();
    let timeoutReached = false;
    const timeoutError = new ImageProviderError({
      code: "timeout",
      message: `OpenAI image request timed out after ${timeoutMs}ms`,
    });

    const operationPromise = (async () => {
      let response: OpenAiImageResponse;
      try {
        response = await this.fetchImpl(this.baseUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(this.buildRequestBody(spec, feedback)),
          signal: controller.signal,
        });
      } catch (err) {
        if (timeoutReached || isAbortError(err)) {
          throw timeoutError;
        }
        throw new ImageProviderError({
          code: "http",
          message: `OpenAI image request failed before response: ${formatThrown(err)}`,
          cause: err,
        });
      }

      let text: string;
      try {
        text = await response.text();
      } catch (err) {
        if (timeoutReached || isAbortError(err)) {
          throw timeoutError;
        }
        if (!response.ok) {
          throw httpResponseError(
            response,
            `unreadable response body: ${formatThrown(err)}`,
            { classifySafety: false },
          );
        }
        throw new ImageProviderError({
          code: "parse",
          message: `OpenAI image response body was unreadable: ${formatThrown(err)}`,
          cause: err,
        });
      }

      if (!response.ok) {
        throw httpResponseError(response, text);
      }
      return text;
    })();

    let timer!: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timeoutReached = true;
        controller.abort();
        reject(timeoutError);
      }, Math.max(0, timeoutMs));
    });

    try {
      return await Promise.race([operationPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }

  private buildRequestBody(
    spec: ImageSpec,
    feedback?: string,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      prompt: buildImagePrompt(spec, feedback),
      n: 1,
      size: `${spec.dimensions.w}x${spec.dimensions.h}`,
    };

    if (this.model.startsWith("dall-e-")) {
      body.response_format = "b64_json";
    }

    return body;
  }
}

export function buildImagePrompt(spec: ImageSpec, feedback?: string): string {
  const criteria = spec.acceptanceCriteria
    .map(
      (criterion) =>
        `- ${criterion.id} [${criterion.tier}]: ${criterion.description}`,
    )
    .join("\n");

  const sections = [
    `Original prompt: ${spec.promptOriginal}`,
    `Subject: ${spec.subject}`,
    `Style: ${spec.style}`,
    `Composition: ${spec.composition}`,
    `Palette: ${spec.palette.join(", ")}`,
    `Dimensions: ${spec.dimensions.w}x${spec.dimensions.h}`,
    `Negative constraints: ${spec.negativeConstraints.join("; ")}`,
    `Safety profile: ${spec.safetyProfile}`,
    `Acceptance criteria:\n${criteria}`,
  ];

  if (feedback !== undefined && feedback.trim().length > 0) {
    sections.push(`Regeneration feedback: ${feedback}`);
  }

  return sections.join("\n\n");
}

function httpResponseError(
  response: OpenAiImageResponse,
  body: string,
  options: { classifySafety?: boolean } = {},
): ImageProviderError {
  const bodyTail = tail(body, bodyTailMaxChars);
  const classifySafety = options.classifySafety ?? true;
  const code = classifySafety && safetyTermsPresent(body) ? "safety" : "http";
  return new ImageProviderError({
    code,
    status: response.status,
    bodyTail,
    message: `OpenAI image request failed with status ${response.status}${
      response.statusText ? ` ${response.statusText}` : ""
    }: ${bodyTail}`,
  });
}

function parseImageB64(text: string): string {
  let parsed: OpenAIImagePayload;
  try {
    parsed = JSON.parse(text) as OpenAIImagePayload;
  } catch (err) {
    throw new ImageProviderError({
      code: "parse",
      message: `OpenAI image response was not valid JSON: ${formatThrown(err)}`,
      cause: err,
    });
  }

  const b64 = parsed.data?.[0]?.b64_json;
  if (typeof b64 !== "string" || b64.length === 0) {
    throw new ImageProviderError({
      code: "parse",
      message: "OpenAI image response missing data[0].b64_json",
    });
  }

  return b64;
}

function decodeBase64(value: string): Buffer {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
  ) {
    throw new ImageProviderError({
      code: "parse",
      message: "OpenAI image response data[0].b64_json is not valid base64",
    });
  }

  const bytes = Buffer.from(normalized, "base64");
  if (bytes.length === 0) {
    throw new ImageProviderError({
      code: "parse",
      message: "OpenAI image response data[0].b64_json decoded to empty bytes",
    });
  }
  return bytes;
}

function safetyTermsPresent(text: string): boolean {
  return /\b(safety|policy|content_policy|moderation|unsafe)\b/i.test(text);
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || err.message.toLowerCase().includes("abort"))
  );
}

function tail(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(text.length - maxChars);
}

function formatThrown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export {
  OpenAiImageProvider as OpenAIImageProvider,
  type OpenAiImageFetch as OpenAIImageFetch,
  type OpenAiImageProviderOptions as OpenAIImageProviderOptions,
  type OpenAiImageResponse as OpenAIImageResponse,
};
