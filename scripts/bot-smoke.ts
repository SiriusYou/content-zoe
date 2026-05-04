import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertChangedFilesWithinScope,
  assertNoChangedDirectories,
  assertNoChangedFiles,
  assertNoForbiddenPatterns,
  changedFilesAgainstBase as getChangedFilesAgainstBase,
  PROCESS_SPAWN_PATTERNS,
  PROMPT_SURFACE_PATTERNS,
  readRepoSource,
  type ForbiddenPattern,
} from "./lib/static-guardrails.ts";
import type { DbClient } from "../src/db.ts";
import { parseOperatorChatIds } from "../src/telegram/allowlist.ts";
import {
  DEFAULT_TICK_INTERVAL_MS,
  defaultBotDbPath,
  loadBotConfig,
  createBotTick,
  createTelegramSender,
  startBotRuntime,
  type TelegramTransport,
} from "../src/telegram/bot.ts";
import type {
  ApprovalNotification,
  NotifyPendingApprovalsResult,
} from "../src/telegram/notifier.ts";

type ScenarioName =
  | "allowlist-valid-dedupe"
  | "allowlist-fail-closed"
  | "bot-config-fail-closed"
  | "tick-calls-notifier"
  | "overlap-guard"
  | "open-db-failure-releases-guard"
  | "telegram-sender-adapter"
  | "no-command-handlers"
  | "boundary-static-check"
  | "dependency-boundary-check"
  | "bot-db-path-cwd"
  | "no-preflight-codex-survivability"
  | "no-command-placeholder-registrations";

interface ScenarioOutcome {
  readonly name: ScenarioName;
  readonly status: "PASS" | "FAIL";
  readonly details: readonly string[];
  readonly startedAtIso: string;
  readonly finishedAtIso: string;
}

const SCENARIOS: readonly ScenarioName[] = [
  "allowlist-valid-dedupe",
  "allowlist-fail-closed",
  "bot-config-fail-closed",
  "tick-calls-notifier",
  "overlap-guard",
  "open-db-failure-releases-guard",
  "telegram-sender-adapter",
  "no-command-handlers",
  "boundary-static-check",
  "dependency-boundary-check",
  "bot-db-path-cwd",
  "no-preflight-codex-survivability",
  "no-command-placeholder-registrations",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = path.join(
  tmpdir(),
  `cz-bot-smoke-${new Date().toISOString().replaceAll(":", "-")}`,
);
const docPath = resolve(repoRoot, "docs", "preflight", "bot-smoke.md");
const targetBase = "8b1aef93b8751160e34d4b97d7bc4fec257c8c0c";
const declaredScope = new Set([
  "scripts/lib/static-guardrails.ts",
  "scripts/approval-summary-smoke.ts",
  "scripts/bot-smoke.ts",
  "scripts/notifier-smoke.ts",
  "docs/preflight/approval-summary-smoke.md",
  "docs/preflight/bot-smoke.md",
  "docs/preflight/notifier-smoke.md",
]);

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
  }

  for (const outcome of outcomes) {
    console.log(`${outcome.status} ${outcome.name}`);
    for (const detail of outcome.details) {
      console.log(`  - ${detail}`);
    }
  }

  const passed = outcomes.filter((outcome) => outcome.status === "PASS").length;
  console.log(`${passed}/${SCENARIOS.length} PASS`);
  return passed === SCENARIOS.length ? 0 : 1;
}

