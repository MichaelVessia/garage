# Subq instructions

This context owns the journal domain, Cloudflare Worker, Foldkit application,
and Alchemy stack in `apps/subq`.

## Read first

- [Subq context](CONTEXT.md)
- [Development and deployment guide](README.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [Repository conventions](../../docs/reference/conventions.md)

## Local constraints

- Authenticate journal reads and commands through the server session middleware.
  Address the journal with `PERSONAL_JOURNAL_ID`.
- Store weight in pounds. Convert units at input and display boundaries.
- Reuse the domain schemas and calculations in the server and browser.
- Keep version 3 JSON import at the export format boundary.
- Get authorization before you run `alchemy dev`, deploy, or access production
  data.
- Keep generated `web/dist` and `.alchemy` output out of Git.

## Validation

- Stack and package types. Run `bun run --filter '@garage/subq*' typecheck`.
- Domain, server, and browser tests. Run `bun run --filter '@garage/subq*' test`.
- Release validation. Run `bun run validate:release` for build or deployment
  changes.
