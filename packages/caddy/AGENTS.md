# Caddy Instructions

This context owns `packages/caddy` and `apps/caddy-cli` as one Caddy administration integration.

## Read first

- [Caddy domain context](CONTEXT.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)

## Local constraints

- Keep Caddy admin API mapping in the package and candidate-file I/O at the CLI/platform boundary.
- Preserve recursive upstream discovery and JSON-object decoding.
- Never read or submit a reload candidate before the explicit `--confirm-reload` gate.
- Preserve the shared CLI envelope, stdout/stderr, represented-failure, and exit-status contract.
- Use `@garage/caddy` across the workspace boundary.

## Validation

- Package: `bun run --filter '@garage/caddy' test`
- CLI: `bun run --filter '@garage/caddy-cli' test`
- Typecheck either workspace with its corresponding `typecheck` script.
- Before commit: `bun run validate`

Add a changeset when CLI behavior changes.
