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
- `bun run --filter @garage/sonarr-cli build` builds the Sonarr CLI binary.

## Layout

- `apps/sonarr-cli` contains the `sonarr` agent-first CLI entrypoint.
- `packages/cli-protocol` contains shared JSON envelope and command metadata types.
- `packages/core` contains the initial reusable Effect library code.
- `packages/sonarr` contains the Sonarr config, API service, HTTP adapter, and domain operations.
- `rules` contains ast-grep structural lint rules.
- `rule-tests` contains ast-grep rule fixtures.
