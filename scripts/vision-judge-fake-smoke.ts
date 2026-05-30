import {
  mkdirSync,
  readFileSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FakeVisionJudge } from "../src/llm/vision-judge-fake.ts";
import { GoogleVisionJudge } from "../src/llm/vision-judge-google.ts";
import {
  OpenAIVisionJudge,
  type OpenAIVisionFetch,
  type OpenAIVisionResponse,
} from "../src/llm/vision-judge-openai.ts";
import { FallbackVisionJudge } from "../src/llm/provider-fallback.ts";
import {
  VisionJudgeError,
  type VisionJudgeErrorCode,
} from "../src/llm/vision-judge.ts";
import type { ImageSpec } from "../src/pipeline/image/spec.ts";
import {
  JudgeVerdictParseError,
  type JudgeVerdict,
} from "../src/pipeline/image/verdict.ts";

type ScenarioName =
  | "fake-scripted-pass"
  | "fake-fail-then-pass"
  | "fake-failure-injection"
  | "fake-rejects-relative-path"
  | "fake-deterministic-no-mutation"
  | "openai-builds-vision-request"
  | "openai-parses-fenced-json"
  | "openai-timeout"
  | "openai-http-error-tail"
  | "openai-safety-error"
  | "openai-content-filter-safety"
  | "openai-message-refusal-safety"
  | "openai-fetch-rejection"
  | "openai-image-read-error"
  | "openai-parse-invalid-json-response"
  | "openai-parse-missing-message"
  | "openai-parse-invalid-verdict"
  | "openai-parse-criteria-id-mismatch"
  | "openai-rejects-relative-path"
  | "google-builds-vision-request"
  | "google-model-unavailable-fallback"
  | "google-parses-string-wrapped-verdict"
  | "google-parses-deep-string-wrapped-verdict"
  | "google-parses-single-array-wrapped-verdict"
  | "google-parses-criteria-array-verdict"
  | "google-parses-ordered-criteria-array-verdict"
  | "google-safety-error"
  | "google-parse-invalid-verdict"
  | "google-rejects-relative-path"
  | "vision-judge-fallback-logs-and-skips-safety"
  | "vision-judge-static-boundary-check";

interface ScenarioOutcome {
  name: ScenarioName;
  status: "PASS" | "FAIL";
  details: string[];
  startedAtIso: string;
  finishedAtIso: string;
}

