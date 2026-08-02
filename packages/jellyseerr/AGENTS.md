# Jellyseerr Instructions

This context owns `packages/jellyseerr` and `apps/jellyseerr-cli` as one media-request integration.

## Read first

- [Jellyseerr domain context](CONTEXT.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)

## Local constraints

- Keep Jellyseerr API decoding and request operations in the package; do not call downstream services directly.
- Keep command filters, next actions, confirmation policy, and live composition in the CLI app.
- Preserve separate confirmation gates for approve, decline, and delete.
- Preserve the shared CLI envelope, stdout/stderr, represented-failure, and exit-status contract.
- Use `@garage/jellyseerr` across the workspace boundary.

## Validation

- Package: `bun run --filter '@garage/jellyseerr' test`
- CLI: `bun run --filter '@garage/jellyseerr-cli' test`
- Typecheck either workspace with its corresponding `typecheck` script.
- Before commit: `bun run validate`

Add a changeset when CLI behavior changes.
