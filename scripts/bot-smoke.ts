import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  TELEGRAM_SDK_IMPORT_PATTERNS,
  TELEGRAM_SDK_NETWORK_PATTERNS,
  readRepoSource,
  type ForbiddenPattern,
} from "./lib/static-guardrails.ts";
import {
  findEventsByJob,
  findJobById,
  insertEvent,
  insertJob,
  openDb,
  updateJob,
  type DbClient,
  type Job,
} from "../src/db.ts";
import { parseOperatorChatIds } from "../src/telegram/allowlist.ts";
import {
  DEFAULT_COMMAND_POLL_INTERVAL_MS,
  DEFAULT_COMMAND_LONG_POLL_TIMEOUT_SECONDS,
  DEFAULT_TICK_INTERVAL_MS,
  defaultBotDbPath,
  loadBotConfig,
  createBotTick,
  createTelegramHttpCommandTransport,
  createTelegramSender,
  startBotRuntime,
  type TelegramCommandHandler,
  type TelegramCommandName,
  type TelegramCommandTransport,
  type TelegramTransport,
} from "../src/telegram/bot.ts";
import {
  approveSuccessReply,
  formatApproveErrorReply,
  REJECT_REASON_MAX_CHARS,
  formatRejectErrorReply,
  formatStatusErrorReply,
  handleApproveCommand,
  handleRejectCommand,
  handleStatusCommand,
  isValidRejectScopeType,
  parseApproveCommand,
  parseRejectCommand,
  parseStatusCommand,
  rejectSuccessReply,
  rewindStageForScope,
  type RejectScope,
  type RejectType,
} from "../src/telegram/commands.ts";
import {
  buildGitCommitPlan,
  promoteJob,
  type GitCommitPlan,
} from "../src/promote.ts";
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
  | "reject-command-parse"
  | "reject-scope-type-matrix"
  | "reject-success-requeues"
  | "reject-zh-rewinds-translate"
  | "reject-invalid-combo"
  | "reject-stale-attempt"
  | "reject-status-mismatch"
  | "reject-duplicate-prevention"
  | "reject-race-lost-after-read"
  | "reject-unauthorized-known-job"
  | "reject-unauthorized-unknown-job"
  | "reject-allowlisted-malformed-visible"
  | "approve-command-parse"
  | "approve-malformed-jobid-preserved"
  | "approve-unauthorized-known-job"
  | "approve-unauthorized-unknown-job"
  | "approve-unknown-job-visible"
  | "approve-stale-attempt"
  | "approve-status-mismatch"
  | "approve-source-validation"
  | "approve-success-publishes-bundle"
  | "approve-idempotent-repromote"
  | "approve-rename-before-db-recovery"
  | "approve-rename-succeeded-cas-lost"
  | "approve-existing-destination-cas-lost"
  | "approve-checksum-divergence-refused"
  | "approve-duplicate-prevention"
  | "approve-race-lost-after-read"
  | "approve-runs-cleanup"
  | "approve-cleanup-failure-visible"
  | "approve-git-commit-failure-nonblocking"
  | "status-command-parse"
  | "status-malformed-jobid-preserved"
  | "status-bare-invalid-no-fake-jobid"
  | "status-known-job-summary"
  | "status-unknown-job-visible"
  | "status-unauthorized-known-job"
  | "status-unauthorized-unknown-job"
  | "status-read-only-no-mutation"
  | "status-published-manifest-authority"
  | "status-failed-job-error-visible"
  | "status-last-notify-error-visible"
  | "status-approval-summary-visible"
  | "command-long-poll-timeout"
  | "command-long-poll-offset"
  | "command-long-poll-malformed-onerror"
  | "command-long-poll-overlap-guard"
  | "command-long-poll-stop-clears-future-polls"
  | "bot-command-wiring"
  | "boundary-static-check"
  | "dependency-boundary-check"
  | "bot-db-path-cwd"
  | "no-preflight-codex-survivability";

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
  "reject-command-parse",
  "reject-scope-type-matrix",
  "reject-success-requeues",
  "reject-zh-rewinds-translate",
  "reject-invalid-combo",
  "reject-stale-attempt",
  "reject-status-mismatch",
  "reject-duplicate-prevention",
  "reject-race-lost-after-read",
  "reject-unauthorized-known-job",
  "reject-unauthorized-unknown-job",
  "reject-allowlisted-malformed-visible",
  "approve-command-parse",
  "approve-malformed-jobid-preserved",
  "approve-unauthorized-known-job",
  "approve-unauthorized-unknown-job",
  "approve-unknown-job-visible",
  "approve-stale-attempt",
  "approve-status-mismatch",
  "approve-source-validation",
  "approve-success-publishes-bundle",
  "approve-idempotent-repromote",
  "approve-rename-before-db-recovery",
  "approve-rename-succeeded-cas-lost",
  "approve-existing-destination-cas-lost",
  "approve-checksum-divergence-refused",
  "approve-duplicate-prevention",
  "approve-race-lost-after-read",
  "approve-runs-cleanup",
  "approve-cleanup-failure-visible",
  "approve-git-commit-failure-nonblocking",
  "status-command-parse",
  "status-malformed-jobid-preserved",
  "status-bare-invalid-no-fake-jobid",
  "status-known-job-summary",
  "status-unknown-job-visible",
  "status-unauthorized-known-job",
  "status-unauthorized-unknown-job",
  "status-read-only-no-mutation",
  "status-published-manifest-authority",
  "status-failed-job-error-visible",
  "status-last-notify-error-visible",
  "status-approval-summary-visible",
  "command-long-poll-timeout",
  "command-long-poll-offset",
  "command-long-poll-malformed-onerror",
  "command-long-poll-overlap-guard",
  "command-long-poll-stop-clears-future-polls",
  "bot-command-wiring",
  "boundary-static-check",
  "dependency-boundary-check",
  "bot-db-path-cwd",
  "no-preflight-codex-survivability",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = path.join(
  tmpdir(),
  `cz-bot-smoke-${new Date().toISOString().replaceAll(":", "-")}`,
);
const docPath = resolve(repoRoot, "docs", "preflight", "bot-smoke.md");
const targetBase = "3ca8a27e9789ae93ec7c22d70d898bcc0a17e3a4";
const declaredScope = new Set([
  "src/telegram/bot.ts",
  "scripts/bot-smoke.ts",
  "docs/preflight/bot-smoke.md",
]);

const rejectScopes = ["en", "zh", "bundle"] as const satisfies readonly RejectScope[];
const rejectTypes = [
  "factual_error",
  "voice_off",
  "structure",
  "length_wrong",
  "translation_off",
  "other",
] as const satisfies readonly RejectType[];

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
    case "reject-command-parse":
      return runRejectCommandParse();
    case "reject-scope-type-matrix":
      return runRejectScopeTypeMatrix();
    case "reject-success-requeues":
      return runRejectSuccessRequeues(dir);
    case "reject-zh-rewinds-translate":
      return runRejectZhRewindsTranslate(dir);
    case "reject-invalid-combo":
      return runRejectInvalidCombo(dir);
    case "reject-stale-attempt":
      return runRejectStaleAttempt(dir);
    case "reject-status-mismatch":
      return runRejectStatusMismatch(dir);
    case "reject-duplicate-prevention":
      return runRejectDuplicatePrevention(dir);
    case "reject-race-lost-after-read":
      return runRejectRaceLostAfterRead(dir);
    case "reject-unauthorized-known-job":
      return runRejectUnauthorizedKnownJob(dir);
    case "reject-unauthorized-unknown-job":
      return runRejectUnauthorizedUnknownJob(dir);
    case "reject-allowlisted-malformed-visible":
      return runRejectAllowlistedMalformedVisible(dir);
    case "approve-command-parse":
      return runApproveCommandParse();
    case "approve-malformed-jobid-preserved":
      return runApproveMalformedJobIdPreserved(dir);
    case "approve-unauthorized-known-job":
      return runApproveUnauthorizedKnownJob(dir);
    case "approve-unauthorized-unknown-job":
      return runApproveUnauthorizedUnknownJob(dir);
    case "approve-unknown-job-visible":
      return runApproveUnknownJobVisible(dir);
    case "approve-stale-attempt":
      return runApproveStaleAttempt(dir);
    case "approve-status-mismatch":
      return runApproveStatusMismatch(dir);
    case "approve-source-validation":
      return runApproveSourceValidation(dir);
    case "approve-success-publishes-bundle":
      return runApproveSuccessPublishesBundle(dir);
    case "approve-idempotent-repromote":
      return runApproveIdempotentRepromote(dir);
    case "approve-rename-before-db-recovery":
      return runApproveRenameBeforeDbRecovery(dir);
    case "approve-rename-succeeded-cas-lost":
      return runApproveRenameSucceededCasLost(dir);
    case "approve-existing-destination-cas-lost":
      return runApproveExistingDestinationCasLost(dir);
    case "approve-checksum-divergence-refused":
      return runApproveChecksumDivergenceRefused(dir);
    case "approve-duplicate-prevention":
      return runApproveDuplicatePrevention(dir);
    case "approve-race-lost-after-read":
      return runApproveRaceLostAfterRead(dir);
    case "approve-runs-cleanup":
      return runApproveRunsCleanup(dir);
    case "approve-cleanup-failure-visible":
      return runApproveCleanupFailureVisible(dir);
    case "approve-git-commit-failure-nonblocking":
      return runApproveGitCommitFailureNonblocking(dir);
    case "status-command-parse":
      return runStatusCommandParse();
    case "status-malformed-jobid-preserved":
      return runStatusMalformedJobIdPreserved(dir);
    case "status-bare-invalid-no-fake-jobid":
      return runStatusBareInvalidNoFakeJobId(dir);
    case "status-known-job-summary":
      return runStatusKnownJobSummary(dir);
    case "status-unknown-job-visible":
      return runStatusUnknownJobVisible(dir);
    case "status-unauthorized-known-job":
      return runStatusUnauthorizedKnownJob(dir);
    case "status-unauthorized-unknown-job":
      return runStatusUnauthorizedUnknownJob(dir);
    case "status-read-only-no-mutation":
      return runStatusReadOnlyNoMutation(dir);
    case "status-published-manifest-authority":
      return runStatusPublishedManifestAuthority(dir);
    case "status-failed-job-error-visible":
      return runStatusFailedJobErrorVisible(dir);
    case "status-last-notify-error-visible":
      return runStatusLastNotifyErrorVisible(dir);
    case "status-approval-summary-visible":
      return runStatusApprovalSummaryVisible(dir);
    case "command-long-poll-timeout":
      return runCommandLongPollTimeout();
    case "command-long-poll-offset":
      return runCommandLongPollOffset();
    case "command-long-poll-malformed-onerror":
      return runCommandLongPollMalformedOnError();
    case "command-long-poll-overlap-guard":
      return runCommandLongPollOverlapGuard();
    case "command-long-poll-stop-clears-future-polls":
      return runCommandLongPollStopClearsFuturePolls();
    case "bot-command-wiring":
      return runBotCommandWiring(dir);
    case "boundary-static-check":
      return runBoundaryStaticCheck();
    case "dependency-boundary-check":
      return runDependencyBoundaryCheck();
    case "bot-db-path-cwd":
      return runBotDbPathCwd(dir);
    case "no-preflight-codex-survivability":
      return runNoPreflightCodexSurvivability();
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

