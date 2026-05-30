import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { FakeImageProvider } from "../src/llm/image-fake.ts";
import {
  ImageProviderError,
} from "../src/llm/image-provider.ts";
import { GoogleImageProvider } from "../src/llm/image-google.ts";
import {
  OpenAIImageProvider,
  type OpenAIImageFetch,
  type OpenAIImageResponse,
} from "../src/llm/image-openai.ts";
import { FallbackImageProvider } from "../src/llm/provider-fallback.ts";
import type { LLMProvider } from "../src/llm/provider.ts";
import { runStage } from "../src/pipeline/run-stage.ts";
import type { ImageSpec } from "../src/pipeline/image/spec.ts";
import type { ManifestRule, StageDef } from "../src/pipeline/types.ts";

type ScenarioName =
  | "fake-writes-manifest-valid-png"
  | "fake-records-feedback-and-calls"
  | "fake-failure-injection"
  | "fake-deterministic-bytes"
  | "fake-rejects-relative-output-path"
  | "openai-default-gpt-builds-request-and-writes-b64"
  | "openai-dalle-requests-b64-format"
  | "openai-prompt-contains-spec-and-feedback"
  | "openai-timeout-maps-error"
  | "openai-http-error-tail"
  | "openai-safety-error"
  | "openai-fetch-rejection-maps-error"
  | "openai-parse-error-invalid-json"
  | "openai-parse-error-missing-b64"
  | "openai-parse-error-malformed-b64"
  | "openai-rejects-relative-output-path"
  | "google-nano-banana-builds-request-and-writes-inline-data"
  | "google-safety-error"
  | "google-parse-error-missing-inline-data"
  | "google-rejects-relative-output-path"
  | "image-provider-fallback-logs-and-skips-safety"
  | "provider-static-boundary-check";

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
  "fake-writes-manifest-valid-png",
  "fake-records-feedback-and-calls",
  "fake-failure-injection",
  "fake-deterministic-bytes",
  "fake-rejects-relative-output-path",
  "openai-default-gpt-builds-request-and-writes-b64",
  "openai-dalle-requests-b64-format",
  "openai-prompt-contains-spec-and-feedback",
  "openai-timeout-maps-error",
  "openai-http-error-tail",
  "openai-safety-error",
  "openai-fetch-rejection-maps-error",
  "openai-parse-error-invalid-json",
  "openai-parse-error-missing-b64",
  "openai-parse-error-malformed-b64",
  "openai-rejects-relative-output-path",
  "google-nano-banana-builds-request-and-writes-inline-data",
  "google-safety-error",
  "google-parse-error-missing-inline-data",
  "google-rejects-relative-output-path",
  "image-provider-fallback-logs-and-skips-safety",
  "provider-static-boundary-check",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = resolve(
  repoRoot,
  ".runs",
  "image-provider-fake-smoke",
  new Date().toISOString().replaceAll(":", "-"),
);
const docPath = resolve(
  repoRoot,
  "docs",
  "preflight",
  "image-provider-fake-smoke.md",
);
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

