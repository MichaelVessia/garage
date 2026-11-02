import * as BunServices from '@effect/platform-bun/BunServices'
import { assert, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as R from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import packageJson from '../package.json' with { type: 'json' }
import tsconfig from '../tsconfig.base.json' with { type: 'json' }

// The Effect language service ships its full diagnostic list in the schema of
// the installed @effect/tsgo. Every diagnostic must be configured, so a
// toolchain upgrade cannot add a rule that silently stays at its default.
// Deprecated aliases are excluded: configuring one fails the type check with a
// deprecatedRuleName warning, and its replacement rules are configured instead.
const TsgoSchema = Schema.fromJsonString(
  Schema.Struct({
    definitions: Schema.Struct({
      effectLanguageServicePluginDiagnosticSeverityDefinition: Schema.Struct({
        properties: Schema.Record(Schema.String, Schema.Struct({ description: Schema.String })),
      }),
    }),
  })
)

// Reports unstable types in exported signatures. It serves published libraries;
// Garage workspaces are private, and allowedUnstableApis records each accepted
// unstable module.
const offDiagnostics = ['apiStabilityLeak']

const [plugin] = tsconfig.compilerOptions.plugins

it.effect('configures every Effect language-service diagnostic as an error', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem

    const schema = yield* fs
      .readFileString('node_modules/@effect/tsgo/schema.json')
      .pipe(Effect.flatMap(Schema.decodeEffect(TsgoSchema)))

    const available = R.keys(
      R.filter(
        schema.definitions.effectLanguageServicePluginDiagnosticSeverityDefinition.properties,
        ({ description }) => !Str.startsWith('Deprecated:')(description)
      )
    )

    const configured: Readonly<Record<string, string>> = plugin?.diagnosticSeverity ?? {}

    assert.deepStrictEqual(Arr.sort(R.keys(configured), Str.Order), Arr.sort(available, Str.Order))
    assert.deepStrictEqual(R.keys(R.filter(configured, (severity) => severity !== 'error')), offDiagnostics)
  }).pipe(Effect.provide(BunServices.layer))
)

it('fails the type check on every Effect diagnostic severity', () => {
  assert.strictEqual(plugin?.ignoreEffectErrorsInTscExitCode, false)
  assert.strictEqual(plugin?.ignoreEffectWarningsInTscExitCode, false)
  assert.strictEqual(plugin?.ignoreEffectSuggestionsInTscExitCode, false)
  assert.strictEqual(plugin?.includeSuggestionsInTsc, true)
  assert.deepStrictEqual(plugin?.namespaceImportPackages, ['effect'])
})

it('type-checks with the Effect-patched tsrs checker', () => {
  assert.strictEqual(
    packageJson.scripts.typecheck,
    "effect-tsgo tsrs --noEmit --project tsconfig.scripts.json && bun run --filter '*' typecheck"
  )
})
