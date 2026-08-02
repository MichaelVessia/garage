# AdGuard Home Instructions

This context owns `packages/adguard` and `apps/adguard-cli` as one integration: a typed AdGuard Home domain/adapter plus its executable edge.

## Read first

- [AdGuard Home domain context](CONTEXT.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)

## Local constraints

- Keep `/control` wire decoding and Basic authentication in the package adapter.
- Keep argv parsing, next actions, envelope rendering, and live layer composition in the CLI app.
- Never toggle global protection without preserving the explicit `--confirm-toggle` gate.
- Preserve the shared CLI envelope, stdout/stderr, represented-failure, and exit-status contract.
- Use `@garage/adguard` across the workspace boundary; do not import package internals relatively.

## Validation

- Package: `bun run --filter '@garage/adguard' test`
- CLI: `bun run --filter '@garage/adguard-cli' test`
- Typecheck either workspace with its corresponding `typecheck` script.
- Before commit: `bun run validate`

Add a changeset when CLI behavior changes.
