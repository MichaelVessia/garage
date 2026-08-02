# TubeArchivist CLI Router

This directory is the executable/filesystem edge of the TubeArchivist context.

Before editing, read:

- [Canonical context instructions](../../packages/tubearchivist/AGENTS.md)
- [TubeArchivist domain context](../../packages/tubearchivist/CONTEXT.md)
- [Contribution and validation guide](../../CONTRIBUTING.md)

The app owns command parsing, next actions, unsubscribe confirmation, persistent session-cache policy, and live composition. API/session protocol, domain mapping, errors, and operations belong in `packages/tubearchivist`.

Validate with `bun run --filter '@garage/tubearchivist-cli' test` and the package checks required by the canonical instructions.
