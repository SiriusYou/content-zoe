# DB Smoke Evidence

Generated: 2026-04-30T01:23:41.147Z

## Command

```bash
bun run db:smoke
```

## Evidence Ceiling

This smoke exercises the local SQLite persistence surface only. It does not run operator-only `bun run report:run`, real Codex report generation, Telegram flows, browser checks, or future composition-root wiring.

## Scenario Results

Passed 8/8 scenarios.

| Scenario | Status | Evidence |
|---|---|---|
| open-pragmas | PASS | openDb applied WAL, busy_timeout=5000, synchronous=NORMAL, and foreign_keys=ON.<br>WAL verification succeeded after the PRAGMAs were applied. |
| migration-idempotence-static-begin | PASS | runMigrations was idempotent and stored one SHA-256 row for 0001_initial.sql.<br>F3 static check found explicit BEGIN IMMEDIATE/COMMIT/ROLLBACK and no Database.transaction use. |
| migration-sha-mismatch | PASS | A modified applied migration was refused.<br>DbMigrationError.errorCode was MIGRATION_SHA_MISMATCH. |
| jobs-crud | PASS | createJob/getJob/getJobByWeekKey/updateJob preserved typed job fields.<br>Duplicate week_key surfaced DbConstraintError.subcode=DUPLICATE_WEEK_KEY. |
| events-append-fk | PASS | appendEvent/listEventsForJob preserved payload as a string.<br>F6 foreign-key violation surfaced DbConstraintError.subcode=FK_JOB_NOT_FOUND. |
| cas-semantics | PASS | casUpdateJob returned rowsAffected=1 for a matching updated_at guard.<br>casUpdateJob returned rowsAffected=0 and did not mutate on a stale guard. |
| recovery-cleanup | PASS | recordRecoveryCleanup wrote the audit payload only to events.<br>F4 duplicate recovery_cleanup returned the existing row and did not change the payload. |
| wal-concurrent-reader | PASS | A second connection read a stable pre-commit snapshot while a writer held BEGIN IMMEDIATE.<br>The reader observed the committed update after COMMIT. |

