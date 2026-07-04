import type { Frequency } from '#shared'

export const FREQUENCIES: ReadonlyArray<readonly [value: Frequency, label: string]> = [
  ['daily', 'Daily'],
  ['every_3_days', 'Every 3 days'],
  ['weekly', 'Weekly'],
  ['every_2_weeks', 'Every 2 weeks'],
  ['monthly', 'Monthly'],
]

export const frequencyLabel = (frequency: Frequency): string =>
  FREQUENCIES.find(([value]) => value === frequency)?.[1] ?? frequency

export const frequencyFromString = (value: string): Frequency => {
  const frequency = FREQUENCIES.find(([candidate]) => candidate === value)
  return frequency === undefined ? 'weekly' : frequency[0]
}
