import cloudflare from '@cloudflare/oxlint-config'
import { defineConfig } from 'oxlint'

const testFiles = ['**/*.{test,spec}.{ts,tsx,js,jsx}', '**/__tests__/**/*.{ts,tsx,js,jsx}', '**/test/**/*.{ts,tsx}']

const cloudflareIgnorePatterns = cloudflare.ignorePatterns ?? []
const cloudflareJsPlugins = cloudflare.jsPlugins ?? []
const cloudflareOverrides = cloudflare.overrides ?? []

export default defineConfig({
  ...cloudflare,
  env: {
    ...cloudflare.env,
    node: true,
    es2022: true,
  },
  ignorePatterns: [
    ...cloudflareIgnorePatterns,
    'dist/**/*',
    'node_modules/**/*',
    '.claude/**',
    'tools/oxlint/anti-slop/**',
  ],
  jsPlugins: [
    ...cloudflareJsPlugins,
    { name: 'anti-slop-effect', specifier: './tools/oxlint/anti-slop/effect/index.ts' },
    { name: 'effect', specifier: 'oxlint-plugin-effect/plugin' },
    { name: 'enfect', specifier: '@enfect/oxlint' },
  ],
  rules: {
    ...cloudflare.rules,

    // Effect and Alchemy expose APIs through namespace imports.
    'import/no-namespace': ['error', { ignore: ['effect', 'effect/**', '@effect/**', 'alchemy', '@alchemy.run/**'] }],

    // Effect AST rules (K-Mistele/anti-slop)
    'anti-slop-effect/no-manual-effect-error-tag': 'error',
    'anti-slop-effect/no-manual-tag-comparison': 'error',
    'anti-slop-effect/no-manual-tagged-construction': 'error',
    'anti-slop-effect/no-manual-tagged-type': 'error',
    'anti-slop-effect/no-ordie-in-service-construction': 'error',
    'anti-slop-effect/no-service-constructor-imports': 'error',
    'anti-slop-effect/no-service-parameters': 'error',
    'anti-slop-effect/no-static-effect-service-forwarders': 'error',
    'anti-slop-effect/no-test-code-in-src': 'error',
    'anti-slop-effect/no-unbounded-retry': 'error',
    'anti-slop-effect/prefer-effect-match': 'error',
    'anti-slop-effect/prefer-tagged-error-handling': 'error',
    'anti-slop-effect/prefer-yield-service': 'error',
    'anti-slop-effect/require-cause-when-narrowing': 'error',
    'anti-slop-effect/require-operation-span': 'error',
    'anti-slop-effect/require-service-make-layer': 'error',
    'anti-slop-effect/stream-large-files': 'error',
    'anti-slop-effect/throw-in-effect-gen': 'error',

    // Effect runtime rules (cevr/effect-oxlint)
    'effect/noAliasTestLayer': 'error',
    'effect/noEagerAcquire': 'error',
    'effect/noManagedRuntimeInEffect': 'error',
    'effect/noPerCallCacheConstruction': 'error',
    'effect/noPointFreeLog': 'error',
    'effect/noRunCollectOnUnboundedStream': 'error',
    'effect/noSilentCatchAll': 'error',
    'effect/noUnboundedConcurrency': 'error',
    'effect/requireSuppressionReason': 'error',
    'effect/requireForceKillAfter': 'error',

    // Effect rules (@enfect/oxlint)
    'enfect/effect-promise-vs-trypromise': 'error',
    'enfect/prefer-redacted-config': 'error',
    'enfect/avoid-option-getorthrow': 'error',
    'enfect/effect-run-in-body': 'error',
    'enfect/no-cause-in-http-response': 'error',
    'enfect/no-effect-ignore-then-as': 'error',
    'enfect/avoid-expect-in-if': 'error',
    'enfect/yield-in-for-loop': 'error',
    'enfect/prefer-duration-constructors': 'error',
    'enfect/avoid-mutable-state': 'error',
    'enfect/prefer-option-over-null': 'error',
  },
  overrides: [
    ...cloudflareOverrides,
    {
      files: testFiles,
      rules: {
        'anti-slop-effect/throw-in-effect-gen': 'off',
        'effect/noUnboundedConcurrency': 'off',
        'enfect/effect-promise-vs-trypromise': 'off',
        'enfect/avoid-option-getorthrow': 'off',
        'enfect/effect-run-in-body': 'off',
      },
    },
    {
      // Real entry points where Effect programs may be executed.
      files: [
        'apps/*/src/main.ts',
        'apps/*/src/worker.ts',
        'apps/*/server/src/worker.ts',
        'apps/*/web/src/worker.ts',
        'apps/*/scripts/**',
        'apps/*/alchemy.run.ts',
      ],
      rules: {
        'enfect/effect-run-in-body': 'off',
      },
    },
  ],
})
