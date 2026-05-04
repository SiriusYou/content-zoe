import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertNoForbiddenPatterns,
  PROCESS_SPAWN_PATTERNS,
  PROMPT_SURFACE_PATTERNS,
  readRepoSource,
  TELEGRAM_SDK_IMPORT_PATTERNS,
  type ForbiddenPattern,
} from "./lib/static-guardrails.ts";
import {
  findEventsByJob,
  findJobById,
  insertJob,
  openDb,
  updateJob,
  type DbClient,
  type Job,
} from "../src/db.ts";
import {
  formatApprovalNotification,
  NOTIFIER_RETRY_DELAYS_MS,
  NOTIFY_LIMIT_DEFAULT,
  notifyPendingApprovals,
  type ApprovalNotification,
  type ApprovalNotificationSender,
} from "../src/telegram/notifier.ts";

type ScenarioName =
  | "eligible-row-success"
  | "ineligible-rows-skipped"
  | "retry-then-success"
  | "reject-during-backoff-abandons"
  | "final-failure-records-error"
  | "missing-summary-no-send"
  | "limit-bounds-batch"
  | "message-contract-static-check"
  | "boundary-static-check"
  | "constant-export-static-check";

interface ScenarioOutcome {
  name: ScenarioName;
  status: "PASS" | "FAIL";
  details: string[];
  startedAtIso: string;
  finishedAtIso: string;
}

const SCENARIOS: ScenarioName[] = [
  "eligible-row-success",
  "ineligible-rows-skipped",
  "retry-then-success",
  "reject-during-backoff-abandons",
  "final-failure-records-error",
  "missing-summary-no-send",
  "limit-bounds-batch",
  "message-contract-static-check",
  "boundary-static-check",
  "constant-export-static-check",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = path.join(
  tmpdir(),
  `cz-notifier-smoke-${new Date().toISOString().replaceAll(":", "-")}`,
);
const docPath = resolve(repoRoot, "docs", "preflight", "notifier-smoke.md");

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
    case "eligible-row-success":
      return runEligibleRowSuccess(dir);
    case "ineligible-rows-skipped":
      return runIneligibleRowsSkipped(dir);
    case "retry-then-success":
      return runRetryThenSuccess(dir);
    case "reject-during-backoff-abandons":
      return runRejectDuringBackoffAbandons(dir);
    case "final-failure-records-error":
      return runFinalFailureRecordsError(dir);
    case "missing-summary-no-send":
      return runMissingSummaryNoSend(dir);
    case "limit-bounds-batch":
      return runLimitBoundsBatch(dir);
    case "message-contract-static-check":
      return runMessageContractStaticCheck();
    case "boundary-static-check":
      return runBoundaryStaticCheck();
    case "constant-export-static-check":
      return runConstantExportStaticCheck(dir);
  }
}

async function runEligibleRowSuccess(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    const clock = createClock();
    seedJob(db, "notify-success", {
      attemptNumber: 2,
      status: "awaiting_approval",
      approvalSummary: "Approval Summary\n\nStored summary body.",
      lastNotifyError: "previous failure",
    });

    const calls: ApprovalNotification[] = [];
    const result = await notifyPendingApprovals({
      db,
      now: clock.now,
      sleep: async () => undefined,
      sender: (notification) => {
        calls.push(notification);
      },
    });

    const job = requireJob(db, "notify-success");
    const events = findEventsByJob(db, "notify-success", "notified");
    assert(result.sent === 1, `expected one sent row, got ${result.sent}`);
    assert(calls.length === 1, `expected one sender call, got ${calls.length}`);
    assert(job.notified_at !== null, "notified_at was not set");
    assert(job.last_notify_error === null, "last_notify_error was not cleared");
    assert(events.length === 1, `expected one notified event, got ${events.length}`);
    assert(events[0]?.attempt_number === 2, "notified event used wrong attempt");

    return [
      "Awaiting-approval row with stored summary sent once.",
      "CAS success set notified_at, cleared last_notify_error, and inserted one notified event.",
    ];
  } finally {
    db.close();
  }
}

