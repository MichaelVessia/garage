# CLI Protocol and Runtime Instructions

This context owns `packages/cli-protocol`, the shared command contract, executable boundary, and integration infrastructure used by every service CLI.

## Read first

- [CLI Protocol and Runtime context](CONTEXT.md)
- [CLI compatibility and release conventions](../../docs/reference/conventions.md#cli-compatibility)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [Contribution and validation guide](../../CONTRIBUTING.md)

## Local constraints

- Preserve exactly one newline-terminated envelope on stdout, empty stderr, and status 0 for represented outcomes.
- Keep `runCliMain` as the shared owner of observability, argv/stdio, JSON rendering, and Bun runtime.
- Keep integration-specific commands, wire schemas, authentication, and tagged-error classes out of this package.
- Preserve the separate `./testing` export boundary.
- Treat production changes as all-CLI compatibility and release risks.

## Validation

- Package: `bun run --filter '@garage/cli-protocol' test`
- Cross-CLI contract: `bunx vitest run scripts/cli-entrypoints.test.ts scripts/live-cli-missing-env.test.ts`
- Before commit: `bun run validate`
- Shared runtime/build-sensitive changes: `bun run validate:release`

Add a changeset for observable CLI behavior changes.
