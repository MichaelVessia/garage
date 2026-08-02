# Prowlarr Instructions

This context owns `packages/prowlarr` and `apps/prowlarr-cli` as one indexer/release integration.

## Read first

- [Prowlarr domain context](CONTEXT.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)

## Local constraints

- Keep Prowlarr API decoding, structured search construction, and indexer behavior in the package.
- Keep aliases, command parsing, next actions, confirmation policy, and live composition in the CLI app.
- Never queue application-indexer sync without preserving `--confirm-sync`.
- Preserve the shared CLI envelope, stdout/stderr, represented-failure, and exit-status contract.
- Use `@garage/prowlarr` across the workspace boundary.

## Validation

- Package: `bun run --filter '@garage/prowlarr' test`
- CLI: `bun run --filter '@garage/prowlarr-cli' test`
- Typecheck either workspace with its corresponding `typecheck` script.
- Before commit: `bun run validate`

Add a changeset when CLI behavior changes.
