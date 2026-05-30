import { readFileSync } from "node:fs";
import path from "node:path";

import type { ImageSpec } from "../pipeline/image/spec.ts";
import {
  parseJudgeVerdict,
  type JudgeVerdict,
} from "../pipeline/image/verdict.ts";
import {
  VisionJudgeError,
  type VisionJudge,
} from "./vision-judge.ts";
import { buildVisionJudgePrompt } from "./vision-judge-openai.ts";

export interface GoogleVisionResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText?: string;
  text(): Promise<string>;
}

export type GoogleVisionFetch = (
  url: string,
  init: RequestInit,
) => Promise<GoogleVisionResponse>;

export interface GoogleVisionJudgeOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: GoogleVisionFetch;
}

interface GoogleGeneratePayload {
  candidates?: Array<{
    finishReason?: unknown;
    finish_reason?: unknown;
    content?: {
      parts?: Array<{
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

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const bodyTailMaxChars = 500;

export class GoogleVisionJudge implements VisionJudge {
  readonly name = "google-vision-judge";

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: GoogleVisionFetch;

  constructor(options: GoogleVisionJudgeOptions) {
    this.apiKey = options.apiKey;
    this.model = normalizeGoogleVisionModel(options.model);
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl =
      options.fetchImpl ??
      ((url, init) => fetch(url, init) as Promise<GoogleVisionResponse>);
  }

  async judge(
    imageAbsolutePath: string,
    spec: ImageSpec,
    timeoutMs: number,
  ): Promise<JudgeVerdict> {
    if (!path.isAbsolute(imageAbsolutePath)) {
      throw new VisionJudgeError({
        code: "parse",
        message: `image path must be absolute: ${imageAbsolutePath}`,
      });
    }

    let imageBytes: Buffer;
    try {
      imageBytes = readFileSync(imageAbsolutePath);
    } catch (err) {
      throw new VisionJudgeError({
        code: "parse",
        message: `failed to read image for vision judge: ${formatThrown(err)}`,
        cause: err,
      });
    }

    const responseText = await this.requestJudge(spec, imageBytes, timeoutMs);
    return parseJudgeResponse(responseText, spec);
  }

  private async requestJudge(
    spec: ImageSpec,
    imageBytes: Buffer,
    timeoutMs: number,
  ): Promise<string> {
    const controller = new AbortController();
    let timeoutReached = false;
    const timeoutError = new VisionJudgeError({
      code: "timeout",
      message: `Google vision judge request timed out after ${timeoutMs}ms`,
    });

    const operationPromise = (async () => {
      let response: GoogleVisionResponse;
      try {
        response = await this.fetchImpl(this.endpoint(), {
          method: "POST",
          headers: {
            "x-goog-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(this.buildRequestBody(spec, imageBytes)),
          signal: controller.signal,
        });
      } catch (err) {
        if (timeoutReached || isAbortError(err)) {
          throw timeoutError;
        }
        throw new VisionJudgeError({
          code: "http",
          message: `Google vision judge request failed before response: ${formatThrown(err)}`,
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
        throw new VisionJudgeError({
          code: "parse",
          message: `Google vision judge response body was unreadable: ${formatThrown(err)}`,
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
    imageBytes: Buffer,
  ): Record<string, unknown> {
    return {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: "image/png",
                data: imageBytes.toString("base64"),
              },
            },
            { text: buildVisionJudgePrompt(spec) },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    };
  }
}

export function normalizeGoogleVisionModel(model: string): string {
  const trimmed = model.trim();
  const normalized = trimmed.toLowerCase().replaceAll("_", "-").replace(/\s+/g, "-");
  if (
    normalized === "gemini3.1-pro" ||
    normalized === "gemini-3.1-pro" ||
    normalized === "gemini3-pro" ||
    normalized === "gemini-3-pro"
  ) {
    return "gemini-3-pro-preview";
  }
  return trimmed;
}

function parseJudgeResponse(text: string, spec: ImageSpec): JudgeVerdict {
  let parsed: GoogleGeneratePayload;
  try {
    parsed = JSON.parse(text) as GoogleGeneratePayload;
  } catch (err) {
    throw new VisionJudgeError({
      code: "parse",
      message: `Google vision judge response was not valid JSON: ${formatThrown(err)}`,
      cause: err,
    });
  }

  assertNotSafetyBlocked(parsed);

  const parts = parsed.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new VisionJudgeError({
      code: "parse",
      message: "Google vision judge response missing candidates[0].content.parts",
    });
  }

  const textPart = parts.find((part) => typeof part.text === "string");
  if (typeof textPart?.text !== "string" || textPart.text.trim().length === 0) {
    throw new VisionJudgeError({
      code: "parse",
      message: "Google vision judge response missing text verdict part",
    });
  }

  let contentJson: unknown;
  try {
    contentJson = JSON.parse(stripJsonFence(textPart.text));
  } catch (err) {
    throw new VisionJudgeError({
      code: "parse",
      message: `Google vision judge text verdict was not valid JSON: ${formatThrown(err)}`,
      cause: err,
    });
  }

  let verdict: JudgeVerdict;
  try {
    verdict = parseJudgeVerdict(contentJson);
  } catch (err) {
    throw new VisionJudgeError({
      code: "parse",
      message: `Google vision judge returned invalid JudgeVerdict: ${formatThrown(err)}`,
      cause: err,
    });
  }

  assertCriteriaMatchSpec(verdict, spec);
  return verdict;
}

function assertCriteriaMatchSpec(verdict: JudgeVerdict, spec: ImageSpec): void {
  const expectedIds = spec.acceptanceCriteria.map((criterion) => criterion.id);
  const actualIds = verdict.criteria.map((criterion) => criterion.id);
  const expected = new Set(expectedIds);
  const actual = new Set(actualIds);

  if (actualIds.length !== expectedIds.length || actual.size !== actualIds.length) {
    throw criteriaMismatchError(expectedIds, actualIds);
  }

  for (const id of expected) {
    if (!actual.has(id)) {
      throw criteriaMismatchError(expectedIds, actualIds);
    }
  }
}

function criteriaMismatchError(expectedIds: string[], actualIds: string[]): VisionJudgeError {
  return new VisionJudgeError({
    code: "parse",
    message:
      `Google vision judge criterion ids must exactly match spec ids; expected ` +
      `${expectedIds.join(", ")}, got ${actualIds.join(", ")}`,
    cause: new Error("criterion id mismatch"),
  });
}

function assertNotSafetyBlocked(parsed: GoogleGeneratePayload): void {
  const blockReason =
    parsed.promptFeedback?.blockReason ?? parsed.prompt_feedback?.block_reason;
  if (isSafetyReason(blockReason)) {
    throw new VisionJudgeError({
      code: "safety",
      message: `Google vision judge request blocked by prompt feedback: ${String(blockReason)}`,
    });
  }
  const finishReason =
    parsed.candidates?.[0]?.finishReason ?? parsed.candidates?.[0]?.finish_reason;
  if (isSafetyReason(finishReason)) {
    throw new VisionJudgeError({
      code: "safety",
      message: `Google vision judge response blocked by finish reason: ${String(finishReason)}`,
    });
  }
}

function stripJsonFence(content: string): string {
  const match = content.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i);
  return match ? match[1] : content.trim();
}

function httpResponseError(
  response: GoogleVisionResponse,
  body: string,
  options: { classifySafety?: boolean } = {},
): VisionJudgeError {
  const bodyTail = tail(body, bodyTailMaxChars);
  const classifySafety = options.classifySafety ?? true;
  const code = classifySafety && safetyTermsPresent(body) ? "safety" : "http";
  return new VisionJudgeError({
    code,
    status: response.status,
    bodyTail,
    message: `Google vision judge request failed with status ${response.status}${
      response.statusText ? ` ${response.statusText}` : ""
    }: ${bodyTail}`,
  });
}

function safetyTermsPresent(text: string): boolean {
  return /(block_reason|safety|policy|content_policy|moderation|unsafe|prohibited|refusal)/i.test(text);
}

function isSafetyReason(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /(safety|policy|prohibited|blocked|block_reason|content_filter)/i.test(value)
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