const noopProvider: LLMProvider = {
  name: "noop",
  async runPrompt(): Promise<string> {
    return "ok";
  },
};

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
    removeEmptyDir(resolve(repoRoot, ".runs", "image-provider-fake-smoke"));
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
    case "fake-writes-manifest-valid-png":
      return fakeWritesManifestValidPng(runDir);
    case "fake-records-feedback-and-calls":
      return fakeRecordsFeedbackAndCalls(runDir);
    case "fake-failure-injection":
      return fakeFailureInjection(runDir);
    case "fake-deterministic-bytes":
      return fakeDeterministicBytes(runDir);
    case "fake-rejects-relative-output-path":
      return fakeRejectsRelativeOutputPath();
    case "openai-default-gpt-builds-request-and-writes-b64":
      return openaiDefaultGptBuildsRequestAndWritesB64(runDir);
    case "openai-dalle-requests-b64-format":
      return openaiDalleRequestsB64Format(runDir);
    case "openai-prompt-contains-spec-and-feedback":
      return openaiPromptContainsSpecAndFeedback(runDir);
    case "openai-timeout-maps-error":
      return openaiTimeoutMapsError(runDir);
    case "openai-http-error-tail":
      return openaiHttpErrorTail(runDir);
    case "openai-safety-error":
      return openaiSafetyError(runDir);
    case "openai-fetch-rejection-maps-error":
      return openaiFetchRejectionMapsError(runDir);
    case "openai-parse-error-invalid-json":
      return openaiParseErrorInvalidJson(runDir);
    case "openai-parse-error-missing-b64":
      return openaiParseErrorMissingB64(runDir);
    case "openai-parse-error-malformed-b64":
      return openaiParseErrorMalformedB64(runDir);
    case "openai-rejects-relative-output-path":
      return openaiRejectsRelativeOutputPath();
    case "google-nano-banana-builds-request-and-writes-inline-data":
      return googleNanoBananaBuildsRequestAndWritesInlineData(runDir);
    case "google-safety-error":
      return googleSafetyError(runDir);
    case "google-parse-error-missing-inline-data":
      return googleParseErrorMissingInlineData(runDir);
    case "google-rejects-relative-output-path":
      return googleRejectsRelativeOutputPath();
    case "image-provider-fallback-logs-and-skips-safety":
      return imageProviderFallbackLogsAndSkipsSafety(runDir);
    case "provider-static-boundary-check":
      return providerStaticBoundaryCheck();
  }
}

async function fakeWritesManifestValidPng(runDir: string): Promise<string[]> {
  const provider = new FakeImageProvider();
  const outputPath = resolve(runDir, "image.png");
  const spec = validSpec();
  await provider.generate(spec, outputPath, 1_000);
  await assertRunStageAcceptsImage(runDir, "image.png", spec);
  const png = parsePng(readFileSync(outputPath));

  return [
    `runStage accepted image_exists/image_format/image_dimensions for ${png.width}x${png.height}.`,
    `PNG has ${png.idatCount} IDAT chunk(s), valid CRCs, and ${png.decompressedBytes} decompressed bytes.`,
  ];
}

async function fakeRecordsFeedbackAndCalls(runDir: string): Promise<string[]> {
  const provider = new FakeImageProvider();
  const spec = validSpec();
  const outputPath = resolve(runDir, "image.png");
  await provider.generate(spec, outputPath, 222, "make the handoff card clearer");

  assert(provider.calls.length === 1, "expected one recorded fake call");
  assert(provider.calls[0].spec === spec, "fake call should retain spec reference");
  assert(provider.calls[0].absolutePath === outputPath, "fake call should record path");
  assert(provider.calls[0].timeoutMs === 222, "fake call should record timeout");
  assert(
    provider.calls[0].feedback === "make the handoff card clearer",
    "fake call should record feedback",
  );
  assert(
    provider.lastFeedback === "make the handoff card clearer",
    "fake provider should expose lastFeedback",
  );
  return ["Fake provider recorded spec/path/timeout/feedback and exposed lastFeedback before writing."];
}

async function fakeFailureInjection(runDir: string): Promise<string[]> {
  const provider = new FakeImageProvider({ failWith: "timeout" });
  const outputPath = resolve(runDir, "image.png");
  const error = await captureProviderError(() =>
    provider.generate(validSpec(), outputPath, 1_000),
  );

  assert(error.code === "timeout", "expected injected timeout code");
  assert(provider.calls.length === 1, "fake failure should still record call");
  assert(!existsSync(outputPath), "fake failure should not write output");
  return ["Fake timeout failure injection records the call and writes no file."];
}

async function fakeDeterministicBytes(runDir: string): Promise<string[]> {
  const provider = new FakeImageProvider();
  const first = resolve(runDir, "first.png");
  const second = resolve(runDir, "second.png");
  const spec = validSpec();

  await provider.generate(spec, first, 1_000);
  await provider.generate(spec, second, 1_000);
  await assertRunStageAcceptsImage(runDir, "first.png", spec);
  await assertRunStageAcceptsImage(runDir, "second.png", spec);

  const firstBytes = readFileSync(first);
  const secondBytes = readFileSync(second);
  assert(firstBytes.equals(secondBytes), "fake PNG bytes should be deterministic");
  parsePng(firstBytes);

  return ["Repeated fake generations for the same spec produced byte-identical valid PNGs."];
}

