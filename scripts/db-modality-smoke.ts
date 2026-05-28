import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  casUpdateJob,
  DbConstraintError,
  findEventsByJob,
  findJobById,
  insertEvent,
  insertJob,
  openDb,
  runMigrations,
  updateJob,
  type DbClient,
  type JobModality,
} from "../src/db.ts";
import { Modality } from "../src/pipeline/modality.ts";

type ScenarioName =
  | "modality-migration-default-text-report"
  | "modality-image-insert"
  | "modality-update-patch-roundtrip"
  | "modality-cas-patch-roundtrip"
  | "modality-check-constraint"
  | "modality-values-match-registry"
  | "image-event-types-preserved"
  | "migration-idempotence-includes-0003"
  | "legacy-db-migration-from-0001-0002";

interface ScenarioOutcome {
  name: ScenarioName;
  status: "PASS" | "FAIL";
  details: string[];
  startedAtIso: string;
  finishedAtIso: string;
}

const SCENARIOS: ScenarioName[] = [
  "modality-migration-default-text-report",
  "modality-image-insert",
  "modality-update-patch-roundtrip",
  "modality-cas-patch-roundtrip",
  "modality-check-constraint",
  "modality-values-match-registry",
  "image-event-types-preserved",
  "migration-idempotence-includes-0003",
  "legacy-db-migration-from-0001-0002",
];

const IMAGE_EVENT_TYPES = [
  "image_spec_ready",
  "image_generated",
  "image_judged",
  "image_regen",
  "did_not_pass_auto_gate",
] as const;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docPath = resolve(repoRoot, "docs", "preflight", "db-modality-smoke.md");

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
  const dir = mkdtempSync(path.join(tmpdir(), `cz-db-modality-smoke-${name}-`));

  try {
    const details = scenarioImpl(name, dir);
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

function scenarioImpl(name: ScenarioName, dir: string): string[] {
  switch (name) {
    case "modality-migration-default-text-report":
      return runModalityMigrationDefault(dir);
    case "modality-image-insert":
      return runModalityImageInsert(dir);
    case "modality-update-patch-roundtrip":
      return runModalityUpdatePatchRoundtrip(dir);
    case "modality-cas-patch-roundtrip":
      return runModalityCasPatchRoundtrip(dir);
    case "modality-check-constraint":
      return runModalityCheckConstraint(dir);
    case "modality-values-match-registry":
      return runModalityValuesMatchRegistry(dir);
    case "image-event-types-preserved":
      return runImageEventTypesPreserved(dir);
    case "migration-idempotence-includes-0003":
      return runMigrationIdempotenceIncludes0003(dir);
    case "legacy-db-migration-from-0001-0002":
      return runLegacyDbMigrationFrom00010002(dir);
  }
}

function runModalityMigrationDefault(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    const migrationCount = scalar<number>(
      db,
      "SELECT COUNT(*) AS value FROM _migrations WHERE filename = '0003_jobs_modality.sql'",
    );
    assert(migrationCount === 1, `expected 0003 migration row, got ${migrationCount}`);

    const modalityColumn = scalar<number>(
      db,
      "SELECT COUNT(*) AS value FROM pragma_table_info('jobs') WHERE name = 'modality'",
    );
    assert(modalityColumn === 1, "jobs.modality column missing");

    const modalityIndex = scalar<number>(
      db,
      "SELECT COUNT(*) AS value FROM sqlite_master WHERE type = 'index' AND name = 'idx_jobs_modality'",
    );
    assert(modalityIndex === 1, "idx_jobs_modality index missing");

    const job = insertJob(db, {
      id: "report-default",
      week_key: "2028-W01",
      topic: "Report default modality",
      status: "queued",
      current_stage: "research",
      created_at: 100,
      updated_at: 100,
    });
    assert(job.modality === "text_report", `expected text_report, got ${job.modality}`);
    const raw = scalar<string>(
      db,
      "SELECT modality AS value FROM jobs WHERE id = 'report-default'",
    );
    assert(raw === "text_report", `raw row modality mismatch: ${raw}`);
    return [
      "0003 migration, jobs.modality column, and idx_jobs_modality index are present.",
      "Report-shaped insert without modality returned and stored text_report.",
    ];
  } finally {
    db.close();
  }
}

function runModalityImageInsert(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    const job = insertJob(db, {
      id: "img-smoke-insert",
      week_key: "img-smoke-001",
      topic: "Image modality insert",
      locales: "en",
      modality: "image",
      status: "queued",
      current_stage: "elaborate_spec",
      created_at: 200,
      updated_at: 200,
    });
    assert(job.modality === "image", `expected image, got ${job.modality}`);
    assert(job.current_stage === "elaborate_spec", "image stage string did not round-trip");
    const found = findJobById(db, "img-smoke-insert");
    assert(found?.modality === "image", "findJobById did not round-trip image modality");
    assert(found.current_stage === "elaborate_spec", "findJobById did not preserve image stage");
    return [
      "Image-shaped insert accepted locales=en, modality=image, and current_stage=elaborate_spec.",
      "findJobById preserved the image modality and image stage string.",
    ];
  } finally {
    db.close();
  }
}