function runRejectCommandParse(): string[] {
  const parsed = parseRejectCommand(
    "  /reject job-1 2 zh:translation_off   fix the translation tone  ",
  );
  assert(parsed.ok, "canonical reject command did not parse");
  assert(parsed.command.jobId === "job-1", "job ID was not parsed");
  assert(parsed.command.attemptNumber === 2, "attempt number was not parsed");
  assert(parsed.command.scope === "zh", "scope was not parsed");
  assert(parsed.command.rejectType === "translation_off", "reject type was not parsed");
  assert(parsed.command.reason === "fix the translation tone", "reason was not trimmed");
  assert(
    rejectSuccessReply(parsed.command) ===
      "Rejected attempt 2. Run `bun run report:run job-1` to start attempt 3 from translate_zh.",
    "success reply literal drifted",
  );

  const invalidInputs = [
    "/reject",
    "/reject job",
    "/reject job 1",
    "/reject job x en:other",
    "/reject job 0 en:other",
    "/reject job 9007199254740992 en:other",
    "/reject job 1 :other",
    "/reject job 1 en:",
    "/reject job 1 en:unknown",
    "/reject job 1 unknown:other",
    "/reject job 1 en:other:extra",
    `/reject job 1 en:other ${"x".repeat(REJECT_REASON_MAX_CHARS + 1)}`,
  ];
  for (const input of invalidInputs) {
    assert(!parseRejectCommand(input).ok, `invalid command parsed: ${input}`);
  }
  const missingScope = parseRejectCommand("/reject parseable-job 1");
  assert(!missingScope.ok, "missing scope:type parsed");
  assert(missingScope.jobId === "parseable-job", "missing scope:type did not preserve parseable job ID");
  const missingJob = parseRejectCommand("/reject");
  assert(!missingJob.ok, "missing job parsed");
  assert(missingJob.jobId === undefined, "missing job exposed a job ID");

  return [
    "Canonical /reject parsed deterministically, trimmed reason text, and produced the exact operator guidance reply.",
    "Malformed, unsafe, unknown, extra-colon, and overlong-reason variants were rejected while preserving parseable job IDs.",
  ];
}

function runRejectScopeTypeMatrix(): string[] {
  const expectedValid = new Set([
    "en:factual_error",
    "bundle:factual_error",
    "en:voice_off",
    "zh:voice_off",
    "bundle:voice_off",
    "en:structure",
    "zh:structure",
    "bundle:structure",
    "en:length_wrong",
    "zh:length_wrong",
    "bundle:length_wrong",
    "zh:translation_off",
    "en:other",
    "zh:other",
    "bundle:other",
  ]);

  for (const scope of rejectScopes) {
    for (const rejectType of rejectTypes) {
      const key = `${scope}:${rejectType}`;
      const actual = isValidRejectScopeType(scope, rejectType);
      assert(actual === expectedValid.has(key), `scope/type matrix mismatch for ${key}`);
    }
  }

  return [
    "All 18 RejectScope x RejectType combinations matched the PLAN matrix.",
  ];
}

async function runRejectSuccessRequeues(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "reject-success", {
      attempt_number: 4,
      current_stage: "approval",
      approval_summary: "old summary",
      notified_at: 10,
      last_notify_error: "old notify error",
      error: "old error",
    });
    const replies: string[] = [];

    const result = await handleRejectCommand({
      db,
      text: "/reject reject-success 4 en:voice_off voice drift",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 1_900_000_000,
      reply: (text) => replies.push(text),
    });

    const job = requireJob(db, "reject-success");
    const rejectedEvents = findEventsByJob(db, "reject-success", "rejected");
    assert(result.status === "rejected", "reject command did not report success");
    assert(job.attempt_number === 5, "attempt was not incremented");
    assert(job.status === "queued", "job was not requeued");
    assert(job.current_stage === "draft_en", "en reject did not rewind to draft_en");
    assert(job.reject_scope === "en", "reject_scope not stored");
    assert(job.reject_type === "voice_off", "reject_type not stored");
    assert(job.reject_reason === "voice drift", "reject_reason not stored");
    assert(job.notified_at === null, "notified_at was not cleared");
    assert(job.last_notify_error === null, "last_notify_error was not cleared");
    assert(job.approval_summary === null, "approval_summary was not cleared");
    assert(job.error === null, "error was not cleared");
    assert(job.updated_at === 1_900_000_000, "updated_at did not use injected clock");
    assert(rejectedEvents.length === 1, "expected exactly one rejected event");
    assert(rejectedEvents[0]?.attempt_number === 4, "event did not preserve old attempt");
    assert(
      replies[0] ===
        "Rejected attempt 4. Run `bun run report:run reject-success` to start attempt 5 from draft_en.",
      "success reply was not exact",
    );

    return [
      "Allowed /reject updated the existing job row to queued attempt+1, rewound to draft_en, stored reject fields, and cleared stale notification/summary/error fields.",
      "Exactly one rejected event was written for the old attempt and the reply matched the PLAN literal.",
    ];
  } finally {
    close();
  }
}

async function runRejectZhRewindsTranslate(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "reject-zh");
    const replies: string[] = [];

    await handleRejectCommand({
      db,
      text: "/reject reject-zh 1 zh:translation_off wording",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 2_000_000_000,
      reply: (text) => replies.push(text),
    });

    const job = requireJob(db, "reject-zh");
    assert(job.current_stage === "translate_zh", "zh reject did not rewind to translate_zh");
    assert(
      replies[0] ===
        "Rejected attempt 1. Run `bun run report:run reject-zh` to start attempt 2 from translate_zh.",
      "zh success reply did not include translate_zh",
    );
    assert(rewindStageForScope("bundle") === "draft_en", "bundle rewind changed");

    return [
      "zh-only translation rejection rewound to translate_zh and en/bundle rewind helper remains draft_en.",
    ];
  } finally {
    close();
  }
}

async function runRejectInvalidCombo(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "reject-invalid-combo");
    const replies: string[] = [];

    const result = await handleRejectCommand({
      db,
      text: "/reject reject-invalid-combo 1 en:translation_off nope",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 3_000_000_000,
      reply: (text) => replies.push(text),
    });

    const job = requireJob(db, "reject-invalid-combo");
    assert(result.status === "error", "invalid scope/type was not an error");
    assert(result.code === "INVALID_SCOPE_TYPE_COMBO", "wrong invalid-combo error code");
    assert(replies[0]?.includes("INVALID_SCOPE_TYPE_COMBO"), "reply omitted invalid-combo code");
    assert(replies[0]?.includes("reject-invalid-combo"), "reply omitted parseable job id");
    assert(job.status === "awaiting_approval", "invalid combo mutated job");
    assert(findEventsByJob(db, "reject-invalid-combo").length === 0, "invalid combo wrote event");

    return [
      "Invalid scope/type combinations return a visible code with job ID and leave product state untouched.",
    ];
  } finally {
    close();
  }
}

async function runRejectStaleAttempt(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "reject-stale", { attempt_number: 2 });
    const replies: string[] = [];

    await handleRejectCommand({
      db,
      text: "/reject reject-stale 1 en:other old attempt",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 4_000_000_000,
      reply: (text) => replies.push(text),
    });

    assert(replies[0]?.includes("STALE_ATTEMPT"), "stale reply omitted code");
    assert(replies[0]?.includes("reject-stale"), "stale reply omitted job ID");
    assert(findEventsByJob(db, "reject-stale").length === 0, "stale attempt wrote event");
    assert(requireJob(db, "reject-stale").attempt_number === 2, "stale attempt mutated job");

    return [
      "Mismatched attempts return STALE_ATTEMPT, include the job ID, and write no events.",
    ];
  } finally {
    close();
  }
}

async function runRejectStatusMismatch(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "reject-status", { status: "queued" });
    const replies: string[] = [];

    await handleRejectCommand({
      db,
      text: "/reject reject-status 1 en:other wrong status",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 5_000_000_000,
      reply: (text) => replies.push(text),
    });

    assert(replies[0]?.includes("STATUS_MISMATCH"), "status reply omitted code");
    assert(replies[0]?.includes("reject-status"), "status reply omitted job ID");
    assert(findEventsByJob(db, "reject-status").length === 0, "status mismatch wrote event");
    assert(requireJob(db, "reject-status").status === "queued", "status mismatch mutated job");

    return [
      "Non-awaiting jobs return STATUS_MISMATCH, include the job ID, and write no events.",
    ];
  } finally {
    close();
  }
}

async function runRejectDuplicatePrevention(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "reject-duplicate");
    const firstReplies: string[] = [];
    const secondReplies: string[] = [];
    const command = "/reject reject-duplicate 1 bundle:structure restructure";

    await handleRejectCommand({
      db,
      text: command,
      chatId: 123,
      operatorChatIds: [123],
      now: () => 6_000_000_000,
      reply: (text) => firstReplies.push(text),
    });
    await handleRejectCommand({
      db,
      text: command,
      chatId: 123,
      operatorChatIds: [123],
      now: () => 6_000_000_001,
      reply: (text) => secondReplies.push(text),
    });

    assert(firstReplies[0]?.startsWith("Rejected attempt 1."), "first reject did not succeed");
    assert(
      secondReplies[0]?.includes("STALE_ATTEMPT") ||
        secondReplies[0]?.includes("STATUS_MISMATCH"),
      "duplicate command did not return stale/status error",
    );
    assert(
      findEventsByJob(db, "reject-duplicate", "rejected").length === 1,
      "duplicate command wrote duplicate rejected events",
    );
    assert(requireJob(db, "reject-duplicate").attempt_number === 2, "duplicate changed attempt twice");

    return [
      "A repeated identical reject writes one rejected event total and the second command sees the updated row.",
    ];
  } finally {
    close();
  }
}

async function runRejectRaceLostAfterRead(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "reject-race");
    const replies: string[] = [];

    await handleRejectCommand({
      db,
      text: "/reject reject-race 1 en:other raced",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 7_000_000_000,
      reply: (text) => replies.push(text),
      beforeCas: () => {
        updateJob(db, "reject-race", {
          status: "queued",
          attempt_number: 2,
          current_stage: "draft_en",
          updated_at: 7_000_000_001,
        });
      },
    });

    const job = requireJob(db, "reject-race");
    assert(
      replies[0]?.includes("STALE_ATTEMPT") ||
        replies[0]?.includes("STATUS_MISMATCH") ||
        replies[0]?.includes("REJECT_RACE_LOST"),
      "race reply omitted visible stale/status/race code",
    );
    assert(findEventsByJob(db, "reject-race", "rejected").length === 0, "race loser left rejected event");
    assert(job.status === "queued", "race loser overwrote external status");
    assert(job.attempt_number === 2, "race loser overwrote external attempt");
    assert(job.reject_scope === null, "race loser partially wrote reject_scope");

    const commandSource = readSource("src/telegram/commands.ts");
    assert(commandSource.includes("BEGIN IMMEDIATE"), "reject path lacks explicit transaction begin");
    assert(commandSource.includes("COMMIT"), "reject path lacks explicit commit");
    assert(commandSource.includes("ROLLBACK"), "reject path lacks explicit rollback");

    return [
      "An injected interleaving after initial read and before CAS produced a visible stale/status/race reply with no losing rejected event or partial mutation.",
      "Source assertion confirms the reject mutation path has an explicit BEGIN IMMEDIATE/COMMIT/ROLLBACK transaction boundary.",
    ];
  } finally {
    close();
  }
}

