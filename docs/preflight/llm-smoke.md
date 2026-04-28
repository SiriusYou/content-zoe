# LLM Provider Smoke - Evidence Report

**Slice:** cz Slice 2 (Phase 4.1) LLM provider scaffold
**Generated:** 2026-04-28T05:02:56.442Z
**Codex CLI version:** `codex-cli 0.125.0`

## Outcome Matrix

| Scenario | Status | Lifecycle | Quiet |
|---|---:|---|---:|
| `fake` | PASS | - | - |
| `codex-cli` (worker-context, original) | FAIL | - | - |
| `codex-cli` | PASS | - | - |
| `codex-cli` (operator rerun) | PASS | - | - |
| `codex-cli-force-timeout` | PASS | `soft-only` | `true` |
| `codex-cli-force-hard-kill` | PASS | `soft+hard-kill` | `true` |
| `synthetic-no-turn-completed` | PASS | - | - |
| `synthetic-error-event` | PASS | - | - |

## Scenario Evidence

### fake

- Command: `bun run llm-smoke --provider fake`
- Status: PASS
- Started: 2026-04-28T05:01:33.392Z
- Finished: 2026-04-28T05:01:33.392Z
- Evidence: One FakeProvider handled two canned prompts.
- Evidence: No subprocess, filesystem write, or network path is used by FakeProvider.
### codex-cli (worker-context, original)

- Command: `bun run llm-smoke --provider codex-cli`
- Status: FAIL
- Started: 2026-04-28T04:05:52.310Z
- Finished: 2026-04-28T04:05:52.987Z
- Error kind: `exit`
- Execution context: worker context before the operator rerun; retained as audit evidence for the known worker-context Codex session-permission constraint.
- Transcript directory: `/Users/youjia/.openclaw-worktrees/BY63DMkLHmKYZwLjfCzWo/target/.runs/2026-04-28T04-05-52-377Z`
- Evidence: LLMProviderError(kind=exit, transcriptDir=/Users/youjia/.openclaw-worktrees/BY63DMkLHmKYZwLjfCzWo/target/.runs/2026-04-28T04-05-52-377Z): codex exited with code 1 stderrTail="b84a8c784.1777298441017658000.sh: Custom { kind: Other, error: \"background task failed\" }\n2026-04-28T04:05:52.983270Z  WARN codex_rollout::list: state db discrepancy during find_thread_path_by_id_str_in_subdir: falling_back\n2026-04-28T04:05:52.983287Z  WARN codex_core::shell_snapshot: Failed to check rollout age for snapshot /Users/youjia/.codex/shell_snapshots/019dc502-65ea-73c0-bffa-238ec99ff8df.1777342295291870000.sh: Custom { kind: Other, error: \"background task failed\" }\nError: thread/start: thread/start failed: error creating thread: Fatal error: Codex cannot access session files at /Users/youjia/.codex/sessions (permission denied). If sessions were created using sudo, fix ownership: sudo chown -R $(whoami) /Users/youjia/.codex (underlying error: Operation not permitted (os error 1))"
### codex-cli

- Command: `bun run llm-smoke --provider codex-cli`
- Status: PASS
- Started: 2026-04-28T05:01:33.392Z
- Finished: 2026-04-28T05:02:44.721Z
- Transcript directory: `/Users/youjia/.openclaw-worktrees/BY63DMkLHmKYZwLjfCzWo/target/.runs/2026-04-28T05-02-12-677Z`
- Evidence: One CodexCliProvider handled two trivial prompts.
- Evidence: Both responses were non-empty: lengths 38 and 36.
- Evidence: _getSpawnCount() delta was 1 across both prompts; preflight remained process-memoized.
### codex-cli (operator rerun)