function runModalityUpdatePatchRoundtrip(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    insertJob(db, {
      id: "modality-update",
      week_key: "2028-W02",
      topic: "Update modality",
      status: "queued",
      current_stage: "research",
      created_at: 300,
      updated_at: 300,
    });

    const updated = updateJob(db, "modality-update", {
      modality: "image",
      updated_at: 301,
    });
    assert(updated.rowsAffected === 1, `expected 1 row, got ${updated.rowsAffected}`);
    const job = findJobById(db, "modality-update");
    assert(job?.modality === "image", "updateJob dropped modality patch");
    assert(job.updated_at === 301, "updateJob did not preserve companion patch");
    return [
      "updateJob accepted modality=image and changed the row.",
      "jobPatchColumns includes modality; the patch was not silently dropped.",
    ];
  } finally {
    db.close();
  }
}

function runModalityCasPatchRoundtrip(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    insertJob(db, {
      id: "modality-cas",
      week_key: "2028-W03",
      topic: "CAS modality",
      status: "queued",
      current_stage: "research",
      created_at: 400,
      updated_at: 400,
    });

    const ok = casUpdateJob(
      db,
      "modality-cas",
      { status: "queued", attemptNumber: 1 },
      { modality: "image", updated_at: 401 },
    );
    assert(ok.rowsAffected === 1, `expected matching CAS to affect 1 row, got ${ok.rowsAffected}`);
    assert(findJobById(db, "modality-cas")?.modality === "image", "CAS did not patch modality");

    const stale = casUpdateJob(
      db,
      "modality-cas",
      { status: "running", attemptNumber: 1 },
      { modality: "text_report", updated_at: 402 },
    );
    assert(stale.rowsAffected === 0, `expected stale CAS to affect 0 rows, got ${stale.rowsAffected}`);
    const afterStale = findJobById(db, "modality-cas");
    assert(afterStale?.modality === "image", "stale CAS changed modality");
    assert(afterStale.updated_at === 401, "stale CAS changed updated_at");
    return [
      "casUpdateJob accepted modality under the matching status/attempt guard.",
      "Stale CAS returned 0 and left modality unchanged.",
    ];
  } finally {
    db.close();
  }
}

function runModalityCheckConstraint(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    let thrown: unknown;
    try {
      insertJob(db, {
        id: "invalid-modality",
        week_key: "2028-W04",
        topic: "Invalid modality",
        modality: "video" as unknown as JobModality,
        status: "queued",
        current_stage: "research",
        created_at: 500,
        updated_at: 500,
      });
    } catch (err) {
      thrown = err;
    }

    assert(thrown instanceof DbConstraintError, "invalid modality did not map to DbConstraintError");
    assert(
      thrown.subcode === "SQLITE_CONSTRAINT_CHECK",
      `expected SQLITE_CONSTRAINT_CHECK, got ${thrown.subcode}`,
    );
    assert(thrown.columnHint === "modality", "expected modality column hint");
    return [
      "Invalid modality forced through insertJob failed closed.",
      "Constraint mapped to DbConstraintError with SQLITE_CONSTRAINT_CHECK.",
    ];
  } finally {
    db.close();
  }
}

function runModalityValuesMatchRegistry(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    assert(Modality.TEXT_REPORT === "text_report", "Modality.TEXT_REPORT drifted");
    assert(Modality.IMAGE === "image", "Modality.IMAGE drifted");
    insertJob(db, {
      id: "registry-text",
      week_key: "2028-W05",
      topic: "Registry text",
      modality: Modality.TEXT_REPORT,
      status: "queued",
      current_stage: "research",
      created_at: 600,
      updated_at: 600,
    });
    insertJob(db, {
      id: "registry-image",
      week_key: "img-smoke-registry",
      topic: "Registry image",
      locales: "en",
      modality: Modality.IMAGE,
      status: "queued",
      current_stage: "elaborate_spec",
      created_at: 601,
      updated_at: 601,
    });
    const values = db
      .query<{ modality: string }, []>("SELECT DISTINCT modality FROM jobs ORDER BY modality ASC")
      .all()
      .map((row) => row.modality);
    assert(
      JSON.stringify(values) === JSON.stringify(["image", "text_report"]),
      `unexpected modality values ${JSON.stringify(values)}`,
    );
    return [
      "DB accepted values match the Slice 1 Modality enum.",
      "Inserted text_report and image rows using Modality.TEXT_REPORT and Modality.IMAGE.",
    ];
  } finally {
    db.close();
  }
}

