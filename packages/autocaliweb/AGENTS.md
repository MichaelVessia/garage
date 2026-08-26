# AutoCaliWeb Instructions

This context owns `packages/autocaliweb` and the AutoCaliWeb tools under `apps/garage-mcp` as one read-only ebook-catalog integration.

## Read first

- [AutoCaliWeb domain context](CONTEXT.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [Workspace conventions](../../docs/reference/conventions.md)

## Local constraints

- Keep OPDS XML parsing and JSON wire translation in the package.
- Preserve book-versus-navigation classification and relative-link normalization.
- Keep MCP tool names, bounded input schemas, truthful annotations, and safe public error mapping in `apps/garage-mcp`.
- Do not expose file ingestion through the AutoCaliWeb MCP adapter.
- Use `@garage/autocaliweb` across workspace boundaries.

## Validation

- Package: `bun run --filter '@garage/autocaliweb' test`
- MCP: `bun run --filter '@garage/mcp' test`
- Typecheck either workspace with its corresponding `typecheck` script.
- Before commit: `bun run validate`
