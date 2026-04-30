# DB Smoke Evidence

Generated: 2026-04-30T02:31:53.390Z

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
| migration-idempotence-static-begin | PASS | runMigrations was idempotent and stored one SHA-256 row for 0001_initial.sql.<br>F3 static check found explicit BEGIN IMMEDIATE/COMMIT/ROLLBACK and no Database.transaction use. [BEGIN IMMEDIATE confirmed in source] |
| migration-sha-mismatch | PASS | A modified applied migration was refused.<br>DbMigrationError.errorCode was MIGRATION_SHA_MISMATCH with expectedSha and actualSha evidence. |
| jobs-crud | PASS | insertJob/findJobById/findJobsByStatus/updateJob preserved typed job fields.<br>Duplicate week_key surfaced DbConstraintError.subcode=SQLITE_CONSTRAINT_UNIQUE with table/column hints. |
| events-append-fk | PASS | insertEvent/findEventsByJob preserved payload as a string and supported type filtering.<br>F6 foreign-key violation surfaced DbConstraintError.subcode=SQLITE_CONSTRAINT_FOREIGNKEY. |
| cas-semantics | PASS | casUpdateJob returned rowsAffected=1 for a matching status plus attempt_number guard.<br>casUpdateJob returned rowsAffected=0 and did not mutate after status/attempt_number drift. |
| recovery-cleanup | PASS | recordRecoveryCleanup serialized the Slice 3.5 recoveryCleanup object into events only.<br>F4 sequential duplicate recovery_cleanup returned the existing row and did not change the payload.<br>F6 Test #7(b) launched two separate connections/processes; partial UNIQUE enforcement left exactly one row and the duplicate path returned the existing row. |
| wal-concurrent-reader | PASS | A second connection read a stable pre-commit snapshot while a writer held BEGIN IMMEDIATE.<br>The reader observed the committed update after COMMIT. |

