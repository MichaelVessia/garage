# Repository Engineering

## Purpose

Repository Engineering is the supporting context that makes independently owned Garage workspaces buildable, testable, reviewable, reproducible, and releasable. It owns the engineering harness, not product behavior.

## Ubiquitous language

- **Workspace**: an independently owned package or app under `packages/*` or `apps/*`.
- **Workspace archetype**: Executor v2 app (outside Garage), shared/library package, or deployed application/worker/web app.
- **Validation gate**: `bun run validate`, the fast pre-commit sequence of typecheck, lint, Fallow dead-code analysis, format check, ast-grep, rule tests, and Vitest.
- **Release-grade validation**: `bun run validate:release`, which adds deliverable builds and Nix smoke tests.
- **Structural rule**: an ast-grep policy under `rules/` with executable fixtures under `rule-tests/`.
- **Artifact input**: a root file whose change can alter multiple workspace or Nix deliverables, including locks and shared TypeScript configuration.

## Responsibilities

- Root Bun workspace, TypeScript, lint, dead-code, format, test, ast-grep, hook, and commit configuration.
- Cross-workspace architecture and compatibility tests under `scripts/`.
- CI and validated deliverable build/smoke workflows.
- Bun and Nix dev-shell and smoke testing.
- Repository-wide contribution, agent-routing, conventions, guardrail, how-to, and ADR documentation.

## Non-responsibilities

- It does not own Subq's health-tracking model or deployment behavior.
- It does not turn generated output or dependency directories into first-party workspaces.

## Important policy objects

- Root workspace scripts and workspace filters.
- Effect version pins and strict TypeScript diagnostics.
- Oxlint rules, ast-grep rules, fixtures, and snapshots.
- Validation jobs and deliverable smoke policy.
- Nix flake dev shell.

## Invariants and compatibility contracts

- First-party Effect runtime packages share one exact version.
- Every structural rule has a matching rule test; ast-grep must not duplicate an oxlint Effect-plugin rule.
- Every Effect language-service diagnostic that the installed `@effect/tsgo` declares is configured, and all but `apiStabilityLeak` are errors; `scripts/effect-diagnostics.test.ts` enforces this.
- Fallow runs without an issue baseline across the repository.
- The fast validation gate runs before release-grade deliverable checks.
- Deployments and releases consume validated source and must not race.
- A change to a root artifact input is treated as a cross-workspace risk.
- Conventional commits are enforced.

## Boundaries and dependencies

Repository Engineering governs every workspace through root configuration and CI but does not participate in runtime dependency graphs. It consumes context-owned tests and builds as evidence.

## Relationships

- `rules/` defines structural policy; `rule-tests/` proves each rule.
- `scripts/` holds cross-workspace tests and smoke checks.
- `.github/workflows/` runs the validation and release lifecycle.
- `docs/reference/` holds normative conventions; `docs/guardrails/` holds engineering judgment; `docs/agents/` holds agent workflow setup; `docs/adr/` holds system-wide decisions.

## Ambiguities to avoid

- **Validation** is not synonymous with build: the fast gate omits deliverable builds by design.
- **CI** is the hosted execution of repository gates, not a substitute name for a local check.
- **Shared** does not mean unowned; every shared rule or helper still belongs to this context or Integration HTTP.
- Historical date-prefixed plans describe prior intent and are not current policy unless a durable document adopts it.

## References

- [Contribution and validation guide](../../CONTRIBUTING.md)
- [Repository conventions](../reference/conventions.md)
- [Guardrails](../guardrails/README.md)
- [Workspace creation guide](../how-to/add-a-workspace.md)
- [System-wide ADRs](../adr/)