async function fakeRejectsRelativeOutputPath(): Promise<string[]> {
  const provider = new FakeImageProvider();
  const relativeDir = "relative-image-provider-smoke-dir";
  const relativePath = `${relativeDir}/relative.png`;
  rmSync(resolve(repoRoot, relativeDir), { recursive: true, force: true });
  const error = await captureProviderError(() =>
    provider.generate(validSpec(), relativePath, 1_000),
  );
  assert(error.code === "parse", `expected parse, got ${error.code}`);
  assert(provider.calls.length === 1, "relative-path rejection should record call");
  assert(
    !existsSync(resolve(repoRoot, relativeDir)),
    "relative-path rejection should not create parent directories",
  );
  return ["Fake provider rejects relative output paths with parse error and no parent creation."];
}

async function openaiDefaultGptBuildsRequestAndWritesB64(
  runDir: string,
): Promise<string[]> {
  const imageBytes = Buffer.from("openai image bytes");
  const { fetchImpl, requests } = captureFetch(
    jsonResponse({ data: [{ b64_json: imageBytes.toString("base64") }] }),
  );
  const provider = new OpenAIImageProvider({
    apiKey: "test-key",
    fetchImpl,
  });
  const outputPath = resolve(runDir, "image.bin");

  await provider.generate(validSpec(), outputPath, 1_000);

  assert(requests.length === 1, "expected one OpenAI request");
  assert(requests[0].url === "https://api.openai.com/v1/images/generations", "unexpected URL");
  assert(requests[0].init.method === "POST", "OpenAI request should use POST");
  const headers = requests[0].init.headers as Record<string, string>;
  assert(headers.Authorization === "Bearer test-key", "OpenAI request should include bearer auth");
  assert(headers["Content-Type"] === "application/json", "OpenAI request should send JSON");
  assert(requests[0].body.model === "gpt-image-1", "default model should be gpt-image-1");
  assert(typeof requests[0].body.prompt === "string", "request should include a prompt");
  assert(!("response_format" in requests[0].body), "gpt-image-1 should omit response_format");
  assert(requests[0].body.size === "1024x1024", "request size should follow ImageSpec");
  assert(readFileSync(outputPath).equals(imageBytes), "provider should write decoded b64 bytes");

  return ["Default GPT image request used POST/auth/JSON, omitted response_format, and wrote decoded bytes."];
}

async function openaiDalleRequestsB64Format(runDir: string): Promise<string[]> {
  const { fetchImpl, requests } = captureFetch(
    jsonResponse({ data: [{ b64_json: Buffer.from("dalle").toString("base64") }] }),
  );
  const provider = new OpenAIImageProvider({
    apiKey: "test-key",
    baseUrl: "https://image.example.test/custom-generations",
    model: "dall-e-3",
    fetchImpl,
  });

  await provider.generate(validSpec(), resolve(runDir, "image.bin"), 1_000);

  assert(requests.length === 1, "expected one OpenAI request");
  assert(
    requests[0].url === "https://image.example.test/custom-generations",
    "custom baseUrl should be treated as the full generations endpoint",
  );
  assert(requests[0].body.model === "dall-e-3", "model should be preserved");
  assert(
    requests[0].body.response_format === "b64_json",
    "DALL-E requests must ask for b64_json",
  );
  return ["DALL-E image request used the custom endpoint and included response_format=b64_json."];
}

async function openaiPromptContainsSpecAndFeedback(
  runDir: string,
): Promise<string[]> {
  const { fetchImpl, requests } = captureFetch(
    jsonResponse({ data: [{ b64_json: Buffer.from("prompt").toString("base64") }] }),
  );
  const provider = new OpenAIImageProvider({
    apiKey: "test-key",
    fetchImpl,
  });
  const spec = validSpec();
  await provider.generate(
    spec,
    resolve(runDir, "image.bin"),
    1_000,
    "regenerate with stronger visual hierarchy",
  );

  const prompt = String(requests[0].body.prompt);
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
    "regenerate with stronger visual hierarchy",
  ]) {
    assert(prompt.includes(value), `prompt should include ${value}`);
  }

  return ["OpenAI prompt included all ImageSpec fields and regeneration feedback."];
}

