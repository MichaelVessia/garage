# Sonarr CLI Router

This directory is the executable edge of the Sonarr context.

Before editing, read:

- [Canonical context instructions](../../packages/sonarr/AGENTS.md)
- [Sonarr domain context](../../packages/sonarr/CONTEXT.md)
- [Contribution and validation guide](../../CONTRIBUTING.md)

The app owns command parsing, next actions, file-deletion confirmation, and live composition. Series/episode policy, identifiers, API mapping, and operations belong in `packages/sonarr`.

Validate with `bun run --filter '@garage/sonarr-cli' test` and the package checks required by the canonical instructions.
