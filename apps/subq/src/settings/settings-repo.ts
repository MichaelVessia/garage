import * as Arr from 'effect/Array'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/unstable/sql'

import { SettingsDatabaseError, UserSettings } from '#shared'
import type { UserSettingsUpdate } from '#shared'

import { SettingsMissingAfterUpsert } from '../errors.js'
import { mapDbError } from '../shared/common/db-error.js'
import { randomUuid } from '../shared/common/random-uuid.js'

// ============================================
// Database Row Schema
// ============================================

const SettingsRow = Schema.Struct({
  id: Schema.String,
  user_id: Schema.String,
  weight_unit: Schema.Literals(['lbs', 'kg'] as const),
  reminders_enabled: Schema.Number,
  created_at: Schema.String,
  updated_at: Schema.String,
})

const decodeSettingsRow = Schema.decodeUnknownEffect(SettingsRow)

// Schema for the partial row used in upsert's existing check
const CurrentSettingsRow = Schema.Struct({
  id: Schema.String,
  weight_unit: Schema.String,
  reminders_enabled: Schema.Number,
})
const decodeCurrentSettingsRow = Schema.decodeUnknownEffect(CurrentSettingsRow)

const settingsRowToDomain = (row: typeof SettingsRow.Type): UserSettings =>
  new UserSettings({
    id: row.id,
    weightUnit: row.weight_unit,
    remindersEnabled: row.reminders_enabled === 1,
    createdAt: DateTime.toDate(DateTime.makeUnsafe(row.created_at)),
    updatedAt: DateTime.toDate(DateTime.makeUnsafe(row.updated_at)),
  })

// ============================================
// Repository Service Definition
// ============================================

export class SettingsRepo extends Context.Service<
  SettingsRepo,
  {
    readonly get: (userId: string) => Effect.Effect<Option.Option<UserSettings>, SettingsDatabaseError>
    readonly upsert: (userId: string, data: UserSettingsUpdate) => Effect.Effect<UserSettings, SettingsDatabaseError>
  }
>()('@garage/subq/settings/settings-repo/SettingsRepo') {}

// ============================================
// Repository Implementation
// ============================================

export const SettingsRepoLive = Layer.effect(
  SettingsRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const get = Effect.fn('SettingsRepo.get')(
      function* (userId: string) {
        const rows = yield* sql`
          SELECT id, user_id, weight_unit, reminders_enabled, created_at, updated_at
          FROM user_settings
          WHERE user_id = ${userId}
        `
        if (Arr.isReadonlyArrayEmpty(rows)) {
          return Option.none()
        }
        const decoded = yield* decodeSettingsRow(rows[0])
        return Option.some(settingsRowToDomain(decoded))
      },
      mapDbError(SettingsDatabaseError, 'query')
    )

    const upsert = Effect.fn('SettingsRepo.upsert')(
      function* (userId: string, data: UserSettingsUpdate) {
        const now = DateTime.formatIso(yield* DateTime.now)

        // Check if settings exist
        const existing =
          yield* sql`SELECT id, weight_unit, reminders_enabled FROM user_settings WHERE user_id = ${userId}`

        if (Arr.isReadonlyArrayEmpty(existing)) {
          // Insert new settings
          const id = yield* randomUuid()
          const weightUnit = data.weightUnit ?? 'lbs'
          const remindersEnabled = data.remindersEnabled ?? true
          yield* sql`
            INSERT INTO user_settings (id, user_id, weight_unit, reminders_enabled, created_at, updated_at)
            VALUES (${id}, ${userId}, ${weightUnit}, ${remindersEnabled ? 1 : 0}, ${now}, ${now})
          `
        } else {
          // Update existing - build update dynamically
          const current = yield* decodeCurrentSettingsRow(existing[0])
          const weightUnit = data.weightUnit ?? current.weight_unit
          const remindersEnabled = data.remindersEnabled ?? current.reminders_enabled === 1
          yield* sql`
            UPDATE user_settings
            SET weight_unit = ${weightUnit}, reminders_enabled = ${remindersEnabled ? 1 : 0}, updated_at = ${now}
            WHERE user_id = ${userId}
          `
        }

        // Fetch and return
        const result = yield* get(userId)
        return yield* Option.match(result, {
          onNone: () =>
            Effect.fail(
              SettingsDatabaseError.make({
                operation: 'query',
                cause: new SettingsMissingAfterUpsert({
                  message: 'Settings not found after upsert',
                }),
              })
            ),
          onSome: Effect.succeed,
        })
      },
      mapDbError(SettingsDatabaseError, 'update')
    )

    return { get, upsert }
  })
)