async function runIneligibleRowsSkipped(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    const clock = createClock();
    seedJob(db, "queued-row", { status: "queued", approvalSummary: "queued" });
    seedJob(db, "failed-row", { status: "failed", approvalSummary: "failed" });
    seedJob(db, "published-row", { status: "published", approvalSummary: "published" });
    seedJob(db, "already-notified-row", {
      status: "awaiting_approval",
      approvalSummary: "already notified",
      notifiedAt: 1_700_000_100,
    });

    let calls = 0;
    const result = await notifyPendingApprovals({
      db,
      now: clock.now,
      sleep: async () => undefined,
      sender: () => {
        calls += 1;
      },
    });

    assert(result.selected === 0, `expected zero selected rows, got ${result.selected}`);
    assert(calls === 0, `expected zero sender calls, got ${calls}`);
    assert(countEvents(db) === 0, "ineligible rows wrote events");
    assert(
      requireJob(db, "already-notified-row").notified_at === 1_700_000_100,
      "already-notified row was mutated",
    );

    return [
      "queued, failed, published, and already-notified rows were not selected.",
      "No eligible row case produced zero sends, zero events, and no notify-field mutation.",
    ];
  } finally {
    db.close();
  }
}

async function runRetryThenSuccess(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    const clock = createClock();
    const sleeps: number[] = [];
    seedJob(db, "retry-success", {
      status: "awaiting_approval",
      approvalSummary: "Retry summary",
    });

    let calls = 0;
    const result = await notifyPendingApprovals({
      db,
      now: clock.now,
      sleep: async (delayMs) => {
        sleeps.push(delayMs);
      },
      sender: () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("temporary notifier outage");
        }
      },
    });

    assert(result.sent === 1, `expected one sent row, got ${result.sent}`);
    assert(calls === 2, `expected exactly 2 sender calls, got ${calls}`);
    assertArrayEquals(sleeps, [1000], "sleep sequence");
    assert(
      findEventsByJob(db, "retry-success", "notified").length === 1,
      "expected one notified event",
    );

    return [
      "First send failed, second send succeeded.",
      "Sender calls were exactly 2, sleep sequence was [1000], and one notified event was written.",
    ];
  } finally {
    db.close();
  }
}

async function runRejectDuringBackoffAbandons(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    const clock = createClock();
    const sleeps: number[] = [];
    seedJob(db, "reject-backoff", {
      attemptNumber: 4,
      status: "awaiting_approval",
      approvalSummary: "Summary before rejection",
    });

    let calls = 0;
    const result = await notifyPendingApprovals({
      db,
      now: clock.now,
      sleep: async (delayMs) => {
        sleeps.push(delayMs);
        updateJob(db, "reject-backoff", {
          status: "rejected",
          reject_reason: "operator rejected during backoff",
          updated_at: clock.now(),
        });
      },
      sender: () => {
        calls += 1;
        throw new Error("initial send failed");
      },
    });

    const job = requireJob(db, "reject-backoff");
    assert(result.abandoned === 1, `expected one abandoned row, got ${result.abandoned}`);
    assert(calls === 1, `expected no stale retry send, got ${calls} calls`);
    assertArrayEquals(sleeps, [1000], "sleep sequence");
    assert(countEvents(db) === 0, "stale retry path wrote events");
    assert(job.notified_at === null, "stale retry path changed notified_at");
    assert(job.last_notify_error === null, "stale retry path changed last_notify_error");

    return [
      "The row was changed out of awaiting_approval during backoff.",
      "Notifier re-read before retry, abandoned silently, sent no stale retry, wrote no events, and left notify fields unchanged.",
    ];
  } finally {
    db.close();
  }
}

async function runFinalFailureRecordsError(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    const clock = createClock();
    const sleeps: number[] = [];
    seedJob(db, "final-failure", {
      status: "awaiting_approval",
      approvalSummary: "Final failure summary",
    });

    let calls = 0;
    const result = await notifyPendingApprovals({
      db,
      now: clock.now,
      sleep: async (delayMs) => {
        sleeps.push(delayMs);
      },
      sender: () => {
        calls += 1;
        throw new Error("permanent notifier failure");
      },
    });

    const job = requireJob(db, "final-failure");
    const events = findEventsByJob(db, "final-failure", "notify_failed");
    assert(result.failed === 1, `expected one failed row, got ${result.failed}`);
    assert(calls === 4, `expected exactly 4 sender calls, got ${calls}`);
    assertArrayEquals(sleeps, [1000, 5000, 30000], "sleep sequence");
    assert(
      job.last_notify_error?.includes("permanent notifier failure"),
      "last_notify_error did not persist readable sender error",
    );
    assert(events.length === 1, `expected one notify_failed event, got ${events.length}`);

    return [
      "Sender failed the initial call plus all three retries.",
      "Sender calls were exactly 4, sleep sequence was [1000,5000,30000], last_notify_error persisted, and one notify_failed event was written.",
    ];
  } finally {
    db.close();
  }
}

