# Garage

Bare Effect v4 monorepo scaffolded with Bun, Nix, TypeScript strictness, oxlint/oxfmt, ast-grep, lefthook, and Vitest.

## Commands

- `bun install` installs dependencies and patches Effect tooling.
- `bun run typecheck` runs Effect-aware TypeScript checks.
- `bun run lint` runs oxlint.
- `bun run format` checks formatting.
- `bun run ast-grep` runs structural lint rules.
- `bun run test` runs Vitest.
- `bun run validate` runs the full local quality gate.

## Layout

- `packages/core` contains the initial reusable Effect library code.
- `rules` contains ast-grep structural lint rules.
- `rule-tests` contains ast-grep rule fixtures.
