import effect from '@mpsuesser/oxlint-plugin-effect'
import { defineConfig } from 'oxlint'
import antiSlop from 'ultracite/oxlint/anti-slop'
import core from 'ultracite/oxlint/core'
import vitest from 'ultracite/oxlint/vitest'

const testFiles = ['**/*.{test,spec}.{ts,tsx,js,jsx}', '**/__tests__/**/*.{ts,tsx,js,jsx}', '**/test/**/*.{ts,tsx}']

const baseRestrictedProperties = [
  { object: 'Reflect', property: 'apply', message: 'Call the function directly.' },
  { object: 'Reflect', property: 'get', message: 'Read the property directly from a parsed, typed value.' },
]

const objectHelpers = ['keys', 'values', 'entries', 'fromEntries'].map((property) => ({
  object: 'Object',
  property,
  message: 'Use Record, Struct, or HashMap helpers from Effect instead of native Object helpers.',
}))

const effectProperties = [
  ...['runSync', 'runPromise', 'runFork'].map((property) => ({
    object: 'Effect',
    property,
    message: 'Run Effects only at an entry point. Inside Effect code, yield* the Effect or use Effect.run*With.',
  })),
  {
    object: 'Effect',
    property: 'promise',
    message: 'Use Effect.tryPromise with a typed error. Effect.promise turns a rejection into a defect.',
  },
  {
    property: 'getOrThrow',
    message:
      'Use Option.match, Option.getOrElse, or yield* the Option. getOrThrow throws outside the typed error channel.',
  },
  ...['makeTempFile', 'makeTempDirectory'].map((property) => ({
    property,
    message: 'Use makeTempFileScoped or makeTempDirectoryScoped so the Scope removes the temporary path.',
  })),
]

