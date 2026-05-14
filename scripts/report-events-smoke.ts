import { createHash } from "node:crypto";
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

import { Database } from "bun:sqlite";

import { runReportEventsCli } from "../src/bin/report-events.ts";
import {
  assertNoForbiddenPatterns,
  changedFilesAgainstBase,
  PROCESS_SPAWN_PATTERNS,
  PROMPT_SURFACE_PATTERNS,
  TELEGRAM_SDK_NETWORK_PATTERNS,
  readRepoSource,
} from "./lib/static-guardrails.ts";

type ScenarioName =
  | "report-events-missing-db"
  | "report-events-invalid-command"
  | "report-events-unknown-job"
  | "report-events-known-job-empty-timeline"
  | "report-events-single-event"
  | "report-events-multi-event-ordering"
  | "report-events-attempt-filter"
  | "report-events-type-filter"
  | "report-events-limit-most-recent"
  | "report-events-payload-safety"
  | "report-events-byte-exact-output"
  | "report-events-read-only-no-mutation"
  | "report-events-db-field-safety"
  | "report-events-boundary-static-check";

interface ScenarioOutcome {
  readonly name: ScenarioName;
  readonly status: "PASS" | "FAIL";
  readonly details: readonly string[];
  readonly startedAtIso: string;
  readonly finishedAtIso: string;
}

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface EventFixture {
  readonly id?: number;
  readonly job_id: string;
  readonly attempt_number?: number;
  readonly type?: string;
  readonly payload?: string | null;
  readonly created_at?: number | string;
}

const SCENARIOS: readonly ScenarioName[] = [
  "report-events-missing-db",
  "report-events-invalid-command",
  "report-events-unknown-job",
  "report-events-known-job-empty-timeline",
  "report-events-single-event",
  "report-events-multi-event-ordering",
  "report-events-attempt-filter",
  "report-events-type-filter",
  "report-events-limit-most-recent",
  "report-events-payload-safety",
  "report-events-byte-exact-output",
  "report-events-read-only-no-mutation",
  "report-events-db-field-safety",
  "report-events-boundary-static-check",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = path.join(
  tmpdir(),
  `cz-report-events-smoke-${new Date().toISOString().replaceAll(":", "-")}`,
);
const docPath = resolve(repoRoot, "docs", "preflight", "report-events-smoke.md");
const implementationAnchor = "cc5e09549dd4908af12082e9e9d9e35aaa55f7bc";
const allowedWriteSet = new Set([
  "src/bin/report-events.ts",
  "scripts/report-events-smoke.ts",
  "docs/preflight/report-events-smoke.md",
  "package.json",
]);
const fixedNow = 1_778_600_000;

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

  return outcomes.every((outcome) => outcome.status === "PASS") ? 0 : 1;
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
      details: [formatThrown(err)],
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
    case "report-events-missing-db":
      return runMissingDb(dir);
    case "report-events-invalid-command":
      return runInvalidCommand(dir);
    case "report-events-unknown-job":
      return runUnknownJob(dir);
    case "report-events-known-job-empty-timeline":
      return runKnownJobEmptyTimeline(dir);
    case "report-events-single-event":
      return runSingleEvent(dir);
    case "report-events-multi-event-ordering":
      return runMultiEventOrdering(dir);
    case "report-events-attempt-filter":
      return runAttemptFilter(dir);
    case "report-events-type-filter":
      return runTypeFilter(dir);
    case "report-events-limit-most-recent":
      return runLimitMostRecent(dir);
    case "report-events-payload-safety":
      return runPayloadSafety(dir);
    case "report-events-byte-exact-output":
      return runByteExactOutput(dir);
    case "report-events-read-only-no-mutation":
      return runReadOnlyNoMutation(dir);
    case "report-events-db-field-safety":
      return runDbFieldSafety(dir);
    case "report-events-boundary-static-check":
      return runBoundaryStaticCheck();
  }
}

