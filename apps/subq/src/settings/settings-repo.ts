import * as Arr from 'effect/Array'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/unstable/sql'

import {
  CalendarDate,
  IanaTimezone,
  SettingsDatabaseError,
  addCalendarDays,
  calendarDateStartUtc,
  SettingsTemporalMigrationError,
  UserSettings,
  projectInstantToCalendarDate,
} from '#shared'
import type { UserSettingsUpdate } from '#shared'

import { SettingsMissingAfterUpsert } from '../errors.js'
import { mapDbError } from '../shared/common/db-error.js'
import { randomUuid } from '../shared/common/random-uuid.js'

const SettingsRow = Schema.Struct({
  id: Schema.String,
  user_id: Schema.String,
  weight_unit: Schema.Literals(['lbs', 'kg'] as const),
  timezone: Schema.NullOr(IanaTimezone),
  timezone_migration_state: Schema.Literals(['pending', 'complete'] as const),
  created_at: Schema.String,
  updated_at: Schema.String,
})

const LegacyScheduleDateRow = Schema.Struct({
  id: Schema.String,
  start_date: Schema.String,
})

const LegacyGoalDateRow = Schema.Struct({
  id: Schema.String,
  starting_date: Schema.String,
  target_date: Schema.NullOr(Schema.String),
})

const decodeSettingsRow = Schema.decodeUnknownEffect(SettingsRow)
const decodeLegacyScheduleRows = Schema.decodeUnknownEffect(Schema.Array(LegacyScheduleDateRow))
const decodeLegacyGoalRows = Schema.decodeUnknownEffect(Schema.Array(LegacyGoalDateRow))
const decodeLegacyInstant = Schema.decodeUnknownOption(Schema.DateTimeUtcFromString)

const settingsRowToDomain = (row: typeof SettingsRow.Type, timezone: IanaTimezone): UserSettings =>
  new UserSettings({
    id: row.id,
    weightUnit: row.weight_unit,
    timezone,
    createdAt: DateTime.toDate(DateTime.makeUnsafe(row.created_at)),
    updatedAt: DateTime.toDate(DateTime.makeUnsafe(row.updated_at)),
  })

const temporalMigrationError = (
  entity: 'injection_schedule' | 'user_goal',
  recordId: string,
  field: 'start_date' | 'starting_date' | 'target_date',
  value: string
) => SettingsTemporalMigrationError.make({ entity, field, recordId, value })

// This is only called for calendar_date_migrated = 0 rows, explicit
// provenance assigned by 0014 to pre-migration data. All supported post-0014
// app/import writers set the marker to 1, so arbitrary modern bare dates never
// reach this recovery. Legacy inputs were converted from local midnight to UTC
// and truncated to YYYY-MM-DD: positive offsets lost one day, while negative
// and zero offsets retained it. Invert that encoding by checking whether the
// next local midnight would have produced this stored UTC date-part.
const recoverLegacyCalendarDate = (date: CalendarDate, timezone: IanaTimezone): CalendarDate => {
  const positiveOffsetCandidate = addCalendarDays(date, 1)
  const candidateStoredDate = calendarDateStartUtc(positiveOffsetCandidate, timezone).pipe(DateTime.formatIsoDateUtc)
  return candidateStoredDate === date ? positiveOffsetCandidate : date
}

const convertLegacyPlannedDate = (
  value: string,
  timezone: IanaTimezone,
  context: {
    readonly entity: 'injection_schedule' | 'user_goal'
    readonly recordId: string
    readonly field: 'start_date' | 'starting_date' | 'target_date'
  }
): Effect.Effect<CalendarDate, SettingsTemporalMigrationError> => {
  if (Schema.is(CalendarDate)(value)) {
    return Effect.succeed(recoverLegacyCalendarDate(value, timezone))
  }
  if (!value.endsWith('Z')) {
    return Effect.fail(temporalMigrationError(context.entity, context.recordId, context.field, value))
  }
  return Option.match(decodeLegacyInstant(value), {
    onNone: () => Effect.fail(temporalMigrationError(context.entity, context.recordId, context.field, value)),
    onSome: (instant) => Effect.succeed(projectInstantToCalendarDate(instant, timezone)),
  })
}

interface ConvertedGoalDates {
  readonly id: string
  readonly startingDate: CalendarDate
  readonly targetDate: Option.Option<CalendarDate>
}

interface ConvertedScheduleDate {
  readonly id: string
  readonly startDate: CalendarDate
}

export class SettingsRepo extends Context.Service<
  SettingsRepo,
  {
    readonly get: (userId: string) => Effect.Effect<Option.Option<UserSettings>, SettingsDatabaseError>
    readonly initializeTimezone: (
      userId: string,
      detectedTimezone: IanaTimezone
    ) => Effect.Effect<UserSettings, SettingsDatabaseError | SettingsTemporalMigrationError>
    readonly upsert: (userId: string, data: UserSettingsUpdate) => Effect.Effect<UserSettings, SettingsDatabaseError>
  }
>()('@garage/subq/settings/settings-repo/SettingsRepo') {}

