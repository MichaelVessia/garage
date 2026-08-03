import { Database } from 'bun:sqlite'

import { assert, describe, it } from '@effect/vitest'
import * as Schema from 'effect/Schema'

const canonicalMedicationSql = await Bun.file(
  new URL('../drizzle/0013_canonical_medications.sql', import.meta.url)
).text()
const timezoneCalendarDateSql = await Bun.file(
  new URL('../drizzle/0014_timezone_calendar_dates.sql', import.meta.url)
).text()
const journal = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      entries: Schema.Array(Schema.Struct({ idx: Schema.Number, tag: Schema.String })),
    })
  )
)(await Bun.file(new URL('../drizzle/meta/_journal.json', import.meta.url)).text())

const IntegratedState = Schema.Array(
  Schema.Struct({
    dose_mg: Schema.Number,
    goal_migrated: Schema.Number,
    injection_supplier: Schema.NullOr(Schema.String),
    schedule_drug: Schema.String,
    schedule_migrated: Schema.Number,
    schedule_supplier: Schema.NullOr(Schema.String),
    timezone: Schema.NullOr(Schema.String),
    timezone_migration_state: Schema.String,
  })
)

const applyMigration = (database: Database, sql: string): void => {
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim() !== '') {
      database.run(statement)
    }
  }
}

describe('Subq v3 migration chain', () => {
  it('orders canonical medications as 0013 and timezone calendar dates as 0014', () => {
    assert.deepStrictEqual(journal.entries.slice(-2), [
      { idx: 10, tag: '0013_canonical_medications' },
      { idx: 11, tag: '0014_timezone_calendar_dates' },
    ])
  })

  it('applies canonical medications before timezone calendar dates without losing either contract', () => {
    const database = new Database(':memory:')
    database.run('PRAGMA foreign_keys = ON')
    database.run(`
      CREATE TABLE injection_schedules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        drug TEXT NOT NULL,
        source TEXT,
        frequency TEXT NOT NULL,
        start_date TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        user_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE schedule_phases (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL REFERENCES injection_schedules(id) ON DELETE CASCADE,
        "order" INTEGER NOT NULL,
        duration_days INTEGER,
        dosage TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE injection_logs (
        id TEXT PRIMARY KEY,
        datetime TEXT NOT NULL,
        drug TEXT NOT NULL,
        source TEXT,
        dosage TEXT NOT NULL,
        injection_site TEXT,
        notes TEXT,
        schedule_id TEXT REFERENCES injection_schedules(id) ON DELETE SET NULL,
        user_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE user_settings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        weight_unit TEXT NOT NULL DEFAULT 'lbs',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE user_goals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        goal_weight REAL NOT NULL,
        starting_weight REAL NOT NULL,
        starting_date TEXT NOT NULL,
        target_date TEXT,
        notes TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO injection_schedules
        (id, name, drug, source, frequency, start_date, user_id, created_at, updated_at)
      VALUES
        ('schedule-1', 'Weekly', 'Semaglutide (Ozempic)', 'Clinic', 'weekly',
         '2026-01-01', 'user-1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      INSERT INTO schedule_phases
        (id, schedule_id, "order", duration_days, dosage, created_at, updated_at)
      VALUES
        ('phase-1', 'schedule-1', 1, NULL, '0.25mg',
         '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      INSERT INTO injection_logs
        (id, datetime, drug, source, dosage, schedule_id, user_id, created_at, updated_at)
      VALUES
        ('injection-1', '2026-01-08T12:00:00.000Z', 'Semaglutide (Wegovy)', 'Pharmacy',
         '0.25 mg', 'schedule-1', 'user-1', '2026-01-08T12:00:00.000Z', '2026-01-08T12:00:00.000Z');
      INSERT INTO user_settings (id, user_id, weight_unit, created_at, updated_at)
      VALUES ('settings-1', 'user-1', 'lbs', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      INSERT INTO user_goals
        (id, user_id, goal_weight, starting_weight, starting_date, target_date, created_at, updated_at)
      VALUES
        ('goal-1', 'user-1', 170, 200, '2026-01-01', '2026-06-01',
         '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    `)

    applyMigration(database, canonicalMedicationSql)
    applyMigration(database, timezoneCalendarDateSql)

    const rows = Schema.decodeUnknownSync(IntegratedState)(
      database
        .query(`
          SELECT
            s.drug AS schedule_drug,
            s.supplier AS schedule_supplier,
            s.calendar_date_migrated AS schedule_migrated,
            i.supplier AS injection_supplier,
            i.dose_mg AS dose_mg,
            us.timezone AS timezone,
            us.timezone_migration_state AS timezone_migration_state,
            g.calendar_date_migrated AS goal_migrated
          FROM injection_schedules s
          JOIN injection_logs i ON i.schedule_id = s.id
          JOIN user_settings us ON us.user_id = s.user_id
          JOIN user_goals g ON g.user_id = s.user_id
          WHERE s.id = 'schedule-1'
        `)
        .all()
    )

    assert.deepStrictEqual(rows, [
      {
        dose_mg: 0.25,
        goal_migrated: 0,
        injection_supplier: 'Pharmacy',
        schedule_drug: 'Semaglutide',
        schedule_migrated: 0,
        schedule_supplier: 'Clinic',
        timezone: null,
        timezone_migration_state: 'pending',
      },
    ])
    database.close()
  })
})