async function runMissingDb(dir: string): Promise<string[]> {
  const before = filesystemSnapshot(dir);
  const result = await runCli(dir, ["missing-job"]);
  const after = filesystemSnapshot(dir);

  assert(result.exitCode === 0, `missing DB exit drifted: ${result.exitCode}`);
  assert(result.stdout === "NO_DATABASE\n", `missing DB stdout drifted: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr === "", `missing DB wrote stderr: ${result.stderr}`);
  assert(before === after, "missing DB path mutated the filesystem");
  assert(!existsSync(resolve(dir, ".data")), "missing DB run created .data");

  return [
    "Missing .data/content.db exits 0 with exact NO_DATABASE stdout.",
    "Missing DB path creates no .data, content.db, .runs, reports, README, WAL, or temp fixture file.",
  ];
}

async function runInvalidCommand(dir: string): Promise<string[]> {
  const invalidArgv: readonly (readonly string[])[] = [
    [],
    ["job-1", "job-2"],
    ["--type=promoted", "job-1"],
    ["job-1", "--attempt", "1", "--attempt", "2"],
    ["job-1", "--type", "promoted", "--type", "failed"],
    ["job-1", "--limit", "1", "--limit", "2"],
    ["job-1", "--unknown"],
    [""],
    ["   "],
    ["bad\tid"],
    ["bad\nid"],
    ["reports/job-1"],
    ["-job-1"],
    ["job-1", "--attempt", "0"],
    ["job-1", "--attempt", "01"],
    ["job-1", "--attempt", "+1"],
    ["job-1", "--attempt", "1.2"],
    ["job-1", "--attempt", "1e2"],
    ["job-1", "--attempt", "9007199254740992"],
    ["job-1", "--type", ""],
    ["job-1", "--type", "1bad"],
    ["job-1", "--type", "bad*"],
    ["job-1", "--type", "a".repeat(65)],
    ["job-1", "--limit", "0"],
    ["job-1", "--limit", "001"],
    ["job-1", "--limit", "201"],
    ["job-1", "--limit", "1.5"],
  ];

  for (const args of invalidArgv) {
    const before = filesystemSnapshot(dir);
    const result = await runCli(dir, args);
    const after = filesystemSnapshot(dir);
    assert(result.exitCode === 1, `${JSON.stringify(args)} exit drifted: ${result.exitCode}`);
    assert(result.stdout === "", `${JSON.stringify(args)} wrote stdout: ${JSON.stringify(result.stdout)}`);
    assertSingleError(result.stderr, "INVALID_COMMAND");
    assert(before === after, `${JSON.stringify(args)} mutated filesystem`);
  }

  return [
    "Invalid arity, equals-form flags, duplicates, unknown flags, blank/control/path-shaped job IDs, invalid attempts, invalid type tokens, and invalid limits fail as INVALID_COMMAND.",
    "Invalid command parsing happens before DB open and leaves the filesystem unchanged.",
  ];
}

async function runUnknownJob(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    seedJob(db, "known-job", { week_key: "2028-W01" });
    const beforeDb = stableDbSnapshot(db);
    const beforeFs = filesystemSnapshot(dir);
    const result = await runCli(dir, ["unknown-job"]);
    const afterDb = stableDbSnapshot(db);
    const afterFs = filesystemSnapshot(dir);

    assert(result.exitCode === 1, `unknown job exit drifted: ${result.exitCode}`);
    assert(result.stdout === "", `unknown job wrote stdout: ${JSON.stringify(result.stdout)}`);
    assert(result.stderr === "UNKNOWN_JOB: unknown-job\n", `unknown job stderr drifted: ${result.stderr}`);
    assert(beforeDb === afterDb, "unknown job path mutated jobs/events");
    assert(beforeFs === afterFs, "unknown job path mutated filesystem");
  } finally {
    db.close();
  }

  return [
    "Existing DB with no matching jobs.id exits 1 with exact UNKNOWN_JOB stderr.",
    "Unknown job failure leaves jobs, events, and filesystem snapshots byte-identical.",
  ];
}

async function runKnownJobEmptyTimeline(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    seedJob(db, "empty-job", { week_key: "2028-W02" });
  } finally {
    db.close();
  }

  const result = await runCli(dir, ["empty-job"]);
  const expected = "EVENTS\tjob_id=empty-job\tcount=0\tattempt=all\ttype=all\tlimit=all\n";
  assert(result.exitCode === 0, `empty timeline exit drifted: ${result.stderr}`);
  assert(result.stdout === expected, `empty timeline stdout drifted: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr === "", `empty timeline wrote stderr: ${result.stderr}`);
  assert(!result.stdout.includes("\nEVENT\t"), "empty timeline emitted EVENT rows");
  assertExactlyOneTrailingNewline(result.stdout);

  return [
    "Known job with zero matching events emits only the byte-exact EVENTS count=0 summary line.",
    "No EVENT rows are printed for an empty audit timeline.",
  ];
}

async function runSingleEvent(dir: string): Promise<string[]> {
  const payload = "{\"stage\":\"draft\",\"ok\":true,\"attempt\":1}";
  const db = openScenarioDb(dir);
  try {
    seedJob(db, "single-job", { week_key: "2028-W03" });
    insertEvent(db, {
      job_id: "single-job",
      attempt_number: 1,
      type: "stage_completed",
      payload,
      created_at: fixedNow,
    });
  } finally {
    db.close();
  }

  const result = await runCli(dir, ["single-job"]);
  const expected = [
    "EVENTS\tjob_id=single-job\tcount=1\tattempt=all\ttype=all\tlimit=all",
    [
      "EVENT",
      "event_id=1",
      "attempt_number=1",
      "type=stage_completed",
      `created_at=${iso(fixedNow)}`,
      `payload_sha256=${sha12(payload)}`,
      "payload_summary=attempt=1,ok=true,stage=draft",
    ].join("\t"),
  ].join("\n") + "\n";
  assert(result.exitCode === 0, `single event failed: ${result.stderr}`);
  assert(result.stdout === expected, `single event stdout drifted: ${JSON.stringify(result.stdout)}`);
  assert(result.stderr === "", `single event wrote stderr: ${result.stderr}`);
  assertExactlyOneTrailingNewline(result.stdout);

  return [
    "Single event prints deterministic field order, ISO timestamp, 12-hex payload hash, and sorted payload summary.",
    "Payload hash is computed over the raw stored JSON string without canonicalization.",
  ];
}

