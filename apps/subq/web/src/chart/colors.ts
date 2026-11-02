import * as Arr from 'effect/Array'
import * as HashMap from 'effect/HashMap'
import * as Option from 'effect/Option'
import * as Str from 'effect/String'

// ============================================
// Colors (ported from chart-colors.ts)
// ============================================

const DOSE_COLORS = HashMap.make(
  ['2.5', '#64748b'],
  ['5', '#0891b2'],
  ['7.5', '#0d9488'],
  ['10', '#059669'],
  ['12.5', '#7c3aed'],
  ['15', '#be185d']
)

const FALLBACK_COLORS = ['#0891b2', '#059669', '#7c3aed', '#be185d', '#f59e0b', '#10b981', '#6366f1', '#ec4899']

export const getDoseColor = (keyOrDose: string | number): string => {
  const key = String(keyOrDose)
  const parts = Str.split(key, '::')
  const doseMg = parts.length === 2 ? (parts[1] ?? key) : key
  const mapped = HashMap.get(DOSE_COLORS, doseMg)

  if (Option.isSome(mapped)) {
    return mapped.value
  }

  const hash = Arr.reduce(
    Array.from(key, (char) => Str.codePointAt(char, 0).pipe(Option.getOrElse(() => 0))),
    0,
    (sum, code) => sum + code
  )

  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length] ?? '#0891b2'
}

export const CHART_COLORS = ['#0891b2', '#059669', '#7c3aed', '#be185d', '#64748b', '#f59e0b', '#10b981', '#6366f1']
