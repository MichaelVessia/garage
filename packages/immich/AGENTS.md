# Immich Instructions

This context owns `packages/immich` and `apps/immich-cli` as one read-only Immich integration.

## Read first

- [Immich domain context](CONTEXT.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)

## Local constraints

- Keep Immich API decoding, authentication, and search fallback policy in the package.
- Preserve fallback distinctions: empty smart-search results and admin-user HTTP 403 are the only fallback triggers.
- Keep argv parsing, next actions, envelopes, and live composition in the CLI app.
- Preserve the shared CLI envelope, stdout/stderr, represented-failure, and exit-status contract.
- Use `@garage/immich` across the workspace boundary.

## Validation

- Package: `bun run --filter '@garage/immich' test`
- CLI: `bun run --filter '@garage/immich-cli' test`
- Typecheck either workspace with its corresponding `typecheck` script.
- Before commit: `bun run validate`

Add a changeset when CLI behavior changes.