async function runRejectUnauthorizedKnownJob(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "reject-unauthorized");
    const replies: string[] = [];

    const result = await handleRejectCommand({
      db,
      text: "/reject reject-unauthorized 1 en:other unauthorized",
      chatId: 999,
      operatorChatIds: [123],
      now: () => 8_000_000_000,
      reply: (text) => replies.push(text),
    });

    const job = requireJob(db, "reject-unauthorized");
    const unauthorizedEvents = findEventsByJob(db, "reject-unauthorized", "unauthorized");
    assert(result.status === "unauthorized_audited", "known unauthorized command was not audited");
    assert(replies.length === 0, "unauthorized known job received reply");
    assert(job.status === "awaiting_approval", "unauthorized command mutated status");
    assert(job.attempt_number === 1, "unauthorized command mutated attempt");
    assert(findEventsByJob(db, "reject-unauthorized", "rejected").length === 0, "unauthorized command wrote reject event");
    assert(unauthorizedEvents.length === 1, "known unauthorized command did not write one audit event");
    const payload = JSON.parse(unauthorizedEvents[0]?.payload ?? "{}") as {
      command?: string;
      chat_id?: number;
    };
    assert(payload.command === "reject", "unauthorized payload omitted command class");
    assert(payload.chat_id === 999, "unauthorized payload omitted chat ID");

    return [
      "Unauthorized parseable known-job command wrote one unauthorized audit event, sent no reply, and left job state unchanged.",
    ];
  } finally {
    close();
  }
}

async function runRejectUnauthorizedUnknownJob(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    const replies: string[] = [];

    const result = await handleRejectCommand({
      db,
      text: "/reject missing-job 1 en:other unauthorized",
      chatId: 999,
      operatorChatIds: [123],
      now: () => 8_500_000_000,
      reply: (text) => replies.push(text),
    });

    assert(result.status === "unauthorized_ignored", "unknown unauthorized command was not ignored");
    assert(replies.length === 0, "unknown unauthorized command received reply");
    assert(eventCount(db) === 0, "unknown unauthorized command bypassed FK or wrote event");

    return [
      "Unauthorized unknown-job command sent no reply and wrote no fake-job audit event.",
    ];
  } finally {
    close();
  }
}

async function runRejectAllowlistedMalformedVisible(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    const replies: string[] = [];

    await handleRejectCommand({
      db,
      text: "/reject malformed 1",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 8_600_000_000,
      reply: (text) => replies.push(text),
    });
    await handleRejectCommand({
      db,
      text: "/reject",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 8_600_000_001,
      reply: (text) => replies.push(text),
    });

    assert(
      replies[0] === formatRejectErrorReply("INVALID_COMMAND", "malformed"),
      "malformed allowed command with parseable job did not include job ID",
    );
    assert(
      replies[1] === formatRejectErrorReply("INVALID_COMMAND"),
      "malformed allowed command without parseable job did not get bare INVALID_COMMAND",
    );
    assert(eventCount(db) === 0, "malformed allowed command wrote unauthorized event");

    return [
      "Allowlisted malformed command received a visible INVALID_COMMAND reply with job ID when parseable, and bare INVALID_COMMAND when no job ID was parseable.",
      "Malformed allowlisted commands wrote no unauthorized audit event.",
    ];
  } finally {
    close();
  }
}

function runApproveCommandParse(): string[] {
  const parsed = parseApproveCommand("/approve publish-job 1");
  assert(parsed.ok, "canonical approve command did not parse");
  assert(parsed.command.jobId === "publish-job", "approve job ID was not parsed");
  assert(parsed.command.attemptNumber === 1, "approve attempt was not parsed");
  assert(
    approveSuccessReply({
      status: "published",
      jobId: "publish-job",
      attemptNumber: 1,
      artifactDir: "reports/2026-W18-ai-trends",
      manifest: fakeManifest("publish-job", 1, "reports/2026-W18-ai-trends"),
    }) ===
      "Approved attempt 1. Published publish-job to reports/2026-W18-ai-trends/.",
    "approve success reply literal drifted",
  );

  const botMention = parseApproveCommand("/approve@content_zoe_bot publish-job 2");
  assert(botMention.ok, "bot-mentioned approve command did not parse");
  assert(botMention.command.attemptNumber === 2, "bot mention attempt drifted");

  const invalidInputs = [
    "/approve",
    "/approve publish-job",
    "/approve publish-job nope",
    "/approve publish-job 0",
    "/approve publish-job -1",
    "/approve publish-job 9007199254740992",
    "/approve publish-job 1 extra",
  ];
  for (const input of invalidInputs) {
    assert(!parseApproveCommand(input).ok, `invalid approve command parsed: ${input}`);
  }

  return [
    "Canonical /approve and bot-mentioned /approve parsed job ID plus positive safe-integer attempt.",
    "Missing, malformed, zero/negative, unsafe, and extra-token variants were rejected.",
  ];
}

async function runApproveMalformedJobIdPreserved(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    const missingAttempt = parseApproveCommand("/approve publish-job");
    const badAttempt = parseApproveCommand("/approve publish-job nope");
    const extra = parseApproveCommand("/approve publish-job 1 extra");
    const bare = parseApproveCommand("/approve");
    assert(!missingAttempt.ok && missingAttempt.jobId === "publish-job", "missing attempt did not preserve job ID");
    assert(!badAttempt.ok && badAttempt.jobId === "publish-job", "bad attempt did not preserve job ID");
    assert(!extra.ok && extra.jobId === "publish-job", "extra token did not preserve job ID");
    assert(!bare.ok && bare.jobId === undefined, "bare approve invented a job ID");

    const replies: string[] = [];
    await handleApproveCommand({
      db,
      text: "/approve publish-job",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 8_700_000_000,
      reply: (text) => replies.push(text),
    });
    await handleApproveCommand({
      db,
      text: "/approve",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 8_700_000_001,
      reply: (text) => replies.push(text),
    });

    assert(
      replies[0] === formatApproveErrorReply("INVALID_COMMAND", "publish-job"),
      "malformed approve with parseable job did not include job ID",
    );
    assert(
      replies[1] === formatApproveErrorReply("INVALID_COMMAND"),
      "bare approve did not receive bare INVALID_COMMAND",
    );
    assert(eventCount(db) === 0, "malformed allowlisted approve wrote an event");

    return [
      "Malformed /approve variants preserve a recoverable job ID in parser results and visible replies.",
      "Bare /approve returns INVALID_COMMAND without inventing a job ID or writing an event.",
    ];
  } finally {
    close();
  }
}

async function runApproveUnauthorizedKnownJob(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "approve-unauthorized", {
      run_dir: ".runs/approve-unauthorized",
      week_key: "2026-W40",
    });
    writeAttemptBundle(dir, "approve-unauthorized", 1);
    const replies: string[] = [];

    const result = await handleApproveCommand({
      db,
      text: "/approve approve-unauthorized 1",
      chatId: 999,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 8_800_000_000,
      reply: (text) => replies.push(text),
    });

    const job = requireJob(db, "approve-unauthorized");
    const unauthorizedEvents = findEventsByJob(db, "approve-unauthorized", "unauthorized");
    assert(result.status === "unauthorized_audited", "known unauthorized approve was not audited");
    assert(replies.length === 0, "unauthorized approve received a reply");
    assert(job.status === "awaiting_approval", "unauthorized approve mutated job");
    assert(!existsSync(resolve(dir, "reports", "2026-W40-ai-trends")), "unauthorized approve wrote reports");
    assert(existsSync(resolve(dir, ".runs", "approve-unauthorized", "attempt-1")), "unauthorized approve deleted source");
    assert(unauthorizedEvents.length === 1, "known unauthorized approve did not write one audit event");
    const payload = JSON.parse(unauthorizedEvents[0]?.payload ?? "{}") as {
      command?: string;
      chat_id?: number;
    };
    assert(payload.command === "approve", "unauthorized approve payload omitted command");
    assert(payload.chat_id === 999, "unauthorized approve payload omitted chat ID");

    return [
      "Unauthorized parseable known-job approve wrote one unauthorized event, sent no reply, and performed no filesystem or job mutation.",
    ];
  } finally {
    close();
  }
}

async function runApproveUnauthorizedUnknownJob(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    const replies: string[] = [];
    const result = await handleApproveCommand({
      db,
      text: "/approve missing-job 1",
      chatId: 999,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 8_900_000_000,
      reply: (text) => replies.push(text),
    });

    assert(result.status === "unauthorized_ignored", "unknown unauthorized approve was not ignored");
    assert(replies.length === 0, "unknown unauthorized approve received a reply");
    assert(eventCount(db) === 0, "unknown unauthorized approve bypassed FK or wrote an event");
    assert(!existsSync(resolve(dir, "reports")), "unknown unauthorized approve touched reports");

    return [
      "Unauthorized unknown-job approve sent no reply, wrote no event, and created no reports directory.",
    ];
  } finally {
    close();
  }
}

async function runApproveUnknownJobVisible(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    const replies: string[] = [];
    await handleApproveCommand({
      db,
      text: "/approve missing-job 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 9_100_000_000,
      reply: (text) => replies.push(text),
    });

    assert(replies[0] === "UNKNOWN_JOB: missing-job", "unknown-job reply was not visible with job ID");
    assert(eventCount(db) === 0, "unknown job wrote an event");
    assert(!existsSync(resolve(dir, "reports")), "unknown job touched reports");

    return [
      "Allowlisted unknown-job approve returned UNKNOWN_JOB with job ID and did not mutate DB/filesystem state.",
    ];
  } finally {
    close();
  }
}

async function runApproveStaleAttempt(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "approve-stale", {
      attempt_number: 2,
      run_dir: ".runs/approve-stale",
      week_key: "2026-W41",
    });
    writeAttemptBundle(dir, "approve-stale", 2);
    const replies: string[] = [];

    await handleApproveCommand({
      db,
      text: "/approve approve-stale 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 9_200_000_000,
      reply: (text) => replies.push(text),
    });

    assert(replies[0]?.includes("STALE_ATTEMPT"), "stale approve reply omitted code");
    assert(replies[0]?.includes("approve-stale"), "stale approve reply omitted job ID");
    assert(findEventsByJob(db, "approve-stale").length === 0, "stale approve wrote event");
    assert(!existsSync(resolve(dir, "reports", "2026-W41-ai-trends")), "stale approve published reports");
    assert(existsSync(resolve(dir, ".runs", "approve-stale", "attempt-2")), "stale approve deleted source");

    return [
      "Mismatched approve attempts return STALE_ATTEMPT, include the job ID, and leave source/files/events untouched.",
    ];
  } finally {
    close();
  }
}

async function runApproveStatusMismatch(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "approve-status", {
      status: "queued",
      run_dir: ".runs/approve-status",
      week_key: "2026-W42",
    });
    writeAttemptBundle(dir, "approve-status", 1);
    const replies: string[] = [];

    await handleApproveCommand({
      db,
      text: "/approve approve-status 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 9_300_000_000,
      reply: (text) => replies.push(text),
    });

    assert(replies[0]?.includes("STATUS_MISMATCH"), "status approve reply omitted code");
    assert(findEventsByJob(db, "approve-status").length === 0, "status mismatch wrote event");
    assert(requireJob(db, "approve-status").status === "queued", "status mismatch mutated job");
    assert(!existsSync(resolve(dir, "reports", "2026-W42-ai-trends")), "status mismatch published reports");

    return [
      "Non-awaiting approve returns STATUS_MISMATCH and leaves DB/filesystem state untouched.",
    ];
  } finally {
    close();
  }
}

