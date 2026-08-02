# Jellyseerr CLI Router

This directory is the executable edge of the Jellyseerr context.

Before editing, read:

- [Canonical context instructions](../../packages/jellyseerr/AGENTS.md)
- [Jellyseerr domain context](../../packages/jellyseerr/CONTEXT.md)
- [Contribution and validation guide](../../CONTRIBUTING.md)

The app owns command parsing, fixed request filters, next actions, mutation confirmations, and live composition. Request/media mapping and API behavior belong in `packages/jellyseerr`.

Validate with `bun run --filter '@garage/jellyseerr-cli' test` and the package checks required by the canonical instructions.
