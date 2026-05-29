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

export interface OpenAiVisionResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText?: string;
  text(): Promise<string>;
}

export type OpenAiVisionFetch = (
  url: string,
  init: RequestInit,
) => Promise<OpenAiVisionResponse>;

export interface OpenAiVisionJudgeOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: OpenAiVisionFetch;
}

interface OpenAiChatPayload {
  choices?: unknown;
}

interface OpenAiChoicePayload {
  finish_reason?: unknown;
  message?: unknown;
}

interface OpenAiMessagePayload {
  content?: unknown;
  refusal?: unknown;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1/chat/completions";
const bodyTailMaxChars = 500;

export class OpenAiVisionJudge implements VisionJudge {
  readonly name = "openai-vision-judge";

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: OpenAiVisionFetch;

  constructor(options: OpenAiVisionJudgeOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl =
      options.fetchImpl ??
      ((url, init) => fetch(url, init) as Promise<OpenAiVisionResponse>);
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
      message: `OpenAI vision judge request timed out after ${timeoutMs}ms`,
    });

    const operationPromise = (async () => {
      let response: OpenAiVisionResponse;
      try {
        response = await this.fetchImpl(this.baseUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
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
          message: `OpenAI vision judge request failed before response: ${formatThrown(err)}`,
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
          message: `OpenAI vision judge response body was unreadable: ${formatThrown(err)}`,
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
    imageBytes: Buffer,
  ): Record<string, unknown> {
    return {
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a strict vision QA judge. Return only JSON matching JudgeVerdict: overallPass, criteria[], and optional regenerateFeedback. Do not include prose.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: buildVisionJudgePrompt(spec) },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${imageBytes.toString("base64")}`,
              },
            },
          ],
        },
      ],
    };
  }
}

export function buildVisionJudgePrompt(spec: ImageSpec): string {
  const criteria = spec.acceptanceCriteria
    .map(
      (criterion) =>
        `- ${criterion.id} [${criterion.tier}]: ${criterion.description}`,
    )
    .join("\n");

  return [
    "Judge the attached image against this explicit image spec.",
    "",
    `Original prompt: ${spec.promptOriginal}`,
    `Subject: ${spec.subject}`,
    `Style: ${spec.style}`,
    `Composition: ${spec.composition}`,
    `Palette: ${spec.palette.join(", ")}`,
    `Dimensions: ${spec.dimensions.w}x${spec.dimensions.h}`,
    `Negative constraints: ${spec.negativeConstraints.join("; ")}`,
    `Safety profile: ${spec.safetyProfile}`,
    `Acceptance criteria:\n${criteria}`,
    "",
    "Return exactly one criteria row for every acceptance criterion id above.",
    "Use the same ids, no missing ids, no extra ids. Mechanical criteria may be echoed as already checked if they cannot be visually verified.",
    "overallPass must equal whether every criterion pass value is true. If any criterion fails, include concise regenerateFeedback.",
  ].join("\n");
}

function parseJudgeResponse(text: string, spec: ImageSpec): JudgeVerdict {
  let parsed: OpenAiChatPayload;
  try {
    parsed = JSON.parse(text) as OpenAiChatPayload;
  } catch (err) {
    throw new VisionJudgeError({
      code: "parse",
      message: `OpenAI vision judge response was not valid JSON: ${formatThrown(err)}`,
      cause: err,
    });
  }

  const choice = parseFirstChoice(parsed.choices);
  if (choice.finish_reason === "content_filter") {
    throw new VisionJudgeError({
      code: "safety",
      message: "OpenAI vision judge response was blocked by content_filter",
    });
  }

  const message = parseMessage(choice.message);
  if (hasRefusal(message.refusal)) {
    throw new VisionJudgeError({
      code: "safety",
      message: "OpenAI vision judge response contained a refusal",
    });
  }

  if (typeof message.content !== "string" || message.content.trim().length === 0) {
    throw new VisionJudgeError({
      code: "parse",
      message: "OpenAI vision judge response missing choices[0].message.content",
    });
  }

  let contentJson: unknown;
  try {
    contentJson = JSON.parse(stripJsonFence(message.content));
  } catch (err) {
    throw new VisionJudgeError({
      code: "parse",
      message: `OpenAI vision judge message content was not valid JSON: ${formatThrown(err)}`,
      cause: err,
    });
  }

  let verdict: JudgeVerdict;
  try {
    verdict = parseJudgeVerdict(contentJson);
  } catch (err) {
    throw new VisionJudgeError({
      code: "parse",
      message: `OpenAI vision judge returned invalid JudgeVerdict: ${formatThrown(err)}`,
      cause: err,
    });
  }

  assertCriteriaMatchSpec(verdict, spec);
  return verdict;
}

function parseFirstChoice(value: unknown): OpenAiChoicePayload {
  if (!Array.isArray(value) || value.length === 0) {
    throw new VisionJudgeError({
      code: "parse",
      message: "OpenAI vision judge response missing choices[0]",
    });
  }
  const choice = value[0];
  if (typeof choice !== "object" || choice === null || Array.isArray(choice)) {
    throw new VisionJudgeError({
      code: "parse",
      message: "OpenAI vision judge choices[0] must be an object",
    });
  }
  return choice as OpenAiChoicePayload;
}

function parseMessage(value: unknown): OpenAiMessagePayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new VisionJudgeError({
      code: "parse",
      message: "OpenAI vision judge response missing choices[0].message",
    });
  }
  return value as OpenAiMessagePayload;
}

function stripJsonFence(content: string): string {
  const match = content.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i);
  return match ? match[1] : content.trim();
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
      `OpenAI vision judge criterion ids must exactly match spec ids; expected ` +
      `${expectedIds.join(", ")}, got ${actualIds.join(", ")}`,
    cause: new Error("criterion id mismatch"),
  });
}

function httpResponseError(
  response: OpenAiVisionResponse,
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
    message: `OpenAI vision judge request failed with status ${response.status}${
      response.statusText ? ` ${response.statusText}` : ""
    }: ${bodyTail}`,
  });
}

function safetyTermsPresent(text: string): boolean {
  return /(content_policy|safety|policy|moderation|unsafe|refusal)/i.test(text);
}

function hasRefusal(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim().length > 0;
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
  OpenAiVisionJudge as OpenAIVisionJudge,
  type OpenAiVisionFetch as OpenAIVisionFetch,
  type OpenAiVisionJudgeOptions as OpenAIVisionJudgeOptions,
  type OpenAiVisionResponse as OpenAIVisionResponse,
};
