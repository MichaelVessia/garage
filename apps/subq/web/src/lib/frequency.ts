import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

import type { Frequency } from '#shared'

export const FREQUENCIES: ReadonlyArray<readonly [value: Frequency, label: string]> = [
  ['daily', 'Daily'],
  ['every_3_days', 'Every 3 days'],
  ['weekly', 'Weekly'],
  ['every_2_weeks', 'Every 2 weeks'],
  ['monthly', 'Monthly'],
]

export const frequencyLabel = (frequency: Frequency): string =>
  Arr.findFirst(FREQUENCIES, ([value]) => value === frequency).pipe(
    Option.match({ onNone: () => frequency, onSome: ([, label]) => label })
  )

export const frequencyFromString = (value: string): Frequency =>
  Arr.findFirst(FREQUENCIES, ([candidate]) => candidate === value).pipe(
    Option.match({ onNone: (): Frequency => 'weekly', onSome: ([frequency]) => frequency })
  )
