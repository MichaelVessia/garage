# Tailscale Instructions

This context owns `packages/tailscale` and `apps/tailscale-cli` as one read-only local-tailnet integration.

## Read first

- [Tailscale domain context](CONTEXT.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)

## Local constraints

- Keep Tailscale protocol sequencing/decoding in the package and Bun process spawning/discovery in the app.
- Preserve the two honest seams: `TailscaleProcess` for execution and `TailscaleApi` for daemon/protocol policy.
- Do not add mutating Tailscale commands without an explicit domain and safety decision.
- Preserve the shared CLI envelope, stdout/stderr, represented-failure, and exit-status contract.
- Use `@garage/tailscale` across the workspace boundary.

## Validation

- Package: `bun run --filter '@garage/tailscale' test`
- CLI: `bun run --filter '@garage/tailscale-cli' test`
- Typecheck either workspace with its corresponding `typecheck` script.
- Before commit: `bun run validate`

Add a changeset when CLI behavior changes.
