import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  appendEvent,
  casUpdateJob,
  createJob,
  DbConstraintError,
  DbInitError,
  DbMigrationError,
  getJob,
  getJobByWeekKey,
  listEventsForJob,
  openDb,
  recordRecoveryCleanup,
  runMigrations,
  updateJob,
} from "../src/db.ts";

type ScenarioName =
  | "open-pragmas"
  | "migration-idempotence-static-begin"
  | "migration-sha-mismatch"
  | "jobs-crud"
  | "events-append-fk"
  | "cas-semantics"
  | "recovery-cleanup"
  | "wal-concurrent-reader";

interface ScenarioOutcome {
  name: ScenarioName;
  status: "PASS" | "FAIL";
  details: string[];
  startedAtIso: string;
  finishedAtIso: string;
}

const SCENARIOS: ScenarioName[] = [
  "open-pragmas",
  "migration-idempotence-static-begin",
  "migration-sha-mismatch",
  "jobs-crud",
  "events-append-fk",
  "cas-semantics",
  "recovery-cleanup",
  "wal-concurrent-reader",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docPath = resolve(repoRoot, "docs", "preflight", "db-smoke.md");

async function main(): Promise<number> {
  const outcomes: ScenarioOutcome[] = [];

  for (const name of SCENARIOS) {
    outcomes.push(await runScenario(name));
  }

  writeEvidence(outcomes);

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
  const dir = mkdtempSync(path.join(tmpdir(), `cz-db-smoke-${name}-`));

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
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function scenarioImpl(
  name: ScenarioName,
  dir: string,
): Promise<string[]> {
  switch (name) {
    case "open-pragmas":
      return runOpenPragmas(dir);
    case "migration-idempotence-static-begin":
      return runMigrationIdempotenceStaticBegin(dir);
    case "migration-sha-mismatch":
      return runMigrationShaMismatch(dir);
    case "jobs-crud":
      return runJobsCrud(dir);
    case "events-append-fk":
      return runEventsAppendFk(dir);
    case "cas-semantics":
      return runCasSemantics(dir);
    case "recovery-cleanup":
      return runRecoveryCleanup(dir);
    case "wal-concurrent-reader":
      return runWalConcurrentReader(dir);
  }
}

function runOpenPragmas(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    const journalMode = scalar<string>(db, "PRAGMA journal_mode");
    const busyTimeout = scalar<number>(db, "PRAGMA busy_timeout");
    const synchronous = scalar<number>(db, "PRAGMA synchronous");
    const foreignKeys = scalar<number>(db, "PRAGMA foreign_keys");

    assert(journalMode === "wal", `expected WAL, got ${journalMode}`);
    assert(busyTimeout === 5000, `expected busy_timeout=5000, got ${busyTimeout}`);
    assert(synchronous === 1, `expected synchronous=NORMAL/1, got ${synchronous}`);
    assert(foreignKeys === 1, `expected foreign_keys=ON/1, got ${foreignKeys}`);
    assert(DbInitError.name === "DbInitError", "DbInitError export missing");
    return [
      "openDb applied WAL, busy_timeout=5000, synchronous=NORMAL, and foreign_keys=ON.",
      "WAL verification succeeded after the PRAGMAs were applied.",
    ];
  } finally {
    db.close();
  }
}

function runMigrationIdempotenceStaticBegin(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    runMigrations(db);
    const rows = scalar<number>(
      db,
      "SELECT COUNT(*) AS value FROM _migrations WHERE filename = '0001_initial.sql'",
    );
    assert(rows === 1, `expected one migration row, got ${rows}`);
  } finally {
    db.close();
  }

  const source = readFileSync(resolve(repoRoot, "src", "db.ts"), "utf8");
  assert(source.includes('db.exec("BEGIN IMMEDIATE")'), "F3 missing explicit BEGIN IMMEDIATE");
  assert(source.includes('db.exec("COMMIT")'), "missing explicit COMMIT");
  assert(source.includes('db.exec("ROLLBACK")'), "missing explicit ROLLBACK");
  assert(!source.includes(".transaction("), "must not rely on Database.transaction");

  return [
    "runMigrations was idempotent and stored one SHA-256 row for 0001_initial.sql.",
    "F3 static check found explicit BEGIN IMMEDIATE/COMMIT/ROLLBACK and no Database.transaction use.",
  ];
}

