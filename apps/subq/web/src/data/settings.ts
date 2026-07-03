import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { Command } from 'foldkit'
import * as AsyncData from 'foldkit/asyncData'
import { m } from 'foldkit/message'

import { DEFAULT_WEIGHT_UNIT, UserSettings, kgToLbs, lbsToKg } from '#shared'
import type { WeightUnit } from '#shared'

import { Api } from '../api.js'

// ============================================
// App-level user settings (weight unit)
// ============================================

export const SettingsData = AsyncData.Schema(UserSettings, Schema.String).schema
export type SettingsData = AsyncData.AsyncData<UserSettings, string>

export const SucceededFetchSettings = m('SucceededFetchSettings', { settings: UserSettings })
export const FailedFetchSettings = m('FailedFetchSettings', { message: Schema.String })

export const FetchSettings = Command.define(
  'FetchSettings',
  SucceededFetchSettings,
  FailedFetchSettings
)(
  Effect.gen(function* () {
    const api = yield* Api
    const settings = yield* api.UserSettingsGet()
    return SucceededFetchSettings({ settings })
  }).pipe(
    Effect.matchCause({
      onFailure: () => FailedFetchSettings({ message: 'Failed to load settings' }),
      onSuccess: (message) => message,
    })
  )
)

// ============================================
// Weight unit helpers (storage is always lbs)
// ============================================

export const weightUnitOf = (settings: SettingsData): WeightUnit => {
  const data = AsyncData.getData(settings)
  return Option.isSome(data) ? data.value.weightUnit : DEFAULT_WEIGHT_UNIT
}

export const remindersEnabledOf = (settings: SettingsData): boolean => {
  const data = AsyncData.getData(settings)
  return Option.isSome(data) ? data.value.remindersEnabled : false
}

export const displayWeight = (unit: WeightUnit, lbs: number): number => (unit === 'kg' ? lbsToKg(lbs) : lbs)

export const toStorageLbs = (unit: WeightUnit, value: number): number => (unit === 'kg' ? kgToLbs(value) : value)

export const formatWeight = (unit: WeightUnit, lbs: number, decimals = 1): string =>
  `${displayWeight(unit, lbs).toFixed(decimals)} ${unit}`
