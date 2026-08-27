# `@garage/sabnzbd`

Typed SABnzbd integration used by Garage MCP. It translates SABnzbd's query-based API into stable operations for status, version, queue, history, server statistics, pause, resume, and queue-item deletion.

This package owns API-key authentication, request construction, wire-response decoding, domain models, and integration errors. `apps/garage-mcp` owns the MCP tool names, transport schemas, safety annotations, destructive-action confirmation, and public error responses.

It is a runtime library, not a standalone service or retired CLI.

## Development

```sh
bun run --filter '@garage/sabnzbd' typecheck
bun run --filter '@garage/sabnzbd' test
```

See [`CONTEXT.md`](CONTEXT.md) for detailed boundaries and terminology.
