# SABnzbd Instructions

This context owns `packages/sabnzbd` and `apps/sabnzbd-cli` as one download-queue integration.

## Read first

- [SABnzbd domain context](CONTEXT.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)

## Local constraints

- Keep SABnzbd query-protocol mapping, action decoding, and count normalization in the package.
- Keep command parsing, next actions, destructive confirmation, and live composition in the CLI app.
- Preserve the separate `--files` plus `--confirm-delete-files` safety contract.
- Preserve the shared CLI envelope, stdout/stderr, represented-failure, and exit-status contract.
- Use `@garage/sabnzbd` across the workspace boundary.

## Validation

- Package: `bun run --filter '@garage/sabnzbd' test`
- CLI: `bun run --filter '@garage/sabnzbd-cli' test`
- Typecheck either workspace with its corresponding `typecheck` script.
- Before commit: `bun run validate`

Add a changeset when CLI behavior changes.
