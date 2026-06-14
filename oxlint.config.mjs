import effect from '@mpsuesser/oxlint-plugin-effect'
import { defineConfig } from 'oxlint'
import core from 'ultracite/oxlint/core'
import vitest from 'ultracite/oxlint/vitest'

export default defineConfig({
  extends: [core, vitest],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: ['dist/**/*', 'node_modules/**/*', 'repos/**/*'],
  // Registered via jsPlugins (rather than `extends`) so the plugin's private
  // config type does not leak into this module's default-export type.
  jsPlugins: [{ name: 'effect', specifier: '@mpsuesser/oxlint-plugin-effect' }],
  overrides: [
    {
      files: ['**/services/**/*.ts'],
      rules: {
        'unicorn/filename-case': 'off',
      },
    },
    {
      files: ['**/*.{test,spec}.{ts,tsx,js,jsx}', '**/__tests__/**/*.{ts,tsx,js,jsx}', '**/test/**/*.{ts,tsx}'],
      plugins: ['vitest'],
      rules: {
        'no-shadow': ['error', { allow: ['it'] }],
        'vitest/no-standalone-expect': 'off',
        'vitest/prefer-describe-function-title': 'off',
        'vitest/prefer-importing-vitest-globals': 'off',
        'vitest/prefer-strict-equal': 'off',
        'vitest/prefer-to-be-truthy': 'off',
        'vitest/prefer-to-be-falsy': 'off',
        'vitest/valid-expect': 'off',
        'vitest/max-expects': ['error', { max: 20 }],

        // The Effect idiom rules target production domain code, not test
        // scaffolding. Throwing to fail an assertion, checking `x._tag`
        // directly, inline JSON fixtures, native loops/object helpers, and
        // `T | null` fixtures are all correct in tests; type-driven shapes are
        // still enforced by typecheck.
        'effect/avoid-untagged-errors': 'off',
        'effect/avoid-direct-tag-checks': 'off',
        'effect/throw-in-effect-gen': 'off',
        'effect/avoid-direct-json': 'off',
        'effect/prefer-effect-fn': 'off',
        'effect/yield-in-for-loop': 'off',
        'effect/require-effect-concurrency': 'off',
        'effect/avoid-schema-suffix': 'off',
        'effect/avoid-option-getorthrow': 'off',
        'effect/stream-large-files': 'off',
        'effect/avoid-expect-in-if': 'off',
        'effect/avoid-process-env': 'off',
        'effect/require-schema-type-alias': 'off',
        'effect/prefer-match-over-switch': 'off',
        'effect/use-path-service': 'off',
        'effect/prefer-arr-sort': 'off',
        'effect/imperative-loops': 'off',
        'effect/avoid-native-object-helpers': 'off',
        'effect/prefer-option-over-null': 'off',
      },
    },
  ],
  rules: {
    // All Effect-plugin rules at error; targeted opt-outs live below and in the
    // overrides above.
    ...effect.configs.recommended.rules,
    'no-unused-vars': 'warn',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
    'no-param-reassign': 'error',
    'prefer-as-const': 'error',
    'default-param-last': 'error',
    '@typescript-eslint/no-inferrable-types': 'error',
    'sort-keys': 'off',
    'func-names': 'off',
    '@typescript-eslint/array-type': 'off',
    'no-negated-condition': 'off',
    'unicorn/no-negated-condition': 'off',
    'max-classes-per-file': 'off',

    // `Effect.forEach` is a module-level Effect combinator, not
    // `Array.prototype.forEach`. These unicorn rules misfire on it (especially
    // with submodule namespace imports); Effect's own `imperative-loops` rule
    // governs real array iteration. Off to avoid false positives.
    'unicorn/no-array-for-each': 'off',
    'unicorn/no-array-method-this-argument': 'off',

    // prefer-arr-match fires on every `.length` comparison, not just the
    // array empty/non-empty branching `Arr.match` targets; most hits are
    // early-return guards and string-length checks where it does not fit.
    'effect/prefer-arr-match': 'off',

    // prefer-schema-class wants Schema.Class for every named Schema.Struct,
    // but these are decode-only DTOs composed via `.pipe(...)` where a class
    // declaration does not fit, and converting exported structs ripples
    // through every importer. Struct is the intended shape here.
    'effect/prefer-schema-class': 'off',

    // Schema struct keys are the wire keys decoded from external service APIs
    // (e.g. `monitored`, `hasFile`, `deleted`, `subscribed`). A boolean field
    // name is the upstream JSON key, not ours to rename; forcing an `is*`
    // prefix would break decoding unless every field carried a `fromKey`
    // remap, which is churn for no safety gain. Off by domain constraint.
    'effect/require-is-prefix-for-boolean-schema-field': 'off',
  },
})
