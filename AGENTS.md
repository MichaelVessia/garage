# Agent Instructions

`garage` is a Bun/TypeScript monorepo containing independently owned paired service integrations, shared CLI infrastructure, the deployed Subq application, and the repository engineering system that validates and ships them.

## Route before editing

1. Read [CONTEXT-MAP.md](CONTEXT-MAP.md) and identify every context touched by the change.
2. Read the nearest applicable `AGENTS.md` and its linked `CONTEXT.md` before editing.
3. For cross-context changes, follow every affected context's instructions and vocabulary.

The most local applicable instructions take precedence over broader ones.

## Repository-wide rules

- Keep changes narrow; do not mix unrelated behavior, formatting, and automation work.
- Do not edit generated output or the read-only vendored source under `repos/`.
- Use workspace package names for cross-workspace imports; never import production code from a CLI app or from `repos/`.
- Add focused behavior tests for public behavior changes. Use Vitest through repository scripts, not Bun's test runner.
- Run the focused checks named by the owning context, then `bun run validate` before committing.

## Deeper guidance

- [Repository conventions](docs/reference/conventions.md)
- [Contribution and validation guide](CONTRIBUTING.md)
- [Agent setup and workflows](docs/agents/)
- [System-wide ADRs](docs/adr/)
- [Engineering guardrails](docs/guardrails/)
