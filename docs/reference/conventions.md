# Monorepo conventions

Rules that apply repo-wide. See [AGENTS.md](../../AGENTS.md) for agent-specific
routing and [CONTRIBUTING.md](../../CONTRIBUTING.md) for contributor setup.

## Dependencies

- Shared devDependencies live in the repo-root `package.json`; Bun hoists them.
- Runtime dependencies live in the workspace where they are used.
- First-party `effect`, runtime platform/SQL packages, and `@effect/vitest` use
  the exact same version: currently `4.1.2`. Caret and tilde ranges are not
  allowed for these packages. Tooling such as the language service and lint
  plugin follows its own version line.
- Upgrade Effect atomically: update every first-party manifest, run
  `bun install`, then run `bunx vitest run scripts/effect-pins.test.ts`,
  `bun install --frozen-lockfile`, and `bun run validate:release`.

## Workspace archetypes

Choose the smallest truthful ownership shape:

- **Executor v2 app (outside Garage)** — homelab or third-party service integrations run directly as Executor v2 TypeScript apps, with no Garage workspace.
- **Shared/library package** — reusable code under `packages/<name>` without an executable.
- **Deployed application/worker/web app** — an independently deployed system under `apps/<name>` such as Subq.

HTTP, XML, process, session, or file access is an adapter choice rather than repository taxonomy.

## Vocabulary

- **Model**: an exported Effect `Schema` value and decoded type.
- **External adapter**: the sole module that contacts an external system.
- **Domain operation**: a deterministic typed Effect built over a narrow service contract.
- **Tagged error**: a schema-tagged value in an Effect error channel.
- **Validation gate**: `bun run validate`.
- **Workspace**: an independently owned package or app.

## Cross-workspace imports

Never import across workspaces via a relative path. Use the workspace's package name (`@garage/<pkg>`), and expose each shared package's public API through its `index.ts` barrel. Never import production code from another app.

## Type safety

No `any`, no non-null assertion (`!`), no type assertions (`as Type`,
`<Type>x`). This applies everywhere, including tests, and is enforced by oxlint
(`@typescript-eslint/no-explicit-any`, `no-non-null-assertion`,
`consistent-type-assertions: never`). For unknown input, decode with
`Schema.decodeUnknown(...)` rather than asserting. The ast-grep rules
`no-unsafe-typecast-at-boundary` and `no-typed-boundary-assignment` catch the
boundary-data form specifically.

## Effect idioms

Effect idioms are enforced mechanically by the Effect language-service
diagnostics (`tsconfig.base.json`, all at error), the oxlint Effect plugin and
native rules (`oxlint.config.mjs`), and the repo-specific `rules/effect/`
ast-grep checks.
That tooling is the source of truth for the mechanical idioms; do not add an
ast-grep rule that duplicates an oxlint plugin rule.

Judgment the lints cannot check (where layers are provided, what a service
requires, what the tests prove) lives in
[docs/guardrails/](../guardrails/README.md).

## Package and application responsibilities

Keep platform requirements visible in adapters and select concrete infrastructure in the application composition root (`main.ts` or `worker.ts`). Do not seal concrete platform layers into reusable library or domain modules.

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
