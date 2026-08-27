# Repository Engineering

## Purpose

Repository Engineering is the supporting context that makes independently owned Garage workspaces buildable, testable, reviewable, reproducible, and releasable. It owns the engineering harness, not product behavior.

## Ubiquitous language

- **Workspace**: an independently owned package or app under `packages/*` or `apps/*`.
- **Workspace archetype**: Executor-only integration, integration package plus Garage MCP adapter, shared/library package, or deployed application/worker/web app.
- **Validation gate**: `bun run validate`, the fast pre-commit sequence of typecheck, lint, format check, ast-grep, rule tests, and Vitest.
- **Release-grade validation**: `bun run validate:release`, which adds deliverable builds and Nix smoke tests.
- **Structural rule**: an ast-grep policy under `rules/` with executable fixtures under `rule-tests/`.
- **Artifact input**: a root file whose change can alter multiple workspace or Nix deliverables, including locks and shared TypeScript configuration.
- **Vendored reference**: read-only third-party source under `repos/`, used for evidence but never imported or edited.

## Responsibilities

- Root Bun workspace, TypeScript, lint, format, test, ast-grep, hook, and commit configuration.
- Shared Garage MCP HTTP server composition, packaging, readiness, and protocol behavior; integration contexts own their tool semantics.
- Cross-workspace architecture and compatibility tests under `scripts/`.
- CI and validated deliverable build/smoke workflows.
- Bun and Nix deliverable construction and smoke testing.
- Repository-wide contribution, agent-routing, conventions, guardrail, how-to, and ADR documentation.

## Non-responsibilities

- It does not own an integration's upstream vocabulary, operations, MCP tool semantics, or external adapter mapping.
- It does not own the shared HTTP-adapter infrastructure in `packages/integration-http`.
- It does not own Subq's health-tracking model or deployment behavior.
- It does not turn `repos/`, generated output, or dependency directories into first-party workspaces.

## Important policy objects

- Root workspace scripts and workspace filters.
- Effect version pins and strict TypeScript diagnostics.
- Oxlint rules, ast-grep rules, fixtures, and snapshots.
- Validation jobs and deliverable smoke policy.
- Bun-compiled applications, the consolidated Garage MCP container image, and Nix flake outputs.

## Invariants and compatibility contracts

- First-party Effect runtime packages share one exact beta version.
- Every structural rule has a matching rule test; ast-grep must not duplicate an oxlint Effect-plugin rule.
- The fast validation gate runs before release-grade deliverable checks.
- Deployments and releases consume validated source and must not race.
- A production change to `packages/integration-http` or a root artifact input is treated as a cross-workspace risk.
- `bun.nix` is generated from `bun.lock`; `repos/` is read-only.
- Conventional commits are enforced.

## Boundaries and dependencies

Repository Engineering governs every workspace through root configuration and CI but does not participate in runtime dependency graphs. It consumes context-owned tests and builds as evidence. Shared-adapter compatibility tests intentionally cross the Integration HTTP and integration contexts.

## Relationships

- `rules/` defines structural policy; `rule-tests/` proves each rule.
- `scripts/` holds cross-workspace tests and smoke checks.
- `apps/garage-mcp` composes context-owned MCP tool adapters into one private HTTP delivery edge.
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