async function runApproveSourceValidation(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    const cases = [
      { jobId: "missing-en", weekKey: "2026-W43", omit: "report.en.md" },
      { jobId: "missing-zh", weekKey: "2026-W44", omit: "report.zh.md" },
      { jobId: "missing-sources", weekKey: "2026-W45", omit: "sources.json" },
      { jobId: "missing-research", weekKey: "2026-W46", omit: "research" },
    ] as const;

    for (const scenario of cases) {
      seedAwaitingJob(db, scenario.jobId, {
        week_key: scenario.weekKey,
        run_dir: `.runs/${scenario.jobId}`,
      });
      writeAttemptBundle(dir, scenario.jobId, 1, { omit: scenario.omit });
      const replies: string[] = [];
      await handleApproveCommand({
        db,
        text: `/approve ${scenario.jobId} 1`,
        chatId: 123,
        operatorChatIds: [123],
        cwd: dir,
        now: () => 9_400_000_000,
        reply: (text) => replies.push(text),
      });
      assert(replies[0]?.includes("PUBLISH_SOURCE_MISSING"), `${scenario.omit} did not fail as missing source`);
      assert(findEventsByJob(db, scenario.jobId).length === 0, `${scenario.omit} wrote event`);
      assert(requireJob(db, scenario.jobId).status === "awaiting_approval", `${scenario.omit} mutated status`);
      assert(existsSync(resolve(dir, ".runs", scenario.jobId, "attempt-1")), `${scenario.omit} deleted failed source`);
      assert(!existsSync(resolve(dir, "reports", `${scenario.weekKey}-ai-trends`)), `${scenario.omit} published reports`);
    }

    return [
      "Missing English, Chinese, sources.json, and research bundle artifacts each return PUBLISH_SOURCE_MISSING.",
      "Failed source validation writes no events, preserves awaiting_approval, and keeps source attempts for forensics.",
    ];
  } finally {
    close();
  }
}

async function runApproveSuccessPublishesBundle(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "approve-success", {
      week_key: "2026-W47",
      run_dir: ".runs/approve-success",
      primary_report_path: ".runs/approve-success/attempt-1/report.en.md",
      translated_report_path: ".runs/approve-success/attempt-1/report.zh.md",
      sources_path: ".runs/approve-success/attempt-1/sources.json",
    });
    writeAttemptBundle(dir, "approve-success", 1);
    writeAttemptBundle(dir, "approve-success", 0);
    const replies: string[] = [];
    const plans: GitCommitPlan[] = [];

    const result = await handleApproveCommand({
      db,
      text: "/approve approve-success 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 9_500_000_000,
      committer: (plan) => {
        plans.push(plan);
        assertPathBoundedGitPlan(plan, "reports/2026-W47-ai-trends");
      },
      reply: (text) => replies.push(text),
    });

    const job = requireJob(db, "approve-success");
    const promotedEvents = findEventsByJob(db, "approve-success", "promoted");
    const manifest = promotedManifest(promotedEvents[0]);
    assert(result.status === "published", "approve success did not report published");
    assert(replies[0] === "Approved attempt 1. Published approve-success to reports/2026-W47-ai-trends/.", "approve success reply changed");
    assert(job.status === "published", "job was not published");
    assert(job.artifact_dir === "reports/2026-W47-ai-trends", "artifact_dir not stored");
    assert(job.primary_report_path === ".runs/approve-success/attempt-1/report.en.md", "primary report metadata was not preserved");
    assert(promotedEvents.length === 1, "expected exactly one promoted event");
    assert(manifest.artifact_dir === "reports/2026-W47-ai-trends", "manifest artifact_dir missing");
    assert(manifest.job_id === "approve-success", "manifest job ID missing");
    assert(manifest.attempt_number === 1, "manifest attempt missing");
    assertArrayEqualsString(
      manifest.files,
      ["report.en.md", "report.zh.md", "research/brief.md", "research/notes.md", "sources.json"],
      "manifest file list",
    );
    assert(manifest.sha256["report.en.md"]?.length === 64, "manifest per-file sha missing");
    assert(manifest.aggregate_sha256.length === 64, "manifest aggregate sha missing");
    assert(readFileSync(resolve(dir, "reports", "2026-W47-ai-trends", "report.en.md"), "utf8").includes("approve-success"), "final EN report content missing");
    assert(readFileSync(resolve(dir, "reports", "2026-W47-ai-trends", "report.zh.md"), "utf8").includes("Synthetic zh"), "final ZH report content missing");
    assert(JSON.parse(readFileSync(resolve(dir, "reports", "2026-W47-ai-trends", "sources.json"), "utf8")).length === 1, "final sources not parseable");
    assert(!existsSync(resolve(dir, ".runs", "approve-success", "attempt-1")), "approved attempt was not cleaned up");
    assert(existsSync(resolve(dir, ".runs", "approve-success", "attempt-0")), "other attempt was removed");
    assert(plans.length === 1, "fake committer did not receive one plan");

    return [
      "Allowed approve staged and atomically published reports, research, and sources into reports/2026-W47-ai-trends.",
      "DB row is published with preserved report metadata and exactly one promoted event carrying the authoritative publish_manifest.",
      "Only the approved attempt was cleaned up and fake git received a path-bounded plan.",
    ];
  } finally {
    close();
  }
}

async function runApproveIdempotentRepromote(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "approve-idempotent", {
      week_key: "2026-W48",
      run_dir: ".runs/approve-idempotent",
    });
    writeAttemptBundle(dir, "approve-idempotent", 1);
    const firstReplies: string[] = [];
    const secondReplies: string[] = [];

    await handleApproveCommand({
      db,
      text: "/approve approve-idempotent 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 9_600_000_000,
      reply: (text) => firstReplies.push(text),
    });
    assert(!existsSync(resolve(dir, ".runs", "approve-idempotent", "attempt-1")), "first publish did not clean source");

    const result = await handleApproveCommand({
      db,
      text: "/approve approve-idempotent 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 9_600_000_001,
      reply: (text) => secondReplies.push(text),
    });

    assert(result.status === "idempotent", "second approve after cleanup was not idempotent");
    assert(secondReplies[0] === "Approved attempt 1. Published approve-idempotent to reports/2026-W48-ai-trends/.", "idempotent reply changed");
    assert(findEventsByJob(db, "approve-idempotent", "promoted").length === 1, "idempotent re-promote wrote duplicate promoted event");

    return [
      "Repeated approve after .runs cleanup succeeded by comparing reports/ against promoted publish_manifest.",
      "The no-op re-promote wrote no duplicate promoted event.",
    ];
  } finally {
    close();
  }
}

async function runApproveRenameBeforeDbRecovery(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "approve-crash", {
      week_key: "2026-W49",
      run_dir: ".runs/approve-crash",
    });
    writeAttemptBundle(dir, "approve-crash", 1);
    let threw = false;
    try {
      await promoteJob({
        db,
        cwd: dir,
        jobId: "approve-crash",
        attemptNumber: 1,
        now: () => 9_700_000_000,
        hooks: {
          afterFinalRename() {
            throw new Error("simulated crash after rename");
          },
        },
      });
    } catch (err) {
      threw = err instanceof Error && err.message.includes("publish failed");
    }

    assert(threw, "crash injection did not throw");
    assert(existsSync(resolve(dir, "reports", "2026-W49-ai-trends")), "rename-before-DB crash did not leave final dir");
    assert(requireJob(db, "approve-crash").status === "awaiting_approval", "crash mutated DB");
    assert(findEventsByJob(db, "approve-crash", "promoted").length === 0, "crash wrote promoted event");
    assert(existsSync(resolve(dir, ".runs", "approve-crash", "attempt-1")), "crash deleted source");

    const replies: string[] = [];
    await handleApproveCommand({
      db,
      text: "/approve approve-crash 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 9_700_000_001,
      reply: (text) => replies.push(text),
    });

    assert(replies[0]?.startsWith("Approved attempt 1."), "retry did not recover crash publish");
    assert(requireJob(db, "approve-crash").status === "published", "retry did not commit DB publish");
    assert(findEventsByJob(db, "approve-crash", "promoted").length === 1, "retry did not write one promoted event");
    assert(!existsSync(resolve(dir, ".runs", "approve-crash", "attempt-1")), "retry did not clean source");

    return [
      "A simulated crash after final rename left reports/ present but DB unmodified and source preserved.",
      "Retry recovered by checksum and completed the DB publish with one promoted event.",
    ];
  } finally {
    close();
  }
}

async function runApproveRenameSucceededCasLost(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "approve-cas-lost", {
      week_key: "2026-W50",
      run_dir: ".runs/approve-cas-lost",
    });
    writeAttemptBundle(dir, "approve-cas-lost", 1);
    const replies: string[] = [];

    await handleApproveCommand({
      db,
      text: "/approve approve-cas-lost 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 9_800_000_000,
      publishHooks: {
        beforeDbCas() {
          updateJob(db, "approve-cas-lost", {
            status: "queued",
            updated_at: 9_800_000_001,
          });
        },
      },
      reply: (text) => replies.push(text),
    });

    assert(replies[0]?.includes("STATUS_MISMATCH"), "CAS-lost reply omitted status mismatch");
    assert(requireJob(db, "approve-cas-lost").status === "queued", "CAS loser overwrote current row");
    assert(findEventsByJob(db, "approve-cas-lost", "promoted").length === 0, "CAS loser wrote promoted event");
    assert(!existsSync(resolve(dir, "reports", "2026-W50-ai-trends")), "CAS loser left published-looking reports dir");
    assert(existsSync(resolve(dir, ".runs", "approve-cas-lost", "attempt-1")), "CAS loser deleted source");

    return [
      "When final rename succeeded but DB CAS lost to a status change, approve returned a visible error.",
      "The just-renamed final directory was removed, no promoted event was written, and source remained for forensics.",
    ];
  } finally {
    close();
  }
}

async function runApproveExistingDestinationCasLost(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "approve-existing-alpha", {
      week_key: "2026-W57",
      run_dir: ".runs/approve-existing-alpha",
    });
    writeAttemptBundle(dir, "approve-existing-alpha", 1);
    await leaveFinalDirectoryAfterRenameCrash(db, dir, "approve-existing-alpha", 10_400_000_000);

    updateJob(db, "approve-existing-alpha", {
      status: "queued",
      updated_at: 10_400_000_001,
    });
    const alphaReplies: string[] = [];
    await handleApproveCommand({
      db,
      text: "/approve approve-existing-alpha 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 10_400_000_002,
      reply: (text) => alphaReplies.push(text),
    });

    assert(alphaReplies[0]?.includes("STATUS_MISMATCH"), "pre-retry drift reply omitted status mismatch");
    assert(requireJob(db, "approve-existing-alpha").status === "queued", "pre-retry drift mutated current row");
    assert(findEventsByJob(db, "approve-existing-alpha", "promoted").length === 0, "pre-retry drift wrote promoted event");
    assert(!existsSync(resolve(dir, "reports", "2026-W57-ai-trends")), "pre-retry drift left orphan final dir");
    assert(existsSync(resolve(dir, ".runs", "approve-existing-alpha", "attempt-1")), "pre-retry drift deleted source");

    seedAwaitingJob(db, "approve-existing-beta", {
      week_key: "2026-W58",
      run_dir: ".runs/approve-existing-beta",
    });
    writeAttemptBundle(dir, "approve-existing-beta", 1);
    await leaveFinalDirectoryAfterRenameCrash(db, dir, "approve-existing-beta", 10_400_000_010);
    const betaReplies: string[] = [];

    await handleApproveCommand({
      db,
      text: "/approve approve-existing-beta 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 10_400_000_011,
      publishHooks: {
        beforeDbCas() {
          updateJob(db, "approve-existing-beta", {
            status: "queued",
            updated_at: 10_400_000_012,
          });
        },
      },
      reply: (text) => betaReplies.push(text),
    });

    assert(betaReplies[0]?.includes("STATUS_MISMATCH"), "retry CAS drift reply omitted status mismatch");
    assert(requireJob(db, "approve-existing-beta").status === "queued", "retry CAS drift mutated current row");
    assert(findEventsByJob(db, "approve-existing-beta", "promoted").length === 0, "retry CAS drift wrote promoted event");
    assert(!existsSync(resolve(dir, "reports", "2026-W58-ai-trends")), "retry CAS drift left orphan final dir");
    assert(existsSync(resolve(dir, ".runs", "approve-existing-beta", "attempt-1")), "retry CAS drift deleted source");

    return [
      "Pre-retry status drift after a rename crash removed the unauthoritative final reports dir, wrote no promoted event, and preserved source.",
      "Retry-time CAS drift during existing-destination recovery also removed the final reports dir and preserved source for forensics.",
    ];
  } finally {
    close();
  }
}

