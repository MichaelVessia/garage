import { assert, it } from '@effect/vitest'
import * as Str from 'effect/String'

import fallowConfig from '../.fallowrc.json' with { type: 'json' }
import packageJson from '../package.json' with { type: 'json' }

const deadCodeCommand =
  "fallow dead-code --no-production --unused-files --unused-deps --unresolved-imports --unlisted-deps --circular-deps --re-export-cycles --boundary-violations --policy-violations --stale-suppressions && fallow dead-code --production --workspace '@garage/*,!@garage/subq' --unused-exports --unused-types --include-entry-exports --type-aware --type-aware-require complete"

it('keeps strict all-code and production API dead-code gates enabled', () => {
  assert.strictEqual(packageJson.scripts['dead-code'], deadCodeCommand)
  assert.strictEqual(Str.includes('bun run dead-code')(packageJson.scripts['validate:fast']), true)
})

it('keeps the complete Fallow configuration narrow and reviewable', () => {
  assert.deepStrictEqual(fallowConfig, {
    $schema: 'https://raw.githubusercontent.com/fallow-rs/fallow/main/schema.json',
    entry: [
      'apps/frame/alchemy.run.ts',
      'apps/frame/web/index.html',
      'apps/subq/alchemy.run.ts',
      'apps/subq/web/index.html',
      'packages/pi-extensions/extensions/*.ts',
    ],
    dynamicallyLoaded: ['tools/oxlint/anti-slop/index.ts'],
    ignorePatterns: ['repos/**'],
    rulePacks: ['fallow/effect-service-boundaries.jsonc'],
    rules: { 'boundary-violation': 'error', 'policy-violation': 'error' },
    boundaries: {
      zones: [
        { name: 'roots', patterns: ['packages/{autocaliweb,sabnzbd}/src/index.ts'] },
        {
          name: 'adapters',
          patterns: ['packages/{autocaliweb,sabnzbd}/src/http.ts', 'packages/{autocaliweb,sabnzbd}/src/opds.ts'],
        },
        {
          name: 'contracts',
          patterns: [
            'packages/{autocaliweb,sabnzbd}/src/services.ts',
            'packages/{autocaliweb,sabnzbd}/src/model.ts',
            'packages/{autocaliweb,sabnzbd}/src/errors.ts',
            'packages/{autocaliweb,sabnzbd}/src/api-schema.ts',
          ],
        },
        { name: 'operations', patterns: ['packages/{autocaliweb,sabnzbd}/src/operations.ts'] },
      ],
      rules: [
        { from: 'roots', allow: ['roots', 'contracts', 'adapters', 'operations'] },
        { from: 'adapters', allow: ['adapters', 'contracts', 'operations'] },
        { from: 'contracts', allow: ['contracts', 'operations'] },
        { from: 'operations', allow: ['contracts', 'operations'] },
      ],
    },
    ignoreDependencies: ['@oxlint/plugins'],
    ignoreExports: [
      { file: '**/*.config.{js,mjs,ts}', exports: ['default'] },
      { file: 'apps/frame/alchemy.run.ts', exports: ['default'] },
      { file: 'apps/subq/src/db/schema.ts', exports: ['*'] },
      { file: 'apps/subq/alchemy.run.ts', exports: ['default'] },
      {
        file: 'packages/autocaliweb/src/index.ts',
        exports: ['AutocaliwebConfig', 'LimitOptions', 'SearchOptions', 'unreachable'],
      },
      { file: 'packages/integration-http/src/index.ts', exports: ['ErrorFailure', 'JsonClientErrors'] },
      { file: 'packages/integration-http/src/testing.ts', exports: ['*'] },
      { file: 'packages/pi-extensions/extensions/*.ts', exports: ['default'] },
      { file: 'packages/pi-extensions/src/gpt-fast-mode.ts', exports: ['decodeConfiguredDefault'] },
      {
        file: 'packages/pi-extensions/src/session-model-default.ts',
        exports: ['decodeModelDefault', 'restoreModelDefault'],
      },
      {
        file: 'packages/sabnzbd/src/index.ts',
        exports: ['DeleteOptions', 'LimitOptions', 'SabnzbdConfig', 'envMissing', 'unreachable'],
      },
      { file: 'tools/oxlint/anti-slop/index.ts', exports: ['default'] },
    ],
  })
})