async function openaiTimeoutMapsError(runDir: string): Promise<string[]> {
  const preResponseFetch: OpenAIImageFetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  const preResponseProvider = new OpenAIImageProvider({
    apiKey: "test-key",
    fetchImpl: preResponseFetch,
  });
  const preResponsePath = resolve(runDir, "pre-response.bin");
  const preResponseError = await captureProviderError(() =>
    preResponseProvider.generate(validSpec(), preResponsePath, 1),
  );

  assert(
    preResponseError.code === "timeout",
    `expected timeout, got ${preResponseError.code}`,
  );
  assert(!existsSync(preResponsePath), "pre-response timeout should not write output");

  const bodyReadProvider = new OpenAIImageProvider({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async text(): Promise<string> {
        return new Promise(() => undefined);
      },
    }),
  });
  const bodyReadPath = resolve(runDir, "body-read.bin");
  const bodyReadError = await captureProviderError(() =>
    bodyReadProvider.generate(validSpec(), bodyReadPath, 1),
  );

  assert(
    bodyReadError.code === "timeout",
    `expected body-read timeout, got ${bodyReadError.code}`,
  );
  assert(!existsSync(bodyReadPath), "body-read timeout should not write output");
  return ["OpenAI timeout covers pre-response and response-body reads with no file."];
}

async function openaiHttpErrorTail(runDir: string): Promise<string[]> {
  const body = `${"x".repeat(600)}tail-marker`;
  const tailProvider = new OpenAIImageProvider({
    apiKey: "test-key",
    fetchImpl: captureFetch(textResponse(body, 500, "Server Error")).fetchImpl,
  });
  const tailOutputPath = resolve(runDir, "tail-error.bin");
  const tailError = await captureProviderError(() =>
    tailProvider.generate(validSpec(), tailOutputPath, 1_000),
  );

  assert(tailError.code === "http", `expected http, got ${tailError.code}`);
  assert(tailError.status === 500, "expected status 500");
  assert(
    tailError.bodyTail?.includes("tail-marker") === true,
    "expected body tail marker",
  );
  assert(!existsSync(tailOutputPath), "HTTP failure should not write output");

  const unreadableProvider = new OpenAIImageProvider({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      async text(): Promise<string> {
        throw new Error("content_policy stream failed");
      },
    }),
  });
  const unreadableOutputPath = resolve(runDir, "unreadable-error.bin");
  const unreadableError = await captureProviderError(() =>
    unreadableProvider.generate(validSpec(), unreadableOutputPath, 1_000),
  );

  assert(
    unreadableError.code === "http",
    `expected unreadable non-2xx to map to http, got ${unreadableError.code}`,
  );
  assert(unreadableError.status === 503, "expected unreadable status 503");
  assert(
    unreadableError.bodyTail?.includes("unreadable response body:") === true &&
      unreadableError.bodyTail.includes("content_policy stream failed"),
    "expected unreadable body tail",
  );
  assert(!existsSync(unreadableOutputPath), "unreadable HTTP failure should not write output");
  return ["OpenAI non-2xx responses mapped to http for readable and unreadable bodies, retaining a bounded tail."];
}

async function openaiSafetyError(runDir: string): Promise<string[]> {
  const visibleMarkerProvider = new OpenAIImageProvider({
    apiKey: "test-key",
    fetchImpl: captureFetch(
      textResponse("blocked by safety policy content_policy marker", 400, "Bad Request"),
    ).fetchImpl,
  });
  const visibleMarkerPath = resolve(runDir, "visible-safety.bin");
  const visibleMarkerError = await captureProviderError(() =>
    visibleMarkerProvider.generate(validSpec(), visibleMarkerPath, 1_000),
  );

  assert(
    visibleMarkerError.code === "safety",
    `expected safety, got ${visibleMarkerError.code}`,
  );
  assert(visibleMarkerError.bodyTail?.includes("safety") === true, "expected safety marker");
  assert(
    visibleMarkerError.bodyTail?.includes("content_policy") === true,
    "expected policy marker",
  );
  assert(!existsSync(visibleMarkerPath), "safety failure should not write output");

  const fullBodyProvider = new OpenAIImageProvider({
    apiKey: "test-key",
    fetchImpl: captureFetch(
      textResponse(`content_policy marker ${"x".repeat(600)}tail-only`, 400, "Bad Request"),
    ).fetchImpl,
  });
  const fullBodyPath = resolve(runDir, "full-body-safety.bin");
  const fullBodyError = await captureProviderError(() =>
    fullBodyProvider.generate(validSpec(), fullBodyPath, 1_000),
  );

  assert(
    fullBodyError.code === "safety",
    `expected full-body marker to map to safety, got ${fullBodyError.code}`,
  );
  assert(
    fullBodyError.bodyTail?.includes("tail-only") === true,
    "expected retained tail even when marker is earlier in the body",
  );
  assert(!existsSync(fullBodyPath), "full-body safety failure should not write output");
  return ["OpenAI safety response scans the full safety/policy/content_policy/moderation/unsafe heuristic body and retains a bounded tail."];
}

