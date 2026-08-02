# SABnzbd CLI Router

This directory is the executable edge of the SABnzbd context.

Before editing, read:

- [Canonical context instructions](../../packages/sabnzbd/AGENTS.md)
- [SABnzbd domain context](../../packages/sabnzbd/CONTEXT.md)
- [Contribution and validation guide](../../CONTRIBUTING.md)

The app owns command parsing, next actions, file-deletion confirmation, and live composition. SABnzbd query/API mapping, action semantics, errors, and operations belong in `packages/sabnzbd`.

Validate with `bun run --filter '@garage/sabnzbd-cli' test` and the package checks required by the canonical instructions.
