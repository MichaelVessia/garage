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
- `bun run --filter @garage/jellyseerr-cli build` builds the Jellyseerr CLI binary.
- `bun run --filter @garage/prowlarr-cli build` builds the Prowlarr CLI binary.
- `bun run --filter @garage/radarr-cli build` builds the Radarr CLI binary.
- `bun run --filter @garage/sabnzbd-cli build` builds the SABnzbd CLI binary.
- `bun run --filter @garage/sonarr-cli build` builds the Sonarr CLI binary.

## Layout

- `apps/jellyseerr-cli` contains the `jellyseerr` agent-first CLI entrypoint.
- `apps/prowlarr-cli` contains the `prowlarr` agent-first CLI entrypoint.
- `apps/radarr-cli` contains the `radarr` agent-first CLI entrypoint.
- `apps/sabnzbd-cli` contains the `sabnzbd` agent-first CLI entrypoint.
- `apps/sonarr-cli` contains the `sonarr` agent-first CLI entrypoint.
- `packages/cli-protocol` contains shared JSON envelope and command metadata types.
- `packages/jellyseerr` contains the Jellyseerr config, API service, HTTP adapter, and domain operations.
- `packages/prowlarr` contains the Prowlarr config, API service, HTTP adapter, and domain operations.
- `packages/radarr` contains the Radarr config, API service, HTTP adapter, and domain operations.
- `packages/sabnzbd` contains the SABnzbd config, API service, HTTP adapter, and domain operations.
- `packages/sonarr` contains the Sonarr config, API service, HTTP adapter, and domain operations.
- `rules` contains ast-grep structural lint rules.
- `rule-tests` contains ast-grep rule fixtures.
