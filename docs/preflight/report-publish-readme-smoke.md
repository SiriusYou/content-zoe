# report-publish-readme smoke evidence

- Command: `bun run report-publish-readme-smoke`
- Started: 2026-05-14T04:54:37.365Z
- Finished: 2026-05-14T04:54:37.488Z
- Scenario root: /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-report-publish-readme-smoke-2026-05-14T04-54-37.365Z (removed by finally-cleanup)
- Result: 16/16 PASS

This smoke exercises the `report:publish-readme` README destination only. It does not run operator-only `bun run report:run`, real Codex report generation, real Telegram network, real git/process execution, Gateway/Market/Notion/X delivery, DB migrations beyond scenario setup, or preflight.

| Scenario | Status | Evidence |
|---|---:|---|
| report-publish-readme-missing-db | PASS | Missing DB exits 0 with exact NO_DATABASE stdout and creates no DB, README, or temp file. |
| report-publish-readme-invalid-command | PASS | Invalid arity, blank, flag-looking, and control-character job IDs fail before DB access. |
| report-publish-readme-unknown-job | PASS | Unknown job exits 1 with stable UNKNOWN_JOB stderr and no README mutation. |
| report-publish-readme-job-not-published | PASS | Non-published job exits 1 with stable JOB_NOT_PUBLISHED stderr. |
| report-publish-readme-missing-promoted-manifest | PASS | Published job without promoted manifest exits 1 with PUBLISH_MANIFEST_MISSING. |
| report-publish-readme-invalid-promoted-manifest | PASS | unparseable payload failed as PUBLISH_MANIFEST_INVALID before README mutation.<br>wrong job failed as PUBLISH_MANIFEST_INVALID before README mutation.<br>wrong attempt failed as PUBLISH_MANIFEST_INVALID before README mutation.<br>wrong artifact_dir failed as PUBLISH_MANIFEST_INVALID before README mutation.<br>missing sha256 failed as PUBLISH_MANIFEST_INVALID before README mutation.<br>null sha256 failed as PUBLISH_MANIFEST_INVALID before README mutation.<br>non-object sha256 failed as PUBLISH_MANIFEST_INVALID before README mutation.<br>non-string file entry failed as PUBLISH_MANIFEST_INVALID before README mutation.<br>invalid file path failed as PUBLISH_MANIFEST_INVALID before README mutation.<br>aggregate mismatch failed as PUBLISH_MANIFEST_INVALID before README mutation.<br>unsafe report path failed as PUBLISH_MANIFEST_INVALID before README mutation.<br>report outside artifact_dir failed as PUBLISH_MANIFEST_INVALID before README mutation.<br>report absent from manifest failed as PUBLISH_MANIFEST_INVALID before README mutation. |
| report-publish-readme-source-missing-or-unsafe | PASS | missing-artifact-dir failed before README mutation with PUBLISH_SOURCE_MISSING:<br>missing-manifest-file failed before README mutation with PUBLISH_SOURCE_MISSING:<br>missing-report-field-file failed before README mutation with PUBLISH_SOURCE_MISSING:<br>traversal-manifest-path failed before README mutation with PUBLISH_MANIFEST_INVALID:<br>final-file-symlink failed before README mutation with PUBLISH_MANIFEST_INVALID:<br>component-symlink failed before README mutation with PUBLISH_MANIFEST_INVALID:<br>non-file-manifest-path failed before README mutation with PUBLISH_SOURCE_MISSING: |
| report-publish-readme-append-section | PASS | README without markers gets heading, managed section, one row, and byte-exact stdout shape. |
| report-publish-readme-replace-section | PASS | Existing managed section is replaced while content before/after markers is preserved. |
| report-publish-readme-idempotent | PASS | Repeated publish returns status=idempotent and leaves README bytes unchanged. |
| report-publish-readme-multi-row-sort-update | PASS | Historical row is normalized/preserved, current row updates without duplication, and rows sort by week desc/job asc. |
| report-publish-readme-malformed-markers | PASS | duplicate-start failed with README_DESTINATION_INVALID and no mutation.<br>missing-end failed with README_DESTINATION_INVALID and no mutation.<br>missing-start failed with README_DESTINATION_INVALID and no mutation.<br>reversed failed with README_DESTINATION_INVALID and no mutation. |
| report-publish-readme-readme-path-safety | PASS | README symlink, README directory, and escaping symlink directory component fail before write. |
| report-publish-readme-field-safety | PASS | Current fields are escaped and a hostile pre-existing managed row is dropped/normalized, not preserved raw. |
| report-publish-readme-no-mutation | PASS | Success and idempotent paths leave jobs/events and source trees byte-identical.<br>Failure path leaves jobs/events/source tree unchanged and leaves no temp README files. |
| report-publish-readme-boundary-static-check | PASS | Cycle-scope boundary check ran in active-slice mode and saw changed files: docs/preflight/report-publish-readme-smoke.md, scripts/report-publish-readme-smoke.ts, src/lib/readme-publish-destination.ts.<br>Synthetic active-slice scope check rejects a real README.md implementation diff.<br>report-publish-readme.ts has no mutating DB helpers, DB write SQL, other CLI imports, network, Telegram, prompt/LLM, process, git, or preflight/Codex surface.<br>readme-publish-destination.ts has no DB write SQL, network, Telegram, prompt/LLM, git post-step, or local-delivery receipt/write surface. |