interface CapturedRequest {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

const SCENARIOS: readonly ScenarioName[] = [
  "fake-scripted-pass",
  "fake-fail-then-pass",
  "fake-failure-injection",
  "fake-rejects-relative-path",
  "fake-deterministic-no-mutation",
  "openai-builds-vision-request",
  "openai-parses-fenced-json",
  "openai-timeout",
  "openai-http-error-tail",
  "openai-safety-error",
  "openai-content-filter-safety",
  "openai-message-refusal-safety",
  "openai-fetch-rejection",
  "openai-image-read-error",
  "openai-parse-invalid-json-response",
  "openai-parse-missing-message",
  "openai-parse-invalid-verdict",
  "openai-parse-criteria-id-mismatch",
  "openai-rejects-relative-path",
  "google-builds-vision-request",
  "google-model-unavailable-fallback",
  "google-parses-string-wrapped-verdict",
  "google-parses-deep-string-wrapped-verdict",
  "google-parses-single-array-wrapped-verdict",
  "google-parses-criteria-array-verdict",
  "google-parses-ordered-criteria-array-verdict",
  "google-safety-error",
  "google-parse-invalid-verdict",
  "google-rejects-relative-path",
  "vision-judge-fallback-logs-and-skips-safety",
  "vision-judge-static-boundary-check",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = resolve(
  repoRoot,
  ".runs",
  "vision-judge-fake-smoke",
  new Date().toISOString().replaceAll(":", "-"),
);
const docPath = resolve(
  repoRoot,
  "docs",
  "preflight",
  "vision-judge-fake-smoke.md",
);
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

async function main(): Promise<number> {
  mkdirSync(smokeRoot, { recursive: true });
  const outcomes: ScenarioOutcome[] = [];

  try {
    for (const name of SCENARIOS) {
      outcomes.push(await runScenario(name));
    }
  } finally {
    writeEvidence(outcomes);
    rmSync(smokeRoot, { recursive: true, force: true });
    removeEmptyDir(resolve(repoRoot, ".runs", "vision-judge-fake-smoke"));
    removeEmptyDir(resolve(repoRoot, ".runs"));
  }

  for (const outcome of outcomes) {
    console.log(`${outcome.status} ${outcome.name}`);
    for (const detail of outcome.details) {
      console.log(`  - ${detail}`);
    }
  }

  const passed = outcomes.filter((outcome) => outcome.status === "PASS").length;
  console.log(`${passed}/${outcomes.length} PASS`);
  return passed === outcomes.length ? 0 : 1;
}

async function runScenario(name: ScenarioName): Promise<ScenarioOutcome> {
  const startedAtIso = new Date().toISOString();
  const runDir = resolve(smokeRoot, name);
  mkdirSync(runDir, { recursive: true });

  try {
    const details = await scenarioImpl(name, runDir);
    return {
      name,
      status: "PASS",
      details,
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
    };
  } catch (err) {
    return {
      name,
      status: "FAIL",
      details: [formatError(err)],
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
    };
  }
}

async function scenarioImpl(
  name: ScenarioName,
  runDir: string,
): Promise<string[]> {
  switch (name) {
    case "fake-scripted-pass":
      return fakeScriptedPass(runDir);
    case "fake-fail-then-pass":
      return fakeFailThenPass(runDir);
    case "fake-failure-injection":
      return fakeFailureInjection(runDir);
    case "fake-rejects-relative-path":
      return fakeRejectsRelativePath();
    case "fake-deterministic-no-mutation":
      return fakeDeterministicNoMutation(runDir);
    case "openai-builds-vision-request":
      return openaiBuildsVisionRequest(runDir);
    case "openai-parses-fenced-json":
      return openaiParsesFencedJson(runDir);
    case "openai-timeout":
      return openaiTimeout(runDir);
    case "openai-http-error-tail":
      return openaiHttpErrorTail(runDir);
    case "openai-safety-error":
      return openaiSafetyError(runDir);
    case "openai-content-filter-safety":
      return openaiContentFilterSafety(runDir);
    case "openai-message-refusal-safety":
      return openaiMessageRefusalSafety(runDir);
    case "openai-fetch-rejection":
      return openaiFetchRejection(runDir);
    case "openai-image-read-error":
      return openaiImageReadError(runDir);
    case "openai-parse-invalid-json-response":
      return openaiParseInvalidJsonResponse(runDir);
    case "openai-parse-missing-message":
      return openaiParseMissingMessage(runDir);
    case "openai-parse-invalid-verdict":
      return openaiParseInvalidVerdict(runDir);
    case "openai-parse-criteria-id-mismatch":
      return openaiParseCriteriaIdMismatch(runDir);
    case "openai-rejects-relative-path":
      return openaiRejectsRelativePath();
    case "google-builds-vision-request":
      return googleBuildsVisionRequest(runDir);
    case "google-model-unavailable-fallback":
      return googleModelUnavailableFallback(runDir);
    case "google-parses-string-wrapped-verdict":
      return googleParsesStringWrappedVerdict(runDir);
    case "google-parses-deep-string-wrapped-verdict":
      return googleParsesDeepStringWrappedVerdict(runDir);
    case "google-parses-single-array-wrapped-verdict":
      return googleParsesSingleArrayWrappedVerdict(runDir);
    case "google-parses-criteria-array-verdict":
      return googleParsesCriteriaArrayVerdict(runDir);
    case "google-parses-ordered-criteria-array-verdict":
      return googleParsesOrderedCriteriaArrayVerdict(runDir);
    case "google-safety-error":
      return googleSafetyError(runDir);
    case "google-parse-invalid-verdict":
      return googleParseInvalidVerdict(runDir);
    case "google-rejects-relative-path":
      return googleRejectsRelativePath();
    case "vision-judge-fallback-logs-and-skips-safety":
      return visionJudgeFallbackLogsAndSkipsSafety(runDir);
    case "vision-judge-static-boundary-check":
      return visionJudgeStaticBoundaryCheck();
  }
}

async function fakeScriptedPass(runDir: string): Promise<string[]> {
  const judge = new FakeVisionJudge({ verdicts: [passingVerdict()] });
  const imagePath = writeImage(runDir, "image.png");
  const verdict = await judge.judge(imagePath, validSpec(), 500);

  assert(verdict.overallPass, "expected passing verdict");
  assert(judge.calls.length === 1, "fake judge should record one call");
  assert(judge.calls[0].imageAbsolutePath === imagePath, "fake call should record image path");
  assert(judge.calls[0].timeoutMs === 500, "fake call should record timeout");
  return ["Fake judge returned the explicit passing verdict and recorded the call."];
}

async function fakeFailThenPass(runDir: string): Promise<string[]> {
  const judge = new FakeVisionJudge({
    verdicts: [failingVerdict(), passingVerdict()],
  });
  const imagePath = writeImage(runDir, "image.png");
  const first = await judge.judge(imagePath, validSpec(), 500);
  const second = await judge.judge(imagePath, validSpec(), 500);

  assert(!first.overallPass, "first verdict should fail");
  assert(
    first.regenerateFeedback === "clarify the handoff queue and remove patient identifiers",
    "failing verdict should preserve regenerateFeedback",
  );
  assert(second.overallPass, "second verdict should pass");
  assert(judge.calls.length === 2, "fake judge should record both calls");
  return ["Queued fake verdicts drove fail then pass and preserved regenerateFeedback."];
}

async function fakeFailureInjection(runDir: string): Promise<string[]> {
  const codes: VisionJudgeErrorCode[] = ["timeout", "http", "parse", "safety"];
  const imagePath = writeImage(runDir, "image.png");

  for (const code of codes) {
    const judge = new FakeVisionJudge({
      verdicts: [passingVerdict()],
      failWith: code,
    });
    const error = await captureVisionJudgeError(() =>
      judge.judge(imagePath, validSpec(), 500),
    );
    assert(error.code === code, `expected ${code}, got ${error.code}`);
    assert(judge.calls.length === 1, `fake ${code} failure should record call`);
  }

  return ["Fake judge injected timeout/http/parse/safety failures and recorded each call."];
}

async function fakeRejectsRelativePath(): Promise<string[]> {
  const judge = new FakeVisionJudge({ verdicts: [passingVerdict()] });
  const error = await captureVisionJudgeError(() =>
    judge.judge("relative.png", validSpec(), 500),
  );

  assert(error.code === "parse", `expected parse, got ${error.code}`);
  assert(judge.calls.length === 1, "relative-path rejection should record call");
  return ["Fake judge rejects relative image paths with parse after recording the call."];
}

async function fakeDeterministicNoMutation(runDir: string): Promise<string[]> {
  const judge = new FakeVisionJudge({
    verdicts: [passingVerdict(), passingVerdict()],
  });
  const imagePath = writeImage(runDir, "image.png");
  const first = await judge.judge(imagePath, validSpec(), 500);
  first.criteria[0].rationale = "caller mutation";
  const second = await judge.judge(imagePath, validSpec(), 500);

  assert(
    second.criteria[0].rationale === "handoff queue is visually dominant",
    "caller mutation should not affect queued verdicts",
  );
  return ["Fake judge returns deep clones; caller mutation did not alter the queued verdict."];
}

async function openaiBuildsVisionRequest(runDir: string): Promise<string[]> {
  const spec = validSpec();
  const imagePath = writeImage(runDir, "image.png");
  const { fetchImpl, requests } = captureFetch(chatResponse(passingVerdict()));
  const judge = new OpenAIVisionJudge({
    apiKey: "test-key",
    model: "gpt-vision-test",
    baseUrl: "https://vision.example.test/chat/",
    fetchImpl,
  });

  const verdict = await judge.judge(imagePath, spec, 1_000);
  assert(verdict.overallPass, "expected passing verdict");
  assert(requests.length === 1, "expected one OpenAI request");
  assert(
    requests[0].url === "https://vision.example.test/chat",
    "baseUrl should be treated as the full endpoint and trim trailing slash",
  );
  assert(requests[0].init.method === "POST", "request should use POST");
  const headers = requests[0].init.headers as Record<string, string>;
  assert(headers.Authorization === "Bearer test-key", "request should include bearer auth");
  assert(headers["Content-Type"] === "application/json", "request should send JSON");
  assert(requests[0].body.model === "gpt-vision-test", "request should preserve model");
  assertJsonObjectResponseFormat(requests[0].body.response_format);
  const prompt = extractPromptText(requests[0].body);
  for (const value of [
    spec.promptOriginal,
    spec.subject,
    spec.style,
    spec.composition,
    ...spec.palette,
    `${spec.dimensions.w}x${spec.dimensions.h}`,
    ...spec.negativeConstraints,
    spec.safetyProfile,
    ...spec.acceptanceCriteria.flatMap((criterion) => [
      criterion.id,
      criterion.description,
      criterion.tier,
    ]),
  ]) {
    assert(prompt.includes(value), `prompt should include ${value}`);
  }
  assert(prompt.includes("exactly one criteria row"), "prompt should require exact criteria rows");
  assert(extractImageUrl(requests[0].body).startsWith("data:image/png;base64,"), "request should include PNG data URL");
  return ["OpenAI judge built chat-completions JSON-mode request with auth, prompt criteria, and PNG data URL."];
}

async function openaiParsesFencedJson(runDir: string): Promise<string[]> {
  const imagePath = writeImage(runDir, "image.png");
  const { fetchImpl } = captureFetch(
    chatResponseText(`\`\`\`json\n${JSON.stringify(passingVerdict())}\n\`\`\``),
  );
  const judge = new OpenAIVisionJudge({
    apiKey: "test-key",
    model: "gpt-vision-test",
    fetchImpl,
  });
  const verdict = await judge.judge(imagePath, validSpec(), 1_000);

  assert(verdict.overallPass, "fenced verdict should parse as passing");
  return ["OpenAI judge parsed a single fenced json block through parseJudgeVerdict."];
}

async function openaiTimeout(runDir: string): Promise<string[]> {
  const imagePath = writeImage(runDir, "image.png");
  const preResponseFetch: OpenAIVisionFetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  const preResponseJudge = new OpenAIVisionJudge({
    apiKey: "test-key",
    model: "gpt-vision-test",
    fetchImpl: preResponseFetch,
  });
  const preResponseError = await captureVisionJudgeError(() =>
    preResponseJudge.judge(imagePath, validSpec(), 1),
  );
  assert(preResponseError.code === "timeout", `expected timeout, got ${preResponseError.code}`);

  const bodyReadJudge = new OpenAIVisionJudge({
    apiKey: "test-key",
    model: "gpt-vision-test",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async text(): Promise<string> {
        return new Promise(() => undefined);
      },
    }),
  });
  const bodyReadError = await captureVisionJudgeError(() =>
    bodyReadJudge.judge(imagePath, validSpec(), 1),
  );
  assert(bodyReadError.code === "timeout", `expected body-read timeout, got ${bodyReadError.code}`);
  return ["OpenAI judge maps pre-response and body-read timeout to timeout."];
}

