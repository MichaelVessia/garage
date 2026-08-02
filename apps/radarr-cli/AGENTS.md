# Radarr CLI Router

This directory is the executable edge of the Radarr context.

Before editing, read:

- [Canonical context instructions](../../packages/radarr/AGENTS.md)
- [Radarr domain context](../../packages/radarr/CONTEXT.md)
- [Contribution and validation guide](../../CONTRIBUTING.md)

The app owns command parsing, next actions, collection/delete confirmations, and live composition. Movie/collection policy, identifiers, API mapping, and operations belong in `packages/radarr`.

Validate with `bun run --filter '@garage/radarr-cli' test` and the package checks required by the canonical instructions.
