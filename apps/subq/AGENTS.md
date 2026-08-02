# Subq Instructions

This context owns all of `apps/subq`: shared health domain/RPC schemas, Worker backend, D1 persistence, Better Auth integration, Foldkit SPA, migrations, and Alchemy deployment.

## Read first

- [Subq domain context](CONTEXT.md)
- [Subq deployment and development guide](README.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [Repository conventions](../../docs/reference/conventions.md)

## Local constraints

- Scope every domain repository/read/write by authenticated user identity.
- Preserve pounds-only persistence; kilograms are input/display conversions.
- Preserve shared Effect RPC schemas between Worker and browser.
- Treat import as non-atomic: validate references first and keep rerun-safe recovery behavior.
- Do not run `alchemy dev`, deploy commands, or production data operations without explicit authorization; development can provision real Cloudflare resources.
- Do not apply the Garage CLI envelope or integration package/CLI split to Subq.

## Validation

- Typecheck: `bun run --filter '@garage/subq' typecheck`
- Tests: `bun run --filter '@garage/subq' test`
- Before commit: `bun run validate`
- Build/deployment changes: also run `bun run validate:release`

Do not commit generated `web/dist` or `.alchemy` output.