async function runApproveChecksumDivergenceRefused(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "approve-diverged", {
      week_key: "2026-W51",
      run_dir: ".runs/approve-diverged",
    });
    writeAttemptBundle(dir, "approve-diverged", 1);
    mkdirSync(resolve(dir, "reports", "2026-W51-ai-trends", "research"), { recursive: true });
    writeFileSync(resolve(dir, "reports", "2026-W51-ai-trends", "report.en.md"), "diverged\n");
    writeFileSync(resolve(dir, "reports", "2026-W51-ai-trends", "report.zh.md"), "diverged\n");
    writeFileSync(resolve(dir, "reports", "2026-W51-ai-trends", "sources.json"), "[]\n");
    writeFileSync(resolve(dir, "reports", "2026-W51-ai-trends", "research", "brief.md"), "diverged\n");
    const replies: string[] = [];

    await handleApproveCommand({
      db,
      text: "/approve approve-diverged 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 9_900_000_000,
      reply: (text) => replies.push(text),
    });

    assert(replies[0]?.includes("PUBLISH_ARTIFACT_DIVERGED"), "divergence reply omitted code");
    assert(requireJob(db, "approve-diverged").status === "awaiting_approval", "divergence mutated job");
    assert(findEventsByJob(db, "approve-diverged").length === 0, "divergence wrote event");
    assert(existsSync(resolve(dir, ".runs", "approve-diverged", "attempt-1")), "divergence deleted source");

    return [
      "Preexisting divergent destination checksums were refused with PUBLISH_ARTIFACT_DIVERGED and no DB/source mutation.",
    ];
  } finally {
    close();
  }
}

async function runApproveDuplicatePrevention(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "approve-duplicate", {
      week_key: "2026-W52",
      run_dir: ".runs/approve-duplicate",
    });
    writeAttemptBundle(dir, "approve-duplicate", 1);
    const firstReplies: string[] = [];
    const secondReplies: string[] = [];

    await handleApproveCommand({
      db,
      text: "/approve approve-duplicate 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 10_000_000_000,
      reply: (text) => firstReplies.push(text),
    });
    await handleApproveCommand({
      db,
      text: "/approve approve-duplicate 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 10_000_000_001,
      reply: (text) => secondReplies.push(text),
    });

    assert(firstReplies[0]?.startsWith("Approved attempt 1."), "first duplicate approve failed");
    assert(secondReplies[0]?.startsWith("Approved attempt 1."), "second duplicate approve did not no-op");
    assert(findEventsByJob(db, "approve-duplicate", "promoted").length === 1, "duplicate approve wrote duplicate promoted events");
    assert(requireJob(db, "approve-duplicate").attempt_number === 1, "duplicate approve changed attempt");

    return [
      "A repeated identical approve after publication is idempotent and leaves exactly one promoted event.",
    ];
  } finally {
    close();
  }
}

async function runApproveRaceLostAfterRead(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "approve-race", {
      week_key: "2026-W53",
      run_dir: ".runs/approve-race",
    });
    writeAttemptBundle(dir, "approve-race", 1);
    const replies: string[] = [];

    await handleApproveCommand({
      db,
      text: "/approve approve-race 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 10_100_000_000,
      publishHooks: {
        beforeDbCas() {
          updateJob(db, "approve-race", {
            attempt_number: 2,
            updated_at: 10_100_000_001,
          });
        },
      },
      reply: (text) => replies.push(text),
    });

    assert(replies[0]?.includes("STALE_ATTEMPT"), "race-lost reply omitted stale code");
    assert(findEventsByJob(db, "approve-race", "promoted").length === 0, "race loser wrote promoted event");
    assert(requireJob(db, "approve-race").attempt_number === 2, "race loser overwrote external attempt");
    assert(!existsSync(resolve(dir, "reports", "2026-W53-ai-trends")), "race loser left final reports dir");
    assert(existsSync(resolve(dir, ".runs", "approve-race", "attempt-1")), "race loser deleted source");

    return [
      "An injected interleaving before DB CAS returned STALE_ATTEMPT with no promoted event or orphan reports directory.",
    ];
  } finally {
    close();
  }
}

async function runApproveRunsCleanup(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "approve-cleanup", {
      week_key: "2026-W54",
      run_dir: ".runs/approve-cleanup",
    });
    writeAttemptBundle(dir, "approve-cleanup", 1);
    writeAttemptBundle(dir, "approve-cleanup", 2);
    const replies: string[] = [];

    await handleApproveCommand({
      db,
      text: "/approve approve-cleanup 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 10_200_000_000,
      reply: (text) => replies.push(text),
    });

    assert(!existsSync(resolve(dir, ".runs", "approve-cleanup", "attempt-1")), "approved attempt was not cleaned");
    assert(existsSync(resolve(dir, ".runs", "approve-cleanup", "attempt-2")), "other attempt was cleaned");

    seedAwaitingJob(db, "approve-cleanup-failed", {
      week_key: "2026-W55",
      run_dir: ".runs/approve-cleanup-failed",
    });
    writeAttemptBundle(dir, "approve-cleanup-failed", 1, { omit: "sources.json" });
    const failedReplies: string[] = [];
    await handleApproveCommand({
      db,
      text: "/approve approve-cleanup-failed 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 10_200_000_001,
      reply: (text) => failedReplies.push(text),
    });
    assert(failedReplies[0]?.includes("PUBLISH_SOURCE_MISSING"), "failed cleanup guard did not fail source validation");
    assert(existsSync(resolve(dir, ".runs", "approve-cleanup-failed", "attempt-1")), "failed approve deleted source");

    return [
      "Successful approve deleted only the current approved attempt directory and preserved another attempt.",
      "A failed approve preserved its source attempt for forensics.",
    ];
  } finally {
    close();
  }
}

async function runApproveCleanupFailureVisible(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "approve-cleanup-visible", {
      week_key: "2026-W59",
      run_dir: ".runs/approve-cleanup-visible",
    });
    writeAttemptBundle(dir, "approve-cleanup-visible", 1);
    const replies: string[] = [];

    const result = await handleApproveCommand({
      db,
      text: "/approve approve-cleanup-visible 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 10_250_000_000,
      publishHooks: {
        afterFinalRename(context) {
          rmSync(context.sourceAttemptDir, { recursive: true, force: true });
        },
      },
      reply: (text) => replies.push(text),
    });

    const cleanupEvents = findEventsByJob(db, "approve-cleanup-visible", "cleanup_failed");
    const cleanupPayload = JSON.parse(cleanupEvents[0]?.payload ?? "{}") as {
      artifact_dir?: string;
      publish_manifest?: { job_id?: string };
      error?: string;
    };

    assert(result.status === "published", "cleanup failure blocked publish");
    assert(result.publishResult?.cleanupFailed !== undefined, "cleanup failure was not returned");
    assert(replies[0]?.includes("Cleanup failed non-blocking"), "cleanup failure note missing from reply");
    assert(requireJob(db, "approve-cleanup-visible").status === "published", "cleanup failure prevented published row");
    assert(findEventsByJob(db, "approve-cleanup-visible", "promoted").length === 1, "cleanup failure skipped promoted event");
    assert(cleanupEvents.length === 1, "cleanup failure did not write one cleanup_failed event");
    assert(cleanupPayload.artifact_dir === "reports/2026-W59-ai-trends", "cleanup_failed event artifact_dir drifted");
    assert(cleanupPayload.publish_manifest?.job_id === "approve-cleanup-visible", "cleanup_failed event manifest missing");
    assert(typeof cleanupPayload.error === "string" && cleanupPayload.error.length > 0, "cleanup_failed event error missing");

    return [
      "Injected source cleanup failure was non-blocking: job stayed published and promoted event remained authoritative.",
      "The approve reply and cleanup_failed event both exposed cleanup diagnostics.",
    ];
  } finally {
    close();
  }
}

async function leaveFinalDirectoryAfterRenameCrash(
  db: DbClient,
  dir: string,
  jobId: string,
  now: number,
): Promise<void> {
  let threw = false;
  try {
    await promoteJob({
      db,
      cwd: dir,
      jobId,
      attemptNumber: 1,
      now: () => now,
      hooks: {
        afterFinalRename() {
          throw new Error("simulated crash after rename");
        },
      },
    });
  } catch (err) {
    threw = err instanceof Error && err.message.includes("publish failed");
  }
  assert(threw, `${jobId} crash injection did not throw`);
}

async function runApproveGitCommitFailureNonblocking(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "approve-git-fail", {
      week_key: "2026-W56",
      run_dir: ".runs/approve-git-fail",
    });
    writeAttemptBundle(dir, "approve-git-fail", 1);
    const replies: string[] = [];
    const plans: GitCommitPlan[] = [];

    const result = await handleApproveCommand({
      db,
      text: "/approve approve-git-fail 1",
      chatId: 123,
      operatorChatIds: [123],
      cwd: dir,
      now: () => 10_300_000_000,
      committer: (plan) => {
        plans.push(plan);
        assertPathBoundedGitPlan(plan, "reports/2026-W56-ai-trends");
        throw new Error("fake git failed");
      },
      reply: (text) => replies.push(text),
    });

    const gitEvents = findEventsByJob(db, "approve-git-fail", "git_commit_failed");
    assert(result.status === "published", "git failure blocked publish");
    assert(requireJob(db, "approve-git-fail").status === "published", "git failure prevented published row");
    assert(findEventsByJob(db, "approve-git-fail", "promoted").length === 1, "git failure skipped promoted event");
    assert(gitEvents.length === 1, "git failure did not write one git_commit_failed event");
    assert(replies[0]?.includes("Git post-step failed non-blocking"), "git failure note missing from reply");
    assert(plans.length === 1, "fake committer was not called once");
    assertPathBoundedGitPlan(buildGitCommitPlan("reports/2026-W56-ai-trends", "2026-W56"), "reports/2026-W56-ai-trends");

    return [
      "Fake git committer failure was non-blocking: job stayed published and promoted event remained authoritative.",
      "A git_commit_failed event captured diagnostics and fake plan assertions proved path-bounded argv semantics.",
    ];
  } finally {
    close();
  }
}

