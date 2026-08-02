# AutoCaliWeb CLI Router

This directory is the executable edge of the AutoCaliWeb context.

Before editing, read:

- [Canonical context instructions](../../packages/autocaliweb/AGENTS.md)
- [AutoCaliWeb domain context](../../packages/autocaliweb/CONTEXT.md)
- [Contribution and validation guide](../../CONTRIBUTING.md)

The app owns command parsing, next actions, usage validation, and live layer composition. OPDS parsing, metadata mapping, domain operations, and HTTP behavior belong in `packages/autocaliweb`.

Validate with `bun run --filter '@garage/autocaliweb-cli' test` and the package checks required by the canonical instructions.