async function runScenario(name: ScenarioName): Promise<ScenarioOutcome> {
  const startedAtIso = new Date().toISOString();
  const dir = resolve(smokeRoot, name);
  mkdirSync(dir, { recursive: true });

  try {
    const details = await scenarioImpl(name, dir);
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
  dir: string,
): Promise<string[]> {
  switch (name) {
    case "allowlist-valid-dedupe":
      return runAllowlistValidDedupe();
    case "allowlist-fail-closed":
      return runAllowlistFailClosed();
    case "bot-config-fail-closed":
      return runBotConfigFailClosed(dir);
    case "tick-calls-notifier":
      return runTickCallsNotifier(dir);
    case "overlap-guard":
      return runOverlapGuard(dir);
    case "open-db-failure-releases-guard":
      return runOpenDbFailureReleasesGuard(dir);
    case "telegram-sender-adapter":
      return runTelegramSenderAdapter();
    case "no-command-handlers":
      return runNoCommandHandlers();
    case "boundary-static-check":
      return runBoundaryStaticCheck();
    case "dependency-boundary-check":
      return runDependencyBoundaryCheck();
    case "bot-db-path-cwd":
      return runBotDbPathCwd(dir);
    case "no-preflight-codex-survivability":
      return runNoPreflightCodexSurvivability();
    case "no-command-placeholder-registrations":
      return runNoCommandPlaceholderRegistrations();
  }
}

function runAllowlistValidDedupe(): string[] {
  const result = parseOperatorChatIds(" 123, -456,123, -456,789 ");

  assert(result.valid, "expected valid allowlist");
  assertArrayEquals(result.chatIds, [123, -456, 789], "chat ID order/dedupe");
  assert(result.isAllowedChat(-456), "negative chat ID was not allowed");
  assert(!result.isAllowedChat(456), "unsigned mismatch was allowed");

  return [
    "Whitespace was trimmed, duplicate IDs were removed, first-seen order was preserved, and negative IDs remained authorized.",
  ];
}

function runAllowlistFailClosed(): string[] {
  const invalidValues = [
    undefined,
    null,
    "",
    "   ",
    "abc",
    "1.5",
    "1, two",
    "1,,2",
    "9007199254740992",
  ];

  for (const value of invalidValues) {
    const result = parseOperatorChatIds(value);
    assert(!result.valid, `expected invalid value to fail closed: ${String(value)}`);
    assert(result.chatIds.length === 0, "failed parse exposed chat IDs");
    assert(!result.isAllowedChat(1), "failed parse allowed chat 1");
  }

  return [
    "Missing, empty, malformed, non-integer, mixed-validity, and unsafe-integer values all produced a closed allowlist.",
  ];
}

function runBotConfigFailClosed(dir: string): string[] {
  const missingToken = loadBotConfig({
    env: { OPERATOR_CHAT_IDS: "1" },
    cwd: dir,
  });
  const malformedAllowlist = loadBotConfig({
    env: { TELEGRAM_BOT_TOKEN: "token", OPERATOR_CHAT_IDS: "1,bad" },
    cwd: dir,
  });
  const emptyToken = loadBotConfig({
    env: { TELEGRAM_BOT_TOKEN: "   ", OPERATOR_CHAT_IDS: "1" },
    cwd: dir,
  });
  const missingAllowlist = loadBotConfig({
    env: { TELEGRAM_BOT_TOKEN: "token" },
    cwd: dir,
  });
  let timerCalls = 0;

  try {
    startBotRuntime({
      configLoader: () => missingToken,
      timer: {
        setInterval(): unknown {
          timerCalls += 1;
          return 1;
        },
        clearInterval(): void {
          timerCalls += 1;
        },
      },
    });
    throw new Error("runtime started with missing token");
  } catch (err) {
    assert(err instanceof Error, "expected config error");
  }

  assert(!missingToken.ok, "missing token config was accepted");
  assert(!malformedAllowlist.ok, "malformed allowlist config was accepted");
  assert(!emptyToken.ok, "empty token config was accepted");
  assert(!missingAllowlist.ok, "missing allowlist config was accepted");
  assert(
    missingToken.errors.includes("TELEGRAM_BOT_TOKEN is required"),
    "missing token failure did not identify token",
  );
  assert(
    malformedAllowlist.errors.includes("OPERATOR_CHAT_IDS must be a comma-separated integer allowlist"),
    "malformed allowlist failure did not identify OPERATOR_CHAT_IDS",
  );
  assert(
    emptyToken.errors.includes("TELEGRAM_BOT_TOKEN is required"),
    "empty token failure did not identify token",
  );
  assert(
    missingAllowlist.errors.includes("OPERATOR_CHAT_IDS must be a comma-separated integer allowlist"),
    "missing allowlist failure did not identify OPERATOR_CHAT_IDS",
  );
  assert(timerCalls === 0, "invalid config started timer work");

  return [
    "Missing/empty token and missing/malformed allowlist config returned specific closed failures.",
    "Runtime start rejected invalid config before timer, DB, sender, or network work.",
  ];
}

async function runTickCallsNotifier(dir: string): Promise<string[]> {
  const dbPath = resolve(dir, "content.db");
  const db = fakeDb();
  const senderCalls: ApprovalNotification[] = [];
  let openedPath = "";
  let notifierCalls = 0;

  const tick = createBotTick({
    dbPath,
    openDb(pathArg) {
      openedPath = pathArg;
      return db;
    },
    sender(notification) {
      senderCalls.push(notification);
    },
    now: () => 1_800_000_000,
    sleep: async () => undefined,
    notifyPendingApprovals: async (options) => {
      notifierCalls += 1;
      assert(options.db === db, "notifier received wrong DB handle");
      await options.sender({
        jobId: "job-1",
        attemptNumber: 1,
        approvalSummary: "summary",
        text: "exact notifier text",
      });
      return notifierResult({ selected: 1, sent: 1, senderCalls: 1 });
    },
  });

  const result = await tick.tick();

  assert(result.status === "ran", "tick did not run");
  assert(openedPath === dbPath, "tick opened wrong DB path");
  assert(notifierCalls === 1, `expected one notifier call, got ${notifierCalls}`);
  assert(senderCalls.length === 1, "sender was not invoked through notifier path");
  assert(senderCalls[0]?.text === "exact notifier text", "sender text changed");
  assert(db.closeCalls === 1, "DB was not closed after tick");

  return [
    "Tick opened the injected DB path, called injected notifyPendingApprovals once, passed sender/clock/sleep seams, and closed the DB.",
  ];
}

async function runOverlapGuard(dir: string): Promise<string[]> {
  const db = fakeDb();
  let notifierRunning = 0;
  let maxNotifierRunning = 0;
  let releaseNotifier: (() => void) | undefined;
  let notifierCalls = 0;

  const tick = createBotTick({
    dbPath: resolve(dir, "content.db"),
    openDb: () => db,
    sender: async () => undefined,
    now: () => 1,
    sleep: async () => undefined,
    notifyPendingApprovals: async () => {
      notifierCalls += 1;
      notifierRunning += 1;
      maxNotifierRunning = Math.max(maxNotifierRunning, notifierRunning);
      if (notifierCalls === 1) {
        await new Promise<void>((resolvePromise) => {
          releaseNotifier = resolvePromise;
        });
      }
      notifierRunning -= 1;
      return notifierResult({ selected: 1, sent: 1 });
    },
  });

  const first = tick.tick();
  await Promise.resolve();
  const second = await tick.tick();
  assert(second.status === "skipped", "overlapping tick was not skipped");
  releaseNotifier?.();
  const firstResult = await first;
  const third = await tick.tick();

  assert(firstResult.status === "ran", "first tick did not complete as ran");
  assert(third.status === "ran", "third tick after release did not run");
  assert(maxNotifierRunning === 1, "notifier executions overlapped");
  assert(db.closeCalls === 2, `expected two DB closes, got ${db.closeCalls}`);

  return [
    "While one notifier execution was in flight, a concurrent tick returned skipped without opening another notifier run.",
    "After the first tick released, a later tick ran normally.",
  ];
}

async function runOpenDbFailureReleasesGuard(dir: string): Promise<string[]> {
  const db = fakeDb();
  let openAttempts = 0;
  let notifierCalls = 0;

  const tick = createBotTick({
    dbPath: resolve(dir, "content.db"),
    openDb: () => {
      openAttempts += 1;
      if (openAttempts === 1) {
        throw new Error("db open failed");
      }
      return db;
    },
    sender: async () => undefined,
    now: () => 1,
    sleep: async () => undefined,
    notifyPendingApprovals: async () => {
      notifierCalls += 1;
      return notifierResult({ selected: 1, sent: 1 });
    },
  });

  let threw = false;
  try {
    await tick.tick();
  } catch (err) {
    threw = err instanceof Error && err.message === "db open failed";
  }

  const second = await tick.tick();

  assert(threw, "first DB-open failure was not surfaced");
  assert(second.status === "ran", "tick stayed skipped after DB-open failure");
  assert(openAttempts === 2, `expected two DB open attempts, got ${openAttempts}`);
  assert(notifierCalls === 1, `expected one notifier call after recovery, got ${notifierCalls}`);
  assert(db.closeCalls === 1, `expected successful DB handle to close once, got ${db.closeCalls}`);

  return [
    "A thrown openDb failure surfaced to the caller and released the overlap guard.",
    "The next tick opened the DB again, ran the notifier, and closed the successful DB handle.",
  ];
}

async function runTelegramSenderAdapter(): Promise<string[]> {
  const sends: { chatId: number; text: string }[] = [];
  const transport: TelegramTransport = {
    async sendMessage(chatId, text) {
      sends.push({ chatId, text });
      if (chatId === 300) {
        throw new Error("send failed");
      }
    },
  };
  const sender = createTelegramSender({
    chatIds: [100, -200],
    transport,
  });
  const notification = notificationWithText("notifier-owned text");

  await sender(notification);
  assertArrayEquals(
    sends.map((send) => send.chatId),
    [100, -200],
    "sent chat IDs",
  );
  assert(
    sends.every((send) => send.text === notification.text),
    "sender mutated notification text",
  );

  const failingSender = createTelegramSender({
    chatIds: [100, 300],
    transport,
  });
  let threw = false;
  try {
    await failingSender(notificationWithText("throwing text"));
  } catch {
    threw = true;
  }
  assert(threw, "sender did not throw when one chat send failed");

  return [
    "Adapter sent notification.text unchanged to every configured chat ID.",
    "A failed chat send caused the adapter to throw, preserving notifier retry authority.",
  ];
}

function runNoCommandHandlers(): string[] {
  const botSource = readSource("src/telegram/bot.ts");
  const commandPatterns = [
    /\.command\s*\(/,
    /\.hears\s*\(/,
    /\.on\s*\(\s*["']message/,
    /setMyCommands/,
  ];

  for (const pattern of commandPatterns) {
    assert(!pattern.test(botSource), `bot.ts contains command handler pattern ${pattern}`);
  }

  return [
    "Inspected bot.ts directly and found no command/hears/message handler registrations.",
  ];
}

function runBoundaryStaticCheck(): string[] {
  const changed = changedFilesAgainstBase();
  assertChangedFilesWithinScope(changed, declaredScope);
  assertNoChangedFiles(changed, [
    "src/telegram/notifier.ts",
    "src/bin/report-run.ts",
    "src/lib/report-loop.ts",
    "src/lib/report-run-fake-provider.ts",
    "src/lib/runtime-config.ts",
    "src/db.ts",
    "src/preflight.ts",
    "src/promote.ts",
  ]);
  assertNoChangedDirectories(changed, [
    "src/pipeline/",
    "src/migrations/",
    "src/llm/",
    "src/prompts/",
  ]);

  const changedSources = changed
    .filter((file) => file === "src/telegram/bot.ts" || file === "src/telegram/allowlist.ts")
    .map((file) => [file, readSource(file)] as const);
  const forbiddenRuntimePatterns: readonly ForbiddenPattern[] = [
    ...PROMPT_SURFACE_PATTERNS,
    [/from\s+["'][^"']*preflight\.ts["']|assertCodexAvailable|codex-smoke/, "preflight/Codex dependency"],
    [new RegExp(["report", "run"].join(":")), "operator report command dependency"],
    ...PROCESS_SPAWN_PATTERNS,
    [/INSERT\s+INTO\s+jobs|casUpdateJob|insertEvent|findJobById/, "duplicate notifier/DB mutation logic"],
  ];
  for (const [file, source] of changedSources) {
    assertNoForbiddenPatterns(source, forbiddenRuntimePatterns, file);
  }

  const smokeSource = readSource("scripts/bot-smoke.ts");
  assert(!/fetch\s*\(|api\.telegram\.org/.test(smokeSource), "smoke can call Telegram");

  return [
    `Stable base/status scope check saw only declared files: ${changed.join(", ") || "<none>"}.`,
    "Changed source surfaces contain no prompt/LLM/preflight/Codex dependency, operator report command dependency, DB schema/migration touch, or duplicate notifier mutation logic.",
    "Smoke source contains no Telegram fetch/API network path.",
  ];
}

function runDependencyBoundaryCheck(): string[] {
  const botSource = readSource("src/telegram/bot.ts");
  const notifierSource = readSource("src/telegram/notifier.ts");
  const packageJson = JSON.parse(readSource("package.json")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const telegramDependencyPattern =
    /from ["'](?:grammy|telegraf)["']|require\(["'](?:grammy|telegraf)["']\)/;
  assert(!telegramDependencyPattern.test(notifierSource), "notifier imports Telegram dependency");
  const declaredTelegramDeps = ["grammy", "telegraf"].filter(
    (name) => packageJson.dependencies?.[name] || packageJson.devDependencies?.[name],
  );
  const botTelegramImports = [
    ...botSource.matchAll(new RegExp(telegramDependencyPattern, "g")),
  ];
  assert(
    botTelegramImports.length === 0 || declaredTelegramDeps.length > 0,
    "bot imports Telegram SDK without package dependency",
  );
  assert(
    declaredTelegramDeps.length === 0 || botTelegramImports.length > 0,
    "Telegram SDK dependency declared without bot.ts import",
  );
  assert(
    packageJson.scripts?.bot === "bun src/telegram/bot.ts",
    "package.json bot script missing",
  );
  assert(
    packageJson.scripts?.["bot-smoke"] === "bun scripts/bot-smoke.ts",
    "package.json bot-smoke script missing",
  );

  return [
    "Telegram SDK dependency imports are absent outside bot.ts; notifier.ts remains dependency-free.",
    "package.json exposes only the expected bot runtime and bot-smoke command surfaces for this slice.",
  ];
}

function runBotDbPathCwd(dir: string): string[] {
  const cwd = resolve(dir, "runtime-cwd");
  const expectedDbPath = resolve(cwd, ".data/content.db");
  const result = loadBotConfig({
    env: { TELEGRAM_BOT_TOKEN: "token", OPERATOR_CHAT_IDS: "-100,200" },
    cwd,
  });

  assert(result.ok, "valid config failed");
  assert(result.config.dbPath === expectedDbPath, "default DB path did not use cwd");
  assert(
    result.config.tickIntervalMs === DEFAULT_TICK_INTERVAL_MS,
    "default tick interval changed",
  );
  assert(defaultBotDbPath(cwd) === expectedDbPath, "defaultBotDbPath helper mismatch");

  return [
    `Default DB path resolved to ${expectedDbPath}.`,
    `Default tick interval remains ${DEFAULT_TICK_INTERVAL_MS}.`,
  ];
}

function runNoPreflightCodexSurvivability(): string[] {
  const botSource = readSource("src/telegram/bot.ts");
  const allowlistSource = readSource("src/telegram/allowlist.ts");
  const combined = `${botSource}\n${allowlistSource}`;
  const forbiddenPatterns: readonly ForbiddenPattern[] = [
    [/preflight\.ts|assertCodexAvailable/, "preflight dependency"],
    [/codex-smoke/, "codex smoke dependency"],
    ...PROMPT_SURFACE_PATTERNS,
    [new RegExp(["report", "run"].join(":")), "operator report command dependency"],
  ];

  assertNoForbiddenPatterns(combined, forbiddenPatterns, "bot surfaces");

  return [
    "Bot and allowlist surfaces have no preflight, Codex smoke, LLM, prompt, or operator report command dependency.",
  ];
}

function runNoCommandPlaceholderRegistrations(): string[] {
  const botSource = readSource("src/telegram/bot.ts");
  const placeholderPatterns: [RegExp, string][] = [
    [/\/approve/, "/approve placeholder"],
    [/\/reject/, "/reject placeholder"],
    [/\/status/, "/status placeholder"],
    [/TODO.*command|placeholder.*command|noop.*command/i, "inert command placeholder"],
  ];

  for (const [pattern, label] of placeholderPatterns) {
    assert(!pattern.test(botSource), `bot.ts contains ${label}`);
  }

  return [
    "bot.ts contains no approve/reject/status strings and no inert command placeholder wording.",
  ];
}

function changedFilesAgainstBase(): string[] {
  return getChangedFilesAgainstBase(repoRoot, targetBase);
}

function readSource(relativePath: string): string {
  return readRepoSource(repoRoot, relativePath);
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  const passed = outcomes.filter((outcome) => outcome.status === "PASS").length;
  const lines = [
    "# Bot Smoke Evidence",
    "",
    `- Command: \`bun run bot-smoke\``,
    `- Started: ${outcomes[0]?.startedAtIso ?? new Date().toISOString()}`,
    `- Finished: ${outcomes.at(-1)?.finishedAtIso ?? new Date().toISOString()}`,
    `- Scenario root: ${smokeRoot} (removed by finally-cleanup)`,
    `- Result: ${passed}/${SCENARIOS.length} PASS`,
    "",
    "## Evidence Ceiling",
    "",
    "This smoke exercises deterministic allowlist parsing, injected bot runtime seams, static source boundaries, and fake Telegram transports only. It does not call Telegram, launch browser checks, or run operator-only Codex-backed report execution.",
    "",
    "## Scenario Results",
    "",
    "| Scenario | Result | Evidence |",
    "|---|---:|---|",
    ...outcomes.map(
      (outcome) =>
        `| ${outcome.name} | ${outcome.status} | ${outcome.details
          .map((detail) => detail.replaceAll("|", "\\|"))
          .join("<br>")} |`,
    ),
  ];

  writeFileSync(docPath, `${lines.join("\n")}\n`);
}

function notificationWithText(text: string): ApprovalNotification {
  return {
    jobId: "job",
    attemptNumber: 1,
    approvalSummary: "summary",
    text,
  };
}

function notifierResult(
  patch: Partial<NotifyPendingApprovalsResult>,
): NotifyPendingApprovalsResult {
  return {
    selected: 0,
    sent: 0,
    failed: 0,
    malformed: 0,
    abandoned: 0,
    senderCalls: 0,
    ...patch,
  };
}

function fakeDb(): DbClient & { closeCalls: number } {
  return {
    closeCalls: 0,
    close() {
      this.closeCalls += 1;
    },
  } as DbClient & { closeCalls: number };
}

function assertArrayEquals(
  actual: readonly number[],
  expected: readonly number[],
  label: string,
): void {
  assert(
    actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    `${label} expected [${expected.join(",")}], got [${actual.join(",")}]`,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function formatError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

if (import.meta.main) {
  const code = await main();
  process.exit(code);
}
