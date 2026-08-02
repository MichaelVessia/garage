# Jellyfin Instructions

This context owns `packages/jellyfin` and `apps/jellyfin-cli` as one Jellyfin integration.

## Read first

- [Jellyfin domain context](CONTEXT.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)

## Local constraints

- Keep Jellyfin API decoding, enabled-user selection, and task execution in the package.
- Keep command parsing, next actions, and live composition in the CLI app.
- Never start a scheduled task without preserving the explicit `--confirm-run-task` gate.
- Preserve the shared CLI envelope, stdout/stderr, represented-failure, and exit-status contract.
- Use `@garage/jellyfin` across the workspace boundary.

## Validation

- Package: `bun run --filter '@garage/jellyfin' test`
- CLI: `bun run --filter '@garage/jellyfin-cli' test`
- Typecheck either workspace with its corresponding `typecheck` script.
- Before commit: `bun run validate`

Add a changeset when CLI behavior changes.
