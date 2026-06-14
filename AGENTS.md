# Agent Instructions

You are working in `garage`, a monorepo of agent-first command-line tools for
self-hosted services (AdGuard Home, Caddy, Immich, Jellyfin, the *arr stack, and
more). Each service has a package (`packages/<svc>`) with the typed domain and a
CLI app (`apps/<svc>-cli`) that exposes it.

Users rely on the CLI command contract: human output by default and the
`{ command, result }` / `{ command, error }` JSON envelope for machine
consumers. Treat that envelope and exit-code behavior as a compatibility
surface.

## Operating loop

1. Classify the change before editing (service domain, CLI surface, shared
   protocol, docs, or automation).
2. Read the doc that matches the change (see the sections below).
3. Keep the diff narrow. Do not mix behavior, formatting, and automation cleanup
   unless the task requires it. When moving code, update callers; never leave
   breadcrumb re-exports.
4. Add or update focused tests for behavior changes. Run tests with
   `bun run --filter '@garage/<svc>' test` or `bunx vitest run <file>`, never
   `bun test` (`@effect/vitest`'s `it.effect` misbehaves under Bun's runner).
5. Run checks that match the risk of the change. `bun run validate` is the
   pre-commit/PR gate (the same set as CI). Use the tiered loop in
   [CONTRIBUTING.md](CONTRIBUTING.md) for the inner loop.
6. Update README, [CONTEXT.md](CONTEXT.md), the relevant guardrail, or a
   workspace README when public behavior, domain language, or policy changes.

## Repository map

- `packages/<svc>` — one service's typed domain: `model.ts` (Schema structs),
  `errors.ts` (tagged errors), `http.ts` (the HTTP adapter, sole owner of
  network access), `services.ts` (domain operations), `index.ts` (public
  barrel).
- `apps/<svc>-cli` — the thin CLI over a service package; the composition root.
- `packages/cli-protocol` — the shared JSON envelope and command metadata every
  CLI emits.
- `rules/` and `rule-tests/` — repo-specific ast-grep structural lint and its
  fixtures.
- `repos/` — vendored read-only reference (`effect-smol`). Never edit, never
  import; refresh via `bun run vendor:update`.

## Service domain and CLI surface

Use this workflow for `packages/<svc>` domain logic and `apps/<svc>-cli`
commands.

Consult:

- [Effect services guardrail](docs/guardrails/effect-services-and-layers.md),
  for service boundaries, composition roots, and what tests must prove.
- [CONTEXT.md](CONTEXT.md), for the domain language to use in names and docs.

Cross-workspace imports use the package name (`@garage/<pkg>`), never a relative
path. A service exposes its public API through `index.ts`; service packages do
not import each other, and nothing imports a CLI app.

## Effect code

Effect idioms are enforced by the oxlint Effect plugin (`oxlint.config.mjs`) and
the `rules/effect/` ast-grep checks; that tooling is the source of truth. Don't
re-add an ast-grep rule that duplicates an oxlint plugin rule.

Architecture judgment the lints cannot check lives in
[docs/guardrails/](docs/guardrails/README.md). If a change violates a guardrail,
update the guardrail in the same pull request or explain the exception in the PR
body.

For exact API behavior, read `repos/effect-smol/` (start at `LLMS.md`, then
`ai-docs/`, then `packages/effect/src/`). Cite as `repos/effect-smol/<path>:<line>`.

## Documentation-only changes

Use this workflow for README, docs, ADRs, guardrails, and agent instructions.

Consult [CONTEXT.md](CONTEXT.md) for domain language and
[docs/reference/conventions.md](docs/reference/conventions.md) for repo-wide
rules. Treat date-prefixed planning docs in any `docs/` dir as untracked working
artifacts unless a human asks to commit them (`git add -f`). Docs-only changes
may skip tests; still run the formatter.

## Pull requests

- State the change class and any compatibility impact on the CLI envelope.
- Use conventional commits; scopes are optional and map to workspaces
  (`feat(radarr): ...`, `fix(cli-protocol): ...`).
- Add a changeset (`bunx changeset`) when a CLI's behavior changes.

## Quick reference

- Keep Effect code pure until an application boundary exists; prefer exported
  `Effect` values over runtime helpers in packages.
- No `any`, non-null assertions, or type assertions. Decode unknown input with
  `Schema.decodeUnknown`.
- Add behavior tests for new public API.
- Define every tagged error in its package's `errors.ts`.
- `repos/` is read-only reference; refresh vendored Effect with
  `bun run vendor:update`.
- Run `bun run validate` before calling work complete.
