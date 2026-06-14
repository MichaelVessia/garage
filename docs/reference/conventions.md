# Monorepo conventions

Rules that apply repo-wide. See [AGENTS.md](../../AGENTS.md) for agent-specific
routing and [CONTRIBUTING.md](../../CONTRIBUTING.md) for contributor setup.

## Dependencies

- Shared devDependencies live in the repo-root `package.json`; Bun hoists them.
- Runtime dependencies live in the workspace where they are used.
- The Effect version is pinned to an exact beta. Betas break between releases,
  so the pin moves only as a deliberate update.

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

## Errors

Define every tagged error (`Data.TaggedError` / `Schema.ErrorClass`) in its
package's `errors.ts`, enforced by the `tagged-error-location` ast-grep rule.
Errors are values carried in the Effect error channel, never thrown.

## Moves and deletes

No breadcrumbs. When code moves or is removed, update the callers and delete the
original. No re-export shims, no "// moved to X" comments.

## Planning docs

Date-prefixed planning docs in any `docs/` directory (for example
`docs/2026-06-13-some-plan.md`) are working artifacts. Leave them untracked
unless a human explicitly asks to keep one; use `git add -f` deliberately when
one truly needs to be committed.