function runStatusCommandParse(): string[] {
  const parsed = parseStatusCommand("/status status-job");
  assert(parsed.ok, "canonical status command did not parse");
  assert(parsed.command.jobId === "status-job", "status job ID was not parsed");

  const botMention = parseStatusCommand("/status@content_zoe_bot status-job");
  assert(botMention.ok, "bot-mentioned status command did not parse");
  assert(botMention.command.jobId === "status-job", "bot-mentioned status job ID drifted");

  const extra = parseStatusCommand("/status status-job extra");
  const bare = parseStatusCommand("/status");
  const extraLong = parseStatusCommand("/status status-job extra more");
  assert(!extra.ok && extra.jobId === "status-job", "extra-token status did not preserve job ID");
  assert(!extraLong.ok && extraLong.jobId === "status-job", "multi-extra status did not preserve job ID");
  assert(!bare.ok && bare.jobId === undefined, "bare status invented a job ID");

  return [
    "Canonical /status and bot-mentioned /status parsed a single job ID.",
    "Extra-token malformed status preserved the parseable job ID while bare /status exposed no fake job ID.",
  ];
}

async function runStatusMalformedJobIdPreserved(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    const replies: string[] = [];

    await handleStatusCommand({
      db,
      text: "/status status-malformed extra",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 10_500_000_000,
      reply: (text) => replies.push(text),
    });

    assert(
      replies[0] === formatStatusErrorReply("INVALID_COMMAND", "status-malformed"),
      "malformed status with parseable job did not include job ID",
    );
    assert(eventCount(db) === 0, "malformed allowlisted status wrote an event");

    return [
      "Allowlisted malformed /status with a recoverable job token returned INVALID_COMMAND with that job ID.",
      "Malformed allowlisted status wrote no unauthorized audit event.",
    ];
  } finally {
    close();
  }
}

async function runStatusBareInvalidNoFakeJobId(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    const replies: string[] = [];

    await handleStatusCommand({
      db,
      text: "/status",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 10_500_000_001,
      reply: (text) => replies.push(text),
    });

    assert(
      replies[0] === formatStatusErrorReply("INVALID_COMMAND"),
      "bare status did not receive bare INVALID_COMMAND",
    );
    assert(!replies[0]?.includes(":"), "bare status invented a job ID");
    assert(eventCount(db) === 0, "bare allowlisted status wrote an event");

    return [
      "Bare /status returned INVALID_COMMAND without a colon or invented job ID.",
      "Bare allowlisted status wrote no unauthorized audit event.",
    ];
  } finally {
    close();
  }
}

async function runStatusKnownJobSummary(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "status-known", {
      week_key: "2026-W60",
      current_stage: "edit_en",
      approval_summary: "Approval summary first sentence. More context follows.",
      last_notify_error: null,
      notified_at: null,
    });
    const replies: string[] = [];

    const result = await handleStatusCommand({
      db,
      text: "/status status-known",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 10_600_000_000,
      reply: (text) => replies.push(text),
    });

    const reply = replies[0] ?? "";
    assert(result.status === "reported", "known status did not report");
    assert(reply.includes("job_id=status-known"), "summary omitted job_id");
    assert(reply.includes("status=awaiting_approval"), "summary omitted status");
    assert(reply.includes("attempt_number=1"), "summary omitted attempt");
    assert(reply.includes("current_stage=edit_en"), "summary omitted current_stage");
    assert(reply.includes("week_key=2026-W60"), "summary omitted week_key");
    assert(reply.includes("summary=Approval summary first sentence."), "summary excerpt missing");
    assert(findEventsByJob(db, "status-known").length === 0, "allowlisted status wrote event");

    return [
      "Allowlisted known-job status returned deterministic DB-backed job, status, attempt, stage, week, and summary fields.",
      "Known-job status wrote no events.",
    ];
  } finally {
    close();
  }
}

async function runStatusUnknownJobVisible(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    const replies: string[] = [];

    const result = await handleStatusCommand({
      db,
      text: "/status missing-status",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 10_700_000_000,
      reply: (text) => replies.push(text),
    });

    assert(result.status === "error", "unknown status was not an error");
    assert(replies[0] === "UNKNOWN_JOB: missing-status", "unknown status reply omitted job ID");
    assert(eventCount(db) === 0, "unknown allowlisted status wrote event");

    return [
      "Allowlisted unknown-job status returned UNKNOWN_JOB with job ID and wrote no event.",
    ];
  } finally {
    close();
  }
}

async function runStatusUnauthorizedKnownJob(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "status-unauthorized", {
      last_notify_error: "existing notify error",
    });
    const before = requireJob(db, "status-unauthorized");
    const replies: string[] = [];

    const result = await handleStatusCommand({
      db,
      text: "/status status-unauthorized",
      chatId: 999,
      operatorChatIds: [123],
      now: () => 10_800_000_000,
      reply: (text) => replies.push(text),
    });

    const after = requireJob(db, "status-unauthorized");
    const unauthorizedEvents = findEventsByJob(db, "status-unauthorized", "unauthorized");
    const payload = JSON.parse(unauthorizedEvents[0]?.payload ?? "{}") as {
      command?: string;
      chat_id?: number;
    };
    assert(result.status === "unauthorized_audited", "known unauthorized status was not audited");
    assert(replies.length === 0, "unauthorized known status received reply");
    assert(stableJobSnapshot(after) === stableJobSnapshot(before), "unauthorized status mutated job");
    assert(unauthorizedEvents.length === 1, "known unauthorized status did not write one audit event");
    assert(payload.command === "status", "unauthorized status payload omitted command");
    assert(payload.chat_id === 999, "unauthorized status payload omitted chat ID");

    return [
      "Unauthorized parseable known-job status wrote one unauthorized event, sent no reply, and left the job row unchanged.",
    ];
  } finally {
    close();
  }
}

async function runStatusUnauthorizedUnknownJob(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    const replies: string[] = [];

    const result = await handleStatusCommand({
      db,
      text: "/status missing-status",
      chatId: 999,
      operatorChatIds: [123],
      now: () => 10_900_000_000,
      reply: (text) => replies.push(text),
    });

    assert(result.status === "unauthorized_ignored", "unknown unauthorized status was not ignored");
    assert(replies.length === 0, "unknown unauthorized status received reply");
    assert(eventCount(db) === 0, "unknown unauthorized status bypassed FK or wrote an event");

    return [
      "Unauthorized unknown-job status sent no reply and wrote no fake-job audit event.",
    ];
  } finally {
    close();
  }
}

async function runStatusReadOnlyNoMutation(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "status-readonly", {
      week_key: "2026-W61",
      current_stage: "translate_zh",
      approval_summary: "summary",
      notified_at: 123,
      last_notify_error: "notify problem",
      error: "prior error text",
      artifact_dir: "reports/readonly",
      run_dir: ".runs/status-readonly",
      primary_report_path: ".runs/status-readonly/attempt-1/report.en.md",
      translated_report_path: ".runs/status-readonly/attempt-1/report.zh.md",
      sources_path: ".runs/status-readonly/attempt-1/sources.json",
    });
    const sentinel = resolve(dir, ".runs", "status-readonly", "attempt-1", "sentinel.txt");
    mkdirSync(dirname(sentinel), { recursive: true });
    writeFileSync(sentinel, "do not touch\n");
    const before = stableJobSnapshot(requireJob(db, "status-readonly"));
    const beforeEventCount = eventCount(db);
    const replies: string[] = [];

    await handleStatusCommand({
      db,
      text: "/status status-readonly",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 11_000_000_000,
      reply: (text) => replies.push(text),
    });

    assert(replies[0]?.includes("job_id=status-readonly"), "readonly status did not reply");
    assert(stableJobSnapshot(requireJob(db, "status-readonly")) === before, "allowlisted status mutated job row");
    assert(eventCount(db) === beforeEventCount, "allowlisted status inserted event");
    assert(readFileSync(sentinel, "utf8") === "do not touch\n", "allowlisted status touched filesystem sentinel");

    return [
      "Allowlisted known-job status left the full job row, event count, and filesystem sentinel unchanged.",
    ];
  } finally {
    close();
  }
}

async function runStatusPublishedManifestAuthority(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "status-published", {
      status: "published",
      week_key: "2026-W62",
      current_stage: "approval",
      artifact_dir: "reports/2026-W62-ai-trends",
    });
    insertEvent(db, {
      job_id: "status-published",
      attempt_number: 1,
      type: "promoted",
      payload: JSON.stringify({
        publish_manifest: {
          artifact_dir: "reports/2026-W62-ai-trends",
          job_id: "status-published",
          attempt_number: 1,
          files: ["report.en.md", "sources.json"],
          sha256: {
            "report.en.md": "a".repeat(64),
            "sources.json": "b".repeat(64),
          },
          aggregate_sha256: "ABCDEF1234567890".padEnd(64, "0"),
        },
      }),
      created_at: 11_100_000_000,
    });
    const commandSource = readSource("src/telegram/commands.ts");
    const replies: string[] = [];

    await handleStatusCommand({
      db,
      text: "/status status-published",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 11_100_000_001,
      reply: (text) => replies.push(text),
    });

    const reply = replies[0] ?? "";
    assert(reply.includes("artifact_dir=reports/2026-W62-ai-trends"), "published status omitted artifact_dir");
    assert(reply.includes("publish_manifest=present"), "published status omitted manifest marker");
    assert(reply.includes("files=2"), "published status omitted manifest file count");
    assert(reply.includes("aggregate_sha256=abcdef123456"), "published status omitted first-12 lowercase aggregate");
    const statusSource = statusCommandSurfaceSource();
    assert(!/\.runs\//.test(statusSource), "status command source inspects .runs");
    assert(!/promoteJob\(/.test(statusSource), "status command source calls promoteJob");

    return [
      "Published status summarized artifact_dir plus DB-event publish_manifest file count and first-12 aggregate digest.",
      "Source assertions confirm status handling does not inspect .runs or call promoteJob.",
    ];
  } finally {
    close();
  }
}

async function runStatusFailedJobErrorVisible(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "status-failed", {
      status: "failed",
      current_stage: "draft_en",
      error: "Stage failed because the generated report missed the manifest.",
    });
    const replies: string[] = [];

    await handleStatusCommand({
      db,
      text: "/status status-failed",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 11_200_000_000,
      reply: (text) => replies.push(text),
    });

    assert(replies[0]?.includes("status=failed"), "failed status omitted failed state");
    assert(replies[0]?.includes("error=Stage failed because"), "failed status omitted bounded error");

    return [
      "Failed-job status includes failed state and a bounded DB-backed error excerpt.",
    ];
  } finally {
    close();
  }
}

async function runStatusLastNotifyErrorVisible(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "status-notify-error", {
      last_notify_error: "Telegram send failed with HTTP 500 after retries.",
    });
    const replies: string[] = [];

    await handleStatusCommand({
      db,
      text: "/status status-notify-error",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 11_300_000_000,
      reply: (text) => replies.push(text),
    });

    assert(
      replies[0]?.includes("last_notify_error=Telegram send failed with HTTP 500"),
      "status omitted last_notify_error",
    );

    return [
      "Status includes a bounded last_notify_error excerpt when the DB row carries one.",
    ];
  } finally {
    close();
  }
}

async function runStatusApprovalSummaryVisible(dir: string): Promise<string[]> {
  const { db, close } = openScenarioDb(dir);
  try {
    seedAwaitingJob(db, "status-summary", {
      approval_summary: [
        "Intro line that should not win.",
        "<!-- EVIDENCE_GRADE_WARN: source coverage is thin -->",
        "Trailing detail.",
      ].join("\n"),
    });
    const replies: string[] = [];

    await handleStatusCommand({
      db,
      text: "/status status-summary",
      chatId: 123,
      operatorChatIds: [123],
      now: () => 11_400_000_000,
      reply: (text) => replies.push(text),
    });

    assert(
      replies[0]?.includes("summary=<!-- EVIDENCE_GRADE_WARN: source coverage is thin -->"),
      "status did not prefer Evidence Grade warning line",
    );

    return [
      "Awaiting-approval status prefers the first Evidence Grade warning line as the bounded summary excerpt.",
    ];
  } finally {
    close();
  }
}

