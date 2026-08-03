import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { authedRpc, SettingsRpcs } from '#shared'
import type { UserSettingsInitialize, UserSettingsUpdate } from '#shared'

import { SettingsRepo } from './settings-repo.js'

export const SettingsRpcHandlersLive = SettingsRpcs.toLayer(
  Effect.gen(function* () {
    const settingsRepo = yield* SettingsRepo

    const UserSettingsGet = authedRpc('rpc.settings.get', (user, data: UserSettingsInitialize) =>
      Effect.gen(function* () {
        yield* Effect.logDebug('UserSettingsGet called').pipe(
          Effect.annotateLogs({ rpc: 'UserSettingsGet', userId: user.id })
        )

        const result = yield* settingsRepo.initializeTimezone(user.id, data.detectedTimezone)
        yield* Effect.logDebug('UserSettingsGet completed').pipe(
          Effect.annotateLogs({ rpc: 'UserSettingsGet', timezone: result.timezone, weightUnit: result.weightUnit })
        )
        return result
      })
    )

    const UserSettingsUpdate = authedRpc('rpc.settings.update', (user, data: UserSettingsUpdate) =>
      Effect.gen(function* () {
        yield* Effect.logInfo('UserSettingsUpdate called').pipe(
          Effect.annotateLogs({
            rpc: 'UserSettingsUpdate',
            userId: user.id,
            timezone: data.timezone,
            weightUnit: data.weightUnit,
          })
        )
        const current = yield* settingsRepo.get(user.id)
        if (Option.isNone(current) && data.timezone !== undefined) {
          yield* settingsRepo.initializeTimezone(user.id, data.timezone)
        }
        const result = yield* settingsRepo.upsert(user.id, data)
        yield* Effect.logInfo('UserSettingsUpdate completed').pipe(
          Effect.annotateLogs({ rpc: 'UserSettingsUpdate', timezone: result.timezone, weightUnit: result.weightUnit })
        )
        return result
      })
    )

    return {
      UserSettingsGet,
      UserSettingsUpdate,
    }
  })
)
