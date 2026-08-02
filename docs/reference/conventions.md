# Monorepo conventions

Rules that apply repo-wide. See [AGENTS.md](../../AGENTS.md) for agent-specific
routing and [CONTRIBUTING.md](../../CONTRIBUTING.md) for contributor setup.

## Dependencies

- Shared devDependencies live in the repo-root `package.json`; Bun hoists them.
- Runtime dependencies live in the workspace where they are used.
- Effect dependencies currently target `^4.0.0-beta.93`; platform packages that
  must match it use `4.0.0-beta.93`. Copy the current root and neighboring
  workspace manifests rather than preserving an old beta in documentation.

## Workspace archetypes

Choose the smallest truthful ownership shape:

- **Paired integration package + CLI** — a reusable typed domain and external
  adapter under `packages/<svc>`, plus a thin executable under
  `apps/<svc>-cli`. Existing service integrations use this shape.
- **Standalone/local CLI** — one app for local behavior that does not earn a
  separate reusable domain package.
- **Shared/library package** — reusable code without an executable.
- **Deployed application/worker/web app** — an independently deployed system,
  such as Subq, with its own internal boundaries.

HTTP versus process or file access is an adapter choice inside an archetype,
not repository taxonomy. Do not move existing workspaces merely to normalize
them, and do not require the paired split for future projects.

## CLI compatibility

Every CLI normally writes exactly one newline-terminated JSON envelope to
stdout and nothing to stderr. Success contains `ok: true`, `command`, `result`,
and `next_actions`. Represented failure contains `ok: false`, `command`,
`error: { code, message }`, `fix`, and `next_actions`. Represented failures,
including unknown-command usage errors, return status 0 just like successes.
Unexpected defects in bootstrap or runtime may terminate non-zero. Changes to
these fields, streams, or exit behavior are CLI behavior changes and require
compatibility tests and a changeset.

## CLI release impact

Automatic CLI versioning releases the affected CLI when code in its
`apps/<svc>-cli` workspace or paired `packages/<svc>` integration changes. A
change under `packages/cli-protocol` releases every CLI because the protocol is
linked into every executable. Root artifact inputs that can affect all CLI
binaries also release every CLI: `package.json`, `bun.lock`, `bun.nix`,
`flake.nix`, `flake.lock`, and `tsconfig.base.json`.

Documentation, tests, unrelated packages, and Subq-only changes do not release a
CLI unless one of those global artifact inputs changes in the same comparison.
In particular, a lockfile-only dependency resolution change caused by Subq is
conservatively treated as affecting every CLI.

## Cross-workspace imports

Never import across workspaces via a relative path. Use the workspace's package
name (`@garage/<pkg>`). A CLI app imports its service package by name; a service
package exposes its public API through its `index.ts` barrel.

Service packages do not import each other, and nothing imports a CLI app.

## Type safety

No `any`, no non-null assertion (`!`), no type assertions (`as Type`,
`<Type>x`). This applies everywhere, including tests, and is enforced by oxlint
(`@typescript-eslint/no-explicit-any`, `no-non-null-assertion`,
`consistent-type-assertions: never`). For unknown input, decode with
`Schema.decodeUnknown(...)` rather than asserting. The ast-grep rules
`no-unsafe-typecast-at-boundary` and `no-typed-boundary-assignment` catch the
boundary-data form specifically.

## Effect idioms

Effect idioms are enforced mechanically by the oxlint Effect plugin
(`oxlint.config.mjs`) and the repo-specific `rules/effect/` ast-grep checks.
That tooling is the source of truth for the mechanical idioms; do not add an
ast-grep rule that duplicates an oxlint plugin rule.

Judgment the lints cannot check (where layers are provided, what a service
requires, what the tests prove) lives in
[docs/guardrails/](../guardrails/README.md).

For exact Effect v4 API behavior, read the vendored source at `repos/effect-smol/`
(start at `LLMS.md`, then `ai-docs/`, then `packages/effect/src/`). Cite it as
`repos/effect-smol/<path>:<line>`. Never edit or import from `repos/`.

## Paired integration responsibilities

Typical integration package files are `model.ts` for public domain values,
`api-schema.ts` for upstream wire codecs, `errors.ts` for tagged errors,
`services.ts` for service interfaces and configuration/policy services, an
adapter such as `http.ts` or `process.ts`, `operations.ts` for domain Effects,
and `index.ts` for the public barrel. These are responsibilities, not a demand
that every workspace contain every filename.

The app's `main.ts` owns selection and composition of domain, configuration,
and platform layers. Shared `runCliMain` owns executable bootstrap,
observability, argv and stdio, envelope rendering, and the Bun runtime.

## Errors

Define every tagged error (`Schema.TaggedErrorClass`) in its package's
`errors.ts`, enforced by the `tagged-error-location` ast-grep rule. Errors are
values carried in the Effect error channel, never thrown.

## Moves and deletes

No breadcrumbs. When code moves or is removed, update the callers and delete the
original. No re-export shims, no "// moved to X" comments.

## Planning docs

Date-prefixed planning docs in any `docs/` directory (for example
`docs/2026-06-13-some-plan.md`) are working artifacts. Leave them untracked
unless a human explicitly asks to keep one; use `git add -f` deliberately when
one truly needs to be committed.
