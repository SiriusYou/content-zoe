import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ImageSpec } from "../pipeline/image/spec.ts";
import {
  ImageProviderError,
  type ImageProvider,
} from "./image-provider.ts";
import { buildImagePrompt } from "./image-openai.ts";

export interface GoogleImageResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText?: string;
  text(): Promise<string>;
}

export type GoogleImageFetch = (
  url: string,
  init: RequestInit,
) => Promise<GoogleImageResponse>;

export interface GoogleImageProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: GoogleImageFetch;
}

interface GoogleGeneratePayload {
  candidates?: Array<{
    finishReason?: unknown;
    finish_reason?: unknown;
    content?: {
      parts?: Array<{
        inlineData?: {
          data?: unknown;
        };
        inline_data?: {
          data?: unknown;
        };
        text?: unknown;
      }>;
    };
  }>;
  promptFeedback?: {
    blockReason?: unknown;
  };
  prompt_feedback?: {
    block_reason?: unknown;
  };
}

const DEFAULT_MODEL = "gemini-3.1-flash-image";
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1/models";
const bodyTailMaxChars = 500;

export class GoogleImageProvider implements ImageProvider {
  readonly name = "google-image";

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: GoogleImageFetch;

  constructor(options: GoogleImageProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = normalizeGoogleImageModel(options.model);
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl =
      options.fetchImpl ??
      ((url, init) => fetch(url, init) as Promise<GoogleImageResponse>);
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
      message: `Google image request timed out after ${timeoutMs}ms`,
    });

    const operationPromise = (async () => {
      let response: GoogleImageResponse;
      try {
        response = await this.fetchImpl(this.endpoint(), {
          method: "POST",
          headers: {
            "x-goog-api-key": this.apiKey,
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
          message: `Google image request failed before response: ${formatThrown(err)}`,
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
          message: `Google image response body was unreadable: ${formatThrown(err)}`,
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

  private endpoint(): string {
    return `${this.baseUrl}/${encodeURIComponent(this.model)}:generateContent`;
  }

  private buildRequestBody(
    spec: ImageSpec,
    feedback?: string,
  ): Record<string, unknown> {
    return {
      contents: [
        {
          parts: [{ text: buildImagePrompt(spec, feedback) }],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    };
  }
}

export function normalizeGoogleImageModel(model: string | undefined): string {
  const normalized = model?.trim().toLowerCase().replaceAll("_", "-");
  if (
    normalized === undefined ||
    normalized.length === 0 ||
    normalized === "nano-banana-2" ||
    normalized === "nano banana 2"
  ) {
    return DEFAULT_MODEL;
  }
  if (normalized === "nano-banana-pro" || normalized === "nano banana pro") {
    return "gemini-3-pro-image";
  }
  if (normalized === "nano-banana" || normalized === "nano banana") {
    return "gemini-2.5-flash-image";
  }
  return model!.trim();
}

function parseImageB64(text: string): string {
  let parsed: GoogleGeneratePayload;
  try {
    parsed = JSON.parse(text) as GoogleGeneratePayload;
  } catch (err) {
    throw new ImageProviderError({
      code: "parse",
      message: `Google image response was not valid JSON: ${formatThrown(err)}`,
      cause: err,
    });
  }

  assertNotSafetyBlocked(parsed);

  const parts = parsed.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new ImageProviderError({
      code: "parse",
      message: "Google image response missing candidates[0].content.parts",
    });
  }

  for (const part of parts) {
    const inlineData = part.inlineData ?? part.inline_data;
    if (typeof inlineData?.data === "string" && inlineData.data.length > 0) {
      return inlineData.data;
    }
  }

  const textTail = tail(
    parts
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n"),
    bodyTailMaxChars,
  );
  throw new ImageProviderError({
    code: "parse",
    bodyTail: textTail.length > 0 ? textTail : undefined,
    message: "Google image response missing inline image data",
  });
}

function assertNotSafetyBlocked(parsed: GoogleGeneratePayload): void {
  const blockReason =
    parsed.promptFeedback?.blockReason ?? parsed.prompt_feedback?.block_reason;
  if (isSafetyReason(blockReason)) {
    throw new ImageProviderError({
      code: "safety",
      message: `Google image request blocked by prompt feedback: ${String(blockReason)}`,
    });
  }
  const finishReason =
    parsed.candidates?.[0]?.finishReason ?? parsed.candidates?.[0]?.finish_reason;
  if (isSafetyReason(finishReason)) {
    throw new ImageProviderError({
      code: "safety",
      message: `Google image response blocked by finish reason: ${String(finishReason)}`,
    });
  }
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
      message: "Google image response inlineData.data is not valid base64",
    });
  }

  const bytes = Buffer.from(normalized, "base64");
  if (bytes.length === 0) {
    throw new ImageProviderError({
      code: "parse",
      message: "Google image response inlineData.data decoded to empty bytes",
    });
  }
  return bytes;
}

function httpResponseError(
  response: GoogleImageResponse,
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
    message: `Google image request failed with status ${response.status}${
      response.statusText ? ` ${response.statusText}` : ""
    }: ${bodyTail}`,
  });
}

function safetyTermsPresent(text: string): boolean {
  return /(block_reason|safety|policy|content_policy|moderation|unsafe|prohibited)/i.test(text);
}

function isSafetyReason(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /(safety|policy|prohibited|blocked|block_reason)/i.test(value)
  );
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
