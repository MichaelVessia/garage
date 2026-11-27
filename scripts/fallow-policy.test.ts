import { assert, it } from '@effect/vitest'
import * as Str from 'effect/String'

import fallowConfig from '../.fallowrc.json' with { type: 'json' }
import packageJson from '../package.json' with { type: 'json' }

const deadCodeCommand =
  'fallow dead-code --no-production --unused-files --unused-deps --unresolved-imports --unlisted-deps --circular-deps --re-export-cycles --boundary-violations --policy-violations --stale-suppressions'

it('keeps strict all-code dead-code gate enabled', () => {
  assert.strictEqual(packageJson.scripts['dead-code'], deadCodeCommand)
  assert.strictEqual(Str.includes('bun run dead-code')(packageJson.scripts['validate:fast']), true)
})

it('keeps the complete Fallow configuration narrow and reviewable', () => {
  assert.deepStrictEqual(fallowConfig, {
    $schema: 'https://raw.githubusercontent.com/fallow-rs/fallow/main/schema.json',
    entry: [
      'apps/beltworks/web/index.html',
      'apps/subq/alchemy.run.ts',
      'apps/subq/web/index.html',
      'apps/subq/web/src/worker.ts',
      'apps/logbook/alchemy.run.ts',
      'apps/logbook/web/index.html',
      'apps/logbook/web/src/worker.ts',
    ],
    dynamicallyLoaded: ['tools/oxlint/anti-slop/effect/index.ts'],
    rules: { 'boundary-violation': 'error', 'policy-violation': 'error' },
    ignoreDependencies: ['@enfect/oxlint', '@oxlint/plugins', 'oxlint-plugin-effect'],
    ignoreExports: [
      { file: '**/*.config.{js,mjs,ts}', exports: ['default'] },
      { file: 'apps/subq/alchemy.run.ts', exports: ['default'] },
      { file: 'apps/logbook/alchemy.run.ts', exports: ['default'] },
      { file: 'tools/oxlint/anti-slop/effect/index.ts', exports: ['default'] },
    ],
  })
})
