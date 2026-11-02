import * as Schema from 'effect/Schema'

export class DataExportTemporalMigrationRequired extends Schema.TaggedError<
  DataExportTemporalMigrationRequired,
  { readonly brand: unique symbol }
>()('DataExportTemporalMigrationRequired', {
  userId: Schema.String,
  pendingGoals: Schema.Int,
  pendingSchedules: Schema.Int,
  message: Schema.String,
}) {}
