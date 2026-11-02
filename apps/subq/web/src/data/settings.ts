import * as Effect from 'effect/Effect'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { AsyncData, Command } from 'foldkit'
import { taggedStruct } from 'foldkit/schema'

import {
  DEFAULT_WEIGHT_UNIT,
  IanaTimezone,
  SettingsDatabaseError,
  SettingsTemporalMigrationError,
  UserSettings,
  UserSettingsInitialize,
  kgToLbs,
  lbsToKg,
} from '#shared'
import type { WeightUnit } from '#shared'

import { Api } from '../api.js'

// ============================================
// App-level user settings
// ============================================

export const SettingsData = AsyncData.Schema(UserSettings, Schema.String).schema

export type SettingsData = AsyncData.AsyncData<UserSettings, string>

export const SucceededFetchSettings = taggedStruct('SucceededFetchSettings', {
  requestGeneration: Schema.Int,
  settings: UserSettings,
})

export const FailedFetchSettings = taggedStruct('FailedFetchSettings', {
  message: Schema.String,
  requestGeneration: Schema.Int,
})

type SettingsLoadError = Effect.Error<ReturnType<Api['Service']['UserSettingsGet']>>

export const settingsLoadErrorMessage = (error: SettingsLoadError): string => {
  if (Schema.is(SettingsTemporalMigrationError)(error)) {
    return `Timezone migration could not convert ${error.entity} record '${error.recordId}', field '${error.field}', value '${error.value}'. Correct the stored value and retry.`
  }

  if (Schema.is(SettingsDatabaseError)(error)) {
    const cause = String(error.cause)

    return `Settings database ${error.operation} failed: ${cause}. Retry after correcting the problem.`
  }

  return 'Failed to load settings. Retry, or check the service logs if the problem continues.'
}

export const FetchSettings = Command.define('FetchSettings', {
  args: { detectedTimezone: IanaTimezone, requestGeneration: Schema.Int },
  messages: [SucceededFetchSettings, FailedFetchSettings],
  execute: ({ detectedTimezone, requestGeneration }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const settings = yield* api.UserSettingsGet(UserSettingsInitialize.make({ detectedTimezone }))

      return SucceededFetchSettings({ requestGeneration, settings })
    }).pipe(
      Effect.catchTags({
        RpcClientError: (error) =>
          Effect.succeed(FailedFetchSettings({ message: settingsLoadErrorMessage(error), requestGeneration })),
        SettingsDatabaseError: (error) =>
          Effect.succeed(FailedFetchSettings({ message: settingsLoadErrorMessage(error), requestGeneration })),
        SettingsTemporalMigrationError: (error) =>
          Effect.succeed(FailedFetchSettings({ message: settingsLoadErrorMessage(error), requestGeneration })),
        Unauthorized: (error) =>
          Effect.succeed(FailedFetchSettings({ message: settingsLoadErrorMessage(error), requestGeneration })),
      })
    ),
})

// ============================================
// Weight unit helpers (storage is always lbs)
// ============================================

export const timezoneOf: {
  (detectedTimezone: IanaTimezone): (settings: SettingsData) => IanaTimezone
  (settings: SettingsData, detectedTimezone: IanaTimezone): IanaTimezone
} = Function.dual(2, (settings: SettingsData, detectedTimezone: IanaTimezone): IanaTimezone => {
  const data = AsyncData.getData(settings)

  return Option.isSome(data) ? data.value.timezone : detectedTimezone
})

export const weightUnitOf = (settings: SettingsData): WeightUnit => {
  const data = AsyncData.getData(settings)

  return Option.isSome(data) ? data.value.weightUnit : DEFAULT_WEIGHT_UNIT
}

export const displayWeight: {
  (lbs: number): (unit: WeightUnit) => number
  (unit: WeightUnit, lbs: number): number
} = Function.dual(2, (unit: WeightUnit, lbs: number): number => (unit === 'kg' ? lbsToKg(lbs) : lbs))

export const toStorageLbs: {
  (value: number): (unit: WeightUnit) => number
  (unit: WeightUnit, value: number): number
} = Function.dual(2, (unit: WeightUnit, value: number): number => (unit === 'kg' ? kgToLbs(value) : value))

export const formatWeight: {
  (lbs: number): (unit: WeightUnit) => string
  (unit: WeightUnit, lbs: number): string
} = Function.dual(2, (unit: WeightUnit, lbs: number): string => `${displayWeight(unit, lbs).toFixed(1)} ${unit}`)