async function runCommandLongPollTimeout(): Promise<string[]> {
  const requests: URL[] = [];
  const timer = new FakeTimer();
  const transport = createTelegramHttpCommandTransport({
    token: "token",
    timer,
    fetchImpl: async (input) => {
      requests.push(toUrl(input));
      return telegramResponse([]);
    },
  });

  transport.start();
  await settlePromises();
  transport.stop();

  assert(requests.length === 1, "start did not issue exactly one immediate getUpdates request");
  assert(
    requests[0]?.searchParams.get("timeout") === String(DEFAULT_COMMAND_LONG_POLL_TIMEOUT_SECONDS),
    "default getUpdates request omitted timeout=30",
  );
  assert(requests[0]?.searchParams.get("offset") === null, "initial request included offset");
  assert(
    DEFAULT_COMMAND_LONG_POLL_TIMEOUT_SECONDS === 30,
    "long-poll timeout constant drifted from 30 seconds",
  );
  assert(
    timer.delays[0] === DEFAULT_COMMAND_POLL_INTERVAL_MS,
    "local command poll interval was repurposed",
  );
  assert(
    DEFAULT_TICK_INTERVAL_MS === 10_000,
    "notifier tick interval drifted",
  );

  return [
    "Default command polling issued getUpdates with timeout=30 and no offset on the immediate request.",
    "Telegram request timeout remains distinct from the local command poll interval and notifier tick interval.",
  ];
}

async function runCommandLongPollOffset(): Promise<string[]> {
  const requests: URL[] = [];
  const timer = new FakeTimer();
  const transport = createTelegramHttpCommandTransport({
    token: "token",
    timer,
    fetchImpl: async (input) => {
      requests.push(toUrl(input));
      if (requests.length === 1) {
        return telegramResponse([
          {
            update_id: 41,
            message: { chat: { id: 123 }, text: "/noop" },
          },
        ]);
      }
      return telegramResponse([]);
    },
  });

  transport.start();
  await settlePromises();
  timer.triggerAll();
  await settlePromises();
  transport.stop();

  assert(requests.length === 2, "offset smoke did not issue second poll");
  assert(requests[0]?.searchParams.get("offset") === null, "initial request included offset");
  assert(requests[1]?.searchParams.get("offset") === "42", "second request omitted offset=N+1");
  assert(
    requests[1]?.searchParams.get("timeout") === String(DEFAULT_COMMAND_LONG_POLL_TIMEOUT_SECONDS),
    "offset request omitted long-poll timeout",
  );

  return [
    "After update_id=41, the next getUpdates request used offset=42.",
    "The long-poll timeout stayed present on the offset request.",
  ];
}