async function runMissingSummaryNoSend(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    const clock = createClock();
    seedJob(db, "missing-summary-null", {
      status: "awaiting_approval",
      approvalSummary: null,
    });
    seedJob(db, "missing-summary-empty", {
      status: "awaiting_approval",
      approvalSummary: "   ",
    });

    let calls = 0;
    const result = await notifyPendingApprovals({
      db,
      now: clock.now,
      sleep: async () => undefined,
      sender: () => {
        calls += 1;
      },
    });

    const nullJob = requireJob(db, "missing-summary-null");
    const emptyJob = requireJob(db, "missing-summary-empty");
    assert(calls === 0, `expected zero sends for missing summaries, got ${calls}`);
    assert(result.malformed === 2, `expected two malformed rows, got ${result.malformed}`);
    assert(
      nullJob.last_notify_error?.includes("approval_summary"),
      "null summary did not persist readable last_notify_error",
    );
    assert(
      emptyJob.last_notify_error?.includes("approval_summary"),
      "empty summary did not persist readable last_notify_error",
    );
    assert(
      findEventsByJob(db, "missing-summary-null", "notify_failed").length === 1,
      "null summary did not write notify_failed",
    );
    assert(
      findEventsByJob(db, "missing-summary-empty", "notify_failed").length === 1,
      "empty summary did not write notify_failed",
    );

    return [
      "Null and whitespace-only approval summaries were treated as malformed eligible rows.",
      "No sender call was made; each row persisted last_notify_error and one notify_failed event.",
    ];
  } finally {
    db.close();
  }
}

async function runLimitBoundsBatch(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    const clock = createClock();
    for (let index = 0; index < 5; index += 1) {
      seedJob(db, `limit-row-${index}`, {
        status: "awaiting_approval",
        approvalSummary: `Summary ${index}`,
      });
    }

    let calls = 0;
    const result = await notifyPendingApprovals({
      db,
      now: clock.now,
      sleep: async () => undefined,
      limit: 2,
      sender: () => {
        calls += 1;
      },
    });

    assert(result.selected === 2, `expected two selected rows, got ${result.selected}`);
    assert(calls === 2, `expected two sender calls, got ${calls}`);
    assert(countEvents(db, "notified") === 2, "expected two notified events");

    return [
      "Five eligible rows with explicit limit=2 selected and attempted only two notifications.",
      `Default limit remains ${NOTIFY_LIMIT_DEFAULT}; explicit smaller limit bounded the batch.`,
    ];
  } finally {
    db.close();
  }
}

function runMessageContractStaticCheck(): string[] {
  const summary = "Stored approval summary body.\n- Uses persisted summary only.";
  const text = formatApprovalNotification({
    jobId: "message-contract",
    attemptNumber: 6,
    approvalSummary: summary,
  });

  assert(text.includes("message-contract"), "message omitted job id");
  assert(text.includes("6"), "message omitted attempt number");
  assert(text.includes(summary), "message omitted stored approval summary");
  assert(text.includes("/approve message-contract 6"), "message omitted approve hint");
  assert(text.includes("/reject message-contract 6"), "message omitted reject hint");

  return [
    "formatApprovalNotification includes job id, attempt number, stored summary body, /approve, and /reject.",
  ];
}

function runBoundaryStaticCheck(): string[] {
  const notifierSource = readRepoSource(repoRoot, "src/telegram/notifier.ts");
  const packageJson = JSON.parse(
    readRepoSource(repoRoot, "package.json"),
  ) as { scripts?: Record<string, string> };

  const forbiddenPatterns: readonly ForbiddenPattern[] = [
    [/process\.env/, "env read"],
    [/process\.argv/, "argv read"],
    ...PROCESS_SPAWN_PATTERNS,
    ...TELEGRAM_SDK_IMPORT_PATTERNS,
    [/api\.telegram\.org/, "direct Telegram API literal"],
    [/report\.(?:en|zh)\.md|sources\.json|readFileSync\([^)]*report|readFileSync\([^)]*source/i, "report/source file read"],
    ...PROMPT_SURFACE_PATTERNS,
    [/\bLLMProvider\b|composePrompt|PROMPT_DELIMITER/, "LLM prompt-producing surface"],
  ];

  assertNoForbiddenPatterns(notifierSource, forbiddenPatterns, "notifier.ts");
  assert(
    packageJson.scripts?.["notifier-smoke"] === "bun scripts/notifier-smoke.ts",
    "package.json notifier-smoke script missing or unexpected",
  );

  return [
    "Inspected src/telegram/notifier.ts directly for env/argv/spawn/Telegram/LLM/prompt/report-read guardrails.",
    "Confirmed package.json adds only the deterministic notifier-smoke command surface expected by this slice.",
  ];
}

