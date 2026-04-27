# AGENTS.md

For current planning/governance context, see `CLAUDE.md`.

Runtime rules for the scaffolded content worker will replace this pointer when scaffolding lands, per `PLAN.md`.

## Runtime Pins

- Codex CLI: `>=0.125, <0.126`

This pin is operator-owned governance data, based on the Slice 1 smoke evidence in
`docs/preflight/codex-smoke.md`. Because `codex-cli` is pre-1.0, minor-version
bumps may change the `--json` event vocabulary; re-run `bun run codex-smoke`
before updating the pin.
