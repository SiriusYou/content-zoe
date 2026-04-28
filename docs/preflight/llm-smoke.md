# LLM Provider Smoke - Evidence Report

**Slice:** cz Slice 2 (Phase 4.1) LLM provider scaffold
**Generated:** 2026-04-28T04:06:04.705Z
**Codex CLI version:** `codex-cli 0.125.0`

## Outcome Matrix

| Scenario | Status | Lifecycle | Quiet |
|---|---:|---|---:|
| `fake` | PASS | - | - |
| `codex-cli` | FAIL | - | - |
| `codex-cli-force-timeout` | PASS | `soft-only` | `true` |
| `codex-cli-force-hard-kill` | PASS | `soft+hard-kill` | `true` |

## Scenario Evidence

### fake

- Command: `bun run llm-smoke --provider fake`
- Status: PASS
- Started: 2026-04-28T04:05:52.310Z
- Finished: 2026-04-28T04:05:52.310Z
- Evidence: One FakeProvider handled two canned prompts.
- Evidence: No subprocess, filesystem write, or network path is used by FakeProvider.
### codex-cli

- Command: `bun run llm-smoke --provider codex-cli`
- Status: FAIL
- Started: 2026-04-28T04:05:52.310Z
- Finished: 2026-04-28T04:05:52.987Z
- Error kind: `exit`
- Transcript directory: `/Users/youjia/.openclaw-worktrees/BY63DMkLHmKYZwLjfCzWo/target/.runs/2026-04-28T04-05-52-377Z`
- Evidence: LLMProviderError(kind=exit, transcriptDir=/Users/youjia/.openclaw-worktrees/BY63DMkLHmKYZwLjfCzWo/target/.runs/2026-04-28T04-05-52-377Z): codex exited with code 1 stderrTail="b84a8c784.1777298441017658000.sh: Custom { kind: Other, error: \"background task failed\" }\n2026-04-28T04:05:52.983270Z  WARN codex_rollout::list: state db discrepancy during find_thread_path_by_id_str_in_subdir: falling_back\n2026-04-28T04:05:52.983287Z  WARN codex_core::shell_snapshot: Failed to check rollout age for snapshot /Users/youjia/.codex/shell_snapshots/019dc502-65ea-73c0-bffa-238ec99ff8df.1777342295291870000.sh: Custom { kind: Other, error: \"background task failed\" }\nError: thread/start: thread/start failed: error creating thread: Fatal error: Codex cannot access session files at /Users/youjia/.codex/sessions (permission denied). If sessions were created using sudo, fix ownership: sudo chown -R $(whoami) /Users/youjia/.codex (underlying error: Operation not permitted (os error 1))"
### codex-cli-force-timeout

- Command: `bun run llm-smoke --provider codex-cli --force-timeout`
- Status: PASS
- Started: 2026-04-28T04:05:52.987Z
- Finished: 2026-04-28T04:05:53.695Z
- Error kind: `timeout`
- Timeout lifecycle: `soft-only`
- Quiescence quiet: `true`
- Transcript directory: `/Users/youjia/.openclaw-worktrees/BY63DMkLHmKYZwLjfCzWo/target/.runs/2026-04-28T04-05-52-987Z`
- Evidence: Observed expected timeout classification: PARTIAL soft-only.
- Evidence: Lifecycle marker: soft-only.
- Evidence: Quiescence was quiet after the timeout path.
### codex-cli-force-hard-kill

- Command: `bun run llm-smoke --provider codex-cli --force-hard-kill`
- Status: PASS
- Started: 2026-04-28T04:05:53.695Z
- Finished: 2026-04-28T04:06:04.705Z
- Error kind: `timeout`
- Timeout lifecycle: `soft+hard-kill`
- Quiescence quiet: `true`
- Transcript directory: `/Users/youjia/.openclaw-worktrees/BY63DMkLHmKYZwLjfCzWo/target/.runs/2026-04-28T04-05-53-695Z`
- Evidence: Controlled child ignored SIGTERM.
- Evidence: Provider escalated to process-group SIGKILL after the 10 second grace window.
- Evidence: Quiescence was quiet after hard kill.

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
