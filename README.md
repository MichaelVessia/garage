# Garage

Agent-first command-line tools for self-hosted services. Each service gets one
CLI that exposes deterministic, scriptable operations over its HTTP API, with
human-readable output by default and a `{ command, result }` JSON envelope for
machine consumers.

Built on Effect v4 with Bun, Nix, TypeScript strictness, oxlint/oxfmt, ast-grep,
lefthook, and Vitest.

## Quick start

```sh
bun install        # install dependencies and patch Effect tooling
bun run validate   # the full local quality gate (mirrors CI)
bun run test       # just the tests
```

With Nix + direnv, `direnv allow` drops you into the pinned toolchain first. See
[CONTRIBUTING.md](CONTRIBUTING.md) for both setup paths.

## The pieces

- `apps/<svc>-cli` — the thin CLI for one service; the composition root that
  renders typed results.
- `packages/<svc>` — that service's typed domain: config, the API service, the
  HTTP adapter, tagged errors, and domain operations.
- `packages/cli-protocol` — the shared JSON envelope and command metadata every
  CLI emits.
- `rules` / `rule-tests` — ast-grep structural lint rules and their fixtures.
- `repos/effect-smol` — vendored, read-only Effect v4 source used as reference.

## How it fits together

A CLI app is a thin surface over its service package. The package owns the
network access (one HTTP adapter per service, with a test layer) and the
deterministic domain logic; the app wires commands to domain operations and
turns typed results into text or the JSON envelope. Cross-workspace imports use
package names (`@garage/<pkg>`). See
[docs/guardrails/effect-services-and-layers.md](docs/guardrails/effect-services-and-layers.md).

## Commands

- `bun run typecheck` runs Effect-aware TypeScript checks.
- `bun run lint` runs oxlint (with the Effect plugin).
- `bun run format` checks formatting.
- `bun run ast-grep` runs structural lint rules.
- `bun run test` runs Vitest.
- `bun run validate` runs the full local quality gate.
- `bun run --filter '@garage/<svc>-cli' build` compiles a CLI to a standalone
  binary, for example:

```sh
bun run --filter '@garage/adguard-cli' build
bun run --filter '@garage/autocaliweb-cli' build
bun run --filter '@garage/caddy-cli' build
bun run --filter '@garage/immich-cli' build
bun run --filter '@garage/jellyfin-cli' build
bun run --filter '@garage/jellyseerr-cli' build
bun run --filter '@garage/prowlarr-cli' build
bun run --filter '@garage/radarr-cli' build
bun run --filter '@garage/sabnzbd-cli' build
bun run --filter '@garage/sonarr-cli' build
bun run --filter '@garage/tailscale-cli' build
bun run --filter '@garage/tubearchivist-cli' build
```

## Services

`adguard`, `autocaliweb`, `caddy`, `immich`, `jellyfin`, `jellyseerr`,
`prowlarr`, `radarr`, `sabnzbd`, `sonarr`, `tailscale`, `tubearchivist`. Each has
a `packages/<svc>` library and an `apps/<svc>-cli` entrypoint.

## Web apps

- `apps/subq` — the subq health-tracking web app (Effect RPC worker + foldkit
  SPA) deployed to Cloudflare Workers via Alchemy.

## Learn more

- [CONTRIBUTING.md](CONTRIBUTING.md) — setup and the validation loop.
- [AGENTS.md](AGENTS.md) — rules for agents working in this repo.
- [CONTEXT.md](CONTEXT.md) — the domain language.
- [VISION.md](VISION.md) — what this project is for.
- [docs/](docs/reference/conventions.md) — conventions, guardrails, how-tos, and
  ADRs.