async function openaiFetchRejectionMapsError(runDir: string): Promise<string[]> {
  const provider = new OpenAIImageProvider({
    apiKey: "test-key",
    fetchImpl: async () => {
      throw new Error("socket closed");
    },
  });
  const outputPath = resolve(runDir, "image.bin");
  const error = await captureProviderError(() =>
    provider.generate(validSpec(), outputPath, 1_000),
  );

  assert(error.code === "http", `expected http, got ${error.code}`);
  assert(error.cause instanceof Error, "fetch rejection should be attached as cause");
  assert(!existsSync(outputPath), "fetch rejection should not write output");
  return ["OpenAI fetch rejection mapped to http with cause and no file."];
}

async function openaiParseErrorInvalidJson(runDir: string): Promise<string[]> {
  const provider = new OpenAIImageProvider({
    apiKey: "test-key",
    fetchImpl: captureFetch(textResponse("{ nope", 200, "OK")).fetchImpl,
  });
  const outputPath = resolve(runDir, "image.bin");
  const error = await captureProviderError(() =>
    provider.generate(validSpec(), outputPath, 1_000),
  );

  assert(error.code === "parse", `expected parse, got ${error.code}`);
  assert(!existsSync(outputPath), "invalid JSON should not write output");
  return ["OpenAI invalid JSON response mapped to parse."];
}

async function openaiParseErrorMissingB64(runDir: string): Promise<string[]> {
  const provider = new OpenAIImageProvider({
    apiKey: "test-key",
    fetchImpl: captureFetch(jsonResponse({ data: [{}] })).fetchImpl,
  });
  const outputPath = resolve(runDir, "image.bin");
  const error = await captureProviderError(() =>
    provider.generate(validSpec(), outputPath, 1_000),
  );

  assert(error.code === "parse", `expected parse, got ${error.code}`);
  assert(!existsSync(outputPath), "missing b64 should not write output");
  return ["OpenAI response missing data[0].b64_json mapped to parse."];
}

async function openaiParseErrorMalformedB64(runDir: string): Promise<string[]> {
  const provider = new OpenAIImageProvider({
    apiKey: "test-key",
    fetchImpl: captureFetch(jsonResponse({ data: [{ b64_json: "%%%" }] })).fetchImpl,
  });
  const outputPath = resolve(runDir, "image.bin");
  const error = await captureProviderError(() =>
    provider.generate(validSpec(), outputPath, 1_000),
  );

  assert(error.code === "parse", `expected parse, got ${error.code}`);
  assert(!existsSync(outputPath), "malformed b64 should not write output");
  return ["OpenAI malformed b64 response mapped to parse."];
}

async function openaiRejectsRelativeOutputPath(): Promise<string[]> {
  let fetchCalled = false;
  const provider = new OpenAIImageProvider({
    apiKey: "test-key",
    fetchImpl: async () => {
      fetchCalled = true;
      return jsonResponse({ data: [{ b64_json: Buffer.from("x").toString("base64") }] });
    },
  });
  const error = await captureProviderError(() =>
    provider.generate(validSpec(), "relative.bin", 1_000),
  );

  assert(error.code === "parse", `expected parse, got ${error.code}`);
  assert(!fetchCalled, "relative output path should fail before fetch");
  return ["OpenAI provider rejects relative output paths before fetch."];
}

