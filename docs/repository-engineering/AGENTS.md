# Repository Engineering Instructions

This context owns root tooling and manifests, `scripts/`, `rules/`, `rule-tests/`, `.github/`, and repository-wide engineering documentation.

## Read first

- [Domain and boundaries](CONTEXT.md)
- [Repository conventions](../reference/conventions.md)
- [Contribution and validation guide](../../CONTRIBUTING.md)
- [Guardrails](../guardrails/README.md)
- [System-wide ADRs](../adr/)

## Local constraints

- Never edit `repos/` or generated dependency/build output; refresh the vendored subtree only with `bun run vendor:update`.
- Do not add an ast-grep rule that duplicates an oxlint Effect-plugin rule; every structural rule needs fixtures.
- Regenerate `bun.nix` from `bun.lock` using the documented Nix procedure; do not hand-edit it.
- Preserve exact-SHA validation and concurrency safety in deployment or release workflows.
- Treat root artifact inputs and `packages/integration-http` production changes as cross-workspace risks.

## Validation

- Focused scripts: `bunx vitest run scripts/<file>.test.ts`
- Structural rules: `bun run ast-grep && bun run ast-grep:test`
- Repository gate: `bun run validate`
- Build, dependency, Nix, or release changes: `bun run validate:release`

Use conventional commits.