function runMigrationShaMismatch(dir: string): string[] {
  const migrationsDir = resolve(dir, "migrations");
  mkdirSync(migrationsDir, { recursive: true });
  const migrationPath = resolve(migrationsDir, "0001_initial.sql");
  const db = openDb(resolve(dir, "content.db"), {
    migrate: false,
    migrationsDir,
  });

  try {
    writeFileSync(migrationPath, "CREATE TABLE sample (id TEXT PRIMARY KEY);\n");
    runMigrations(db, migrationsDir);
    writeFileSync(migrationPath, "CREATE TABLE sample (id TEXT PRIMARY KEY, value TEXT);\n");

    let mismatch: unknown;
    try {
      runMigrations(db, migrationsDir);
    } catch (err) {
      mismatch = err;
    }

    assert(mismatch instanceof DbMigrationError, "expected DbMigrationError");
    assert(
      mismatch.errorCode === "MIGRATION_SHA_MISMATCH",
      `expected MIGRATION_SHA_MISMATCH, got ${mismatch.errorCode}`,
    );

    return [
      "A modified applied migration was refused.",
      "DbMigrationError.errorCode was MIGRATION_SHA_MISMATCH.",
    ];
  } finally {
    db.close();
  }
}

function runJobsCrud(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    const now = unixNow();
    const job = createJob(db, {
      id: "job-crud",
      week_key: "2026-W17",
      topic: "AI trends",
      status: "queued",
      current_stage: "research",
      created_at: now,
      updated_at: now,
    });

    assert(job.locales === "en,zh", `expected default locales, got ${job.locales}`);
    assert(getJob(db, "job-crud")?.topic === "AI trends", "getJob failed");
    assert(
      getJobByWeekKey(db, "2026-W17")?.id === "job-crud",
      "getJobByWeekKey failed",
    );

    const changed = updateJob(db, "job-crud", {
      status: "running",
      current_stage: "draft_en",
      primary_report_path: ".runs/job-crud/attempt-1/report.en.md",
      updated_at: now + 1,
    });
    assert(changed === 1, `expected one changed row, got ${changed}`);
    const updated = getJob(db, "job-crud");
    assert(updated?.status === "running", "updateJob did not update status");
    assert(updated.primary_report_path?.endsWith("report.en.md"), "path patch missing");

    let duplicate: unknown;
    try {
      createJob(db, {
        id: "job-crud-2",
        week_key: "2026-W17",
        topic: "duplicate",
        status: "queued",
        current_stage: "research",
        created_at: now,
        updated_at: now,
      });
    } catch (err) {
      duplicate = err;
    }
    assert(duplicate instanceof DbConstraintError, "expected duplicate week constraint");
    assert(
      duplicate.subcode === "DUPLICATE_WEEK_KEY",
      `expected DUPLICATE_WEEK_KEY, got ${duplicate.subcode}`,
    );

    return [
      "createJob/getJob/getJobByWeekKey/updateJob preserved typed job fields.",
      "Duplicate week_key surfaced DbConstraintError.subcode=DUPLICATE_WEEK_KEY.",
    ];
  } finally {
    db.close();
  }
}

function runEventsAppendFk(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    const now = unixNow();
    createJob(db, {
      id: "job-events",
      week_key: "2026-W18",
      topic: "Events",
      status: "queued",
      current_stage: "research",
      created_at: now,
      updated_at: now,
    });

    const payload = '{"nested":{"kept":"as string"}}';
    const event = appendEvent(db, {
      job_id: "job-events",
      attempt_number: 1,
      type: "stage_enter",
      payload,
      created_at: now + 1,
    });
    assert(event.payload === payload, "payload string was not preserved exactly");
    const events = listEventsForJob(db, "job-events");
    assert(events.length === 1, `expected one event, got ${events.length}`);

    let fk: unknown;
    try {
      appendEvent(db, {
        job_id: "missing-job",
        attempt_number: 1,
        type: "stage_enter",
        payload: null,
        created_at: now,
      });
    } catch (err) {
      fk = err;
    }
    assert(fk instanceof DbConstraintError, "expected FK DbConstraintError");
    assert(fk.subcode === "FK_JOB_NOT_FOUND", `expected F6 FK_JOB_NOT_FOUND, got ${fk.subcode}`);

    return [
      "appendEvent/listEventsForJob preserved payload as a string.",
      "F6 foreign-key violation surfaced DbConstraintError.subcode=FK_JOB_NOT_FOUND.",
    ];
  } finally {
    db.close();
  }
}

