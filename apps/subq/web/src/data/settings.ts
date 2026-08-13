import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError'
import { Command } from 'foldkit'
import * as AsyncData from 'foldkit/asyncData'
import { m } from 'foldkit/message'

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
import type { Unauthorized, WeightUnit } from '#shared'

import { Api } from '../api.js'

// ============================================
// App-level user settings
// ============================================

export const SettingsData = AsyncData.Schema(UserSettings, Schema.String).schema
export type SettingsData = AsyncData.AsyncData<UserSettings, string>

export const SucceededFetchSettings = m('SucceededFetchSettings', {
  requestGeneration: Schema.Number,
  settings: UserSettings,
})
export const FailedFetchSettings = m('FailedFetchSettings', {
  message: Schema.String,
  requestGeneration: Schema.Number,
})

type SettingsLoadError = RpcClientError | SettingsDatabaseError | SettingsTemporalMigrationError | Unauthorized

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
  args: { detectedTimezone: IanaTimezone, requestGeneration: Schema.Number },
  messages: [SucceededFetchSettings, FailedFetchSettings],
  execute: ({ detectedTimezone, requestGeneration }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const settings = yield* api.UserSettingsGet(new UserSettingsInitialize({ detectedTimezone }))
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

export const timezoneOf = (settings: SettingsData, detectedTimezone: IanaTimezone): IanaTimezone => {
  const data = AsyncData.getData(settings)
  return Option.isSome(data) ? data.value.timezone : detectedTimezone
}

export const weightUnitOf = (settings: SettingsData): WeightUnit => {
  const data = AsyncData.getData(settings)
  return Option.isSome(data) ? data.value.weightUnit : DEFAULT_WEIGHT_UNIT
}

export const displayWeight = (unit: WeightUnit, lbs: number): number => (unit === 'kg' ? lbsToKg(lbs) : lbs)

export const toStorageLbs = (unit: WeightUnit, value: number): number => (unit === 'kg' ? kgToLbs(value) : value)

export const formatWeight = (unit: WeightUnit, lbs: number, decimals = 1): string =>
  `${displayWeight(unit, lbs).toFixed(decimals)} ${unit}`
