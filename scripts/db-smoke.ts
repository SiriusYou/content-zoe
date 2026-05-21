import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  bootstrapResumeAttemptLifecycle,
  casUpdateJob,
  DbConstraintError,
  DbInitError,
  DbMigrationError,
  findEventsByJob,
  findJobById,
  findJobsByStatus,
  insertEvent,
  insertJob,
  LifecyclePersistenceError,
  openDb,
  recordRecoveryCleanup,
  recordResearchStageComplete,
  recordStageComplete,
  recordStageEnter,
  runMigrations,
  updateJob,
} from "../src/db.ts";
import { Stage } from "../src/pipeline/types.ts";

type ScenarioName =
  | "open-pragmas"
  | "migration-idempotence-static-begin"
  | "db-purpose-migration"
  | "migration-sha-mismatch"
  | "jobs-crud"
  | "events-append-fk"
  | "stage-lifecycle"
  | "cas-semantics"
  | "resume-bootstrap-lifecycle"
  | "recovery-cleanup"
  | "wal-concurrent-reader";

interface ScenarioOutcome {
  name: ScenarioName;
  status: "PASS" | "FAIL";
  details: string[];
  startedAtIso: string;
  finishedAtIso: string;
}

interface RecoveryCleanupRaceResult {
  eventId: number;
  observedExisting: boolean;
  payload: string | null;
}

const SCENARIOS: ScenarioName[] = [
  "open-pragmas",
  "migration-idempotence-static-begin",
  "db-purpose-migration",
  "migration-sha-mismatch",
  "jobs-crud",
  "events-append-fk",
  "stage-lifecycle",
  "cas-semantics",
  "resume-bootstrap-lifecycle",
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
    case "db-purpose-migration":
      return runDbPurposeMigration(dir);
    case "migration-sha-mismatch":
      return runMigrationShaMismatch(dir);
    case "jobs-crud":
      return runJobsCrud(dir);
    case "events-append-fk":
      return runEventsAppendFk(dir);
    case "stage-lifecycle":
      return runStageLifecycle(dir);
    case "cas-semantics":
      return runCasSemantics(dir);
    case "resume-bootstrap-lifecycle":
      return runResumeBootstrapLifecycle(dir);
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
    const rerun = runMigrations(db);
    assert(rerun.applied.length === 0, "expected rerun to apply no migrations");
    assert(
      rerun.skipped.includes("0001_initial.sql"),
      "expected rerun to skip already-applied 0001_initial.sql",
    );
    assert(
      rerun.skipped.includes("0002_jobs_purpose.sql"),
      "expected rerun to skip already-applied 0002_jobs_purpose.sql",
    );
    const rows = scalar<number>(
      db,
      "SELECT COUNT(*) AS value FROM _migrations WHERE filename IN ('0001_initial.sql', '0002_jobs_purpose.sql')",
    );
    assert(rows === 2, `expected two migration rows, got ${rows}`);
  } finally {
    db.close();
  }

  const source = readFileSync(resolve(repoRoot, "src", "db.ts"), "utf8");
  assert(source.includes('db.exec("BEGIN IMMEDIATE")'), "F3 missing explicit BEGIN IMMEDIATE");
  assert(source.includes('db.exec("COMMIT")'), "missing explicit COMMIT");
  assert(source.includes('db.exec("ROLLBACK")'), "missing explicit ROLLBACK");
  assert(!source.includes(".transaction("), "must not rely on Database.transaction");

  return [
    "runMigrations was idempotent and stored SHA-256 rows for 0001_initial.sql and 0002_jobs_purpose.sql.",
    "F3 static check found explicit BEGIN IMMEDIATE/COMMIT/ROLLBACK and no Database.transaction use. [BEGIN IMMEDIATE confirmed in source]",
  ];
}

