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
    { name: 'anti-slop', specifier: './tools/oxlint/anti-slop/index.ts' },
    { name: 'anti-slop-effect', specifier: './tools/oxlint/anti-slop/effect/index.ts' },
    { name: 'landmines', specifier: './tools/oxlint/anti-slop/plugins/landmines.ts' },
    { name: 'ai-guard', specifier: './tools/oxlint/anti-slop/plugins/ai-guard.ts' },
    { name: 'effect', specifier: './tools/oxlint/anti-slop/plugins/effect.ts' },
    { name: 'enfect', specifier: './tools/oxlint/anti-slop/plugins/enfect.ts' },
  ],
  rules: {
    ...cloudflare.rules,

    // Companion native rules from K-Mistele/anti-slop
    'oxc/no-accumulating-spread': 'error',
    complexity: ['error', { max: 15 }],
    'typescript/no-non-null-assertion': 'error',
    // Effect v4 requires namespace imports (`preferNamespaceImport` in tsconfig.base.json).
    'import/no-namespace': ['error', { ignore: ['effect', 'effect/**', '@effect/**'] }],

    // Core anti-slop rules
    'anti-slop/max-ternary-depth': ['error', { maxDepth: 2 }],
    'anti-slop/no-array-filter-map': 'error',
    'anti-slop/no-chained-type-assertions': 'error',
    'anti-slop/no-conditional-spread': 'error',
    'anti-slop/no-dev-env-branch': 'error',
    'anti-slop/no-disabled-type-assertion-rules': 'error',
    'anti-slop/no-instanceof': 'error',
    'anti-slop/no-known-value-widening': 'error',
    'anti-slop/no-module-mocking': 'error',
    'anti-slop/no-object-parameters': 'error',
    'anti-slop/no-reduce-accumulator-copy': 'error',
    'anti-slop/no-reflect-apply': 'error',
    'anti-slop/no-reflect-get': 'error',
    'anti-slop/no-reprovide-ambient-service': 'error',
    'anti-slop/no-runtime-typeof': 'error',
    'anti-slop/no-shape-in-symbol-names': 'error',
    'anti-slop/no-unknown-parameters': 'error',
    'anti-slop/no-unknown-returns': 'error',
    'anti-slop/no-unknown-type-aliases': 'error',
    'anti-slop/no-unsafe-dictionary-type': 'error',
    'anti-slop/no-widen-then-assert': 'error',
    'anti-slop/require-readable-spacing': 'error',
    'anti-slop/require-safety-comment-for-type-assertion': 'error',

    // Test-honesty rules (@interfere/landmines)
    'landmines/strict-msw': 'error',
    'landmines/no-fixed-sleep': 'error',
    'landmines/no-unsignaled-poll': 'error',
    'landmines/no-flake-masking': 'error',

    // AI-shortcut rules (eslint-plugin-ai-guard)
    'ai-guard/no-placeholder-implementation': 'error',
    'ai-guard/no-test-env-branch': 'error',
    'ai-guard/no-tautological-assertion': 'error',
    'ai-guard/no-assertionless-test': 'error',
    'ai-guard/no-undeclared-import': 'error',
    'ai-guard/no-silent-fallback': 'error',

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
        complexity: 'off',
        'anti-slop-effect/throw-in-effect-gen': 'off',
        'effect/noUnboundedConcurrency': 'off',
        'enfect/effect-promise-vs-trypromise': 'off',
        'enfect/avoid-option-getorthrow': 'off',
        'enfect/effect-run-in-body': 'off',
      },
    },
    {
      // Real entry points where Effect programs may be executed.
      files: ['apps/*/src/main.ts', 'apps/*/src/worker.ts', 'apps/*/scripts/**', 'apps/*/alchemy.run.ts'],
      rules: {
        'enfect/effect-run-in-body': 'off',
      },
    },
  ],
})
