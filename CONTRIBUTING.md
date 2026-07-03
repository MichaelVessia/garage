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
bun run validate  # full local gate (mirrors CI)
```

### Without Nix

Install `bun` yourself, then run the same commands. The git hooks install
automatically through the `prepare` script (`lefthook`).

```sh
bun install
bun run validate
```

## Stack

- TypeScript, Bun, Effect 4.x across the repo.
- Tests: `vitest` (plus `@effect/vitest` for Effect matchers and `it.effect`).
- Lint: `oxlint` (with the Effect plugin). Format: `oxfmt`. Structural lint:
  `ast-grep`. Configs live at the repo root and are inherited by every
  workspace.

## The validation gate

`bun run validate` is the canonical pre-PR gate. It runs, in order: typecheck,
lint, format check, ast-grep scan, ast-grep rule tests, and vitest. It is the
same set CI runs.

### Focused vs. full validation

Don't reach for `bun run validate` after every keystroke. Use a tiered loop:

| When                                | Command                                         | Why                                |
| ----------------------------------- | ----------------------------------------------- | ---------------------------------- |
| Iterating in one workspace          | `bun run --filter '@garage/<svc>' typecheck`    | Fast typecheck of just that package |
| Running one workspace's tests       | `bun run --filter '@garage/<svc>' test`         | Only that package's vitest suite    |
| Targeting a single test file        | `bunx vitest run <file>`                         | Tightest red-green loop             |
| Before commit / PR (canonical gate) | `bun run validate`                               | typecheck + lint + format + ast-grep + tests |

Use the focused commands as the inner loop while editing; promote to
`bun run validate` once the change feels done. CI runs the full set, so the
pre-PR gate is non-negotiable.

## Building a CLI

Each CLI compiles to a standalone binary:

```sh
bun run --filter '@garage/<svc>-cli' build   # produces apps/<svc>-cli/dist/<svc>
```

## Committing

Use [conventional commits](https://www.conventionalcommits.org/). Scopes are
optional and map to workspaces (`feat(radarr): ...`, `fix(cli-protocol): ...`);
commitlint validates the format. Add a changeset (`bunx changeset`) when a CLI's
behavior changes so it gets a version on release.

## Going deeper

- [docs/how-to/add-a-workspace.md](docs/how-to/add-a-workspace.md) — add a new
  service package and CLI.
- [docs/reference/conventions.md](docs/reference/conventions.md) — repo-wide
  conventions.
- [docs/guardrails/](docs/guardrails/README.md) — judgment the lints cannot
  check.
- [CONTEXT.md](CONTEXT.md) — the domain language.
- [AGENTS.md](AGENTS.md) — rules for agents working in this repo.
