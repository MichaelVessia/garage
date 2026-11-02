import * as Schema from 'effect/Schema'

export class DataExportTemporalMigrationRequired extends Schema.TaggedError<DataExportTemporalMigrationRequired>()(
  'DataExportTemporalMigrationRequired',
  {
    userId: Schema.String,
    pendingGoals: Schema.Number,
    pendingSchedules: Schema.Number,
    message: Schema.String,
  }
) {}
