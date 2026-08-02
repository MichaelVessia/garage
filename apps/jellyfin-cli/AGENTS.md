# Jellyfin CLI Router

This directory is the executable edge of the Jellyfin context.

Before editing, read:

- [Canonical context instructions](../../packages/jellyfin/AGENTS.md)
- [Jellyfin domain context](../../packages/jellyfin/CONTEXT.md)
- [Contribution and validation guide](../../CONTRIBUTING.md)

The app owns command parsing, next actions, scheduled-task confirmation, and live layer composition. Jellyfin API mapping, visibility policy, errors, and operations belong in `packages/jellyfin`.

Validate with `bun run --filter '@garage/jellyfin-cli' test` and the package checks required by the canonical instructions.
