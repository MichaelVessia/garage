import * as Schema from 'effect/Schema'

export class SettingsTemporalMigrationError extends Schema.TaggedErrorClass<SettingsTemporalMigrationError>()(
  'SettingsTemporalMigrationError',
  {
    entity: Schema.Literals(['injection_schedule', 'user_goal'] as const),
    recordId: Schema.String,
    field: Schema.Literals(['start_date', 'starting_date', 'target_date'] as const),
    value: Schema.String,
  }
) {}

export class SettingsTimezoneNotInitialized extends Schema.TaggedErrorClass<SettingsTimezoneNotInitialized>()(
  'SettingsTimezoneNotInitialized',
  { userId: Schema.String }
) {}
