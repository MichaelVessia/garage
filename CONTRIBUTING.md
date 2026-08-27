# Contributing

You just cloned the repo. This page gets you building and testing. For the rules
agents follow, see [AGENTS.md](AGENTS.md). For repo-wide conventions, see
[docs/reference/conventions.md](docs/reference/conventions.md).

## Set up

Either path works. Pick whichever matches your environment.

### With Nix + direnv

Versions are pinned to what CI runs, the manual installs are skipped, and
`PATH` / env are set the moment you `cd` into the repo. New to either? Install
[Determinate Nix](https://determinate.systems/nix-installer/) and
[direnv](https://direnv.net/docs/installation.html). The flake exposes
`devShells.default` with `bun` and the toolchain.

```sh
direnv allow      # first time only, trusts .envrc
bun install       # install workspace dependencies, install git hooks
bun run validate  # fast local gate (mirrors CI's first job)
```

### Without Nix

Install `bun` yourself, then run the same commands. The git hooks install
automatically through the `prepare` script (`lefthook`).

```sh
bun install
bun run validate
```

## Stack

- TypeScript, Bun, and one exact Effect beta across first-party manifests
  (currently `4.0.0-beta.103`; always copy current manifests).
- Tests: `vitest` (plus `@effect/vitest` for Effect matchers and `it.effect`).
- Lint: `oxlint` (with the Effect plugin). Format: `oxfmt`. Structural lint:
  `ast-grep`. Configs live at the repo root and are inherited by every
  workspace.

## The validation gate

`bun run validate` is a compatibility alias for `bun run validate:fast`, the
canonical pre-PR gate. It runs, in order: typecheck, lint, format check,
ast-grep scan, ast-grep rule tests, and vitest. CI runs this fast gate first.

`bun run validate:release` adds all workspace builds and Nix flake/build smoke tests. Run it for shared runtime, dependency, build, Nix, and deployment changes. CI runs the deliverable checks only after the fast gate succeeds, avoiding a second validation pass.

### Focused vs. full validation

Don't reach for `bun run validate` after every keystroke. Use a tiered loop:

| When                                | Command                                         | Why                                |
| ----------------------------------- | ----------------------------------------------- | ---------------------------------- |
| Iterating in one workspace          | `bun run --filter '@garage/<svc>' typecheck`    | Fast typecheck of just that package |
| Running one workspace's tests       | `bun run --filter '@garage/<svc>' test`         | Only that package's vitest suite    |
| Targeting a single test file        | `bunx vitest run <file>`                         | Tightest red-green loop             |
| Before commit / PR (canonical gate) | `bun run validate`                               | typecheck + lint + format + ast-grep + tests |
| Release-sensitive shared changes    | `bun run validate:release`                       | fast gate + builds + Nix smoke tests         |

Use the focused commands as the inner loop while editing; promote to
`bun run validate` once the change feels done. CI runs the full set, so the
pre-PR gate is non-negotiable.

## Choosing a workspace shape

New work starts by choosing an archetype: integration package plus Garage MCP adapter, shared/library package, or deployed application/worker/web app. Conventional service APIs should normally be imported directly into Executor instead of duplicated in Garage. HTTP, process, and file access are adapter choices, not workspace types. See [the workspace how-to](docs/how-to/add-a-workspace.md).

## Committing

Use [conventional commits](https://www.conventionalcommits.org/). Scopes are optional and map to workspaces (`feat(mcp): ...`, `fix(cli-protocol): ...`); commitlint validates the format.

## Going deeper

- [docs/how-to/add-a-workspace.md](docs/how-to/add-a-workspace.md) — add a new workspace or service adapter.
- [docs/reference/conventions.md](docs/reference/conventions.md) — repo-wide
  conventions.
- [docs/guardrails/](docs/guardrails/README.md) — judgment the lints cannot
  check.
- [CONTEXT-MAP.md](CONTEXT-MAP.md) — bounded-context ownership and domain routing.
- [AGENTS.md](AGENTS.md) — the root router for agents working in this repo.
