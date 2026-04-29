import { CodexCliProvider } from "../llm/codex-cli.ts";
import { FakeProvider } from "../llm/fake.ts";
import type { LLMProvider } from "../llm/provider.ts";
import { loadRuntimeConfig } from "../lib/runtime-config.ts";
import { type Locale, runReportLoop } from "../lib/report-loop.ts";
import { STAGES } from "../pipeline/stages.ts";

interface CliArgs {
  jobId: string;
  locales: Locale[];
  resume: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let locales: Locale[] = ["en", "zh"];
  let resume = false;
  const positionals: string[] = [];

  for (const arg of argv) {
    if (arg === "--resume") {
      resume = true;
    } else if (arg.startsWith("--locales=")) {
      locales = parseLocales(arg.slice("--locales=".length));
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  if (positionals.length !== 1 || positionals[0].length === 0) {
    throw new Error("usage: bun run report:run <jobId> [--locales=en|en,zh] [--resume]");
  }

  return {
    jobId: positionals[0],
    locales,
    resume,
  };
}

function parseLocales(value: string): Locale[] {
  if (value === "en") return ["en"];
  if (value === "en,zh") return ["en", "zh"];
  throw new Error(`invalid --locales value: ${JSON.stringify(value)}`);
}

async function main(): Promise<number> {
  let config;
  try {
    config = loadRuntimeConfig();
  } catch (err) {
    console.error(formatError(err));
    return 1;
  }

  if (config.llmProvider === "fake") {
    console.error("[report-run] LLM_PROVIDER=fake (canned outputs; no real LLM)");
  } else {
    console.error(
      `[report-run] LLM_PROVIDER=codex (quiesceWindowMs=${config.quiesceWindowMs})`,
    );
  }

  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(formatError(err));
    return 1;
  }

  const provider: LLMProvider =
    config.llmProvider === "fake"
      ? new FakeProvider(
          new Map(
            Object.values(STAGES).map((stageDef) => [
              stageDef.prompt,
              `fake output for ${stageDef.stage}`,
            ]),
          ),
        )
      : new CodexCliProvider({ quiesceWindowMs: config.quiesceWindowMs });

  try {
    const result = await runReportLoop({
      jobId: args.jobId,
      locales: args.locales,
      provider,
      cwd: config.cwd,
      resume: args.resume,
    });

    if (result.status === "stage_failed") {
      console.error(
        `[report-run] stage failed: ${result.stage} status=${result.stageStatus}: ${result.error}`,
      );
      return 2;
    }

    if (result.alreadyComplete) {
      console.error("[report-run] already complete: awaiting_approval");
    } else {
      console.error("[report-run] complete: awaiting_approval");
    }
    return 0;
  } catch (err) {
    console.error(formatError(err));
    return 1;
  }
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

if (import.meta.main) {
  const code = await main();
  process.exit(code);
}
