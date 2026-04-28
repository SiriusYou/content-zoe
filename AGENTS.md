# AGENTS.md

For current planning/governance context, see `CLAUDE.md`.

Runtime rules for the scaffolded content worker will replace this pointer when scaffolding lands, per `PLAN.md`.

## Runtime Pins

- Codex CLI: `>=0.125, <0.126`

This pin is operator-owned governance data, based on the Slice 1 smoke evidence in
`docs/preflight/codex-smoke.md`. Because `codex-cli` is pre-1.0, minor-version
bumps may change the `--json` event vocabulary; re-run `bun run codex-smoke`
before updating the pin.

## Execution Boundaries

`bun run report:run` is operator-only execution; hc-workers do not invoke it.

Recorded per Slice 3.5 cycle (cz-Claude r2 + cz-Codex r3 both APPROVE-WITH-AMENDMENTS-MET, 2026-04-28) with `auth_path=operator_only_execution`. The composition root reads operator Codex auth (`~/.codex/sessions`) and CLI-pinned config (`AGENTS.md` Codex CLI pin); hc-workers run in a different process context that does not have access to operator Codex auth, and granting them access is out of charter scope for v1. Real-Codex roundtrips for `report:run` therefore happen exclusively in the operator's session. hc-workers may verify, review, and validate slice drafts and implementations cross-repo, but they MUST NOT spawn `report:run` themselves. Future slices (Slice 3.7+ or follow-on) MAY revisit this if a sandbox-grant or separate per-content-zoe Codex auth path becomes operationally desirable.