- Command: `bun run llm-smoke --provider codex-cli`
- Status: PASS
- Started: 2026-04-28T05:03:09.997Z
- Finished: 2026-04-28T05:04:22.005Z
- Execution context: operator shell from `/Users/youjia/.openclaw-worktrees/BY63DMkLHmKYZwLjfCzWo/target` with access to `/Users/youjia/.codex/sessions`
- Transcript directory: `/Users/youjia/.openclaw-worktrees/BY63DMkLHmKYZwLjfCzWo/target/.runs/2026-04-28T05-03-40-632Z`
- Evidence: One CodexCliProvider handled two trivial prompts.
- Evidence: Both responses were non-empty: lengths 39 and 40.
- Evidence: `_getSpawnCount() delta was 1` across both prompts; parser still extracted real Codex agent_message text after turn.completed gating.
- Gate 2 HOLD disposition: FOLDED for real Codex success-path parser regression check after parser hardening.

### codex-cli-force-timeout

- Command: `bun run llm-smoke --provider codex-cli --force-timeout`
- Status: PASS
- Started: 2026-04-28T05:02:44.722Z
- Finished: 2026-04-28T05:02:45.430Z
- Error kind: `timeout`
- Timeout lifecycle: `soft-only`
- Quiescence quiet: `true`
- Transcript directory: `/Users/youjia/.openclaw-worktrees/BY63DMkLHmKYZwLjfCzWo/target/.runs/2026-04-28T05-02-44-722Z`
- Evidence: Observed expected timeout classification: PARTIAL soft-only.
- Evidence: Lifecycle marker: soft-only.
- Evidence: Quiescence was quiet after the timeout path.
### codex-cli-force-hard-kill

- Command: `bun run llm-smoke --provider codex-cli --force-hard-kill`
- Status: PASS
- Started: 2026-04-28T05:02:45.430Z
- Finished: 2026-04-28T05:02:56.440Z
- Error kind: `timeout`
- Timeout lifecycle: `soft+hard-kill`
- Quiescence quiet: `true`
- Transcript directory: `/Users/youjia/.openclaw-worktrees/BY63DMkLHmKYZwLjfCzWo/target/.runs/2026-04-28T05-02-45-430Z`
- Evidence: Controlled child ignored SIGTERM.
- Evidence: Provider escalated to process-group SIGKILL after the 10 second grace window.
- Evidence: Quiescence was quiet after hard kill.
### synthetic-no-turn-completed

- Command: `bun run llm-smoke`
- Status: PASS
- Started: 2026-04-28T05:02:56.440Z
- Finished: 2026-04-28T05:02:56.441Z
- Error kind: `parse`
- Evidence: Parser rejected agent_message text when the stream lacked turn.completed.
- Evidence: Failure kind was LLMProviderError(kind=parse).
### synthetic-error-event

- Command: `bun run llm-smoke`
- Status: PASS
- Started: 2026-04-28T05:02:56.441Z
- Finished: 2026-04-28T05:02:56.441Z
- Error kind: `parse`
- Evidence: Parser rejected a stream containing an error event before returning any agent_message text.
- Evidence: Failure kind was LLMProviderError(kind=parse), and the error message preserved the Codex error text.

## Timeout Lifecycle Classification

The real Codex timeout path reported `soft-only`, classified as PARTIAL soft-only, with quiescence quiet = `true`.

## Controlled Hard-Kill Proof

The controlled child installed a SIGTERM handler that does not exit, so the provider had to escalate from process-group SIGTERM to process-group SIGKILL. The resulting `LLMProviderError(kind="timeout")` carried lifecycle `soft+hard-kill`, and post-kill quiescence was quiet.

## Slice 3+ Handoff Notes

- `LLM_PROVIDER` remains a Slice 3+ composition-root concern. This slice does not add provider selection or a factory.
- `CZ_LLM_QUIESCE_MS` remains a Slice 3+ composition-root concern. `CodexCliProvider` accepts `quiesceWindowMs` directly and does not read environment variables.
- Slice 3 can consume `LLMProvider.runPrompt(prompt, cwd, timeoutMs)` without coupling pipeline stages to Codex CLI lifecycle details.

## Review Gate Reminder

- Gate 1 requires hc-Claude process discipline plus hc-Codex adversarial implementation review.
- Gate 2 requires cz-Claude implementation intent review plus cz-Codex adversarial review, with both Gate 2 verdicts `APPROVE` or `APPROVE-WITH-AMENDMENTS-MET` before operator merge.
