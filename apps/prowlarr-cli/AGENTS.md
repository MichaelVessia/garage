# Prowlarr CLI Router

This directory is the executable edge of the Prowlarr context.

Before editing, read:

- [Canonical context instructions](../../packages/prowlarr/AGENTS.md)
- [Prowlarr domain context](../../packages/prowlarr/CONTEXT.md)
- [Contribution and validation guide](../../CONTRIBUTING.md)

The app owns command parsing, aliases, search arguments, next actions, sync confirmation, and live composition. Prowlarr API mapping and operations belong in `packages/prowlarr`.

Validate with `bun run --filter '@garage/prowlarr-cli' test` and the package checks required by the canonical instructions.
