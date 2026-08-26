# CLI Protocol and Shared Integration Runtime Instructions

This context owns `packages/cli-protocol`, the legacy CLI modules and transport-neutral integration infrastructure still consumed by AutoCaliWeb and SABnzbd.

## Read first

- [Context](CONTEXT.md)
- [Repository conventions](../../docs/reference/conventions.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [Contribution and validation guide](../../CONTRIBUTING.md)

## Local constraints

- Keep integration-specific wire schemas, authentication, operations, and tagged-error classes out of this package.
- Preserve the separate `./testing` export boundary.
- Keep configuration and HTTP failures typed and credential-safe.
- Do not introduce new dependencies on the legacy command/envelope/runtime surface.
- Treat production changes as cross-workspace risks because retained integration packages consume this package.

## Validation

- Package: `bun run --filter '@garage/cli-protocol' test`
- Before commit: `bun run validate`
- Shared runtime/build-sensitive changes: `bun run validate:release`
