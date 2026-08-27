# `@garage/integration-http`

Shared HTTP infrastructure for Garage integration packages. It provides typed environment configuration, credential-safe HTTP/configuration errors, JSON GET transport, and recording support for tests.

The package deliberately contains no AutoCaliWeb, SABnzbd, MCP, or other service-specific behavior. Production integrations use the main export; test adapters remain isolated behind `@garage/integration-http/testing`.

Add functionality here only when multiple retained integrations need the same transport capability.

## Development

```sh
bun run --filter '@garage/integration-http' typecheck
bun run --filter '@garage/integration-http' test
```

See [`CONTEXT.md`](CONTEXT.md) for detailed boundaries.
