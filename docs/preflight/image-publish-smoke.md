# image-publish-smoke

Generated: 2026-05-30T11:27:43.539Z

Result: 11/11 PASS

| Scenario | Status | Details |
|---|---|---|
| image-approve-publishes-gallery | PASS | Image approve published exactly the public four-file bundle under images/<jobId>/.<br>DB row and promoted event carry a manifest matching published bytes.<br>README gallery row was inserted without disturbing the report managed region. |
| image-approve-idempotent | PASS | Re-approve trusts the existing promoted manifest and leaves README bytes stable. |
| image-approve-gallery-failure-self-heals | PASS | Post-publish gallery failure records image_gallery_update_failed without rollback.<br>Re-approve self-heals README without a second promoted event. |
| image-approve-validation-excluded | PASS | Validation image artifacts publish, while gallery rows are excluded and stale rows self-heal away. |
| image-approve-purpose-fail-closed | PASS | Current image job purpose must be production or validation before publish mutates anything. |
| image-approve-source-validation | PASS | Image source validation rejects missing/symlinked/malformed/mismatched/failed inputs before mutation. |
| image-approve-divergence-refused | PASS | Existing divergent image destination is refused before DB or README mutation. |
| image-gallery-row-sanitizes-prompt | PASS | Prompt cell sanitization escapes markdown delimiters and truncates long text deterministically. |
| image-gallery-managed-region-fail-closed | PASS | Malformed gallery regions fail closed for README mutation while preserving the authoritative DB publish. |
| image-approve-git-failure-nonblocking | PASS | Git post-step failure records git_commit_failed and leaves the image published. |
| static-boundary | PASS | Frozen Slice 8 boundary ran in active-slice mode over changed files: docs/preflight/bot-smoke.md, docs/preflight/image-publish-smoke.md, package.json, scripts/bot-smoke.ts, scripts/image-publish-smoke.ts, src/lib/readme-image-gallery-destination.ts, src/promote.ts, src/telegram/commands.ts. |