async function googleNanoBananaBuildsRequestAndWritesInlineData(
  runDir: string,
): Promise<string[]> {
  const { fetchImpl, requests } = captureFetch(
    jsonResponse({
      candidates: [
        {
          content: {
            parts: [
              { text: "ok" },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: tinyPng.toString("base64"),
                },
              },
            ],
          },
        },
      ],
    }),
  );
  const provider = new GoogleImageProvider({
    apiKey: "google-key",
    model: "nano banana 2",
    fetchImpl,
  });
  const outputPath = resolve(runDir, "google-image.png");
  const spec = validSpec();

  await provider.generate(spec, outputPath, 1_000, "make the queue clearer");

  assert(requests.length === 1, "expected one Google request");
  assert(
    requests[0].url ===
      "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent",
    `unexpected Google URL: ${requests[0].url}`,
  );
  assert(requests[0].init.method === "POST", "Google request should use POST");
  const headers = requests[0].init.headers as Record<string, string>;
  assert(headers["x-goog-api-key"] === "google-key", "Google request should include x-goog-api-key");
  assert(headers["Content-Type"] === "application/json", "Google request should send JSON");
  const contents = requests[0].body.contents as Array<{ parts?: Array<{ text?: string }> }>;
  const prompt = contents[0]?.parts?.[0]?.text ?? "";
  assert(prompt.includes("Original prompt:"), "Google image prompt should include ImageSpec prompt");
  assert(prompt.includes("Regeneration feedback:"), "Google image prompt should include feedback");
  assert(
    !("generationConfig" in requests[0].body),
    "Google image request should omit optional generationConfig for live REST compatibility",
  );
  const png = parsePng(readFileSync(outputPath));
  assert(png.width === spec.dimensions.w, "Google output should be normalized to spec width");
  assert(png.height === spec.dimensions.h, "Google output should be normalized to spec height");

  return ["Google Nano Banana 2 alias built a generationConfig-free request and normalized inline image bytes to PNG."];
}

async function googleSafetyError(runDir: string): Promise<string[]> {
  const provider = new GoogleImageProvider({
    apiKey: "google-key",
    fetchImpl: captureFetch(
      jsonResponse({
        candidates: [{ finishReason: "SAFETY", content: { parts: [] } }],
      }),
    ).fetchImpl,
  });
  const outputPath = resolve(runDir, "blocked.bin");
  const error = await captureProviderError(() =>
    provider.generate(validSpec(), outputPath, 1_000),
  );

  assert(error.code === "safety", `expected safety, got ${error.code}`);
  assert(!existsSync(outputPath), "Google safety failure should not write output");
  return ["Google SAFETY finishReason maps to safety and writes no file."];
}

async function googleParseErrorMissingInlineData(runDir: string): Promise<string[]> {
  const provider = new GoogleImageProvider({
    apiKey: "google-key",
    fetchImpl: captureFetch(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "only text" }] } }],
      }),
    ).fetchImpl,
  });
  const outputPath = resolve(runDir, "text-only.bin");
  const error = await captureProviderError(() =>
    provider.generate(validSpec(), outputPath, 1_000),
  );

  assert(error.code === "parse", `expected parse, got ${error.code}`);
  assert(error.bodyTail?.includes("only text") === true, "expected text tail");
  assert(!existsSync(outputPath), "missing inlineData should not write output");
  return ["Google text-only image response maps to parse with a bounded text tail."];
}

async function googleRejectsRelativeOutputPath(): Promise<string[]> {
  let fetchCalled = false;
  const provider = new GoogleImageProvider({
    apiKey: "google-key",
    fetchImpl: async () => {
      fetchCalled = true;
      return jsonResponse({
        candidates: [
          { content: { parts: [{ inlineData: { data: Buffer.from("x").toString("base64") } }] } },
        ],
      });
    },
  });
  const error = await captureProviderError(() =>
    provider.generate(validSpec(), "relative-google.bin", 1_000),
  );

  assert(error.code === "parse", `expected parse, got ${error.code}`);
  assert(!fetchCalled, "relative output path should fail before fetch");
  return ["Google provider rejects relative output paths before fetch."];
}

