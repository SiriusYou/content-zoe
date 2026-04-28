import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  _getSpawnCount,
  assertCodexAvailable,
} from "../src/preflight.ts";
import {
  CodexCliProvider,
  parseAssistantFinalText,
} from "../src/llm/codex-cli.ts";
import { FakeProvider } from "../src/llm/fake.ts";
import { LLMProviderError } from "../src/llm/provider.ts";

type ScenarioName =
  | "fake"
  | "codex-cli"
  | "codex-cli-force-timeout"
  | "codex-cli-force-hard-kill"
  | "synthetic-no-turn-completed"
  | "synthetic-error-event";

interface ScenarioOutcome {
  name: ScenarioName;
  command: string;
  status: "PASS" | "FAIL" | "NOT_RUN";
  details: string[];
  startedAtIso?: string;
  finishedAtIso?: string;
  transcriptDir?: string;
  lifecycle?: string;
  quiescenceQuiet?: boolean;
  errorKind?: string;
}

interface CliOptions {
  provider: "all" | "fake" | "codex-cli";
  forceTimeout: boolean;
  forceHardKill: boolean;
}

const DOC_PATH = resolve("docs/preflight/llm-smoke.md");

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    provider: "all",
    forceTimeout: false,
    forceHardKill: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--provider") {
      const value = argv[++i];
      if (value !== "fake" && value !== "codex-cli") {
        throw new Error(`unsupported --provider value: ${value ?? "<missing>"}`);
      }
      options.provider = value;
    } else if (arg === "--force-timeout") {
      options.forceTimeout = true;
    } else if (arg === "--force-hard-kill") {
      options.forceHardKill = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

function repoRoot(): string {
  return resolve(dirname(new URL(import.meta.url).pathname), "..");
}

function commandFor(name: ScenarioName): string {
  if (name === "fake") return "bun run llm-smoke --provider fake";
  if (name === "codex-cli") return "bun run llm-smoke --provider codex-cli";
  if (name === "codex-cli-force-timeout") {
    return "bun run llm-smoke --provider codex-cli --force-timeout";
  }
  if (name === "codex-cli-force-hard-kill") {
    return "bun run llm-smoke --provider codex-cli --force-hard-kill";
  }
  return "bun run llm-smoke";
}

function notRun(name: ScenarioName): ScenarioOutcome {
  return {
    name,
    command: commandFor(name),
    status: "NOT_RUN",
    details: ["Scenario was not selected for this invocation."],
  };
}

function pass(
  name: ScenarioName,
  details: string[],
  extra: Partial<ScenarioOutcome> = {},
): ScenarioOutcome {
  return {
    name,
    command: commandFor(name),
    status: "PASS",
    details,
    startedAtIso: extra.startedAtIso,
    finishedAtIso: extra.finishedAtIso ?? new Date().toISOString(),
    transcriptDir: extra.transcriptDir,
    lifecycle: extra.lifecycle,
    quiescenceQuiet: extra.quiescenceQuiet,
    errorKind: extra.errorKind,
  };
}

function fail(
  name: ScenarioName,
  details: string[],
  extra: Partial<ScenarioOutcome> = {},
): ScenarioOutcome {
  return {
    name,
    command: commandFor(name),
    status: "FAIL",
    details,
    startedAtIso: extra.startedAtIso,
    finishedAtIso: extra.finishedAtIso ?? new Date().toISOString(),
    transcriptDir: extra.transcriptDir,
    lifecycle: extra.lifecycle,
    quiescenceQuiet: extra.quiescenceQuiet,
    errorKind: extra.errorKind,
  };
}

async function runFakeSmoke(): Promise<ScenarioOutcome> {
  const startedAtIso = new Date().toISOString();
  const provider = new FakeProvider(
    new Map([
      ["fake prompt one", "fake response one"],
      ["fake prompt two", "fake response two"],
    ]),
  );

  try {
    const cwd = repoRoot();
    const first = await provider.runPrompt("fake prompt one", cwd, 1000);
    const second = await provider.runPrompt("fake prompt two", cwd, 1000);
    if (first !== "fake response one" || second !== "fake response two") {
      return fail(
        "fake",
        [`Unexpected fake responses: ${JSON.stringify({ first, second })}`],
        { startedAtIso },
      );
    }
    return pass(
      "fake",
      [
        "One FakeProvider handled two canned prompts.",
        "No subprocess, filesystem write, or network path is used by FakeProvider.",
      ],
      { startedAtIso },
    );
  } catch (err) {
    return fail("fake", [formatError(err)], {
      startedAtIso,
      errorKind: err instanceof LLMProviderError ? err.kind : undefined,
    });
  }
}

async function runCodexCliSmoke(): Promise<ScenarioOutcome> {
  const startedAtIso = new Date().toISOString();
  const provider = new CodexCliProvider({ quiesceWindowMs: 500 });
  const cwd = repoRoot();
  const beforeSpawnCount = _getSpawnCount();

  try {
    const first = await provider.runPrompt(
      "Reply with a short non-empty sentence about provider smoke check one.",
      cwd,
      120_000,
    );
    const second = await provider.runPrompt(
      "Reply with a short non-empty sentence about provider smoke check two.",
      cwd,
      120_000,
    );
    const afterSpawnCount = _getSpawnCount();
    const spawnDelta = afterSpawnCount - beforeSpawnCount;

    if (!first.trim() || !second.trim()) {
      return fail(
        "codex-cli",
        ["Codex returned an empty response for at least one prompt."],
        { startedAtIso },
      );
    }
    if (spawnDelta !== 1) {
      return fail(
        "codex-cli",
        [
          `Expected one codex --version spawn across two prompts, observed delta ${spawnDelta}.`,
          `Before _getSpawnCount()=${beforeSpawnCount}, after=${afterSpawnCount}.`,
        ],
        { startedAtIso },
      );
    }

    return pass(
      "codex-cli",
      [
        "One CodexCliProvider handled two trivial prompts.",
        `Both responses were non-empty: lengths ${first.trim().length} and ${second.trim().length}.`,
        `_getSpawnCount() delta was 1 across both prompts; preflight remained process-memoized.`,
      ],
      {
        startedAtIso,
        transcriptDir: provider.getLastRunTelemetry()?.transcriptDir,
      },
    );
  } catch (err) {
    const telemetry = provider.getLastRunTelemetry();
    return fail("codex-cli", [formatError(err)], {
      startedAtIso,
      transcriptDir:
        telemetry?.transcriptDir ??
        (err instanceof LLMProviderError ? err.transcriptDir : undefined),
      errorKind: err instanceof LLMProviderError ? err.kind : undefined,
    });
  }
}

async function runForceTimeoutSmoke(): Promise<ScenarioOutcome> {
  const startedAtIso = new Date().toISOString();
  const provider = new CodexCliProvider({ quiesceWindowMs: 500 });

  try {
    await provider.runPrompt(
      "Think for a while before replying. This run intentionally has a tiny timeout.",
      repoRoot(),
      200,
    );
    return fail(
      "codex-cli-force-timeout",
      ["Expected a timeout error, but CodexCliProvider returned successfully."],
      { startedAtIso },
    );
  } catch (err) {
    const telemetry = provider.getLastRunTelemetry();
    const quiescence = err instanceof LLMProviderError ? err.quiescence : undefined;
    if (
      err instanceof LLMProviderError &&
      err.kind === "timeout" &&
      (err.lifecycle === "soft-only" || err.lifecycle === "soft+hard-kill") &&
      quiescence?.quiet === true
    ) {
      const classification =
        err.lifecycle === "soft-only"
          ? "PARTIAL soft-only"
          : "FULL soft+hard-kill";
      return pass(
        "codex-cli-force-timeout",
        [
          `Observed expected timeout classification: ${classification}.`,
          `Lifecycle marker: ${err.lifecycle}.`,
          "Quiescence was quiet after the timeout path.",
        ],
        {
          startedAtIso,
          transcriptDir: err.transcriptDir,
          lifecycle: err.lifecycle,
          quiescenceQuiet: quiescence.quiet,
          errorKind: err.kind,
        },
      );
    }

    return fail("codex-cli-force-timeout", [formatError(err)], {
      startedAtIso,
      transcriptDir:
        telemetry?.transcriptDir ??
        (err instanceof LLMProviderError ? err.transcriptDir : undefined),
      lifecycle: err instanceof LLMProviderError ? err.lifecycle : undefined,
      quiescenceQuiet:
        err instanceof LLMProviderError ? err.quiescence?.quiet : undefined,
      errorKind: err instanceof LLMProviderError ? err.kind : undefined,
    });
  }
}

async function runForceHardKillSmoke(): Promise<ScenarioOutcome> {
  const startedAtIso = new Date().toISOString();
  const provider = new CodexCliProvider({
    quiesceWindowMs: 500,
    argvBuilder: () => [
      process.execPath,
      "-e",
      [
        "process.on('SIGTERM', () => {});",
        "setInterval(() => {}, 1000);",
      ].join(""),
    ],
  });

  try {
    await provider.runPrompt(
      "this prompt is ignored by the controlled hard-kill child",
      repoRoot(),
      500,
    );
    return fail(
      "codex-cli-force-hard-kill",
      ["Expected a timeout error, but the controlled child returned."],
      { startedAtIso },
    );
  } catch (err) {
    const telemetry = provider.getLastRunTelemetry();
    const quiescence = err instanceof LLMProviderError ? err.quiescence : undefined;
    if (
      err instanceof LLMProviderError &&
      err.kind === "timeout" &&
      err.lifecycle === "soft+hard-kill" &&
      quiescence?.quiet === true
    ) {
      return pass(
        "codex-cli-force-hard-kill",
        [
          "Controlled child ignored SIGTERM.",
          "Provider escalated to process-group SIGKILL after the 10 second grace window.",
          "Quiescence was quiet after hard kill.",
        ],
        {
          startedAtIso,
          transcriptDir: err.transcriptDir,
          lifecycle: err.lifecycle,
          quiescenceQuiet: quiescence.quiet,
          errorKind: err.kind,
        },
      );
    }

    return fail("codex-cli-force-hard-kill", [formatError(err)], {
      startedAtIso,
      transcriptDir:
        telemetry?.transcriptDir ??
        (err instanceof LLMProviderError ? err.transcriptDir : undefined),
      lifecycle: err instanceof LLMProviderError ? err.lifecycle : undefined,
      quiescenceQuiet:
        err instanceof LLMProviderError ? err.quiescence?.quiet : undefined,
      errorKind: err instanceof LLMProviderError ? err.kind : undefined,
    });
  }
}

async function runSyntheticNoTurnCompleted(): Promise<ScenarioOutcome> {
  const startedAtIso = new Date().toISOString();
  const jsonl = [
    JSON.stringify({
      type: "item.completed",
      item: {
        type: "agent_message",
        text: "this text must not be accepted without turn.completed",
      },
    }),
    "",
  ].join("\n");

  try {
    parseAssistantFinalText(jsonl);
    return fail(
      "synthetic-no-turn-completed",
      ["Parser returned text even though turn.completed was absent."],
      { startedAtIso },
    );
  } catch (err) {
    if (
      err instanceof LLMProviderError &&
      err.kind === "parse" &&
      err.message.includes("turn.completed")
    ) {
      return pass(
        "synthetic-no-turn-completed",
        [
          "Parser rejected agent_message text when the stream lacked turn.completed.",
          "Failure kind was LLMProviderError(kind=parse).",
        ],
        { startedAtIso, errorKind: err.kind },
      );
    }
    return fail("synthetic-no-turn-completed", [formatError(err)], {
      startedAtIso,
      errorKind: err instanceof LLMProviderError ? err.kind : undefined,
    });
  }
}

async function runSyntheticErrorEvent(): Promise<ScenarioOutcome> {
  const startedAtIso = new Date().toISOString();
  const jsonl = [
    JSON.stringify({ type: "error", message: "synthetic codex failure" }),
    JSON.stringify({
      type: "item.completed",
      item: {
        type: "agent_message",
        text: "this text must not mask the error event",
      },
    }),
    JSON.stringify({ type: "turn.completed" }),
    "",
  ].join("\n");

  try {
    parseAssistantFinalText(jsonl);
    return fail(
      "synthetic-error-event",
      ["Parser returned text even though an error event was present."],
      { startedAtIso },
    );
  } catch (err) {
    if (
      err instanceof LLMProviderError &&
      err.kind === "parse" &&
      err.message.includes("synthetic codex failure")
    ) {
      return pass(
        "synthetic-error-event",
        [
          "Parser rejected a stream containing an error event before returning any agent_message text.",
          "Failure kind was LLMProviderError(kind=parse), and the error message preserved the Codex error text.",
        ],
        { startedAtIso, errorKind: err.kind },
      );
    }
    return fail("synthetic-error-event", [formatError(err)], {
      startedAtIso,
      errorKind: err instanceof LLMProviderError ? err.kind : undefined,
    });
  }
}

function formatError(err: unknown): string {
  if (err instanceof LLMProviderError) {
    const stderrNote =
      err.stderrTail && err.stderrTail.trim()
        ? ` stderrTail=${JSON.stringify(err.stderrTail.trim().slice(-800))}`
        : "";
    return `LLMProviderError(kind=${err.kind}${
      err.lifecycle ? `, lifecycle=${err.lifecycle}` : ""
    }${err.transcriptDir ? `, transcriptDir=${err.transcriptDir}` : ""}): ${
      err.message
    }${stderrNote}`;
  }
  return err instanceof Error ? err.stack ?? err.message : String(err);
}

function selectedScenarios(options: CliOptions): ScenarioName[] {
  if (options.provider === "all") {
    return [
      "fake",
      "codex-cli",
      "codex-cli-force-timeout",
      "codex-cli-force-hard-kill",
      "synthetic-no-turn-completed",
      "synthetic-error-event",
    ];
  }
  if (options.provider === "fake") return ["fake"];
  if (options.forceTimeout) return ["codex-cli-force-timeout"];
  if (options.forceHardKill) return ["codex-cli-force-hard-kill"];
  return ["codex-cli"];
}

async function runScenario(name: ScenarioName): Promise<ScenarioOutcome> {
  if (name === "fake") return runFakeSmoke();
  if (name === "codex-cli") return runCodexCliSmoke();
  if (name === "codex-cli-force-timeout") return runForceTimeoutSmoke();
  if (name === "codex-cli-force-hard-kill") return runForceHardKillSmoke();
  if (name === "synthetic-no-turn-completed") {
    return runSyntheticNoTurnCompleted();
  }
  return runSyntheticErrorEvent();
}

function renderOutcome(outcome: ScenarioOutcome): string {
  const lines = [
    `### ${outcome.name}`,
    "",
    `- Command: \`${outcome.command}\``,
    `- Status: ${outcome.status}`,
  ];
  if (outcome.startedAtIso) lines.push(`- Started: ${outcome.startedAtIso}`);
  if (outcome.finishedAtIso) lines.push(`- Finished: ${outcome.finishedAtIso}`);
  if (outcome.errorKind) lines.push(`- Error kind: \`${outcome.errorKind}\``);
  if (outcome.lifecycle) lines.push(`- Timeout lifecycle: \`${outcome.lifecycle}\``);
  if (outcome.quiescenceQuiet !== undefined) {
    lines.push(`- Quiescence quiet: \`${outcome.quiescenceQuiet}\``);
  }
  if (outcome.transcriptDir) {
    lines.push(`- Transcript directory: \`${outcome.transcriptDir}\``);
  }
  for (const detail of outcome.details) {
    lines.push(`- Evidence: ${detail}`);
  }
  return lines.join("\n");
}

function tryCodexVersion(shouldCheck: boolean): string {
  if (!shouldCheck) return "not checked by this invocation";
  try {
    return assertCodexAvailable().raw;
  } catch (err) {
    return `unavailable: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function writeReport(outcomes: ScenarioOutcome[]): Promise<void> {
  const byName = new Map(outcomes.map((outcome) => [outcome.name, outcome]));
  const allNames: ScenarioName[] = [
    "fake",
    "codex-cli",
    "codex-cli-force-timeout",
    "codex-cli-force-hard-kill",
    "synthetic-no-turn-completed",
    "synthetic-error-event",
  ];
  const complete = allNames.map((name) => byName.get(name) ?? notRun(name));
  const shouldCheckCodexVersion = outcomes.some((outcome) =>
    outcome.name.startsWith("codex-cli"),
  );
  const codexVersion = tryCodexVersion(shouldCheckCodexVersion);
  const hardKill = complete.find(
    (outcome) => outcome.name === "codex-cli-force-hard-kill",
  );
  const forceTimeout = complete.find(
    (outcome) => outcome.name === "codex-cli-force-timeout",
  );

  const doc = [
    "# LLM Provider Smoke - Evidence Report",
    "",
    "**Slice:** cz Slice 2 (Phase 4.1) LLM provider scaffold",
    `**Generated:** ${new Date().toISOString()}`,
    `**Codex CLI version:** \`${codexVersion}\``,
    "",
    "## Outcome Matrix",
    "",
    "| Scenario | Status | Lifecycle | Quiet |",
    "|---|---:|---|---:|",
    ...complete.map(
      (outcome) =>
        `| \`${outcome.name}\` | ${outcome.status} | ${
          outcome.lifecycle ? `\`${outcome.lifecycle}\`` : "-"
        } | ${
          outcome.quiescenceQuiet === undefined
            ? "-"
            : `\`${outcome.quiescenceQuiet}\``
        } |`,
    ),
    "",
    "## Scenario Evidence",
    "",
    ...complete.map(renderOutcome),
    "",
    "## Timeout Lifecycle Classification",
    "",
    forceTimeout?.status === "PASS"
      ? `The real Codex timeout path reported \`${forceTimeout.lifecycle}\`, classified as ${
          forceTimeout.lifecycle === "soft-only"
            ? "PARTIAL soft-only"
            : "FULL soft+hard-kill"
        }, with quiescence quiet = \`${forceTimeout.quiescenceQuiet}\`.`
      : "The real Codex timeout path has not produced a passing timeout classification in this report.",
    "",
    "## Controlled Hard-Kill Proof",
    "",
    hardKill?.status === "PASS"
      ? "The controlled child installed a SIGTERM handler that does not exit, so the provider had to escalate from process-group SIGTERM to process-group SIGKILL. The resulting `LLMProviderError(kind=\"timeout\")` carried lifecycle `soft+hard-kill`, and post-kill quiescence was quiet."
      : "The controlled hard-kill proof has not produced a passing `soft+hard-kill` result in this report.",
    "",
    "## Slice 3+ Handoff Notes",
    "",
    "- `LLM_PROVIDER` remains a Slice 3+ composition-root concern. This slice does not add provider selection or a factory.",
    "- `CZ_LLM_QUIESCE_MS` remains a Slice 3+ composition-root concern. `CodexCliProvider` accepts `quiesceWindowMs` directly and does not read environment variables.",
    "- Slice 3 can consume `LLMProvider.runPrompt(prompt, cwd, timeoutMs)` without coupling pipeline stages to Codex CLI lifecycle details.",
    "",
    "## Review Gate Reminder",
    "",
    "- Gate 1 requires hc-Claude process discipline plus hc-Codex adversarial implementation review.",
    "- Gate 2 requires cz-Claude implementation intent review plus cz-Codex adversarial review, with both Gate 2 verdicts `APPROVE` or `APPROVE-WITH-AMENDMENTS-MET` before operator merge.",
    "",
  ].join("\n");

  mkdirSync(dirname(DOC_PATH), { recursive: true });
  await Bun.write(DOC_PATH, doc);
}

async function main(): Promise<void> {
  const options = parseArgs(Bun.argv.slice(2));
  const names = selectedScenarios(options);
  const outcomes: ScenarioOutcome[] = [];

  for (const name of names) {
    console.log(`[llm-smoke] running ${name}`);
    const outcome = await runScenario(name);
    outcomes.push(outcome);
    console.log(`[llm-smoke] ${name}: ${outcome.status}`);
  }

  await writeReport(outcomes);
  console.log(`[llm-smoke] report written: ${DOC_PATH}`);

  if (outcomes.some((outcome) => outcome.status === "FAIL")) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[llm-smoke] ${formatError(err)}`);
  process.exit(1);
});