export const SettingsRepoLive = Layer.effect(
  SettingsRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const readRow = Effect.fn('SettingsRepo.readRow')(
      function* (userId: string) {
        const rows = yield* sql`
          SELECT id, user_id, weight_unit, timezone, timezone_migration_state, created_at, updated_at
          FROM user_settings
          WHERE user_id = ${userId}
        `
        if (Arr.isReadonlyArrayEmpty(rows)) {
          return Option.none<typeof SettingsRow.Type>()
        }
        return Option.some(yield* decodeSettingsRow(rows[0]))
      },
      mapDbError(SettingsDatabaseError, 'query')
    )

    const get = Effect.fn('SettingsRepo.get')(function* (userId: string) {
      const row = yield* readRow(userId)
      return Option.flatMap(row, (settings) =>
        settings.timezone === null || settings.timezone_migration_state !== 'complete'
          ? Option.none()
          : Option.some(settingsRowToDomain(settings, settings.timezone))
      )
    })

    const initializeTimezone = Effect.fn('SettingsRepo.initializeTimezone')(function* (
      userId: string,
      detectedTimezone: IanaTimezone
    ) {
      const now = DateTime.formatIso(yield* DateTime.now)
      const claimId = yield* randomUuid().pipe(mapDbError(SettingsDatabaseError, 'insert'))

      // Claim the migration timezone in the same statement that arbitrates the
      // unique user row. A losing request can help complete the winner's
      // durable claim, but can never convert with its own detected timezone.
      yield* sql`
        INSERT INTO user_settings (
          id, user_id, weight_unit, timezone, timezone_migration_state, created_at, updated_at
        )
        VALUES (${claimId}, ${userId}, 'lbs', ${detectedTimezone}, 'pending', ${now}, ${now})
        ON CONFLICT(user_id) DO UPDATE SET
          timezone = CASE
            WHEN user_settings.timezone IS NULL THEN excluded.timezone
            ELSE user_settings.timezone
          END,
          timezone_migration_state = CASE
            WHEN user_settings.timezone IS NULL THEN 'pending'
            ELSE user_settings.timezone_migration_state
          END,
          updated_at = CASE
            WHEN user_settings.timezone IS NULL THEN excluded.updated_at
            ELSE user_settings.updated_at
          END
      `.pipe(mapDbError(SettingsDatabaseError, 'insert'))

      const claimed = yield* readRow(userId)
      if (Option.isNone(claimed) || claimed.value.timezone === null) {
        return yield* Effect.fail(
          SettingsDatabaseError.make({
            operation: 'query',
            cause: new SettingsMissingAfterUpsert({ message: 'Settings timezone claim was not persisted' }),
          })
        )
      }
      const claimedTimezone = claimed.value.timezone
      if (claimed.value.timezone_migration_state === 'complete') {
        return settingsRowToDomain(claimed.value, claimedTimezone)
      }

      const rawScheduleRows = yield* sql`
        SELECT id, start_date
        FROM injection_schedules
        WHERE user_id = ${userId} AND calendar_date_migrated = 0
      `.pipe(mapDbError(SettingsDatabaseError, 'query'))
      const rawGoalRows = yield* sql`
        SELECT id, starting_date, target_date
        FROM user_goals
        WHERE user_id = ${userId} AND calendar_date_migrated = 0
      `.pipe(mapDbError(SettingsDatabaseError, 'query'))
      const scheduleRows = yield* decodeLegacyScheduleRows(rawScheduleRows).pipe(
        mapDbError(SettingsDatabaseError, 'query')
      )
      const goalRows = yield* decodeLegacyGoalRows(rawGoalRows).pipe(mapDbError(SettingsDatabaseError, 'query'))

      const schedules: ReadonlyArray<ConvertedScheduleDate> = yield* Effect.forEach(
        scheduleRows,
        (row) =>
          convertLegacyPlannedDate(row.start_date, claimedTimezone, {
            entity: 'injection_schedule',
            field: 'start_date',
            recordId: row.id,
          }).pipe(Effect.map((startDate) => ({ id: row.id, startDate }))),
        { concurrency: 1 }
      )
      const goals: ReadonlyArray<ConvertedGoalDates> = yield* Effect.forEach(
        goalRows,
        (row) =>
          Effect.all(
            {
              startingDate: convertLegacyPlannedDate(row.starting_date, claimedTimezone, {
                entity: 'user_goal',
                field: 'starting_date',
                recordId: row.id,
              }),
              targetDate:
                row.target_date === null
                  ? Effect.succeed(Option.none<CalendarDate>())
                  : convertLegacyPlannedDate(row.target_date, claimedTimezone, {
                      entity: 'user_goal',
                      field: 'target_date',
                      recordId: row.id,
                    }).pipe(Effect.map(Option.some)),
            },
            { concurrency: 1 }
          ).pipe(Effect.map(({ startingDate, targetDate }) => ({ id: row.id, startingDate, targetDate }))),
        { concurrency: 1 }
      )

      yield* Effect.forEach(
        schedules,
        (schedule) =>
          sql`
            UPDATE injection_schedules
            SET start_date = ${schedule.startDate}, calendar_date_migrated = 1
            WHERE id = ${schedule.id} AND user_id = ${userId} AND calendar_date_migrated = 0
          `.pipe(mapDbError(SettingsDatabaseError, 'update')),
        { concurrency: 1, discard: true }
      )
      yield* Effect.forEach(
        goals,
        (goal) =>
          sql`
            UPDATE user_goals
            SET starting_date = ${goal.startingDate},
                target_date = ${Option.getOrNull(goal.targetDate)},
                calendar_date_migrated = 1
            WHERE id = ${goal.id} AND user_id = ${userId} AND calendar_date_migrated = 0
          `.pipe(mapDbError(SettingsDatabaseError, 'update')),
        { concurrency: 1, discard: true }
      )

      yield* sql`
        UPDATE user_settings
        SET timezone_migration_state = 'complete', updated_at = ${now}
        WHERE user_id = ${userId}
          AND timezone = ${claimedTimezone}
          AND timezone_migration_state = 'pending'
      `.pipe(mapDbError(SettingsDatabaseError, 'update'))

      const initialized = yield* get(userId)
      return yield* Option.match(initialized, {
        onNone: () =>
          Effect.fail(
            SettingsDatabaseError.make({
              operation: 'query',
              cause: new SettingsMissingAfterUpsert({ message: 'Settings timezone migration did not complete' }),
            })
          ),
        onSome: Effect.succeed,
      })
    })

    const resolveUpsertMigrationTimezone = Effect.fn('SettingsRepo.resolveUpsertMigrationTimezone')(function* (
      userId: string,
      requestedTimezone: Option.Option<IanaTimezone>
    ) {
      const claimed = yield* readRow(userId)
      const immediateTimezone = Option.flatMap(claimed, ({ timezone }) => Option.fromNullishOr(timezone))
      if (Option.isSome(immediateTimezone)) {
        return immediateTimezone.value
      }
      if (Option.isSome(requestedTimezone)) {
        return requestedTimezone.value
      }
      const attempts = yield* Effect.forEach(
        Arr.range(1, 32),
        () =>
          Effect.yieldNow.pipe(
            Effect.andThen(readRow(userId)),
            Effect.map((row) => Option.flatMap(row, ({ timezone }) => Option.fromNullishOr(timezone)))
          ),
        { concurrency: 1 }
      )
      return yield* Option.match(Arr.head(Arr.getSomes(attempts)), {
        onNone: () =>
          Effect.fail(
            SettingsDatabaseError.make({
              operation: 'insert',
              cause: new SettingsMissingAfterUpsert({
                message: 'Timezone is required when creating settings',
              }),
            })
          ),
        onSome: Effect.succeed,
      })
    })

    const upsert = Effect.fn('SettingsRepo.upsert')(
      function* (userId: string, data: UserSettingsUpdate) {
        const now = DateTime.formatIso(yield* DateTime.now)
        const id = yield* randomUuid()

        // Create a durable pending row or atomically patch an existing row.
        // A timezone claim is completed through initializeTimezone below so
        // legacy dates are never skipped. ON CONFLICT removes the missing-row
        // read/insert race while COALESCE merges independent partial callers.
        yield* sql`
          INSERT INTO user_settings (
            id, user_id, weight_unit, timezone, timezone_migration_state, created_at, updated_at
          )
          VALUES (${id}, ${userId}, ${data.weightUnit ?? 'lbs'}, ${data.timezone ?? null}, 'pending', ${now}, ${now})
          ON CONFLICT(user_id) DO UPDATE SET
            weight_unit = COALESCE(${data.weightUnit ?? null}, user_settings.weight_unit),
            timezone = CASE
              WHEN user_settings.timezone IS NULL THEN COALESCE(excluded.timezone, user_settings.timezone)
              ELSE user_settings.timezone
            END,
            updated_at = excluded.updated_at
        `

        const migrationTimezone = yield* resolveUpsertMigrationTimezone(userId, Option.fromNullishOr(data.timezone))
        yield* initializeTimezone(userId, migrationTimezone)

        // Apply the caller's explicit values only after migration completes.
        // These field-level patches cannot restore another caller's stale data.
        yield* sql`
          UPDATE user_settings
          SET weight_unit = COALESCE(${data.weightUnit ?? null}, weight_unit),
              timezone = COALESCE(${data.timezone ?? null}, timezone),
              updated_at = ${now}
          WHERE user_id = ${userId} AND timezone_migration_state = 'complete'
        `

        const result = yield* get(userId)
        return yield* Option.match(result, {
          onNone: () =>
            Effect.fail(
              SettingsDatabaseError.make({
                operation: 'query',
                cause: new SettingsMissingAfterUpsert({ message: 'Settings not found after upsert' }),
              })
            ),
          onSome: Effect.succeed,
        })
      },
      mapDbError(SettingsDatabaseError, 'update')
    )

    return { get, initializeTimezone, upsert }
  })
)
