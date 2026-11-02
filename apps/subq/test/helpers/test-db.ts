/**
 * Shared test database utilities for integration tests.
 * Uses in-memory SQLite to test real SQL queries.
 */

import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as SqlClient from 'effect/sql/SqlClient'

import type { MedicationCompound } from '#shared'

// ============================================
// SQLite In-Memory Test Layer
// ============================================

const SqliteTestLayer = SqliteClient.layer({ filename: ':memory:' })

// ============================================
// Table Setup
// ============================================

const setupTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  // Auth user table subset needed by cross-domain tests.
  yield* sql`
    CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL
    )
  `

  // Weight logs
  yield* sql`
    CREATE TABLE IF NOT EXISTS weight_logs (
      id TEXT PRIMARY KEY,
      datetime TEXT NOT NULL,
      weight REAL NOT NULL,
      notes TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `

  // Injection schedules (must come before injection_logs due to FK)
  yield* sql`
    CREATE TABLE IF NOT EXISTS injection_schedules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      drug TEXT NOT NULL CHECK (drug IN ('Semaglutide', 'Tirzepatide', 'Retatrutide', 'Liraglutide', 'Dulaglutide')),
      supplier TEXT,
      frequency TEXT NOT NULL,
      start_date TEXT NOT NULL,
      calendar_date_migrated INTEGER NOT NULL DEFAULT 0 CHECK (calendar_date_migrated IN (0, 1)),
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `

  // Schedule phases
  yield* sql`
    CREATE TABLE IF NOT EXISTS schedule_phases (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL REFERENCES injection_schedules(id) ON DELETE CASCADE,
      "order" INTEGER NOT NULL,
      duration_days INTEGER,
      dose_mg REAL NOT NULL CHECK (dose_mg > 0 AND dose_mg <= 1.7976931348623157e308),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `

  // Injection logs
  yield* sql`
    CREATE TABLE IF NOT EXISTS injection_logs (
      id TEXT PRIMARY KEY,
      datetime TEXT NOT NULL,
      drug TEXT NOT NULL CHECK (drug IN ('Semaglutide', 'Tirzepatide', 'Retatrutide', 'Liraglutide', 'Dulaglutide')),
      supplier TEXT,
      dose_mg REAL NOT NULL CHECK (dose_mg > 0 AND dose_mg <= 1.7976931348623157e308),
      injection_site TEXT,
      notes TEXT,
      schedule_id TEXT REFERENCES injection_schedules(id) ON DELETE SET NULL,
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `

  // User goals
  yield* sql`
    CREATE TABLE IF NOT EXISTS user_goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      goal_weight REAL NOT NULL,
      starting_weight REAL NOT NULL,
      starting_date TEXT NOT NULL,
      target_date TEXT,
      calendar_date_migrated INTEGER NOT NULL DEFAULT 0 CHECK (calendar_date_migrated IN (0, 1)),
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `

  // User settings
  yield* sql`
    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      weight_unit TEXT NOT NULL DEFAULT 'lbs',
      timezone TEXT,
      timezone_migration_state TEXT NOT NULL DEFAULT 'pending' CHECK (timezone_migration_state IN ('pending', 'complete')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `
})

// ============================================
// Clear All Tables
// ============================================

const clearTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  // Order matters due to foreign keys
  yield* sql`DELETE FROM schedule_phases`
  yield* sql`DELETE FROM injection_logs`
  yield* sql`DELETE FROM injection_schedules`
  yield* sql`DELETE FROM weight_logs`
  yield* sql`DELETE FROM user_goals`
  yield* sql`DELETE FROM user_settings`
  yield* sql`DELETE FROM "user"`
})

// ============================================
// Insert Helpers
// ============================================

// Reuse the inferred SQL statement effect type; naming `SqlError` directly is an unstable API.
type InsertEffect = typeof clearTables

interface InsertWeightLogInput {
  readonly id: string
  readonly datetime: Date
  readonly weight: number
  readonly userId: string
  readonly notes?: string | null
}

export const insertWeightLog = ({ id, datetime, weight, userId, notes = null }: InsertWeightLogInput): InsertEffect =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = DateTime.formatIso(yield* DateTime.now)
    yield* sql`
      INSERT INTO weight_logs (id, datetime, weight, notes, user_id, created_at, updated_at)
      VALUES (${id}, ${datetime.toISOString()}, ${weight}, ${notes}, ${userId}, ${now}, ${now})
    `
  })

interface InsertUserInput {
  readonly id: string
  readonly email?: string
  readonly name?: string
}

