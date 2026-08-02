# Tailscale CLI Router

This directory is the executable/process edge of the Tailscale context.

Before editing, read:

- [Canonical context instructions](../../packages/tailscale/AGENTS.md)
- [Tailscale domain context](../../packages/tailscale/CONTEXT.md)
- [Contribution and validation guide](../../CONTRIBUTING.md)

The app owns command parsing, executable discovery, child-process spawning, next actions, and live composition. Tailscale command sequencing, daemon policy, decoding, and operations belong in `packages/tailscale`.

Validate with `bun run --filter '@garage/tailscale-cli' test` and the package checks required by the canonical instructions.
