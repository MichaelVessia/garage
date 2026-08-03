import * as Schema from 'effect/Schema'
import { Rpc, RpcGroup } from 'effect/unstable/rpc'

import { AuthRpcMiddleware } from '../auth-middleware.js'
import { IanaTimezone } from '../calendar/domain.js'
import { SettingsTemporalMigrationError } from './errors.js'

// ============================================
// Settings Errors (defined inline like Goals)
// ============================================

export class SettingsDatabaseError extends Schema.TaggedClass<SettingsDatabaseError>()('SettingsDatabaseError', {
  operation: Schema.Literals(['insert', 'update', 'query'] as const),
  cause: Schema.Defect(),
}) {}

// ============================================
// Settings Types (defined inline)
// ============================================

export class UserSettings extends Schema.Class<UserSettings>('UserSettings')({
  id: Schema.String,
  weightUnit: Schema.Literals(['lbs', 'kg'] as const),
  timezone: IanaTimezone,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export class UserSettingsInitialize extends Schema.Class<UserSettingsInitialize>('UserSettingsInitialize')({
  detectedTimezone: IanaTimezone,
}) {}

export class UserSettingsUpdate extends Schema.Class<UserSettingsUpdate>('UserSettingsUpdate')({
  weightUnit: Schema.optional(Schema.Literals(['lbs', 'kg'] as const)),
  timezone: Schema.optional(IanaTimezone),
}) {}

// ============================================
// Settings RPCs
// ============================================

export const SettingsRpcs = RpcGroup.make(
  Rpc.make('UserSettingsGet', {
    payload: UserSettingsInitialize,
    success: UserSettings,
    error: Schema.Union([SettingsDatabaseError, SettingsTemporalMigrationError]),
  }),
  Rpc.make('UserSettingsUpdate', {
    payload: UserSettingsUpdate,
    success: UserSettings,
    error: Schema.Union([SettingsDatabaseError, SettingsTemporalMigrationError]),
  })
).middleware(AuthRpcMiddleware)
