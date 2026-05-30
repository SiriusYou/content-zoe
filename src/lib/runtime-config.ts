export type LLMProviderName = "fake" | "codex";
export type ImageProviderName = "fake" | "openai" | "google";
export type VisionJudgeProviderName = "fake" | "openai" | "google";

export interface RuntimeConfig {
  llmProvider: LLMProviderName;
  quiesceWindowMs: number;
  cwd: string;
}

let memoizedConfig: RuntimeConfig | null = null;
let memoizedError: Error | null = null;

export function loadRuntimeConfig(): RuntimeConfig {
  if (memoizedConfig) return memoizedConfig;
  if (memoizedError) throw memoizedError;

  try {
    const llmProvider = parseProvider(process.env.LLM_PROVIDER);
    const quiesceWindowMs = parsePositiveInt(
      process.env.CZ_LLM_QUIESCE_MS,
      "CZ_LLM_QUIESCE_MS",
      5000,
    );

    memoizedConfig = {
      llmProvider,
      quiesceWindowMs,
      cwd: process.cwd(),
    };
    return memoizedConfig;
  } catch (err) {
    memoizedError = err instanceof Error ? err : new Error(String(err));
    throw memoizedError;
  }
}

function parseProvider(value: string | undefined): LLMProviderName {
  value ??= "fake";
  if (value === "fake" || value === "codex") return value;
  throw new Error(
    `invalid LLM_PROVIDER: expected "fake" or "codex", got ${JSON.stringify(value)}`,
  );
}

export function parseImageProviderName(value: string | undefined): ImageProviderName | undefined {
  if (value === undefined) return undefined;
  if (value === "fake" || value === "openai" || value === "google") return value;
  throw new Error(
    `invalid IMAGE_PROVIDER: expected "fake", "openai", or "google", got ${JSON.stringify(value)}`,
  );
}

export function parseVisionJudgeProviderName(value: string | undefined): VisionJudgeProviderName | undefined {
  if (value === undefined) return undefined;
  if (value === "fake" || value === "openai" || value === "google") return value;
  throw new Error(
    `invalid VISION_JUDGE_PROVIDER: expected "fake", "openai", or "google", got ${JSON.stringify(value)}`,
  );
}

export function parseVisionJudgeModel(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`invalid VISION_JUDGE_MODEL: expected a non-empty string`);
  }
  return trimmed;
}

function parsePositiveInt(
  value: string | undefined,
  name: string,
  defaultValue: number,
): number {
  if (value === undefined) return defaultValue;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`invalid ${name}: expected a positive integer, got ${JSON.stringify(value)}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`invalid ${name}: expected a safe positive integer, got ${JSON.stringify(value)}`);
  }
  return parsed;
}
