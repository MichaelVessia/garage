# Integration HTTP Instructions

This context owns `packages/integration-http`, the transport-focused HTTP infrastructure shared by retained integration packages.

## Read first

- [Context](CONTEXT.md)
- [Repository conventions](../../docs/reference/conventions.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [Contribution and validation guide](../../CONTRIBUTING.md)

## Local constraints

- Keep integration-specific wire schemas, authentication, operations, and tagged-error classes out of this package.
- Preserve the separate `./testing` export boundary.
- Keep configuration and HTTP failures typed and credential-safe.
- Add shared capability only when multiple integration packages need it.
- Treat production changes as cross-workspace risks because retained integration packages consume this package.

## Validation

- Package: `bun run --filter '@garage/integration-http' test`
- Before commit: `bun run validate`
- Shared runtime/build-sensitive changes: `bun run validate:release`
