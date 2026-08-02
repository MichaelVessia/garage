# TubeArchivist Instructions

This context owns `packages/tubearchivist` and `apps/tubearchivist-cli` as one archive-operations integration.

## Read first

- [TubeArchivist domain context](CONTEXT.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)

## Local constraints

- Keep API login/session/CSRF and cache semantics in the package; keep persistent filesystem policy in the app.
- Never emit credentials, cookies, CSRF tokens, or authenticated request data in logs, spans, snapshots, or envelopes.
- Preserve the one-refresh/one-retry rule and explicit unsubscribe confirmation.
- Preserve the shared CLI envelope, stdout/stderr, represented-failure, and exit-status contract.
- Use `@garage/tubearchivist` across the workspace boundary.

## Validation

- Package: `bun run --filter '@garage/tubearchivist' test`
- CLI: `bun run --filter '@garage/tubearchivist-cli' test`
- Typecheck either workspace with its corresponding `typecheck` script.
- Before commit: `bun run validate`

Add a changeset when CLI behavior changes.
