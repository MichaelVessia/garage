# SABnzbd Instructions

This context owns `packages/sabnzbd` as the SABnzbd domain and query-protocol
integration. `apps/garage-mcp` is its active delivery edge.

## Read first

- [SABnzbd domain context](CONTEXT.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [Repository conventions](../../docs/reference/conventions.md)
- [Consolidated Garage MCP ADR](../../docs/adr/0002-consolidated-garage-mcp-delivery-edge.md)

## Local constraints

- Keep SABnzbd query-protocol mapping, action decoding, count normalization,
  configuration, and domain operations in this package.
- Keep MCP names, transport schemas, safety annotations, credential-safe error
  mapping, and server composition in `apps/garage-mcp`.
- Preserve the separate `deleteFiles` plus `confirmDeleteFiles` safety contract
  at the MCP edge.
- Use `@garage/sabnzbd` across the workspace boundary.
- Do not recreate a SABnzbd-specific CLI or issue raw SABnzbd requests from MCP
  handlers.

## Validation

- Package: `bun run --filter '@garage/sabnzbd' test`
- MCP: `bun run --filter '@garage/mcp' test`
- Typecheck either workspace with its corresponding `typecheck` script.
- Before commit: `bun run validate`