async function imageProviderFallbackLogsAndSkipsSafety(runDir: string): Promise<string[]> {
  const spec = validSpec();
  const fallbackPath = resolve(runDir, "fallback.png");
  const events: string[] = [];
  const primaryHttp = new FakeImageProvider({ failWith: "http" });
  const fallback = new FakeImageProvider();
  const provider = new FallbackImageProvider(primaryHttp, fallback, (event) => {
    events.push(`${event.kind}:${event.primary}->${event.fallback}:${event.errorCode}`);
  });

  await provider.generate(spec, fallbackPath, 1_000, "try fallback");
  assert(existsSync(fallbackPath), "fallback image should be written");
  assert(events.length === 1, "fallback should log exactly one event");
  assert(events[0] === "image:fake-image->fake-image:http", `unexpected fallback event ${events[0]}`);
  assert(fallback.calls[0].feedback === "try fallback", "fallback should preserve feedback");

  const primarySafety = new FakeImageProvider({ failWith: "safety" });
  const safetyProvider = new FallbackImageProvider(primarySafety, fallback, (event) => {
    events.push(`${event.kind}:${event.errorCode}`);
  });
  const safetyError = await captureProviderError(() =>
    safetyProvider.generate(spec, resolve(runDir, "safety.png"), 1_000),
  );
  assert(safetyError.code === "safety", "safety should not fall back");
  assert(events.length === 1, "safety failure should not log fallback");

  return ["Image fallback logs one explicit event on http failure, preserves feedback, and does not fall back on safety."];
}

function providerStaticBoundaryCheck(): string[] {
  const openaiSource = readFileSync(resolve(repoRoot, "src", "llm", "image-openai.ts"), "utf8");
  const googleSource = readFileSync(resolve(repoRoot, "src", "llm", "image-google.ts"), "utf8");
  const fakeSource = readFileSync(resolve(repoRoot, "src", "llm", "image-fake.ts"), "utf8");
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

  assert(!openaiSource.includes("process.env"), "image-openai.ts must not read process.env");
  assert(
    !/from\s+["']openai["']|require\(["']openai["']\)|new\s+OpenAI\b/.test(openaiSource),
    "image-openai.ts must not use OpenAI SDK",
  );
  assert(!googleSource.includes("process.env"), "image-google.ts must not read process.env");
  assert(
    !/from\s+["']@google|require\(["']@google|GoogleGenAI|new\s+Google\b/.test(googleSource),
    "image-google.ts must not use Google SDK",
  );

  for (const [label, pattern] of [
    ["fetch", /\bfetch\b/],
    ["process.env", /process\.env/],
    ["network modules", /node:(http|https|net|tls)/],
    ["Math.random", /Math\.random/],
    ["crypto bytes", /node:crypto|randomBytes|getRandomValues/],
    ["wall clock", /Date\.now|new Date|performance\.now/],
  ] as const) {
    assert(!pattern.test(fakeSource), `image-fake.ts must not use ${label}`);
  }

  assert(
    packageJson.scripts?.["image-provider-fake-smoke"] ===
      "bun scripts/image-provider-fake-smoke.ts",
    "package.json should add only the image-provider-fake-smoke script",
  );

  const dependencyMaps = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
  ];
  for (const deps of dependencyMaps) {
    assert(!deps?.openai, "package.json must not add the OpenAI SDK dependency");
    assert(!deps?.["@google/genai"], "package.json must not add the Google SDK dependency");
  }

  return ["Provider files and package.json satisfied SDK-free static boundary checks."];
}

async function assertRunStageAcceptsImage(
  runDir: string,
  relativePath: string,
  spec: ImageSpec,
): Promise<void> {
  const rules: ManifestRule[] = [
    { kind: "image_exists", path: relativePath },
    {
      kind: "image_format",
      path: relativePath,
      formats: ["png"],
      maxBytes: statSync(resolve(runDir, relativePath)).size + 1,
    },
    {
      kind: "image_dimensions",
      path: relativePath,
      width: spec.dimensions.w,
      height: spec.dimensions.h,
    },
  ];
  const result = await runStage(stageDef(rules), noopProvider, {
    runDir,
    cwd: repoRoot,
  });
  assert(result.status === "ok", `expected runStage ok, got ${result.status}`);
}

function stageDef(rules: readonly ManifestRule[]): StageDef {
  return {
    stage: "image-generate",
    prompt: "noop",
    timeoutMs: 1_000,
    manifest: { rules: [...rules] },
  };
}

function parsePng(bytes: Buffer): {
  width: number;
  height: number;
  idatCount: number;
  decompressedBytes: number;
} {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert(bytes.subarray(0, 8).equals(signature), "PNG signature mismatch");

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let seenIend = false;
  const idats: Buffer[] = [];

  while (offset < bytes.length) {
    assert(offset + 12 <= bytes.length, "truncated PNG chunk header");
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcStart = dataEnd;
    const nextOffset = crcStart + 4;
    assert(nextOffset <= bytes.length, `truncated PNG chunk ${type}`);

    const data = bytes.subarray(dataStart, dataEnd);
    const actualCrc = bytes.readUInt32BE(crcStart);
    const expectedCrc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
    assert(actualCrc === expectedCrc, `CRC mismatch for ${type}`);

    if (type === "IHDR") {
      assert(length === 13, "IHDR length must be 13");
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      assert(bitDepth === 8, "PNG must use 8-bit samples");
      assert(
        colorType === 0 || colorType === 2 || colorType === 4 || colorType === 6,
        "PNG must use grayscale, grayscale-alpha, RGB, or RGBA color",
      );
    } else if (type === "IDAT") {
      assert(length > 0, "IDAT must be non-empty");
      idats.push(data);
    } else if (type === "IEND") {
      assert(length === 0, "IEND must be empty");
      seenIend = true;
      offset = nextOffset;
      break;
    }

    offset = nextOffset;
  }

  assert(seenIend, "PNG missing IEND");
  assert(offset === bytes.length, "PNG has trailing bytes after IEND");
  assert(width > 0 && height > 0, "PNG missing IHDR dimensions");
  assert(idats.length > 0, "PNG missing IDAT");

  const decompressed = inflateSync(Buffer.concat(idats));
  const channelsByColorType: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };
  const channels = channelsByColorType[colorType];
  const expectedBytes = (width * channels + 1) * height;
  assert(
    decompressed.length === expectedBytes,
    `decompressed scanline length mismatch: expected ${expectedBytes}, got ${decompressed.length}`,
  );

  return {
    width,
    height,
    idatCount: idats.length,
    decompressedBytes: decompressed.length,
  };
}