async function openaiHttpErrorTail(runDir: string): Promise<string[]> {
  const imagePath = writeImage(runDir, "image.png");
  const readableJudge = new OpenAIVisionJudge({
    apiKey: "test-key",
    model: "gpt-vision-test",
    fetchImpl: captureFetch(textResponse(`${"x".repeat(600)}tail-marker`, 503, "Unavailable")).fetchImpl,
  });
  const readableError = await captureVisionJudgeError(() =>
    readableJudge.judge(imagePath, validSpec(), 1_000),
  );
  assert(readableError.code === "http", `expected http, got ${readableError.code}`);
  assert(readableError.status === 503, "expected status 503");
  assert(readableError.bodyTail?.includes("tail-marker") === true, "expected tail marker");

  const unreadableJudge = new OpenAIVisionJudge({
    apiKey: "test-key",
    model: "gpt-vision-test",
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      statusText: "Server Error",
      async text(): Promise<string> {
        throw new Error("content_policy stream failed");
      },
    }),
  });
  const unreadableError = await captureVisionJudgeError(() =>
    unreadableJudge.judge(imagePath, validSpec(), 1_000),
  );
  assert(unreadableError.code === "http", `expected http, got ${unreadableError.code}`);
  assert(unreadableError.bodyTail?.includes("content_policy stream failed") === true, "expected unreadable body tail");
  return ["Readable non-2xx maps http with bounded tail; unreadable non-2xx stays http even with content_policy in thrown text."];
}

async function openaiSafetyError(runDir: string): Promise<string[]> {
  const imagePath = writeImage(runDir, "image.png");
  const markers = [
    "content_policy_violation",
    "safety_policy_violation",
    "unsafe_image",
    "refusal",
  ] as const;

  for (const marker of markers) {
    const judge = new OpenAIVisionJudge({
      apiKey: "test-key",
      model: "gpt-vision-test",
      fetchImpl: captureFetch(
        textResponse(`${marker} ${"x".repeat(600)}tail-only`, 400, "Bad Request"),
      ).fetchImpl,
    });
    const error = await captureVisionJudgeError(() =>
      judge.judge(imagePath, validSpec(), 1_000),
    );

    assert(error.code === "safety", `expected safety for ${marker}, got ${error.code}`);
    assert(error.bodyTail?.includes("tail-only") === true, "expected retained tail");
    assert(error.bodyTail?.includes(marker) === false, "marker should be outside retained tail");
  }
  return ["Readable full body safety/refusal markers, including suffixed policy variants, map safety even when outside the retained tail."];
}

