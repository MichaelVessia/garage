# Immich CLI Router

This directory is the executable edge of the Immich context.

Before editing, read:

- [Canonical context instructions](../../packages/immich/AGENTS.md)
- [Immich domain context](../../packages/immich/CONTEXT.md)
- [Contribution and validation guide](../../CONTRIBUTING.md)

The app owns command parsing, next actions, usage validation, and live layer composition. Immich API mapping, search policy, errors, and operations belong in `packages/immich`.

Validate with `bun run --filter '@garage/immich-cli' test` and the package checks required by the canonical instructions.
