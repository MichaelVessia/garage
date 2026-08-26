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

- **Executor-only integration** — a conventional API imported directly into Executor, with no Garage workspace.
- **Integration package + Garage MCP adapter** — a typed protocol/domain package under `packages/<svc>` plus thin service-prefixed tools in `apps/garage-mcp`.
- **Shared/library package** — reusable code without an executable.
- **Deployed application/worker/web app** — an independently deployed system such as Subq.

HTTP, XML, process, session, or file access is an adapter choice rather than repository taxonomy. Use a separate MCP process only when authority or isolation requires it.

## Integration vocabulary

- **Self-hosted service**: the external system being operated.
- **Integration package**: the workspace owning models, wire decoding, external adapter, errors, and domain operations.
- **Garage MCP adapter**: the delivery-edge code owning MCP names, input schemas, annotations, safe error mapping, and delegation.
- **Model**: an exported Effect `Schema` value and decoded type.
- **External adapter**: the sole module that contacts an external system.
- **Domain operation**: a deterministic typed Effect built over the package API service.
- **CLI Protocol**: the legacy-named package that still owns transport-neutral HTTP/config/schema/test utilities used by retained integrations; its CLI-only surface awaits separate extraction.
- **Tagged error**: a schema-tagged value in an Effect error channel.
- **Validation gate**: `bun run validate`.
- **Workspace**: an independently owned package or app.
- **Vendored reference**: read-only third-party evidence under `repos/`.

## Cross-workspace imports

Never import across workspaces via a relative path. Use the workspace's package name (`@garage/<pkg>`). Garage MCP imports integration packages by name, and each package exposes its public API through its `index.ts` barrel.

Service packages do not import each other or delivery-edge implementation files.

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

## Integration package responsibilities

Typical integration package files are `model.ts` for public domain values, `api-schema.ts` for upstream wire codecs, `errors.ts` for tagged errors, `services.ts` for service interfaces and configuration/policy services, an adapter such as `http.ts` or `process.ts`, `operations.ts` for domain Effects, and `index.ts` for the public barrel. These are responsibilities, not a demand that every workspace contain every filename.

Garage MCP's `main.ts` owns selection and composition of integration, configuration, platform, HTTP server, and toolkit layers. Tool adapter files remain thin and do not seal platform infrastructure into integration packages.

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