async function openaiContentFilterSafety(runDir: string): Promise<string[]> {
  const judge = new OpenAIVisionJudge({
    apiKey: "test-key",
    model: "gpt-vision-test",
    fetchImpl: captureFetch(chatResponseText("{}", "content_filter")).fetchImpl,
  });
  const error = await captureVisionJudgeError(() =>
    judge.judge(writeImage(runDir, "image.png"), validSpec(), 1_000),
  );

  assert(error.code === "safety", `expected safety, got ${error.code}`);
  return ["2xx finish_reason=content_filter maps to safety."];
}

async function openaiMessageRefusalSafety(runDir: string): Promise<string[]> {
  const judge = new OpenAIVisionJudge({
    apiKey: "test-key",
    model: "gpt-vision-test",
    fetchImpl: captureFetch(chatResponseWithRefusal("I cannot evaluate this image")).fetchImpl,
  });
  const error = await captureVisionJudgeError(() =>
    judge.judge(writeImage(runDir, "image.png"), validSpec(), 1_000),
  );

  assert(error.code === "safety", `expected safety, got ${error.code}`);
  return ["2xx non-empty message.refusal maps to safety."];
}

async function openaiFetchRejection(runDir: string): Promise<string[]> {
  const judge = new OpenAIVisionJudge({
    apiKey: "test-key",
    model: "gpt-vision-test",
    fetchImpl: async () => {
      throw new Error("socket closed");
    },
  });
  const error = await captureVisionJudgeError(() =>
    judge.judge(writeImage(runDir, "image.png"), validSpec(), 1_000),
  );

  assert(error.code === "http", `expected http, got ${error.code}`);
  assert(error.cause instanceof Error, "fetch rejection should be preserved as cause");
  return ["OpenAI fetch rejection maps to http with cause."];
}

async function openaiImageReadError(runDir: string): Promise<string[]> {
  let fetchCalled = false;
  const judge = new OpenAIVisionJudge({
    apiKey: "test-key",
    model: "gpt-vision-test",
    fetchImpl: async () => {
      fetchCalled = true;
      return chatResponse(passingVerdict());
    },
  });
  const error = await captureVisionJudgeError(() =>
    judge.judge(resolve(runDir, "missing.png"), validSpec(), 1_000),
  );

  assert(error.code === "parse", `expected parse, got ${error.code}`);
  assert(error.cause instanceof Error, "fs read error should be preserved as cause");
  assert(!fetchCalled, "image read failure should happen before fetch");
  return ["Missing absolute image file maps to parse with fs cause and no fetch."];
}

async function openaiParseInvalidJsonResponse(runDir: string): Promise<string[]> {
  const judge = new OpenAIVisionJudge({
    apiKey: "test-key",
    model: "gpt-vision-test",
    fetchImpl: captureFetch(textResponse("{ nope", 200, "OK")).fetchImpl,
  });
  const error = await captureVisionJudgeError(() =>
    judge.judge(writeImage(runDir, "image.png"), validSpec(), 1_000),
  );

  assert(error.code === "parse", `expected parse, got ${error.code}`);
  return ["Malformed chat-completions JSON maps to parse."];
}

async function openaiParseMissingMessage(runDir: string): Promise<string[]> {
  const judge = new OpenAIVisionJudge({
    apiKey: "test-key",
    model: "gpt-vision-test",
    fetchImpl: captureFetch(jsonResponse({ choices: [{}] })).fetchImpl,
  });
  const error = await captureVisionJudgeError(() =>
    judge.judge(writeImage(runDir, "image.png"), validSpec(), 1_000),
  );

  assert(error.code === "parse", `expected parse, got ${error.code}`);
  return ["Response missing choices[0].message.content maps to parse."];
}

async function openaiParseInvalidVerdict(runDir: string): Promise<string[]> {
  const judge = new OpenAIVisionJudge({
    apiKey: "test-key",
    model: "gpt-vision-test",
    fetchImpl: captureFetch(chatResponseText(JSON.stringify({ overallPass: "yes", criteria: [] }))).fetchImpl,
  });
  const error = await captureVisionJudgeError(() =>
    judge.judge(writeImage(runDir, "image.png"), validSpec(), 1_000),
  );

  assert(error.code === "parse", `expected parse, got ${error.code}`);
  assert(error.cause instanceof JudgeVerdictParseError, "expected JudgeVerdictParseError cause");
  assert(error.cause.code === "JUDGE_VERDICT_INVALID", "expected preserved cause code");
  return ["Invalid JudgeVerdict maps to parse and preserves JUDGE_VERDICT_INVALID cause."];
}

async function openaiParseCriteriaIdMismatch(runDir: string): Promise<string[]> {
  const spec = validSpec();
  const imagePath = writeImage(runDir, "image.png");
  const variants: [string, JudgeVerdict][] = [
    [
      "missing",
      {
        overallPass: true,
        criteria: [{ id: "subject-visible", pass: true, rationale: "ok" }],
      },
    ],
    [
      "extra",
      {
        overallPass: true,
        criteria: [
          ...passingVerdict().criteria,
          { id: "extra-id", pass: true, rationale: "extra" },
        ],
      },
    ],
    [
      "wrong",
      {
        overallPass: true,
        criteria: [
          { id: "wrong-id", pass: true, rationale: "wrong" },
          { id: "no-identifiers", pass: true, rationale: "ok" },
        ],
      },
    ],
  ];

  for (const [label, verdict] of variants) {
    const judge = new OpenAIVisionJudge({
      apiKey: "test-key",
      model: "gpt-vision-test",
      fetchImpl: captureFetch(chatResponse(verdict)).fetchImpl,
    });
    const error = await captureVisionJudgeError(() =>
      judge.judge(imagePath, spec, 1_000),
    );
    assert(error.code === "parse", `expected ${label} mismatch to map parse, got ${error.code}`);
  }

  return ["Criterion id mismatch smoke covered missing, extra, and wrong id variants as parse."];
}

