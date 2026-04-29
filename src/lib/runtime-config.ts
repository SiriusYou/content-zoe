export type LLMProviderName = "fake" | "codex";

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