function captureFetch(
  response: OpenAIImageResponse,
): { fetchImpl: OpenAIImageFetch; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  return {
    requests,
    async fetchImpl(url: string, init: RequestInit): Promise<OpenAIImageResponse> {
      requests.push({
        url,
        init,
        body: JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>,
      });
      return response;
    },
  };
}

function jsonResponse(body: unknown, status = 200): OpenAIImageResponse {
  return textResponse(JSON.stringify(body), status, status === 200 ? "OK" : "Error");
}

function textResponse(
  body: string,
  status: number,
  statusText: string,
): OpenAIImageResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    async text(): Promise<string> {
      return body;
    },
  };
}

async function captureProviderError(
  fn: () => Promise<void>,
): Promise<ImageProviderError> {
  try {
    await fn();
  } catch (err) {
    assert(
      err instanceof ImageProviderError,
      `expected ImageProviderError, got ${formatError(err)}`,
    );
    return err;
  }
  throw new Error("expected provider error");
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
        id: "handoff-visible",
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

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  const lines = [
    "# Image Provider Fake Smoke",
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
    "- Fake provider: manifest-valid PNG, call/feedback recording, failure injection, deterministic bytes, relative path rejection.",
    "- OpenAI provider: GPT/DALL-E request bodies, prompt coverage, timeout/http/safety/fetch/parse errors, relative path pre-fetch rejection.",
    "- Google provider: Nano Banana 2 alias request, inline image normalization, safety/parse errors, relative path pre-fetch rejection.",
    "- Static boundary: no OpenAI/Google SDK dependency, no provider env reads, fake provider hermeticity.",
  );

  mkdirSync(dirname(docPath), { recursive: true });
  writeFileSync(docPath, `${lines.join("\n")}\n`);
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
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