async function openaiRejectsRelativePath(): Promise<string[]> {
  let fetchCalled = false;
  const judge = new OpenAIVisionJudge({
    apiKey: "test-key",
    model: "gpt-vision-test",
    fetchImpl: async () => {
      fetchCalled = true;
      return chatResponse(passingVerdict());
    },
  });
  const error = await captureVisionJudgeError(() =>
    judge.judge("relative.png", validSpec(), 1_000),
  );

  assert(error.code === "parse", `expected parse, got ${error.code}`);
  assert(!fetchCalled, "relative path should fail before fetch");
  return ["OpenAI judge rejects relative image paths before fetch."];
}

async function googleBuildsVisionRequest(runDir: string): Promise<string[]> {
  const spec = validSpec();
  const imagePath = writeImage(runDir, "google-image.png");
  const { fetchImpl, requests } = captureFetch(googleGenerateResponse(passingVerdict()));
  const judge = new GoogleVisionJudge({
    apiKey: "google-key",
    model: "gemini3.1-pro",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models/",
    fetchImpl,
  });

  const verdict = await judge.judge(imagePath, spec, 1_000);
  assert(verdict.overallPass, "expected passing verdict");
  assert(requests.length === 1, "expected one Google request");
  assert(
    requests[0].url ===
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent",
    `unexpected Google URL: ${requests[0].url}`,
  );
  assert(requests[0].init.method === "POST", "request should use POST");
  const headers = requests[0].init.headers as Record<string, string>;
  assert(headers["x-goog-api-key"] === "google-key", "request should include x-goog-api-key");
  assert(headers["Content-Type"] === "application/json", "request should send JSON");
  assertGoogleJsonResponseConfig(requests[0].body.generationConfig);
  const parts = extractGoogleParts(requests[0].body);
  assert(parts[0]?.inline_data?.mime_type === "image/png", "request should include PNG inline data");
  assert(typeof parts[0]?.inline_data?.data === "string", "request should include base64 image data");
  const prompt = String(parts[1]?.text ?? "");
  for (const value of [
    spec.promptOriginal,
    spec.subject,
    spec.style,
    spec.composition,
    ...spec.palette,
    `${spec.dimensions.w}x${spec.dimensions.h}`,
    ...spec.negativeConstraints,
    spec.safetyProfile,
    ...spec.acceptanceCriteria.flatMap((criterion) => [
      criterion.id,
      criterion.description,
      criterion.tier,
    ]),
  ]) {
    assert(prompt.includes(value), `prompt should include ${value}`);
  }
  return ["Google judge mapped Gemini 3.1 Pro alias to gemini-3-pro-preview and built a JSON request with PNG inline data."];
}

async function googleModelUnavailableFallback(runDir: string): Promise<string[]> {
  const spec = validSpec();
  const imagePath = writeImage(runDir, "google-fallback.png");
  const requests: CapturedRequest[] = [];
  const fetchImpl: OpenAIVisionFetch = async (url, init) => {
    requests.push({
      url,
      init,
      body: JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>,
    });
    if (requests.length === 1) {
      return jsonResponse(
        {
          error: {
            code: 404,
            message: "This model models/gemini-3-pro-preview is no longer available.",
            status: "NOT_FOUND",
          },
        },
        404,
      );
    }
    return googleGenerateResponse(passingVerdict());
  };
  const judge = new GoogleVisionJudge({
    apiKey: "google-key",
    model: "gemini3.1-pro",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    fetchImpl,
  });

  const verdict = await judge.judge(imagePath, spec, 1_000);
  assert(verdict.overallPass, "expected fallback verdict to pass");
  assert(requests.length === 2, "expected one unavailable request plus one fallback request");
  assert(
    requests[0].url.endsWith("/gemini-3-pro-preview:generateContent"),
    `unexpected primary URL: ${requests[0].url}`,
  );
  assert(
    requests[1].url.endsWith("/gemini-2.5-pro:generateContent"),
    `unexpected fallback URL: ${requests[1].url}`,
  );
  return ["Google judge falls back from unavailable Gemini 3 alias to stable gemini-2.5-pro."];
}

async function googleParsesStringWrappedVerdict(runDir: string): Promise<string[]> {
  const judge = new GoogleVisionJudge({
    apiKey: "google-key",
    model: "gemini-2.5-pro",
    fetchImpl: captureFetch(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(JSON.stringify(passingVerdict())) }],
            },
          },
        ],
      }),
    ).fetchImpl,
  });

  const verdict = await judge.judge(
    writeImage(runDir, "string-wrapped.png"),
    validSpec(),
    1_000,
  );
  assert(verdict.overallPass, "expected string-wrapped verdict to pass");
  return ["Google judge parses JSON-string-wrapped verdict text before strict validation."];
}

async function googleParsesDeepStringWrappedVerdict(runDir: string): Promise<string[]> {
  const judge = new GoogleVisionJudge({
    apiKey: "google-key",
    model: "gemini-2.5-pro",
    fetchImpl: captureFetch(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify(
                    JSON.stringify(JSON.stringify(passingVerdict())),
                  ),
                },
              ],
            },
          },
        ],
      }),
    ).fetchImpl,
  });

  const verdict = await judge.judge(
    writeImage(runDir, "deep-string-wrapped.png"),
    validSpec(),
    1_000,
  );
  assert(verdict.overallPass, "expected deep string-wrapped verdict to pass");
  return ["Google judge unwraps repeated JSON-string verdict layers before strict validation."];
}