export const insertUser = ({ id, email = `${id}@example.com`, name = 'Test User' }: InsertUserInput): InsertEffect =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO "user" (id, email, name)
      VALUES (${id}, ${email}, ${name})
    `
  })

interface InsertInjectionLogInput {
  readonly id: string
  readonly datetime: Date
  readonly drug: MedicationCompound
  readonly doseMg: number
  readonly userId: string
  readonly supplier?: string | null
  readonly injectionSite?: string | null
  readonly notes?: string | null
  readonly scheduleId?: string | null
}

export const insertInjectionLog = (input: InsertInjectionLogInput): InsertEffect =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = DateTime.formatIso(yield* DateTime.now)
    yield* sql`
      INSERT INTO injection_logs (id, datetime, drug, supplier, dose_mg, injection_site, notes, schedule_id, user_id, created_at, updated_at)
      VALUES (${input.id}, ${input.datetime.toISOString()}, ${input.drug}, ${input.supplier ?? null}, ${input.doseMg}, ${input.injectionSite ?? null}, ${input.notes ?? null}, ${input.scheduleId ?? null}, ${input.userId}, ${now}, ${now})
    `
  })

interface InsertScheduleInput {
  readonly id: string
  readonly name: string
  readonly drug: MedicationCompound
  readonly frequency: string
  readonly startDate: Date
  readonly userId: string
  readonly supplier?: string | null
  readonly isActive?: boolean
  readonly notes?: string | null
}

export const insertSchedule = (input: InsertScheduleInput): InsertEffect =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = DateTime.formatIso(yield* DateTime.now)
    yield* sql`
      INSERT INTO injection_schedules (
        id, name, drug, supplier, frequency, start_date, calendar_date_migrated,
        is_active, notes, user_id, created_at, updated_at
      )
      VALUES (${input.id}, ${input.name}, ${input.drug}, ${input.supplier ?? null}, ${input.frequency}, ${DateTime.formatIsoDateUtc(DateTime.fromDateUnsafe(input.startDate))}, 1, ${input.isActive === false ? 0 : 1}, ${input.notes ?? null}, ${input.userId}, ${now}, ${now})
    `
  })

interface InsertSchedulePhaseInput {
  readonly id: string
  readonly scheduleId: string
  readonly order: number
  readonly doseMg: number
  readonly durationDays?: number | null
}

export const insertSchedulePhase = ({
  id,
  scheduleId,
  order,
  doseMg,
  durationDays = null,
}: InsertSchedulePhaseInput): InsertEffect =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = DateTime.formatIso(yield* DateTime.now)
    yield* sql`
      INSERT INTO schedule_phases (id, schedule_id, "order", duration_days, dose_mg, created_at, updated_at)
      VALUES (${id}, ${scheduleId}, ${order}, ${durationDays}, ${doseMg}, ${now}, ${now})
    `
  })

interface InsertSettingsInput {
  readonly id: string
  readonly userId: string
  readonly weightUnit: 'lbs' | 'kg'
  readonly timezone?: string | null
}

export const insertSettings = ({ id, userId, weightUnit, timezone = null }: InsertSettingsInput): InsertEffect =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = DateTime.formatIso(yield* DateTime.now)
    const migrationState = timezone === null ? 'pending' : 'complete'
    yield* sql`
      INSERT INTO user_settings (id, user_id, weight_unit, timezone, timezone_migration_state, created_at, updated_at)
      VALUES (${id}, ${userId}, ${weightUnit}, ${timezone}, ${migrationState}, ${now}, ${now})
    `
  })

// ============================================
// Test Layer Builder
// ============================================

/**
 * Creates a test layer with setup/teardown composed into the layer.
 * Each test gets fresh state via Layer.fresh. Eliminates need to call
 * setupTables and clearTables in every test body.
 *
 * Usage:
 *   const TestLayer = makeInitializedTestLayer(WeightLogRepoLive)
 *   it.layer(TestLayer)("creates entry", () => Effect.gen(function* () {
 *     const repo = yield* WeightLogRepo
 *     // tables already set up and cleared
 *   }))
 */
export const makeInitializedTestLayer = <Out, Err>(
  repoLayer: Layer.Layer<Out, Err, SqlClient.SqlClient>
): Layer.Layer<Out | Layer.Success<typeof SqliteTestLayer>, Err | Layer.Error<typeof SqliteTestLayer>> => {
  const repoWithSqlite = repoLayer.pipe(Layer.provideMerge(SqliteTestLayer))

  return Layer.effectDiscard(setupTables.pipe(Effect.andThen(clearTables))).pipe(
    Layer.provideMerge(repoWithSqlite),
    Layer.fresh
  )
}
