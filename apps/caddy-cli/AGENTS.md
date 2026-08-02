# Caddy CLI Router

This directory is the executable edge of the Caddy context.

Before editing, read:

- [Canonical context instructions](../../packages/caddy/AGENTS.md)
- [Caddy domain context](../../packages/caddy/CONTEXT.md)
- [Contribution and validation guide](../../CONTRIBUTING.md)

The app owns command parsing, candidate-file ingestion, reload confirmation, next actions, and live composition. Caddy API mapping and domain operations belong in `packages/caddy`.

Validate with `bun run --filter '@garage/caddy-cli' test` and the package checks required by the canonical instructions.