async function googleParsesSingleArrayWrappedVerdict(runDir: string): Promise<string[]> {
  const judge = new GoogleVisionJudge({
    apiKey: "google-key",
    model: "gemini-2.5-pro",
    fetchImpl: captureFetch(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify([passingVerdict()]) }],
            },
          },
        ],
      }),
    ).fetchImpl,
  });

  const verdict = await judge.judge(
    writeImage(runDir, "single-array-wrapped.png"),
    validSpec(),
    1_000,
  );
  assert(verdict.overallPass, "expected single-array-wrapped verdict to pass");
  return ["Google judge unwraps one-item verdict arrays before strict validation."];
}

async function googleParsesCriteriaArrayVerdict(runDir: string): Promise<string[]> {
  const judge = new GoogleVisionJudge({
    apiKey: "google-key",
    model: "gemini-2.5-pro",
    fetchImpl: captureFetch(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    { overallPass: true },
                    {
                      criterion_id: "subject-visible",
                      passed: true,
                      score: 0.92,
                      reason: "handoff queue is visually dominant",
                    },
                    {
                      criterionId: "no-identifiers",
                      pass: true,
                      rationale: "no patient-identifying text is visible",
                    },
                  ]),
                },
              ],
            },
          },
        ],
      }),
    ).fetchImpl,
  });

  const verdict = await judge.judge(
    writeImage(runDir, "criteria-array.png"),
    validSpec(),
    1_000,
  );
  assert(verdict.overallPass, "expected criteria-array verdict to pass");
  assert(verdict.criteria.length === 2, "expected exact spec criterion coverage");
  return ["Google judge synthesizes JudgeVerdict from exact-id criterion arrays plus summary rows."];
}

async function googleParsesOrderedCriteriaArrayVerdict(runDir: string): Promise<string[]> {
  const judge = new GoogleVisionJudge({
    apiKey: "google-key",
    model: "gemini-2.5-pro",
    fetchImpl: captureFetch(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    {
                      criterion: "The handoff queue is the dominant visual subject.",
                      verdict: "PASS",
                      assessment: "handoff queue is visually dominant",
                    },
                    {
                      criterion: "No patient-identifying text appears.",
                      status: "met",
                      comments: "no patient-identifying text is visible",
                    },
                  ]),
                },
              ],
            },
          },
        ],
      }),
    ).fetchImpl,
  });

  const verdict = await judge.judge(
    writeImage(runDir, "ordered-criteria-array.png"),
    validSpec(),
    1_000,
  );
  assert(verdict.overallPass, "expected ordered criteria-array verdict to pass");
  assert(verdict.criteria[0].id === "subject-visible", "expected first spec id");
  assert(verdict.criteria[1].id === "no-identifiers", "expected second spec id");
  return ["Google judge synthesizes JudgeVerdict from ordered criterion arrays when row count exactly matches the spec."];
}

async function googleSafetyError(runDir: string): Promise<string[]> {
  const judge = new GoogleVisionJudge({
    apiKey: "google-key",
    model: "gemini-3.1-pro",
    fetchImpl: captureFetch(
      jsonResponse({
        candidates: [{ finishReason: "SAFETY", content: { parts: [] } }],
      }),
    ).fetchImpl,
  });
  const error = await captureVisionJudgeError(() =>
    judge.judge(writeImage(runDir, "blocked.png"), validSpec(), 1_000),
  );

  assert(error.code === "safety", `expected safety, got ${error.code}`);
  return ["Google SAFETY finishReason maps to safety."];
}

async function googleParseInvalidVerdict(runDir: string): Promise<string[]> {
  const judge = new GoogleVisionJudge({
    apiKey: "google-key",
    model: "gemini-3.1-pro",
    fetchImpl: captureFetch(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ overallPass: "yes", criteria: [] }) }],
            },
          },
        ],
      }),
    ).fetchImpl,
  });
  const error = await captureVisionJudgeError(() =>
    judge.judge(writeImage(runDir, "invalid.png"), validSpec(), 1_000),
  );

  assert(error.code === "parse", `expected parse, got ${error.code}`);
  return ["Google invalid JudgeVerdict maps to parse."];
}

async function googleRejectsRelativePath(): Promise<string[]> {
  let fetchCalled = false;
  const judge = new GoogleVisionJudge({
    apiKey: "google-key",
    model: "gemini-3.1-pro",
    fetchImpl: async () => {
      fetchCalled = true;
      return googleGenerateResponse(passingVerdict());
    },
  });
  const error = await captureVisionJudgeError(() =>
    judge.judge("relative-google.png", validSpec(), 1_000),
  );

  assert(error.code === "parse", `expected parse, got ${error.code}`);
  assert(!fetchCalled, "relative path should fail before fetch");
  return ["Google judge rejects relative image paths before fetch."];
}

async function visionJudgeFallbackLogsAndSkipsSafety(runDir: string): Promise<string[]> {
  const spec = validSpec();
  const imagePath = writeImage(runDir, "fallback.png");
  const events: string[] = [];
  const primaryHttp = new FakeVisionJudge({
    verdicts: [passingVerdict()],
    failWith: "http",
  });
  const fallback = new FakeVisionJudge({ verdicts: [passingVerdict()] });
  const judge = new FallbackVisionJudge(primaryHttp, fallback, (event) => {
    events.push(`${event.kind}:${event.primary}->${event.fallback}:${event.errorCode}`);
  });

  const verdict = await judge.judge(imagePath, spec, 1_000);
  assert(verdict.overallPass, "fallback verdict should pass");
  assert(events.length === 1, "fallback should log exactly one event");
  assert(events[0] === "vision:fake-vision-judge->fake-vision-judge:http", `unexpected event ${events[0]}`);

  const primarySafety = new FakeVisionJudge({
    verdicts: [passingVerdict()],
    failWith: "safety",
  });
  const safetyJudge = new FallbackVisionJudge(primarySafety, fallback, (event) => {
    events.push(`${event.kind}:${event.errorCode}`);
  });
  const safetyError = await captureVisionJudgeError(() =>
    safetyJudge.judge(imagePath, spec, 1_000),
  );
  assert(safetyError.code === "safety", "safety should not fall back");
  assert(events.length === 1, "safety failure should not log fallback");

  return ["Vision fallback logs one explicit event on http failure and does not fall back on safety."];
}

