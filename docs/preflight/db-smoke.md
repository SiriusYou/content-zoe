# DB Smoke Evidence

Generated: 2026-05-17T03:58:06.839Z

## Command

```bash
bun run db:smoke
```

## Evidence Ceiling

This smoke exercises the local SQLite persistence surface only. It does not run operator-only `bun run report:run`, real Codex report generation, Telegram flows, browser checks, or future composition-root wiring.

## Scenario Results

Passed 10/10 scenarios.

| Scenario | Status | Evidence |
|---|---|---|
| open-pragmas | PASS | openDb applied WAL, busy_timeout=5000, synchronous=NORMAL, and foreign_keys=ON.<br>WAL verification succeeded after the PRAGMAs were applied. |
| migration-idempotence-static-begin | PASS | runMigrations was idempotent and stored one SHA-256 row for 0001_initial.sql.<br>F3 static check found explicit BEGIN IMMEDIATE/COMMIT/ROLLBACK and no Database.transaction use. [BEGIN IMMEDIATE confirmed in source] |
| migration-sha-mismatch | PASS | A modified applied migration was refused.<br>DbMigrationError.errorCode was MIGRATION_SHA_MISMATCH with expectedSha and actualSha evidence. |
| jobs-crud | PASS | insertJob/findJobById/findJobsByStatus/updateJob preserved typed job fields.<br>Duplicate week_key surfaced DbConstraintError.subcode=SQLITE_CONSTRAINT_UNIQUE with table/column hints. |
| events-append-fk | PASS | insertEvent/findEventsByJob preserved payload as a string and supported type filtering.<br>F6 foreign-key violation surfaced DbConstraintError.subcode=SQLITE_CONSTRAINT_FOREIGNKEY. |
| stage-lifecycle | PASS | recordStageEnter guarded the current attempt, wrote exact stage_enter payload, and updated running/current_stage.<br>recordResearchStageComplete atomically wrote research stage_complete plus jobs.as_of.<br>recordStageComplete guarded event-only boundaries without broad job mutation.<br>Wrong-attempt lifecycle writes failed with LIFECYCLE_PERSISTENCE_FAILED and left no event/as_of split-brain. |
| cas-semantics | PASS | casUpdateJob returned rowsAffected=1 for a matching status plus attempt_number guard.<br>casUpdateJob returned rowsAffected=0 and did not mutate after status/attempt_number drift. |
| resume-bootstrap-lifecycle | PASS | bootstrapResumeAttemptLifecycle atomically advanced jobs.attempt_number/current_stage/status and wrote recovery_cleanup.<br>A matching duplicate bootstrap returned the existing cleanup row and did not duplicate events.<br>recordStageEnter remained a strict post-bootstrap guard for attempt-2.<br>Stale bootstrap rollback left no event, and divergent cleanup was rejected before jobs row transition. |
| recovery-cleanup | PASS | recordRecoveryCleanup serialized the Slice 3.5 recoveryCleanup object into events only.<br>F4 sequential duplicate recovery_cleanup returned the existing row only when the payload matched.<br>Divergent recovery_cleanup for the same job/attempt was rejected with LIFECYCLE_PERSISTENCE_FAILED.<br>F6 Test #7(b) launched two separate connections/processes with matching payloads; partial UNIQUE enforcement left exactly one row and both callers returned it. |
| wal-concurrent-reader | PASS | A second connection read a stable pre-commit snapshot while a writer held BEGIN IMMEDIATE.<br>The reader observed the committed update after COMMIT. |