async function runCommandLongPollMalformedOnError(): Promise<string[]> {
  const errors: unknown[] = [];
  const transport = createTelegramHttpCommandTransport({
    token: "token",
    timer: new FakeTimer(),
    onError: (err) => errors.push(err),
    fetchImpl: async () =>
      new Response(JSON.stringify({ ok: false, result: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });

  transport.start();
  await settlePromises();
  transport.stop();

  assert(errors.length === 1, "malformed response did not call onError exactly once");
  assert(errors[0] instanceof Error, "malformed response error was not an Error");
  assert(
    String((errors[0] as Error).message).includes("malformed payload"),
    "malformed response error message drifted",
  );

  return [
    "Malformed Telegram getUpdates payload surfaced through the injected onError seam.",
  ];
}

async function runCommandLongPollOverlapGuard(): Promise<string[]> {
  const requests: URL[] = [];
  const errors: unknown[] = [];
  const timer = new FakeTimer();
  const firstResponse = deferred<Response>();
  const transport = createTelegramHttpCommandTransport({
    token: "token",
    timer,
    onError: (err) => errors.push(err),
    fetchImpl: async (input) => {
      requests.push(toUrl(input));
      if (requests.length === 1) {
        return firstResponse.promise;
      }
      return telegramResponse([]);
    },
  });

  transport.start();
  await settlePromises();
  timer.triggerAll();
  await settlePromises();
  assert(requests.length === 1, "overlap guard allowed concurrent getUpdates fetch");

  firstResponse.resolve(telegramResponse([]));
  await settlePromises();
  timer.triggerAll();
  await settlePromises();
  transport.stop();

  assert(requests.length === 2, "poll did not resume after pending long poll settled");
  assert(errors.length === 0, "overlap guard produced unexpected errors");

  return [
    "A scheduled callback during an in-flight long poll did not issue a second getUpdates request.",
    "After the pending long poll settled, a later scheduled callback issued the next request normally.",
  ];
}

async function runCommandLongPollStopClearsFuturePolls(): Promise<string[]> {
  const requests: URL[] = [];
  const timer = new FakeTimer();
  const transport = createTelegramHttpCommandTransport({
    token: "token",
    timer,
    fetchImpl: async (input) => {
      requests.push(toUrl(input));
      return telegramResponse([]);
    },
  });

  const neverStarted = createTelegramHttpCommandTransport({
    token: "token",
    timer: new FakeTimer(),
    fetchImpl: async () => telegramResponse([]),
  });
  neverStarted.stop();

  transport.start();
  await settlePromises();
  transport.stop();
  timer.triggerAll();
  await settlePromises();
  transport.stop();

  assert(requests.length === 1, "stop did not prevent future scheduled polls");
  assert(timer.clears === 1, "stop did not clear one interval exactly once");
  assert(timer.callbacks.size === 0, "cleared interval callback remained registered");

  return [
    "stop() cleared the local command poll interval and prevented later fake-timer triggers from polling.",
    "Calling stop() before start or after an already-stopped transport remained safe.",
  ];
}

async function runBotCommandWiring(dir: string): Promise<string[]> {
  const dbPath = resolve(dir, "content.db");
  const db = openDb(dbPath);
  seedAwaitingJob(db, "approve-wire", {
    week_key: "2026-W57",
    run_dir: ".runs/approve-wire",
  });
  seedAwaitingJob(db, "reject-wire");
  seedAwaitingJob(db, "status-wire", {
    current_stage: "edit_en",
    week_key: "2026-W63",
  });
  db.close();
  writeAttemptBundle(dir, "approve-wire", 1);

  const commandTransport = new FakeCommandTransport();
  const timer = new FakeTimer();
  const outgoingSends: { chatId: number; text: string }[] = [];
  let notifierCalls = 0;

  const runtime = startBotRuntime({
    config: {
      token: "token",
      operatorChatIds: [123],
      dbPath,
      tickIntervalMs: DEFAULT_TICK_INTERVAL_MS,
      cwd: dir,
    },
    commandTransport,
    timer,
    transport: {
      sendMessage(chatId, text) {
        outgoingSends.push({ chatId, text });
      },
    },
    notifyPendingApprovals: async () => {
      notifierCalls += 1;
      return notifierResult({});
    },
    now: () => 9_000_000_000,
  });

  const approveReplies = await commandTransport.dispatch(
    "approve",
    "/approve approve-wire 1",
    123,
  );
  const replies = await commandTransport.dispatch(
    "reject",
    "/reject reject-wire 1 bundle:other operator decision",
    123,
  );
  const statusReplies = await commandTransport.dispatch(
    "status",
    "/status status-wire",
    123,
  );
  runtime.stop();

  const checkDb = openDb(dbPath);
  try {
    const approvedJob = requireJob(checkDb, "approve-wire");
    const job = requireJob(checkDb, "reject-wire");
    assert(commandTransport.started, "command transport did not start");
    assert(commandTransport.stopped, "command transport did not stop");
    assert(timer.intervals === 1, "notifier tick timer was not registered once");
    assert(timer.clears === 1, "notifier tick timer was not cleared once");
    assert(notifierCalls === 0, "command dispatch called notifyPendingApprovals");
    assert(outgoingSends.length === 0, "command reply used outgoing notifier transport");
    assert(commandTransport.handlers.has("approve"), "approve command handler was not registered");
    assert(commandTransport.handlers.has("reject"), "reject command handler was not registered");
    assert(commandTransport.handlers.has("status"), "status command handler was not registered");
    assert(approveReplies.length === 1, "approve handler did not reply through command seam");
    assert(approveReplies[0]?.startsWith("Approved attempt 1."), "approve seam reply did not succeed");
    assert(replies.length === 1, "command handler did not reply through command seam");
    assert(replies[0]?.startsWith("Rejected attempt 1."), "command seam reply did not succeed");
    assert(statusReplies.length === 1, "status handler did not reply through command seam");
    assert(statusReplies[0]?.includes("job_id=status-wire"), "status seam reply did not summarize job");
    assert(approvedJob.status === "published", "wired approve did not mutate configured DB");
    assert(findEventsByJob(checkDb, "approve-wire", "promoted").length === 1, "wired approve did not write promoted event");
    assert(job.status === "queued", "wired command did not mutate configured DB");
    assert(job.attempt_number === 2, "wired command did not increment attempt");
    assert(findEventsByJob(checkDb, "reject-wire", "rejected").length === 1, "wired command did not write reject event");
    assert(findEventsByJob(checkDb, "status-wire").length === 0, "wired status wrote an event");

    return [
      "startBotRuntime registered /approve, /reject, and /status on a fake command transport, opened the configured DB path per command, replied through the command seam, and left notifier tick orchestration separate.",
      "/status summarized a configured DB job without writing events or calling notifyPendingApprovals.",
    ];
  } finally {
    checkDb.close();
  }
}

function runBoundaryStaticCheck(): string[] {
  const changed = changedFilesAgainstBase();
  assertChangedFilesWithinScope(changed, declaredScope);
  assertNoChangedFiles(changed, [
    "package.json",
    "bun.lock",
    "bun.lockb",
    "src/telegram/commands.ts",
    "src/telegram/notifier.ts",
    "src/telegram/allowlist.ts",
    "src/bin/report-run.ts",
    "src/lib/report-loop.ts",
    "src/lib/report-run-fake-provider.ts",
    "src/lib/runtime-config.ts",
    "src/promote.ts",
    "src/db.ts",
    "src/preflight.ts",
    "scripts/lib/static-guardrails.ts",
  ]);
  assertNoChangedDirectories(changed, [
    "src/pipeline/",
    "src/migrations/",
    "src/llm/",
    "src/prompts/",
  ]);

  const changedSources = changed
    .filter((file) =>
      file === "src/telegram/bot.ts"
    )
    .map((file) => [file, readChangedSource(file)] as const);
  const forbiddenRuntimePatterns: readonly ForbiddenPattern[] = [
    ...PROMPT_SURFACE_PATTERNS,
    [/from\s+["'][^"']*preflight\.ts["']|assertCodexAvailable|codex-smoke/, "preflight/Codex dependency"],
    [/src\/bin\/report-run|report-run\.ts|\breport:run\b/, "operator report execution surface"],
    ...PROCESS_SPAWN_PATTERNS,
  ];
  for (const [file, source] of changedSources) {
    assertNoForbiddenPatterns(source, forbiddenRuntimePatterns, file);
  }

  const commandsSource = readSource("src/telegram/commands.ts");
  assert(!/notifyPendingApprovals|from\s+["']\.\/notifier\.ts["']/.test(commandsSource), "commands.ts duplicated notifier orchestration");
  const botSource = readSource("src/telegram/bot.ts");
  assert(!/AbortController|AbortSignal|\bsignal\s*:/.test(botSource), "bot.ts added abort plumbing outside Slice 4.11 scope");
  const statusSource = statusCommandSurfaceSource();
  assert(!/promoteJob\(/.test(statusSource), "status command surface calls promoteJob");
  assert(!/\.runs\//.test(statusSource), "status command surface inspects .runs");

  const smokeSource = readSource("scripts/bot-smoke.ts");
  assert(!/fetch\s*\(|api\.telegram\.org|https:\/\/api\.telegram\.org/.test(smokeSource), "smoke can call Telegram");

  return [
    `Stable base/status scope check saw only declared files: ${changed.join(", ") || "<none>"}.`,
    "Changed runtime sources contain no prompt/LLM/preflight/Codex dependency, report-run execution surface, or broad process spawn surface.",
    "commands.ts and product support surfaces stayed out of scope; bot.ts contains no abort plumbing.",
    "Smoke source contains no Telegram fetch/API network path, commands.ts does not duplicate notifier orchestration, and status handling does not call promoteJob or inspect .runs.",
  ];
}

function runDependencyBoundaryCheck(): string[] {
  const botSource = readSource("src/telegram/bot.ts");
  const commandsSource = readSource("src/telegram/commands.ts");
  const promoteSource = readSource("src/promote.ts");
  const notifierSource = readSource("src/telegram/notifier.ts");
  const packageJson = JSON.parse(readSource("package.json")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assertNoForbiddenPatterns(notifierSource, TELEGRAM_SDK_IMPORT_PATTERNS, "notifier.ts");
  assertNoForbiddenPatterns(commandsSource, TELEGRAM_SDK_IMPORT_PATTERNS, "commands.ts");
  assertNoForbiddenPatterns(commandsSource, TELEGRAM_SDK_NETWORK_PATTERNS, "commands.ts Telegram network surface");
  assertNoForbiddenPatterns(promoteSource, TELEGRAM_SDK_NETWORK_PATTERNS, "promote.ts Telegram network surface");
  assert(!/promoteJob\(/.test(statusCommandSurfaceSource()), "status command surface calls promoteJob");
  const declaredTelegramDeps = ["grammy", "telegraf"].filter(
    (name) => packageJson.dependencies?.[name] || packageJson.devDependencies?.[name],
  );
  const botTelegramImports = TELEGRAM_SDK_IMPORT_PATTERNS.flatMap(([pattern]) => [
    ...botSource.matchAll(new RegExp(pattern, "g")),
  ]);
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
    "Telegram SDK/network concept-class checks are shared and absent from notifier.ts, commands.ts, and promote.ts.",
    "commands.ts does not add Telegram network or new publish/process surfaces for /status, and package.json exposes only the expected bot runtime and bot-smoke command surfaces.",
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
  const commandsSource = readChangedSource("src/telegram/commands.ts");
  const combined = `${botSource}\n${allowlistSource}\n${commandsSource}`;
  const forbiddenPatterns: readonly ForbiddenPattern[] = [
    [/preflight\.ts|assertCodexAvailable/, "preflight dependency"],
    [/codex-smoke/, "codex smoke dependency"],
    ...PROMPT_SURFACE_PATTERNS,
    [/src\/bin\/report-run|report-run\.ts|\breport:run\b/, "operator report execution surface"],
    ...PROCESS_SPAWN_PATTERNS,
  ];

  assertNoForbiddenPatterns(combined, forbiddenPatterns, "bot command surfaces");

  return [
    "Changed bot, allowlist, and command surfaces have no preflight, Codex smoke, LLM, prompt, process-spawn, or report-run execution dependency.",
  ];
}

function openScenarioDb(dir: string): { db: DbClient; close: () => void } {
  const db = openDb(resolve(dir, "content.db"));
  return {
    db,
    close() {
      db.close();
    },
  };
}

function seedAwaitingJob(
  db: DbClient,
  id: string,
  patch: Partial<Job> = {},
): Job {
  return insertJob(db, {
    id,
    week_key: patch.week_key ?? "2026-W18",
    topic: patch.topic ?? "Topic",
    locales: patch.locales ?? "en,zh",
    attempt_number: patch.attempt_number ?? 1,
    status: patch.status ?? "awaiting_approval",
    current_stage: patch.current_stage ?? "approval",
    run_dir: patch.run_dir ?? null,
    artifact_dir: patch.artifact_dir ?? null,
    primary_report_path: patch.primary_report_path ?? null,
    translated_report_path: patch.translated_report_path ?? null,
    sources_path: patch.sources_path ?? null,
    approval_summary: patch.approval_summary ?? "approval summary",
    as_of: patch.as_of ?? null,
    reject_scope: patch.reject_scope ?? null,
    reject_type: patch.reject_type ?? null,
    reject_reason: patch.reject_reason ?? null,
    notified_at: patch.notified_at ?? 100,
    last_notify_error: patch.last_notify_error ?? null,
    error: patch.error ?? null,
    created_at: patch.created_at ?? 1_800_000_000,
    updated_at: patch.updated_at ?? 1_800_000_000,
  });
}

function writeAttemptBundle(
  cwd: string,
  jobId: string,
  attemptNumber: number,
  options: { omit?: "report.en.md" | "report.zh.md" | "sources.json" | "research" } = {},
): void {
  const attemptDir = resolve(cwd, ".runs", jobId, `attempt-${attemptNumber}`);
  mkdirSync(attemptDir, { recursive: true });
  if (options.omit !== "report.en.md") {
    writeFileSync(
      resolve(attemptDir, "report.en.md"),
      `# Report EN\n\nSynthetic en report for ${jobId} attempt ${attemptNumber}.\n`,
    );
  }
  if (options.omit !== "report.zh.md") {
    writeFileSync(
      resolve(attemptDir, "report.zh.md"),
      `# Report ZH\n\nSynthetic zh report for ${jobId} attempt ${attemptNumber}.\n`,
    );
  }
  if (options.omit !== "sources.json") {
    writeFileSync(
      resolve(attemptDir, "sources.json"),
      `${JSON.stringify([{ title: "Local source", jobId, attemptNumber }])}\n`,
    );
  }
  if (options.omit !== "research") {
    mkdirSync(resolve(attemptDir, "research"), { recursive: true });
    writeFileSync(resolve(attemptDir, "research", "brief.md"), `Brief for ${jobId}\n`);
    writeFileSync(resolve(attemptDir, "research", "notes.md"), `Notes for ${jobId}\n`);
  }
}

function promotedManifest(event: ReturnType<typeof findEventsByJob>[number] | undefined) {
  assert(event !== undefined, "missing promoted event");
  const payload = JSON.parse(event.payload ?? "{}") as {
    publish_manifest?: {
      artifact_dir: string;
      job_id: string;
      attempt_number: number;
      files: string[];
      sha256: Record<string, string>;
      aggregate_sha256: string;
    };
  };
  assert(payload.publish_manifest !== undefined, "promoted event missing publish_manifest");
  return payload.publish_manifest;
}

function fakeManifest(jobId: string, attemptNumber: number, artifactDir: string) {
  return {
    artifact_dir: artifactDir,
    job_id: jobId,
    attempt_number: attemptNumber,
    files: ["report.en.md"],
    sha256: {
      "report.en.md": "0".repeat(64),
    },
    aggregate_sha256: "1".repeat(64),
  };
}

function assertPathBoundedGitPlan(plan: GitCommitPlan, artifactDir: string): void {
  assert(plan.artifactDir === artifactDir, "git plan artifactDir drifted");
  assert(plan.commands.length === 2, "git plan command count drifted");
  assertArrayEqualsString(plan.commands[0] ?? [], ["git", "add", "--", `${artifactDir}/`], "git add argv");
  assertArrayEqualsString(
    plan.commands[1] ?? [],
    ["git", "commit", "-m", `[content-zoe] publish ${artifactDir.slice("reports/".length, -"ai-trends".length - 1)}`, "--", `${artifactDir}/`],
    "git commit argv",
  );
}

function requireJob(db: DbClient, id: string): Job {
  const job = findJobById(db, id);
  assert(job !== null, `missing job: ${id}`);
  return job;
}

function stableJobSnapshot(job: Job): string {
  return JSON.stringify(job);
}

function eventCount(db: DbClient): number {
  return db
    .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM events")
    .get()!.count;
}

function changedFilesAgainstBase(): string[] {
  return getChangedFilesAgainstBase(repoRoot, targetBase);
}

function readSource(relativePath: string): string {
  return readRepoSource(repoRoot, relativePath);
}

function readChangedSource(relativePath: string): string {
  const source = readSource(relativePath);
  return relativePath === "src/telegram/commands.ts"
    ? stripAllowedReportRunGuidance(source)
    : source;
}

function statusCommandSurfaceSource(): string {
  const source = readSource("src/telegram/commands.ts");
  return [
    sourceSlice(
      source,
      "export async function handleStatusCommand",
      "export function isValidRejectScopeType",
    ),
    sourceSlice(
      source,
      "export function formatStatusReply",
      "export function approveSuccessReply",
    ),
    sourceSlice(
      source,
      "function publishedManifestStatusLine",
      "function approvalSummaryExcerpt",
    ),
  ].join("\n");
}

function sourceSlice(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert(start >= 0, `missing source anchor: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert(end > start, `missing source end anchor: ${endNeedle}`);
  return source.slice(start, end);
}

function stripAllowedReportRunGuidance(source: string): string {
  return source.replace(
    /Run \\`bun run report:run \$\{command\.jobId\}\\`/g,
    "Run <operator guidance>",
  );
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
    "This smoke exercises deterministic allowlist parsing, injected bot runtime seams, Telegram command handlers, static source boundaries, shared static guardrails, and fake Telegram transports only. It does not call Telegram, launch browser checks, or run operator-only Codex-backed report execution.",
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

class FakeCommandTransport implements TelegramCommandTransport {
  readonly handlers = new Map<TelegramCommandName, TelegramCommandHandler>();
  started = false;
  stopped = false;

  onCommand(command: TelegramCommandName, handler: TelegramCommandHandler): void {
    this.handlers.set(command, handler);
  }

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.stopped = true;
  }

  async dispatch(
    command: TelegramCommandName,
    text: string,
    chatId: number,
  ): Promise<string[]> {
    const handler = this.handlers.get(command);
    assert(handler !== undefined, `missing command handler: ${command}`);
    const replies: string[] = [];
    await handler({
      chatId,
      text,
      reply(replyText) {
        replies.push(replyText);
      },
    });
    return replies;
  }
}

class FakeTimer {
  intervals = 0;
  clears = 0;
  delays: number[] = [];
  callbacks = new Map<unknown, () => void>();

  setInterval(callback: () => void, delayMs: number): unknown {
    this.intervals += 1;
    const handle = this.intervals;
    this.delays.push(delayMs);
    this.callbacks.set(handle, callback);
    return handle;
  }

  clearInterval(handle: unknown): void {
    this.clears += 1;
    this.callbacks.delete(handle);
  }

  triggerAll(): void {
    for (const callback of [...this.callbacks.values()]) {
      callback();
    }
  }
}

function telegramResponse(result: readonly unknown[]): Response {
  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function toUrl(input: Parameters<typeof fetch>[0]): URL {
  return input instanceof URL ? input : new URL(String(input));
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (err: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function settlePromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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

function assertArrayEqualsString(
  actual: readonly string[],
  expected: readonly string[],
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
