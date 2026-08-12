# Monorepo conventions

Rules that apply repo-wide. See [AGENTS.md](../../AGENTS.md) for agent-specific
routing and [CONTRIBUTING.md](../../CONTRIBUTING.md) for contributor setup.

## Dependencies

- Shared devDependencies live in the repo-root `package.json`; Bun hoists them.
- Runtime dependencies live in the workspace where they are used.
- First-party `effect`, runtime platform/SQL packages, and `@effect/vitest` use
  the exact same beta: currently `4.0.0-beta.103`. Caret and tilde ranges are not
  allowed for these packages. Tooling such as the language service and lint
  plugin follows its own version line.
- Upgrade the Effect beta atomically: update every first-party manifest, run
  `bun install`, regenerate `bun.nix` with
  `nix develop --command bun2nix -l bun.lock -o bun.nix`, verify stdout
  regeneration with `nix develop --command bun2nix -l bun.lock | diff -u
  bun.nix -`, then run `bunx vitest run scripts/effect-pins.test.ts`,
  `bun install --frozen-lockfile`, and `bun run validate:release`.

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

## Garage CLI platform vocabulary

Use these terms consistently across paired service contexts:

- **Agent-first CLI**, not wrapper, script, or tool: a deterministic executable
  with explicit commands/flags and exactly one JSON envelope on stdout.
- **Self-hosted service**, not backend, target, server, or integration: the
  external system a Garage CLI operates. **Integration** names the owning
  package/app context, not the external system.
- **Integration package**, not core, SDK, or client library: the
  `packages/<svc>` half that owns models, wire decoding, the adapter, errors,
  and domain operations.
- **CLI app**, not frontend, wrapper app, or binary: the thin
  `apps/<svc>-cli` executable edge.
- **Model**, not DTO, interface, or types file: an exported Effect `Schema`
  value and its decoded type.
- **External adapter**, not API wrapper, fetcher, or gateway: the sole module
  that contacts an external system.
- **Domain operation**, not handler, action, or helper: a deterministic typed
  Effect composed by a command.
- **CLI Protocol**, not shared, common, or utils: the owned context at
  `packages/cli-protocol`.
- **Tagged error**, not exception or custom error: a schema-tagged value in an
  Effect error channel.
- **Validation gate**, not build, check, or CI script: `bun run validate`.
- **Workspace**, not module, folder, or component: an independently owned
  package or app.
- **Vendored reference**, not dependency, library, or submodule: read-only
  third-party evidence under `repos/`.

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

For exact Effect v4 API behavior, read the vendored source at `repos/effect/`,
which tracks `Effect-TS/effect` `main` (start at `LLMS.md`, then `ai-docs/`, then
`packages/effect/src/`). Cite it as `repos/effect/<path>:<line>`. Never edit or
import from `repos/`; refresh the subtree only with `bun run vendor:update`.

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

## Testing

Add focused behavior tests for new or changed public behavior. Run tests through
the workspace `test` scripts or `bunx vitest run <file>`; never use `bun test`,
because `@effect/vitest`'s `it.effect` does not behave correctly under Bun's
test runner. For integration seam ownership and the expected mix of operation,
adapter, and wiring tests, follow the
[Effect services guardrail](../guardrails/effect-services-and-layers.md#testing-strategy).

## Moves and deletes

No breadcrumbs. When code moves or is removed, update the callers and delete the
original. No re-export shims, no "// moved to X" comments.

## Planning docs

Date-prefixed planning docs in any `docs/` directory (for example
`docs/2026-06-13-some-plan.md`) are working artifacts. Leave them untracked
unless a human explicitly asks to keep one; use `git add -f` deliberately when
one truly needs to be committed.