export default defineConfig({
  extends: [core, antiSlop, vitest],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: ['dist/**/*', 'node_modules/**/*'],
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
      files: testFiles,
      plugins: ['vitest'],
      rules: {
        // `@effect/vitest`'s `layer(L)(name, (it) => ...)` intentionally
        // shadows the module-level `it` with a layer-scoped one.
        'no-shadow': ['error', { allow: ['it'] }],
        'vitest/expect-expect': 'off',
        // `@effect/vitest` registers Effect tests through `it.effect`.
        'vitest/consistent-test-it': ['error', { fn: 'it', withinDescribe: 'it' }],
        'vitest/require-top-level-describe': 'off',
        'vitest/prefer-importing-vitest-globals': 'error',
        'vitest/prefer-to-be-truthy': 'off',
        'vitest/prefer-to-be-falsy': 'off',
        'vitest/valid-expect': 'error',
        'vitest/valid-title': 'error',
        'vitest/prefer-strict-boolean-matchers': 'error',
        'vitest/max-expects': ['error', { max: 20 }],
        'vitest/no-conditional-expect': 'error',
        'vitest/no-standalone-expect': [
          'error',
          { additionalTestBlockFunctions: ['it.effect', 'it.effect.each', 'it.live', 'it.prop', 'it.effect.prop'] },
        ],
        'vitest/no-restricted-vi-methods': [
          'error',
          {
            mock: 'Provide a test Layer or pass the dependency instead of replacing a module.',
            doMock: 'Provide a test Layer or pass the dependency instead of replacing a module.',
          },
        ],
        // The rule matches describe titles by import name only. Titles that
        // name `Effect.fn` wrappers or Layer values would be retitled to
        // `<anonymous>` or `[object Object]` by its autofix.
        'vitest/prefer-describe-function-title': 'off',
        // Its autofix rewrites `toEqual` to `toStrictEqual` in ways that break
        // structural comparisons of Effect data values.
        'vitest/prefer-strict-equal': 'off',
        // `@effect-diagnostics` is a compiler pragma, not an unknown JSDoc tag.
        'jsdoc/check-tag-names': ['error', { definedTags: ['effect-diagnostics'] }],
        // Test scaffolding may compare results with native Object helpers.
        'no-restricted-properties': ['error', ...baseRestrictedProperties, ...effectProperties],

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
    {
      // Test registration rules do not apply to executable fixtures and helpers.
      files: ['**/*.{test,spec}.{ts,tsx,js,jsx}', '**/__tests__/**/*.{ts,tsx,js,jsx}'],
      rules: {
        'vitest/require-hook': ['error', { allowedFunctionCalls: ['layer'] }],
      },
    },
    {
      // Oxlint, Oxfmt, Vitest, Vite, Drizzle, and Alchemy load these entry
      // points through their default-export contracts.
      files: ['**/*.config.{ts,mjs}', '**/alchemy.run.ts', '**/extensions/*.ts'],
      rules: {
        'import/no-default-export': 'off',
      },
    },
  ],
  rules: {
    // All Effect-plugin rules at error; targeted opt-outs live below and in the
    // overrides above.
    ...effect.configs.recommended.rules,

    // Type safety.
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
    'typescript/ban-ts-comment': ['error', { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true }],
    'typescript/explicit-module-boundary-types': 'error',
    'typescript/explicit-member-accessibility': 'error',
    // Type-aware linting applies this rule to Effect, Schema class, and
    // platform values, which are not deeply readonly types. Domain data is
    // kept immutable through `readonly` fields and `ReadonlyArray` instead.
    'typescript/prefer-readonly-parameter-types': 'off',
    'typescript/require-await': 'error',
    'typescript/no-require-imports': 'error',
    'typescript/no-var-requires': 'error',
    'typescript/no-restricted-types': [
      'error',
      {
        types: {
          'Record<string, unknown>': 'Parse the value into a named domain type.',
          'Record<string, any>': 'Parse the value into a named domain type.',
          'Record<PropertyKey, unknown>': 'Parse the value into a named domain type.',
        },
      },
    ],
    '@typescript-eslint/no-inferrable-types': 'error',
    '@typescript-eslint/array-type': ['error', { default: 'generic', readonly: 'generic' }],
    'prefer-as-const': 'error',
    // A Schema value and its type alias share one name by Effect convention;
    // the TypeScript checker already rejects real redeclarations.
    'no-redeclare': 'off',
    'no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        fix: { imports: 'safe-fix', variables: 'off' },
      },
    ],

    // Effect idioms that native Oxlint can express. The ast-grep rules in
    // rules/ cover structural patterns, and the Effect language service
    // covers type-aware diagnostics.
    'no-restricted-properties': ['error', ...baseRestrictedProperties, ...objectHelpers, ...effectProperties],
    // Named value imports from the `effect` barrel load every module.
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'effect',
            allowTypeImports: true,
            message: 'Import the module namespace, for example import * as Effect from "effect/Effect".',
          },
        ],
      },
    ],
    'import/no-nodejs-modules': 'error',
    'import/no-namespace': ['error', { ignore: ['effect', 'effect/**', '@effect/**'] }],
    // Schema and branded factories are callable; constructors still use capitals.
    'new-cap': ['error', { capIsNew: false, newIsCap: true }],

    // Modules.
    'import/export': 'error',
    'import/extensions': 'error',
    'import/no-anonymous-default-export': 'error',
    'import/no-commonjs': 'error',
    'import/no-default-export': 'error',
    'import/no-dynamic-require': 'error',
    'import/no-unassigned-import': 'error',
    'import/unambiguous': 'error',

    // Structure and size.
    complexity: ['error', { max: 20, variant: 'classic' }],
    'max-depth': 'error',
    'max-lines': ['error', { max: 500 }],
    'no-continue': 'error',
    'no-param-reassign': 'error',
    'default-param-last': 'error',
    'init-declarations': 'error',
    'no-console': 'error',
    'no-implicit-coercion': 'error',
    'no-negated-condition': 'error',
    'unicorn/no-negated-condition': 'error',
    'unicorn/no-nested-ternary': 'error',
    'unicorn/no-immediate-mutation': 'error',
    'unicorn/no-process-exit': 'error',
    'unicorn/explicit-length-check': 'error',
    'unicorn/filename-case': 'error',
    'unicorn/import-style': 'error',
    'unicorn/prefer-global-this': 'error',
    'unicorn/prefer-number-coercion': 'error',
    'unicorn/prefer-single-call': 'error',
    'unicorn/prefer-string-raw': 'error',
    'unicorn/prefer-top-level-await': 'error',
    // Check nested declarations and function expressions while allowing small
    // arrow helpers to stay beside the scope that owns them.
    'unicorn/consistent-function-scoping': ['error', { checkArrowFunctions: false }],
    // Captures are parser contracts: name semantic captures and use
    // non-capturing groups when only precedence or repetition is needed.
    'prefer-named-capture-group': 'error',
    'promise/always-return': 'error',
    'promise/catch-or-return': 'error',
    'jsdoc/require-param-type': 'error',
    'jsdoc/require-returns-type': 'error',
    // Doc comments are prose; TypeScript signatures carry parameter and return
    // types, so these tags would only repeat the signature.
    'jsdoc/require-param': 'off',
    'jsdoc/require-returns': 'off',

    // Naming stays under the repository's control.
    'sort-keys': 'off',
    'func-names': 'off',
    'max-classes-per-file': 'off',

    // Conflicts with the Effect language-service `asyncFunction` rule:
    // Effect.tryPromise/Effect.promise thunks must return a Promise without
    // being declared async.
    '@typescript-eslint/promise-function-async': 'off',
    // Effect generators return early from guarded branches by design.
    '@typescript-eslint/consistent-return': 'off',
    'unicorn/prefer-export-from': 'off',
    // Off: no-restricted-properties rejects Reflect.apply.
    'unicorn/prefer-reflect-apply': 'off',
    // Oxlint requires uppercase hex digits while oxfmt rewrites them
    // lowercase. Keep one toolchain authority.
    'unicorn/number-literal-case': 'off',
    // Immutable object updates still allocate. The rule only recognizes native
    // `.map`, so replacing it with `Arr.map` hides the same pattern.
    'oxc/no-map-spread': 'off',
    // Anti-slop turns off the default `record` mode because its autofix loops
    // with `no-known-value-widening`; `index-signature` mode rewrites every
    // `Record<string, V>` into a longer form and prevents no defect.
    'typescript/consistent-indexed-object-style': 'off',

    // `Effect.forEach`, `Option.map`, and `Effect.map(fn)` are module-level
    // Effect combinators, not `Array.prototype` methods. These unicorn rules
    // misfire on them; Effect's own `imperative-loops` rule governs real
    // array iteration.
    'unicorn/no-array-for-each': 'off',
    'unicorn/no-array-method-this-argument': 'off',
    'unicorn/no-array-callback-reference': 'off',

    // `Schema.TaggedError<Self>()(...)` declares an error class; it constructs
    // nothing, but the rule reads any call ending in `Error` as a missing `new`.
    'unicorn/throw-new-error': 'off',

    // prefer-arr-match fires on every `.length` comparison, not just the
    // array empty/non-empty branching `Arr.match` targets; most hits are
    // early-return guards and string-length checks where it does not fit.
    'effect/prefer-arr-match': 'off',

    // Schema struct keys are the wire keys decoded from external service APIs
    // (e.g. `monitored`, `hasFile`, `deleted`, `subscribed`). A boolean field
    // name is the upstream JSON key, not ours to rename; forcing an `is*`
    // prefix would break decoding unless every field carried a `fromKey`
    // remap, which is churn for no safety gain. Off by domain constraint.
    'effect/require-is-prefix-for-boolean-schema-field': 'off',
  },
})
