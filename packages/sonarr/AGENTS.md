# Sonarr Instructions

This context owns `packages/sonarr` and `apps/sonarr-cli` as one television-library integration.

## Read first

- [Sonarr domain context](CONTEXT.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)

## Local constraints

- Keep TVDB/Sonarr identity resolution, root-folder/quality policy, and episode enrichment in the package.
- Keep command parsing, next actions, confirmations, and live composition in the CLI app.
- Preserve the separate delete-files confirmation pair.
- Preserve the shared CLI envelope, stdout/stderr, represented-failure, and exit-status contract.
- Use `@garage/sonarr` across the workspace boundary.

## Validation

- Package: `bun run --filter '@garage/sonarr' test`
- CLI: `bun run --filter '@garage/sonarr-cli' test`
- Typecheck either workspace with its corresponding `typecheck` script.
- Before commit: `bun run validate`

Add a changeset when CLI behavior changes.
