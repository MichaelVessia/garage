# ADR 0003: Enforce the complete Effect and native lint policy

- Status: accepted
- Date: 2026-11-02

## Context

The validation gate type-checked with plain `tsc`, so the Effect language
service only reported the diagnostics that `tsc` loaded, and many diagnostics
stayed at their defaults. Oxlint used the Effect plugin but left out many
native rules for module shape, size, and explicit boundaries. The
`@effect/vitest` pin also required Vitest 5 while the repository used Vitest 4.

## Decision

- Type-check every project with `effect-tsgo tsrs --noEmit`, the
  Effect-patched tsrs checker that ships with `@effect/tsgo`.
- Configure every diagnostic that the installed `@effect/tsgo` declares as an
  error in `tsconfig.base.json`. `scripts/effect-diagnostics.test.ts` fails when
  an upgrade adds a diagnostic that the configuration does not name.
  `apiStabilityLeak` is off: it guards published library surfaces, and Garage
  workspaces are private.
- Keep `unstableApiUsage` on. Record each accepted unstable module in
  `allowedUnstableApis`, so a new unstable dependency is a reviewed change.
- Add the compiler strictness flags `noUnusedLocals`, `noUnusedParameters`,
  `noImplicitReturns`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
  `allowUnreachableCode: false`, and `allowUnusedLabels: false`.
- Lint with `--deny-warnings` and
  `--report-unused-disable-directives-severity=error`. Enable the native rules
  for explicit module boundary types, module shape, file size (500 lines),
  restricted Effect runners, restricted `Object` helpers, and `effect` barrel
  imports. `oxlint.config.mjs` records the reason for each rule that stays off.
- Add the `effect-fn-span-name`, `no-cascading-layer-provide`,
  `no-reprovide-ambient-service`, and `no-native-collections` structural rules,
  and scope all structural rules to `apps/`, `packages/`, and `scripts/`.
- Enforce service boundaries in the integration packages with Fallow zones and
  `fallow/effect-service-boundaries.jsonc`. Contracts and operations cannot
  import adapters or concrete runtimes.
- Pin TypeScript `7.1.0-beta` so that the patched editor server reports the
  same diagnostics as tsrs.

The source was migrated in the same change. Exceptions are single-line
suppressions with a stated reason; there are no file-level exceptions or
baselines.

## Consequences

New code cannot use the rejected patterns, and editor diagnostics match the
gate. Upgrades of `@effect/tsgo`, Oxlint, or Ultracite can add findings that
must be fixed or decided before the upgrade merges. Exported helpers carry
pipeable or options-object signatures, Schema classes carry brands and use
`.make`, and native array, string, and record helpers give way to Effect
modules. Span names changed to dotted lower camel case, so trace queries that
use the old names need an update.

## Alternatives considered

- Keep plain `tsc` with a partial diagnostic list. This leaves the gate weaker
  than the editor and lets upgrades add rules that never fail.
- Adopt the new rules with a violation baseline. A baseline hides the cost of
  each rule and lets violations persist indefinitely.
- Enable `typescript/prefer-readonly-parameter-types`. Type-aware linting
  applies it to Effect, Schema class, and platform values, which are not deeply
  readonly types, so it rejects correct code.
