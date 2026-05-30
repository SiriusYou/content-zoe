# content-image-cli-smoke

Generated: 2026-05-30T10:50:26.199Z

Result: 10/10 PASS

| Scenario | Status | Details |
|---|---:|---|
| create-deterministic | PASS | content:image-create produced deterministic img-20270101-010203.<br>attempt-1/request.txt contains the raw prompt. |
| duplicate-key | PASS | duplicate image key fails as KEY_ALREADY_EXISTS. |
| fake-run-awaiting-approval | PASS | fake content:image-run reached awaiting_approval.<br>approval_summary is non-empty and notifier-compatible.<br>report-specific artifact columns stayed null. |
| show-artifacts | PASS | content:image-show prints request/spec/verdict text.<br>image artifact prints metadata with sha256 and dimensions, not binary bytes. |
| regen-event-payload | PASS | image_regen persisted exact payload keys { regenRound, fromStage }. |
| auto-gate-event-payload | PASS | did_not_pass_auto_gate persisted exact payload keys { reason, regenRound }. |
| reject-carry-forward | PASS | rejected image attempt carried request/spec forward before starting at generate. |
| resume-no-mutation | PASS | --resume returns IMAGE_RESUME_NOT_IMPLEMENTED with no DB, attempt, or provider side effects. |
| mixed-provider-fail-closed | PASS | mixed fake/real provider mode fails before provider construction or stage execution. |
| static-boundary | PASS | frozen diff from 0909a7b..24fcb93 only touches declared Slice 7b files.<br>working-tree boundary included 22 untracked files and explicitly excluded 22 pre-existing W22/W23 report files from the handback set.<br>No real provider smoke or Slice 8 publish files are part of the diff. |