async function runConstantExportStaticCheck(dir: string): Promise<string[]> {
  assertArrayEquals(
    Array.from(NOTIFIER_RETRY_DELAYS_MS),
    [1000, 5000, 30000],
    "NOTIFIER_RETRY_DELAYS_MS",
  );
  assert(NOTIFY_LIMIT_DEFAULT === 10, `expected default limit 10, got ${NOTIFY_LIMIT_DEFAULT}`);

  const db = openScenarioDb(dir);
  try {
    const clock = createClock();
    for (let index = 0; index < NOTIFY_LIMIT_DEFAULT + 2; index += 1) {
      seedJob(db, `default-limit-row-${index}`, {
        status: "awaiting_approval",
        approvalSummary: `Default limit summary ${index}`,
      });
    }

    let calls = 0;
    const result = await notifyPendingApprovals({
      db,
      now: clock.now,
      sleep: async () => undefined,
      sender: () => {
        calls += 1;
      },
    });

    assert(
      result.selected === NOTIFY_LIMIT_DEFAULT,
      `expected default-selected ${NOTIFY_LIMIT_DEFAULT}, got ${result.selected}`,
    );
    assert(calls === NOTIFY_LIMIT_DEFAULT, `expected default sender calls ${NOTIFY_LIMIT_DEFAULT}, got ${calls}`);

    return [
      "Imported NOTIFIER_RETRY_DELAYS_MS as exactly [1000,5000,30000].",
      `Imported NOTIFY_LIMIT_DEFAULT=${NOTIFY_LIMIT_DEFAULT} and observed default batch selection bounded to 10 of 12 eligible rows.`,
    ];
  } finally {
    db.close();
  }
}

function openScenarioDb(dir: string): DbClient {
  return openDb(resolve(dir, "content.db"));
}

interface SeedJobOptions {
  attemptNumber?: number;
  status: string;
  approvalSummary?: string | null;
  notifiedAt?: number | null;
  lastNotifyError?: string | null;
}

function seedJob(db: DbClient, id: string, options: SeedJobOptions): Job {
  const numericSuffix = id
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);
  const now = 1_700_000_000 + numericSuffix;

  return insertJob(db, {
    id,
    week_key: `2026-W${String(numericSuffix).padStart(4, "0")}`,
    topic: `Topic for ${id}`,
    attempt_number: options.attemptNumber ?? 1,
    status: options.status,
    current_stage: "translate_zh",
    approval_summary: options.approvalSummary,
    notified_at: options.notifiedAt ?? null,
    last_notify_error: options.lastNotifyError ?? null,
    created_at: now - 100,
    updated_at: now,
  });
}

function createClock(start = 1_800_000_000): { now: () => number } {
  let value = start;
  return {
    now: () => {
      value += 1;
      return value;
    },
  };
}

function requireJob(db: DbClient, id: string): Job {
  const job = findJobById(db, id);
  assert(job !== null, `missing job ${id}`);
  return job;
}

function countEvents(db: DbClient, type?: string): number {
  if (type === undefined) {
    return db.query<{ value: number }, []>("SELECT COUNT(*) AS value FROM events").get()
      ?.value ?? 0;
  }
  return db
    .query<{ value: number }, [string]>(
      "SELECT COUNT(*) AS value FROM events WHERE type = ?",
    )
    .get(type)?.value ?? 0;
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

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  const passed = outcomes.filter((outcome) => outcome.status === "PASS").length;
  const lines = [
    "# Notifier Smoke Evidence",
    "",
    `- Command: \`bun run notifier-smoke\``,
    `- Started: ${outcomes[0]?.startedAtIso ?? new Date().toISOString()}`,
    `- Finished: ${outcomes.at(-1)?.finishedAtIso ?? new Date().toISOString()}`,
    `- Scenario root: ${smokeRoot} (removed by finally-cleanup)`,
    `- Result: ${passed}/${SCENARIOS.length} PASS`,
    `- Default notification limit: ${NOTIFY_LIMIT_DEFAULT}`,
    "",
    "## Evidence Ceiling",
    "",
    "This smoke exercises only the local deterministic notifier module with injected fake senders, clocks, and sleeps. It does not instantiate a Telegram client, call Telegram, run real Codex report execution, or verify browser behavior.",
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
