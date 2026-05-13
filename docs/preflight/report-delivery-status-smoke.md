# report-delivery-status smoke evidence

- Command: `bun run report-delivery-status-smoke`
- Started: 2026-05-13T03:14:41.793Z
- Finished: 2026-05-13T03:14:41.907Z
- Scenario root: /var/folders/77/w_yjdztn54lfvlt0drtcpx040000gn/T/cz-report-delivery-status-smoke-2026-05-13T03-14-41.793Z (removed by finally-cleanup)
- Result: 17/17 PASS

This smoke exercises the read-only `report:delivery-status` CLI surface only. It does not run operator-only `bun run report:run`, real Codex report generation, real Telegram network, real git/process execution, notifier sending, publish/promote mutation, DB migrations beyond scenario setup, or preflight.

| Scenario | Status | Evidence |
|---|---:|---|
| report-delivery-status-missing-db | PASS | Missing .data/content.db exits 0 with exact NO_DATABASE stdout and creates nothing. |
| report-delivery-status-invalid-command | PASS | Invalid arity, missing --dest, equals-form, and extra flags fail before DB access. |
| report-delivery-status-reverse-flag-order | PASS | Canonical and reverse flag order produce byte-identical status output. |
| report-delivery-status-invalid-destination | PASS | Absolute, traversal, flag-looking, control-character, protected-root, and symlink-escape destinations fail without mutation.<br>Slice 4.18 regressions out-link -> reports/deliveries and root-link -> ./reports/deliveries are rejected. |
| report-delivery-status-safe-alias-parity | PASS | Safe in-repo destination alias reports the same effective delivered_dir as report:deliver-local. |
| report-delivery-status-unknown-job | PASS | Unknown job exits 1 with stable UNKNOWN_JOB stderr. |
| report-delivery-status-job-not-published | PASS | Non-published job exits 1 with stable JOB_NOT_PUBLISHED stderr. |
| report-delivery-status-missing-promoted-manifest | PASS | Published job without promoted event exits 1 with PUBLISH_MANIFEST_MISSING. |
| report-delivery-status-invalid-promoted-manifest | PASS | unparseable payload failed as PUBLISH_MANIFEST_INVALID.<br>wrong job failed as PUBLISH_MANIFEST_INVALID.<br>wrong attempt failed as PUBLISH_MANIFEST_INVALID.<br>wrong artifact_dir failed as PUBLISH_MANIFEST_INVALID.<br>unsafe file path failed as PUBLISH_MANIFEST_INVALID.<br>aggregate mismatch failed as PUBLISH_MANIFEST_INVALID. |
| report-delivery-status-source-missing-or-diverged | PASS | Missing source artifact fails with PUBLISH_SOURCE_MISSING before destination status.<br>Source hash divergence fails with PUBLISH_MANIFEST_INVALID before destination status. |
| report-delivery-status-not-delivered | PASS | Missing destination root and missing delivered bundle report not_delivered without mkdir. |
| report-delivery-status-delivered | PASS | Matching receipt and delivered files report delivered with receipt=present and delivered_at. |
| report-delivery-status-diverged | PASS | missing-receipt reports diverged with receipt=missing.<br>invalid-receipt reports diverged with receipt=invalid.<br>mismatched-receipt reports diverged with receipt=mismatch.<br>missing-file reports diverged with receipt=mismatch.<br>hash-diverged-file reports diverged with receipt=mismatch. |
| report-delivery-status-delivered-symlink-escape | PASS | Symlink file at a manifest-listed path reports diverged/mismatch.<br>Symlink directory component escaping the bundle reports diverged/mismatch without mutating outside target. |
| report-delivery-status-field-safety | PASS | Tabs/newlines in receipt-derived fields are collapsed without injecting record separators. |
| report-delivery-status-read-only-no-mutation | PASS | Delivered, not_delivered, and diverged probes leave jobs/events byte-identical.<br>Source and destination tree snapshots remain unchanged across status inspection. |
| report-delivery-status-boundary-static-check | PASS | Cycle-scope boundary check ran in active-slice mode and saw changed files: package.json, src/lib/publish-destination.ts, docs/preflight/report-delivery-status-smoke.md, scripts/report-delivery-status-smoke.ts, src/bin/report-delivery-status.ts.<br>Synthetic active-slice scope check rejects out-of-scope Telegram product files.<br>report-delivery-status.ts has no mutating DB helpers, DB write SQL, other CLI imports, network, Telegram, prompt/LLM, process, git, or preflight/Codex surface.<br>New publish-destination inspection helper path contains no deliver/copy/temp/receipt-write/rm/rename calls while inherited Slice 4.18 delivery code remains recognized as pre-existing. |