function runDbPurposeMigration(dir: string): string[] {
  const migrationsDir = resolve(dir, "migrations");
  mkdirSync(migrationsDir, { recursive: true });
  writeFileSync(
    resolve(migrationsDir, "0001_initial.sql"),
    readFileSync(resolve(repoRoot, "src", "migrations", "0001_initial.sql"), "utf8"),
  );

  const db = openDb(resolve(dir, "content.db"), {
    migrate: false,
    migrationsDir,
  });

  try {
    const first = runMigrations(db, migrationsDir);
    assert(first.applied.includes("0001_initial.sql"), "custom 0001 did not apply");
    const now = unixNow();
    for (const [jobId, weekKey] of [
      ["2026-W20-ai-trends", "2026-W20"],
      ["2026-W21-ai-trends", "2026-W21"],
      ["2026-W22-ai-trends", "2026-W22"],
      ["2026-W23-ai-trends", "2026-W23"],
      ["2026-W24-ai-trends", "2026-W24"],
      ["2026-W25-ai-trends", "2026-W25"],
      ["2026-W26-ai-trends", "2026-W26"],
    ] as const) {
      db.query(`
        INSERT INTO jobs (
          id, week_key, topic, status, current_stage, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(jobId, weekKey, "Purpose migration", "published", "published", now, now);
    }

    writeFileSync(
      resolve(migrationsDir, "0002_jobs_purpose.sql"),
      readFileSync(resolve(repoRoot, "src", "migrations", "0002_jobs_purpose.sql"), "utf8"),
    );
    const second = runMigrations(db, migrationsDir);
    assert(second.applied.includes("0002_jobs_purpose.sql"), "custom 0002 did not apply");
    assert(
      scalar<number>(db, "SELECT COUNT(*) AS value FROM pragma_table_info('jobs') WHERE name = 'purpose'") === 1,
      "jobs.purpose column missing after 0002",
    );
    assert(
      scalar<number>(
        db,
        "SELECT COUNT(*) AS value FROM jobs WHERE id IN ('2026-W20-ai-trends', '2026-W21-ai-trends', '2026-W22-ai-trends', '2026-W23-ai-trends', '2026-W24-ai-trends') AND purpose = 'validation'",
      ) === 5,
      "W20-W24 were not classified validation",
    );
    assert(
      scalar<number>(
        db,
        "SELECT COUNT(*) AS value FROM jobs WHERE id = '2026-W25-ai-trends' AND purpose = 'production'",
      ) === 1,
      "W25 was not classified production",
    );
    assert(
      scalar<number>(
        db,
        "SELECT COUNT(*) AS value FROM jobs WHERE id = '2026-W26-ai-trends' AND purpose IS NULL",
      ) === 1,
      "unlisted rows did not remain NULL",
    );

    const rerun = runMigrations(db, migrationsDir);
    assert(rerun.applied.length === 0, "custom 0002 rerun was not idempotent");
    assert(rerun.skipped.includes("0002_jobs_purpose.sql"), "custom 0002 was not skipped on rerun");

    return [
      "0002 added nullable jobs.purpose and classified only W20-W24 as validation plus W25 as production.",
      "An unlisted W26 row remained NULL and the custom migration rerun was idempotent.",
    ];
  } finally {
    db.close();
  }
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
    assert(
      typeof mismatch.expectedSha === "string" && mismatch.expectedSha.length === 64,
      "expected mismatch.expectedSha to expose stored SHA-256",
    );
    assert(
      typeof mismatch.actualSha === "string" && mismatch.actualSha.length === 64,
      "expected mismatch.actualSha to expose current SHA-256",
    );
    assert(
      mismatch.expectedSha !== mismatch.actualSha,
      "expected SHA mismatch payload values to differ",
    );

    return [
      "A modified applied migration was refused.",
      "DbMigrationError.errorCode was MIGRATION_SHA_MISMATCH with expectedSha and actualSha evidence.",
    ];
  } finally {
    db.close();
  }
}

function runJobsCrud(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    const now = unixNow();
    const job = insertJob(db, {
      id: "job-crud",
      week_key: "2026-W17",
      topic: "AI trends",
      status: "queued",
      current_stage: "research",
      created_at: now,
      updated_at: now,
    });

    assert(job.locales === "en,zh", `expected default locales, got ${job.locales}`);
    assert(findJobById(db, "job-crud")?.topic === "AI trends", "findJobById failed");
    assert(
      findJobsByStatus(db, "queued").some((queuedJob) => queuedJob.id === "job-crud"),
      "findJobsByStatus failed",
    );

    const changed = updateJob(db, "job-crud", {
      status: "running",
      current_stage: "draft_en",
      primary_report_path: ".runs/job-crud/attempt-1/report.en.md",
      updated_at: now + 1,
    });
    assert(changed.rowsAffected === 1, `expected one changed row, got ${changed.rowsAffected}`);
    const updated = findJobById(db, "job-crud");
    assert(updated?.status === "running", "updateJob did not update status");
    assert(updated.primary_report_path?.endsWith("report.en.md"), "path patch missing");

    let duplicate: unknown;
    try {
      insertJob(db, {
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
      duplicate.subcode === "SQLITE_CONSTRAINT_UNIQUE",
      `expected SQLITE_CONSTRAINT_UNIQUE, got ${duplicate.subcode}`,
    );
    assert(duplicate.tableName === "jobs", `expected tableName jobs, got ${duplicate.tableName}`);
    assert(
      duplicate.columnHint === "week_key",
      `expected columnHint week_key, got ${duplicate.columnHint}`,
    );

    return [
      "insertJob/findJobById/findJobsByStatus/updateJob preserved typed job fields.",
      "Duplicate week_key surfaced DbConstraintError.subcode=SQLITE_CONSTRAINT_UNIQUE with table/column hints.",
    ];
  } finally {
    db.close();
  }
}

function runEventsAppendFk(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    const now = unixNow();
    insertJob(db, {
      id: "job-events",
      week_key: "2026-W18",
      topic: "Events",
      status: "queued",
      current_stage: "research",
      created_at: now,
      updated_at: now,
    });

    const payload = '{"nested":{"kept":"as string"}}';
    const event = insertEvent(db, {
      job_id: "job-events",
      attempt_number: 1,
      type: "stage_enter",
      payload,
      created_at: now + 1,
    });
    assert(event.payload === payload, "payload string was not preserved exactly");
    const events = findEventsByJob(db, "job-events");
    assert(events.length === 1, `expected one event, got ${events.length}`);
    const typedEvents = findEventsByJob(db, "job-events", "stage_enter");
    assert(typedEvents.length === 1, `expected one typed event, got ${typedEvents.length}`);

    let fk: unknown;
    try {
      insertEvent(db, {
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
    assert(
      fk.subcode === "SQLITE_CONSTRAINT_FOREIGNKEY",
      `expected F6 SQLITE_CONSTRAINT_FOREIGNKEY, got ${fk.subcode}`,
    );
    assert(fk.originalError instanceof Error, "expected originalError to be exposed");

    return [
      "insertEvent/findEventsByJob preserved payload as a string and supported type filtering.",
      "F6 foreign-key violation surfaced DbConstraintError.subcode=SQLITE_CONSTRAINT_FOREIGNKEY.",
    ];
  } finally {
    db.close();
  }
}

function runStageLifecycle(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    const now = unixNow();
    insertJob(db, {
      id: "job-lifecycle",
      week_key: "2026-W23",
      topic: "Lifecycle",
      status: "queued",
      current_stage: Stage.RESEARCH,
      created_at: now,
      updated_at: now,
    });

    const enter = recordStageEnter(db, {
      jobId: "job-lifecycle",
      attemptNumber: 1,
      stage: Stage.RESEARCH,
      runDir: ".runs/job-lifecycle/attempt-1",
      timestamp: now + 1,
    });
    assert(enter.type === "stage_enter", "expected stage_enter");
    assertPayloadShape(enter.payload, ["stage", "run_dir"]);
    const afterEnter = findJobById(db, "job-lifecycle");
    assert(afterEnter?.status === "running", "stage_enter did not set running");
    assert(afterEnter.current_stage === Stage.RESEARCH, "stage_enter did not set current_stage");

    const researchComplete = recordResearchStageComplete(db, {
      jobId: "job-lifecycle",
      attemptNumber: 1,
      stage: Stage.RESEARCH,
      runDir: ".runs/job-lifecycle/attempt-1",
      timestamp: now + 2,
    });
    assert(researchComplete.type === "stage_complete", "expected research stage_complete");
    assertPayloadShape(researchComplete.payload, ["stage", "run_dir", "status"]);
    const afterResearch = findJobById(db, "job-lifecycle");
    assert(afterResearch?.as_of === now + 2, `expected as_of ${now + 2}`);

    const draftComplete = recordStageComplete(db, {
      jobId: "job-lifecycle",
      attemptNumber: 1,
      stage: Stage.DRAFT_EN,
      runDir: ".runs/job-lifecycle/attempt-1",
      timestamp: now + 3,
    });
    assertPayloadShape(draftComplete.payload, ["stage", "run_dir", "status"]);

    let staleEnter: unknown;
    try {
      recordStageEnter(db, {
        jobId: "job-lifecycle",
        attemptNumber: 2,
        stage: Stage.EDIT_EN,
        runDir: ".runs/job-lifecycle/attempt-2",
        timestamp: now + 4,
      });
    } catch (err) {
      staleEnter = err;
    }
    assert(staleEnter instanceof LifecyclePersistenceError, "expected stale enter lifecycle error");
    assert(
      staleEnter.message.startsWith("LIFECYCLE_PERSISTENCE_FAILED:"),
      `unexpected stale enter error ${formatError(staleEnter)}`,
    );
    assert(
      scalar<number>(
        db,
        "SELECT COUNT(*) AS value FROM events WHERE job_id = 'job-lifecycle' AND attempt_number = 2",
      ) === 0,
      "stale stage_enter left an event row",
    );

    let staleResearchComplete: unknown;
    try {
      recordResearchStageComplete(db, {
        jobId: "job-lifecycle",
        attemptNumber: 2,
        stage: Stage.RESEARCH,
        runDir: ".runs/job-lifecycle/attempt-2",
        timestamp: now + 5,
      });
    } catch (err) {
      staleResearchComplete = err;
    }
    assert(
      staleResearchComplete instanceof LifecyclePersistenceError,
      "expected stale research lifecycle error",
    );
    const afterStaleResearch = findJobById(db, "job-lifecycle");
    assert(afterStaleResearch?.as_of === now + 2, "stale research changed as_of");
    assert(
      scalar<number>(
        db,
        "SELECT COUNT(*) AS value FROM events WHERE job_id = 'job-lifecycle' AND type = 'stage_complete'",
      ) === 2,
      "stale research stage_complete left a durable event",
    );

    return [
      "recordStageEnter guarded the current attempt, wrote exact stage_enter payload, and updated running/current_stage.",
      "recordResearchStageComplete atomically wrote research stage_complete plus jobs.as_of.",
      "recordStageComplete guarded event-only boundaries without broad job mutation.",
      "Wrong-attempt lifecycle writes failed with LIFECYCLE_PERSISTENCE_FAILED and left no event/as_of split-brain.",
    ];
  } finally {
    db.close();
  }
}

function runCasSemantics(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    const now = unixNow();
    insertJob(db, {
      id: "job-cas",
      week_key: "2026-W19",
      topic: "CAS",
      status: "awaiting_approval",
      current_stage: "translate_zh",
      created_at: now,
      updated_at: now,
    });

    const ok = casUpdateJob(db, "job-cas", {
      status: "awaiting_approval",
      attemptNumber: 1,
    }, {
      notified_at: now + 1,
      updated_at: now + 1,
    });

    const attemptChanged = updateJob(db, "job-cas", {
      attempt_number: 2,
      status: "queued",
      current_stage: "draft_en",
      updated_at: now + 2,
    });
    const stale = casUpdateJob(db, "job-cas", {
      status: "awaiting_approval",
      attemptNumber: 1,
    }, {
      notified_at: now + 3,
      updated_at: now + 3,
    });

    assert(ok.rowsAffected === 1, `expected successful CAS rowsAffected=1, got ${ok.rowsAffected}`);
    assert(
      attemptChanged.rowsAffected === 1,
      `expected one attempt change, got ${attemptChanged.rowsAffected}`,
    );
    assert(stale.rowsAffected === 0, `expected stale CAS rowsAffected=0, got ${stale.rowsAffected}`);
    const afterStale = findJobById(db, "job-cas");
    assert(afterStale?.status === "queued", "stale CAS changed status");
    assert(afterStale.notified_at === now + 1, "stale CAS changed notified_at");

    return [
      "casUpdateJob returned rowsAffected=1 for a matching status plus attempt_number guard.",
      "casUpdateJob returned rowsAffected=0 and did not mutate after status/attempt_number drift.",
    ];
  } finally {
    db.close();
  }
}

function runResumeBootstrapLifecycle(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    const now = unixNow();
    insertJob(db, {
      id: "job-resume-bootstrap",
      week_key: "2026-W24",
      topic: "Resume bootstrap",
      status: "running",
      current_stage: Stage.TRANSLATE_ZH,
      run_dir: ".runs/job-resume-bootstrap",
      created_at: now,
      updated_at: now,
    });

    const recoveryCleanup = {
      fromAttempt: 1,
      copiedFromAttempt: 1,
      deletedFiles: [],
      restartStage: Stage.TRANSLATE_ZH,
      carryForward: ["research", "sources.json", "report.en.md"],
    };
    const cleanup = bootstrapResumeAttemptLifecycle(db, {
      jobId: "job-resume-bootstrap",
      expectedPreviousAttemptNumber: 1,
      attemptNumber: 2,
      restartStage: Stage.TRANSLATE_ZH,
      runDir: ".runs/job-resume-bootstrap",
      recoveryCleanup,
      timestamp: now + 1,
    });
    assert(cleanup.type === "recovery_cleanup", "expected recovery_cleanup event");
    const afterBootstrap = findJobById(db, "job-resume-bootstrap");
    assert(afterBootstrap?.attempt_number === 2, "bootstrap did not advance attempt");
    assert(afterBootstrap.status === "running", "bootstrap did not preserve running status");
    assert(afterBootstrap.current_stage === Stage.TRANSLATE_ZH, "bootstrap stage mismatch");

    const duplicate = bootstrapResumeAttemptLifecycle(db, {
      jobId: "job-resume-bootstrap",
      expectedPreviousAttemptNumber: 1,
      attemptNumber: 2,
      restartStage: Stage.TRANSLATE_ZH,
      runDir: ".runs/job-resume-bootstrap",
      recoveryCleanup,
      timestamp: now + 2,
    });
    assert(duplicate.id === cleanup.id, "matching duplicate did not return existing cleanup");
    assert(
      scalar<number>(
        db,
        "SELECT COUNT(*) AS value FROM events WHERE job_id = 'job-resume-bootstrap' AND type = 'recovery_cleanup'",
      ) === 1,
      "matching duplicate created another cleanup row",
    );

    const enter = recordStageEnter(db, {
      jobId: "job-resume-bootstrap",
      attemptNumber: 2,
      stage: Stage.TRANSLATE_ZH,
      runDir: ".runs/job-resume-bootstrap/attempt-2",
      timestamp: now + 3,
    });
    assert(enter.type === "stage_enter", "strict stage_enter did not succeed after bootstrap");

    insertJob(db, {
      id: "job-resume-stale",
      week_key: "2026-W25",
      topic: "Resume stale",
      status: "running",
      current_stage: Stage.TRANSLATE_ZH,
      attempt_number: 3,
      created_at: now,
      updated_at: now,
    });
    let stale: unknown;
    try {
      bootstrapResumeAttemptLifecycle(db, {
        jobId: "job-resume-stale",
        expectedPreviousAttemptNumber: 1,
        attemptNumber: 2,
        restartStage: Stage.TRANSLATE_ZH,
        runDir: ".runs/job-resume-stale",
        recoveryCleanup,
        timestamp: now + 4,
      });
    } catch (err) {
      stale = err;
    }
    assert(stale instanceof LifecyclePersistenceError, "expected stale bootstrap lifecycle error");
    assert(
      scalar<number>(
        db,
        "SELECT COUNT(*) AS value FROM events WHERE job_id = 'job-resume-stale'",
      ) === 0,
      "stale bootstrap left an event after rollback",
    );

    insertJob(db, {
      id: "job-resume-divergent",
      week_key: "2026-W26",
      topic: "Resume divergent",
      status: "running",
      current_stage: Stage.TRANSLATE_ZH,
      created_at: now,
      updated_at: now,
    });
    insertEvent(db, {
      job_id: "job-resume-divergent",
      attempt_number: 2,
      type: "recovery_cleanup",
      payload: JSON.stringify({
        ...recoveryCleanup,
        deletedFiles: ["different.md"],
      }),
      created_at: now + 5,
    });
    let divergent: unknown;
    try {
      bootstrapResumeAttemptLifecycle(db, {
        jobId: "job-resume-divergent",
        expectedPreviousAttemptNumber: 1,
        attemptNumber: 2,
        restartStage: Stage.TRANSLATE_ZH,
        runDir: ".runs/job-resume-divergent",
        recoveryCleanup,
        timestamp: now + 6,
      });
    } catch (err) {
      divergent = err;
    }
    assert(divergent instanceof LifecyclePersistenceError, "expected divergent cleanup lifecycle error");
    assert(
      findJobById(db, "job-resume-divergent")?.attempt_number === 1,
      "divergent cleanup advanced jobs row",
    );

    return [
      "bootstrapResumeAttemptLifecycle atomically advanced jobs.attempt_number/current_stage/status and wrote recovery_cleanup.",
      "A matching duplicate bootstrap returned the existing cleanup row and did not duplicate events.",
      "recordStageEnter remained a strict post-bootstrap guard for attempt-2.",
      "Stale bootstrap rollback left no event, and divergent cleanup was rejected before jobs row transition.",
    ];
  } finally {
    db.close();
  }
}

async function runRecoveryCleanup(dir: string): Promise<string[]> {
  const dbPath = resolve(dir, "content.db");
  const db = openDb(dbPath);
  try {
    const now = unixNow();
    insertJob(db, {
      id: "job-recovery",
      week_key: "2026-W20",
      topic: "Recovery",
      status: "queued",
      current_stage: "research",
      created_at: now,
      updated_at: now,
    });

    const recoveryCleanup = {
      fromAttempt: 1,
      copiedFromAttempt: 1,
      deletedFiles: ["stale.md"],
      restartStage: Stage.EDIT_EN,
      carryForward: ["research/", "sources.json"],
    } as const;
    const payload = JSON.stringify(recoveryCleanup);
    const first = recordRecoveryCleanup(db, {
      jobId: "job-recovery",
      attemptNumber: 2,
      recoveryCleanup,
    });
    const duplicate = recordRecoveryCleanup(db, {
      jobId: "job-recovery",
      attemptNumber: 2,
      recoveryCleanup,
    });
    let divergent: unknown;
    try {
      recordRecoveryCleanup(db, {
        jobId: "job-recovery",
        attemptNumber: 2,
        recoveryCleanup: {
          ...recoveryCleanup,
          deletedFiles: ["other.md"],
        },
      });
    } catch (err) {
      divergent = err;
    }

    assert(divergent instanceof LifecyclePersistenceError, "expected divergent cleanup rejection");
    assert(
      formatError(divergent).includes("divergent recovery_cleanup"),
      "unexpected divergent cleanup error",
    );
    assert(first.id === duplicate.id, "F4 duplicate did not return existing event");
    assert(duplicate.payload === payload, "duplicate recovery_cleanup changed payload");
    assert(
      scalar<number>(
        db,
        "SELECT COUNT(*) AS value FROM events WHERE type = 'recovery_cleanup'",
      ) === 1,
      "expected one recovery_cleanup row",
    );

    const matchingAgain = recordRecoveryCleanup(db, {
      jobId: "job-recovery",
      attemptNumber: 2,
      recoveryCleanup,
    });

    assert(matchingAgain.id === first.id, "matching retry did not return existing event");
    assert(
      scalar<number>(
        db,
        "SELECT COUNT(*) AS value FROM events WHERE type = 'recovery_cleanup'",
      ) === 1,
      "expected one recovery_cleanup row",
    );

    insertJob(db, {
      id: "job-recovery-race",
      week_key: "2026-W22",
      topic: "Recovery race",
      status: "queued",
      current_stage: "research",
      created_at: now,
      updated_at: now,
    });

    const raceResults = await runRecoveryCleanupRace(dbPath);
    const raceRowCount = scalar<number>(
      db,
      "SELECT COUNT(*) AS value FROM events WHERE job_id = 'job-recovery-race' AND attempt_number = 3 AND type = 'recovery_cleanup'",
    );
    assert(raceRowCount === 1, `expected one race recovery_cleanup row, got ${raceRowCount}`);
    assert(
      new Set(raceResults.map((result) => result.eventId)).size === 1,
      "expected concurrent duplicate callers to return the same event id",
    );
    assert(
      raceResults.every((result) => result.payload === payloadForRace()),
      "expected concurrent duplicate callers to observe the matching payload",
    );

    const source = readFileSync(resolve(repoRoot, "src", "db.ts"), "utf8");
    assert(!source.includes("run-state.json"), "recordRecoveryCleanup must not reference run-state.json");

    return [
      "recordRecoveryCleanup serialized the Slice 3.5 recoveryCleanup object into events only.",
      "F4 sequential duplicate recovery_cleanup returned the existing row only when the payload matched.",
      "Divergent recovery_cleanup for the same job/attempt was rejected with LIFECYCLE_PERSISTENCE_FAILED.",
      "F6 Test #7(b) launched two separate connections/processes with matching payloads; partial UNIQUE enforcement left exactly one row and both callers returned it.",
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
    insertJob(writer, {
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
    const visibleToReader = findJobById(reader, "job-wal");
    assert(visibleToReader?.status === "queued", "reader should see pre-commit snapshot");
    writer.exec("COMMIT");

    const afterCommit = findJobById(reader, "job-wal");
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

async function runRecoveryCleanupRace(
  dbPath: string,
): Promise<RecoveryCleanupRaceResult[]> {
  const childCode = `
    import { openDb, recordRecoveryCleanup } from "./src/db.ts";

    const label = process.env.RACE_LABEL;
    if (!label || !process.env.DB_PATH) {
      throw new Error("missing race child environment");
    }

    const recoveryCleanup = {
      fromAttempt: 2,
      copiedFromAttempt: 2,
      deletedFiles: ["shared.md"],
      restartStage: "draft_en",
      carryForward: ["research/"],
    };
    const expectedPayload = JSON.stringify(recoveryCleanup);
    const db = openDb(process.env.DB_PATH);

    try {
      const event = recordRecoveryCleanup(db, {
        jobId: "job-recovery-race",
        attemptNumber: 3,
        recoveryCleanup,
      });
      console.log(JSON.stringify({
        eventId: event.id,
        observedExisting: event.payload !== expectedPayload,
        payload: event.payload,
      }));
    } finally {
      db.close();
    }
  `;

  const children = ["left", "right"].map((label) =>
    Bun.spawn({
      cmd: [process.execPath, "--eval", childCode],
      cwd: repoRoot,
      env: {
        ...process.env,
        DB_PATH: dbPath,
        RACE_LABEL: label,
      },
      stdout: "pipe",
      stderr: "pipe",
    }),
  );

  const outputs = await Promise.all(
    children.map(async (child) => {
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      assert(exitCode === 0, `race child failed with ${exitCode}: ${stderr}`);
      const line = stdout.trim().split("\n").filter(Boolean).at(-1);
      assert(line !== undefined, "race child produced no JSON output");
      return JSON.parse(line) as RecoveryCleanupRaceResult;
    }),
  );

  return outputs;
}

function payloadForRace(): string {
  return JSON.stringify({
    fromAttempt: 2,
    copiedFromAttempt: 2,
    deletedFiles: ["shared.md"],
    restartStage: Stage.DRAFT_EN,
    carryForward: ["research/"],
  });
}

function scalar<T>(db: { query: (sql: string) => { get: () => Record<string, T> | null } }, sql: string): T {
  const row = db.query(sql).get();
  assert(row !== null, `query returned no rows: ${sql}`);
  return Object.values(row)[0] as T;
}

function assertPayloadShape(payload: string | null, expectedKeys: string[]): void {
  assert(payload !== null, "expected payload");
  const parsed = JSON.parse(payload) as Record<string, unknown>;
  const keys = Object.keys(parsed).sort();
  assert(
    keys.join(",") === [...expectedKeys].sort().join(","),
    `unexpected payload keys ${keys.join(",")}`,
  );
  assert(typeof parsed.stage === "string", "payload missing stage");
  assert(typeof parsed.run_dir === "string", "payload missing run_dir");
  if (expectedKeys.includes("status")) {
    assert(parsed.status === "ok", "stage_complete status must be ok");
  }
  const payloadText = JSON.stringify(parsed);
  for (const forbidden of [
    "content",
    "markdown",
    "body",
    "response",
    "artifact_text",
    "prompt",
    "output",
  ]) {
    assert(!payloadText.includes(forbidden), `payload leaked forbidden token ${forbidden}`);
  }
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
