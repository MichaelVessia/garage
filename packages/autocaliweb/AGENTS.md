# AutoCaliWeb Instructions

This context owns `packages/autocaliweb`, `apps/autocaliweb-cli`, and the AutoCaliWeb tools under `apps/garage-mcp` as one read-only ebook-catalog integration.

## Read first

- [AutoCaliWeb domain context](CONTEXT.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)

## Local constraints

- Keep OPDS XML parsing and JSON wire translation in the package.
- Preserve book-versus-navigation classification and relative-link normalization.
- Keep argv parsing, next actions, envelopes, and CLI composition in the CLI app while it exists.
- Keep MCP tool names, bounded input schemas, truthful annotations, and safe public error mapping in `apps/garage-mcp`.
- Do not expose file ingestion through the AutoCaliWeb MCP adapter.
- Preserve the shared CLI envelope, stdout/stderr, represented-failure, and exit-status contract while the CLI exists.
- Use `@garage/autocaliweb` across workspace boundaries.

## Validation

- Package: `bun run --filter '@garage/autocaliweb' test`
- CLI: `bun run --filter '@garage/autocaliweb-cli' test`
- Typecheck either workspace with its corresponding `typecheck` script.
- Before commit: `bun run validate`

Add a changeset when CLI behavior changes.
