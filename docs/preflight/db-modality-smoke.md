# db-modality-smoke

Generated: 2026-05-28T20:12:08.066Z

Passed 9/9 scenarios.

| Scenario | Status | Evidence |
|---|---|---|
| modality-migration-default-text-report | PASS | 0003 migration, jobs.modality column, and idx_jobs_modality index are present.<br>Report-shaped insert without modality returned and stored text_report. |
| modality-image-insert | PASS | Image-shaped insert accepted locales=en, modality=image, and current_stage=elaborate_spec.<br>findJobById preserved the image modality and image stage string. |
| modality-update-patch-roundtrip | PASS | updateJob accepted modality=image and changed the row.<br>jobPatchColumns includes modality; the patch was not silently dropped. |
| modality-cas-patch-roundtrip | PASS | casUpdateJob accepted modality under the matching status/attempt guard.<br>Stale CAS returned 0 and left modality unchanged. |
| modality-check-constraint | PASS | Invalid modality forced through insertJob failed closed.<br>Constraint mapped to DbConstraintError with SQLITE_CONSTRAINT_CHECK. |
| modality-values-match-registry | PASS | DB accepted values match the Slice 1 Modality enum.<br>Inserted text_report and image rows using Modality.TEXT_REPORT and Modality.IMAGE. |
| image-event-types-preserved | PASS | All five image lifecycle event strings were preserved through insertEvent.<br>findEventsByJob type filtering returned only image_judged. |
| migration-idempotence-includes-0003 | PASS | runMigrations rerun skipped already-applied 0003_jobs_modality.sql.<br>_migrations contains exactly one row for 0003_jobs_modality.sql. |
| legacy-db-migration-from-0001-0002 | PASS | Legacy 0001+0002 DB accepted a pre-0003 job row.<br>Applying 0003 later backfilled the legacy row to text_report without data loss. |
