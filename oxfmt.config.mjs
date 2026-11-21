import { defineConfig } from 'oxfmt'
import ultracite from 'ultracite/oxfmt'

const ultraciteIgnorePatterns = ultracite.ignorePatterns ?? []

export default defineConfig({
  ...ultracite,
  printWidth: 120,
  semi: false,
  singleQuote: true,
  ignorePatterns: [
    ...ultraciteIgnorePatterns,
    'tools/oxlint/anti-slop/**',
    '**/*.css',
    '**/*.json',
    '**/*.yaml',
    '**/*.yml',
    '**/*.html',
    '**/*.md',
  ],
})