async function runMultiEventOrdering(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    seedJob(db, "ordering-job", { week_key: "2028-W04" });
    insertEvent(db, { id: 30, job_id: "ordering-job", type: "alpha", created_at: fixedNow + 30 });
    insertEvent(db, { id: 10, job_id: "ordering-job", type: "zeta", created_at: fixedNow + 10 });
    insertEvent(db, { id: 20, job_id: "ordering-job", type: "middle", created_at: fixedNow + 20 });
  } finally {
    db.close();
  }

  const result = await runCli(dir, ["ordering-job"]);
  assert(result.exitCode === 0, `ordering run failed: ${result.stderr}`);
  assert(eventIds(result.stdout).join(",") === "10,20,30", `events did not print id ASC: ${result.stdout}`);
  assert(
    eventTypes(result.stdout).join(",") === "zeta,middle,alpha",
    `ordering followed type order instead of id order: ${result.stdout}`,
  );

  return [
    "Events inserted with out-of-order explicit IDs print in events.id ASC order.",
    "Semantic type order is not used as an implicit ordering fallback.",
  ];
}

async function runAttemptFilter(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    seedJob(db, "attempt-job", { week_key: "2028-W05" });
    insertEvent(db, { job_id: "attempt-job", attempt_number: 1, type: "started", created_at: fixedNow + 1 });
    insertEvent(db, { job_id: "attempt-job", attempt_number: 2, type: "started", created_at: fixedNow + 2 });
    insertEvent(db, { job_id: "attempt-job", attempt_number: 2, type: "completed", created_at: fixedNow + 3 });
  } finally {
    db.close();
  }

  const all = await runCli(dir, ["attempt-job"]);
  const filtered = await runCli(dir, ["attempt-job", "--attempt", "2"]);
  assert(all.exitCode === 0, `default attempt run failed: ${all.stderr}`);
  assert(filtered.exitCode === 0, `attempt filter failed: ${filtered.stderr}`);
  assert(all.stdout.startsWith("EVENTS\tjob_id=attempt-job\tcount=3\tattempt=all"), "default did not include all attempts");
  assert(filtered.stdout.startsWith("EVENTS\tjob_id=attempt-job\tcount=2\tattempt=2"), "attempt summary drifted");
  assert(!filtered.stdout.includes("attempt_number=1"), `attempt filter leaked attempt 1: ${filtered.stdout}`);
  assert(eventIds(filtered.stdout).join(",") === "2,3", "attempt filter did not preserve id ASC");

  return [
    "Default selection includes all attempts.",
    "--attempt N exact-matches only that attempt and preserves id ASC output.",
  ];
}

async function runTypeFilter(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    seedJob(db, "type-job", { week_key: "2028-W06" });
    insertEvent(db, { job_id: "type-job", type: "promoted", created_at: fixedNow + 1 });
    insertEvent(db, { job_id: "type-job", type: "promoted_extra", created_at: fixedNow + 2 });
    insertEvent(db, { job_id: "type-job", type: "promoted:ok", created_at: fixedNow + 3 });
  } finally {
    db.close();
  }

  const promoted = await runCli(dir, ["--type", "promoted", "type-job"]);
  const colon = await runCli(dir, ["type-job", "--type", "promoted:ok"]);
  assert(promoted.exitCode === 0, `type filter failed: ${promoted.stderr}`);
  assert(colon.exitCode === 0, `colon type filter failed: ${colon.stderr}`);
  assert(promoted.stdout.startsWith("EVENTS\tjob_id=type-job\tcount=1\tattempt=all\ttype=promoted"), "type summary drifted");
  assert(eventTypes(promoted.stdout).join(",") === "promoted", `type exact match drifted: ${promoted.stdout}`);
  assert(!promoted.stdout.includes("promoted_extra"), "type filter matched suffix token");
  assert(colon.stdout.includes("type=promoted:ok"), "type token with colon did not exact-match");

  return [
    "--type exact-matches one event type while accepting the approved token grammar.",
    "Comma/glob/suffix behavior is absent; promoted does not match promoted_extra.",
  ];
}

async function runLimitMostRecent(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    seedJob(db, "limit-job", { week_key: "2028-W07" });
    for (let index = 1; index <= 5; index += 1) {
      insertEvent(db, {
        job_id: "limit-job",
        attempt_number: index % 2 === 0 ? 2 : 1,
        type: `event-${index}`,
        created_at: fixedNow + index,
      });
    }
  } finally {
    db.close();
  }

  const result = await runCli(dir, ["limit-job", "--limit", "2"]);
  assert(result.exitCode === 0, `limit failed: ${result.stderr}`);
  assert(result.stdout.startsWith("EVENTS\tjob_id=limit-job\tcount=2\tattempt=all\ttype=all\tlimit=2"), "limit summary drifted");
  assert(eventIds(result.stdout).join(",") === "4,5", `limit did not select latest two then print ASC: ${result.stdout}`);

  return [
    "--limit N selects the most recent matching N rows by id DESC.",
    "Selected limit rows print back in chronological events.id ASC order.",
  ];
}

