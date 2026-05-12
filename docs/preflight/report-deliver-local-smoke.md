# report-deliver-local smoke

Generated: 2026-05-12T02:16:59.353Z
Result: 31/31 PASS

| Scenario | Status | Details |
|---|---:|---|
| report-deliver-local-missing-db | PASS | Missing .data/content.db exits 0 with exact NO_DATABASE stdout and creates no DB. |
| report-deliver-local-invalid-missing-job-id | PASS | Invalid command ["--dest","outbox"] exits 1 with exact INVALID_COMMAND stderr. |
| report-deliver-local-invalid-missing-dest | PASS | Invalid command ["job-1"] exits 1 with exact INVALID_COMMAND stderr. |
| report-deliver-local-invalid-dest-equals-form | PASS | Invalid command ["job-1","--dest=outbox"] exits 1 with exact INVALID_COMMAND stderr. |
| report-deliver-local-reverse-flag-order | PASS | Canonical and reverse flag order both deliver successfully to isolated destinations. |
| report-deliver-local-invalid-absolute-dest | PASS | Destination ["deliver-1","--dest","/var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-report-deliver-local-smoke-2026-05-12T02-16-59.197Z/report-deliver-local-invalid-absolute-dest/abs"] fails with INVALID_DESTINATION: before delivery. |
| report-deliver-local-invalid-traversal-dest | PASS | Destination ["deliver-1","--dest","../escape"] fails with INVALID_DESTINATION: before delivery. |
| report-deliver-local-protected-destination-roots | PASS | All protected destination roots are rejected with INVALID_DESTINATION. |
| report-deliver-local-destination-equals-source | PASS | Destination resolving to the source artifact directory is rejected. |
| report-deliver-local-destination-symlink-escape | PASS | Existing destination symlink component escaping repo root is rejected. |
| report-deliver-local-destination-protected-root-symlink | PASS | Destination symlink components resolving inside protected roots are rejected. |
| report-deliver-local-destination-protected-root-parent-symlink | PASS | Destination symlink aliases to repo root cannot later enter protected roots. |
| report-deliver-local-unknown-job | PASS | Unknown job fails with stable UNKNOWN_JOB stderr. |
| report-deliver-local-job-not-published | PASS | Non-published job fails with stable JOB_NOT_PUBLISHED stderr. |
| report-deliver-local-missing-promoted-manifest | PASS | Published job without promoted event fails with manifest-missing error. |
| report-deliver-local-unparseable-promoted-manifest | PASS | Unparseable promoted payload fails with manifest-invalid error. |
| report-deliver-local-old-attempt-authority | PASS | Old-attempt promoted event is not selected as authority and mutates no destination. |
| report-deliver-local-mismatched-artifact-dir | PASS | Promoted manifest row mismatch fails before destination mutation. |
| report-deliver-local-mismatched-job-or-attempt | PASS | Promoted manifest row mismatch fails before destination mutation. |
| report-deliver-local-invalid-manifest-shape | PASS | Invalid manifest shape fails before destination mutation. |
| report-deliver-local-unsafe-artifact-dir | PASS | Unsafe jobs.artifact_dir fails before destination mutation. |
| report-deliver-local-unsafe-manifest-file-path | PASS | Unsafe manifest file path fails before destination mutation. |
| report-deliver-local-source-symlink-escape | PASS | Source symlink file is rejected before destination mutation. |
| report-deliver-local-success | PASS | Successful delivery copies manifest files only and writes deterministic receipt. |
| report-deliver-local-idempotent | PASS | Repeated delivery is idempotent and leaves the original receipt unchanged. |
| report-deliver-local-destination-divergence | PASS | Diverged destination fails and is not overwritten. |
| report-deliver-local-source-divergence | PASS | Source hash divergence fails before destination mutation. |
| report-deliver-local-partial-copy-cleanup-static | PASS | Static cleanup proof: temp bundle is verified before final rename, failures call cleanupTempDir, and retained temp naming uses .delivery-tmp- prefix. |
| report-deliver-local-field-safety | PASS | Success output is a single tab-delimited DELIVERY record with field-safe values. |
| report-deliver-local-read-only-no-mutation | PASS | Delivery leaves job row, events table, source bundle, and .runs absent/unchanged. |
| report-deliver-local-boundary-static-check | PASS | Cycle-scope boundary check ran in active-slice mode and saw changed files: docs/preflight/bot-smoke.md, docs/preflight/report-deliver-local-smoke.md, docs/preflight/report-list-smoke.md, docs/preflight/report-run-smoke.md, docs/preflight/report-status-smoke.md, scripts/report-deliver-local-smoke.ts, src/lib/publish-destination.ts.<br>package.json adds only report:deliver-local and report-deliver-local-smoke scripts with dependency sets unchanged.<br>Implementation contains no network, Telegram, prompt/LLM, git post-step, promote mutation, report-run/stage, migration, or DB mutation surface. |