function runCasSemantics(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    const now = unixNow();
    createJob(db, {
      id: "job-cas",
      week_key: "2026-W19",
      topic: "CAS",
      status: "queued",
      current_stage: "research",
      created_at: now,
      updated_at: now,
    });

    const ok = casUpdateJob(db, "job-cas", now, {
      status: "running",
      updated_at: now + 1,
    });
    const stale = casUpdateJob(db, "job-cas", now, {
      status: "failed",
      updated_at: now + 2,
    });

    assert(ok === 1, `expected successful CAS rowsAffected=1, got ${ok}`);
    assert(stale === 0, `expected stale CAS rowsAffected=0, got ${stale}`);
    assert(getJob(db, "job-cas")?.status === "running", "stale CAS changed row");

    return [
      "casUpdateJob returned rowsAffected=1 for a matching updated_at guard.",
      "casUpdateJob returned rowsAffected=0 and did not mutate on a stale guard.",
    ];
  } finally {
    db.close();
  }
}

function runRecoveryCleanup(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    const now = unixNow();
    createJob(db, {
      id: "job-recovery",
      week_key: "2026-W20",
      topic: "Recovery",
      status: "queued",
      current_stage: "research",
      created_at: now,
      updated_at: now,
    });

    const payload = '{"deletedFiles":["stale.md"],"restartStage":"edit_en"}';
    const first = recordRecoveryCleanup(db, {
      job_id: "job-recovery",
      attempt_number: 2,
      payload,
      created_at: now + 1,
    });
    const duplicate = recordRecoveryCleanup(db, {
      job_id: "job-recovery",
      attempt_number: 2,
      payload: '{"deletedFiles":["other.md"]}',
      created_at: now + 2,
    });

    assert(first.id === duplicate.id, "F4 duplicate did not return existing event");
    assert(duplicate.payload === payload, "duplicate recovery_cleanup changed payload");
    assert(
      scalar<number>(
        db,
        "SELECT COUNT(*) AS value FROM events WHERE type = 'recovery_cleanup'",
      ) === 1,
      "expected one recovery_cleanup row",
    );

    const source = readFileSync(resolve(repoRoot, "src", "db.ts"), "utf8");
    assert(!source.includes("run-state.json"), "recordRecoveryCleanup must not reference run-state.json");

    return [
      "recordRecoveryCleanup wrote the audit payload only to events.",
      "F4 duplicate recovery_cleanup returned the existing row and did not change the payload.",
    ];
  } finally {
    db.close();
  }
}

async function runWalConcurrentReader(dir: string): Promise<string[]> {
  const dbPath = resolve(dir, "content.db");
  const writer = openDb(dbPath);
  const reader = openDb(dbPath);
  try {
    const now = unixNow();
    createJob(writer, {
      id: "job-wal",
      week_key: "2026-W21",
      topic: "WAL",
      status: "queued",
      current_stage: "research",
      created_at: now,
      updated_at: now,
    });

    writer.exec("BEGIN IMMEDIATE");
    updateJob(writer, "job-wal", { status: "running", updated_at: now + 1 });
    const visibleToReader = getJob(reader, "job-wal");
    assert(visibleToReader?.status === "queued", "reader should see pre-commit snapshot");
    writer.exec("COMMIT");

    const afterCommit = getJob(reader, "job-wal");
    assert(afterCommit?.status === "running", "reader did not see committed WAL update");

    return [
      "A second connection read a stable pre-commit snapshot while a writer held BEGIN IMMEDIATE.",
      "The reader observed the committed update after COMMIT.",
    ];
  } catch (err) {
    try {
      writer.exec("ROLLBACK");
    } catch {
      // Ignore rollback cleanup when no transaction is active.
    }
    throw err;
  } finally {
    reader.close();
    writer.close();
  }
}

function scalar<T>(db: { query: (sql: string) => { get: () => Record<string, T> | null } }, sql: string): T {
  const row = db.query(sql).get();
  assert(row !== null, `query returned no rows: ${sql}`);
  return Object.values(row)[0] as T;
}

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`;
  }
  return String(err);
}

function writeEvidence(outcomes: ScenarioOutcome[]): void {
  const passCount = outcomes.filter((outcome) => outcome.status === "PASS").length;
  const lines = [
    "# DB Smoke Evidence",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Command",
    "",
    "```bash",
    "bun run db:smoke",
    "```",
    "",
    "## Evidence Ceiling",
    "",
    "This smoke exercises the local SQLite persistence surface only. It does not run operator-only `bun run report:run`, real Codex report generation, Telegram flows, browser checks, or future composition-root wiring.",
    "",
    "## Scenario Results",
    "",
    `Passed ${passCount}/${outcomes.length} scenarios.`,
    "",
    "| Scenario | Status | Evidence |",
    "|---|---|---|",
    ...outcomes.map(
      (outcome) =>
        `| ${outcome.name} | ${outcome.status} | ${outcome.details.join("<br>")} |`,
    ),
    "",
  ];

  writeFileSync(docPath, `${lines.join("\n")}\n`);
}

process.exit(await main());
