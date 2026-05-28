# AGENTS.md

For current governance context, read `PLAN.md` and `ROLE_POSITIONING.md` first.
`CLAUDE.md` is retained as historical pre-bootstrap planning guidance and is not
current authority when it conflicts with `AGENTS.md`, `PLAN.md`, or
`ROLE_POSITIONING.md`.

## Runtime Pins

- Codex CLI: `>=0.125, <0.126`

This pin is operator-owned governance data, based on the Slice 1 smoke evidence in
`docs/preflight/codex-smoke.md`. Because `codex-cli` is pre-1.0, minor-version
bumps may change the `--json` event vocabulary; re-run `bun run codex-smoke`
before updating the pin.

## Execution Boundaries

`bun run report:run` is operator-only execution; hc-workers do not invoke it.

Recorded per Slice 3.5 cycle (cz-Claude r2 + cz-Codex r3 both APPROVE-WITH-AMENDMENTS-MET, 2026-04-28) with `auth_path=operator_only_execution`. The composition root reads operator Codex auth (`~/.codex/sessions`) and CLI-pinned config (`AGENTS.md` Codex CLI pin); hc-workers run in a different process context that does not have access to operator Codex auth, and granting them access is out of charter scope for v1. Real-Codex roundtrips for `report:run` therefore happen exclusively in the operator's session. hc-workers may verify, review, and validate slice drafts and implementations cross-repo, but they MUST NOT spawn `report:run` themselves. Future slices (Slice 3.7+ or follow-on) MAY revisit this if a sandbox-grant or separate per-content-zoe Codex auth path becomes operationally desirable.

`bun run content:image-run` is also operator-only execution. It will use real image-generation and vision-judge provider credentials from the operator session; hc-workers may implement the command and run hermetic smokes with fake image and judge providers, but they MUST NOT invoke real-provider `content:image-run`.

## Operator Runbook Contract

Create jobs with explicit reader intent before running them:

```bash
bun run report:create --week 2026-W26 --topic "AI in healthcare - weekly" --purpose production
LLM_PROVIDER=codex bun run report:run 2026-W26-ai-trends --locales=en,zh
```

Validation runs use the same shape with `--purpose validation`.

```bash
bun run report:create --week 2026-W26 --topic "Validation run" --purpose validation
LLM_PROVIDER=codex bun run report:run 2026-W26-ai-trends --locales=en,zh
```

The `report:run` positional id must exactly match the id derived by
`report:create`: `<week>-ai-trends`. If the run id is mistyped, `report:run`
can produce filesystem artifacts without advancing a DB job to
`awaiting_approval`.
