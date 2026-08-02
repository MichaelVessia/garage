# AdGuard CLI Router

This directory is the executable edge of the AdGuard Home context.

Before editing, read:

- [Canonical context instructions](../../packages/adguard/AGENTS.md)
- [AdGuard Home domain context](../../packages/adguard/CONTEXT.md)
- [Contribution and validation guide](../../CONTRIBUTING.md)

The app owns command parsing, next actions, confirmation policy, and live layer composition. Domain operations, wire schemas, errors, and HTTP behavior belong in `packages/adguard`.

Validate with `bun run --filter '@garage/adguard-cli' test` and the package checks required by the canonical instructions.