function visionJudgeStaticBoundaryCheck(): string[] {
  const openaiSource = readFileSync(resolve(repoRoot, "src", "llm", "vision-judge-openai.ts"), "utf8");
  const googleSource = readFileSync(resolve(repoRoot, "src", "llm", "vision-judge-google.ts"), "utf8");
  const fakeSource = readFileSync(resolve(repoRoot, "src", "llm", "vision-judge-fake.ts"), "utf8");
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

  assert(!openaiSource.includes("process.env"), "vision-judge-openai.ts must not read process.env");
  assert(
    !/from\s+["']openai["']|require\(["']openai["']\)|new\s+OpenAI\b/.test(openaiSource),
    "vision-judge-openai.ts must not use OpenAI SDK",
  );
  assert(!googleSource.includes("process.env"), "vision-judge-google.ts must not read process.env");
  assert(
    !/from\s+["']@google|require\(["']@google|GoogleGenAI|new\s+Google\b/.test(googleSource),
    "vision-judge-google.ts must not use Google SDK",
  );

  for (const [label, pattern] of [
    ["fetch", /\bfetch\b/],
    ["process.env", /process\.env/],
    ["network modules", /node:(http|https|net|tls)/],
    ["Math.random", /Math\.random/],
    ["crypto bytes", /node:crypto|randomBytes|getRandomValues/],
    ["wall clock", /Date\.now|new Date|performance\.now/],
  ] as const) {
    assert(!pattern.test(fakeSource), `vision-judge-fake.ts must not use ${label}`);
  }

  assert(
    packageJson.scripts?.["vision-judge-fake-smoke"] ===
      "bun scripts/vision-judge-fake-smoke.ts",
    "package.json should add only the vision-judge-fake-smoke script",
  );

  for (const deps of [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
  ]) {
    assert(!deps?.openai, "package.json must not add the OpenAI SDK dependency");
    assert(!deps?.["@google/genai"], "package.json must not add the Google SDK dependency");
  }

  const base = implementationBase();
  const changed = changedFiles(base, Boolean(process.env.SLICE_IMPLEMENTATION_BASE));
  const allowed = new Set([
    "src/lib/runtime-config.ts",
    "src/bin/content-image-run.ts",
    "src/llm/image-google.ts",
    "src/llm/provider-fallback.ts",
    "src/llm/vision-judge.ts",
    "src/llm/vision-judge-openai.ts",
    "src/llm/vision-judge-fake.ts",
    "src/llm/vision-judge-google.ts",
    "scripts/image-provider-fake-smoke.ts",
    "scripts/vision-judge-fake-smoke.ts",
    "scripts/content-image-cli-smoke.ts",
    "scripts/image-publish-smoke.ts",
    "docs/preflight/image-provider-fake-smoke.md",
    "docs/preflight/vision-judge-fake-smoke.md",
    "docs/preflight/content-image-cli-smoke.md",
    "docs/preflight/image-publish-smoke.md",
    "PLAN.md",
    "package.json",
  ]);
  for (const file of changed) {
    assert(allowed.has(file), `out-of-scope file changed in implementation range: ${file}`);
  }

  return [`Static boundary checks passed against implementation base ${base}.`];
}

function googleGenerateResponse(verdict: JudgeVerdict): OpenAIVisionResponse {
  return jsonResponse({
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify(verdict) }],
        },
      },
    ],
  });
}

function assertGoogleJsonResponseConfig(value: unknown): void {
  assert(typeof value === "object" && value !== null, "generationConfig should be object");
  const config = value as Record<string, unknown>;
  assert(config.responseMimeType === "application/json", "Google judge should request JSON response");
}

function extractGoogleParts(value: Record<string, unknown>): Array<{
  inline_data?: { mime_type?: unknown; data?: unknown };
  text?: unknown;
}> {
  const contents = value.contents;
  assert(Array.isArray(contents), "Google request should include contents");
  const first = contents[0] as { parts?: unknown };
  assert(Array.isArray(first.parts), "Google request should include parts");
  return first.parts as Array<{
    inline_data?: { mime_type?: unknown; data?: unknown };
    text?: unknown;
  }>;
}

