import * as Arr from 'effect/Array'
import * as Str from 'effect/String'

/** A construct Android System WebView 106 cannot run, found in a built file. */
export interface CompatFinding {
  readonly file: string
  readonly feature: string
}

interface Rule {
  readonly feature: string
  readonly pattern: RegExp
}

// Chromium 107+ JavaScript APIs that esbuild's chrome106 target does not lower or polyfill.
const JS_RULES: ReadonlyArray<Rule> = [
  { feature: 'Array.prototype.toSorted (Chrome 110)', pattern: /\.toSorted\(/u },
  { feature: 'Array.prototype.toReversed (Chrome 110)', pattern: /\.toReversed\(/u },
  { feature: 'Array.prototype.toSpliced (Chrome 110)', pattern: /\.toSpliced\(/u },
  { feature: 'Array.fromAsync (Chrome 121)', pattern: /Array\.fromAsync\b/u },
  { feature: 'Object.groupBy / Map.groupBy (Chrome 117)', pattern: /\b(?:Object|Map)\.groupBy\(/u },
  { feature: 'Promise.withResolvers (Chrome 119)', pattern: /Promise\.withResolvers\b/u },
  { feature: 'String.prototype.isWellFormed (Chrome 111)', pattern: /\.(?:is|to)WellFormed\(/u },
]

// CSS the frame's WebView rejects; see apps/frame/README.md.
const CSS_RULES: ReadonlyArray<Rule> = [
  { feature: 'oklch()', pattern: /oklch\(/u },
  { feature: 'color-mix()', pattern: /color-mix\(/u },
  { feature: ':has()', pattern: /:has\(/u },
  { feature: 'dynamic viewport units', pattern: /\d(?:dvh|dvw|svh|lvh)\b/u },
  { feature: '4- or 8-digit hex colour', pattern: /#(?:[\da-f]{4}|[\da-f]{8})(?![\da-f])/iu },
  { feature: 'CSS nesting', pattern: /\{[^{}]*&[^{}]*\{/u },
]

/** Report every unsupported construct in one built file's text. */
export const findIncompatibilities = ({
  file,
  text,
}: {
  readonly file: string
  readonly text: string
}): ReadonlyArray<CompatFinding> => {
  const rules = Arr.flatten([Str.endsWith('.css')(file) ? CSS_RULES : [], Str.endsWith('.js')(file) ? JS_RULES : []])

  return Arr.map(
    Arr.filter(rules, (rule) => rule.pattern.test(text)),
    (rule) => ({ file, feature: rule.feature })
  )
}