async function runPayloadSafety(dir: string): Promise<string[]> {
  const unsafeString = `hello\tline\npipe|[label](url)\u001b[31m    spaced ${"x".repeat(120)}`;
  const manyKeysPayload = JSON.stringify({
    z: 1,
    a: "first",
    m: false,
    b: null,
    c: { nested: true },
    d: [1, 2],
    e: "seventh",
  });
  const db = openScenarioDb(dir);
  try {
    seedJob(db, "payload-job", { week_key: "2028-W08" });
    insertEvent(db, { job_id: "payload-job", type: "malformed", payload: "{not-json", created_at: fixedNow + 1 });
    insertEvent(db, {
      job_id: "payload-job",
      type: "unsafe-object",
      payload: JSON.stringify({ message: unsafeString, nested: { ok: true }, list: [1] }),
      created_at: fixedNow + 2,
    });
    insertEvent(db, { job_id: "payload-job", type: "top-array", payload: "[1,2,3]", created_at: fixedNow + 3 });
    insertEvent(db, { job_id: "payload-job", type: "top-scalar", payload: "\"scalar\"", created_at: fixedNow + 4 });
    insertEvent(db, { job_id: "payload-job", type: "many-keys", payload: manyKeysPayload, created_at: fixedNow + 5 });
  } finally {
    db.close();
  }

  const result = await runCli(dir, ["payload-job"]);
  assert(result.exitCode === 0, `payload safety failed: ${result.stderr}`);
  assert(result.stderr === "", `payload safety wrote stderr: ${result.stderr}`);
  assert(result.stdout.includes("type=malformed") && result.stdout.includes("payload_summary=<invalid-json>"), "malformed JSON did not succeed as <invalid-json>");
  assert(result.stdout.includes("payload_summary=<array>"), "top-level array summary missing");
  assert(result.stdout.includes("payload_summary=<json-scalar>"), "top-level scalar summary missing");
  assert(result.stdout.includes("list=<array>,message=hello line pipe label url 31m spaced"), "unsafe object summary not normalized as expected");
  assert(result.stdout.includes("nested=<object>"), "nested object marker missing");
  assert(result.stdout.includes("payload_summary=a=first,b=null,c=<object>,d=<array>,e=seventh,m=false"), "key sorting or six-key cap drifted");

  for (const line of outputLines(result.stdout).filter((entry) => entry.startsWith("EVENT\t"))) {
    const summary = fieldValue(line, "payload_summary");
    assert(summary.length <= 200, `payload summary exceeded 200 chars: ${summary.length}`);
    assert(!/[\t\r\n\u001b|[\]()`]/.test(summary), `payload summary is not field-safe: ${summary}`);
  }

  return [
    "Malformed JSON, nested objects, arrays, top-level scalar JSON, long strings, tabs, newlines, pipes, brackets, and terminal-control-like text all render safely.",
    "Payload summaries are bounded to 200 chars, field-safe, and malformed JSON remains a successful <invalid-json> row.",
  ];
}

async function runByteExactOutput(dir: string): Promise<string[]> {
  const alphaPayload = "{\"a\":\"one\"}";
  const betaPayload = "{\"b\":2}";
  const db = openScenarioDb(dir);
  try {
    seedJob(db, "byte-job", { week_key: "2028-W09" });
    insertEvent(db, { job_id: "byte-job", attempt_number: 1, type: "alpha", payload: alphaPayload, created_at: fixedNow + 1 });
    insertEvent(db, { job_id: "byte-job", attempt_number: 2, type: "beta", payload: null, created_at: fixedNow + 2 });
    insertEvent(db, { job_id: "byte-job", attempt_number: 2, type: "beta", payload: betaPayload, created_at: fixedNow + 3 });
  } finally {
    db.close();
  }

  const expectedAll = [
    "EVENTS\tjob_id=byte-job\tcount=3\tattempt=all\ttype=all\tlimit=all",
    expectedEventLine(1, 1, "alpha", fixedNow + 1, sha12(alphaPayload), "a=one"),
    expectedEventLine(2, 2, "beta", fixedNow + 2, "-", "-"),
    expectedEventLine(3, 2, "beta", fixedNow + 3, sha12(betaPayload), "b=2"),
  ].join("\n") + "\n";
  const expectedAttempt = [
    "EVENTS\tjob_id=byte-job\tcount=2\tattempt=2\ttype=all\tlimit=all",
    expectedEventLine(2, 2, "beta", fixedNow + 2, "-", "-"),
    expectedEventLine(3, 2, "beta", fixedNow + 3, sha12(betaPayload), "b=2"),
  ].join("\n") + "\n";
  const expectedType = [
    "EVENTS\tjob_id=byte-job\tcount=2\tattempt=all\ttype=beta\tlimit=all",
    expectedEventLine(2, 2, "beta", fixedNow + 2, "-", "-"),
    expectedEventLine(3, 2, "beta", fixedNow + 3, sha12(betaPayload), "b=2"),
  ].join("\n") + "\n";
  const expectedLimit = [
    "EVENTS\tjob_id=byte-job\tcount=2\tattempt=all\ttype=all\tlimit=2",
    expectedEventLine(2, 2, "beta", fixedNow + 2, "-", "-"),
    expectedEventLine(3, 2, "beta", fixedNow + 3, sha12(betaPayload), "b=2"),
  ].join("\n") + "\n";

  const all = await runCli(dir, ["byte-job"]);
  const attempt = await runCli(dir, ["byte-job", "--attempt", "2"]);
  const type = await runCli(dir, ["byte-job", "--type", "beta"]);
  const limit = await runCli(dir, ["byte-job", "--limit", "2"]);

  assert(all.stdout === expectedAll, `default byte-exact stdout drifted: ${JSON.stringify(all.stdout)}`);
  assert(attempt.stdout === expectedAttempt, `attempt byte-exact stdout drifted: ${JSON.stringify(attempt.stdout)}`);
  assert(type.stdout === expectedType, `type byte-exact stdout drifted: ${JSON.stringify(type.stdout)}`);
  assert(limit.stdout === expectedLimit, `limit byte-exact stdout drifted: ${JSON.stringify(limit.stdout)}`);
  for (const result of [all, attempt, type, limit]) {
    assert(result.exitCode === 0, `byte-exact variant failed: ${result.stderr}`);
    assert(result.stderr === "", `byte-exact variant wrote stderr: ${result.stderr}`);
    assertExactlyOneTrailingNewline(result.stdout);
    assert(outputLines(result.stdout)[0]?.startsWith("EVENTS\t"), "summary marker missing");
    assert(outputLines(result.stdout).slice(1).every((line) => line.startsWith("EVENT\t")), "event marker missing");
  }

  return [
    "Representative multi-event output exactly matches marker grammar, tab separators, field order, and one trailing newline.",
    "Byte-exact assertions cover attempt=all vs attempt=2, type=all vs type=beta, and limit=all vs limit=2 summary variants.",
  ];
}

async function runReadOnlyNoMutation(dir: string): Promise<string[]> {
  const malformedPayload = "{bad-json";
  const db = openScenarioDb(dir);
  try {
    seedJob(db, "mutation-job", { week_key: "2028-W10" });
    insertEvent(db, { job_id: "mutation-job", attempt_number: 1, type: "alpha", payload: "{\"ok\":true}", created_at: fixedNow + 1 });
    insertEvent(db, { job_id: "mutation-job", attempt_number: 2, type: "beta", payload: malformedPayload, created_at: fixedNow + 2 });

    for (const args of [
      ["mutation-job"],
      ["mutation-job", "--attempt", "2"],
      ["mutation-job", "--type", "beta"],
      ["unknown-mutation-job"],
      [],
    ] as const) {
      const beforeDb = stableDbSnapshot(db);
      const beforeFs = filesystemSnapshot(dir);
      const result = await runCli(dir, args);
      const afterDb = stableDbSnapshot(db);
      const afterFs = filesystemSnapshot(dir);
      assert(beforeDb === afterDb, `${JSON.stringify(args)} mutated DB rows`);
      assert(beforeFs === afterFs, `${JSON.stringify(args)} mutated filesystem`);
      if (args.length === 0) {
        assertSingleError(result.stderr, "INVALID_COMMAND");
      } else if (args[0] === "unknown-mutation-job") {
        assert(result.stderr === "UNKNOWN_JOB: unknown-mutation-job\n", "unknown failure drifted");
      } else {
        assert(result.exitCode === 0, `${JSON.stringify(args)} failed: ${result.stderr}`);
      }
    }
  } finally {
    db.close();
  }

  return [
    "Success, filtered success, malformed-payload success, unknown-job failure, and invalid-command failure leave jobs/events byte-identical.",
    "The same paths leave .runs, reports, README, WAL side files, and temp fixture paths unchanged.",
  ];
}

async function runDbFieldSafety(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    seedJob(db, "safe-types", { week_key: "2028-W11" });
    insertEvent(db, {
      job_id: "safe-types",
      type: "bad\t\n\u001btype",
      payload: "{\"ok\":true}",
      created_at: fixedNow + 1,
    });
    insertEvent(db, {
      job_id: "safe-types",
      type: "x".repeat(100),
      payload: "{\"ok\":true}",
      created_at: fixedNow + 2,
    });

    seedJob(db, "invalid-id", { week_key: "2028-W12" });
    insertEvent(db, { id: 0, job_id: "invalid-id", type: "bad-id", created_at: fixedNow + 3 });

    seedJob(db, "invalid-attempt", { week_key: "2028-W13" });
    insertEvent(db, { job_id: "invalid-attempt", attempt_number: 0, type: "bad-attempt", created_at: fixedNow + 4 });

    seedJob(db, "invalid-created-at", { week_key: "2028-W14" });
    insertEvent(db, { job_id: "invalid-created-at", type: "bad-time", created_at: "not-a-number" });

    seedJob(db, "non-finite-created-at", { week_key: "2028-W15" });
    db.query(
      "INSERT INTO events (job_id, attempt_number, type, payload, created_at) VALUES (?, ?, ?, ?, 1e999)",
    ).run("non-finite-created-at", 1, "bad-time", null);

    seedJob(db, "empty-type", { week_key: "2028-W16" });
    insertEvent(db, { job_id: "empty-type", type: "\t\n\u001b", created_at: fixedNow + 5 });

    seedJob(db, "malformed-payload-ok", { week_key: "2028-W17" });
    insertEvent(db, { job_id: "malformed-payload-ok", type: "malformed", payload: "{not-json", created_at: fixedNow + 6 });
  } finally {
    db.close();
  }

  const safeTypes = await runCli(dir, ["safe-types"]);
  assert(safeTypes.exitCode === 0, `safe type normalization failed: ${safeTypes.stderr}`);
  assert(safeTypes.stdout.includes("type=bad type"), `control-character type not collapsed: ${safeTypes.stdout}`);
  const longType = eventTypes(safeTypes.stdout).find((type) => type.startsWith("x"));
  assert(longType !== undefined && longType.length === 80, `overlong type was not capped at 80: ${longType?.length}`);

  for (const [jobId, label] of [
    ["invalid-id", "event id"],
    ["invalid-attempt", "attempt_number"],
    ["invalid-created-at", "created_at"],
    ["non-finite-created-at", "created_at"],
    ["empty-type", "event type"],
  ] as const) {
    const result = await runCli(dir, [jobId]);
    assert(result.exitCode === 1, `${jobId} exit drifted: ${result.exitCode}`);
    assert(result.stdout === "", `${jobId} wrote stdout: ${JSON.stringify(result.stdout)}`);
    assertSingleError(result.stderr, "EVENTS_READ_FAILED");
    assert(result.stderr.includes(label), `${jobId} stderr did not name ${label}: ${result.stderr}`);
  }

  const malformedPayload = await runCli(dir, ["malformed-payload-ok"]);
  assert(malformedPayload.exitCode === 0, `malformed payload failed: ${malformedPayload.stderr}`);
  assert(malformedPayload.stdout.includes("payload_summary=<invalid-json>"), "malformed payload did not render <invalid-json>");

  return [
    "DB event types with control characters are collapsed and overlong event types are capped at 80 characters.",
    "Invalid event IDs, attempt numbers, empty/non-renderable event types, invalid timestamps, and non-finite timestamps fail as EVENTS_READ_FAILED.",
    "Malformed payload JSON remains a successful <invalid-json> summary rather than DB_READ_FAILED.",
  ];
}

function runBoundaryStaticCheck(): string[] {
  const changed = changedFilesAgainstBase(repoRoot, implementationAnchor);
  assertChangedFilesWithinAllowed(changed, allowedWriteSet);

  let syntheticRejected = false;
  try {
    assertChangedFilesWithinAllowed(
      ["src/bin/report-events.ts", "src/telegram/bot.ts"],
      allowedWriteSet,
    );
  } catch (err) {
    syntheticRejected = String(err).includes("outside declared scope");
  }
  assert(syntheticRejected, "synthetic out-of-scope product file was not rejected");

  const eventsSource = readRepoSource(repoRoot, "src/bin/report-events.ts");
  const smokeSource = readRepoSource(repoRoot, "scripts/report-events-smoke.ts");
  const packageSource = readRepoSource(repoRoot, "package.json");

  assert(eventsSource.includes("new Database(dbPath, { readonly: true })"), "product CLI does not visibly open SQLite readonly");
  assert(/ORDER BY\s+events\.id\s+ASC/i.test(eventsSource), "product CLI lacks explicit events.id ASC ordering");
  assert(/ORDER BY\s+events\.id\s+DESC/i.test(eventsSource), "product CLI lacks explicit events.id DESC limit selection");
  assert(smokeSource.includes('readRepoSource(repoRoot, "src/bin/report-events.ts")'), "smoke does not inspect report-events.ts source");
  assert(smokeSource.includes('readRepoSource(repoRoot, "scripts/report-events-smoke.ts")'), "smoke does not inspect its own source");
  assert(smokeSource.includes('readRepoSource(repoRoot, "package.json")'), "smoke does not inspect package.json source");
  assert(smokeSource.includes("changedFilesAgainstBase(repoRoot, implementationAnchor)"), "smoke does not prove the hard-out implementation range");

  assertNoForbiddenPatterns(eventsSource, [
    ...PROCESS_SPAWN_PATTERNS,
    ...TELEGRAM_SDK_NETWORK_PATTERNS,
    ...PROMPT_SURFACE_PATTERNS,
    [/from\s+["'][^"']*db\.ts["']|openDb|insertJob|insertEvent|updateJob|casUpdateJob|runMigrations/, "mutating DB helper import"],
    [/\bINSERT\s+INTO\b|\bUPDATE\s+\w+\b|\bDELETE\s+FROM\b|\bCREATE\s+TABLE\b|\bALTER\s+TABLE\b|\bDROP\s+TABLE\b|\bPRAGMA\s+\w+\b/i, "DB mutation SQL"],
    [/from\s+["'][^"']*report-(?:create|remind|status|show|list|deliver-local|delivery-status|publish-readme|run)\.ts["']/, "sibling CLI import"],
    [/from\s+["'][^"']*(?:promote|publish-destination|readme-publish-destination|report-loop|report-run-fake-provider)\.ts["']/, "publish/promote/report-loop import"],
    [/from\s+["'][^"']*\/(?:telegram|llm|prompts|pipeline)\//, "Telegram/LLM/prompt/pipeline import"],
    [/from\s+["'][^"']*preflight\.ts["']|\bCodex\b|report:run/, "preflight/Codex/report-run surface"],
    [/\breadFileSync\b|\bwriteFileSync\b|\bmkdirSync\b|\brmSync\b|\bfetch\s*\(/, "artifact, filesystem, or network side-effect surface"],
  ], "src/bin/report-events.ts");

  const packageJson = JSON.parse(packageSource) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    name?: string;
    version?: string;
    private?: boolean;
  };
  assert(packageJson.name === "cz", "package name drifted");
  assert(packageJson.version === "0.1.0", "package version drifted");
  assert(packageJson.private === true, "package private flag drifted");
  assert(packageJson.scripts?.["report:events"] === "bun src/bin/report-events.ts", "missing report:events script");
  assert(packageJson.scripts?.["report-events-smoke"] === "bun scripts/report-events-smoke.ts", "missing report-events-smoke script");
  assert(packageJson.scripts?.["report:run"] === "bun src/bin/report-run.ts", "report:run script drifted");
  assert(packageJson.scripts?.["report:publish-readme"] === "bun src/bin/report-publish-readme.ts", "report:publish-readme script drifted");
  assert(packageJson.dependencies === undefined, "package.json gained dependencies");
  assert(packageJson.devDependencies?.typescript === "^5.6.3", "typescript devDependency drifted");
  assert(packageJson.devDependencies?.["@types/bun"] === "^1.1.13", "@types/bun devDependency drifted");

  return [
    `Implementation range ${implementationAnchor}..HEAD plus worktree contains only declared files: ${changed.join(", ") || "<none>"}.`,
    "Synthetic active-slice boundary rejects out-of-scope product files.",
    "Static source inspection covered src/bin/report-events.ts, scripts/report-events-smoke.ts, and package.json.",
    "report-events.ts visibly uses readonly SQLite, explicit events.id ordering, no DB mutation SQL/helpers, no migrations, no sibling CLI imports, no Telegram/network, no prompt/LLM/Codex/preflight/report-run, no artifact-body reads, and no destination writes.",
    "package.json contains only the report:events and report-events-smoke script additions with dependency metadata unchanged.",
  ];
}

async function runCli(dir: string, args: readonly string[]): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runReportEventsCli({
    cwd: dir,
    args,
    writeStdout: (text) => {
      stdout += text;
    },
    writeStderr: (text) => {
      stderr += text;
    },
  });
  return { exitCode, stdout, stderr };
}

function openScenarioDb(dir: string): Database {
  mkdirSync(resolve(dir, ".data"), { recursive: true });
  const db = new Database(resolve(dir, ".data", "content.db"));
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE jobs (
      id                     TEXT PRIMARY KEY,
      week_key               TEXT NOT NULL UNIQUE,
      topic                  TEXT NOT NULL,
      locales                TEXT NOT NULL DEFAULT 'en,zh',
      attempt_number         INTEGER NOT NULL DEFAULT 1,
      status                 TEXT NOT NULL,
      current_stage          TEXT NOT NULL,
      run_dir                TEXT,
      artifact_dir           TEXT,
      primary_report_path    TEXT,
      translated_report_path TEXT,
      sources_path           TEXT,
      approval_summary       TEXT,
      as_of                  INTEGER,
      reject_scope           TEXT,
      reject_type            TEXT,
      reject_reason          TEXT,
      notified_at            INTEGER,
      last_notify_error      TEXT,
      error                  TEXT,
      created_at             INTEGER NOT NULL,
      updated_at             INTEGER NOT NULL,
      CHECK (locales IN ('en', 'en,zh'))
    );

    CREATE TABLE events (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id         TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      type           TEXT NOT NULL,
      payload        TEXT,
      created_at     INTEGER NOT NULL,
      FOREIGN KEY(job_id) REFERENCES jobs(id)
    );

    CREATE INDEX idx_events_job_attempt ON events(job_id, attempt_number);
  `);
  return db;
}

function seedJob(
  db: Database,
  id: string,
  patch: {
    readonly week_key?: string;
    readonly attempt_number?: number;
    readonly status?: string;
    readonly current_stage?: string;
  } = {},
): void {
  db.query(`
    INSERT INTO jobs (
      id, week_key, topic, locales, attempt_number, status, current_stage,
      run_dir, artifact_dir, primary_report_path, translated_report_path,
      sources_path, approval_summary, as_of, reject_scope, reject_type,
      reject_reason, notified_at, last_notify_error, error, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `).run(
    id,
    patch.week_key ?? `${id}-week`,
    "Events smoke topic",
    "en,zh",
    patch.attempt_number ?? 1,
    patch.status ?? "queued",
    patch.current_stage ?? "research",
    `.runs/${id}`,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    fixedNow,
    fixedNow,
  );
}

function insertEvent(db: Database, input: EventFixture): void {
  if (input.id === undefined) {
    db.query(`
      INSERT INTO events (job_id, attempt_number, type, payload, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      input.job_id,
      input.attempt_number ?? 1,
      input.type ?? "event",
      input.payload ?? null,
      input.created_at ?? fixedNow,
    );
    return;
  }

  db.query(`
    INSERT INTO events (id, job_id, attempt_number, type, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.job_id,
    input.attempt_number ?? 1,
    input.type ?? "event",
    input.payload ?? null,
    input.created_at ?? fixedNow,
  );
}

function stableDbSnapshot(db: Database): string {
  const jobs = db.query("SELECT * FROM jobs ORDER BY id ASC").all();
  const events = db.query("SELECT * FROM events ORDER BY id ASC").all();
  return JSON.stringify({ jobs, events });
}

function filesystemSnapshot(dir: string): string {
  const paths = [
    ".data",
    ".data/content.db",
    ".data/content.db-wal",
    ".data/content.db-shm",
    ".runs",
    "reports",
    "README.md",
    "report-events-smoke.tmp",
  ];
  return JSON.stringify(paths.map((entry) => {
    const fullPath = resolve(dir, entry);
    return [
      entry,
      existsSync(fullPath),
      existsSync(fullPath) ? readPathBytes(fullPath) : null,
    ];
  }));
}

function readPathBytes(target: string): string {
  try {
    return readFileSync(target).toString("base64");
  } catch {
    return "<directory-or-unreadable>";
  }
}

function outputLines(stdout: string): string[] {
  if (stdout.length === 0) return [];
  return stdout.endsWith("\n")
    ? stdout.slice(0, -1).split("\n")
    : stdout.split("\n");
}

function eventIds(stdout: string): number[] {
  return outputLines(stdout)
    .filter((line) => line.startsWith("EVENT\t"))
    .map((line) => Number(fieldValue(line, "event_id")));
}

function eventTypes(stdout: string): string[] {
  return outputLines(stdout)
    .filter((line) => line.startsWith("EVENT\t"))
    .map((line) => fieldValue(line, "type"));
}

function fieldValue(line: string, key: string): string {
  const prefix = `${key}=`;
  const column = line.split("\t").find((value) => value.startsWith(prefix));
  assert(column !== undefined, `missing ${key} in ${line}`);
  return column.slice(prefix.length);
}

function expectedEventLine(
  eventId: number,
  attemptNumber: number,
  type: string,
  createdAt: number,
  payloadSha256: string,
  payloadSummary: string,
): string {
  return [
    "EVENT",
    `event_id=${eventId}`,
    `attempt_number=${attemptNumber}`,
    `type=${type}`,
    `created_at=${iso(createdAt)}`,
    `payload_sha256=${payloadSha256}`,
    `payload_summary=${payloadSummary}`,
  ].join("\t");
}

function assertSingleError(stderr: string, token: string): void {
  assert(stderr.startsWith(`${token}:`), `stderr did not start with ${token}: ${stderr}`);
  assert(stderr.endsWith("\n"), `stderr missing trailing newline: ${stderr}`);
  assert(!stderr.slice(0, -1).includes("\n"), `stderr had multiple lines: ${stderr}`);
}

function assertExactlyOneTrailingNewline(stdout: string): void {
  assert(stdout.endsWith("\n"), "stdout missing trailing newline");
  assert(!stdout.endsWith("\n\n"), "stdout had more than one trailing newline");
}

function assertChangedFilesWithinAllowed(
  changed: readonly string[],
  allowed: ReadonlySet<string>,
): void {
  const outOfScope = changed.filter((file) => !allowed.has(file));
  if (outOfScope.length > 0) {
    throw new Error(`changed files outside declared scope: ${outOfScope.join(", ")}`);
  }
}

function sha12(payload: string): string {
  return createHash("sha256").update(payload).digest("hex").slice(0, 12);
}

function iso(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  mkdirSync(dirname(docPath), { recursive: true });
  const lines = [
    "# report-events smoke evidence",
    "",
    "- Command: `bun run report-events-smoke`",
    `- Started: ${outcomes[0]?.startedAtIso ?? new Date().toISOString()}`,
    `- Finished: ${outcomes.at(-1)?.finishedAtIso ?? new Date().toISOString()}`,
    `- Scenario root: ${smokeRoot} (removed by finally-cleanup)`,
    `- Result: ${outcomes.filter((outcome) => outcome.status === "PASS").length}/${outcomes.length} PASS`,
    "",
    "This smoke exercises the read-only `report:events` CLI surface only. It does not run operator-only `bun run report:run`, real Codex report generation, real Telegram network, notifier sending, publish/promote behavior, destination writes, artifact-body reads, or preflight. The boundary-static scenario reads git metadata only to prove the approved hard-out implementation range.",
    "",
    "| Scenario | Status | Evidence |",
    "|---|---:|---|",
    ...outcomes.map(
      (outcome) =>
        `| ${outcome.name} | ${outcome.status} | ${outcome.details.map(escapeTableCell).join("<br>")} |`,
    ),
    "",
  ];
  writeFileSync(docPath, lines.join("\n"));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function formatThrown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

const exitCode = await main();
process.exit(exitCode);