function changedFiles(base: string, includeUntracked: boolean): string[] {
  const files = new Set(
    execFileSync("git", ["diff", "--name-only", base], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean),
  );
  if (!includeUntracked) {
    return [...files].sort();
  }

  const statusLines = execFileSync("git", [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);

  for (const line of statusLines) {
    const pathPart = line.slice(3);
    const renamePath = pathPart.includes(" -> ")
      ? pathPart.split(" -> ").at(-1)
      : pathPart;
    if (renamePath) {
      files.add(renamePath);
    }
  }

  return [...files].sort();
}

function implementationBase(): string {
  if (process.env.SLICE_IMPLEMENTATION_BASE) {
    return process.env.SLICE_IMPLEMENTATION_BASE;
  }
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    const mergeBase = execFileSync("git", ["merge-base", "main", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    return mergeBase === head ? "HEAD^" : mergeBase;
  } catch {
    return "HEAD^";
  }
}

function writeImage(runDir: string, name: string): string {
  const imagePath = resolve(runDir, name);
  writeFileSync(imagePath, tinyPng);
  return imagePath;
}

function validSpec(): ImageSpec {
  return {
    promptOriginal: "make a precise care-team handoff image",
    subject: "a care-team handoff board",
    style: "clean editorial illustration",
    composition: "centered dashboard with three annotated handoff lanes",
    palette: ["blue", "white", "signal green"],
    dimensions: { w: 1024, h: 1024 },
    negativeConstraints: ["no patient names", "no hospital logo"],
    safetyProfile: "non-clinical synthetic scene",
    acceptanceCriteria: [
      {
        id: "subject-visible",
        description: "The handoff queue is the dominant visual subject.",
        tier: "judged",
      },
      {
        id: "no-identifiers",
        description: "No patient-identifying text appears.",
        tier: "mechanical",
      },
    ],
  };
}

function passingVerdict(): JudgeVerdict {
  return {
    overallPass: true,
    criteria: [
      {
        id: "subject-visible",
        pass: true,
        score: 0.92,
        rationale: "handoff queue is visually dominant",
      },
      {
        id: "no-identifiers",
        pass: true,
        rationale: "no patient-identifying text is visible",
      },
    ],
  };
}

function failingVerdict(): JudgeVerdict {
  return {
    overallPass: false,
    criteria: [
      {
        id: "subject-visible",
        pass: false,
        rationale: "handoff queue is too small",
      },
      {
        id: "no-identifiers",
        pass: true,
        rationale: "no patient-identifying text is visible",
      },
    ],
    regenerateFeedback: "clarify the handoff queue and remove patient identifiers",
  };
}

function captureFetch(
  response: OpenAIVisionResponse,
): { fetchImpl: OpenAIVisionFetch; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  return {
    requests,
    async fetchImpl(url: string, init: RequestInit): Promise<OpenAIVisionResponse> {
      requests.push({
        url,
        init,
        body: JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>,
      });
      return response;
    },
  };
}

function chatResponse(
  verdict: JudgeVerdict,
  finishReason = "stop",
): OpenAIVisionResponse {
  return chatResponseText(JSON.stringify(verdict), finishReason);
}

function chatResponseText(content: string, finishReason = "stop"): OpenAIVisionResponse {
  return jsonResponse({
    choices: [
      {
        finish_reason: finishReason,
        message: { content },
      },
    ],
  });
}

function chatResponseWithRefusal(refusal: string): OpenAIVisionResponse {
  return jsonResponse({
    choices: [
      {
        finish_reason: "stop",
        message: { content: "{}", refusal },
      },
    ],
  });
}

function jsonResponse(body: unknown, status = 200): OpenAIVisionResponse {
  return textResponse(JSON.stringify(body), status, status === 200 ? "OK" : "Error");
}

function textResponse(
  body: string,
  status: number,
  statusText: string,
): OpenAIVisionResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    async text(): Promise<string> {
      return body;
    },
  };
}

async function captureVisionJudgeError(
  fn: () => Promise<JudgeVerdict>,
): Promise<VisionJudgeError> {
  try {
    await fn();
  } catch (err) {
    assert(
      err instanceof VisionJudgeError,
      `expected VisionJudgeError, got ${formatError(err)}`,
    );
    return err;
  }
  throw new Error("expected vision judge error");
}

function extractPromptText(body: Record<string, unknown>): string {
  const messages = body.messages;
  assert(Array.isArray(messages), "messages must be an array");
  const userMessage = messages.find(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      (message as { role?: unknown }).role === "user",
  ) as { content?: unknown } | undefined;
  assert(userMessage !== undefined, "user message must exist");
  assert(Array.isArray(userMessage.content), "user message content must be an array");
  const textItem = userMessage.content.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      (item as { type?: unknown }).type === "text",
  ) as { text?: unknown } | undefined;
  assert(typeof textItem?.text === "string", "text content item must exist");
  return textItem.text;
}

function extractImageUrl(body: Record<string, unknown>): string {
  const messages = body.messages;
  assert(Array.isArray(messages), "messages must be an array");
  const userMessage = messages.find(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      (message as { role?: unknown }).role === "user",
  ) as { content?: unknown } | undefined;
  assert(userMessage !== undefined, "user message must exist");
  assert(Array.isArray(userMessage.content), "user message content must be an array");
  const imageItem = userMessage.content.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      (item as { type?: unknown }).type === "image_url",
  ) as { image_url?: unknown } | undefined;
  assert(
    typeof imageItem?.image_url === "object" &&
      imageItem.image_url !== null &&
      !Array.isArray(imageItem.image_url),
    "image_url item must exist",
  );
  const url = (imageItem.image_url as { url?: unknown }).url;
  assert(typeof url === "string", "image_url.url must be a string");
  return url;
}

function assertJsonObjectResponseFormat(value: unknown): void {
  assert(typeof value === "object" && value !== null && !Array.isArray(value), "response_format must be an object");
  assert((value as { type?: unknown }).type === "json_object", "response_format.type must be json_object");
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  const lines = [
    "# Vision Judge Fake Smoke",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Scenario | Status | Details |",
    "| --- | --- | --- |",
  ];

  for (const outcome of outcomes) {
    lines.push(
      `| ${outcome.name} | ${outcome.status} | ${outcome.details.map(escapeCell).join("<br>")} |`,
    );
  }

  lines.push(
    "",
    "## Coverage",
    "",
    "- Fake judge: explicit scripted queue, fail-then-pass sequencing, failure injection, relative-path rejection, deep-clone determinism.",
    "- OpenAI judge: chat-completions request shape, PNG data URL, fenced JSON parsing, timeout/http/parse/safety mappings, image-read pre-fetch failure, criterion-id exactness.",
    "- Google judge: Gemini alias request shape, stable-model fallback on unavailable model ids, string/array-wrapped JSON verdicts, id-matched and ordered criterion-array verdict normalization, safety/parse mappings, relative-path rejection.",
    "- Static boundary: no OpenAI SDK dependency, no provider env reads, fake judge hermeticity, package script-only change, declared implementation file scope.",
  );

  mkdirSync(dirname(docPath), { recursive: true });
  writeFileSync(docPath, `${lines.join("\n")}\n`);
}

function removeEmptyDir(dir: string): void {
  try {
    rmdirSync(dir);
  } catch {
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function escapeCell(input: string): string {
  return input.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

process.exit(await main());
