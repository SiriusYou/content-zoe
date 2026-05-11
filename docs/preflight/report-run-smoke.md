# report-run smoke evidence

- Command: `bun run report-run-smoke`
- Started: 2026-05-11T04:16:30.099Z
- Finished: 2026-05-11T04:16:30.499Z
- Scenario root: /Users/youjia/dev/content-zoe/.runs/report-run-smoke/2026-05-11T04-16-30.099Z (removed by finally-cleanup)

| Scenario | Result | Evidence |
|---|---:|---|
| happy-path | PASS | CLI path exited 0 with the fake-provider visibility log.<br>run-state.json reached awaiting_approval at translate_zh in attempt-1.<br>report.en.md contains the fake edit marker after edit_en.<br>report.zh.md is non-empty and contains the fake translation marker after translate_zh. |
| approval-summary-continuity | PASS | Seeded CLI run persisted a non-empty approval_summary with job-root run_dir and attempt-local report paths.<br>A completed resume stayed idempotent: no attempt-2 and the persisted approval_summary remained unchanged. |
| lifecycle-happy-path-db-audit | PASS | CLI happy path wrote ordered stage_enter/stage_complete pairs for all four stages.<br>Lifecycle payloads used exact key sets and excluded raw fake-provider output/body/prompt fields.<br>Research stage_complete and jobs.as_of shared the same durable completion timestamp. |
| lifecycle-failure-db-audit | PASS | Loop-level lifecycle callbacks wrote stage_enter for the failed edit_en stage.<br>The failed edit_en stage did not receive a stage_complete event. |
| default-llm-provider-when-unset | PASS | CLI path ran with LLM_PROVIDER absent from the child environment.<br>runtime-config defaulted to FakeProvider and emitted the fake-provider visibility log. |
| en-only-skip | PASS | FakeProvider omitted translate_zh, so an incorrect translation call would have failed.<br>locales=['en'] terminated after edit_en.<br>report.en.md contains the fake edit marker before awaiting approval.<br>report.zh.md remained absent for the en-only run. |
| stage-failure-mid-run | PASS | Missing edit_en canned prompt produced the same non-ok loop result the CLI maps to failure.<br>The composition-root exit-code branch maps that non-ok stage result to exit 2.<br>run-state.json recorded status=error and lastStage=edit_en. |
| resume-after-failure | PASS | Resume from failed edit_en started at edit_en; missing research/draft prompts were never called.<br>Atomic attempt-2 includes carry-forward files and recoveryCleanup audit data. |
| env-purity-static-check | PASS | Only runtime-config.ts reads process.env among the checked runtime files.<br>process.argv appears only in src/bin/report-run.ts.<br>src/bin/report-run.ts and src/lib/report-loop.ts contain no child_process or Bun.spawn references. |
| resume-carry-forward | PASS | Resume from ok research advanced to draft_en; missing research prompt was never called.<br>research/ and sources.json were copied into attempt-2 with fromAttempt/copiedFromAttempt/deletedFiles recorded.<br>A second resume was an already-complete no-op: no attempt-3, no bootstrap residue, no recoveryCleanup drift. |
| resume-after-success-idempotent | PASS | A completed job resumed as an idempotent no-op.<br>The resume path emitted already complete and did not create attempt-2. |
| resume-edge-cases | PASS | Missing job directory, empty job directory, missing run-state, corrupted JSON, and schema mismatch all failed with exit-class precondition errors. |
| carry-forward-partial-failure | PASS | Injected copy failure removed the bootstrap directory and left attempt-2 absent.<br>A subsequent resume still selected attempt-1 as highest and published attempt-2 successfully. |
| recovery-cleanup-db-audit | PASS | CLI resume with LLM_PROVIDER=fake wrote one recovery_cleanup event for attempt-2.<br>The event payload matched run-state.json recoveryCleanup fields.<br>A duplicate recordRecoveryCleanup call with the same job/attempt/payload left exactly one event row.<br>A cleanup resume without a DB jobs row failed before stage execution with an operator-readable recovery audit error. |
