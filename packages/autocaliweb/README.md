# `@garage/autocaliweb`

Typed AutoCaliWeb integration used by Garage MCP. It translates AutoCaliWeb's JSON and OPDS/XML catalog APIs into stable domain operations for status, statistics, catalog browsing, search, recent books, shelves, and book metadata.

This package owns upstream authentication, HTTP requests, OPDS parsing, pagination, response decoding, and integration errors. `apps/garage-mcp` owns the MCP tool names, transport schemas, safety annotations, and public error responses.

The integration is read-only and does not ingest, edit, or delete ebook files.

## Development

```sh
bun run --filter '@garage/autocaliweb' typecheck
bun run --filter '@garage/autocaliweb' test
```

See [`CONTEXT.md`](CONTEXT.md) for detailed boundaries and terminology.
