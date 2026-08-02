# Radarr Instructions

This context owns `packages/radarr` and `apps/radarr-cli` as one movie-library integration.

## Read first

- [Radarr domain context](CONTEXT.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)

## Local constraints

- Keep TMDB/Radarr identity resolution, root-folder/quality policy, and collection workflow in the package.
- Keep command parsing, next actions, confirmations, and live composition in the CLI app.
- Preserve both collection-add confirmation and the separate delete-files confirmation pair.
- Preserve the shared CLI envelope, stdout/stderr, represented-failure, and exit-status contract.
- Use `@garage/radarr` across the workspace boundary.

## Validation

- Package: `bun run --filter '@garage/radarr' test`
- CLI: `bun run --filter '@garage/radarr-cli' test`
- Typecheck either workspace with its corresponding `typecheck` script.
- Before commit: `bun run validate`

Add a changeset when CLI behavior changes.
