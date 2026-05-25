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
  overrides: [
    {
      files: ['**/services/**/*.ts'],
      rules: {
        'unicorn/filename-case': 'off',
      },
    },
    {
      files: ['**/*.{test,spec}.{ts,tsx,js,jsx}', '**/__tests__/**/*.{ts,tsx,js,jsx}'],
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
      },
    },
  ],
  rules: {
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
  },
})