function runImageEventTypesPreserved(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    insertJob(db, {
      id: "image-events",
      week_key: "img-smoke-events",
      topic: "Image events",
      locales: "en",
      modality: "image",
      status: "running",
      current_stage: "judge",
      created_at: 700,
      updated_at: 700,
    });
    IMAGE_EVENT_TYPES.forEach((type, index) => {
      insertEvent(db, {
        job_id: "image-events",
        attempt_number: 1,
        type,
        payload: JSON.stringify({ index }),
        created_at: 710 + index,
      });
    });

    const events = findEventsByJob(db, "image-events");
    assert(
      JSON.stringify(events.map((event) => event.type)) === JSON.stringify(IMAGE_EVENT_TYPES),
      `event type order mismatch: ${JSON.stringify(events.map((event) => event.type))}`,
    );
    const judged = findEventsByJob(db, "image-events", "image_judged");
    assert(judged.length === 1, `expected one image_judged event, got ${judged.length}`);
    assert(judged[0]?.type === "image_judged", "type filter returned wrong event");
    return [
      "All five image lifecycle event strings were preserved through insertEvent.",
      "findEventsByJob type filtering returned only image_judged.",
    ];
  } finally {
    db.close();
  }
}

function runMigrationIdempotenceIncludes0003(dir: string): string[] {
  const db = openDb(resolve(dir, "content.db"));
  try {
    const rerun = runMigrations(db);
    assert(rerun.applied.length === 0, "expected rerun to apply no migrations");
    assert(
      rerun.skipped.includes("0003_jobs_modality.sql"),
      "expected rerun to skip 0003_jobs_modality.sql",
    );
    const rowCount = scalar<number>(
      db,
      "SELECT COUNT(*) AS value FROM _migrations WHERE filename = '0003_jobs_modality.sql'",
    );
    assert(rowCount === 1, `expected one 0003 migration row, got ${rowCount}`);
    return [
      "runMigrations rerun skipped already-applied 0003_jobs_modality.sql.",
      "_migrations contains exactly one row for 0003_jobs_modality.sql.",
    ];
  } finally {
    db.close();
  }
}

function runLegacyDbMigrationFrom00010002(dir: string): string[] {
  const migrationsDir = resolve(dir, "migrations");
  mkdirSync(migrationsDir, { recursive: true });
  writeRepoMigration(migrationsDir, "0001_initial.sql");
  writeRepoMigration(migrationsDir, "0002_jobs_purpose.sql");

  const db = openDb(resolve(dir, "content.db"), {
    migrate: false,
    migrationsDir,
  });

  try {
    const first = runMigrations(db, migrationsDir);
    assert(first.applied.includes("0001_initial.sql"), "custom 0001 did not apply");
    assert(first.applied.includes("0002_jobs_purpose.sql"), "custom 0002 did not apply");
    db.query(`
      INSERT INTO jobs (
        id, week_key, topic, status, current_stage, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "legacy-row",
      "2028-W06",
      "Legacy row",
      "queued",
      "research",
      800,
      800,
    );

    writeRepoMigration(migrationsDir, "0003_jobs_modality.sql");
    const second = runMigrations(db, migrationsDir);
    assert(second.applied.includes("0003_jobs_modality.sql"), "custom 0003 did not apply");
    const modality = scalar<string>(
      db,
      "SELECT modality AS value FROM jobs WHERE id = 'legacy-row'",
    );
    assert(modality === "text_report", `legacy row modality mismatch: ${modality}`);
    const job = findJobById(db, "legacy-row");
    assert(job?.modality === "text_report", "findJobById did not read back migrated modality");
    return [
      "Legacy 0001+0002 DB accepted a pre-0003 job row.",
      "Applying 0003 later backfilled the legacy row to text_report without data loss.",
    ];
  } finally {
    db.close();
  }
}

function writeRepoMigration(targetDir: string, filename: string): void {
  writeFileSync(
    resolve(targetDir, filename),
    readFileSync(resolve(repoRoot, "src", "migrations", filename), "utf8"),
  );
}

function scalar<T>(db: DbClient, sql: string): T {
  const row = db.query<Record<string, T>, []>(sql).get();
  assert(row !== null, `expected scalar row for ${sql}`);
  return Object.values(row)[0] as T;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? err.message;
  }
  return String(err);
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  const passCount = outcomes.filter((outcome) => outcome.status === "PASS").length;
  const lines = [
    "# db-modality-smoke",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Passed ${passCount}/${outcomes.length} scenarios.`,
    "",
    "| Scenario | Status | Evidence |",
    "|---|---|---|",
    ...outcomes.map(
      (outcome) =>
        `| ${outcome.name} | ${outcome.status} | ${outcome.details.join("<br>")} |`,
    ),
  ];

  mkdirSync(dirname(docPath), { recursive: true });
  writeFileSync(docPath, `${lines.join("\n").replace(/\n+$/, "")}\n`);
}

process.exit(await main());
